import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Device, generatePairingPin, cleanPairingPin, formatPairingPin, parseQrData, isValidPairingPin } from '@pickup/shared';
import { X, QrCode, KeyRound, ShieldCheck, Check, RefreshCw, Share2, Camera, Sparkles, Smartphone, Copy, AlertCircle } from 'lucide-react';
import { sounds } from '../services/soundEffects.js';
import QRCode from 'qrcode';

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  myPin: string;
  myDevice: Device;
  onSubmitPin: (pin: string) => void;
  onRegeneratePin?: () => void;
  onPairSimulated?: () => void;
  isConnected?: boolean;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  isOpen,
  onClose,
  myPin,
  myDevice,
  onSubmitPin,
  onRegeneratePin,
  onPairSimulated,
  isConnected = true,
}) => {
  const [activeTab, setActiveTab] = useState<'my-code' | 'enter-code'>('my-code');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Local PIN state to guarantee 0ms instant display even before socket responds
  const [localPin, setLocalPin] = useState<string>(() => myPin || generatePairingPin());

  // Input PIN digits for the 6 boxes
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Camera QR Scanner state
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<any>(null);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // Process scanned camera value
  const processScannedValue = useCallback((scannedText: string) => {
    // Check if it's a URL with ?pair=123456
    try {
      if (scannedText.includes('pair=')) {
        const url = new URL(scannedText);
        const code = url.searchParams.get('pair');
        if (code && isValidPairingPin(code)) {
          sounds.playSuccess();
          stopCamera();
          onSubmitPin(cleanPairingPin(code));
          onClose();
          return;
        }
      }
    } catch {
      // not a full URL
    }

    // Check if it's pickup:// payload
    const parsed = parseQrData(scannedText);
    if (parsed?.code && isValidPairingPin(parsed.code)) {
      sounds.playSuccess();
      stopCamera();
      onSubmitPin(cleanPairingPin(parsed.code));
      onClose();
      return;
    }

    // Direct 6-digit PIN string
    const clean = cleanPairingPin(scannedText);
    if (clean.length === 6) {
      sounds.playSuccess();
      stopCamera();
      onSubmitPin(clean);
      onClose();
    }
  }, [onSubmitPin, onClose, stopCamera]);

  // Handle pasted PIN code
  const handlePastedCode = useCallback((pasted: string) => {
    const clean = cleanPairingPin(pasted).slice(0, 6);
    if (clean) {
      const next = ['', '', '', '', '', ''];
      for (let i = 0; i < clean.length; i++) {
        next[i] = clean[i];
      }
      setDigits(next);
      if (clean.length === 6) {
        sounds.playSuccess();
        onSubmitPin(clean);
        onClose();
      } else {
        inputRefs.current[Math.min(clean.length, 5)]?.focus();
      }
    }
  }, [onSubmitPin, onClose]);

  // Sync with prop when server pushes pair-code-created
  useEffect(() => {
    if (myPin) {
      setLocalPin(myPin);
    }
  }, [myPin]);

  // Generate QR Code whenever active pin or device changes
  useEffect(() => {
    if (!isOpen) return;
    const activePin = cleanPairingPin(localPin);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const qrText = `${origin}/?pair=${activePin}`;
    
    QRCode.toDataURL(qrText, {
      margin: 1,
      width: 220,
      color: {
        dark: '#030712',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.warn('QR Code generation failed:', err));
  }, [localPin, isOpen, myDevice]);

  // Clean up camera stream if modal closes
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setIsScanning(false);
      setCameraError(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  if (!isOpen) return null;

  const rawClean = cleanPairingPin(localPin);
  const paddedPin = (rawClean.length === 6 ? rawClean : generatePairingPin().replace('-', '')).slice(0, 6);

  const handleCopyCode = () => {
    sounds.playClick();
    if (navigator.vibrate) navigator.vibrate(20);
    navigator.clipboard.writeText(formatPairingPin(paddedPin));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    sounds.playClick();
    if (navigator.vibrate) navigator.vibrate(20);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = `${origin}/?pair=${paddedPin}`;
    
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Pair with ${myDevice.name} on Pickup`,
          text: `Connect to ${myDevice.name} on Pickup using PIN: ${formatPairingPin(paddedPin)}`,
          url: shareUrl,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // User cancelled or share dismissed
      }
    } else {
      handleCopyCode();
    }
  };

  const handleRegenerate = () => {
    sounds.playClick();
    if (navigator.vibrate) navigator.vibrate(30);
    const fresh = generatePairingPin();
    setLocalPin(fresh);
    if (onRegeneratePin) {
      onRegeneratePin();
    }
  };

  // Handle typing into 6 individual PIN boxes
  const handleDigitChange = (index: number, val: string) => {
    const numeric = val.replace(/[^0-9]/g, '');
    if (!numeric) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    if (numeric.length > 1) {
      handlePastedCode(numeric);
      return;
    }

    const next = [...digits];
    next[index] = numeric.slice(-1);
    setDigits(next);

    if (navigator.vibrate) navigator.vibrate(10);

    // Auto-advance to next input box
    if (index < 5 && numeric) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit if all 6 digits entered
    const complete = next.join('');
    if (complete.length === 6) {
      sounds.playSuccess();
      onSubmitPin(complete);
      onClose();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const enteredPin = digits.join('');

  // Camera QR Scanner Functions
  const startCamera = async () => {
    sounds.playClick();
    setIsScanning(true);
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Check if native BarcodeDetector API is supported
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const raw = barcodes[0].rawValue;
              processScannedValue(raw);
            }
          } catch {
            // Frame detection pass
          }
        }, 300);
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError('Camera access unavailable. Please enter the 6-digit PIN manually.');
      stopCamera();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content interactive-pairing-modal"
        onClick={(e) => e.stopPropagation()}
        id="pairing-modal-content"
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 19, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <KeyRound size={20} style={{ color: 'var(--accent-cyan)' }} /> Pair Another Device
          </h2>
          <button
            className="btn btn-secondary"
            style={{ padding: 8, borderRadius: '50%', minWidth: 36, minHeight: 36 }}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="pairing-tabs">
          <button
            className={`btn btn-tab ${activeTab === 'my-code' ? 'active' : ''}`}
            onClick={() => {
              sounds.playClick();
              setActiveTab('my-code');
              stopCamera();
              setIsScanning(false);
            }}
          >
            <Smartphone size={15} /> This Device's Code
          </button>
          <button
            className={`btn btn-tab ${activeTab === 'enter-code' ? 'active' : ''}`}
            onClick={() => {
              sounds.playClick();
              setActiveTab('enter-code');
            }}
          >
            <QrCode size={15} /> Enter Peer Code
          </button>
        </div>

        {activeTab === 'my-code' ? (
          <div style={{ textAlign: 'center' }}>
            {/* Interactive QR Code Display */}
            <div className="qr-preview-card">
              {qrDataUrl ? (
                <div className="qr-code-wrapper">
                  <img src={qrDataUrl} alt="Pairing QR Code" className="qr-image" />
                  <div className="qr-scan-badge">Scan with Camera</div>
                </div>
              ) : (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="pulse-cyan">Loading QR Code...</div>
                </div>
              )}
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '14px 0 10px' }}>
              Or enter this 6-digit PIN on your other phone or computer:
            </p>

            {/* Instant High-Legibility PIN Display */}
            <div className="pin-display">
              <div className="pin-digit-box">{paddedPin[0]}</div>
              <div className="pin-digit-box">{paddedPin[1]}</div>
              <div className="pin-digit-box">{paddedPin[2]}</div>
              <div className="pin-hyphen">-</div>
              <div className="pin-digit-box">{paddedPin[3]}</div>
              <div className="pin-digit-box">{paddedPin[4]}</div>
              <div className="pin-digit-box">{paddedPin[5]}</div>
            </div>

            {/* Quick Actions Bar */}
            <div className="pin-actions-row">
              <button
                id="copy-pin-btn"
                className="btn btn-secondary action-btn-touch"
                onClick={handleCopyCode}
                title="Copy 6-digit PIN code"
              >
                {copied ? <Check size={16} style={{ color: 'var(--accent-green)' }} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy Code'}
              </button>

              <button
                id="share-pin-btn"
                className="btn btn-secondary action-btn-touch"
                onClick={handleShare}
                title="Share link via WhatsApp, iMessage, AirDrop, etc."
              >
                <Share2 size={16} style={{ color: 'var(--accent-cyan)' }} />
                {shared ? 'Shared!' : 'Share Link'}
              </button>

              <button
                id="refresh-pin-btn"
                className="btn btn-secondary action-btn-touch"
                onClick={handleRegenerate}
                title="Generate new PIN"
              >
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>

            {/* Security Badge */}
            <div className="pairing-security-badge">
              <ShieldCheck size={18} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
              <div>
                <b>Zero-Knowledge E2EE:</b> Keys are negotiated peer-to-peer. Unpaired devices on your WiFi cannot intercept your files.
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Enter the 6-digit code shown on your other device:
            </p>

            {/* 6 Individual Interactive PIN Input Boxes */}
            <div className="pin-inputs-grid" onPaste={(e) => {
              e.preventDefault();
              handlePastedCode(e.clipboardData.getData('text'));
            }}>
              {digits.map((digit, idx) => (
                <React.Fragment key={idx}>
                  {idx === 3 && <div className="pin-hyphen">-</div>}
                  <input
                    ref={(el) => (inputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                    className={`pin-input-digit ${digit ? 'filled' : ''}`}
                    aria-label={`PIN Digit ${idx + 1}`}
                    autoFocus={idx === 0}
                  />
                </React.Fragment>
              ))}
            </div>

            {/* Camera Scanner Section */}
            {isScanning ? (
              <div className="camera-scanner-view">
                <video ref={videoRef} className="camera-video-preview" muted playsInline />
                <div className="scanner-reticle-overlay">
                  <div className="scanner-target-corners" />
                  <div className="scanner-laser-line" />
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    stopCamera();
                    setIsScanning(false);
                  }}
                >
                  Close Camera
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, margin: '18px 0' }}>
                <button
                  id="scan-camera-btn"
                  className="btn btn-secondary"
                  style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
                  onClick={startCamera}
                >
                  <Camera size={16} style={{ color: 'var(--accent-purple-light)' }} /> Scan QR with Camera
                </button>
              </div>
            )}

            {cameraError && (
              <div className="camera-error-banner">
                <AlertCircle size={15} /> {cameraError}
              </div>
            )}

            {/* Submit Button */}
            <button
              id="submit-peer-pin-btn"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15 }}
              disabled={enteredPin.length !== 6}
              onClick={() => {
                if (enteredPin.length === 6) {
                  sounds.playSuccess();
                  onSubmitPin(enteredPin);
                  onClose();
                }
              }}
            >
              Pair and Connect Device
            </button>

            {/* Simulated Device Quick Test */}
            {onPairSimulated && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button
                  id="test-sim-pair-btn"
                  className="btn btn-simulate"
                  style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                  onClick={() => {
                    onPairSimulated();
                    onClose();
                  }}
                >
                  <Sparkles size={14} /> + Pair with Simulated Device (Testing)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
