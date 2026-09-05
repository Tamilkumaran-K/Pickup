const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'packages', 'web', 'dist');
const targets = [
  path.join(__dirname, '..', 'dist'),
  path.join(__dirname, '..', 'packages', 'server', 'public'),
  path.join(__dirname, '..', 'packages', 'server', 'dist', 'web'),
];

if (!fs.existsSync(srcDir)) {
  console.error(`[build] Error: Source directory "${srcDir}" does not exist.`);
  process.exit(1);
}

for (const targetDir of targets) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.cpSync(srcDir, targetDir, { recursive: true });
  console.log(`[build] Successfully synchronized build artifacts -> ${path.relative(path.join(__dirname, '..'), targetDir)}`);
}

