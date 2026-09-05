import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChunks,
  encodeChunkPacket,
  decodeChunkPacket,
  ChunkReassembler,
  DEFAULT_CHUNK_SIZE,
} from '../src/chunker.js';
import { computeSha256, verifySha256 } from '../src/hash.js';
import {
  deriveKeyFromSecret,
  encryptBytes,
  decryptBytes,
  bytesToBase64,
  base64ToBytes,
} from '../src/crypto.js';
import {
  generatePairingPin,
  cleanPairingPin,
  isValidPairingPin,
  formatPairingPin,
  createQrData,
  parseQrData,
} from '../src/pairing.js';
import { Device, FileMeta } from '../src/types.js';

describe('Shared Package - Mr. Perfect Verification Suite', () => {

  describe('1. Chunker & Packet Protocol', () => {
    test('Happy Path: splits 150KB payload into 64KB chunks and encodes/decodes packets', () => {
      const data = new Uint8Array(150 * 1024);
      for (let i = 0; i < data.length; i++) data[i] = i % 256;

      const chunks = createChunks(data, DEFAULT_CHUNK_SIZE);
      assert.equal(chunks.length, 3); // 64KB + 64KB + 22KB
      assert.equal(chunks[0].length, 64 * 1024);
      assert.equal(chunks[1].length, 64 * 1024);
      assert.equal(chunks[2].length, 22 * 1024);

      // Packet encoding & decoding
      const header = {
        transferId: 'tx-123',
        chunkIndex: 0,
        totalChunks: 3,
        payloadSize: chunks[0].length,
        isEncrypted: false,
      };
      const packet = encodeChunkPacket(header, chunks[0]);
      const decoded = decodeChunkPacket(packet);

      assert.deepEqual(decoded.header, header);
      assert.deepEqual(decoded.payload, chunks[0]);
    });

    test('Edge Case: empty (0-byte) and single-byte buffers', () => {
      const empty = new Uint8Array(0);
      const emptyChunks = createChunks(empty);
      assert.equal(emptyChunks.length, 1);
      assert.equal(emptyChunks[0].length, 0);

      const singleByte = new Uint8Array([42]);
      const singleChunks = createChunks(singleByte);
      assert.equal(singleChunks.length, 1);
      assert.equal(singleChunks[0][0], 42);
    });

    test('Edge Case: exact boundary (64KB exactly)', () => {
      const exact = new Uint8Array(DEFAULT_CHUNK_SIZE);
      const chunks = createChunks(exact);
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].length, DEFAULT_CHUNK_SIZE);
    });

    test('Sad Path: corrupted packet with invalid magic bytes throws error', () => {
      const packet = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      assert.throws(() => decodeChunkPacket(packet), /magic bytes mismatch/);
    });

    test('Sad Path: packet too short throws error', () => {
      const packet = new Uint8Array([0x44, 0x52]);
      assert.throws(() => decodeChunkPacket(packet), /Packet too short/);
    });

    test('Rare Case: out-of-order chunks reassembly and duplicate chunks handling', () => {
      const rawText = 'AirDrop-style cross-platform peer-to-peer file transfer engine!';
      const data = new TextEncoder().encode(rawText);
      const chunks = createChunks(data, 10); // split into 10-byte chunks

      const fileMeta: FileMeta = {
        id: 'file-1',
        name: 'test.txt',
        size: data.length,
        mimeType: 'text/plain',
        sha256: 'placeholder',
        totalChunks: chunks.length,
        chunkSize: 10,
      };

      const reassembler = new ChunkReassembler(fileMeta);

      // Feed chunks in reverse order with duplicate on chunk 0
      for (let i = chunks.length - 1; i >= 0; i--) {
        reassembler.addChunk(i, chunks[i]);
      }
      // Duplicate chunk
      reassembler.addChunk(0, chunks[0]);

      assert.equal(reassembler.isComplete(), true);
      assert.equal(reassembler.getProgress().percent, 100);

      const reassembledBuffer = reassembler.getReassembledBuffer();
      const reassembledText = new TextDecoder().decode(reassembledBuffer);
      assert.equal(reassembledText, rawText);
    });
  });

  describe('2. SHA-256 Integrity Verification', () => {
    test('Happy Path: computes correct known SHA-256 hash', async () => {
      const text = new TextEncoder().encode('hello world');
      // Known sha256 for "hello world" is b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
      const hash = await computeSha256(text);
      assert.equal(hash, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
      assert.equal(await verifySha256(text, hash), true);
    });

    test('Sad Path: tampered payload fails SHA-256 verification', async () => {
      const text = new TextEncoder().encode('original content');
      const hash = await computeSha256(text);

      const tampered = new TextEncoder().encode('tampered content');
      assert.equal(await verifySha256(tampered, hash), false);
    });
  });

  describe('3. WebCrypto AES-256-GCM E2EE', () => {
    test('Happy Path: encrypts and decrypts payload with PBKDF2 derived key', async () => {
      const pin = '784-219';
      const key = await deriveKeyFromSecret(pin);
      const message = new TextEncoder().encode('Confidential file data transferring over network');

      const { ciphertext, iv } = await encryptBytes(message, key);
      assert.notDeepEqual(ciphertext, message);
      assert.equal(iv.length, 12);

      const decrypted = await decryptBytes(ciphertext, iv, key);
      assert.deepEqual(decrypted, message);
    });

    test('Sad Path: decryption fails with wrong key / PIN', async () => {
      const keyA = await deriveKeyFromSecret('111-222');
      const keyB = await deriveKeyFromSecret('333-444');
      const message = new TextEncoder().encode('Secret message');

      const { ciphertext, iv } = await encryptBytes(message, keyA);

      await assert.rejects(async () => {
        await decryptBytes(ciphertext, iv, keyB);
      });
    });

    test('Sad Path: decryption fails if ciphertext is tampered (AES-GCM auth tag check)', async () => {
      const key = await deriveKeyFromSecret('555-666');
      const message = new TextEncoder().encode('Protected data');
      const { ciphertext, iv } = await encryptBytes(message, key);

      // Tamper with a single byte in ciphertext
      ciphertext[0] ^= 0xff;

      await assert.rejects(async () => {
        await decryptBytes(ciphertext, iv, key);
      });
    });
  });

  describe('4. Pairing & QR Logic', () => {
    test('Happy Path: generates valid 6-digit PIN and formats properly', () => {
      const pin = generatePairingPin();
      assert.match(pin, /^[0-9]{3}-[0-9]{3}$/);
      assert.equal(isValidPairingPin(pin), true);
      assert.equal(cleanPairingPin(pin).length, 6);
      assert.equal(formatPairingPin('123456'), '123-456');
    });

    test('Edge & Rare Case: handles messy inputs with spaces and extra characters', () => {
      assert.equal(cleanPairingPin(' 7 8 9 - 4 5 6 '), '789456');
      assert.equal(isValidPairingPin(' 7 8 9 - 4 5 6 '), true);
      assert.equal(isValidPairingPin('12345'), false); // too short
      assert.equal(isValidPairingPin('1234567'), false); // too long
    });

    test('Happy Path: encodes and parses QR code payload', () => {
      const device: Device = {
        id: 'dev-windows-laptop',
        name: "Tamil's PC",
        platform: 'windows',
        lastSeen: Date.now(),
      };
      const pin = '492-184';
      const qrData = createQrData(device, pin, 'ws://192.168.1.50:3001/ws');

      const parsed = parseQrData(qrData);
      assert.notEqual(parsed, null);
      assert.equal(parsed?.deviceId, device.id);
      assert.equal(parsed?.name, device.name);
      assert.equal(parsed?.platform, 'windows');
      assert.equal(parsed?.code, '492184');
      assert.equal(parsed?.serverUrl, 'ws://192.168.1.50:3001/ws');
    });

    test('Sad Path: rejects malformed QR payloads', () => {
      assert.equal(parseQrData('https://google.com'), null);
      assert.equal(parseQrData('pickup://invalid-json-data'), null);
      assert.equal(parseQrData('dropflow://invalid-json-data'), null);
    });
  });
});
