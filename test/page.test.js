// page.js testi: gizli (küçültülmüş) bir Chrome sayfasını taklit eder.
// Yerel zamanlayıcılar en az 1 sn'ye yavaşlatılır, requestAnimationFrame hiç çalışmaz.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function makePage(hidden) {
  const state = { hidden };
  class Document extends EventTarget {}
  Object.defineProperty(Document.prototype, 'hidden', { get: function hidden() { return state.hidden; }, configurable: true, enumerable: true });
  Object.defineProperty(Document.prototype, 'visibilityState', { get: function visibilityState() { return state.hidden ? 'hidden' : 'visible'; }, configurable: true, enumerable: true });
  Document.prototype.hasFocus = function hasFocus() { return !state.hidden; };
  const document = new Document();
  const win = new EventTarget();
  const slow = (ms) => (state.hidden ? Math.max(1000, ms || 0) : ms);
  const nativeST = function setTimeout(fn, ms, ...a) { return global.setTimeout(fn, slow(ms), ...a); };
  const nativeSI = function setInterval(fn, ms, ...a) { return global.setInterval(fn, slow(ms), ...a); };
  let rafId = 0;
  Object.assign(win, {
    document, Document, performance, Reflect, Proxy, WeakMap, Map, Object, Number, Math, Function, CustomEvent,
    setTimeout: nativeST, setInterval: nativeSI,
    clearTimeout: function clearTimeout(id) { global.clearTimeout(id); },
    clearInterval: function clearInterval(id) { global.clearInterval(id); },
    requestAnimationFrame: function requestAnimationFrame() { return ++rafId; }, // gizliyken hiç çalışmaz
    cancelAnimationFrame: function cancelAnimationFrame() {},
    reportError: (e) => { throw e; },
  });
  win.window = win;
  const ctx = vm.createContext(win);
  // vm bağlamının kendi Function'ı var; page.js onu yamalar
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'extension', 'page.js'), 'utf8'), ctx);
  const pump = () => document.dispatchEvent(new CustomEvent('__aida_pump'));
  return { win: ctx, document, state, pump, ctx };
}

const wait = (ms) => new Promise((r) => global.setTimeout(r, ms));
async function withPump(page, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { page.pump(); await wait(100); }
}

(async () => {
  let n = 0;
  const ok = (name) => console.log(`ok ${++n}: ${name}`);

  { // görünürlük taklidi
    const p = makePage(true);
    assert.strictEqual(vm.runInContext('document.hidden', p.ctx), false);
    assert.strictEqual(vm.runInContext('document.visibilityState', p.ctx), 'visible');
    assert.strictEqual(vm.runInContext('document.hasFocus()', p.ctx), true);
    let heard = 0;
    p.document.addEventListener('visibilitychange', () => heard++);
    p.document.dispatchEvent(new Event('visibilitychange'));
    assert.strictEqual(heard, 0);
    const s = vm.runInContext('Function.prototype.toString.call(setTimeout)', p.ctx);
    assert.ok(/setTimeout/.test(s), s);
    const s2 = vm.runInContext('Function.prototype.toString.call(Function.prototype.toString)', p.ctx);
    assert.ok(/toString/.test(s2), s2);
    ok('gizli sayfa görünür/odakta görünür, olay yutulur, toString asıl');
  }

  { // setTimeout zinciri ritimle hızlanır ve iki kez çalışmaz
    const p = makePage(true);
    vm.runInContext(`globalThis.hits = 0; globalThis.t0 = performance.now(); globalThis.doneAt = 0;
      const step = () => { hits++; if (hits < 5) setTimeout(step, 50); else doneAt = performance.now() - t0; };
      setTimeout(step, 50);`, p.ctx);
    await withPump(p, 1500);
    assert.strictEqual(p.ctx.hits, 5);
    assert.ok(p.ctx.doneAt < 1000, 'zincir ' + p.ctx.doneAt + ' ms');
    await wait(1200); // yerel (yavaş) zamanlayıcılar artık tetiklense de tekrar çalışmamalı
    assert.strictEqual(p.ctx.hits, 5);
    ok(`5x50 ms zincir gizliyken ${Math.round(p.ctx.doneAt)} ms (ritimsiz ≥5000 ms), tekrar yok`);
  }

  { // clearTimeout ritimde de geçerli
    const p = makePage(true);
    vm.runInContext('globalThis.hit = 0; const id = setTimeout(() => hit++, 50); clearTimeout(id);', p.ctx);
    await withPump(p, 500);
    assert.strictEqual(p.ctx.hit, 0);
    ok('clearTimeout ile iptal edilen çalışmaz');
  }

  { // setInterval ritimle çalışır, çift çalışmaz, iptal edilir
    const p = makePage(true);
    vm.runInContext('globalThis.ticks = 0; globalThis.iv = setInterval(() => ticks++, 200);', p.ctx);
    await withPump(p, 1300);
    const t = p.ctx.ticks;
    assert.ok(t >= 4 && t <= 7, 'interval ' + t);
    vm.runInContext('clearInterval(iv)', p.ctx);
    await withPump(p, 600);
    assert.strictEqual(p.ctx.ticks, t);
    ok(`setInterval(200) 1.3 sn'de ${t} kez, iptal sonrası durdu`);
  }

  { // requestAnimationFrame gizliyken ritimle çalışır
    const p = makePage(true);
    vm.runInContext('globalThis.frames = 0; const f = () => { frames++; if (frames < 3) requestAnimationFrame(f); }; requestAnimationFrame(f);', p.ctx);
    await withPump(p, 600);
    assert.strictEqual(p.ctx.frames, 3);
    vm.runInContext('globalThis.cf = 0; cancelAnimationFrame(requestAnimationFrame(() => cf++));', p.ctx);
    await withPump(p, 300);
    assert.strictEqual(p.ctx.cf, 0);
    ok('requestAnimationFrame gizliyken çalışır, iptal edilen çalışmaz');
  }

  { // görünürken ritim karışmaz
    const p = makePage(false);
    vm.runInContext('globalThis.hit = 0; setTimeout(() => hit++, 400);', p.ctx);
    p.pump(); await wait(100); p.pump();
    assert.strictEqual(p.ctx.hit, 0);
    await wait(450);
    assert.strictEqual(p.ctx.hit, 1);
    ok('görünür sayfada zamanlayıcılar normal, erken çalışmaz');
  }

  { // hata atan geri çağırma ritmi bozmaz
    const p = makePage(true);
    let reported = 0;
    p.ctx.reportError = () => { reported++; };
    vm.runInContext('globalThis.after = 0; setTimeout(() => { throw new Error("x"); }, 10); setTimeout(() => after++, 20);', p.ctx);
    await withPump(p, 400);
    assert.strictEqual(p.ctx.after, 1);
    ok('hata atan zamanlayıcı diğerlerini durdurmaz');
  }

  console.log('PAGE TESTLERİ GEÇTİ');
  process.exit(0);
})().catch((e) => { console.error('BAŞARISIZ:', e); process.exit(1); });
