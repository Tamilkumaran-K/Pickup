import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fileDropNative', {
  saveFileSilent: (fileName: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('save-file-silent', { fileName, buffer }),

  notifyFileReceived: (fileName: string, filePath: string) =>
    ipcRenderer.invoke('notify-file-received', { fileName, filePath }),

  getDeviceInfo: () =>
    ipcRenderer.invoke('get-device-info'),

  openSaveFolder: () =>
    ipcRenderer.invoke('open-save-folder'),

  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('show-item-in-folder', filePath),

  setDeviceName: (name: string) =>
    ipcRenderer.invoke('set-device-name', name),

  getSavedTransfers: () =>
    ipcRenderer.invoke('get-transfer-history'),

  saveTransfers: (transfers: any[]) =>
    ipcRenderer.invoke('save-transfer-history', transfers),

  isDesktop: true,
});
