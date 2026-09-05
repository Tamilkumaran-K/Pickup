import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcCandidates = [
  path.join(__dirname, '..', '..', 'web', 'dist'),
  path.join(process.cwd(), 'packages', 'web', 'dist'),
  path.join(process.cwd(), 'dist'),
];

const dest = path.join(__dirname, '..', 'dist', 'web');

const src = srcCandidates.find((d) => fs.existsSync(path.join(d, 'index.html')));

if (src) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[copy-web] Successfully copied web assets from ${src} to ${dest}`);
} else {
  console.warn('[copy-web] Warning: Web dist directory not found.');
}
