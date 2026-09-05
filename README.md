# DropFlow — Cross-Platform Zero-Click File Drop

<div align="center">
  <h3>AirDrop & LocalSend-style instant file transfer across Windows, macOS, Android, iOS, and Web.</h3>
  <p>Drop a file on one device, and it immediately lands on your other device with <b>zero manual download clicks</b>.</p>
</div>

---

## Highlights

- ⚡ **Direct Peer-to-Peer Transfer**: WebRTC DataChannels transfer files directly over your local WiFi network at maximum line rate.
- 🔄 **Fallback Encrypted Relay**: If devices are on different networks or behind symmetric NATs, transfers automatically and seamlessly fall back to an encrypted WebSocket relay.
- 🔒 **End-to-End Encryption (AES-256-GCM)**: All file chunks are encrypted with keys derived from a 6-digit pairing PIN or QR code. The relay server never sees unencrypted content.
- 🎯 **AirDrop-Style Radar**: Live animated radar view detects nearby devices on your local network and displays them with platform-specific badges.
- 📂 **Platform-Native Zero-Click Auto-Save**:
  - **Windows & macOS (Desktop)**: Automatically writes incoming files into `~/Downloads/FileDrop/` and displays native OS toast notifications.
  - **Android & iOS (Mobile)**: Automatically routes incoming photos and videos into the user's native Photos / Gallery via `expo-media-library`.
  - **Web (Browser)**: Uses the **File System Access API** (`showDirectoryPicker`) to write directly to a granted folder with zero clicks, or triggers an instant automated browser download with completion chime.

---

## Monorepo Architecture

```
file-drop/
├── package.json                   # Monorepo root with npm workspaces
├── tsconfig.base.json             # Shared TypeScript configuration
├── packages/
│   ├── shared/                    # Pure TypeScript protocol & cryptography (@dropflow/shared)
│   │   ├── src/
│   │   │   ├── types.ts           # Protocol types (Device, Transfer, SignalingMessage)
│   │   │   ├── chunker.ts         # 64KB binary chunker & stream reassembler
│   │   │   ├── hash.ts            # SHA-256 integrity verification
│   │   │   ├── crypto.ts          # AES-256-GCM WebCrypto E2E encryption & PBKDF2
│   │   │   └── pairing.ts         # 6-digit PIN code & QR payload generation
│   │   └── test/                  # Unit tests (Happy, Edge, Sad, Rare paths)
│   │
│   ├── server/                    # Node.js WebSocket Signaling & Relay Server (@dropflow/server)
│   │   ├── src/
│   │   │   ├── index.ts           # Express HTTP + WebSocket server setup
│   │   │   ├── presence.ts        # LAN presence & device discovery
│   │   │   ├── pairingManager.ts  # 6-digit short code rendezvous table
│   │   │   └── signaling.ts       # WebRTC SDP offer/answer/ICE & chunk relay router
│   │   └── test/                  # Integration tests for signaling, presence, and pairing
│   │
│   ├── web/                       # React + Vite Web Drop Client & Download Hub (@dropflow/web)
│   │   ├── src/
│   │   │   ├── App.tsx            # Main application router
│   │   │   ├── components/
│   │   │   │   ├── RadarView.tsx  # AirDrop-style radar with active peer nodes
│   │   │   │   ├── DropZone.tsx   # Interactive drag-and-drop zone
│   │   │   │   ├── TransferQueue.tsx # Live transfer cards (speed, progress, ETA)
│   │   │   │   ├── PairingModal.tsx  # 6-digit PIN & QR pairing dialog
│   │   │   │   ├── SettingsModal.tsx # Zero-click folder picker (File System Access API)
│   │   │   │   └── LandingHub.tsx    # Marketing & download page for native apps
│   │   │   └── services/
│   │   │       ├── webrtc.ts      # WebRTC DataChannel manager + backpressure
│   │   │       ├── socket.ts      # WebSocket signaling client
│   │   │       └── autoSave.ts    # File System Access API & auto-download engine
│   │   └── index.html             # High-aesthetic dark mode entry point
│   │
│   ├── desktop/                   # Electron Desktop Wrapper for Windows & macOS (@dropflow/desktop)
│   │   ├── src/
│   │   │   ├── main.ts            # Electron main process (native ~/Downloads/FileDrop/ auto-save)
│   │   │   └── preload.ts         # ContextBridge exposing window.fileDropNative
│   │   └── package.json
│   │
│   └── mobile/                    # Expo React Native App for Android & iOS (@dropflow/mobile)
│       ├── App.tsx                # Mobile UI with Radar and received media feed
│       ├── app.json               # Expo manifest with camera & media library permissions
│       └── src/
│           └── autoSaveMobile.ts  # expo-media-library auto-save to Photos/Gallery
```

---

## Getting Started

### Prerequisites
- Node.js v18+ (Node v20+ recommended)
- npm v9+

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Test Suite
Run the test suite (15 unit tests in shared + 5 integration tests in server):
```bash
npm test
```

### 3. Start Development Servers
Start both the signaling server and web application:
```bash
# Terminal 1: Signaling Server (runs on http://localhost:3001)
npm run dev:server

# Terminal 2: Web Client (runs on http://localhost:5173)
npm run dev:web
```

Open `http://localhost:5173` in your browser. Open a second browser window or another tab to simulate a second peer device and test instant drag-and-drop file transfers!

### 4. Run Desktop Native App (Windows / macOS)
```bash
npm --prefix packages/desktop start
```

---

## Security & Encryption

1. **Zero-Knowledge Architecture**: File contents are sliced into 64KB chunks and encrypted on the sender device before touching the network.
2. **Key Derivation**: Keys are derived from the 6-digit pairing PIN using **PBKDF2 with SHA-256** (100,000 iterations).
3. **Chunk Encryption**: Each chunk has an independent 12-byte initialization vector (IV) and an authenticated tag via **AES-GCM (256-bit)**.
4. **Integrity Validation**: The receiver computes the complete file's **SHA-256** checksum upon reassembly to guarantee zero corruption or tampering before auto-saving.

---

## License
MIT
