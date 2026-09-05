/**
 * Auto-Save Engine:
 * 1. Native Electron IPC (if running inside Desktop wrapper) -> True zero-click write to ~/Downloads/FileDrop/
 * 2. File System Access API (if granted in browser) -> Writes directly to granted directory handle
 * 3. Fallback Auto-Download -> Programmatic browser download + audio chime
 */

import { sanitizeFileName } from '@dropflow/shared';

// Audio chime using Web Audio API synthesis
export function playSuccessChime(): void {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    // Pleasant chord: C6 (1046Hz) and E6 (1318Hz)
    osc1.frequency.setValueAtTime(1046.5, audioCtx.currentTime);
    osc2.frequency.setValueAtTime(1318.5, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(audioCtx.currentTime + 0.6);
    osc2.stop(audioCtx.currentTime + 0.6);
  } catch {
    // Audio context might be restricted before user gesture
  }
}

class AutoSaveManager {
  private directoryHandle: any = null;
  private directoryName: string = 'Browser Downloads (Default)';

  constructor() {
    this.restoreSavedHandle();
  }

  async restoreSavedHandle() {
    // Attempt to restore directory handle from IndexedDB if supported
  }

  isFileSystemAccessSupported(): boolean {
    return 'showDirectoryPicker' in window;
  }

  getDirectoryName(): string {
    return this.directoryName;
  }

  hasCustomDirectory(): boolean {
    return this.directoryHandle !== null;
  }

  async pickCustomDirectory(): Promise<string | null> {
    if (!this.isFileSystemAccessSupported()) {
      return null;
    }

    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      this.directoryHandle = handle;
      this.directoryName = handle.name || 'Selected Folder';
      return this.directoryName;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error selecting directory:', err);
      }
      return null;
    }
  }

  clearCustomDirectory() {
    this.directoryHandle = null;
    this.directoryName = 'Browser Downloads (Default)';
  }

  /**
   * Automatically saves the received file without a manual download click!
   */
  async autoSaveFile(fileName: string, mimeType: string, data: ArrayBuffer): Promise<{ savedPath: string }> {
    playSuccessChime();
    const safeName = sanitizeFileName(fileName);

    // 1. Check if Electron Native API exists
    const nativeApi = (window as any).fileDropNative;
    if (nativeApi && typeof nativeApi.saveFileSilent === 'function') {
      const result = await nativeApi.saveFileSilent(safeName, data);
      return { savedPath: result.filePath || 'Downloads/FileDrop' };
    }

    // 2. Check File System Access API
    if (this.directoryHandle) {
      try {
        const fileHandle = await this.directoryHandle.getFileHandle(safeName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        return { savedPath: `${this.directoryName}/${safeName}` };
      } catch (err) {
        console.warn('File System Access write failed, falling back to instant browser download:', err);
      }
    }

    // 3. Fallback: Automatic zero-click browser download trigger
    const blob = new Blob([data], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);

    return { savedPath: `Downloads/${safeName}` };
  }
}

export const autoSaveManager = new AutoSaveManager();

