// AIDA Bridge - sayfa betiği: mesaj yaz, gönder, cevabı oku, limit tespit et.
// Site arayüzleri değişirse yalnızca aşağıdaki SITES seçicilerini güncellemek yeterli.
(() => {
  if (window.__aidaLoaded) return;
  window.__aidaLoaded = true;

  const SITES = {
    chatgpt: {
      input: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'textarea[name="prompt-textarea"]'],
      send: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label*="gönder" i]'],
      stop: ['button[data-testid="stop-button"]', 'button[aria-label="Stop streaming"]', 'button[aria-label*="stop" i]', 'button[aria-label*="durdur" i]'],
      messages: ['[data-message-author-role="assistant"]', '[data-dil-response]'],
      userMessages: ['[data-message-author-role="user"]', '[data-user-message-bubble]'],
      read: (el) => (el.querySelector('.markdown') || el).innerText,
      loggedOut: ['[data-testid="login-button"]'],
    },
    gemini: {
      input: ['rich-textarea .ql-editor', 'div.ql-editor[contenteditable="true"]', 'rich-textarea [contenteditable="true"]'],
      send: ['button.send-button', 'button[aria-label="Send message"]', 'button[aria-label*="gönder" i]', 'button[aria-label*="send" i]'],
      stop: ['button.stop', 'button[aria-label="Stop response"]', 'button[aria-label*="stop" i]', 'button[aria-label*="durdur" i]'],
      messages: ['model-response message-content', 'message-content', '.model-response-text'],
      userMessages: ['user-query', '.query-text'],
      read: (el) => el.innerText,
      loggedOut: ['a[href*="accounts.google.com/ServiceLogin"]'],
    },
    claude: {
      input: ['div[contenteditable="true"].ProseMirror', 'fieldset div[contenteditable="true"]', 'div[contenteditable="true"][data-testid="chat-input"]'],
      send: ['button[aria-label="Send message"]', 'button[aria-label*="send" i]', 'button[aria-label*="gönder" i]'],
      stop: ['button[aria-label="Stop response"]', 'button[aria-label*="stop" i]'],
      streaming: '[data-is-streaming="true"]',
      messages: ['div.font-claude-response', 'div.font-claude-message', '[data-is-streaming]'],
      userMessages: ['[data-testid="user-message"]', 'div.font-user-message'],
      read: (el) => [...el.querySelectorAll('.standard-markdown')].map((x) => x.innerText).join(String.fromCharCode(10, 10)) || el.innerText,
      loggedOut: ['input[type="email"]'],
    },
    deepseek: {
      input: ['textarea[name="search"]', 'textarea'],
      send: ['div[role="button"].ds-button--primary.ds-button--circle'],
      stop: [],
      // Gönder düğmesi cevap yazılırken "durdur" olur: kutu boşken düğme etkinse üretim sürüyor
      generating: () => {
        const b = document.querySelector('div[role="button"].ds-button--primary.ds-button--circle');
        const ta = document.querySelector('textarea[name="search"], textarea');
        return !!(b && enabled(b) && ta && !ta.value.trim());
      },
      messages: ['.ds-assistant-message-main-content'],
      userMessages: ['.ds-message'],
      read: (el) => el.innerText,
      loggedOut: [],
    },
    kimi: {
      input: ['div.chat-input-editor[contenteditable="true"]', '[data-lexical-editor="true"]'],
      paste: true,
      send: ['.send-button-container'],
      stop: ['.send-button-container.stop', '.send-button-container.loading'],
      messages: ['.segment-assistant'],
      userMessages: ['.segment-user'],
      // Düşünme bölümünü atla, yalnızca asıl cevap
      read: (el) => [...el.querySelectorAll('.markdown-container')].filter((m) => !m.closest('.thinking-container')).map((m) => m.innerText).join(String.fromCharCode(10, 10)) || el.innerText,
      loggedOut: [],
    },
    grok: {
      input: ['div.tiptap.ProseMirror[contenteditable="true"]', 'div.ProseMirror[contenteditable="true"]'],
      paste: true,
      send: ['button[data-testid="chat-submit"]', 'button[aria-label="Gönder"]', 'button[aria-label="Submit"]'],
      stop: ['button[aria-label*="durdur" i]', 'button[aria-label*="stop" i]'],
      messages: ['[data-testid="assistant-message"]'],
      userMessages: ['[data-testid="user-message"]'],
      read: (el) => (el.querySelector('.response-content-markdown') || el).innerText,
      loggedOut: [],
    },
    qwen: {
      input: ['textarea.message-input-textarea', 'textarea'],
      send: ['button.send-button'],
      stop: ['button.stop-button'],
      messages: ['.chat-response-message'],
      userMessages: ['.chat-user-message'],
      read: (el) => [...el.querySelectorAll('.phase-answer')].map((x) => x.innerText).join(String.fromCharCode(10, 10)) || el.innerText,
      loggedOut: [],
    },
    lechat: {
      input: ['div.rich-text-editor.ProseMirror[contenteditable="true"]', 'div.ProseMirror[contenteditable="true"]'],
      paste: true,
      send: ['button[aria-label="Send"]', 'button[aria-label*="gönder" i]'],
      stop: ['button[aria-label="Stop generation"]', 'button[aria-label*="stop" i]', 'button[aria-label*="durdur" i]'],
      messages: ['[data-message-author-role="assistant"]'],
      userMessages: ['[data-message-author-role="user"]'],
      read: (el) => [...el.querySelectorAll('[data-message-part-type="answer"]')].map((x) => x.innerText).join(String.fromCharCode(10, 10)) || el.innerText,
      loggedOut: [],
    },
  };

  const LIMIT_PATTERNS = [
    /(reached|hit|exceeded) (your|our|the|its) .{0,45}limit/i,
    /usage limit/i, /message limit/i, /limit (will )?resets?/i, /limit (has been )?reached/i,
    /out of (free )?(messages|usage)/i, /free messages? until/i, /too many requests/i,
    /come back (later|tomorrow|at)/i, /try again (later|tomorrow|in \d)/i,
    /(kullanım|mesaj) (limit|sınır)/i, /(limit|sınır)(ine|ına|e|a) ulaş/i, /daha sonra tekrar dene/i,
    /ücretsiz mesaj/i,
  ];

  const host = location.hostname;
  const HOSTS = [
    ['claude.ai', 'claude'], ['gemini.google', 'gemini'], ['deepseek.com', 'deepseek'], ['kimi.', 'kimi'],
    ['grok.com', 'grok'], ['qwen.ai', 'qwen'], ['mistral.ai', 'lechat'], ['chatgpt.com', 'chatgpt'], ['openai.com', 'chatgpt'],
  ];
  const AI = (HOSTS.find(([h]) => host.includes(h)) || [null, 'chatgpt'])[1];
  const S = SITES[AI];

  // ---------- yardımcılar ----------
  const qs = (list) => { for (const s of list) { const el = document.querySelector(s); if (el) return el; } return null; };
  const qsa = (list) => { for (const s of list) { const n = [...document.querySelectorAll(s)]; if (n.length) return n; } return []; };
  const err = (code, detail) => Object.assign(new Error(detail || code), { code });
  const norm = (t) => String(t || '').replace(/\s+/g, '');
  const flat = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  // Düğme etkin mi: disabled, aria-disabled ya da "disabled" / "x--disabled" sınıfı (div düğmeler).
  // Tailwind'in "aria-disabled:..." / "bg-state-disabled" gibi stil sınıfları sayılmaz.
  const enabled = (b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true'
    && !String(b.className).split(/\s+/).some((c) => c === 'disabled' || c === 'is-disabled' || c.endsWith('--disabled'));

  // Arka plan sekmelerinde setTimeout yavaşlar; uzantı arka planı her 400 ms "tick" gönderir.
  let waiters = [];
  const tick = (ms = 500) => new Promise((res) => {
    const done = () => { clearTimeout(t); waiters = waiters.filter((w) => w !== done); res(); };
    const t = setTimeout(done, ms);
    waiters.push(done);
  });
  // Gizli sayfada setTimeout güvenilmez; bekleme süresini uzantı ritmiyle say
  const sleep = async (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) await tick(Math.max(1, Math.min(400, end - Date.now())));
  };

  async function waitFor(fn, ms, signal) {
    const end = Date.now() + ms;
    for (;;) {
      if (signal && signal.aborted) throw err('cancelled');
      const v = fn();
      if (v) return v;
      if (Date.now() > end) return null;
      await tick(400);
    }
  }

  const visible = (el) => !!(el.offsetParent || el.getClientRects().length);
  // Seçici tutmazsa sayfadaki görünür metin kutusuna düş
  const findInput = () => qs(S.input)
    || [...document.querySelectorAll('div[contenteditable="true"], textarea')].find((e) => visible(e) && e.getBoundingClientRect().width > 150)
    || null;

  // Cloudflare vb. "insan olduğunu doğrula" sayfası
  const isChallenge = () => /just a moment|bir dakika|attention required|verify you are human|doğrula|security check/i.test(document.title)
    || !!document.querySelector('#challenge-form, iframe[src*="challenges.cloudflare.com"], [data-testid="challenge"]');

  const isGenerating = () => !!qs(S.stop) || (S.streaming && !!document.querySelector(S.streaming)) || (S.generating ? S.generating() : false);

  function snapshot() {
    const msgs = qsa(S.messages);
    const last = msgs[msgs.length - 1];
    return { count: msgs.length, lastText: last ? S.read(last) : '' };
  }

  function detectLimit() {
    const skip = [...S.messages, ...S.userMessages, ...S.input].join(',');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue;
      if (!t || t.length < 12 || t.length > 400) continue;
      const p = n.parentElement;
      if (!p || p.closest('script,style,noscript') || p.closest(skip)) continue;
      if (LIMIT_PATTERNS.some((re) => re.test(t))) return true;
    }
    return false;
  }

  // ---------- yazma / gönderme ----------
  async function setInput(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const sel = () => { const r = document.createRange(); r.selectNodeContents(el); const g = getSelection(); g.removeAllRanges(); g.addRange(r); };
    const clear = () => { el.focus(); sel(); document.execCommand('delete'); };
    const lines = text.split(String.fromCharCode(10)).map((l) => l.split(String.fromCharCode(13)).join(''));
    const full = lines.filter(Boolean);
    // Metin girdi mi, satırlar birbirine yapışmadı mı ("testi.Sadece" gibi)
    const has = () => norm(el.innerText).includes(norm(text).slice(0, 30))
      && (full.length < 2 || flat(el.innerText).includes(flat(full[0] + ' ' + full[1])));
    // Lexical/tiptap gibi editörler: önce temizle, sonra yapıştırma olayı (seçim editöre geç ulaşıyor, beklemek şart)
    const pasteIn = async () => {
      el.focus(); sel(); await sleep(120);
      document.execCommand('delete'); await sleep(200);
      if (el.innerText.trim()) { sel(); document.execCommand('selectAll'); await sleep(120); }
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(400);
    };
    if (S.paste) {
      await pasteIn();
      if (has()) return;
    }
    clear();
    // Satır satır yaz: Quill/ProseMirror çok satırlı insertText'i bozabiliyor
    // Quill (Gemini) her paragraftan sonra kendini yeniden çizer; imleci sona alıp kısa süre beklemek şart.
    // Gizli sekmede setTimeout >=1 sn'ye yavaşlar, bu yüzden orada MessageChannel ile görev geçişi kullanıyoruz.
    const pause = async () => {
      if (document.visibilityState === 'visible') return sleep(50);
      for (let k = 0; k < 3; k++) await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
    };
    const caretEnd = () => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); };
    await pause();
    for (let i = 0; i < lines.length; i++) {
      caretEnd();
      if (i > 0) { document.execCommand('insertParagraph'); await pause(); caretEnd(); }
      if (lines[i]) { document.execCommand('insertText', false, lines[i]); await pause(); }
    }
    await sleep(300);
    if (has()) return;
    if (!S.paste) { await pasteIn(); if (has()) return; }
    throw err('send-failed', 'metin kutuya yazılamadı');
  }

  const inputEmpty = (el) => !String(el.value ?? el.innerText ?? '').trim();

  function pressEnter(el) {
    el.focus();
    const o = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', o));
    el.dispatchEvent(new KeyboardEvent('keypress', o));
    el.dispatchEvent(new KeyboardEvent('keyup', o));
  }

  async function submit(input, signal) {
    const btn = await waitFor(() => {
      const b = qs(S.send);
      return b && enabled(b) ? b : null;
    }, 6000, signal);
    if (btn) btn.click(); else pressEnter(input);
    const ok = () => isGenerating() || inputEmpty(input);
    if (!(await waitFor(ok, 6000, signal))) {
      pressEnter(input);
      if (!(await waitFor(ok, 5000, signal))) throw err('send-failed');
    }
  }

  // ---------- cevabı bekle ----------
  function debugSnap(tag, extra = {}) {
    const msgs = qsa(S.messages);
    const last = msgs[msgs.length - 1];
    const stops = S.stop.map((s) => {
      const el = document.querySelector(s);
      return el ? `${s} => <${el.tagName.toLowerCase()} aria-label="${el.getAttribute('aria-label') || ''}" testid="${el.getAttribute('data-testid') || ''}">` : null;
    }).filter(Boolean);
    const sendEl = qs(S.send);
    report({ type: 'debug', data: {
      tag, msgCount: msgs.length, lastLen: last ? S.read(last).length : 0,
      lastTail: last ? S.read(last).slice(-80) : '', stops,
      streamingAttr: S.streaming ? !!document.querySelector(S.streaming) : null,
      send: sendEl ? (sendEl.getAttribute('aria-label') || sendEl.getAttribute('data-testid') || sendEl.className) : null,
      url: location.pathname, ...extra,
    } });
  }

  async function awaitResponse(base, signal, timeoutMs) {
    const t0 = Date.now();
    let started = false, sawGenerating = false, lastText = '', lastChange = Date.now(), lastLimitCheck = 0, lastDbg = 0;
    for (;;) {
      if (signal.aborted) throw err('cancelled');
      const msgs = qsa(S.messages);
      const last = msgs[msgs.length - 1];
      const text = last ? S.read(last).trim() : '';
      const generating = isGenerating();
      if (generating) sawGenerating = true;
      if (Date.now() - lastDbg > 4000) { lastDbg = Date.now(); debugSnap('wait', { started, sawGenerating, generating, baseCount: base.count }); }
      const changed = msgs.length > base.count || (last && text && text !== base.lastText.trim());
      if (!started && (changed || generating)) { started = true; lastText = text; lastChange = Date.now(); }

      if (started) {
        if (text !== lastText) { lastText = text; lastChange = Date.now(); }
        const stable = Date.now() - lastChange;
        const need = sawGenerating ? 1500 : 8000;
        if (!generating && text && stable >= need) return text;
      } else {
        if (Date.now() - lastLimitCheck > 3000) {
          lastLimitCheck = Date.now();
          if (detectLimit()) throw err('limit');
        }
        if (Date.now() - t0 > 40000) throw err('no-response');
      }
      if (Date.now() - t0 > timeoutMs) {
        if (started && text) return text;
        throw err('timeout');
      }
      await tick(400);
    }
  }

  // ---------- komutlar ----------
  const jobs = new Map();
  const report = (m) => { try { chrome.runtime.sendMessage({ ai: AI, ...m }); } catch {} };

  async function handleAsk({ reqId, text, timeoutMs }) {
    const ac = new AbortController();
    jobs.set(reqId, ac);
    try {
      const input = await waitFor(findInput, 8000, ac.signal);
      if (!input) throw err(qs(S.loggedOut) ? 'login' : 'no-input');
      if (detectLimit()) throw err('limit');
      await waitFor(() => !isGenerating(), 90000, ac.signal);
      const base = snapshot();
      report({ type: 'status', reqId, phase: 'typing' });
      try {
        await setInput(input, text);
      } catch (e) {
        // Son çare: gizli sayfada yazılamadıysa pencereyi bir anlığına görünür yapıp tekrar dene
        if (e.code !== 'send-failed' || document.visibilityState === 'visible') throw e;
        report({ type: 'needVisible' });
        await waitFor(() => document.visibilityState === 'visible', 5000, ac.signal);
        await sleep(300);
        await setInput(input, text);
      }
      await submit(input, ac.signal);
      report({ type: 'status', reqId, phase: 'generating' });
      const out = await awaitResponse(base, ac.signal, timeoutMs || 600000);
      debugSnap('done', { outLen: out.length });
      report({ type: 'result', reqId, ok: true, text: out });
    } catch (e) {
      debugSnap('fail', { error: e.code || 'failed', detail: e.message });
      report({ type: 'result', reqId, ok: false, error: e.code || 'failed', detail: e.message });
    } finally {
      jobs.delete(reqId);
    }
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.cmd === 'tick') {
      // Sayfa dünyasındaki yamaya (page.js) ritim ver: gizliyken bekleyen zamanlayıcıları çalıştırır
      document.dispatchEvent(new CustomEvent('__aida_pump'));
      waiters.slice().forEach((w) => w());
    }
    else if (msg.cmd === 'ask') { handleAsk(msg); sendResponse({ ack: true }); }
    else if (msg.cmd === 'cancel') jobs.forEach((ac) => ac.abort());
    else if (msg.cmd === 'probe') { sendResponse({ ready: !!findInput() }); lastState = null; }
  });

  // Durumu sürekli izle: giriş kutusu görününce 'ready', kaybolunca 'login' bildir
  let lastState = null;
  (async () => {
    for (;;) {
      const state = findInput() ? 'ready' : isChallenge() ? 'verify' : 'login';
      if (state !== lastState) { lastState = state; report({ type: 'tab', state }); }
      await sleep(2000);
    }
  })();
})();
