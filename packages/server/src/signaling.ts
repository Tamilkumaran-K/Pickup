import { WebSocket } from 'ws';
import { SignalingMessage, Device, generatePairingPin, generateSecureToken, isValidPairingPin, cleanPairingPin, formatPairingPin } from '@pickup/shared';
import { PresenceManager } from './presence.js';
import { PairingManager } from './pairingManager.js';

// Max allowed text signaling message size: 1MB
const MAX_TEXT_PAYLOAD_BYTES = 1024 * 1024;
// Max allowed binary relay chunk: 5MB
const MAX_BINARY_PAYLOAD_BYTES = 5 * 1024 * 1024;

export class SignalingHandler {
  private presence: PresenceManager;
  private pairing: PairingManager;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(presence: PresenceManager, pairing: PairingManager) {
    this.presence = presence;
    this.pairing = pairing;
    this.startHeartbeat();
  }

  /**
   * Starts periodic pinging to detect and terminate zombie WebSocket connections.
   */
  private startHeartbeat(intervalMs = 30000): void {
    this.heartbeatInterval = setInterval(() => {
      const sessions = this.presence.getAllSessions();
      for (const session of sessions) {
        const ws = session.ws as any;
        if (ws.isAlive === false) {
          console.warn(`[Signaling] Reaping zombie connection for device: ${session.device.name} (${session.device.id})`);
          ws.terminate();
          continue;
        }

        ws.isAlive = false;
        try {
          ws.ping();
        } catch (err: any) {
          console.warn(`[Signaling] Error sending ping to device ${session.device.id}:`, err?.message);
        }
      }

      // Also clean up expired pairing codes
      this.pairing.cleanup();
    }, intervalMs);

    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  handleConnection(ws: WebSocket, remoteIp: string): void {
    (ws as any).isAlive = true;

    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      try {
        if (isBinary) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          if (buf.length > MAX_BINARY_PAYLOAD_BYTES) {
            console.warn(`[Signaling] Rejected oversized binary relay payload: ${buf.length} bytes`);
            return;
          }
          this.handleBinaryRelay(ws, buf);
          return;
        }

        const msgStr = data.toString();
        if (msgStr.length > MAX_TEXT_PAYLOAD_BYTES) {
          console.warn(`[Signaling] Rejected oversized signaling message: ${msgStr.length} chars`);
          ws.send(JSON.stringify({
            type: 'transfer-error',
            senderId: 'server',
            payload: { error: 'Payload exceeds maximum permitted size' },
            timestamp: Date.now(),
          }));
          return;
        }

        const msg: SignalingMessage = JSON.parse(msgStr);
        this.handleMessage(ws, msg, remoteIp);
      } catch (err: any) {
        console.error('Error handling WebSocket message:', err?.message || err);
      }
    });

    ws.on('close', () => {
      const device = this.presence.unregister(ws);
      if (device) {
        console.log(`[Presence] Device disconnected: ${device.name} (${device.id})`);
        this.presence.broadcastDeviceLists();
      }
    });

    ws.on('error', (err) => {
      console.warn('[WebSocket Error]:', err.message);
    });
  }

  private handleMessage(ws: WebSocket, msg: SignalingMessage, remoteIp: string): void {
    switch (msg.type) {
      case 'ping': {
        (ws as any).isAlive = true;
        ws.send(JSON.stringify({
          type: 'pong',
          senderId: 'server',
          targetId: msg.senderId,
          timestamp: Date.now(),
        }));
        break;
      }

      case 'register': {
        const device = msg.payload?.device as Device;
        if (!device || !device.id) {
          return;
        }
        this.presence.register(ws, device, remoteIp);
        console.log(`[Presence] Device registered: ${device.name} (${device.platform}) [${device.id}]`);
        this.presence.broadcastDeviceLists();
        break;
      }

      case 'request-pair-code': {
        const session = this.presence.getSessionByWs(ws);
        if (!session) return;

        const requestedCode = msg.payload?.code as string | undefined;
        const pin = (requestedCode && isValidPairingPin(requestedCode))
          ? cleanPairingPin(requestedCode)
          : generatePairingPin();
        const entry = this.pairing.registerCode(session.device, pin);

        ws.send(JSON.stringify({
          type: 'pair-code-created',
          senderId: 'server',
          targetId: session.device.id,
          payload: {
            code: entry.code,
            formattedCode: formatPairingPin(entry.code),
            expiresAt: entry.expiresAt,
          },
          timestamp: Date.now(),
        }));
        break;
      }

      case 'submit-pair-code': {
        const session = this.presence.getSessionByWs(ws);
        if (!session) return;

        const submittedCode = msg.payload?.code as string;
        if (!submittedCode) {
          ws.send(JSON.stringify({
            type: 'pair-rejected',
            senderId: 'server',
            targetId: session.device.id,
            payload: { reason: 'Missing pairing code' },
            timestamp: Date.now(),
          }));
          return;
        }

        const result = this.pairing.claimCode(submittedCode, session.device, remoteIp);
        if (!result.success || !result.hostDevice || !result.joiningDevice) {
          ws.send(JSON.stringify({
            type: 'pair-rejected',
            senderId: 'server',
            targetId: session.device.id,
            payload: {
              reason: result.error || 'Invalid or expired pairing code',
              lockedOut: result.lockedOut || false,
              retryAfterSec: result.retryAfterSec || 0,
            },
            timestamp: Date.now(),
          }));
          return;
        }

        // Mutual pairing success!
        this.presence.addPairing(result.hostDevice.id, result.joiningDevice.id);

        // Generate a shared cryptographic session salt for E2EE key derivation
        const sessionSalt = generateSecureToken(16);

        // Notify Host
        this.presence.sendToDevice(result.hostDevice.id, {
          type: 'pair-success',
          senderId: 'server',
          targetId: result.hostDevice.id,
          payload: {
            pairedDevice: result.joiningDevice,
            role: 'host',
            sessionSalt,
          },
          timestamp: Date.now(),
        });

        // Notify Joiner
        this.presence.sendToDevice(result.joiningDevice.id, {
          type: 'pair-success',
          senderId: 'server',
          targetId: result.joiningDevice.id,
          payload: {
            pairedDevice: result.hostDevice,
            role: 'joiner',
            sessionSalt,
          },
          timestamp: Date.now(),
        });

        // Broadcast updated lists with paired status
        this.presence.broadcastDeviceLists();
        break;
      }

      // WebRTC SDP Offer / Answer / ICE Candidates
      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'webrtc-ice':
      // Transfer Lifecycle Messages
      case 'transfer-init':
      case 'transfer-ack':
      case 'transfer-cancel':
      case 'transfer-complete':
      case 'transfer-error':
      case 'relay-chunk': {
        if (!msg.targetId) {
          console.warn(`Signaling message ${msg.type} missing targetId`);
          return;
        }
        const delivered = this.presence.sendToDevice(msg.targetId, msg);
        if (!delivered && msg.type === 'transfer-init') {
          ws.send(JSON.stringify({
            type: 'transfer-error',
            senderId: 'server',
            targetId: msg.senderId,
            payload: { error: 'Target device is offline or unavailable' },
            timestamp: Date.now(),
          }));
        }
        break;
      }

      default:
        console.log(`[Signaling] Unhandled message type: ${(msg as any).type}`);
    }
  }

  private handleBinaryRelay(ws: WebSocket, _binaryBuffer: Buffer): void {
    const session = this.presence.getSessionByWs(ws);
    if (!session) return;
  }
}
