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
   * Returns visible devices for a given deviceId (devices on same IP/network, or explicitly paired devices).
   */
  getVisibleDevices(deviceId: string): Device[] {
    const currentSession = this.sessions.get(deviceId);
    if (!currentSession) return [];

    const visible: Device[] = [];
    for (const [id, session] of this.sessions.entries()) {
      if (id === deviceId) continue; // Skip self

      const isSameNetwork = this.isSameNetwork(session.remoteIp, currentSession.remoteIp);
      const isPaired = currentSession.pairedDevices.has(id);

      // Only devices on the same local network/IP or explicitly paired devices are visible on the radar
      if (isSameNetwork || isPaired) {
        visible.push({
          ...session.device,
          isPaired,
        });
      }
    }

    return visible;
  }

  /**
   * Checks whether two IP addresses belong to the same local network or subnet.
   */
  private isSameNetwork(ipA: string, ipB: string): boolean {
    if (ipA === ipB) return true;
    if (ipA === '127.0.0.1' || ipB === '127.0.0.1' || ipA === '::1' || ipB === '::1') return true;

    // Normalize IPv6-mapped IPv4 e.g. ::ffff:192.168.1.10 -> 192.168.1.10
    const cleanA = ipA.replace(/^.*:/, '');
    const cleanB = ipB.replace(/^.*:/, '');
    if (cleanA === cleanB) return true;

    const partsA = cleanA.split('.');
    const partsB = cleanB.split('.');
    if (partsA.length === 4 && partsB.length === 4) {
      // 192.168.x.x class C subnet match
      if (partsA[0] === '192' && partsA[1] === '168' && partsA[2] === partsB[2]) {
        return true;
      }
      // 10.x.x.x class A private network
      if (partsA[0] === '10' && partsA[1] === partsB[1]) {
        return true;
      }
      // 172.16.x.x - 172.31.x.x class B private network
      if (partsA[0] === '172' && partsB[0] === '172') {
        const o2A = parseInt(partsA[1], 10);
        const o2B = parseInt(partsB[1], 10);
        if (o2A >= 16 && o2A <= 31 && o2B >= 16 && o2B <= 31 && o2A === o2B) {
          return true;
        }
      }
    }

    return false;
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
