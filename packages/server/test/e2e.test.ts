import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { WebSocket } from 'ws';
import { createApp } from '../src/index.js';
import {
  Device,
  SignalingMessage,
  createChunks,
  encodeChunkPacket,
  decodeChunkPacket,
  ChunkReassembler,
  computeSha256,
  verifySha256,
  deriveKeyFromSecret,
  encryptBytes,
  decryptBytes,
  DEFAULT_CHUNK_SIZE,
} from '@dropflow/shared';

describe('DropFlow End-to-End E2EE File Transfer Verification', () => {
  let serverInstance: http.Server;
  let serverPort: number;
  let serverApp: ReturnType<typeof createApp>;
  const activeSockets: WebSocket[] = [];

  before(async () => {
    serverApp = createApp();
    await new Promise<void>((resolve) => {
      serverInstance = serverApp.server.listen(0, () => {
        const addr = serverInstance.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  after(async () => {
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
    await new Promise<void>((resolve) => {
      serverApp.wss.close(() => {
        serverInstance.close(() => resolve());
      });
    });
  });

  function createClientWs(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws`);
      ws.on('open', () => {
        activeSockets.push(ws);
        resolve(ws);
      });
      ws.on('error', reject);
    });
  }

  function waitForMessage(
    ws: WebSocket,
    type: string,
    predicate?: (msg: SignalingMessage) => boolean,
    timeoutMs = 5000
  ): Promise<SignalingMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.off('message', handler);
        reject(new Error(`Timed out waiting for message type "${type}" after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === type && (!predicate || predicate(msg))) {
            clearTimeout(timer);
            ws.off('message', handler);
            resolve(msg);
          }
        } catch {}
      };

      ws.on('message', handler);
    });
  }

  test('Full E2E: 250KB encrypted chunked transfer with SHA-256 verification and PIN pairing', async () => {
    // 1. Connect Device A ("Windows PC") & Device B ("iPhone")
    const wsA = await createClientWs();
    const wsB = await createClientWs();

    const devA: Device = { id: 'pc-1', name: "Tamil's PC", platform: 'windows', lastSeen: Date.now() };
    const devB: Device = { id: 'phone-1', name: "Tamil's iPhone", platform: 'ios', lastSeen: Date.now() };

    wsA.send(JSON.stringify({ type: 'register', senderId: devA.id, payload: { device: devA }, timestamp: Date.now() }));
    wsB.send(JSON.stringify({ type: 'register', senderId: devB.id, payload: { device: devB }, timestamp: Date.now() }));

    // Wait until both discover each other
    await waitForMessage(wsA, 'device-list', (msg) =>
      Array.isArray(msg.payload?.devices) && msg.payload.devices.some((d: Device) => d.id === devB.id)
    );

    // 2. Request and claim 6-digit pairing PIN
    wsA.send(JSON.stringify({ type: 'request-pair-code', senderId: devA.id, timestamp: Date.now() }));
    const pairCodeMsg = await waitForMessage(wsA, 'pair-code-created');
    const pin = pairCodeMsg.payload.code;
    assert.equal(pin.length, 6);

    const pairSuccessA = waitForMessage(wsA, 'pair-success');
    const pairSuccessB = waitForMessage(wsB, 'pair-success');

    wsB.send(JSON.stringify({ type: 'submit-pair-code', senderId: devB.id, payload: { code: pin }, timestamp: Date.now() }));
    const [successA, successB] = await Promise.all([pairSuccessA, pairSuccessB]);

    // 3. Derive AES-256-GCM session keys from shared PIN and dynamic sessionSalt on both sides
    const sessionSalt = successA.payload.sessionSalt;
    assert.equal(sessionSalt, successB.payload.sessionSalt);
    const keyA = await deriveKeyFromSecret(pin, sessionSalt);
    const keyB = await deriveKeyFromSecret(pin, sessionSalt);

    // 4. Create 250KB synthetic payload (simulating an image file)
    const originalData = new Uint8Array(250 * 1024);
    for (let i = 0; i < originalData.length; i++) {
      originalData[i] = (i * 31 + 17) % 256;
    }

    const expectedSha256 = await computeSha256(originalData);
    const rawChunks = createChunks(originalData, DEFAULT_CHUNK_SIZE);
    assert.equal(rawChunks.length, 4); // 64K + 64K + 64K + 58K

    const fileMeta = {
      id: 'photo-1',
      name: 'vacation_photo.jpg',
      size: originalData.length,
      mimeType: 'image/jpeg',
      sha256: expectedSha256,
      totalChunks: rawChunks.length,
      chunkSize: DEFAULT_CHUNK_SIZE,
    };

    // 5. Transfer Init
    const initReceivedPromise = waitForMessage(wsB, 'transfer-init');
    wsA.send(JSON.stringify({
      type: 'transfer-init',
      senderId: devA.id,
      targetId: devB.id,
      payload: { transfer: { id: 'tx-test', fileMeta, senderId: devA.id } },
      timestamp: Date.now(),
    }));
    await initReceivedPromise;

    // 6. Send Encrypted Chunks from A to B via Relay
    const reassembler = new ChunkReassembler(fileMeta);

    const receiveAllChunksPromise = new Promise<void>((resolve, reject) => {
      let received = 0;
      const handler = async (data: any) => {
        try {
          const msg: SignalingMessage = JSON.parse(data.toString());
          if (msg.type === 'relay-chunk') {
            const packet = new Uint8Array(msg.payload.packet);
            const { header, payload } = decodeChunkPacket(packet);

            assert.equal(header.isEncrypted, true);
            assert.ok(header.iv);

            // Decrypt chunk with Key B
            const iv = new Uint8Array(Buffer.from(header.iv!, 'base64'));
            const decryptedChunk = await decryptBytes(payload, iv, keyB);

            const isDone = reassembler.addChunk(header.chunkIndex, decryptedChunk);
            received++;

            if (isDone) {
              wsB.off('message', handler);
              resolve();
            }
          }
        } catch (e) {
          wsB.off('message', handler);
          reject(e);
        }
      };
      wsB.on('message', handler);
    });

    // Device A encrypts and sends chunks
    for (let i = 0; i < rawChunks.length; i++) {
      const { ciphertext, iv } = await encryptBytes(rawChunks[i], keyA);
      const ivBase64 = Buffer.from(iv).toString('base64');

      const packet = encodeChunkPacket(
        {
          transferId: 'tx-test',
          chunkIndex: i,
          totalChunks: rawChunks.length,
          payloadSize: ciphertext.length,
          isEncrypted: true,
          iv: ivBase64,
        },
        ciphertext
      );

      wsA.send(JSON.stringify({
        type: 'relay-chunk',
        senderId: devA.id,
        targetId: devB.id,
        payload: { packet: Array.from(packet) },
        timestamp: Date.now(),
      }));
    }

    await receiveAllChunksPromise;

    // 7. Verify Integrity on Receiver
    assert.equal(reassembler.isComplete(), true);
    const reassembledBuffer = reassembler.getReassembledBuffer();
    const reassembledBytes = new Uint8Array(reassembledBuffer);

    assert.equal(reassembledBytes.length, originalData.length);
    assert.deepEqual(reassembledBytes, originalData);

    const isSha256Valid = await verifySha256(reassembledBuffer, expectedSha256);
    assert.equal(isSha256Valid, true);

    wsA.close();
    wsB.close();
  });
});
