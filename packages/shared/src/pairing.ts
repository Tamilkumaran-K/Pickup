import { Device, DevicePlatform } from './types.js';

export interface QrPairingPayload {
  v: number; // version 1
  deviceId: string;
  name: string;
  platform: DevicePlatform;
  code: string;
  serverUrl?: string;
}

/**
 * Generates a human-friendly 6-digit pairing PIN code (e.g. "481-925")
 * using cryptographically secure random values with rejection sampling.
 */
export function generatePairingPin(): string {
  const range = 900000;
  const maxValid = Math.floor(4294967296 / range) * range;
  const buffer = new Uint32Array(1);

  let randomVal: number;
  do {
    globalThis.crypto.getRandomValues(buffer);
    randomVal = buffer[0];
  } while (randomVal >= maxValid);

  const num = 100000 + (randomVal % range);
  const str = num.toString();
  return `${str.slice(0, 3)}-${str.slice(3)}`;
}

/**
 * Cleans a user-entered PIN by removing spaces, hyphens, and non-digits.
 */
export function cleanPairingPin(input: string): string {
  return input.replace(/[^0-9]/g, '');
}

/**
 * Validates whether a PIN string represents a valid 6-digit code.
 */
export function isValidPairingPin(input: string): boolean {
  return cleanPairingPin(input).length === 6;
}

/**
 * Formats a clean 6-digit string into the standard "123-456" display format.
 */
export function formatPairingPin(cleanDigits: string): string {
  const d = cleanPairingPin(cleanDigits);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}`;
}

/**
 * Encodes pairing details into a compact QR payload URI string (e.g. "dropflow:v1:...").
 */
export function createQrData(
  device: Device,
  pin: string,
  serverUrl?: string
): string {
  const payload: QrPairingPayload = {
    v: 1,
    deviceId: device.id,
    name: device.name,
    platform: device.platform,
    code: cleanPairingPin(pin),
    serverUrl,
  };
  return `dropflow://${encodeURIComponent(JSON.stringify(payload))}`;
}

/**
 * Parses and verifies a QR payload string.
 */
export function parseQrData(qrString: string): QrPairingPayload | null {
  try {
    if (!qrString.startsWith('dropflow://')) {
      return null;
    }
    const jsonStr = decodeURIComponent(qrString.slice('dropflow://'.length));
    const parsed = JSON.parse(jsonStr);
    if (parsed.v === 1 && parsed.deviceId && parsed.code) {
      return parsed as QrPairingPayload;
    }
    return null;
  } catch {
    return null;
  }
}
