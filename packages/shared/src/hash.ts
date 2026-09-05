/**
 * Computes the SHA-256 hash of an ArrayBuffer or Uint8Array.
 * Returns a hex-encoded string (e.g. "a3f5...").
 * Compatible with WebCrypto (Browser & Node.js 18+).
 */
export async function computeSha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates whether an ArrayBuffer matches the expected SHA-256 checksum.
 */
export async function verifySha256(data: ArrayBuffer | Uint8Array, expectedHex: string): Promise<boolean> {
  const actualHex = await computeSha256(data);
  return actualHex.toLowerCase() === expectedHex.toLowerCase();
}
