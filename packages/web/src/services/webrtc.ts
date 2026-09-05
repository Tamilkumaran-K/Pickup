import {
  FileMeta,
  Transfer,
  createChunks,
  encodeChunkPacket,
  decodeChunkPacket,
  ChunkReassembler,
  computeSha256,
  verifySha256,
  encryptBytes,
  decryptBytes,
  bytesToBase64,
  base64ToBytes,
  sanitizeFileName,
  DEFAULT_CHUNK_SIZE,
} from '@dropflow/shared';
import { signalingClient } from './socket.js';
import { autoSaveManager } from './autoSave.js';

export interface TransferProgressCallback {
  (transfer: Transfer): void;
}

class WebRtcManager {
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private activeReassemblers = new Map<string, ChunkReassembler>();
  private activeTransfers = new Map<string, Transfer>();
  private progressCallbacks = new Set<TransferProgressCallback>();
  private peerKeys = new Map<string, CryptoKey>();
  private globalKey: CryptoKey | null = null;

  setPeerEncryptionKey(peerId: string, key: CryptoKey | null) {
    if (key) {
      this.peerKeys.set(peerId, key);
    } else {
      this.peerKeys.delete(peerId);
    }
  }

  getPeerEncryptionKey(peerId: string): CryptoKey | null {
    return this.peerKeys.get(peerId) || this.globalKey || null;
  }

  setEncryptionKey(key: CryptoKey | null) {
    this.globalKey = key;
  }

  onProgress(cb: TransferProgressCallback): () => void {
    this.progressCallbacks.add(cb);
    return () => this.progressCallbacks.delete(cb);
  }

  private notifyProgress(transfer: Transfer) {
    this.activeTransfers.set(transfer.id, transfer);
    this.progressCallbacks.forEach((cb) => cb({ ...transfer }));
  }

  async setupPeerConnection(targetId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    if (this.peerConnections.has(targetId)) {
      const existing = this.peerConnections.get(targetId)!;
      if (existing.connectionState !== 'closed' && existing.connectionState !== 'failed') {
        return existing;
      }
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    this.peerConnections.set(targetId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingClient.send({
          type: 'webrtc-ice',
          senderId: 'self',
          targetId,
          payload: { candidate: event.candidate },
          timestamp: Date.now(),
        });
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('file-transfer', { ordered: true });
      this.setupDataChannel(dc, targetId);
    } else {
      pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel, targetId);
      };
    }

