import React, { useState } from 'react';
import { autoSaveManager } from '../services/autoSave.js';
import { Settings, Folder, Shield, X, Check, Laptop, Server, Wifi } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceName: string;
  onUpdateDeviceName: (name: string) => void;
  e2eEnabled: boolean;
  onToggleE2e: (enabled: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  deviceName,
  onUpdateDeviceName,
  e2eEnabled,
  onToggleE2e,
}) => {
  const [nameInput, setNameInput] = useState(deviceName);
  const [savedFolder, setSavedFolder] = useState(autoSaveManager.getDirectoryName());
  const [hasCustomFolder, setHasCustomFolder] = useState(autoSaveManager.hasCustomDirectory());
  const [serverInput, setServerInput] = useState(() => localStorage.getItem('dropflow-server-url') || '');
  const [serverSaved, setServerSaved] = useState(false);

  React.useEffect(() => {
    setNameInput(deviceName);
  }, [deviceName, isOpen]);

  if (!isOpen) return null;

  const handlePickDirectory = async () => {
    const chosen = await autoSaveManager.pickCustomDirectory();
    if (chosen) {
      setSavedFolder(chosen);
      setHasCustomFolder(true);
    }
  };

  const handleClearDirectory = () => {
    autoSaveManager.clearCustomDirectory();
    setSavedFolder(autoSaveManager.getDirectoryName());
    setHasCustomFolder(false);
  };

  const handleSaveName = () => {
    if (nameInput.trim()) {
      onUpdateDeviceName(nameInput.trim());
    }
  };

  const handleSaveServer = () => {
    let clean = serverInput.trim();
    if (clean) {
      if (!clean.startsWith('ws://') && !clean.startsWith('wss://')) {
        const protocol = clean.startsWith('https') ? 'wss:' : 'ws:';
        clean = clean.replace(/^https?:\/\//, '');
        if (!clean.endsWith('/ws')) {
          clean = clean.replace(/\/$/, '') + '/ws';
        }
        clean = `${protocol}//${clean}`;
      }
      localStorage.setItem('dropflow-server-url', clean);
      setServerSaved(true);
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } else {
      localStorage.removeItem('dropflow-server-url');
      setServerSaved(true);
      setTimeout(() => {
        window.location.reload();
      }, 600);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} id="settings-modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={20} style={{ color: 'var(--accent-cyan)' }} /> Preferences & Auto-Save
          </h2>
          <button
            className="btn btn-secondary"
            style={{ padding: 6, borderRadius: '50%' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Device Name */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
            Device Display Name
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: '#FFF',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <button className="btn btn-secondary" onClick={handleSaveName}>
              Save
            </button>
          </div>
        </div>

        {/* Signaling Server / Laptop Address */}
        <div style={{ marginBottom: 20, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Server size={18} style={{ color: 'var(--accent-cyan)' }} />
              <div style={{ fontWeight: 600, fontSize: 14 }}>Signaling Server / Desktop Link</div>
            </div>
            {serverInput && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => {
                  setServerInput('');
                  localStorage.removeItem('dropflow-server-url');
                  setServerSaved(true);
                  setTimeout(() => window.location.reload(), 500);
                }}
              >
                Reset to Web P2P
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            To link your mobile phone with your computer over WiFi, or to connect to a custom relay server, enter the address below (or scan your laptop's pairing QR code).
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <input
              type="text"
              placeholder="e.g. http://192.168.1.15:3001 or wss://server.onrender.com/ws"
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: '#FFF',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button className="btn btn-secondary" onClick={handleSaveServer}>
              {serverSaved ? 'Saving...' : 'Connect'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6 }}
              onClick={() => setServerInput('http://localhost:3001')}
            >
              Preset: Localhost (:3001)
            </button>
          </div>
        </div>

        {/* Auto-Save Directory */}
        <div style={{ marginBottom: 24, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Folder size={18} style={{ color: 'var(--accent-cyan)' }} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>Zero-Click Auto-Save Folder</div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Grant one-time permission to save received files directly to your chosen folder without browser download popups.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: hasCustomFolder ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
              {savedFolder}
            </span>
            {hasCustomFolder ? (
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={handleClearDirectory}
              >
                Reset
              </button>
            ) : (
              <button
                id="select-folder-btn"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={handlePickDirectory}
              >
                Choose Folder
              </button>
            )}
          </div>
        </div>

        {/* E2EE Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={18} style={{ color: 'var(--accent-purple)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>End-to-End Encryption</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>AES-256-GCM chunk cipher</div>
            </div>
          </div>
          <button
            id="toggle-e2ee-btn"
            className={`btn ${e2eEnabled ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: 13 }}
            onClick={() => onToggleE2e(!e2eEnabled)}
          >
            {e2eEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>
    </div>
  );
};
