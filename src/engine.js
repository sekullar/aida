// AIDA tartışma motoru: sıra, dinleme (-muted-), otopilot, limit tespiti
const EventEmitter = require('events');

const AIS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  { id: 'kimi', name: 'Kimi', url: 'https://www.kimi.ai/en' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com/' },
  { id: 'qwen', name: 'Qwen', url: 'https://chat.qwen.ai/' },
  { id: 'lechat', name: 'Le Chat', url: 'https://chat.mistral.ai/chat' },
];

const DEFAULT_SETTINGS = { maxWords: 200, timeoutSec: 600, maxRounds: 0 };

const END_TAG = /\s*\[\[\s*B[İI]T[İI]R\s*\]\]\s*/gi;
const isMuted = (t) => /^[\W_]*muted[\W_]*$/i.test(String(t || '').trim());

const ERR_TEXT = {
  'no-response': 'Cevap başlamadı',
  timeout: 'Zaman aşımı',
  'no-input': 'Mesaj kutusu bulunamadı',
  'send-failed': 'Mesaj gönderilemedi',
  'bridge-lost': 'Uzantı bağlantısı koptu',
  'tab-unreachable': 'Sekmeye ulaşılamadı',
  failed: 'Bilinmeyen hata',
};

class Engine extends EventEmitter {
  constructor(bridge, settings = {}) {
    super();
    this.bridge = bridge;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.seats = AIS.map((a) => ({
      ...a, invited: false, conn: 'off', status: 'idle', note: '',
      seen: 0, intro: false, fails: 0,
    }));
    this.transcript = [];
    this.nextEntry = 1;
    this.nextReq = 1;
    this.pending = new Map();
    this.running = false;
    this.auto = false;
    this.stopFlag = false;
    this.pendingRound = false;
    this.round = 0;
    this.autoRounds = 0;
    this.phase = '';
    this.speaker = null;

    bridge.on('message', (m) => this.onMessage(m));
    bridge.on('connection', (up) => this.onConnection(up));
  }

  // ---------- durum ----------
  snapshot() {
    return {
      extension: this.bridge.connected(),
      bridgeError: this.bridge.error || null,
      // sürüm kontrolü: uygulama, bağlı uzantı ve beklenen (uygulamayla gelen) uzantı sürümü
      appVersion: this.appVersion || null,
      extVersion: this.bridge.clientVersion ? this.bridge.clientVersion() : null,
      expectedExt: this.bridge.expectedExt || null,
      extCopies: this.bridge.copies ? this.bridge.copies() : 1,
      update: this.update || null,
      seats: this.seats.map(({ id, name, invited, conn, status, note }) => ({ id, name, invited, conn, status, note })),
      transcript: this.transcript,
      running: this.running,
      auto: this.auto,
      round: this.round,
      phase: this.phase,
      speaker: this.speaker,
      settings: this.settings,
    };
  }
  changed() { this.emit('change'); }
  log(...a) { this.emit('log', a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); }
  seat(id) { return this.seats.find((s) => s.id === id); }
  usable(s) { return s.invited && s.conn === 'ready' && s.status !== 'limit' && s.status !== 'error'; }
  usableSeats() { return this.seats.filter((s) => this.usable(s)); }

  addEntry(from, text, kind = 'say', deliver = false) {
    const e = { id: this.nextEntry++, from, text, kind, deliver, ts: Date.now() };
    this.transcript.push(e);
    return e;
  }
  addSystem(text, deliver = false) { this.addEntry('system', text, 'system', deliver); }

  updateSettings(s) {
    const n = (v, d, min, max) => Math.min(max, Math.max(min, Number.isFinite(+v) ? +v : d));
    this.settings = {
      maxWords: n(s.maxWords, 200, 20, 1000),
      timeoutSec: n(s.timeoutSec, 600, 30, 1800),
      maxRounds: n(s.maxRounds, 0, 0, 500),
    };
    this.changed();
  }

