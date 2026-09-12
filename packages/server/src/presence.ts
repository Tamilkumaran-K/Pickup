import { WebSocket } from 'ws';
import { Device, SignalingMessage } from '@pickup/shared';

export interface ClientSession {
  ws: WebSocket;
  device: Device;
  remoteIp: string;
  pairedDevices: Set<string>; // deviceIds paired with this device
}

export class PresenceManager {
  private sessions = new Map<string, ClientSession>(); // deviceId -> ClientSession
  private wsToDeviceId = new Map<WebSocket, string>();

  /**
   * Registers or updates a client connection.
   */
  register(ws: WebSocket, device: Device, remoteIp: string): void {
    // If this device had an existing session with different ws, close old ws
    const existing = this.sessions.get(device.id);
    const pairedSet = existing ? existing.pairedDevices : new Set<string>();

    if (existing && existing.ws !== ws && existing.ws.readyState === WebSocket.OPEN) {
      try {
        existing.ws.close();
      } catch {}
    }

    const session: ClientSession = {
      ws,
      device: {
        ...device,
        lastSeen: Date.now(),
        ipAddress: remoteIp,
      },
      remoteIp,
      pairedDevices: pairedSet,
    };

    this.sessions.set(device.id, session);
    this.wsToDeviceId.set(ws, device.id);
  }

  /**
   * Removes client on disconnect.
   */
  unregister(ws: WebSocket): Device | null {
    const deviceId = this.wsToDeviceId.get(ws);
    if (!deviceId) return null;

    const session = this.sessions.get(deviceId);
    this.wsToDeviceId.delete(ws);
    this.sessions.delete(deviceId);

    return session ? session.device : null;
  }

  getSession(deviceId: string): ClientSession | null {
    return this.sessions.get(deviceId) || null;
  }

  getSessionByWs(ws: WebSocket): ClientSession | null {
    const deviceId = this.wsToDeviceId.get(ws);
    if (!deviceId) return null;
    return this.sessions.get(deviceId) || null;
  }

  /**
   * Records a mutual pairing relationship between two devices.
   */
  addPairing(deviceIdA: string, deviceIdB: string): void {
    const sessionA = this.sessions.get(deviceIdA);
    const sessionB = this.sessions.get(deviceIdB);
    if (sessionA) sessionA.pairedDevices.add(deviceIdB);
    if (sessionB) sessionB.pairedDevices.add(deviceIdA);
  }

  /**
   * Returns every online peer that is connected to this signaling node.
   *
   * A client address is not a reliable description of a user's network.  A
   * laptop on Ethernet, a second laptop on Wi-Fi, and a phone using a hotspot
   * can all be able to reach this server while having unrelated private (or
   * public) addresses.  Filtering by a guessed subnet made those peers
   * disappear from the radar even though signaling and the relay could reach
   * them.  The signaling node is therefore the discovery boundary: devices
   * connected to the same node can see one another, and pairing continues to
   * mark trusted peers for cross-network transfers.
   */
  getVisibleDevices(deviceId: string): Device[] {
    const currentSession = this.sessions.get(deviceId);
    if (!currentSession) return [];

    const visible: Device[] = [];
    for (const [id, session] of this.sessions.entries()) {
      if (id === deviceId) continue; // Skip self

      const isPaired = currentSession.pairedDevices.has(id);
      visible.push({
        ...session.device,
        isPaired,
      });
    }

    return visible;
  }

  getAllOnlineDevices(): Device[] {
    return Array.from(this.sessions.values()).map(s => s.device);
  }

  getAllSessions(): ClientSession[] {
    return Array.from(this.sessions.values());
  }

  getOnlineCount(): number {
    return this.sessions.size;
  }

  /**
   * Broadcasts a signaling message to all connected clients or nearby peers.
   */
  broadcast(msg: SignalingMessage, excludeDeviceId?: string): void {
    const payloadStr = JSON.stringify(msg);
    for (const [id, session] of this.sessions.entries()) {
      if (excludeDeviceId && id === excludeDeviceId) continue;
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(payloadStr);
      }
    }
  }

  /**
   * Sends a signaling message to a specific device.
   */
  sendToDevice(targetDeviceId: string, msg: SignalingMessage): boolean {
    const session = this.sessions.get(targetDeviceId);
    if (!session || session.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    session.ws.send(JSON.stringify(msg));
    return true;
  }

  /**
   * Broadcasts updated device list to all peers.
   */
  broadcastDeviceLists(): void {
    for (const [id, session] of this.sessions.entries()) {
      if (session.ws.readyState === WebSocket.OPEN) {
        const visibleDevices = this.getVisibleDevices(id);
        const msg: SignalingMessage = {
          type: 'device-list',
          senderId: 'server',
          targetId: id,
          payload: { devices: visibleDevices },
          timestamp: Date.now(),
        };
        session.ws.send(JSON.stringify(msg));
      }
    }
  }
}
