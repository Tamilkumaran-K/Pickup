import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { PresenceManager } from './presence.js';
import { PairingManager } from './pairingManager.js';
import { SignalingHandler } from './signaling.js';
import { securityHeaders, MemoryRateLimiter } from './security.js';

export function createApp() {
  const app = express();

  // 1. Security Headers (OWASP recommendations)
  app.use(securityHeaders());

  // 2. CORS (Cross-Origin Resource Sharing) configuration
  // Fully permissive origin resolver to support Vercel, localhost, and LAN clients
  const corsOptions: cors.CorsOptions = {
    origin: (_origin, callback) => {
      callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 200,
  };
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // 3. Request body parsing with strict 1MB size limit
  app.use(express.json({ limit: '1mb' }));

  // 4. Rate Limiters
  const apiLimiter = new MemoryRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 120,           // 120 requests per minute per IP
    message: 'Too many API requests, please slow down.',
  });

  const downloadLimiter = new MemoryRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30,            // 30 downloads per minute per IP
    message: 'Too many download requests, please try again later.',
  });

  app.use('/api/', apiLimiter.middleware());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const presence = new PresenceManager();
  const pairing = new PairingManager();
  const signaling = new SignalingHandler(presence, pairing);

  const startTime = Date.now();

  // STUN Ice Servers
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'Pickup Signaling Server',
      onlineDevices: presence.getOnlineCount(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      timestamp: Date.now(),
    });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      iceServers,
      chunkSize: 64 * 1024,
      version: '1.0.0',
    });
  });

  app.get('/api/devices', (_req, res) => {
    res.json({
      devices: presence.getAllOnlineDevices(),
    });
  });

  // Download Endpoints for Windows, macOS, and Android
  const downloadsDir = path.resolve(process.cwd(), 'packages/server/public/downloads');
  app.use('/downloads', downloadLimiter.middleware(), express.static(downloadsDir));

  app.get('/api/download/:platform', downloadLimiter.middleware(), (req, res) => {
    const platform = req.params.platform.toLowerCase();
    let filename = '';
    let contentType = 'application/octet-stream';

    if (platform === 'windows' || platform === 'win') {
      filename = 'Pickup-Windows-Setup.exe';
      contentType = 'application/x-msdownload';
    } else if (platform === 'macos' || platform === 'mac') {
      filename = 'Pickup-macOS.dmg';
      contentType = 'application/x-apple-diskimage';
    } else if (platform === 'android' || platform === 'apk') {
      filename = 'Pickup.apk';
      contentType = 'application/vnd.android.package-archive';
    } else {
      return res.status(404).json({ error: `Unknown download platform: ${platform}` });
    }

    const filePath = path.join(downloadsDir, filename);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', contentType);
      return res.sendFile(filePath);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(Buffer.from(`Pickup ${platform} release binary`));
  });

  // Handle HTTP Upgrade for WebSocket with path validation
  server.on('upgrade', (request, socket, head) => {
    try {
      const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);
      
      // Accept connection only on /ws or /
      if (pathname === '/ws' || pathname === '/') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          const forwardedFor = request.headers['x-forwarded-for'];
          const remoteIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) ||
                           request.socket.remoteAddress ||
                           '127.0.0.1';
          wss.emit('connection', ws, request, remoteIp);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, _request, remoteIp = '127.0.0.1') => {
    signaling.handleConnection(ws, remoteIp);
  });

  const cleanup = () => {
    signaling.stopHeartbeat();
    apiLimiter.destroy();
    downloadLimiter.destroy();
  };

  return {
    app,
    server,
    wss,
    presence,
    pairing,
    signaling,
    apiLimiter,
    downloadLimiter,
    cleanup,
  };
}

export function startServer(port = 3001): Promise<{ server: http.Server; port: number; cleanup: () => void }> {
  const appInstance = createApp();
  const { server, cleanup } = appInstance;

  // Graceful shutdown listeners
  const gracefulShutdown = (signal: string) => {
    console.log(`[Pickup Server] Received ${signal}, closing gracefully...`);
    cleanup();
    appInstance.wss.clients.forEach((client) => {
      if (client.readyState === 1) { // OPEN
        client.close(1001, 'Server shutting down');
      }
    });
    server.close(() => {
      console.log('[Pickup Server] HTTP and WebSocket server closed.');
      if (process.env.NODE_ENV !== 'test') {
        process.exit(0);
      }
    });
  };

  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

  return new Promise((resolve) => {
    server.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      console.log(`[Pickup Server] Listening on http://localhost:${actualPort} (WebSocket on /ws)`);
      resolve({ server, port: actualPort, cleanup });
    });
  });
}

import { fileURLToPath } from 'url';

const isMain = process.argv[1] && fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase() === process.argv[1].replace(/\\/g, '/').toLowerCase();

if (isMain && process.env.NODE_ENV !== 'test') {
  const port = parseInt(process.env.PORT || '3001', 10);
  startServer(port);
}
