import React from 'react';
import { Device, DevicePlatform } from '@dropflow/shared';
import { Laptop, Smartphone, Globe, ShieldCheck, Sparkles, Wifi, Check } from 'lucide-react';
import { sounds } from '../services/soundEffects.js';

interface RadarViewProps {
  selfDevice: Device;
  discoveredDevices: Device[];
  selectedDevice: Device | null;
  onSelectDevice: (device: Device) => void;
  onAddSimulatedDevice?: () => void;
}

function getPlatformIcon(platform: DevicePlatform) {
  switch (platform) {
    case 'windows':
    case 'macos':
    case 'linux':
      return <Laptop size={26} />;
    case 'ios':
    case 'android':
      return <Smartphone size={26} />;
    case 'web':
    default:
      return <Globe size={26} />;
  }
}

export const RadarView: React.FC<RadarViewProps> = ({
  selfDevice,
  discoveredDevices,
  selectedDevice,
  onSelectDevice,
  onAddSimulatedDevice,
}) => {
  const radius = 155; // distance from radar center

  // Find index of selected device to draw dynamic beam from center (270, 220)
  const selectedIndex = selectedDevice
    ? discoveredDevices.findIndex((d) => d.id === selectedDevice.id)
    : -1;

  let beamTargetX = 0;
  let beamTargetY = 0;
  if (selectedIndex >= 0) {
    const total = discoveredDevices.length;
    const angle = (selectedIndex / total) * 2 * Math.PI - Math.PI / 2;
    beamTargetX = Math.round(Math.cos(angle) * radius);
    beamTargetY = Math.round(Math.sin(angle) * radius);
  }

  return (
    <div>
      <div className="radar-wrapper" id="radar-container">
        {/* Concentric Radar Grid Rings */}
        <div className="radar-ring radar-ring-1" />
        <div className="radar-ring radar-ring-2" />
        <div className="radar-ring radar-ring-3" />
        <div className="radar-crosshair-h" />
        <div className="radar-crosshair-v" />

        {/* 360-Degree Continuous Rotating Radar Beam */}
        <div className="radar-beam-sweep" />

        {/* Dynamic Glowing Beam to Selected Device */}
        {selectedIndex >= 0 && (
          <svg
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          >
            <defs>
              <linearGradient id="target-beam-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="1" />
              </linearGradient>
            </defs>
            <line
              x1={270}
              y1={220}
              x2={270 + beamTargetX}
              y2={220 + beamTargetY}
              stroke="url(#target-beam-gradient)"
              strokeWidth="3"
              strokeDasharray="8 6"
              className="animated-target-line"
            />
          </svg>
        )}

        {/* Radial expanding pulse aura */}
        <div className="radar-pulse" />

        {/* Center Device: This Machine */}
        <div className="center-device" title={`You: ${selfDevice.name} (${selfDevice.platform})`}>
          <div className="center-device-icon">
            {getPlatformIcon(selfDevice.platform)}
          </div>
          <div className="center-device-name font-mono">
            {selfDevice.name} <span style={{ color: 'var(--accent-cyan)' }}>(Host)</span>
          </div>
          <div className="center-pulse-ring" />
        </div>

        {/* Discovered nearby & paired devices */}
        {discoveredDevices.map((device, index) => {
          const total = discoveredDevices.length;
          const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
          const x = Math.round(Math.cos(angle) * radius);
          const y = Math.round(Math.sin(angle) * radius);

          const isSelected = selectedDevice?.id === device.id;

          return (
            <div
              key={device.id}
              id={`device-node-${device.id}`}
              className={`peer-node ${device.isPaired ? 'paired' : ''} ${isSelected ? 'selected' : ''}`}
              style={{
                transform: `translate(${x}px, ${y}px)`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                sounds.playClick();
                onSelectDevice(device);
              }}
              title={`Click to select ${device.name} as transfer target`}
            >
              <div className="peer-node-bubble">
                {isSelected && (
                  <div className="peer-selected-reticle">
                    🎯 TARGET
                  </div>
                )}
                <div className="peer-icon-wrapper">
                  {getPlatformIcon(device.platform)}
                </div>
                <span className="peer-status-dot" title="Online on WiFi" />

                {device.isPaired && (
                  <div className="peer-shield-badge" title="Trusted & Paired Device">
                    <ShieldCheck size={13} />
                  </div>
                )}
              </div>
              <div className="peer-node-label">{device.name}</div>
              <div className="peer-node-platform font-mono">
                {device.platform.toUpperCase()}
              </div>
            </div>
          );
        })}

        {/* Bottom Radar Controls */}
        <div className="radar-footer-controls">
          <div className="radar-status-text">
            <Wifi size={13} className="pulse-cyan" />
            <span>Scanning local subnet for AirDrop &amp; DropFlow peers</span>
          </div>

          {onAddSimulatedDevice && (
            <button
              id="simulate-peer-btn"
              className="btn btn-simulate"
              onClick={() => {
                sounds.playClick();
                onAddSimulatedDevice();
              }}
              title="Spawns a virtual peer to test file and text drops immediately"
            >
              <Sparkles size={13} /> + Test with Simulated Peer
            </button>
          )}
        </div>
      </div>

      {/* Quick Device Target Selector Bar */}
      {discoveredDevices.length > 0 && (
        <div className="device-selector-bar" id="device-target-selector">
          <span className="device-selector-label">Target Device:</span>
          {discoveredDevices.map((device) => {
            const isSelected = selectedDevice?.id === device.id;
            return (
              <button
                key={device.id}
                id={`target-pill-${device.id}`}
                className={`device-selector-pill ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  sounds.playClick();
                  onSelectDevice(device);
                }}
              >
                <span className="device-selector-pill-dot" />
                <span>{device.name}</span>
                {isSelected && <Check size={12} style={{ color: 'var(--accent-cyan)' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
