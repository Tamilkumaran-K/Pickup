# Cross-Platform File Drop App — Architecture Doc

## 1. Product Summary
A cross-platform "drop and it just appears" file-sync tool — an AirDrop/LocalSend-style
experience that works across **all** platform pairs: Android, iOS, Windows, macOS, and web.
Any file dropped on one paired device (image, video, document, anything) appears natively
on the other paired device without a manual "download" step.

**Core UX principle:** receiving a file should feel identical to how that file normally
lands on the device — into Photos/Gallery for images & videos, into a Downloads-equivalent
folder for everything else. No in-app "tap to download" step.

---

## 2. Platform Stack

Expo/React Native only covers mobile + web preview — it does **not** produce native
Windows/macOS desktop apps. The real stack needs three codebases sharing logic where possible:

| Platform | Tech | Notes |
|---|---|---|
| Android, iOS | **Expo (React Native)** | Native modules: `expo-file-system`, `expo-media-library`, `expo-document-picker` |
| Windows, macOS | **Tauri** (preferred) or Electron | Tauri = smaller binary, lower RAM, Rust backend for fast file I/O. Electron = bigger ecosystem/easier hiring later |
| Web | Plain React/Vite app | Doubles as the "drop files here" client for machines that don't want to install anything, and as the app's own download/landing page |
| Shared logic | TypeScript package (transfer protocol, pairing, encryption) | Shared across RN, Tauri (webview) and web via a common npm workspace |

**One website** (marketing + download hub) hosts:
- Web app itself (drag-and-drop client, works standalone)
- Download links: APK/Play Store, App Store, Windows installer, macOS installer

---

## 3. Network & Transfer Strategy

Two distinct paths depending on whether devices share a network:

### 3.1 Same network (WiFi, or laptop on phone's hotspot)
- **Direct peer-to-peer**, no server round-trip for file bytes.
- Discovery: mDNS/Bonjour (`react-native-zeroconf` on mobile, native mDNS on Tauri/Rust)
  broadcasts "I'm online" with a paired-device token.
- Transfer: local WebSocket or WebRTC data channel directly between devices on the LAN.
- Fast, private, free — this should be the default path whenever available.

### 3.2 Different networks (phone on mobile data, laptop elsewhere)
- No shared LAN, so direct discovery/transfer isn't possible.
- **Relay/signaling server** (small cloud service, e.g. Node + WebSocket, or a managed
  service like a TURN/signaling provider) that:
  - Lets devices register "online" and find their paired device
  - Either (a) relays file bytes directly (simplest, but costs you bandwidth), or
    (b) acts purely as a **WebRTC signaling server** so devices open a direct
    peer-to-peer connection through NAT (better for large files — no bytes touch your server)
- Recommended: WebRTC with your own lightweight signaling server + a TURN server
  (e.g. coturn, or a managed TURN provider) as fallback when direct P2P NAT traversal fails.

### 3.3 Transfer protocol (both paths)
- Chunked binary transfer (e.g. 64KB–256KB chunks) with progress tracking, resume-on-failure
  for large video files, and integrity check (hash) on completion.
- Metadata sent first (filename, mime type, size) so the receiving app knows where to route it.

---

## 4. Pairing & Security
"Same WiFi" alone isn't enough — it would expose you to anyone on public WiFi. Need explicit pairing:
- **Pairing methods:** QR code scan (fastest for phone→laptop), or account-based login (simplest for many-device users), or a short pairing code.
- Once paired, devices exchange keys and all transfers are encrypted end-to-end (even through the relay, so the relay server never sees plaintext file content).
- Maintain a "trusted devices" list per user, manageable from any device.

---

## 5. Auto-Save / "No Download Step" Behavior Per Platform

| Platform | Incoming image/video | Incoming other file |
|---|---|---|
| Android/iOS | Auto-save to Photos/Gallery via `expo-media-library` | Auto-save to app's sandboxed Documents folder, surfaced in a "Received Files" in-app list (OS sandboxing prevents writing directly to system Downloads without user-triggered share sheet — this is a hard platform constraint) |
| Windows/macOS | Auto-write into a watched folder (e.g. `~/FileDropApp` or user-configurable, defaulting near Downloads) | Same — auto-write, native OS notification on arrival |
| Web | Triggers a save-file dialog or File System Access API write (browser sandboxing means a *true* zero-click save isn't possible in-browser — closest is File System Access API with a one-time granted folder permission) |

**Important constraint to flag now:** iOS and browser sandboxing mean "appears exactly like
a normal download with zero interaction, ever" isn't 100% achievable on every platform —
iOS in particular will require at least a one-time permission grant (Photos access, or a
folder picker for non-media files) even though ongoing transfers after that are silent.

---

## 6. Data Model (rough)

- `Device`: id, platform, name, publicKey, lastSeenAt
- `PairedDeviceLink`: userId, deviceAId, deviceBId, pairedAt
- `Transfer`: id, senderId, receiverId, fileMeta (name, mime, size, hash), status (pending/in-progress/complete/failed), path (local/relay)

---

## 7. Suggested Build Phases

1. **Phase 1 — LAN-only MVP:** Expo app (Android/iOS) + one desktop client (pick Tauri or Electron), mDNS discovery, direct WebSocket transfer on same WiFi, auto-save on both ends. No pairing security yet (just device list, dev use only).
2. **Phase 2 — Pairing & security:** QR pairing, per-transfer encryption, trusted device list.
3. **Phase 3 — Relay/cross-network:** signaling server, WebRTC fallback, TURN server for NAT traversal.
4. **Phase 4 — Second desktop OS + web client:** finish whichever of Windows/Mac wasn't done in Phase 1, ship the web drop-client and the download website.
5. **Phase 5 — Polish:** transfer history, resumable large-file transfer, notifications, background transfer on mobile (subject to OS background-execution limits).

---

## 8. Open Questions to Resolve Before Coding
- Electron vs Tauri for desktop (affects team skill needs — Tauri needs some Rust)
- Do you want your own relay server (more control, more infra to run) or a managed WebRTC/TURN provider?
- Account system: anonymous device-pairing only, or full user accounts (needed if you want "my devices" to sync across networks reliably)
- Where does the web app live — same repo/monorepo as mobile & desktop, or separate?
