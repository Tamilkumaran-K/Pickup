import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { sanitizeFileName, isDangerousFileType } from '@pickup/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#07090E',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    title: 'Pickup — Cross-Platform File Drop',
  });

  // Intercept and restrict navigation to trusted sources only
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      const isAllowed =
        (parsedUrl.origin === 'http://localhost:5173') ||
        (parsedUrl.protocol === 'file:');

      if (!isAllowed) {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    } catch {
      event.preventDefault();
    }
  });

  // Block child window creation and route external URLs to default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Load Vite dev server if running, else load production build
  const devUrl = 'http://localhost:5173';
  mainWindow.loadURL(devUrl).catch(() => {
    const candidatePaths = [
      path.join(__dirname, '../../web/dist/index.html'),
      path.join(__dirname, '../web/dist/index.html'),
      path.join(process.cwd(), 'packages/web/dist/index.html'),
      path.join(app.getAppPath(), 'packages/web/dist/index.html'),
    ];
    const found = candidatePaths.find((p) => fs.existsSync(p));
    if (found && mainWindow) {
      mainWindow.loadFile(found);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Set App User Model ID for Windows notifications
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.pickup.app');
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler: Zero-Click Silent File Save to ~/Downloads/Pickup/
// Hardened against directory traversal and dangerous executable auto-launch
ipcMain.handle('save-file-silent', async (_: any, { fileName, buffer }: { fileName: string; buffer: ArrayBuffer }) => {
  try {
    const saveDir = path.join(os.homedir(), 'Downloads', 'Pickup');
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    // 1. Sanitize file name to strip path traversal elements, null bytes, and invalid chars
    let safeName = sanitizeFileName(fileName);
    let isQuarantined = false;

    // 2. Dangerous executable files (.exe, .bat, .cmd, .ps1, .vbs) are quarantined
    // with .download extension to prevent accidental click execution
    if (isDangerousFileType(safeName)) {
      safeName = `${safeName}.download`;
      isQuarantined = true;
      console.warn(`[Pickup Desktop Security] Quarantined executable file as ${safeName}`);
    }

    // 3. Strict path containment verification to guarantee write stays within saveDir
    let targetPath = path.resolve(saveDir, safeName);
    const relativePath = path.relative(saveDir, targetPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('Path traversal detected: Target path is outside download directory');
    }

    // 4. Auto-deduplicate filename if file already exists
    let counter = 1;
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);

    while (fs.existsSync(targetPath)) {
      targetPath = path.resolve(saveDir, `${base} (${counter})${ext}`);
      counter++;
    }

    // Re-verify containment on deduplicated path
    const relDedup = path.relative(saveDir, targetPath);
    if (relDedup.startsWith('..') || path.isAbsolute(relDedup)) {
      throw new Error('Path traversal detected on deduplicated target path');
    }

    // 5. Write file contents to disk
    fs.writeFileSync(targetPath, Buffer.from(buffer));
    console.log(`[Pickup Desktop] Auto-saved file to ${targetPath}`);

    // 6. Native OS Notification
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: isQuarantined ? 'Pickup — Quarantined File Received' : 'Pickup — File Received',
        body: isQuarantined
          ? `${path.basename(targetPath)} was renamed to .download for security.`
          : `${path.basename(targetPath)} has been automatically saved to Pickup`,
      });
      notification.on('click', () => {
        shell.showItemInFolder(targetPath);
      });
      notification.show();
    }

    return { success: true, filePath: targetPath, quarantined: isQuarantined };
  } catch (err: any) {
    console.error('Failed to auto-save file natively:', err);
    return { success: false, error: err.message };
  }
});

// IPC Handler: Notification
ipcMain.handle('notify-file-received', async (_: any, { fileName, filePath }: { fileName: string; filePath: string }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'File Received',
      body: `${fileName} arrived from peer`,
    });
    if (filePath) {
      notification.on('click', () => {
        shell.showItemInFolder(filePath);
      });
    }
    notification.show();
  }
  return true;
});

// Persistent Store Helpers for Settings & Transfer History
function getSettingsPath(): string {
  const userData = app.getPath('userData');
  if (!fs.existsSync(userData)) {
    fs.mkdirSync(userData, { recursive: true });
  }
  return path.join(userData, 'settings.json');
}

function getTransfersPath(): string {
  const userData = app.getPath('userData');
  if (!fs.existsSync(userData)) {
    fs.mkdirSync(userData, { recursive: true });
  }
  return path.join(userData, 'transfers.json');
}

function readSettings(): Record<string, any> {
  try {
    const file = getSettingsPath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to read settings:', e);
  }
  return {};
}

function writeSettings(data: Record<string, any>): void {
  try {
    const file = getSettingsPath();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write settings:', e);
  }
}

// IPC Handler: Device Info (reads persistent custom name if saved)
ipcMain.handle('get-device-info', async () => {
  const settings = readSettings();
  const defaultName = process.platform === 'darwin'
    ? `${os.hostname().replace(/\.local$/i, '')} (Mac)`
    : `${os.hostname()} (Windows)`;
  return {
    name: settings.deviceName || defaultName,
    platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
    hasCustomName: Boolean(settings.deviceName),
  };
});

// IPC Handler: Set Custom Device Name (persists across restarts)
ipcMain.handle('set-device-name', async (_: any, name: string) => {
  const settings = readSettings();
  settings.deviceName = name;
  writeSettings(settings);
  return { success: true };
});

// IPC Handler: Open Save Folder in Windows File Explorer
ipcMain.handle('open-save-folder', async () => {
  const saveDir = path.join(os.homedir(), 'Downloads', 'Pickup');
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }
  await shell.openPath(saveDir);
  return { success: true, path: saveDir };
});

// IPC Handler: Direct user to exact file location or folder in Windows File Explorer
ipcMain.handle('show-item-in-folder', async (_: any, targetPath: string) => {
  try {
    const saveDir = path.join(os.homedir(), 'Downloads', 'Pickup');
    if (targetPath) {
      const resolved = path.resolve(targetPath);
      if (fs.existsSync(resolved)) {
        const stat = fs.statSync(resolved);
        if (stat.isFile()) {
          shell.showItemInFolder(resolved);
        } else {
          await shell.openPath(resolved);
        }
        return { success: true, opened: resolved };
      }
    }

    // Fallback: Open FileDrop folder
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    await shell.openPath(saveDir);
    return { success: true, opened: saveDir, fallback: true };
  } catch (err: any) {
    console.error('Failed to show item in folder:', err);
    return { success: false, error: err.message };
  }
});

// IPC Handler: Get Saved Transfer History
ipcMain.handle('get-transfer-history', async () => {
  try {
    const file = getTransfersPath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to read transfers history:', e);
  }
  return [];
});

// IPC Handler: Save Transfer History
ipcMain.handle('save-transfer-history', async (_: any, transfers: any[]) => {
  try {
    const file = getTransfersPath();
    fs.writeFileSync(file, JSON.stringify(transfers, null, 2), 'utf-8');
    return { success: true };
  } catch (e: any) {
    console.error('Failed to write transfers history:', e);
    return { success: false, error: e.message };
  }
});
