/**
 * End-to-End Encryption utilities using WebCrypto (AES-256-GCM + PBKDF2).
 * Works across Browser, Node.js (v18+), and React Native / Expo.
 */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from a shared PIN/secret and salt using PBKDF2.
 */
export async function deriveKeyFromSecret(
  secret: string,
  saltHex = '66696c6564726f702d73616c74' // 'filedrop-salt'
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const secretKeyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const saltBytes = hexToBytes(saltHex);

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    secretKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a random 256-bit AES-GCM CryptoKey.
 */
export async function generateRandomKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a byte array using AES-GCM with a fresh random 12-byte IV.
 */
export async function encryptBytes(
  plaintext: Uint8Array,
  key: CryptoKey
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);

  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as ArrayBuffer,
    },
    key,
    plaintext as unknown as ArrayBuffer
  );

  return {
    ciphertext: new Uint8Array(ciphertextBuffer),
    iv,
  };
}

/**
 * Decrypts an AES-GCM ciphertext byte array using the provided IV and CryptoKey.
 */
export async function decryptBytes(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as ArrayBuffer,
    },
    key,
    ciphertext as unknown as ArrayBuffer
  );

  return new Uint8Array(decryptedBuffer);
}

/**
 * Computes a human-verifiable security fingerprint for an active CryptoKey
 * (formatted as 4 uppercase 4-character hex blocks, e.g. "A1B2-C3D4-E5F6-0123").
 */
export async function computeKeyFingerprint(key: CryptoKey): Promise<string> {
  const rawKey = await globalThis.crypto.subtle.exportKey('raw', key);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', rawKey);
  const hex = bytesToHex(new Uint8Array(hashBuffer));
  const p1 = hex.slice(0, 4);
  const p2 = hex.slice(4, 8);
  const p3 = hex.slice(8, 12);
  const p4 = hex.slice(12, 16);
  return `${p1}-${p2}-${p3}-${p4}`.toUpperCase();
}

/**
 * Generates a cryptographically random session salt in hex format.
 */
export function generateSessionSalt(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