  // ---------- uzantı olayları ----------
  onConnection(up) {
    if (!up) {
      for (const [id, p] of this.pending) p.resolve({ ok: false, error: 'bridge-lost' });
      this.pending.clear();
    }
    this.changed();
  }

  onMessage(m) {
    if (m.type !== 'status' && m.type !== 'tabinfo') this.log('<-', m.type === 'result' ? { ...m } : m);
    else if (m.type === 'tabinfo') this.log('<- tabinfo', m.ai, m.status, m.title, m.url);
    if (m.type === 'hello') {
      const tabs = m.tabs || {};
      for (const s of this.seats) {
        if (!s.invited) continue;
        const t = tabs[s.id];
        if (!t) { s.conn = 'closed'; s.note = 'Sekme kapalı'; }
        else if (t.state === 'ready') { s.conn = 'ready'; s.note = ''; }
        else if (t.state === 'login') { s.conn = 'login'; s.note = 'Giriş yapman gerekiyor'; }
      }
      this.changed();
    } else if (m.type === 'tabinfo') {
      const s = this.seat(m.ai);
      if (!s || !s.invited || s.conn === 'ready') return;
      const challenge = /just a moment|bir dakika|attention required|verify you are human|doğrula|security check/i.test(m.title || '');
      const loginUrl = /\/(log-?in|signin|auth)|accounts\.google\.com/i.test(m.url || '');
      if (challenge) { s.conn = 'verify'; s.note = 'Doğrulama gerekiyor: AI penceresinde "insan olduğunu doğrula" kutusunu işaretle'; }
      else if (loginUrl) { s.conn = 'login'; s.note = 'Giriş yapman gerekiyor (AI penceresinde)'; }
      else if (m.status === 'loading') { s.conn = 'opening'; s.note = 'Sayfa yükleniyor… uzun sürerse AI penceresini kontrol et'; }
      else if (s.conn === 'opening') { s.note = 'Sayfa açıldı ama giriş kutusu görünmüyor; AI penceresini kontrol et'; }
      this.changed();
    } else if (m.type === 'tab') {
      const s = this.seat(m.ai);
      if (!s || !s.invited) return;
      if (m.state === 'ready') { s.conn = 'ready'; s.note = ''; }
      else if (m.state === 'verify') { s.conn = 'verify'; s.note = 'Doğrulama gerekiyor: AI penceresinde "insan olduğunu doğrula" kutusunu işaretle'; }
      else if (m.state === 'login') { s.conn = 'login'; s.note = 'Giriş yapman gerekiyor'; }
      else if (m.state === 'closed') {
        s.conn = 'closed'; s.note = 'Sekme kapatıldı';
        for (const [rid, p] of this.pending) if (p.seat === s.id) { this.pending.delete(rid); p.resolve({ ok: false, error: 'tab-closed' }); }
      }
      this.changed();
    } else if (m.type === 'debug') {
      // yalnızca log
    } else if (m.type === 'status') {
      const p = this.pending.get(m.reqId);
      if (p && p.kind === 'speak') { p.seatObj.note = m.phase === 'typing' ? 'yazıyor' : 'düşünüyor'; this.changed(); }
    } else if (m.type === 'result') {
      const p = this.pending.get(m.reqId);
      if (!p) return;
      this.pending.delete(m.reqId);
      clearTimeout(p.timer);
      p.resolve({ ok: !!m.ok, text: m.text || '', error: m.error, detail: m.detail });
    }
  }

  ask(seat, text, kind) {
    return new Promise((resolve) => {
      const reqId = this.nextReq++;
      const timeoutMs = this.settings.timeoutSec * 1000;
      const timer = setTimeout(() => {
        if (this.pending.delete(reqId)) resolve({ ok: false, error: 'timeout' });
      }, timeoutMs + 25000);
      this.pending.set(reqId, { resolve, seat: seat.id, seatObj: seat, kind, timer });
      this.log('->', { type: 'ask', reqId, ai: seat.id, kind, text });
      const sent = this.bridge.send({ type: 'ask', reqId, ai: seat.id, text, timeoutMs });
      if (!sent) {
        this.pending.delete(reqId); clearTimeout(timer);
        resolve({ ok: false, error: 'bridge-lost' });
      }
    });
  }

