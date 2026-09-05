import React from 'react';
import { Transfer } from '@dropflow/shared';
import { Activity, Gauge, ShieldCheck, Laptop, Smartphone, Globe, ArrowRight } from 'lucide-react';

interface TransferTelemetryProps {
  activeTransfer: Transfer | null;
  onCancel?: () => void;
}

function getPlatformIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('iphone') || lower.includes('android') || lower.includes('pixel')) {
    return <Smartphone size={18} />;
  }
  if (lower.includes('mac') || lower.includes('pc') || lower.includes('laptop') || lower.includes('windows')) {
    return <Laptop size={18} />;
  }
  return <Globe size={18} />;
}

export const TransferTelemetry: React.FC<TransferTelemetryProps> = ({ activeTransfer }) => {
  if (!activeTransfer || activeTransfer.status === 'idle') return null;

  const speedMb = activeTransfer.speedBytesPerSec / (1024 * 1024);
  const maxSpeedGauge = 40; // 40 MB/s max scale
  const gaugePercent = Math.min(100, Math.round((speedMb / maxSpeedGauge) * 100));

  const totalBytes = activeTransfer.fileMeta.size;
  const transferred = activeTransfer.bytesTransferred;
  const percent = totalBytes === 0 ? 100 : Math.min(100, Math.round((transferred / totalBytes) * 100));

  // Compute gauge stroke dashoffset
  // Radius 42, circumference = 2 * PI * 42 ~= 263.89
  // 180 degree semi-circle arc
  const radius = 42;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (gaugePercent / 100) * circumference;

  const isComplete = activeTransfer.status === 'completed';

  return (
    <div className="telemetry-hud glass-panel" id="transfer-telemetry-hud">
      <div className="telemetry-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={18} className="pulse-cyan" />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Live Stream Telemetry
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-cyan)' }}>
          <ShieldCheck size={14} />
          <span>AES-256-GCM Direct Channel</span>
        </div>
      </div>

      <div className="telemetry-grid">
        {/* Speedometer Circular Gauge */}
        <div className="speedometer-box">
          <div className="gauge-wrapper">
            <svg width="110" height="70" viewBox="0 0 110 70">
              {/* Background Arc */}
              <path
                d="M 15 60 A 42 42 0 0 1 95 60"
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="8"
                strokeLinecap="round"
              />
              {/* Active Value Arc */}
              <path
                d="M 15 60 A 42 42 0 0 1 95 60"
                fill="none"
                stroke="url(#gauge-gradient)"
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.2s ease' }}
              />
              <defs>
                <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--accent-cyan)" />
                  <stop offset="100%" stopColor="var(--accent-purple)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="gauge-speed-val">
              {speedMb >= 0.1 ? speedMb.toFixed(1) : '<0.1'}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>MB/s</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Gauge size={12} /> Throughput Rate
          </div>
        </div>

        {/* Holographic Fiber-Optic Transfer Beam */}
        <div className="fiber-beam-container">
          <div className="beam-endpoint">
            <div className="beam-avatar">
              {getPlatformIcon(activeTransfer.senderName)}
            </div>
            <div className="beam-name">{activeTransfer.senderName}</div>
          </div>

          <div className="fiber-beam-track">
            <div className={`fiber-beam-line ${!isComplete ? 'active' : ''}`} />
            {!isComplete && (
              <>
                <div className="fiber-packet packet-1" />
                <div className="fiber-packet packet-2" />
                <div className="fiber-packet packet-3" />
              </>
            )}
            <div className="beam-center-tag">
              {isComplete ? 'COMPLETE' : `${percent}%`}
            </div>
          </div>

          <div className="beam-endpoint">
            <div className="beam-avatar target">
              {getPlatformIcon(activeTransfer.receiverName)}
            </div>
            <div className="beam-name">{activeTransfer.receiverName}</div>
          </div>
        </div>

        {/* Telemetry Stats Column */}
        <div className="telemetry-stats">
          <div className="telemetry-stat-row">
            <span className="stat-label">File Name</span>
            <span className="stat-value" title={activeTransfer.fileMeta.name}>
              {activeTransfer.fileMeta.name}
            </span>
          </div>
          <div className="telemetry-stat-row">
            <span className="stat-label">Chunk Payload</span>
            <span className="stat-value font-mono">
              {activeTransfer.fileMeta.totalChunks} × 64KB
            </span>
          </div>
          <div className="telemetry-stat-row">
            <span className="stat-label">Protocol</span>
            <span className="stat-value font-mono" style={{ color: 'var(--accent-cyan)' }}>
              {activeTransfer.channelType === 'websocket-relay' ? 'Encrypted Relay' : 'WebRTC P2P'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
