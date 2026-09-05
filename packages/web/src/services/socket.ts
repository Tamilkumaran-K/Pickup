import { Device, SignalingMessage, SignalingMessageType } from '@pickup/shared';

type MessageHandler = (msg: SignalingMessage) => void;

class SignalingClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private device: Device | null = null;
  private reconnectTimer: any = null;
  private isConnected = false;

  init(device: Device): void {
    this.device = device;
    this.connect();
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  private connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const envUrl = (import.meta as any).env?.VITE_SIGNALING_URL;
    const savedUrl = localStorage.getItem('dropflow-server-url');
    const params = new URLSearchParams(window.location.search);
    const queryUrl = params.get('server');

    let wsUrl: string;
    if (queryUrl) {
      wsUrl = queryUrl;
    } else if (savedUrl) {
      wsUrl = savedUrl;
    } else if (envUrl) {
      wsUrl = envUrl;
    } else {
      const loc = window.location;
      const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      // If running in standalone Electron via file://, connect directly to port 3001
      const host = loc.protocol === 'file:' || !loc.host ? 'localhost:3001' : loc.host;
      wsUrl = `${protocol}//${host}/ws`;
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      console.log('[SignalingClient] Connected to server at', wsUrl);
      if (this.device) {
        this.send({
          type: 'register',
          senderId: this.device.id,
          payload: { device: this.device },
          timestamp: Date.now(),
        });
      }
      this.emit('connection-change', { connected: true } as any);
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
      this.isConnected = false;
      this.emit('connection-change', { connected: false } as any);
      // Auto reconnect after 2.5s
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 2500);
    };

    this.ws.onerror = (err) => {
      console.warn('[SignalingClient] WebSocket error:', err);
    };
  }

  send(msg: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[SignalingClient] Cannot send message, socket not open:', msg.type);
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
}

export const signalingClient = new SignalingClient();
