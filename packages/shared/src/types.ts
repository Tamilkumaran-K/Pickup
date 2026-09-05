export type DevicePlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web';

export interface Device {
  id: string;
  name: string;
  platform: DevicePlatform;
  publicKey?: string;
  lastSeen: number;
  isPaired?: boolean;
  isSelf?: boolean;
  ipAddress?: string;
}

export interface PairedDeviceLink {
  deviceId: string;
  name: string;
  platform: DevicePlatform;
  pairedAt: number;
  sharedKey?: string;
}

export interface FileMeta {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  sha256: string;
  totalChunks: number;
  chunkSize: number;
  lastModified?: number;
}

export type TransferStatus =
  | 'idle'
  | 'pending'
  | 'connecting'
  | 'transferring'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Transfer {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  fileMeta: FileMeta;
  status: TransferStatus;
  direction: 'send' | 'receive';
  bytesTransferred: number;
  speedBytesPerSec: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
  channelType?: 'webrtc-datachannel' | 'websocket-relay';
  autoSavedTo?: string;
  sourcePath?: string;
}

export interface ChunkHeader {
  transferId: string;
  chunkIndex: number;
  totalChunks: number;
  payloadSize: number;
  isEncrypted: boolean;
  iv?: string; // base64 encoded IV if encrypted
}

export type SignalingMessageType =
  | 'register'
  | 'device-list'
  | 'request-pair-code'
  | 'pair-code-created'
  | 'submit-pair-code'
  | 'pair-success'
  | 'pair-rejected'
  | 'webrtc-offer'
  | 'webrtc-answer'
  | 'webrtc-ice'
  | 'transfer-init'
  | 'transfer-ack'
  | 'transfer-cancel'
  | 'relay-chunk'
  | 'transfer-complete'
  | 'transfer-error'
  | 'ping'
  | 'pong';

export interface SignalingMessage {
  type: SignalingMessageType;
  senderId: string;
  targetId?: string;
  payload?: any;
  timestamp: number;
}

export interface PairingPayload {
  code: string;
  expiresAt: number;
  hostDevice: Device;
}

export interface WebRtcSignalPayload {
  transferId?: string;
  sdp?: any;
  candidate?: any;
}
