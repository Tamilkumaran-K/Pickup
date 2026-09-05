/**
 * Security and sanitization utilities for file names, paths, and cryptographic tokens.
 */

// Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

// Dangerous file extensions that could execute code if accidentally opened
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse',
  'wsf', 'wsh', 'msc', 'msi', 'msp', 'com', 'scr', 'hta', 'cpl',
  'jar', 'pif', 'reg', 'sh', 'bash', 'bin', 'app', 'dmg', 'pkg',
  'deb', 'rpm', 'gadget', 'apk'
]);

/**
 * Sanitizes an incoming file name to prevent directory traversal attacks,
 * null byte injections, filesystem namespace corruption, and invalid characters.
 */
export function sanitizeFileName(name: string, fallback = 'downloaded_file'): string {
  if (!name || typeof name !== 'string') {
    return fallback;
  }

  // 1. Normalize unicode
  let clean = name.normalize('NFC');

  // 2. Strip null bytes and control characters (0x00-0x1F and 0x7F)
  clean = clean.replace(/[\x00-\x1F\x7F]/g, '');

  // 3. Remove leading/trailing directory traversal elements and normalize slashes
  // Replace backslashes with forward slashes for unified parsing
  clean = clean.replace(/\\/g, '/');

  // Strip path segments - we only want the leaf file name
  const segments = clean.split('/');
  clean = segments[segments.length - 1] || '';

  // 4. Strip relative traversal markers e.g. .. or .
  clean = clean.replace(/^\.+/, '');

  // 5. Remove characters illegal on Windows/POSIX: < > : " / \ | ? *
  clean = clean.replace(/[<>:"/\\|?*]/g, '_');

  // 6. Trim trailing spaces and dots (invalid on Windows filesystems)
  clean = clean.replace(/[\s.]+$/, '').trim();

  // 7. Check if empty after cleaning
  if (!clean || clean === '.' || clean === '..') {
    return fallback;
  }

  // 8. Prevent Windows reserved file names (e.g. CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  if (WINDOWS_RESERVED_NAMES.test(clean)) {
    clean = `safe_${clean}`;
  }

  // 9. Enforce maximum file name length (255 chars), preserving extension if present
  const MAX_FILENAME_LENGTH = 255;
  if (clean.length > MAX_FILENAME_LENGTH) {
    const lastDot = clean.lastIndexOf('.');
    if (lastDot > 0 && clean.length - lastDot < 16) {
      const ext = clean.slice(lastDot);
      const stem = clean.slice(0, MAX_FILENAME_LENGTH - ext.length);
      clean = `${stem}${ext}`;
    } else {
      clean = clean.slice(0, MAX_FILENAME_LENGTH);
    }
  }

  return clean || fallback;
}

/**
 * Checks if a file name has an extension commonly associated with executable/dangerous code.
 */
export function isDangerousFileType(name: string): boolean {
  if (!name || typeof name !== 'string') return false;

  const sanitized = sanitizeFileName(name);
  const parts = sanitized.toLowerCase().split('.');
  if (parts.length < 2) return false;

  // Check the last extension
  const lastExt = parts[parts.length - 1];
  if (DANGEROUS_EXTENSIONS.has(lastExt)) {
    return true;
  }

  // Check double extensions (e.g., evil.exe.txt or invoice.pdf.js)
  for (let i = 1; i < parts.length; i++) {
    if (DANGEROUS_EXTENSIONS.has(parts[i])) {
      return true;
    }
  }

  return false;
}

/**
 * Generates a cryptographically secure random hexadecimal string (e.g. for session salts or tokens).
 */
export function generateSecureToken(byteLength = 16): string {
  const buffer = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
