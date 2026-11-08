const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Bridge } = require('./src/bridge');
const { Engine } = require('./src/engine');
const { isNewer } = require('./src/version');

if (!app.requestSingleInstanceLock()) app.quit();

const REPO = 'sekullar/aida';

// Uygulamayla gelen uzantı: geliştirmede proje klasörü, kurulu sürümde resources/extension
const bundledExt = () => (app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.join(__dirname, 'extension'));
const extVersionOf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version; } catch { return null; } };

// Kurulu sürümde Chrome'a yüklenecek klasör %APPDATA%\AIDA\extension. Kurulum klasörü güncellemede silinip yeniden
// yazıldığı için Chrome oradan yüklenirse uzantı kopar; bu sabit kopya her yeni sürümde tazelenir.
function prepareExtension() {
  const src = bundledExt();
  if (!app.isPackaged) return src;
  const dest = path.join(app.getPath('userData'), 'extension');
  try {
    if (extVersionOf(dest) !== extVersionOf(src)) {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(src, dest, { recursive: true });
    }
    return dest;
  } catch {
    return src;
  }
}

// GitHub'daki son sürüm (Sentinel Hub ile aynı kaynak: Release etiketi)
async function checkAppUpdate() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'AIDA', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const rel = await res.json();
    if (!rel.tag_name || !isNewer(rel.tag_name, app.getVersion())) return null;
    return { latest: String(rel.tag_name).replace(/^v/i, ''), url: String(rel.html_url || `https://github.com/${REPO}/releases/latest`) };
  } catch {
    return null;
  }
}

let win, engine, bridge, pushTimer;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function saveSettings(s) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch {}
}

function push() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (win && !win.isDestroyed()) win.webContents.send('aida:state', engine.snapshot());
  }, 40);
}

function launchChrome() {
  const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA];
  const exe = pf.filter(Boolean).map((p) => path.join(p, 'Google', 'Chrome', 'Application', 'chrome.exe')).find((p) => fs.existsSync(p));
  if (!exe) return false;
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  return true;
}

app.whenReady().then(() => {
  const extDir = prepareExtension();
  bridge = new Bridge(47821, { expectedExt: extVersionOf(extDir) });
  engine = new Engine(bridge, loadSettings());
  engine.appVersion = app.getVersion();
  engine.on('change', push);
  checkAppUpdate().then((u) => { if (u) { engine.update = u; push(); } });
  // Geliştirmede proje klasörüne, kurulu sürümde %APPDATA%\AIDA altına
  const logFile = path.join(app.isPackaged ? app.getPath('userData') : __dirname, 'debug.log');
  try { fs.writeFileSync(logFile, `--- AIDA oturumu ${new Date().toISOString()} ---
`); } catch {}
  engine.on('log', (line) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString().slice(11, 23)}] ${line}
`); } catch {} });
  // Geliştirici ayarı: açıksa konuşma sohbet.txt dosyasına canlı yazılır (başka araçlar okuyabilsin diye)
  const chatFile = path.join(path.dirname(logFile), 'sohbet.txt');
  engine.on('entry', (e) => {
    if (!engine.settings.saveTranscript) return;
    try {
      const line = `[${new Date(e.ts).toLocaleTimeString('tr-TR')}] ${e.from}: ${String(e.text).replace(/\s+$/, '')}

`;
      if (engine.transcript.length <= 1) fs.writeFileSync(chatFile, `--- AIDA sohbeti ${new Date().toISOString()} ---

${line}`);
      else fs.appendFileSync(chatFile, line);
    } catch {}
  });
  bridge.on('error-state', push);
  bridge.start();

  // Ekran düzeni: AIDA solda (%60), yapay zeka pencereleri sağ sütunda alt alta (3 sıra).
  // 3'ten fazla katılımcıda pencereler biraz kaydırılarak üst üste biner; küçültülebilirler.
  const wa = screen.getPrimaryDisplay().workArea;
  const mainW = Math.round(wa.width * 0.6);
  const slotH = Math.floor(wa.height / 3);
  engine.getBounds = (_id, index = 0) => {
    const i = Math.max(0, index);
    const shift = Math.floor(i / 3) * 36;
    return {
      left: wa.x + mainW + shift, top: wa.y + (i % 3) * slotH + shift,
      width: wa.width - mainW - shift, height: slotH - shift,
    };
  };

  win = new BrowserWindow({
    x: wa.x, y: wa.y, width: mainW, height: wa.height, minWidth: 760, minHeight: 600,
    backgroundColor: '#101522', title: 'AIDA', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon-256.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.AIDA_SMOKE) {
    win.webContents.once('did-finish-load', () => setTimeout(() => { console.log('SMOKE_OK'); app.quit(); }, 1500));
  }

  ipcMain.handle('aida:state', () => engine.snapshot());
  ipcMain.handle('aida:invite', (_e, id) => engine.invite(id));
  ipcMain.handle('aida:dismiss', (_e, id) => engine.dismiss(id));
  ipcMain.handle('aida:resetSeat', (_e, id) => engine.resetSeat(id));
  ipcMain.handle('aida:send', (_e, text) => engine.send(text));
  ipcMain.handle('aida:auto', (_e, on) => engine.setAuto(on));
  ipcMain.handle('aida:stop', () => engine.stop());
  ipcMain.handle('aida:newSession', () => engine.newSession());
  ipcMain.handle('aida:settings', (_e, s) => { engine.updateSettings(s); saveSettings(engine.settings); });
  ipcMain.handle('aida:openExt', () => shell.openPath(extDir));
  ipcMain.handle('aida:extPath', () => extDir);
  ipcMain.handle('aida:openUpdate', () => {
    const u = engine.update;
    if (u && /^https:\/\/github\.com\//.test(u.url)) shell.openExternal(u.url);
  });
  ipcMain.handle('aida:openLog', () => shell.openPath(logFile));
  ipcMain.handle('aida:launchChrome', () => launchChrome());
});

app.on('window-all-closed', () => { if (bridge) bridge.stop(); app.quit(); });