  cancelAll() {
    this.bridge.send({ type: 'cancel' });
    for (const [id, p] of this.pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'cancelled' }); }
    this.pending.clear();
  }

  // ---------- masa yönetimi ----------
  invite(id) {
    const s = this.seat(id);
    if (!s || s.invited) return { ok: false, error: 'already' };
    if (!this.bridge.connected()) return { ok: false, error: 'no-extension' };
    s.invited = true; s.conn = 'opening'; s.status = 'idle'; s.note = 'Sekme açılıyor';
    s.seen = 0; s.intro = false; s.fails = 0;
    this.bridge.send({ type: 'open', ai: s.id, url: s.url, bounds: this.getBounds ? this.getBounds(s.id, this.seats.filter((x) => x.invited).indexOf(s)) : undefined });
    this.addSystem(`${s.name} masaya davet edildi.`);
    this.changed();
    return { ok: true };
  }

  dismiss(id) {
    const s = this.seat(id);
    if (!s || !s.invited) return;
    s.invited = false; s.conn = 'off'; s.status = 'idle'; s.note = '';
    this.bridge.send({ type: 'close', ai: s.id });
    this.addSystem(`${s.name} masadan ayrıldı.`);
    this.changed();
  }

  resetSeat(id) {
    const s = this.seat(id);
    if (!s) return;
    s.status = 'idle'; s.fails = 0; s.note = '';
    this.changed();
  }

  newSession() {
    this.stop();
    this.transcript = [];
    this.round = 0;
    this.phase = '';
    for (const s of this.seats) {
      s.seen = 0; s.intro = false; s.fails = 0; s.status = 'idle'; s.note = '';
      if (s.invited) { s.conn = 'opening'; s.note = 'Yeni sohbet açılıyor'; this.bridge.send({ type: 'open', ai: s.id, url: s.url, bounds: this.getBounds ? this.getBounds(s.id, this.seats.filter((x) => x.invited).indexOf(s)) : undefined }); }
    }
    this.changed();
  }

  // ---------- prompt ----------
  label(from) {
    if (from === 'user') return 'Kullanıcı';
    if (from === 'system') return 'Sistem';
    return this.seat(from)?.name || from;
  }

  delta(seat) {
    const upto = this.transcript.length;
    const items = this.transcript.slice(seat.seen, upto)
      .filter((e) => e.from !== seat.id && (e.kind === 'say' || e.deliver));
    return { items, upto };
  }

  introText(seat) {
    const names = ['Kullanıcı', ...this.seats.filter((s) => s.invited).map((s) => s.name)].join(', ');
    return [
      `Sen "AIDA" (Artificial Intelligence Debate Arena) adlı bir yuvarlak masa tartışmasına katılıyorsun. Masadakiler: ${names}. Sen: ${seat.name}.`,
      'KURALLAR:',
      '1) Her mesajım "[AIDA]" ile başlar ve masada konuşulanları "Kullanıcı:", "ChatGPT:" gibi etiketlerle aktarır.',
      '2) Mesajın sonunda "SIRA: SENDE" yazıyorsa cevap ver. "SIRA: DİNLE" yazıyorsa sadece dinle ve cevabın tam olarak -muted- olsun; başka hiçbir şey yazma.',
      `3) Sıran geldiğinde kısa ve öz yaz (en fazla yaklaşık ${this.settings.maxWords} kelime). Diğerlerinin fikirlerine atıf yapabilir, katılabilir ya da gerekçeyle itiraz edebilirsin. Cevabına kendi adını etiket olarak yazma.`,
      '4) Eklemek istediğin yeni bir şey yoksa sıran gelse bile sadece -muted- yaz.',
      '5) Otopilot modunda kullanıcı araya girmez, tartışma sürer. Konunun tükendiğini ve sohbeti bitirmek istediğini düşünürsen cevabının en sonuna [[BITIR]] ekle. Herkes bitirmek isterse sohbet kapanır.',
      '6) İnternette arama, dosya/görsel oluşturma gibi araçları kullanma; sadece metinle cevap ver. Kullanıcı hangi dilde yazarsa o dilde cevap ver.',
    ].join('\n');
  }

  renderItems(items) {
    return items.map((e) => `${this.label(e.from)}: ${e.text}`).join('\n\n');
  }

  buildTurn(seat, items) {
    const parts = ['[AIDA]'];
    if (!seat.intro) parts.unshift(this.introText(seat), '');
    parts.push('Masada yeni konuşulanlar:', '---', items.length ? this.renderItems(items) : '(yeni bir şey söylenmedi)', '---');
    if (this.auto) {
      parts.push('MOD: OTOPİLOT. Kullanıcı araya girmiyor; diğerleriyle tartışmayı sürdür. Katılıyorsan söyle, katılmıyorsan gerekçeyle itiraz et. Konu tükendiyse ve hemfikirseniz cevabının sonuna [[BITIR]] ekle.');
    }
    parts.push(`SIRA: SENDE — ${seat.name}, cevap ver. (Eklenecek bir şey yoksa sadece -muted- yaz.)`);
    return parts.join('\n');
  }

  buildListen(seat, items) {
    const parts = ['[AIDA]'];
    if (!seat.intro) parts.unshift(this.introText(seat), '');
    parts.push('Masada yeni konuşulanlar:', '---', this.renderItems(items), '---',
      'SIRA: DİNLE — şu an başkası cevaplıyor. Cevabın sadece -muted- olmalı, başka hiçbir şey yazma.');
    return parts.join('\n');
  }

  // ---------- tur ----------
  failSeat(seat, res) {
    const err = res.error;
    if (err === 'cancelled') { seat.status = 'idle'; seat.note = ''; return; }
    if (err === 'limit') {
      seat.status = 'limit'; seat.note = 'Kullanım limiti doldu';
      this.addSystem(`${seat.name} kullanım limitine ulaştı, masadan geçici olarak çıkarıldı (pas geçiliyor).`, true);
    } else if (err === 'login') {
      seat.conn = 'login'; seat.status = 'idle'; seat.note = 'Giriş yapman gerekiyor';
      this.addSystem(`${seat.name} için giriş gerekli, atlandı.`);
    } else if (err === 'tab-closed') {
      seat.conn = 'closed'; seat.status = 'idle'; seat.note = 'Sekme kapatıldı';
      this.addSystem(`${seat.name} sekmesi kapalı, atlandı.`);
    } else {
      seat.fails++;
      seat.note = ERR_TEXT[err] || ERR_TEXT.failed;
      seat.status = seat.fails >= 2 ? 'error' : 'idle';
      this.addSystem(`${seat.name} cevap veremedi (${seat.note}), atlandı.`);
    }
  }

  async listen(seat) {
    const { items, upto } = this.delta(seat);
    if (!items.length) return;
    seat.status = 'listening'; seat.note = 'dinliyor';
    this.changed();
    const res = await this.ask(seat, this.buildListen(seat, items), 'listen');
    if (res.ok) {
      seat.seen = upto; seat.intro = true; seat.fails = 0;
      seat.status = 'muted'; seat.note = '-muted-';
    } else {
      if (seat.status === 'listening') seat.status = 'idle';
      this.failSeat(seat, res);
    }
    this.changed();
  }

  async speak(seat) {
    const { items, upto } = this.delta(seat);
    seat.status = 'thinking'; seat.note = 'düşünüyor';
    this.speaker = seat.id;
    this.changed();
    const res = await this.ask(seat, this.buildTurn(seat, items), 'speak');
    this.speaker = null;
    if (!res.ok) {
      if (seat.status === 'thinking') seat.status = 'idle';
      this.failSeat(seat, res);
      this.changed();
      return { spoke: false };
    }
    seat.seen = upto; seat.intro = true; seat.fails = 0;
    // Bazı modeller (Gemini) istemdeki "[AIDA]" başlığını cevabın başına kopyalıyor
    res.text = String(res.text || '').replace(/^\s*\[AIDA\]\s*/i, '');
    if (isMuted(res.text)) {
      seat.status = 'muted'; seat.note = 'pas geçti';
      this.addEntry(seat.id, '-muted-', 'pass');
      this.changed();
      return { spoke: true, passed: true };
    }
    const wantsEnd = new RegExp(END_TAG.source, 'i').test(res.text);
    const clean = res.text.replace(END_TAG, '').trim();
    seat.status = 'idle'; seat.note = '';
    this.addEntry(seat.id, clean, 'say');
    this.changed();
    return { spoke: true, passed: false, wantsEnd };
  }

  async turn(seat) {
    this.phase = `${seat.name} konuşuyor`;
    const listeners = this.seats.filter((s) => s !== seat && this.usable(s) && this.delta(s).items.length > 0);
    const lp = listeners.map((s) => this.listen(s));
    const r = await this.speak(seat);
    await Promise.all(lp);
    return r;
  }

  async runRound() {
    this.round++;
    const order = this.usableSeats();
    const results = [];
    for (const seat of order) {
      if (this.stopFlag) break;
      if (!this.usable(seat)) continue;
      results.push(await this.turn(seat));
    }
    const spoke = results.filter((r) => r.spoke);
    const allDone = spoke.length > 0 && spoke.every((r) => r.passed || r.wantsEnd);
    return { spoke: spoke.length, allDone };
  }

  async loop() {
    if (this.running) return;
    this.running = true; this.stopFlag = false;
    this.changed();
    try {
      let go = true;
      while (go && !this.stopFlag) {
        if (this.usableSeats().length === 0) {
          this.addSystem('Masada cevap verebilecek yapay zeka kalmadı.');
          this.auto = false; break;
        }
        if (this.auto && this.usableSeats().length < 2) {
          this.addSystem('Otopilot için en az 2 yapay zeka gerekli, otopilot kapatıldı.');
          this.auto = false; break;
        }
        this.pendingRound = false;
        const res = await this.runRound();
        if (this.stopFlag) break;
        if (this.auto) {
          this.autoRounds++;
          if (res.allDone) {
            this.addSystem('Yapay zekalar sohbeti bitirmeye karar verdi. Otopilot durdu.');
            this.auto = false; break;
          }
          if (res.spoke === 0) { this.addSystem('Kimse cevap veremedi, otopilot durdu.'); this.auto = false; break; }
          if (this.settings.maxRounds > 0 && this.autoRounds >= this.settings.maxRounds) {
            this.addSystem(`Otopilot ${this.settings.maxRounds} tur sonunda durdu.`);
            this.auto = false; break;
          }
        }
        go = this.auto || this.pendingRound;
        this.changed();
      }
    } finally {
      this.running = false; this.speaker = null; this.phase = '';
      for (const s of this.seats) if (s.status === 'thinking' || s.status === 'listening') s.status = 'idle';
      this.changed();
    }
  }

  // ---------- kullanıcı eylemleri ----------
  send(text) {
    text = String(text || '').trim();
    if (!text) return { ok: false, error: 'empty' };
    if (this.usableSeats().length === 0) return { ok: false, error: 'no-seats' };
    this.addEntry('user', text, 'say');
    this.changed();
    if (this.running) this.pendingRound = true;
    else this.loop();
    return { ok: true };
  }

  setAuto(on) {
    this.auto = !!on;
    if (on) {
      this.autoRounds = 0;
      if (this.usableSeats().length < 2) {
        this.auto = false;
        this.addSystem('Otopilot için en az 2 yapay zeka gerekli.');
      } else if (!this.running) this.loop();
    }
    this.changed();
  }

  stop() {
    this.auto = false;
    this.stopFlag = true;
    this.cancelAll();
    this.changed();
  }
}

module.exports = { Engine, AIS, isMuted };
