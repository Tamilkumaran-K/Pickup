import { Device, SignalingMessage, SignalingMessageType } from '@pickup/shared';

type MessageHandler = (msg: SignalingMessage) => void;

export type ConnectionMode = 'mesh-connected' | 'cloud-web-p2p' | 'connecting' | 'disconnected';

export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') return true;
  const loc = window.location;
  if (loc.protocol === 'file:') return true;
  const host = loc.hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.')
  );
}

class SignalingClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private device: Device | null = null;
  private reconnectTimer: any = null;
  private isConnected = false;
  private activeWsUrl = '';
  private connectionMode: ConnectionMode = 'connecting';
  private connectionAttempts = 0;

  init(device: Device): void {
    this.device = device;
    this.connect();
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  getConnectionMode(): ConnectionMode {
    return this.connectionMode;
  }

  getActiveServerUrl(): string {
    return this.activeWsUrl;
  }

  isCloudWeb(): boolean {
    return !isLocalEnvironment() && !localStorage.getItem('dropflow-server-url');
  }

  private resolveServerUrl(): { url: string; isExplicit: boolean } {
    const params = new URLSearchParams(window.location.search);
    const queryUrl = params.get('server');
    const savedUrl = localStorage.getItem('dropflow-server-url');
    const envUrl = (import.meta as any).env?.VITE_SIGNALING_URL;

    if (queryUrl) return { url: queryUrl, isExplicit: true };
    if (savedUrl) return { url: savedUrl, isExplicit: true };
    if (envUrl) return { url: envUrl, isExplicit: true };

    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    // If running in standalone Electron via file://, connect directly to port 3001
    const host = loc.protocol === 'file:' || !loc.host ? 'localhost:3001' : loc.host;
    return { url: `${protocol}//${host}/ws`, isExplicit: false };
  }

  private connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const { url: wsUrl, isExplicit } = this.resolveServerUrl();
    this.activeWsUrl = wsUrl;
    this.connectionAttempts++;

    // If on a static cloud host (e.g. Vercel) without an explicit server URL,
    // and initial probe fails, operate smoothly in cloud-web-p2p mode without flooding errors.
    if (!isLocalEnvironment() && !isExplicit && this.connectionAttempts > 1) {
      this.isConnected = false;
      this.connectionMode = 'cloud-web-p2p';
      this.emit('connection-change', { connected: false, mode: 'cloud-web-p2p' } as any);
      // Low-frequency background health check every 45s
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 45000);
      return;
    }

    this.connectionMode = 'connecting';
    this.emit('connection-change', { connected: false, mode: 'connecting' } as any);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('[SignalingClient] Failed to instantiate WebSocket:', err);
      this.handleDisconnect(isExplicit);
      return;
    }

    this.ws.onopen = () => {
      this.isConnected = true;
      this.connectionMode = 'mesh-connected';
      this.connectionAttempts = 0;
      console.log('[SignalingClient] Connected to server at', wsUrl);
      if (this.device) {
        this.send({
          type: 'register',
          senderId: this.device.id,
          payload: { device: this.device },
          timestamp: Date.now(),
        });
      }
      this.emit('connection-change', { connected: true, mode: 'mesh-connected' } as any);
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg: SignalingMessage = JSON.parse(evt.data);
        this.dispatch(msg);
      } catch (err) {
        console.error('Failed to parse signaling message:', err);
      }
    };

    this.ws.onclose = () => {
      this.handleDisconnect(isExplicit);
    };

    this.ws.onerror = (err) => {
      // Avoid verbose console spam in cloud web mode
      if (isLocalEnvironment() || isExplicit) {
        console.warn('[SignalingClient] WebSocket connection notice:', err);
      }
    };
  }

  private handleDisconnect(isExplicit: boolean): void {
    this.isConnected = false;
    const isCloud = !isLocalEnvironment() && !isExplicit;
    this.connectionMode = isCloud ? 'cloud-web-p2p' : 'disconnected';
    this.emit('connection-change', { connected: false, mode: this.connectionMode } as any);

    clearTimeout(this.reconnectTimer);
    // Exponential / adaptive backoff: 3s for local / explicit, 30s for cloud web standalone
    const delay = isCloud ? 30000 : Math.min(2500 * Math.max(1, this.connectionAttempts), 15000);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send(msg: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[SignalingClient] Socket not open, message queued or skipped:', msg.type);
    }
  }

  on(type: SignalingMessageType | 'connection-change', handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  private dispatch(msg: SignalingMessage): void {
    const listeners = this.handlers.get(msg.type);
    if (listeners) {
      listeners.forEach((fn) => fn(msg));
    }
  }

  private emit(event: string, payload: any): void {
    const listeners = this.handlers.get(event as any);
    if (listeners) {
      const dummyMsg: SignalingMessage = {
        type: event as any,
        senderId: 'client',
        payload,
        timestamp: Date.now(),
      };
      listeners.forEach((fn) => fn(dummyMsg));
    }
  }

  /**
   * Tests whether a custom server WebSocket address is reachable.
   */
  async testServerConnection(testUrl: string, timeoutMs = 4000): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      let socket: WebSocket | null = null;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            socket?.close();
          } catch {}
          resolve({ ok: false, error: 'Connection timed out after 4 seconds' });
        }
      }, timeoutMs);

      try {
        socket = new WebSocket(testUrl);
        socket.onopen = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try {
              socket?.close();
            } catch {}
            resolve({ ok: true });
          }
        };
        socket.onerror = (err: any) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, error: 'Could not reach server endpoint' });
          }
        };
      } catch (err: any) {
        clearTimeout(timer);
        resolve({ ok: false, error: err.message || 'Invalid server URL' });
      }
    });
  }
}

export const signalingClient = new SignalingClient();

