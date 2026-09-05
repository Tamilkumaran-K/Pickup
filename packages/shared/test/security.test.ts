import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeFileName,
  isDangerousFileType,
  generateSecureToken,
} from '../src/sanitization.js';
import {
  generatePairingPin,
  isValidPairingPin,
  cleanPairingPin,
} from '../src/pairing.js';
import {
  deriveKeyFromSecret,
  computeKeyFingerprint,
  generateSessionSalt,
} from '../src/crypto.js';

describe('Shared Package - Security Hardening Suite', () => {

  describe('1. File Name Sanitization & Path Traversal Prevention', () => {
    test('Happy Path: preserves safe filenames', () => {
      assert.equal(sanitizeFileName('vacation_photo.jpg'), 'vacation_photo.jpg');
      assert.equal(sanitizeFileName('Quarterly Report 2026.pdf'), 'Quarterly Report 2026.pdf');
      assert.equal(sanitizeFileName('archive-v1.0.tar.gz'), 'archive-v1.0.tar.gz');
    });

    test('Path Traversal: strips directory traversal and separator sequences', () => {
      assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd');
      assert.equal(sanitizeFileName('..\\..\\Windows\\System32\\cmd.exe'), 'cmd.exe');
      assert.equal(sanitizeFileName('/var/log/../../../secret.txt'), 'secret.txt');
      assert.equal(sanitizeFileName('..\\..\\foo\\bar.jpg'), 'bar.jpg');
      assert.equal(sanitizeFileName('....//....//hidden.png'), 'hidden.png');
    });

    test('Null Bytes & Control Characters: removes 0x00 and control codes', () => {
      assert.equal(sanitizeFileName('malicious\0file.pdf'), 'maliciousfile.pdf');
      assert.equal(sanitizeFileName('test\x01\x1F\x7Fname.txt'), 'testname.txt');
    });

    test('Windows Reserved Names: neutralizes CON, PRN, AUX, NUL, COM1-9, LPT1-9', () => {
      assert.equal(sanitizeFileName('CON'), 'safe_CON');
      assert.equal(sanitizeFileName('con.txt'), 'safe_con.txt');
      assert.equal(sanitizeFileName('PRN.dat'), 'safe_PRN.dat');
      assert.equal(sanitizeFileName('aux.png'), 'safe_aux.png');
      assert.equal(sanitizeFileName('NUL'), 'safe_NUL');
      assert.equal(sanitizeFileName('com1.exe'), 'safe_com1.exe');
      assert.equal(sanitizeFileName('lpt5.log'), 'safe_lpt5.log');
    });

    test('Edge Case: trims trailing spaces and dots that break Windows filesystems', () => {
      assert.equal(sanitizeFileName('document.pdf. . .'), 'document.pdf');
      assert.equal(sanitizeFileName('invoice.txt   '), 'invoice.txt');
    });

    test('Edge Case: handles empty, undefined, or all-traversal strings gracefully', () => {
      assert.equal(sanitizeFileName(''), 'downloaded_file');
      assert.equal(sanitizeFileName('...'), 'downloaded_file');
      assert.equal(sanitizeFileName('../../../'), 'downloaded_file');
      assert.equal(sanitizeFileName(null as any), 'downloaded_file');
      assert.equal(sanitizeFileName('    '), 'downloaded_file');
    });

    test('Boundary: truncates excessively long filenames while retaining extension', () => {
      const longBase = 'a'.repeat(300);
      const longName = `${longBase}.pdf`;
      const sanitized = sanitizeFileName(longName);
      assert.ok(sanitized.length <= 255);
      assert.ok(sanitized.endsWith('.pdf'));
    });
  });

  describe('2. Dangerous File Type Detection', () => {
    test('Flags dangerous executable and script extensions', () => {
      assert.equal(isDangerousFileType('setup.exe'), true);
      assert.equal(isDangerousFileType('script.bat'), true);
      assert.equal(isDangerousFileType('install.cmd'), true);
      assert.equal(isDangerousFileType('automate.ps1'), true);
      assert.equal(isDangerousFileType('macro.vbs'), true);
      assert.equal(isDangerousFileType('package.msi'), true);
      assert.equal(isDangerousFileType('screensaver.scr'), true);
      assert.equal(isDangerousFileType('helper.sh'), true);
      assert.equal(isDangerousFileType('app.apk'), true);
    });

    test('Detects double extension obfuscation attacks', () => {
      assert.equal(isDangerousFileType('urgent_invoice.pdf.exe'), true);
      assert.equal(isDangerousFileType('statement.xlsx.vbs'), true);
      assert.equal(isDangerousFileType('document.docx.ps1'), true);
    });

    test('Permits standard media and document files', () => {
      assert.equal(isDangerousFileType('photo.jpg'), false);
      assert.equal(isDangerousFileType('video.mp4'), false);
      assert.equal(isDangerousFileType('presentation.pptx'), false);
      assert.equal(isDangerousFileType('data.csv'), false);
      assert.equal(isDangerousFileType('archive.zip'), false);
      assert.equal(isDangerousFileType('README.md'), false);
    });
  });

  describe('3. Cryptographically Secure Pairing PIN & Tokens', () => {
    test('PIN generator creates uniformly formatted 6-digit PINs', () => {
      for (let i = 0; i < 50; i++) {
        const pin = generatePairingPin();
        assert.match(pin, /^[0-9]{3}-[0-9]{3}$/);
        assert.equal(isValidPairingPin(pin), true);
        const digits = parseInt(cleanPairingPin(pin), 10);
        assert.ok(digits >= 100000 && digits <= 999999);
      }
    });

    test('Token and salt generators output high-entropy hex strings', () => {
      const token1 = generateSecureToken(16);
      const token2 = generateSecureToken(16);
      assert.equal(token1.length, 32);
      assert.equal(token2.length, 32);
      assert.notEqual(token1, token2);

      const salt = generateSessionSalt(32);
      assert.equal(salt.length, 64);
    });
  });

  describe('4. E2EE Key Fingerprinting', () => {
    test('Derives key and calculates human-readable matching fingerprint', async () => {
      const pin = '482-910';
      const salt = 'abcdef0123456789abcdef0123456789';

      const keyA = await deriveKeyFromSecret(pin, salt);
      const keyB = await deriveKeyFromSecret(pin, salt);

      const fingerprintA = await computeKeyFingerprint(keyA);
      const fingerprintB = await computeKeyFingerprint(keyB);

      // Same PIN and salt derive same key and matching fingerprint
      assert.equal(fingerprintA, fingerprintB);
      assert.match(fingerprintA, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);

      // Different PIN derives different key and fingerprint
      const keyC = await deriveKeyFromSecret('999-000', salt);
      const fingerprintC = await computeKeyFingerprint(keyC);
      assert.notEqual(fingerprintA, fingerprintC);
    });
  });
});
