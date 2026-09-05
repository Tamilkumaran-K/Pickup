import React, { useState } from 'react';
import { Device } from '@pickup/shared';
import { X, QrCode, KeyRound, ShieldCheck, Check } from 'lucide-react';

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  myPin: string;
  myDevice: Device;
  onSubmitPin: (pin: string) => void;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  isOpen,
  onClose,
  myPin,
  myDevice,
  onSubmitPin,
}) => {
  const [inputPin, setInputPin] = useState('');
  const [activeTab, setActiveTab] = useState<'my-code' | 'enter-code'>('my-code');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const cleanInput = inputPin.replace(/[^0-9]/g, '');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    setInputPin(raw);
  };

  const handleConnect = () => {
    if (cleanInput.length === 6) {
      onSubmitPin(cleanInput);
      setInputPin('');
      onClose();
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(myPin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} id="pairing-modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={20} style={{ color: 'var(--accent-cyan)' }} /> Pair Another Device
          </h2>
          <button
            className="btn btn-secondary"
            style={{ padding: 6, borderRadius: '50%' }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 12, marginBottom: 24 }}>
          <button
            className={`btn btn-tab ${activeTab === 'my-code' ? 'active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => setActiveTab('my-code')}
          >
            This Device's Code
          </button>
          <button
            className={`btn btn-tab ${activeTab === 'enter-code' ? 'active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => setActiveTab('enter-code')}
          >
            Enter Code from Peer
          </button>
        </div>

        {activeTab === 'my-code' ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Enter this 6-digit PIN on your other phone or laptop to establish an encrypted trusted link:
            </p>

            <div className="pin-display">
              {myPin ? (
                <>
                  <div className="pin-digit-box">{myPin[0] || '-'}</div>
                  <div className="pin-digit-box">{myPin[1] || '-'}</div>
                  <div className="pin-digit-box">{myPin[2] || '-'}</div>
                  <div className="pin-hyphen">-</div>
                  <div className="pin-digit-box">{myPin[4] || myPin[3] || '-'}</div>
                  <div className="pin-digit-box">{myPin[5] || myPin[4] || '-'}</div>
                  <div className="pin-digit-box">{myPin[6] || myPin[5] || '-'}</div>
                </>
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>Generating PIN...</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={handleCopyCode}>
                {copied ? <Check size={16} /> : <KeyRound size={16} />}
                {copied ? 'Copied!' : 'Copy PIN Code'}
              </button>
            </div>

            <div
              style={{
                marginTop: 24,
                padding: '12px 16px',
                borderRadius: 12,
                background: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 12,
                color: 'var(--accent-cyan)',
                textAlign: 'left',
              }}
            >
              <ShieldCheck size={20} style={{ flexShrink: 0 }} />
              <div>
                <b>End-to-End Encrypted:</b> Keys are exchanged directly between devices. The server cannot inspect file contents.
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Enter the 6-digit code shown on your other device:
            </p>

            <div style={{ margin: '20px 0' }}>
              <input
                id="peer-pin-input"
                type="text"
                placeholder="123456"
                maxLength={6}
                value={inputPin}
                onChange={handleInputChange}
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: 14,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  color: '#FFF',
                  fontSize: 24,
                  fontFamily: 'var(--font-heading)',
                  letterSpacing: '8px',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            </div>

            <button
              id="submit-peer-pin-btn"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
              disabled={cleanInput.length !== 6}
              onClick={handleConnect}
            >
              Pair and Connect
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
