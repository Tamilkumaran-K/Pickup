# Pickup Native Downloads Directory

This folder is used to host production-compiled installer packages:
- `Pickup-Windows-Setup.exe` (Electron Windows Installer, ~70MB)
- `Pickup.apk` (Android Production APK, ~35MB)
- `Pickup-macOS.dmg` (macOS Installer, ~75MB)

## Running Directly Without Pre-compiled Cloud Binaries:
- **Windows PC**: Run `Pickup-Windows.bat` or `npm run dev:desktop` to launch the native Electron desktop client.
- **Android Mobile**: Open `https://pickupbeta.vercel.app` in Google Chrome and tap `⋮ ➔ Add to Home screen` to install the PWA instantly with zero-install overhead and full native gallery permissions.
- **iOS / iPhone**: Open in Safari and tap `Share ➔ Add to Home Screen`.
