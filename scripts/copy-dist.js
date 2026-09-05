const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'packages', 'web', 'dist');
const destDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(srcDir)) {
  console.error(`[build] Error: Source directory "${srcDir}" does not exist.`);
  process.exit(1);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.cpSync(srcDir, destDir, { recursive: true });
console.log(`[build] Successfully synchronized build artifacts from packages/web/dist -> dist`);
