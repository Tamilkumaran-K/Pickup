import { ChunkHeader, FileMeta } from './types.js';

export const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KB
const MAGIC_BYTES = new Uint8Array([0x44, 0x52, 0x4f, 0x50]); // 'DROP'

/**
 * Splits an ArrayBuffer or Uint8Array into an array of chunk Uint8Arrays.
 */
export function createChunks(
  data: ArrayBuffer | Uint8Array,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Uint8Array[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length === 0) {
    return [new Uint8Array(0)];
  }

  const chunks: Uint8Array[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const end = Math.min(offset + chunkSize, bytes.length);
    chunks.push(bytes.subarray(offset, end));
    offset = end;
  }

  return chunks;
}

/**
 * Encodes a chunk header and binary payload into a single binary packet:
 * [4-byte MAGIC][4-byte Header Length (Big-Endian)][JSON Header UTF-8][Binary Payload]
 */
export function encodeChunkPacket(
  header: ChunkHeader,
  chunkPayload: Uint8Array
): Uint8Array {
  const headerJson = JSON.stringify(header);
  const headerBytes = new TextEncoder().encode(headerJson);
  const totalLength = 8 + headerBytes.length + chunkPayload.length;
  const packet = new Uint8Array(totalLength);

  // Magic bytes
  packet.set(MAGIC_BYTES, 0);

  // Header length as 32-bit big-endian
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  view.setUint32(4, headerBytes.length, false);

  // Header content
  packet.set(headerBytes, 8);

  // Payload
  packet.set(chunkPayload, 8 + headerBytes.length);

  return packet;
}

/**
 * Decodes a binary packet into its ChunkHeader and raw chunk payload.
 */
export function decodeChunkPacket(packet: Uint8Array): {
  header: ChunkHeader;
  payload: Uint8Array;
} {
  if (packet.length < 8) {
    throw new Error(`Packet too short (${packet.length} bytes, minimum 8 required)`);
  }

  // Check magic bytes
  if (
    packet[0] !== MAGIC_BYTES[0] ||
    packet[1] !== MAGIC_BYTES[1] ||
    packet[2] !== MAGIC_BYTES[2] ||
    packet[3] !== MAGIC_BYTES[3]
  ) {
    throw new Error('Invalid packet: magic bytes mismatch');
  }

  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const headerLength = view.getUint32(4, false);

  if (packet.length < 8 + headerLength) {
    throw new Error(
      `Packet truncated: expected header length ${headerLength}, but total length is ${packet.length}`
    );
  }

  const headerBytes = packet.subarray(8, 8 + headerLength);
  const headerJson = new TextDecoder().decode(headerBytes);
  const header: ChunkHeader = JSON.parse(headerJson);

  const payload = packet.subarray(8 + headerLength);
  return { header, payload };
}

/**
 * Manages out-of-order chunk reassembly and progress tracking.
 */
export class ChunkReassembler {
  private chunks = new Map<number, Uint8Array>();
  private receivedBytes = 0;
  readonly fileMeta: FileMeta;

  constructor(fileMeta: FileMeta) {
    this.fileMeta = fileMeta;
  }

  /**
   * Adds a received chunk. Returns true if all chunks have been received.
   */
  addChunk(chunkIndex: number, data: Uint8Array): boolean {
    if (chunkIndex < 0 || chunkIndex >= this.fileMeta.totalChunks) {
      throw new Error(
        `Chunk index ${chunkIndex} out of bounds (totalChunks: ${this.fileMeta.totalChunks})`
      );
    }

    if (!this.chunks.has(chunkIndex)) {
      this.chunks.set(chunkIndex, data);
      this.receivedBytes += data.length;
    }

    return this.isComplete();
  }

  hasChunk(chunkIndex: number): boolean {
    return this.chunks.has(chunkIndex);
  }

  isComplete(): boolean {
    return this.chunks.size === this.fileMeta.totalChunks;
  }

  getProgress() {
    const receivedChunks = this.chunks.size;
    const totalChunks = this.fileMeta.totalChunks;
    const percent = totalChunks === 0 ? 100 : Math.min(100, Math.round((receivedChunks / totalChunks) * 100));
    return {
      receivedChunks,
      totalChunks,
      receivedBytes: this.receivedBytes,
      totalBytes: this.fileMeta.size,
      percent,
    };
  }

  /**
   * Concatenates all chunks in sequence into a single ArrayBuffer.
   */
  getReassembledBuffer(): ArrayBuffer {
    if (!this.isComplete()) {
      throw new Error(
        `Cannot reassemble: missing chunks (${this.chunks.size}/${this.fileMeta.totalChunks} received)`
      );
    }

    if (this.fileMeta.size === 0) {
      return new ArrayBuffer(0);
    }

    const result = new Uint8Array(this.receivedBytes);
    let offset = 0;

    for (let i = 0; i < this.fileMeta.totalChunks; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) {
        throw new Error(`Missing chunk at index ${i} during reassembly`);
      }
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }
}
