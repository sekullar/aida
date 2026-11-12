const AI_META = {
  chatgpt: { cls: 'a-chatgpt', svg: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#111" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3.5l7 4v9l-7 4-7-4v-9z"/><circle cx="12" cy="12" r="2.6"/></svg>' },
  gemini: { cls: 'a-gemini', svg: '<svg viewBox="0 0 24 24" width="34" height="34" fill="#fff"><path d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10z"/></svg>' },
  claude: { cls: 'a-claude', svg: '<svg viewBox="0 0 24 24" width="34" height="34" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>' },
  deepseek: { cls: 'a-deepseek', svg: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13c2.5 5 10 6.5 15 2.5 2-1.6 3-4 3-6.5-1.5 1-3 1.2-4.5.8C14.5 6 10 5.5 7 8"/><circle cx="15.5" cy="11.5" r=".9" fill="#fff"/></svg>' },
  kimi: { cls: 'a-kimi', svg: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M7 13l9-9M10 10l7 10"/><circle cx="19" cy="5" r="1.6" fill="#1783FF" stroke="none"/></svg>' },
  grok: { cls: 'a-grok', svg: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M5 19L19 5" stroke="#888"/><circle cx="12" cy="12" r="6.5" stroke="#888"/></svg>' },
  qwen: { cls: 'a-qwen', svg: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z"/></svg>' },
  lechat: { cls: 'a-lechat', svg: '<svg viewBox="0 0 24 24" width="34" height="34" fill="#111"><path d="M4 4h4v4H4zM16 4h4v4h-4zM4 8h8v4H4zM12 8h8v4h-8zM4 12h4v4H4zM10 12h4v4h-4zM16 12h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z"/></svg>' },
};

const $ = (id) => document.getElementById(id);
let S = null;
let settingsOpen = false;
let feedIds = [];
let feedResetPending = false;

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const statusLabel = (s) => {
  if (s.conn === 'opening') return 'bağlanıyor…';
  if (s.conn === 'login') return 'giriş gerekli';
  if (s.conn === 'verify') return 'doğrulama gerekli';
  if (s.conn === 'closed') return 'sekme kapalı';
  switch (s.status) {
    case 'thinking': return s.note || 'düşünüyor';
    case 'listening': return 'dinliyor';
    case 'muted': return s.note || '-muted-';
    case 'limit': return 'LİMİT DOLDU';
    case 'error': return s.note || 'hata';
    default: return 'hazır';
  }
};

function layout() {
  const st = $('stage').getBoundingClientRect();
  const d = Math.max(180, Math.min(st.width * 0.48, st.height * 0.55));
  const table = $('table');
  table.style.width = d + 'px';
  table.style.height = d + 'px';
  const cx = st.width / 2, cy = st.height * 0.44;
  const seats = [...document.querySelectorAll('.seat:not(.seat-exit)')];
  const n = seats.length;
  $('seats').classList.toggle('compact', n > 4);
  const rx = Math.max(0, Math.min(d / 2 + (n > 4 ? 49 : 58), st.width / 2 - 48));
  const ry = Math.max(0, Math.min(d / 2 + 47, cy - 52, st.height - cy - 74));
  seats.forEach((el, i) => {
    const deg = n === 1 ? -90 : -90 + (360 * i) / n;
    const a = (deg * Math.PI) / 180;
    el.style.left = cx + rx * Math.cos(a) + 'px';
    el.style.top = cy + ry * Math.sin(a) + 'px';
  });
  // Konuşan koltuktan masa merkezine akan ışık hattı
  let beam = document.getElementById('beam');
  if (!beam) { beam = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); beam.id = 'beam'; beam.setAttribute('aria-hidden', 'true'); $('stage').insertBefore(beam, $('seats')); }
  const lines = seats.filter((x) => x.classList.contains('thinking')).map((el) => {
    const sx = parseFloat(el.style.left), sy = parseFloat(el.style.top);
    const dx = cx - sx, dy = cy - sy, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    return [sx + ux * 36, sy + uy * 36, cx - ux * (d * 0.2), cy - uy * (d * 0.2)].map((v) => Math.round(v));
  });
  const sig = JSON.stringify(lines);
  if (beam.dataset.sig !== sig) { // aynıysa dokunma: akış animasyonu baştan başlamasın
    beam.dataset.sig = sig; beam.innerHTML = '';
    for (const [x1, y1, x2, y2] of lines) {
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', x1); ln.setAttribute('y1', y1); ln.setAttribute('x2', x2); ln.setAttribute('y2', y2);
      beam.appendChild(ln);
    }
  }
}

function renderSeats() {
  const host = $('seats');
  const invited = S.seats.filter((s) => s.invited);
  const wanted = new Set(invited.map((s) => s.id));
  for (const old of [...host.querySelectorAll('.seat:not(.seat-exit)')]) {
    if (!wanted.has(old.dataset.id)) {
      old.classList.add('seat-exit');
      old.addEventListener('animationend', (event) => { if (event.target === old) old.remove(); }, { once: true });
      setTimeout(() => old.remove(), 700);
    }
  }
  for (const s of invited) {
    const bad = s.conn !== 'ready';
    let el = [...host.children].find((node) => node.dataset.id === s.id && !node.classList.contains('seat-exit'));
    if (!el) {
      el = document.createElement('div');
      el.className = 'seat seat-enter';
      el.dataset.id = s.id;
      el.innerHTML = `<div class="seat-inner"><div class="avatar ${AI_META[s.id].cls}">${AI_META[s.id].svg}</div><div class="name"></div><div class="chip"></div></div>`;
      host.appendChild(el);
      el.addEventListener('animationend', () => el.classList.remove('seat-enter'), { once: true });
    }
    el.className = `seat ${bad ? 'bad' : s.status}${el.classList.contains('seat-enter') ? ' seat-enter' : ''}`;
    el.querySelector('.name').textContent = s.name;
    const chip = el.querySelector('.chip');
    chip.textContent = statusLabel(s);
    chip.onclick = (s.status === 'limit' || s.status === 'error') ? () => window.aida.resetSeat(s.id) : null;
  }
  layout();
}

function renderCenter() {
  const c = $('center');
  const update = (html) => {
    if (c.innerHTML === html) return;
    c.classList.add('center-swap');
    c.innerHTML = html;
    requestAnimationFrame(() => c.classList.remove('center-swap'));
  };
  const invited = S.seats.filter((s) => s.invited);
  if (!invited.length) {
    update('<img class="tc-logo" src="../assets/logo.svg" alt=""><div class="tc-title">AIDA</div><div class="tc-hint">Masa boş. Sağ üstteki ayarlardan yapay zeka davet et.</div>');
    return;
  }
  const ready = invited.filter((s) => s.conn === 'ready' && s.status !== 'limit' && s.status !== 'error').length;
  const blocked = invited.filter((s) => s.conn !== 'ready' && s.note);
  let main;
  if (extOutdated()) main = `<div class="tc-warn">Chrome'daki AIDA Bridge uzantısı güncel değil (${esc(extVerText())}, gereken v${esc(S.expectedExt)}). Ayarlar'daki adımlarla yenile.</div>`;
  else if (!S.running && blocked.length) main = blocked.map((s) => `<div class="tc-hint"><b>${esc(s.name)}:</b> ${esc(s.note)}</div>`).join('');
  else if (S.running && S.phase) main = `<span class="dots">${esc(S.phase)}</span>`;
  else if (S.running) main = '<span class="dots">Masa çalışıyor</span>';
  else if (!ready) main = '<span class="tc-hint">Katılımcıların hazır olmasını bekliyor…</span>';
  else main = `<span class="tc-hint">Bir mesaj yaz, sıra ${esc(invited.map((s) => s.name).join(' → '))} olarak döner.</span>`;
  update(`<div class="tc-title">${S.auto ? 'OTOPİLOT' : 'YUVARLAK MASA'}</div><div class="tc-main">${main}</div>`);
}

function renderFeed() {
  const feed = $('feed');
  const entries = S.transcript || [];
  const ids = entries.map((e, i) => String(e.id == null ? `${e.kind || 'msg'}:${e.ts || ''}:${i}` : e.id));
  const reset = feedResetPending || ids.length < feedIds.length || ids.some((id, i) => i < feedIds.length && id !== feedIds[i]);
  if (!reset && ids.length === feedIds.length) return;
  const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  const start = reset ? 0 : feedIds.length;
  if (reset) feed.innerHTML = '';
  for (let i = start; i < entries.length; i++) {
    const e = entries[i];
    const div = document.createElement('div');
    if (e.kind === 'system') {
      div.className = 'sys' + (e.deliver ? ' warn' : '');
      div.textContent = e.text;
    } else {
      const isUser = e.from === 'user';
      const name = isUser ? 'Sen' : (S.seats.find((s) => s.id === e.from) || {}).name || e.from;
      div.className = 'msg' + (e.kind === 'pass' ? ' pass' : '');
      const mini = isUser ? 'mini user' : `mini ${AI_META[e.from] ? AI_META[e.from].cls : ''}`;
      div.innerHTML = `<div class="${mini}"></div><div class="body"><div class="who">${esc(name)}${e.ts ? ` <time>${esc(new Date(e.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))}</time>` : ''}</div><div class="txt">${esc(e.kind === 'pass' ? 'pas geçti (-muted-)' : e.text)}</div></div>`;
    }
    div.dataset.entryId = ids[i];
    div.classList.add('feed-enter');
    feed.appendChild(div);
  }
  feedIds = ids;
  feedResetPending = false;
  if (nearBottom) feed.scrollTop = feed.scrollHeight;
}

// Bağlı uzantı, uygulamayla gelen sürümden farklıysa (eski kopya yüklü / yenilenmemiş)
const extOutdated = () => !!(S.extension && S.expectedExt && S.extVersion !== S.expectedExt);
const extVerText = () => (S.extVersion && S.extVersion !== '0' ? 'v' + S.extVersion : 'eski sürüm');

function renderControls() {
  const old = extOutdated();
  $('extChip').textContent = !S.extension ? 'Uzantı bağlı değil' : old ? 'Uzantı güncel değil' : 'Uzantı bağlı';
  $('extChip').className = 'ext-chip ' + (!S.extension ? 'off' : old ? 'old' : 'on');
  $('extChip').title = old ? `Chrome'daki AIDA Bridge ${extVerText()}, bu sürümle gelen v${S.expectedExt}. Ayarlar'daki adımlarla yenile.` : '';
  $('updChip').hidden = !S.update;
  if (S.update) {
    $('updChip').textContent = `Yeni sürüm: v${S.update.latest}`;
    $('updChip').title = "Sentinel Hub'dan güncelle ya da GitHub'dan indir";
  }
  $('auto').checked = S.auto;
  $('btnStop').hidden = !S.running && !S.auto;
  $('roundInfo').textContent = S.round ? `${S.round}. tur` : '';
}

function renderSettings() {
  if (!settingsOpen) return;
  const list = $('inviteList');
  const sig = JSON.stringify(S.seats.map((s) => [s.id, s.invited, statusLabel(s)]));
  if (list.dataset.sig !== sig) {
  list.dataset.sig = sig;
  list.innerHTML = '';
  for (const s of S.seats) {
    const row = document.createElement('div');
    row.className = 'invite-row';
    row.innerHTML = `<div class="avatar ${AI_META[s.id].cls}"></div><div class="info"><b>${esc(s.name)}</b><small>${s.invited ? esc(statusLabel(s)) : 'masada değil'}</small></div>`;
    const btn = document.createElement('button');
    btn.textContent = s.invited ? 'Masadan çıkar' : 'Davet et';
    btn.className = s.invited ? '' : 'primary';
    btn.onclick = async () => {
      if (s.invited) await window.aida.dismiss(s.id);
      else {
        const r = await window.aida.invite(s.id);
        if (r && r.error === 'no-extension') alert('Önce Chrome uzantısını bağlaman gerekiyor (aşağıdaki adımlara bak).');
      }
    };
    row.appendChild(btn);
    list.appendChild(row);
  }
  }
  const box = $('extBox');
  $('verInfo').textContent = `AIDA v${S.appVersion || '?'} · Uzantı ${S.extVersion ? extVerText() : '—'}`;
  if (extOutdated()) {
    box.innerHTML = `<p style="color:var(--danger)">Chrome'daki AIDA Bridge ${esc(extVerText())}, bu AIDA sürümüyle gelen <b>v${esc(S.expectedExt)}</b>. Yeni siteler ve düzeltmeler çalışmaz.</p>
      <ol><li><code>chrome://extensions</code> sayfasında AIDA Bridge'in <b>↻ yenile</b> düğmesine bas.</li>
      <li>Hâlâ eskiyse uzantıyı <b>Kaldır</b>, sonra <b>Paketlenmemiş öğe yükle</b> ile aşağıdaki klasörü seç.</li>
      ${S.extCopies > 1 ? '<li>Chrome\'da birden fazla AIDA Bridge yüklü görünüyor; yalnızca bu klasördekini bırak.</li>' : ''}
      <li>Yapay zeka pencerelerini yenile.</li></ol>
      <div class="row"><button id="bExt">Uzantı klasörünü aç</button></div>`;
    $('bExt').onclick = () => window.aida.openExtensionFolder();
  } else if (S.extension) box.innerHTML = '<span style="color:var(--ok)">Uzantı bağlı.</span> Davet ettiğin yapay zekalar Chrome\'da yeni sohbet olarak açılır. Giriş yapılmamışsa sekmede giriş yapman yeterli.';
  else {
    box.innerHTML = `${S.bridgeError ? `<p style="color:var(--danger)">${esc(S.bridgeError)}</p>` : ''}
      <ol><li>Chrome'da <code>chrome://extensions</code> aç, sağ üstten <b>Geliştirici modu</b>nu aç.</li>
      <li><b>Paketlenmemiş öğe yükle</b> de ve aşağıdaki "Uzantı klasörünü aç" düğmesinin açtığı klasörü seç.</li>
      <li>Birkaç saniye içinde yukarıdaki rozet "Uzantı bağlı" olur.</li></ol>
      <div class="row"><button id="bExt">Uzantı klasörünü aç</button><button id="bChrome">Chrome'u başlat</button></div>`;
    $('bExt').onclick = () => window.aida.openExtensionFolder();
    $('bChrome').onclick = () => window.aida.launchChrome();
  }
}

function render() {
  renderSeats(); renderCenter(); renderFeed(); renderControls(); renderSettings();
}

async function send() {
  const t = $('input').value.trim();
  if (!t) return;
  const r = await window.aida.send(t);
  if (r.ok) $('input').value = '';
  else if (r.error === 'no-seats') alert('Masada cevap verebilecek hazır bir yapay zeka yok. Ayarlardan davet et ve sekmenin hazır olmasını bekle.');
}

function openSettings() {
  settingsOpen = true;
  $('setWords').value = S.settings.maxWords;
  $('setTimeout').value = S.settings.timeoutSec;
  $('setRounds').value = S.settings.maxRounds;
  $('setSave').checked = !!S.settings.saveTranscript;
  $('modal').hidden = false;
  $('inviteList').dataset.sig = '';
  renderSettings();
  $('btnClose').focus();
}

$('btnSettings').onclick = openSettings;
$('btnTheme').onclick = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
$('btnClose').onclick = () => { settingsOpen = false; $('modal').hidden = true; $('btnSettings').focus(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && settingsOpen) $('btnClose').click(); });
$('modal').onclick = (e) => { if (e.target === $('modal')) $('btnClose').click(); };
$('btnSave').onclick = async () => {
  await window.aida.saveSettings({ maxWords: $('setWords').value, timeoutSec: $('setTimeout').value, maxRounds: $('setRounds').value, saveTranscript: $('setSave').checked });
  $('btnClose').click();
};
$('btnSend').onclick = send;
$('updChip').onclick = () => window.aida.openUpdate();
$('btnStop').onclick = () => window.aida.stop();
$('btnNew').onclick = () => { if (confirm('Konuşma silinsin ve AI sekmeleri yeni sohbetle yeniden açılsın mı?')) { feedResetPending = true; feedIds = []; window.aida.newSession(); } };
$('auto').onchange = (e) => window.aida.setAuto(e.target.checked);
$('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); } });
const resizeInput = () => { const input = $('input'); input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 150) + 'px'; };
$('input').addEventListener('input', resizeInput);
function setTheme(theme, persist) {
  document.documentElement.dataset.theme = theme;
  const button = $('btnTheme');
  const next = theme === 'light' ? 'koyu' : 'açık';
  button.title = `${next[0].toLocaleUpperCase('tr-TR')}${next.slice(1)} temaya geç`;
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', String(theme === 'light'));
  $('themeIcon').innerHTML = theme === 'light'
    ? '<path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>'
    : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>';
  if (persist) { try { localStorage.setItem('aida-theme', theme); } catch (_) {} }
}
let initialTheme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
try { const savedTheme = localStorage.getItem('aida-theme'); if (savedTheme === 'light' || savedTheme === 'dark') initialTheme = savedTheme; } catch (_) {}
setTheme(initialTheme, false);
window.addEventListener('resize', layout);
$('seats').addEventListener('pointermove', (e) => {
  const seat = e.target.closest('.seat');
  if (!seat) return;
  const r = seat.querySelector('.avatar').getBoundingClientRect();
  seat.style.setProperty('--mx', `${Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))}%`);
  seat.style.setProperty('--my', `${Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100))}%`);
});

window.aida.onState((s) => { S = s; render(); });
window.aida.state().then((s) => { S = s; render(); });
