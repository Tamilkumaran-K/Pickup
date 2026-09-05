import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PresenceManager } from './presence.js';
import { PairingManager } from './pairingManager.js';
import { SignalingHandler } from './signaling.js';
import { securityHeaders, MemoryRateLimiter } from './security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 100000) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', contentType);
      return res.sendFile(filePath);
    }

    return res.status(200).json({
      status: 'info',
      platform,
      message: `Native ${platform} standalone installer is not hosted on this cloud instance.`,
      instructions: {
        windows: "Double-click 'Pickup-Windows.bat' in the project directory, or run 'npm run dev:desktop' to open the native Electron Windows client with background silent download support.",
        android: "Open https://pickupbeta.vercel.app in Chrome on your Android device and tap '⋮ ➔ Add to Home screen' to install the zero-install PWA app instantly.",
        ios: "Open the app in Safari on your iPhone and tap 'Share ➔ Add to Home Screen'.",
      },
      webAppUrl: 'https://pickupbeta.vercel.app',
    });
  });

  // 5. Serve static web app if built, or informative server status dashboard
  const candidateDistDirs = [
    path.join(__dirname, '../web'),
    path.join(__dirname, '../../public'),
    path.join(__dirname, '../public'),
    path.join(__dirname, '../../web/dist'),
    path.join(__dirname, '../../../web/dist'),
    path.join(__dirname, '../../../../web/dist'),
    path.join(process.cwd(), 'packages/server/public'),
    path.join(process.cwd(), 'packages/server/dist/web'),
    path.join(process.cwd(), 'packages/web/dist'),
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), 'dist'),
  ];
  const distDir = candidateDistDirs.find((d) => fs.existsSync(path.join(d, 'index.html')));

  if (distDir) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        return next();
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Pickup Signaling Server</title>
  <style>
    body { background: #07090E; color: #E2E8F0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #0F172A; border: 1px solid #1E293B; border-radius: 16px; padding: 36px; max-width: 480px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
    h1 { color: #06B6D4; margin: 12px 0; font-size: 24px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 14px; background: rgba(16,185,129,0.15); color: #10B981; border: 1px solid rgba(16,185,129,0.3); border-radius: 9999px; font-weight: 600; font-size: 13px; }
    .dot { width: 8px; height: 8px; background: #10B981; border-radius: 50%; }
    p { color: #94A3B8; line-height: 1.6; font-size: 14px; margin: 12px 0 20px; }
    .links { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
    a { color: #38BDF8; text-decoration: none; padding: 8px 16px; background: #1E293B; border-radius: 8px; font-size: 13px; font-weight: 500; transition: background 0.2s; }
    a:hover { background: #334155; }
    .btn-primary { background: #06B6D4; color: #07090E; font-weight: 600; }
    .btn-primary:hover { background: #22D3EE; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Signaling Server Online</div>
    <h1>Pickup Engine</h1>
    <p>Signaling and WebRTC relay server is active. If you are developing locally, the web client is hosted on Vite port 5173.</p>
    <div class="links">
      <a href="http://localhost:5173" class="btn-primary">Open Web Client (:5173)</a>
      <a href="/api/health">Health Check</a>
      <a href="/api/config">ICE Config</a>
    </div>
  </div>
</body>
</html>`);
    });
  }

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

const isMain = process.argv[1] && fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase() === process.argv[1].replace(/\\/g, '/').toLowerCase();

if (isMain && process.env.NODE_ENV !== 'test') {
  const port = parseInt(process.env.PORT || '3001', 10);
  startServer(port);
}

// Default export for Vercel Serverless Function execution
let serverlessHandler: express.Express | null = null;

export default function handler(req: any, res: any) {
  if (!serverlessHandler) {
    serverlessHandler = createApp().app;
  }
  return serverlessHandler(req, res);
}
