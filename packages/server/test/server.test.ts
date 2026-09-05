import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { WebSocket } from 'ws';
import { createApp } from '../src/index.js';
import { Device, SignalingMessage } from '@pickup/shared';

describe('Server Package - Mr. Perfect Verification Suite', () => {
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

  test('Happy Path: HTTP /api/health and /api/config endpoints', async () => {
    const healthRes = await fetch(`http://127.0.0.1:${serverPort}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.status, 'ok');
    assert.equal(typeof health.onlineDevices, 'number');

    const configRes = await fetch(`http://127.0.0.1:${serverPort}/api/config`);
    assert.equal(configRes.status, 200);
    const config = await configRes.json();
    assert.equal(Array.isArray(config.iceServers), true);
    assert.ok(config.iceServers.length > 0);
  });

  test('Happy Path: Two devices register, discover each other, and pair via 6-digit PIN', async () => {
    const wsA = await createClientWs();
    const wsB = await createClientWs();

    const devA: Device = {
      id: 'dev-laptop-a',
      name: 'Windows Surface',
      platform: 'windows',
      lastSeen: Date.now(),
    };

    const devB: Device = {
      id: 'dev-phone-b',
      name: 'iPhone 15 Pro',
      platform: 'ios',
      lastSeen: Date.now(),
    };

    // Register Device A
    wsA.send(JSON.stringify({
      type: 'register',
      senderId: devA.id,
      payload: { device: devA },
      timestamp: Date.now(),
    }));

    // Register Device B
    wsB.send(JSON.stringify({
      type: 'register',
      senderId: devB.id,
      payload: { device: devB },
      timestamp: Date.now(),
    }));

    // Wait until Device A's device-list contains Device B
    const devListMsg = await waitForMessage(
      wsA,
      'device-list',
      (msg) => Array.isArray(msg.payload?.devices) && msg.payload.devices.some((d: Device) => d.id === devB.id)
    );
    const visibleDevices = devListMsg.payload.devices as Device[];
    assert.ok(visibleDevices.some(d => d.id === devB.id));

    // Device A requests pairing PIN
    wsA.send(JSON.stringify({
      type: 'request-pair-code',
      senderId: devA.id,
      timestamp: Date.now(),
    }));

    const pairCodeMsg = await waitForMessage(wsA, 'pair-code-created');
    const rawPin = pairCodeMsg.payload.code;
    assert.equal(rawPin.length, 6);

    // Device B submits Device A's PIN
    const pairSuccessPromiseA = waitForMessage(wsA, 'pair-success');
    const pairSuccessPromiseB = waitForMessage(wsB, 'pair-success');

    wsB.send(JSON.stringify({
      type: 'submit-pair-code',
      senderId: devB.id,
      payload: { code: rawPin },
      timestamp: Date.now(),
    }));

    const successA = await pairSuccessPromiseA;
    const successB = await pairSuccessPromiseB;

    assert.equal(successA.payload.pairedDevice.id, devB.id);
    assert.equal(successB.payload.pairedDevice.id, devA.id);

    wsA.close();
    wsB.close();
  });

  test('Happy Path: WebRTC signaling and relay forwarding between peers', async () => {
    const wsA = await createClientWs();
    const wsB = await createClientWs();

    const devA: Device = { id: 'dev-sender', name: 'MacBook', platform: 'macos', lastSeen: Date.now() };
    const devB: Device = { id: 'dev-receiver', name: 'Android Pixel', platform: 'android', lastSeen: Date.now() };

    const regAPromise = waitForMessage(wsA, 'device-list');
    wsA.send(JSON.stringify({ type: 'register', senderId: devA.id, payload: { device: devA }, timestamp: Date.now() }));
    await regAPromise;

    // Register B and wait until A sees B
    const aSeesBPromise = waitForMessage(
      wsA,
      'device-list',
      (msg) => Array.isArray(msg.payload?.devices) && msg.payload.devices.some((d: Device) => d.id === devB.id)
    );
    wsB.send(JSON.stringify({ type: 'register', senderId: devB.id, payload: { device: devB }, timestamp: Date.now() }));
    await aSeesBPromise;

    // Send WebRTC Offer from A to B
    const offerPromise = waitForMessage(wsB, 'webrtc-offer');
    wsA.send(JSON.stringify({
      type: 'webrtc-offer',
      senderId: devA.id,
      targetId: devB.id,
      payload: { sdp: 'fake-sdp-offer' },
      timestamp: Date.now(),
    }));
    const receivedOffer = await offerPromise;
    assert.equal(receivedOffer.payload.sdp, 'fake-sdp-offer');

    // Send Relay Chunk fallback from A to B
    const chunkPromise = waitForMessage(wsB, 'relay-chunk');
    wsA.send(JSON.stringify({
      type: 'relay-chunk',
      senderId: devA.id,
      targetId: devB.id,
      payload: { chunkIndex: 0, data: 'base64data' },
      timestamp: Date.now(),
    }));
    const receivedChunk = await chunkPromise;
    assert.equal(receivedChunk.payload.chunkIndex, 0);

    wsA.close();
    wsB.close();
  });

  test('Sad Path: Submitting incorrect pairing code receives pair-rejected', async () => {
    const wsA = await createClientWs();
    const devA: Device = { id: 'dev-lonely', name: 'Solo Device', platform: 'web', lastSeen: Date.now() };

    wsA.send(JSON.stringify({ type: 'register', senderId: devA.id, payload: { device: devA }, timestamp: Date.now() }));
    await waitForMessage(wsA, 'device-list');

    const rejectedPromise = waitForMessage(wsA, 'pair-rejected');
    wsA.send(JSON.stringify({
      type: 'submit-pair-code',
      senderId: devA.id,
      payload: { code: '000000' }, // Invalid code
      timestamp: Date.now(),
    }));

    const rejected = await rejectedPromise;
    assert.match(rejected.payload.reason, /Invalid or expired/i);
    wsA.close();
  });

  test('Sad Path: Sending transfer-init to non-existent target returns transfer-error', async () => {
    const wsA = await createClientWs();
    const devA: Device = { id: 'dev-test-sender', name: 'Sender', platform: 'windows', lastSeen: Date.now() };

    wsA.send(JSON.stringify({ type: 'register', senderId: devA.id, payload: { device: devA }, timestamp: Date.now() }));
    await waitForMessage(wsA, 'device-list');

    const errorPromise = waitForMessage(wsA, 'transfer-error');
    wsA.send(JSON.stringify({
      type: 'transfer-init',
      senderId: devA.id,
      targetId: 'non-existent-device',
      payload: { fileMeta: { name: 'test.png' } },
      timestamp: Date.now(),
    }));

    const err = await errorPromise;
    assert.match(err.payload.error, /offline or unavailable/i);
    wsA.close();
  });
});
