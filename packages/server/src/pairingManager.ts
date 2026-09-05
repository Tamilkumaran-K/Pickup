import { Device } from '@dropflow/shared';
import { constantTimeCompare } from './security.js';

interface ActiveCodeEntry {
  code: string; // 6 clean digits
  device: Device;
  expiresAt: number;
}

interface AttemptRecord {
  failedAttempts: number;
  lockedUntil: number;
  lastAttemptAt: number;
}

export interface ClaimResult {
  success: boolean;
  hostDevice?: Device;
  joiningDevice?: Device;
  error?: string;
  lockedOut?: boolean;
  retryAfterSec?: number;
}

export class PairingManager {
  private codes = new Map<string, ActiveCodeEntry>();
  private attempts = new Map<string, AttemptRecord>();
  private defaultTtlMs: number;
  private maxFailedAttempts: number;
  private lockoutDurationMs: number;

  constructor(
    defaultTtlMs = 5 * 60 * 1000, // 5 minutes code validity
    maxFailedAttempts = 5,        // Lock out after 5 consecutive failures
    lockoutDurationMs = 5 * 60 * 1000 // 5 minutes lockout duration
  ) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxFailedAttempts = maxFailedAttempts;
    this.lockoutDurationMs = lockoutDurationMs;
  }

  /**
   * Registers a 6-digit PIN code for a host device.
   */
  registerCode(device: Device, rawCode: string, ttlMs?: number): { code: string; expiresAt: number } {
    const cleanCode = rawCode.replace(/[^0-9]/g, '');
    const expiresAt = Date.now() + (ttlMs || this.defaultTtlMs);

    // Remove any previous code registered for this device
    for (const [key, entry] of this.codes.entries()) {
      if (entry.device.id === device.id) {
        this.codes.delete(key);
      }
    }

    this.codes.set(cleanCode, {
      code: cleanCode,
      device,
      expiresAt,
    });

    return { code: cleanCode, expiresAt };
  }

  /**
   * Looks up an active code without recording a failure attempt.
   */
  getCode(rawCode: string): ActiveCodeEntry | null {
    const cleanCode = rawCode.replace(/[^0-9]/g, '');
    const entry = this.codes.get(cleanCode);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.codes.delete(cleanCode);
      return null;
    }

    return entry;
  }

  /**
   * Claims a pairing code when a second peer submits it,
   * enforcing brute-force protection and lockout penalties.
   */
  claimCode(rawCode: string, joiningDevice: Device, clientKey?: string): ClaimResult {
    const identityKey = clientKey || joiningDevice.id;
    const now = Date.now();

    // 1. Check if device/IP is currently locked out
    const attemptRecord = this.attempts.get(identityKey);
    if (attemptRecord && attemptRecord.lockedUntil > now) {
      const retryAfterSec = Math.ceil((attemptRecord.lockedUntil - now) / 1000);
      return {
        success: false,
        lockedOut: true,
        retryAfterSec,
        error: `Too many failed pairing attempts. Locked out for ${retryAfterSec} more seconds.`,
      };
    }

    const cleanCode = rawCode.replace(/[^0-9]/g, '');

    // 2. Search for matching active code using constant-time comparison
    let matchedEntry: ActiveCodeEntry | null = null;
    for (const [storedCode, entry] of this.codes.entries()) {
      if (now <= entry.expiresAt && constantTimeCompare(storedCode, cleanCode)) {
        matchedEntry = entry;
        break;
      }
    }

    // 3. Handle invalid or expired code (record failure)
    if (!matchedEntry) {
      const current = attemptRecord || { failedAttempts: 0, lockedUntil: 0, lastAttemptAt: now };
      current.failedAttempts++;
      current.lastAttemptAt = now;

      if (current.failedAttempts >= this.maxFailedAttempts) {
        current.lockedUntil = now + this.lockoutDurationMs;
        const retryAfterSec = Math.ceil(this.lockoutDurationMs / 1000);
        this.attempts.set(identityKey, current);
        return {
          success: false,
          lockedOut: true,
          retryAfterSec,
          error: `Too many failed pairing attempts. Locked out for ${retryAfterSec} seconds.`,
        };
      }

      this.attempts.set(identityKey, current);
      const remainingAttempts = this.maxFailedAttempts - current.failedAttempts;
      return {
        success: false,
        lockedOut: false,
        error: `Invalid or expired pairing code. ${remainingAttempts} attempts remaining.`,
      };
    }

    // 4. Prevent self-pairing
    if (matchedEntry.device.id === joiningDevice.id) {
      return {
        success: false,
        error: 'Cannot pair a device with itself.',
      };
    }

    // 5. Successful claim: one-time consumption and reset failure count
    const hostDevice = matchedEntry.device;
    this.codes.delete(matchedEntry.code);
    this.attempts.delete(identityKey);

    return {
      success: true,
      hostDevice,
      joiningDevice,
    };
  }

  /**
   * Resets the lockout status for a given identifier (e.g. for administrative or testing purposes).
   */
  resetAttempts(identityKey: string): void {
    this.attempts.delete(identityKey);
  }

  /**
   * Cleans up expired codes and obsolete attempt records.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [code, entry] of this.codes.entries()) {
      if (now > entry.expiresAt) {
        this.codes.delete(code);
      }
    }

    for (const [key, record] of this.attempts.entries()) {
      // If lock has passed and no attempts in the last 15 minutes, remove
      if (now > record.lockedUntil && now - record.lastAttemptAt > 15 * 60 * 1000) {
        this.attempts.delete(key);
      }
    }
  }
}
