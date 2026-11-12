// AIDA arayüzünü sahte durumla açıp ekran görüntüsü alır. Kullanım (mutlak yol ver): electron scripts/ui-shot.js <proje-kök> <çıktı.png> [dolu]   (SHOT_W/SHOT_H ile boyut)
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/ui-shot.js$/.test(a));
const [root, out, mode] = args;
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

const ids = [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude'], ['deepseek', 'DeepSeek'], ['kimi', 'Kimi'], ['grok', 'Grok'], ['qwen', 'Qwen'], ['lechat', 'Le Chat']];
const full = mode === 'dolu';
const state = {
  extension: true, bridgeError: null, appVersion: '0.4.0', extVersion: '0', expectedExt: '0.4.0', extCopies: 2, update: { latest: '0.5.0', url: 'https://github.com/sekullar/aida/releases/latest' }, running: false, auto: false, round: 0, phase: '', speaker: null,
  settings: { maxWords: 200, timeoutSec: 600, maxRounds: 0 },
  seats: ids.map(([id, name], i) => ({ id, name, invited: full, conn: 'ready', status: full && i === 2 ? 'thinking' : 'idle', note: '' })),
  transcript: full ? [{ id: 1, from: 'user', text: 'Merhaba masa!', kind: 'say' }, { id: 2, from: 'chatgpt', text: 'Merhaba, ben ChatGPT.', kind: 'say' }] : [],
};
ipcMain.handle('aida:state', () => state);

app.whenReady().then(async () => {
  const preload = path.join(require('os').tmpdir(), 'aida-shot-preload.js');
  fs.writeFileSync(preload, `const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aida', { state: () => ipcRenderer.invoke('aida:state'), onState: () => {}, invite(){}, dismiss(){}, resetSeat(){}, send: async () => ({ ok: true }), setAuto(){}, stop(){}, newSession(){}, saveSettings(){}, openExtensionFolder(){}, launchChrome(){} });`);
  const win = new BrowserWindow({ width: +(process.env.SHOT_W || 1150), height: +(process.env.SHOT_H || 760), show: false, webPreferences: { preload, contextIsolation: true, offscreen: true } });
  const errs = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errs.push(msg); });
  let last = null;
  win.webContents.on('paint', (_e, _d, img) => { last = img; });
  await win.loadFile(path.join(root, 'renderer', 'index.html'));
  if (process.env.SHOT_THEME === 'light') await win.webContents.executeJavaScript("setTheme('light', false)");
  await new Promise((r) => setTimeout(r, 1500));
  win.webContents.invalidate();
  await new Promise((r) => setTimeout(r, 500));
  const logo = await win.webContents.executeJavaScript(`[...document.querySelectorAll('img')].map(i => i.className + ':' + i.naturalWidth)`);
  fs.writeFileSync(out, last.toPNG());
  console.log('SHOT_OK', JSON.stringify(logo), JSON.stringify(errs));
  app.quit();
});
