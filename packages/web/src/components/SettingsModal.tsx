import React, { useState } from 'react';
import { autoSaveManager } from '../services/autoSave.js';
import { Settings, Folder, Shield, X, Check, Laptop } from 'lucide-react';

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
        <div style={{ marginBottom: 24 }}>
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
