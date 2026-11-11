// AIDA Bridge - service worker: uygulamayla WebSocket, sekmelerle mesajlaşma
const PORT = 47821;
let ws = null;
let pingTimer = null;
let tickTimer = null;
const active = new Map(); // reqId -> tabId

let tabIds = []; // ritim verilecek AIDA sekmeleri
const getTabs = async () => {
  const tabs = (await chrome.storage.session.get('tabs')).tabs || {};
  tabIds = Object.values(tabs);
  if (tabIds.length) startTick();
  return tabs;
};
const setTabs = (tabs) => {
  tabIds = Object.values(tabs);
  if (tabIds.length) startTick();
  return chrome.storage.session.set({ tabs });
};

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  try { ws = new WebSocket(`ws://127.0.0.1:${PORT}`); } catch { return; }
  ws.onopen = async () => {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ type: 'ping' }), 20000);
    // Sürüm: uygulama, kendisiyle gelen uzantı sürümüyle karşılaştırıp eskiyse "yenile" uyarısı gösterir
    send({ type: 'hello', version: chrome.runtime.getManifest().version, tabs: await collectTabStates() });
  };
  ws.onmessage = (e) => { try { handleCommand(JSON.parse(e.data)); } catch (err) { console.warn(err); } };
  ws.onclose = () => { clearInterval(pingTimer); ws = null; setTimeout(connect, 2000); };
  ws.onerror = () => {};
}

async function collectTabStates() {
  const tabs = await getTabs();
  const out = {};
  for (const [ai, tabId] of Object.entries(tabs)) {
    try {
      await chrome.tabs.get(tabId);
      let state = 'login';
      try {
        const r = await chrome.tabs.sendMessage(tabId, { cmd: 'probe' });
        if (r && r.ready) state = 'ready';
      } catch {}
      out[ai] = { tabId, state };
    } catch {
      delete tabs[ai];
    }
  }
  await setTabs(tabs);
  return out;
}

function startTick() {
  if (tickTimer) return;
  // Küçültülmüş/arkada kalan sekmelerde zamanlayıcılar yavaşlar; ritmi buradan veriyoruz.
  // Sekmedeki page.js bu ritimle sitenin kendi zamanlayıcılarını da çalıştırır.
  tickTimer = setInterval(() => {
    const ids = new Set([...active.values(), ...tabIds]);
    if (!ids.size) { clearInterval(tickTimer); tickTimer = null; return; }
    for (const id of ids) chrome.tabs.sendMessage(id, { cmd: 'tick' }).catch(() => {});
  }, 250);
}

// Hazır olmayan sekmelerin durumunu (yükleniyor mu, doğrulama sayfası mı) uygulamaya bildir
const waiting = new Set();
let infoTimer = null;
function startInfo() {
  if (infoTimer) return;
  infoTimer = setInterval(async () => {
    if (!waiting.size) { clearInterval(infoTimer); infoTimer = null; return; }
    const tabs = await getTabs();
    for (const ai of [...waiting]) {
      try {
        const t = await chrome.tabs.get(tabs[ai]);
        send({ type: 'tabinfo', ai, status: t.status, title: t.title || '', url: t.url || t.pendingUrl || '' });
      } catch { waiting.delete(ai); }
    }
  }, 3000);
}

async function handleCommand(m) {
  const tabs = await getTabs();
  if (m.type === 'open') {
    if (tabs[m.ai]) { try { await chrome.tabs.remove(tabs[m.ai]); } catch {} }
    let tab;
    if (m.bounds) {
      // AIDA'nın yanında, ekranın sağında küçük pencere: görünür kalan sayfa arka plan kısıtlamasına takılmaz
      const b = m.bounds;
      const w = await chrome.windows.create({ url: m.url, focused: false, left: b.left, top: b.top, width: b.width, height: b.height });
      tab = w.tabs[0];
    } else {
      tab = await chrome.tabs.create({ url: m.url, active: false });
    }
    tabs[m.ai] = tab.id;
    await setTabs(tabs);
    waiting.add(m.ai);
    startInfo();
    try { await chrome.tabs.update(tab.id, { autoDiscardable: false }); } catch {}
  } else if (m.type === 'close') {
    if (tabs[m.ai]) {
      const id = tabs[m.ai];
      delete tabs[m.ai];
      await setTabs(tabs);
      try { await chrome.tabs.remove(id); } catch {}
    }
  } else if (m.type === 'ask') {
    const tabId = tabs[m.ai];
    if (!tabId) return send({ type: 'result', reqId: m.reqId, ai: m.ai, ok: false, error: 'tab-closed' });
    active.set(m.reqId, tabId);
    startTick();
    try {
      await chrome.tabs.sendMessage(tabId, { cmd: 'ask', reqId: m.reqId, text: m.text, timeoutMs: m.timeoutMs });
    } catch {
      active.delete(m.reqId);
      send({ type: 'result', reqId: m.reqId, ai: m.ai, ok: false, error: 'tab-unreachable' });
    }
  } else if (m.type === 'cancel') {
    if (m.reqId) {
      const id = active.get(m.reqId);
      if (id) chrome.tabs.sendMessage(id, { cmd: 'cancel', reqId: m.reqId }).catch(() => {});
      active.delete(m.reqId);
      return;
    }
    for (const id of new Set(active.values())) chrome.tabs.sendMessage(id, { cmd: 'cancel' }).catch(() => {});
    active.clear();
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  connect();
  const tabId = sender.tab && sender.tab.id;
  getTabs().then((tabs) => {
    const ai = Object.keys(tabs).find((k) => tabs[k] === tabId);
    if (!ai) return; // AIDA'nın açmadığı sekmeleri yok say
    if (msg.type === 'tab') {
      if (msg.state === 'ready') waiting.delete(ai); else { waiting.add(ai); startInfo(); }
      send({ type: 'tab', ai, state: msg.state });
    }
    else if (msg.type === 'status') send({ type: 'status', reqId: msg.reqId, ai, phase: msg.phase });
    else if (msg.type === 'needVisible') {
      // Sekme gizliyse görünür yap (odağı çalmadan): sekmeyi etkinleştir, küçültülmüşse geri getir
      chrome.tabs.update(tabId, { active: true }).catch(() => {});
      chrome.tabs.get(tabId).then((t) => chrome.windows.get(t.windowId)).then((w) => {
        // Başka pencerelerin arkasındaki pencere "gizli" sayılır ve siteler güncellenmez: son çare olarak öne getir
        chrome.windows.update(w.id, w.state === 'minimized' ? { state: 'normal', focused: true } : { focused: true });
      }).catch(() => {});
    }
    else if (msg.type === 'debug') send({ type: 'debug', ai, data: msg.data });
    else if (msg.type === 'result') {
      active.delete(msg.reqId);
      send({ type: 'result', reqId: msg.reqId, ai, ok: msg.ok, text: msg.text, error: msg.error, detail: msg.detail });
    }
  });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabs = await getTabs();
  const ai = Object.keys(tabs).find((k) => tabs[k] === tabId);
  if (!ai) return;
  delete tabs[ai];
  await setTabs(tabs);
  for (const [rid, t] of active) if (t === tabId) active.delete(rid);
  send({ type: 'tab', ai, state: 'closed' });
});

chrome.alarms.create('aida-keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => { connect(); getTabs(); });
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
getTabs(); // servis çalışanı yeniden uyandıysa sekme ritmini sürdür
