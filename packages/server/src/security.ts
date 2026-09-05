import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

/**
 * Constant-time string equality check to prevent timing attacks on sensitive secrets/PINs.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Compare dummy buffer to preserve constant-time execution
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Security headers middleware enforcing OWASP and production best practices.
 */
export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Remove identification header
    res.removeHeader('X-Powered-By');

    // Prevent MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent framing / clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Legacy XSS protection for older browsers
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Feature policy / Permissions policy
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: blob:; " +
      "connect-src 'self' ws: wss: http: https:; " +
      "object-src 'none'; " +
      "frame-ancestors 'none';"
    );

    // Strict Transport Security (HSTS) if connection is secure or forwarded from SSL reverse proxy
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

/**
 * In-memory sliding-window rate limiter for HTTP endpoints.
 */
export class MemoryRateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private windowMs: number;
  private max: number;
  private cleanupTimer: NodeJS.Timeout;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;

    // Periodic sweep every minute to prevent memory bloat
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  isRateLimited(key: string): { limited: boolean; remaining: number; retryAfterSec: number } {
    const now = Date.now();
    const record = this.records.get(key);

    if (!record || now > record.resetTime) {
      this.records.set(key, { count: 1, resetTime: now + this.windowMs });
      return { limited: false, remaining: this.max - 1, retryAfterSec: 0 };
    }

    record.count++;
    if (record.count > this.max) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      return { limited: true, remaining: 0, retryAfterSec };
    }

    return { limited: false, remaining: this.max - record.count, retryAfterSec: 0 };
  }

  reset(key: string): void {
    this.records.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now > record.resetTime) {
        this.records.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.records.clear();
  }

  middleware(message = 'Too many requests, please try again later.', keyGen?: (req: Request) => string) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const forwardedFor = req.headers['x-forwarded-for'];
      const ip = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) ||
                 req.socket.remoteAddress ||
                 '127.0.0.1';
      const key = keyGen ? keyGen(req) : ip;

      const { limited, remaining, retryAfterSec } = this.isRateLimited(key);
      res.setHeader('X-RateLimit-Limit', this.max.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());

      if (limited) {
        res.setHeader('Retry-After', retryAfterSec.toString());
        res.status(429).json({
          error: message,
          retryAfterSeconds: retryAfterSec,
        });
        return;
      }

      next();
    };
  }
}