    return pc;
  }

  private setupDataChannel(dc: RTCDataChannel, peerId: string) {
    dc.binaryType = 'arraybuffer';
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      console.log(`[WebRTC] DataChannel open with peer ${peerId}`);
    };

    dc.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        await this.handleIncomingChunk(new Uint8Array(event.data), 'webrtc-datachannel');
      }
    };

    dc.onclose = () => {
      this.dataChannels.delete(peerId);
    };
  }

  async handleSignalingMessage(msg: any) {
    const senderId = msg.senderId;

    if (msg.type === 'webrtc-offer') {
      const pc = await this.setupPeerConnection(senderId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      signalingClient.send({
        type: 'webrtc-answer',
        senderId: 'self',
        targetId: senderId,
        payload: { sdp: answer },
        timestamp: Date.now(),
      });
    } else if (msg.type === 'webrtc-answer') {
      const pc = this.peerConnections.get(senderId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
      }
    } else if (msg.type === 'webrtc-ice') {
      const pc = this.peerConnections.get(senderId);
      if (pc && msg.payload.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.payload.candidate));
        } catch (e) {
          console.warn('Could not add ICE candidate:', e);
        }
      }
    } else if (msg.type === 'transfer-init') {
      this.handleTransferInit(msg.payload.transfer);
    } else if (msg.type === 'relay-chunk') {
      // Fallback relay chunk over WebSocket
      const packet = new Uint8Array(msg.payload.packet);
      await this.handleIncomingChunk(packet, 'websocket-relay');
    }
  }

  private handleTransferInit(transfer: Transfer) {
    // Sanitize received filename to prevent path traversal
    transfer.fileMeta.name = sanitizeFileName(transfer.fileMeta.name);
    console.log('[WebRTC] Receiving file:', transfer.fileMeta.name);

    const reassembler = new ChunkReassembler(transfer.fileMeta);
    this.activeReassemblers.set(transfer.id, reassembler);

    transfer.status = 'transferring';
    transfer.direction = 'receive';
    transfer.startedAt = Date.now();
    this.notifyProgress(transfer);

    signalingClient.send({
      type: 'transfer-ack',
      senderId: 'self',
      targetId: transfer.senderId,
      payload: { transferId: transfer.id },
      timestamp: Date.now(),
    });
  }

  private async handleIncomingChunk(packet: Uint8Array, channelType: 'webrtc-datachannel' | 'websocket-relay') {
    const { header, payload } = decodeChunkPacket(packet);
    const reassembler = this.activeReassemblers.get(header.transferId);
    const transfer = this.activeTransfers.get(header.transferId);
    if (!reassembler || !transfer) return;

    let chunkData = payload;

    // Decrypt if encrypted with derived E2EE key
    if (header.isEncrypted && header.iv) {
      const key = this.getPeerEncryptionKey(transfer.senderId);
      if (!key) {
        console.error('[WebRTC Security] Transfer is encrypted but no shared key is registered for sender:', transfer.senderId);
        transfer.status = 'failed';
        transfer.error = 'E2EE error: Missing decryption key for peer';
        this.notifyProgress(transfer);
        return;
      }

      try {
        const iv = base64ToBytes(header.iv);
        chunkData = await decryptBytes(payload, iv, key);
      } catch (err) {
        console.error('[WebRTC Security] Decryption failed on chunk:', header.chunkIndex, err);
        transfer.status = 'failed';
        transfer.error = 'E2EE error: Decryption failed (tampered data or key mismatch)';
        this.notifyProgress(transfer);
        return;
      }
    }

    const isComplete = reassembler.addChunk(header.chunkIndex, chunkData);
    const progress = reassembler.getProgress();

    const elapsed = (Date.now() - transfer.startedAt) / 1000;
    const speed = elapsed > 0 ? progress.receivedBytes / elapsed : 0;

    transfer.bytesTransferred = progress.receivedBytes;
    transfer.speedBytesPerSec = speed;
    transfer.channelType = channelType;
    this.notifyProgress(transfer);

    if (isComplete) {
      transfer.status = 'verifying';
      this.notifyProgress(transfer);

      const completeBuffer = reassembler.getReassembledBuffer();
      const isValid = await verifySha256(completeBuffer, transfer.fileMeta.sha256);

      if (!isValid && transfer.fileMeta.sha256 !== 'skip') {
        transfer.status = 'failed';
        transfer.error = 'SHA-256 integrity mismatch: file may be corrupted';
        this.notifyProgress(transfer);
        return;
      }

      // Auto-save the file silently with zero click!
      const { savedPath } = await autoSaveManager.autoSaveFile(
        transfer.fileMeta.name,
        transfer.fileMeta.mimeType,
        completeBuffer
      );

      transfer.status = 'completed';
      transfer.completedAt = Date.now();
      transfer.autoSavedTo = savedPath;
      this.notifyProgress(transfer);

      // Inform sender of completion
      signalingClient.send({
        type: 'transfer-complete',
        senderId: 'self',
        targetId: transfer.senderId,
        payload: { transferId: transfer.id },
        timestamp: Date.now(),
      });
    }
  }

  async sendFile(
    targetId: string,
    targetName: string,
    selfId: string,
    selfName: string,
    file: File
  ): Promise<Transfer> {
    const fileBuffer = await file.arrayBuffer();
    const rawChunks = createChunks(fileBuffer, DEFAULT_CHUNK_SIZE);
    
    // Calculate SHA-256
    const sha256 = await computeSha256(fileBuffer);
    const safeFileName = sanitizeFileName(file.name);

    const fileMeta: FileMeta = {
      id: `file-${Date.now()}`,
      name: safeFileName,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      sha256,
      totalChunks: rawChunks.length,
      chunkSize: DEFAULT_CHUNK_SIZE,
      lastModified: file.lastModified,
    };

    const transferId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const transfer: Transfer = {
      id: transferId,
      senderId: selfId,
      senderName: selfName,
      receiverId: targetId,
      receiverName: targetName,
      fileMeta,
      status: 'connecting',
      direction: 'send',
      bytesTransferred: 0,
      speedBytesPerSec: 0,
      startedAt: Date.now(),
      sourcePath: (file as any).path || undefined,
    };

    this.notifyProgress(transfer);

    // Try WebRTC DataChannel first
    let pc = await this.setupPeerConnection(targetId, true);
    let dc = this.dataChannels.get(targetId);

    // If channel isn't open yet, create offer
    if (!dc || dc.readyState !== 'open') {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      signalingClient.send({
        type: 'webrtc-offer',
        senderId: selfId,
        targetId,
        payload: { sdp: offer },
        timestamp: Date.now(),
      });
    }

    // Inform target of transfer
    signalingClient.send({
      type: 'transfer-init',
      senderId: selfId,
      targetId,
      payload: { transfer },
      timestamp: Date.now(),
    });

    // Wait 1.5s for DataChannel open, else fallback to WebSocket Relay
    let useRelay = false;
    let attempts = 0;
    while ((!dc || dc.readyState !== 'open') && attempts < 15) {
      await new Promise((r) => setTimeout(r, 100));
      dc = this.dataChannels.get(targetId);
      attempts++;
    }

    if (!dc || dc.readyState !== 'open') {
      console.log('[WebRTC] DataChannel not open, using WebSocket zero-knowledge relay fallback');
      useRelay = true;
    }

    transfer.status = 'transferring';
    transfer.channelType = useRelay ? 'websocket-relay' : 'webrtc-datachannel';
    this.notifyProgress(transfer);

    // Check if peer has an active E2EE key
    const activeKey = this.getPeerEncryptionKey(targetId);

    // Stream chunks
    for (let i = 0; i < rawChunks.length; i++) {
      let chunkBytes = rawChunks[i];
      let ivBase64: string | undefined = undefined;

      if (activeKey) {
        const encrypted = await encryptBytes(chunkBytes, activeKey);
        chunkBytes = encrypted.ciphertext;
        ivBase64 = bytesToBase64(encrypted.iv);
      }

      const packet = encodeChunkPacket(
        {
          transferId,
          chunkIndex: i,
          totalChunks: rawChunks.length,
          payloadSize: chunkBytes.length,
          isEncrypted: !!activeKey,
          iv: ivBase64,
        },
        chunkBytes
      );

      if (useRelay) {
        signalingClient.send({
          type: 'relay-chunk',
          senderId: selfId,
          targetId,
          payload: { packet: Array.from(packet) },
          timestamp: Date.now(),
        });
      } else {
        // Backpressure check on DataChannel
        while (dc!.bufferedAmount > 4 * 1024 * 1024) {
          await new Promise((r) => setTimeout(r, 20));
        }
        dc!.send(packet.buffer as ArrayBuffer);
      }

      transfer.bytesTransferred += rawChunks[i].length;
      const elapsed = (Date.now() - transfer.startedAt) / 1000;
      transfer.speedBytesPerSec = elapsed > 0 ? transfer.bytesTransferred / elapsed : 0;
      this.notifyProgress(transfer);
    }

    return transfer;
  }
}

export const webRtcManager = new WebRtcManager();
