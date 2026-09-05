import React from 'react';
import {
  Laptop,
  Smartphone,
  Globe,
  Download,
  ShieldCheck,
  Zap,
  FolderSync,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { sounds } from '../services/soundEffects.js';

interface LandingHubProps {
  onLaunchWebDrop: () => void;
}

export const LandingHub: React.FC<LandingHubProps> = ({ onLaunchWebDrop }) => {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 0' }} id="landing-hub-view">
      {/* Hero Section */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 999,
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.25)',
            color: 'var(--accent-cyan)',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
          }}
        >
          <Zap size={14} /> True Zero-Click Cross-Platform File Sync
        </div>

        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 56px)',
            lineHeight: 1.15,
            marginBottom: 18,
            background: 'linear-gradient(to right, #FFFFFF 30%, #94A3B8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Drop it here. <br />
          It appears there.
        </h1>

        <p
          style={{
            fontSize: 18,
            color: 'var(--text-secondary)',
            maxWidth: 620,
            margin: '0 auto 28px',
            lineHeight: 1.6,
          }}
        >
          An AirDrop and LocalSend experience that works across <b>all</b> devices: Android, iOS, Windows, macOS, and Web. No manual download step required.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            id="launch-web-drop-btn"
            className="btn btn-primary"
            style={{ padding: '14px 28px', fontSize: 16 }}
            onClick={onLaunchWebDrop}
          >
            Launch Web Drop Now <ArrowRight size={18} />
          </button>
          <a
            href="#downloads-section"
            className="btn btn-secondary"
            style={{ padding: '14px 24px', fontSize: 16, textDecoration: 'none' }}
          >
            <Download size={18} /> Download Native Apps
          </a>
        </div>
      </div>

      {/* Core Highlights Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          marginBottom: 56,
        }}
      >
        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ color: 'var(--accent-cyan)', marginBottom: 12 }}>
            <FolderSync size={28} />
          </div>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>Zero-Click Auto-Save</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Files land directly into Photos/Gallery on mobile or Downloads/Pickup on desktop. No manual &quot;tap to download&quot; buttons.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ color: 'var(--accent-purple)', marginBottom: 12 }}>
            <Zap size={28} />
          </div>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>Direct Local P2P</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Transfers fly directly over local WiFi via WebRTC Data Channels at raw network speeds without uploading your data to cloud servers.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ color: 'var(--accent-green)', marginBottom: 12 }}>
            <ShieldCheck size={28} />
          </div>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>End-to-End Encrypted</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Every chunk is encrypted with AES-256-GCM. 6-digit PIN and QR pairing guarantees only your trusted devices can receive files.
          </p>
        </div>
      </div>

      {/* Download Hub Cards */}
      <div id="downloads-section">
        <h2 style={{ fontSize: 24, marginBottom: 8, textAlign: 'center' }}>
          Get Pickup on All Your Devices
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 32 }}>
          Install native desktop or mobile clients for seamless background file reception.
        </p>

        <div className="platform-grid">
          {/* Windows */}
          <div className="platform-card">
            <div className="platform-card-icon">
              <Laptop size={24} />
            </div>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Windows</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Windows 10 / 11 • Native auto-save to ~/Downloads/Pickup
            </p>
            <a
              id="download-windows-btn"
              href="/api/download/windows"
              download="Pickup-Windows-Setup.exe"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', textDecoration: 'none' }}
              onClick={() => sounds.playClick()}
            >
              <Download size={15} /> Download for Windows (.exe)
            </a>
          </div>

          {/* macOS */}
          <div className="platform-card">
            <div className="platform-card-icon">
              <Laptop size={24} style={{ color: 'var(--accent-purple)' }} />
            </div>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>macOS</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Apple Silicon &amp; Intel • Silent folder sync
            </p>
            <a
              id="download-macos-btn"
              href="/api/download/macos"
              download="Pickup-macOS.dmg"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', textDecoration: 'none' }}
              onClick={() => sounds.playClick()}
            >
              <Download size={15} /> Download for macOS (.dmg)
            </a>
          </div>

          {/* Android */}
          <div className="platform-card">
            <div className="platform-card-icon">
              <Smartphone size={24} style={{ color: 'var(--accent-green)' }} />
            </div>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Android</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Expo / React Native • Direct save to Gallery/Photos
            </p>
            <a
              id="download-android-btn"
              href="/api/download/android"
              download="Pickup.apk"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', textDecoration: 'none' }}
              onClick={() => sounds.playClick()}
            >
              <Download size={15} /> Download Android APK
            </a>
          </div>

          {/* iOS */}
          <div className="platform-card">
            <div className="platform-card-icon">
              <Smartphone size={24} style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>iOS / iPhone</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              App Store review in progress • Direct QR camera sync
            </p>
            <button
              id="download-ios-btn"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', opacity: 0.6, cursor: 'not-allowed' }}
              disabled
              title="iOS App Store release in progress"
            >
              <Clock size={15} /> App Store (Publishing Soon)
            </button>
          </div>

          {/* Web Client */}
          <div className="platform-card" style={{ borderColor: 'var(--border-glow)' }}>
            <div className="platform-card-icon">
              <Globe size={24} />
            </div>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Web Client</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Zero install • Works in Chrome, Edge, Safari, Firefox
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 'auto' }}
              onClick={onLaunchWebDrop}
            >
              Open Web Drop Client
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
