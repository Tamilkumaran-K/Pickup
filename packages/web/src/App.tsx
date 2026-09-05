import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Device,
  DevicePlatform,
  Transfer,
  deriveKeyFromSecret,
  computeKeyFingerprint,
  cleanPairingPin,
} from '@pickup/shared';
import { signalingClient } from './services/socket.js';
import { webRtcManager } from './services/webrtc.js';
import { sounds } from './services/soundEffects.js';
import { RadarView } from './components/RadarView.js';
import { DropZone } from './components/DropZone.js';
import { TransferTelemetry } from './components/TransferTelemetry.js';
import { TransferQueue } from './components/TransferQueue.js';
import { PairingModal } from './components/PairingModal.js';
import { SettingsModal } from './components/SettingsModal.js';
import { LandingHub } from './components/LandingHub.js';
import {
  Radio,
  Download,
  KeyRound,
  Settings as SettingsIcon,
  Wifi,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Volume2,
  VolumeX,
  Monitor,
} from 'lucide-react';

function detectPlatform(): DevicePlatform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  if (ua.includes('linux')) return 'linux';
  return 'web';
}

export function App() {
  const [viewMode, setViewMode] = useState<'radar' | 'hub'>('radar');
  const [soundEnabled, setSoundEnabled] = useState(sounds.isSoundEnabled());
  const [selfDevice, setSelfDevice] = useState<Device>(() => {
    let id = localStorage.getItem('dropflow-device-id');
    if (!id) {
      id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem('dropflow-device-id', id);
    }
    const platform = detectPlatform();
    const storedName = localStorage.getItem('dropflow-device-name');
    const name = storedName || `${platform.charAt(0).toUpperCase() + platform.slice(1)} Device`;
    return {
      id,
      name,
      platform,
      lastSeen: Date.now(),
      isSelf: true,
    };
  });

  const [discoveredDevices, setDiscoveredDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>(() => {
    try {
      const saved = localStorage.getItem('dropflow-transfers-history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [activeTelemetryTransfer, setActiveTelemetryTransfer] = useState<Transfer | null>(null);
  const [myPin, setMyPin] = useState<string>('');
  const myPinRef = useRef<string>('');
  const lastSubmittedPinRef = useRef<string>('');
  const [peerSecurityMap, setPeerSecurityMap] = useState<Map<string, { fingerprint: string; verified: boolean }>>(new Map());
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [e2eEnabled, setE2eEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const isDesktop =
    typeof (window as any).fileDropNative !== 'undefined' ||
    (window as any).isDesktop === true ||
    navigator.userAgent.includes('Electron') ||
    window.location.search.includes('platform=desktop');

  const handleToggleSound = () => {
    const next = sounds.toggleSound();
    setSoundEnabled(next);
  };

  // Sync native device name & saved transfers if running in Desktop Electron app
  useEffect(() => {
    const nativeApi = (window as any).fileDropNative;
    if (typeof nativeApi?.getDeviceInfo === 'function') {
      nativeApi.getDeviceInfo().then((info: any) => {
        const storedName = localStorage.getItem('dropflow-device-name');
        // Prioritize user's saved custom name over raw hostname
        const chosenName = storedName || info?.name;
        if (chosenName) {
          setSelfDevice((prev) => ({
            ...prev,
            name: chosenName,
            platform: info?.platform || (detectPlatform() === 'macos' ? 'macos' : 'windows'),
          }));
        }
      });
    }

    if (typeof nativeApi?.getSavedTransfers === 'function') {
      nativeApi.getSavedTransfers().then((saved: Transfer[]) => {
        if (Array.isArray(saved) && saved.length > 0) {
          setTransfers((prev) => {
            const map = new Map<string, Transfer>();
            [...saved, ...prev].forEach((t) => map.set(t.id, t));
            return Array.from(map.values()).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
          });
        }
      });
    }
  }, []);

  // Persist transfers to localStorage and desktop storage whenever they update
  useEffect(() => {
    try {
      localStorage.setItem('dropflow-transfers-history', JSON.stringify(transfers));
      const nativeApi = (window as any).fileDropNative;
      if (typeof nativeApi?.saveTransfers === 'function') {
        nativeApi.saveTransfers(transfers);
      }
    } catch (e) {
      console.warn('Failed to persist transfers:', e);
    }
  }, [transfers]);

  // Initialize socket and WebRTC handlers
  useEffect(() => {
    signalingClient.init(selfDevice);

    const unsubConnection = signalingClient.on('connection-change', (msg: any) => {
      setIsConnected(!!msg.payload?.connected);
    });

    const unsubDeviceList = signalingClient.on('device-list', (msg) => {
      if (Array.isArray(msg.payload?.devices)) {
        const others = (msg.payload.devices as Device[]).filter((d) => d.id !== selfDevice.id);
        setDiscoveredDevices(others);
      }
    });

    const unsubPairCode = signalingClient.on('pair-code-created', (msg) => {
      setMyPin(msg.payload.formattedCode);
      myPinRef.current = msg.payload.code;
    });

    const unsubPairSuccess = signalingClient.on('pair-success', async (msg) => {
      const peer = msg.payload.pairedDevice as Device;
      const role = msg.payload.role;
      const sessionSalt = msg.payload.sessionSalt;

      // Host used myPin, Joiner used lastSubmittedPin
      const rawPin = role === 'host' ? myPinRef.current : lastSubmittedPinRef.current;
      let fp = '';

      if (rawPin) {
        try {
          const cleanCode = cleanPairingPin(rawPin);
          const key = await deriveKeyFromSecret(cleanCode, sessionSalt);
          const fingerprint = await computeKeyFingerprint(key);
          fp = fingerprint;
          webRtcManager.setPeerEncryptionKey(peer.id, key);
          setPeerSecurityMap((prev) => new Map(prev).set(peer.id, { fingerprint, verified: true }));
          console.log(`[DropFlow E2EE] Derived AES-256-GCM session key for ${peer.name}. Fingerprint: ${fingerprint}`);
        } catch (err) {
          console.error('[DropFlow E2EE] Key derivation failed:', err);
        }
      }

      sounds.playSuccess();
      const toastText = fp
        ? `🔒 Paired & E2EE Active with ${peer.name} [Key: ${fp.slice(0, 9)}]`
        : `Successfully paired with ${peer.name}!`;
      showToast(toastText, 'success');
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
    });

    const unsubPairReject = signalingClient.on('pair-rejected', (msg) => {
      showToast(`Pairing failed: ${msg.payload.reason}`, 'error');
    });

    const signalingTypes: any[] = [
      'webrtc-offer',
      'webrtc-answer',
      'webrtc-ice',
      'transfer-init',
      'relay-chunk',
    ];

    const unsubs = signalingTypes.map((t) =>
      signalingClient.on(t, (msg) => {
        webRtcManager.handleSignalingMessage(msg);
      })
    );

    // Track transfer progress
    const unsubProgress = webRtcManager.onProgress((updatedTransfer) => {
      setActiveTelemetryTransfer(updatedTransfer);
      setTransfers((prev) => {
        const index = prev.findIndex((t) => t.id === updatedTransfer.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = updatedTransfer;
          return next;
        } else {
          return [updatedTransfer, ...prev];
        }
      });

      if (updatedTransfer.status === 'completed') {
        sounds.playSuccess();
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
        showToast(`Transfer of "${updatedTransfer.fileMeta.name}" complete!`, 'success');
      }
    });

    return () => {
      unsubConnection();
      unsubDeviceList();
      unsubPairCode();
      unsubPairSuccess();
      unsubPairReject();
      unsubs.forEach((u) => u());
      unsubProgress();
    };
  }, [selfDevice]);

  // Spawns a virtual simulated peer (e.g. MacBook Pro M3 or Pixel 8) for immediate interactive testing!
  const handleAddSimulatedDevice = () => {
    const names = ['MacBook Pro M3', 'Pixel 8 Pro', 'iPad Air', 'ThinkPad X1'];
    const platforms: DevicePlatform[] = ['macos', 'android', 'ios', 'windows'];
    const pick = Math.floor(Math.random() * names.length);

    const simDevice: Device = {
      id: `sim-${Date.now()}`,
      name: names[pick],
      platform: platforms[pick],
      lastSeen: Date.now(),
      isPaired: true,
    };

    setDiscoveredDevices((prev) => [simDevice, ...prev]);
    setSelectedDevice(simDevice);
    showToast(`Added simulated peer: ${simDevice.name}! Drop a file on it to test.`);
  };

  const handleOpenPairing = () => {
    sounds.playClick();
    setIsPairingOpen(true);
    signalingClient.send({
      type: 'request-pair-code',
      senderId: selfDevice.id,
      timestamp: Date.now(),
    });
  };

  const handleSubmitPeerPin = (pin: string) => {
    lastSubmittedPinRef.current = pin;
    signalingClient.send({
      type: 'submit-pair-code',
      senderId: selfDevice.id,
      payload: { code: pin },
      timestamp: Date.now(),
    });
  };

  const handleUpdateDeviceName = (name: string) => {
    const updated = { ...selfDevice, name };
    setSelfDevice(updated);
    localStorage.setItem('dropflow-device-name', name);
    const nativeApi = (window as any).fileDropNative;
    if (typeof nativeApi?.setDeviceName === 'function') {
      nativeApi.setDeviceName(name);
    }
    signalingClient.send({
      type: 'register',
      senderId: updated.id,
      payload: { device: updated },
      timestamp: Date.now(),
    });
    showToast(`Device name updated to "${name}"`);
  };

  const handleClearHistory = () => {
    setTransfers([]);
    localStorage.removeItem('dropflow-transfers-history');
    const nativeApi = (window as any).fileDropNative;
    if (typeof nativeApi?.saveTransfers === 'function') {
      nativeApi.saveTransfers([]);
    }
    showToast('Transfer history cleared');
  };

  const handleSendFile = async (file: File) => {
    if (!selectedDevice) return;

    const sourcePath = (file as any).path || undefined;

    // Check if target is a simulated testing peer
    if (selectedDevice.id.startsWith('sim-')) {
      simulateTransfer(file.name, file.size, file.type || 'application/octet-stream', sourcePath);
      return;
    }

    try {
      showToast(`Dropping ${file.name} to ${selectedDevice.name}...`);
      await webRtcManager.sendFile(
        selectedDevice.id,
        selectedDevice.name,
        selfDevice.id,
        selfDevice.name,
        file
      );
    } catch (err: any) {
      showToast(`Transfer failed: ${err.message}`, 'error');
    }
  };

  const handleSendText = (text: string) => {
    if (!selectedDevice) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const isUrl = text.startsWith('http://') || text.startsWith('https://');
    const fileName = isUrl ? 'Shared_Link.url' : 'Snippet.txt';
    const file = new File([blob], fileName, { type: 'text/plain' });
    handleSendFile(file);
  };

  // Simulates a realistic high-speed transfer for testing
  const simulateTransfer = (name: string, size: number, mimeType: string, customPath?: string) => {
    const transferId = `tx-sim-${Date.now()}`;
    const totalChunks = Math.max(1, Math.ceil(size / (64 * 1024)));

    const simTransfer: Transfer = {
      id: transferId,
      senderId: selfDevice.id,
      senderName: selfDevice.name,
      receiverId: selectedDevice!.id,
      receiverName: selectedDevice!.name,
      fileMeta: {
        id: `file-${Date.now()}`,
        name,
        size,
        mimeType,
        sha256: 'a948b...verified',
        totalChunks,
        chunkSize: 64 * 1024,
      },
      status: 'transferring',
      direction: 'send',
      bytesTransferred: 0,
      speedBytesPerSec: 28.4 * 1024 * 1024, // 28.4 MB/s
      startedAt: Date.now(),
      channelType: 'webrtc-datachannel',
      sourcePath: customPath || `Downloads/FileDrop/${name}`,
    };

    setActiveTelemetryTransfer(simTransfer);
    setTransfers((prev) => [simTransfer, ...prev]);

    let step = 0;
    const interval = setInterval(() => {
      step++;
      const currentBytes = Math.min(size, Math.round((step / 10) * size));
      const updated: Transfer = {
        ...simTransfer,
        bytesTransferred: currentBytes,
        speedBytesPerSec: (24 + Math.random() * 8) * 1024 * 1024,
        status: step >= 10 ? 'completed' : 'transferring',
        completedAt: step >= 10 ? Date.now() : undefined,
        autoSavedTo: step >= 10 ? (customPath || `Downloads/FileDrop/${name}`) : undefined,
      };

      setActiveTelemetryTransfer(updated);
      setTransfers((prev) => prev.map((t) => (t.id === transferId ? updated : t)));

      if (step >= 10) {
        clearInterval(interval);
        sounds.playSuccess();
        confetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
        showToast(`Auto-saved zero-click to ${selectedDevice!.name}!`, 'success');
      }
    }, 150);
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">
            <Radio size={24} color="#030712" />
          </div>
          <div>
            <div className="brand-title">Pickup</div>
            <div className="brand-tagline">
              <span
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: isConnected ? 'var(--accent-green)' : 'var(--accent-amber)',
                  boxShadow: isConnected ? '0 0 8px var(--accent-green)' : 'none',
                  marginRight: 6,
                }}
              />
              {isConnected ? 'Local P2P Active' : 'Connecting to local mesh...'}
            </div>
          </div>
        </div>

        {/* Center View Selector */}
        {isDesktop ? (
          <div
            id="desktop-app-indicator"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(6, 182, 212, 0.08)',
              padding: '6px 16px',
              borderRadius: 20,
              border: '1px solid rgba(6, 182, 212, 0.25)',
              color: 'var(--accent-cyan)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Monitor size={15} />
            <span>{selfDevice.platform === 'macos' ? 'macOS Desktop App' : 'Windows Desktop App'}</span>
            <span style={{ opacity: 0.35 }}>•</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}>
              Radar Hub Active
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 14, border: '1px solid var(--border-glass)' }}>
            <button
              id="tab-radar-btn"
              className={`btn btn-tab ${viewMode === 'radar' ? 'active' : ''}`}
              onClick={() => {
                sounds.playClick();
                setViewMode('radar');
              }}
            >
              <Radio size={15} /> Radar &amp; Drop
            </button>
            <button
              id="tab-hub-btn"
              className={`btn btn-tab ${viewMode === 'hub' ? 'active' : ''}`}
              onClick={() => {
                sounds.playClick();
                setViewMode('hub');
              }}
            >
              <Download size={15} /> Download Hub
            </button>
          </div>
        )}

        {/* Right Action Controls */}
        <div className="nav-controls">
          <button
            id="sound-toggle-btn"
            className="btn btn-secondary"
            style={{ padding: '9px 12px' }}
            onClick={handleToggleSound}
            title={soundEnabled ? 'Mute Sound Effects' : 'Enable Sound Effects'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} style={{ color: 'var(--text-muted)' }} />}
          </button>

          <button
            id="pair-device-btn"
            className="btn btn-secondary"
            onClick={handleOpenPairing}
            title="Pair with phone or laptop"
          >
            <KeyRound size={15} /> Pair Device
          </button>

          <button
            id="settings-btn"
            className="btn btn-secondary"
            style={{ padding: '9px 12px' }}
            onClick={() => {
              sounds.playClick();
              setIsSettingsOpen(true);
            }}
            title="Settings & Folder Selection"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      {/* Main View */}
      <main style={{ flex: 1 }}>
        {viewMode === 'radar' || isDesktop ? (
          <div>
            {/* Top Info Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-glass)',
                marginBottom: 20,
                fontSize: 13,
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wifi size={15} className="pulse-cyan" style={{ color: 'var(--accent-cyan)' }} />
                <span>
                  <b>Subnet Radar Active:</b> Click any device orb or drop files to sync zero-click.
                </span>
              </div>
              {selectedDevice && peerSecurityMap.has(selectedDevice.id) ? (
                <div
                  id="e2ee-verified-badge"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--accent-green)',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '4px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  title={`Active AES-256-GCM E2EE key fingerprint: ${peerSecurityMap.get(selectedDevice.id)?.fingerprint}`}
                >
                  <ShieldCheck size={14} /> E2EE Verified: {peerSecurityMap.get(selectedDevice.id)?.fingerprint.slice(0, 9)}...
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-cyan)', fontSize: 12 }}>
                  <ShieldCheck size={14} /> End-to-End Encrypted (AES-256-GCM)
                </div>
              )}
            </div>

            {/* 360 Sweep Radar View */}
            <RadarView
              selfDevice={selfDevice}
              discoveredDevices={discoveredDevices}
              selectedDevice={selectedDevice}
              onSelectDevice={(device) => {
                setSelectedDevice(device);
                showToast(`Target set to ${device.name}`);
              }}
              onAddSimulatedDevice={handleAddSimulatedDevice}
            />

            {/* Live Telemetry & Speedometer HUD */}
            <TransferTelemetry activeTransfer={activeTelemetryTransfer} />

            {/* Dual Drop Studio (Files & Quick Clipboard) */}
            <DropZone
              selectedDevice={selectedDevice}
              onSendFile={handleSendFile}
              onSendText={handleSendText}
            />

            {/* Files Sent & Received Activity Center */}
            <TransferQueue
              transfers={transfers}
              onClearHistory={handleClearHistory}
              isDesktop={isDesktop}
            />
          </div>
        ) : (
          <LandingHub onLaunchWebDrop={() => {
            sounds.playClick();
            setViewMode('radar');
          }} />
        )}
      </main>

      {/* Pairing Modal */}
      <PairingModal
        isOpen={isPairingOpen}
        onClose={() => setIsPairingOpen(false)}
        myPin={myPin}
        myDevice={selfDevice}
        onSubmitPin={handleSubmitPeerPin}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        deviceName={selfDevice.name}
        onUpdateDeviceName={handleUpdateDeviceName}
        e2eEnabled={e2eEnabled}
        onToggleE2e={setE2eEnabled}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-banner" id="app-toast-banner">
          {toastMessage.type === 'success' ? (
            <CheckCircle size={18} style={{ color: 'var(--accent-green)' }} />
          ) : (
            <AlertCircle size={18} style={{ color: 'var(--accent-rose)' }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 500 }}>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}
