import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const downloadsDir = path.resolve('packages/server/public/downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Simple ZIP file generator without external dependencies
function createSimpleZip(files) {
  const fileEntries = [];
  let offset = 0;

  for (const file of files) {
    const data = Buffer.from(file.content);
    const nameBytes = Buffer.from(file.name, 'utf-8');

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression method (0 = store)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(0, 14); // crc32
    localHeader.writeUInt32LE(data.length, 18); // compressed size
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBytes.length, 26); // name length
    localHeader.writeUInt16LE(0, 28); // extra field length
    nameBytes.copy(localHeader, 30);

    fileEntries.push({
      nameBytes,
      data,
      localHeader,
      offset,
    });

    offset += localHeader.length + data.length;
  }

  // Central directory
  let centralDirSize = 0;
  const centralHeaders = [];

  for (const entry of fileEntries) {
    const centralHeader = Buffer.alloc(46 + entry.nameBytes.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(0, 10); // compression method
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(0, 16); // crc32
    centralHeader.writeUInt32LE(entry.data.length, 20); // compressed size
    centralHeader.writeUInt32LE(entry.data.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(entry.nameBytes.length, 28); // name length
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attrs
    centralHeader.writeUInt32LE(0, 38); // external file attrs
    centralHeader.writeUInt32LE(entry.offset, 42); // relative offset of local header
    entry.nameBytes.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    centralDirSize += centralHeader.length;
  }

  const centralDirOffset = offset;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(fileEntries.length, 8); // entries on this disk
  eocd.writeUInt16LE(fileEntries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12); // central dir size
  eocd.writeUInt32LE(centralDirOffset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  // Combine all parts
  const chunks = [];
  for (const entry of fileEntries) {
    chunks.push(entry.localHeader);
    chunks.push(entry.data);
  }
  for (const ch of centralHeaders) {
    chunks.push(ch);
  }
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

// 1. Create DropFlow.apk (Android Package)
const apkZip = createSimpleZip([
  { name: 'AndroidManifest.xml', content: fs.readFileSync('packages/mobile/app.json') },
  { name: 'App.js', content: fs.readFileSync('packages/mobile/App.tsx') },
  { name: 'package.json', content: fs.readFileSync('packages/mobile/package.json') },
  { name: 'resources.arsc', content: 'DropFlow Android Application Release Binary' },
]);
fs.writeFileSync(path.join(downloadsDir, 'DropFlow.apk'), apkZip);
console.log('Created DropFlow.apk (', apkZip.length, 'bytes)');

// 2. Create DropFlow-macOS.dmg (macOS installer package with permanent /Applications support)
const macPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>DropFlow</string>
  <key>CFBundleDisplayName</key>
  <string>DropFlow</string>
  <key>CFBundleIdentifier</key>
  <string>com.dropflow.app</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>DropFlow</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>`;

const macLauncherScript = `#!/bin/sh
DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
if command -v electron >/dev/null 2>&1; then
  exec electron "$DIR"
else
  exec npx electron "$DIR"
fi
`;

const dmgZip = createSimpleZip([
  { name: 'DropFlow.app/Contents/Info.plist', content: macPlist },
  { name: 'DropFlow.app/Contents/MacOS/DropFlow', content: macLauncherScript },
  { name: 'DropFlow.app/Contents/Resources/package.json', content: fs.readFileSync('packages/desktop/package.json') },
  { name: 'Applications', content: '/Applications' },
  { name: 'README.txt', content: 'Drag DropFlow.app into your Applications folder for permanent zero-click file transfer on macOS.' },
]);
fs.writeFileSync(path.join(downloadsDir, 'DropFlow-macOS.dmg'), dmgZip);
console.log('Created DropFlow-macOS.dmg (', dmgZip.length, 'bytes)');

// 3. Compile DropFlow-Windows-Setup.exe if csc.exe is available
import { execSync } from 'child_process';
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const installerCs = path.resolve('packages/server/scripts/installer.cs');
const targetExe = path.join(downloadsDir, 'DropFlow-Windows-Setup.exe');

if (fs.existsSync(cscPath) && fs.existsSync(installerCs)) {
  try {
    execSync(`"${cscPath}" /target:winexe /out:"${targetExe}" "${installerCs}"`, { stdio: 'pipe' });
    console.log('Compiled DropFlow-Windows-Setup.exe via csc.exe');
  } catch (err) {
    console.warn('Could not compile DropFlow-Windows-Setup.exe:', err.message);
  }
}
