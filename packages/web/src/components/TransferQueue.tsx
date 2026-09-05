import React, { useState } from 'react';
import { Transfer } from '@dropflow/shared';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  FolderCheck,
  FolderOpen,
  Inbox,
  Shield,
  Trash2,
  FileText,
  Clock,
  ExternalLink,
} from 'lucide-react';

interface TransferQueueProps {
  transfers: Transfer[];
  onClearHistory?: () => void;
  isDesktop?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return 'Just now';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const TransferQueue: React.FC<TransferQueueProps> = ({
  transfers,
  onClearHistory,
  isDesktop,
}) => {
  const [filter, setFilter] = useState<'all' | 'received' | 'sent'>('all');

  const receivedTransfers = transfers.filter((t) => t.direction === 'receive');
  const sentTransfers = transfers.filter((t) => t.direction === 'send');

  const displayedTransfers =
    filter === 'received'
      ? receivedTransfers
      : filter === 'sent'
      ? sentTransfers
      : transfers;

  const handleOpenFolder = () => {
    if (typeof (window as any).fileDropNative?.openSaveFolder === 'function') {
      (window as any).fileDropNative.openSaveFolder();
    } else {
      alert('Files are auto-saved to your local Downloads/FileDrop directory.');
    }
  };

  const handleOpenTransferLocation = (t: Transfer) => {
    const isReceive = t.direction === 'receive';
    const target = isReceive ? (t.autoSavedTo || t.fileMeta.name) : (t.sourcePath || t.autoSavedTo || '');
    
    if (typeof (window as any).fileDropNative?.showItemInFolder === 'function') {
      (window as any).fileDropNative.showItemInFolder(target);
      return;
    }

    if (typeof (window as any).fileDropNative?.openSaveFolder === 'function') {
      (window as any).fileDropNative.openSaveFolder();
      return;
    }

    if (isReceive) {
      alert(`Received file "${t.fileMeta.name}" is stored in your Downloads/FileDrop folder.`);
    } else {
      alert(`Sent file "${t.fileMeta.name}" originated from: ${t.sourcePath || 'Local storage'}`);
    }
  };

  return (
    <div style={{ marginTop: 36 }} id="transfer-queue-container">
      {/* Activity Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(6, 182, 212, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Inbox size={18} style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Files Sent &amp; Received
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {isDesktop
                ? (navigator.userAgent.includes('Mac')
                  ? 'Zero-Click Native Auto-Save to ~/Downloads/FileDrop/ (macOS Finder)'
                  : 'Zero-Click Native Auto-Save to ~/Downloads/FileDrop/ (File Explorer)')
                : 'Live transfer activity & peer history'}
            </div>
          </div>
        </div>

        {/* Filter Tabs & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              gap: 4,
              background: 'rgba(255, 255, 255, 0.03)',
              padding: 3,
              borderRadius: 10,
              border: '1px solid var(--border-glass)',
            }}
          >
            <button
              id="filter-all-transfers-btn"
              onClick={() => setFilter('all')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: filter === 'all' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                color: filter === 'all' ? '#fff' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              All ({transfers.length})
            </button>
            <button
              id="filter-received-transfers-btn"
              onClick={() => setFilter('received')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: filter === 'received' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                color: filter === 'received' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Received ({receivedTransfers.length})
            </button>
            <button
              id="filter-sent-transfers-btn"
              onClick={() => setFilter('sent')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: filter === 'sent' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                color: filter === 'sent' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Sent ({sentTransfers.length})
            </button>
          </div>

          {/* Open Folder Button */}
          <button
            id="open-downloads-folder-btn"
            onClick={handleOpenFolder}
            className="btn btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Open ~/Downloads/FileDrop/ directory"
          >
            <FolderOpen size={14} style={{ color: 'var(--accent-amber)' }} />
            <span>Open Folder</span>
          </button>

          {/* Clear History Button */}
          {transfers.length > 0 && onClearHistory && (
            <button
              id="clear-transfers-history-btn"
              onClick={onClearHistory}
              className="btn btn-secondary"
              style={{ padding: '6px 10px', fontSize: 12 }}
              title="Clear transfer list"
            >
              <Trash2 size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {displayedTransfers.length === 0 ? (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px dashed var(--border-glass)',
            borderRadius: 16,
            padding: '36px 20px',
            textAlign: 'center',
            backdropFilter: 'blur(16px)',
          }}
          id="transfer-queue-empty"
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
            }}
          >
            <FileText size={24} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            {filter === 'received'
              ? 'No files received yet'
              : filter === 'sent'
              ? 'No files sent yet'
              : 'No file transfers recorded yet'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto 16px' }}>
            Click any discovered peer on the Radar above to drop files, share clipboard text, or receive zero-click downloads.
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              background: 'rgba(6, 182, 212, 0.08)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              fontSize: 12,
              color: 'var(--accent-cyan)',
            }}
          >
            <FolderCheck size={14} /> Auto-save target:{' '}
            <b style={{ fontFamily: 'monospace' }}>~/Downloads/FileDrop/</b>
          </div>
        </div>
      ) : (
        /* Transfer Cards List */
        <div className="transfer-list">
          {displayedTransfers.map((t) => {
            const percent =
              t.fileMeta.size === 0
                ? 100
                : Math.min(100, Math.round((t.bytesTransferred / t.fileMeta.size) * 100));

            const isComplete = t.status === 'completed';
            const isFailed = t.status === 'failed';
            const isSending = t.direction === 'send';

            return (
              <div
                key={t.id}
                className="transfer-card interactive"
                id={`transfer-card-${t.id}`}
                onClick={() => handleOpenTransferLocation(t)}
                title="Click to direct to file location in File Explorer"
                style={{
                  borderLeft: isSending
                    ? '3px solid var(--accent-cyan)'
                    : '3px solid var(--accent-purple)',
                }}
              >
                {/* Direction Icon Badge */}
                <div
                  className="transfer-file-icon"
                  style={{
                    background: isSending
                      ? 'rgba(6, 182, 212, 0.12)'
                      : 'rgba(168, 85, 247, 0.12)',
                  }}
                >
                  {isSending ? (
                    <ArrowUpRight size={22} style={{ color: 'var(--accent-cyan)' }} />
                  ) : (
                    <ArrowDownLeft size={22} style={{ color: 'var(--accent-purple)' }} />
                  )}
                </div>

                <div className="transfer-details">
                  {/* Title & Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: isSending
                            ? 'rgba(6, 182, 212, 0.2)'
                            : 'rgba(168, 85, 247, 0.2)',
                          color: isSending ? 'var(--accent-cyan)' : 'var(--accent-purple)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {isSending ? 'Sent' : 'Received'}
                      </span>
                      <div className="transfer-filename">{t.fileMeta.name}</div>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {isComplete ? (
                        <span
                          style={{
                            color: 'var(--accent-green)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <CheckCircle2 size={14} /> Completed
                        </span>
                      ) : isFailed ? (
                        <span
                          style={{
                            color: 'var(--accent-rose)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <AlertCircle size={14} /> Failed
                        </span>
                      ) : (
                        <span style={{ color: 'var(--accent-cyan)' }}>{percent}%</span>
                      )}
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="transfer-meta" style={{ marginTop: 4 }}>
                    <span>{formatBytes(t.fileMeta.size)}</span>
                    <span>•</span>
                    <span>
                      {isSending ? `To: ${t.receiverName}` : `From: ${t.senderName}`}
                    </span>
                    <span>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> {formatTime(t.startedAt)}
                    </span>
                    {t.status === 'transferring' && (
                      <>
                        <span>•</span>
                        <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                          {formatSpeed(t.speedBytesPerSec)}
                        </span>
                      </>
                    )}
                    {t.channelType && (
                      <>
                        <span>•</span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Shield size={11} />
                          {t.channelType === 'webrtc-datachannel' ? 'Direct P2P' : 'AES-256 Relay'}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Direct-to-Storage Location Badge for Received or Sent File */}
                  {isComplete && (
                    <div className="transfer-location-badge">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: isSending ? 'var(--accent-cyan)' : 'var(--accent-green)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isSending ? <FolderOpen size={13} /> : <FolderCheck size={13} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {isSending
                            ? <span>Stored at: <b>{t.sourcePath || 'Local Filesystem'}</b></span>
                            : <span>Auto-saved to: <b>{t.autoSavedTo || 'Downloads/FileDrop/' + t.fileMeta.name}</b></span>}
                        </span>
                      </div>
                      <button
                        className="btn-direct-location"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTransferLocation(t);
                        }}
                        title="Click to open file in Windows File Explorer"
                      >
                        <ExternalLink size={11} />
                        <span>Direct to Location</span>
                      </button>
                    </div>
                  )}

                  {t.error && (
                    <div style={{ fontSize: 12, color: 'var(--accent-rose)', marginTop: 4 }}>
                      {t.error}
                    </div>
                  )}

                  {/* Transfer Progress Bar */}
                  {!isComplete && !isFailed && (
                    <div className="transfer-progress-bar" style={{ marginTop: 8 }}>
                      <div
                        className="transfer-progress-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

