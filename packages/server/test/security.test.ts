import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { WebSocket } from 'ws';
import { createApp } from '../src/index.js';
import { PairingManager } from '../src/pairingManager.js';
import { constantTimeCompare, MemoryRateLimiter } from '../src/security.js';
import { Device, SignalingMessage } from '@dropflow/shared';

describe('Server Package - Security Hardening Suite', () => {
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    serverApp.cleanup();
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
    timeoutMs = 3000
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

  describe('1. Anti-Brute-Force & PIN Lockout Protection', () => {
    test('Lockout after 5 failed PIN attempts', () => {
      // 5 failed attempts limit, 60s lockout for test
      const manager = new PairingManager(5 * 60 * 1000, 5, 60 * 1000);
      const hostDevice: Device = { id: 'host-1', name: 'Host PC', platform: 'windows', lastSeen: Date.now() };
      const joinerDevice: Device = { id: 'joiner-1', name: 'Joiner Phone', platform: 'android', lastSeen: Date.now() };

      manager.registerCode(hostDevice, '555111');

      // Attempts 1 to 4 should fail without lockout
      for (let i = 1; i <= 4; i++) {
        const res = manager.claimCode('000000', joinerDevice);
        assert.equal(res.success, false);
        assert.equal(res.lockedOut, false);
        assert.ok(res.error?.includes(`${5 - i} attempts remaining`));
      }

      // 5th attempt triggers lockout
      const fifthAttempt = manager.claimCode('000000', joinerDevice);
      assert.equal(fifthAttempt.success, false);
      assert.equal(fifthAttempt.lockedOut, true);
      assert.ok((fifthAttempt.retryAfterSec || 0) > 0);
      assert.ok(fifthAttempt.error?.includes('Locked out'));

      // 6th attempt with CORRECT code must still be blocked due to active lockout!
      const blockedAttempt = manager.claimCode('555111', joinerDevice);
      assert.equal(blockedAttempt.success, false);
      assert.equal(blockedAttempt.lockedOut, true);
      assert.ok(blockedAttempt.error?.includes('Too many failed pairing attempts'));

      // Reset attempts allows successful claim
      manager.resetAttempts(joinerDevice.id);
      const successfulClaim = manager.claimCode('555111', joinerDevice);
      assert.equal(successfulClaim.success, true);
      assert.equal(successfulClaim.hostDevice?.id, hostDevice.id);
    });

    test('Prevents device from pairing with itself', () => {
      const manager = new PairingManager();
      const device: Device = { id: 'self-dev', name: 'Self Device', platform: 'macos', lastSeen: Date.now() };

      manager.registerCode(device, '987654');
      const result = manager.claimCode('987654', device);
      assert.equal(result.success, false);
      assert.match(result.error || '', /Cannot pair a device with itself/);
    });
  });

  describe('2. Constant-Time Comparison Utility', () => {
    test('Correctly verifies equality in constant time', () => {
      assert.equal(constantTimeCompare('123456', '123456'), true);
      assert.equal(constantTimeCompare('secret-salt-val', 'secret-salt-val'), true);
      assert.equal(constantTimeCompare('123456', '123457'), false);
      assert.equal(constantTimeCompare('123', '123456'), false);
      assert.equal(constantTimeCompare('', ''), true);
      assert.equal(constantTimeCompare(null as any, 'abc'), false);
    });
  });

  describe('3. Memory Rate Limiter', () => {
    test('Allows requests under limit and blocks requests exceeding limit', () => {
      const limiter = new MemoryRateLimiter({ windowMs: 1000, max: 3 });
      const key = 'test-client-ip';

      assert.equal(limiter.isRateLimited(key).limited, false);
      assert.equal(limiter.isRateLimited(key).limited, false);
      assert.equal(limiter.isRateLimited(key).limited, false);

      // 4th request exceeds max 3
      const fourth = limiter.isRateLimited(key);
      assert.equal(fourth.limited, true);
      assert.ok(fourth.retryAfterSec > 0);

      limiter.destroy();
    });
  });

  describe('4. HTTP Security Headers Enforcement', () => {
    test('Server responses include strict OWASP security headers', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/health`);
      assert.equal(res.status, 200);

      // Verify headers
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('x-xss-protection'), '1; mode=block');
      assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
      assert.ok(res.headers.get('content-security-policy')?.includes("default-src 'self'"));
      // Verify X-Powered-By is omitted
      assert.equal(res.headers.get('x-powered-by'), null);
    });
  });

  describe('5. End-to-End Cryptographic Session Salt Distribution', () => {
    test('Pairing success distributes matching random sessionSalt to both peers', async () => {
      const wsHost = await createClientWs();
      const wsJoiner = await createClientWs();

      const hostDev: Device = { id: 'sec-host', name: 'Security Host', platform: 'windows', lastSeen: Date.now() };
      const joinerDev: Device = { id: 'sec-joiner', name: 'Security Joiner', platform: 'linux', lastSeen: Date.now() };

      // Register both
      wsHost.send(JSON.stringify({ type: 'register', senderId: hostDev.id, payload: { device: hostDev }, timestamp: Date.now() }));
      wsJoiner.send(JSON.stringify({ type: 'register', senderId: joinerDev.id, payload: { device: joinerDev }, timestamp: Date.now() }));

      // Wait until host is registered
      await waitForMessage(wsHost, 'device-list');

      // Request pair PIN
      wsHost.send(JSON.stringify({ type: 'request-pair-code', senderId: hostDev.id, timestamp: Date.now() }));
      const codeMsg = await waitForMessage(wsHost, 'pair-code-created');
      const pin = codeMsg.payload.code;

      // Listen for pair-success on both sockets
      const hostPairSuccessPromise = waitForMessage(wsHost, 'pair-success');
      const joinerPairSuccessPromise = waitForMessage(wsJoiner, 'pair-success');

      wsJoiner.send(JSON.stringify({
        type: 'submit-pair-code',
        senderId: joinerDev.id,
        payload: { code: pin },
        timestamp: Date.now(),
      }));

      const hostSuccess = await hostPairSuccessPromise;
      const joinerSuccess = await joinerPairSuccessPromise;

      assert.equal(hostSuccess.payload.role, 'host');
      assert.equal(joinerSuccess.payload.role, 'joiner');

      // Crucial: Both peers receive the same cryptographic session salt
      const hostSalt = hostSuccess.payload.sessionSalt;
      const joinerSalt = joinerSuccess.payload.sessionSalt;

      assert.ok(typeof hostSalt === 'string');
      assert.equal(hostSalt.length, 32); // 16 bytes in hex
      assert.equal(hostSalt, joinerSalt);

      wsHost.close();
      wsJoiner.close();
    });
  });

  describe('6. Radar Network Isolation & Visibility Controls', () => {
    test('Only same network or paired devices appear on the radar', () => {
      const presence = serverApp.presence;
      const dummyWs = { readyState: 1, send: () => {}, close: () => {} } as any;

      const deviceLan1: Device = { id: 'dev-lan-1', name: 'Office Laptop', platform: 'windows', lastSeen: Date.now() };
      const deviceLan2: Device = { id: 'dev-lan-2', name: 'Office Phone', platform: 'ios', lastSeen: Date.now() };
      const deviceExternal: Device = { id: 'dev-ext-1', name: 'Remote Stranger', platform: 'android', lastSeen: Date.now() };

      // Register two devices on same subnet 192.168.1.x and one on unrelated external IP 203.0.113.45
      presence.register(dummyWs, deviceLan1, '192.168.1.15');
      presence.register(dummyWs, deviceLan2, '192.168.1.42');
      presence.register(dummyWs, deviceExternal, '203.0.113.45');

      // Laptop 1 should see Office Phone (same subnet), but should NOT see Remote Stranger
      const visibleToLaptop = presence.getVisibleDevices(deviceLan1.id);
      assert.ok(visibleToLaptop.some(d => d.id === deviceLan2.id));
      assert.equal(visibleToLaptop.some(d => d.id === deviceExternal.id), false);

      // Once Laptop 1 explicitly pairs with Remote Stranger, Remote Stranger becomes visible!
      presence.addPairing(deviceLan1.id, deviceExternal.id);
      const visibleAfterPairing = presence.getVisibleDevices(deviceLan1.id);
      assert.ok(visibleAfterPairing.some(d => d.id === deviceExternal.id));
      assert.equal(visibleAfterPairing.find(d => d.id === deviceExternal.id)?.isPaired, true);

      // Cleanup
      presence.unregister(dummyWs);
    });
  });
});

