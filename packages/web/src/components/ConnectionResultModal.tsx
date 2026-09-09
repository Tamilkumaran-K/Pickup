import React from 'react';
import { Device, DevicePlatform } from '@pickup/shared';
import {
  CheckCircle2,
  AlertTriangle,
  Send,
  RefreshCw,
  X,
  Laptop,
  Smartphone,
  Globe,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { sounds } from '../services/soundEffects.js';

interface ConnectionResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: 'success' | 'error';
  peerDevice?: Device | null;
  errorReason?: string;
  onSendFiles?: () => void;
  onTryAgain?: () => void;
}

function getPlatformIcon(platform?: DevicePlatform) {
  switch (platform) {
    case 'windows':
    case 'macos':
    case 'linux':
      return <Laptop size={24} />;
    case 'ios':
    case 'android':
      return <Smartphone size={24} />;
    case 'web':
    default:
      return <Globe size={24} />;
  }
}

export const ConnectionResultModal: React.FC<ConnectionResultModalProps> = ({
  isOpen,
  onClose,
  status,
  peerDevice,
  errorReason,
  onSendFiles,
  onTryAgain,
}) => {
  if (!isOpen) return null;

  const isSuccess = status === 'success';

  return (
    <div className="modal-backdrop" onClick={onClose} id="connection-result-backdrop">
      <div
        className={`modal-content connection-result-modal ${isSuccess ? 'result-success' : 'result-error'}`}
        onClick={(e) => e.stopPropagation()}
        id="connection-result-modal-content"
      >
        {/* Close Icon */}
        <button
          className="btn btn-secondary modal-close-btn"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        {isSuccess ? (
          /* SUCCESS POPUP */
          <div className="result-modal-body" id="connection-success-popup">
            <div className="result-icon-wrapper success-glow">
              <CheckCircle2 size={44} className="result-main-icon text-accent-green" />
            </div>

            <h2 className="result-title">Connected Successfully!</h2>
            <p className="result-subtitle">
              Your device is now securely paired across networks. You can transfer files, photos, and media back and forth from anywhere in the world.
            </p>

            {/* Paired Device Info Card */}
            {peerDevice && (
              <div className="paired-device-card" id="paired-device-info-card">
                <div className="paired-device-icon">
                  {getPlatformIcon(peerDevice.platform)}
                </div>
                <div className="paired-device-details">
                  <div className="paired-device-name">{peerDevice.name}</div>
                  <div className="paired-device-badges">
                    <span className="badge badge-network">
                      <Globe size={12} /> Cross-Device P2P
                    </span>
                    <span className="badge badge-encrypted">
                      <ShieldCheck size={12} /> E2EE AES-256
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="result-actions">
              {onSendFiles && (
                <button
                  id="result-send-files-btn"
                  className="btn btn-primary btn-large btn-glow-green"
                  onClick={() => {
                    sounds.playClick();
                    onSendFiles();
                  }}
                >
                  <Send size={16} />
                  <span>Send Files to {peerDevice ? peerDevice.name : 'Device'}</span>
                </button>
              )}
              <button
                id="result-done-btn"
                className="btn btn-secondary btn-large"
                onClick={() => {
                  sounds.playClick();
                  onClose();
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* FAILURE POPUP */
          <div className="result-modal-body" id="connection-failed-popup">
            <div className="result-icon-wrapper error-glow">
              <AlertTriangle size={44} className="result-main-icon text-accent-rose" />
            </div>

            <h2 className="result-title">Connection Failed</h2>
            <p className="result-subtitle">
              Unable to complete the pairing handshake with the other device.
            </p>

            {/* Error Detail Card */}
            <div className="error-detail-card" id="connection-error-card">
              <div className="error-reason-title">Reason:</div>
              <div className="error-reason-text">
                {errorReason || 'The 6-digit code was invalid, expired, or the peer was not found.'}
              </div>
              <div className="error-suggestion">
                💡 <b>Tip:</b> Check the 6-digit code currently shown on the other device and verify both devices have an active internet connection.
              </div>
            </div>

            {/* Action Buttons */}
            <div className="result-actions">
              {onTryAgain && (
                <button
                  id="result-try-again-btn"
                  className="btn btn-primary btn-large"
                  onClick={() => {
                    sounds.playClick();
                    onTryAgain();
                  }}
                >
                  <RefreshCw size={16} />
                  <span>Try Again</span>
                </button>
              )}
              <button
                id="result-dismiss-btn"
                className="btn btn-secondary btn-large"
                onClick={() => {
                  sounds.playClick();
                  onClose();
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
