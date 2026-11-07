const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aida', {
  state: () => ipcRenderer.invoke('aida:state'),
  onState: (cb) => ipcRenderer.on('aida:state', (_e, s) => cb(s)),
  invite: (id) => ipcRenderer.invoke('aida:invite', id),
  dismiss: (id) => ipcRenderer.invoke('aida:dismiss', id),
  resetSeat: (id) => ipcRenderer.invoke('aida:resetSeat', id),
  send: (text) => ipcRenderer.invoke('aida:send', text),
  setAuto: (on) => ipcRenderer.invoke('aida:auto', on),
  stop: () => ipcRenderer.invoke('aida:stop'),
  newSession: () => ipcRenderer.invoke('aida:newSession'),
  saveSettings: (s) => ipcRenderer.invoke('aida:settings', s),
  openExtensionFolder: () => ipcRenderer.invoke('aida:openExt'),
  launchChrome: () => ipcRenderer.invoke('aida:launchChrome'),
});
