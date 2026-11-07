// AIDA Bridge - sayfa dünyası (MAIN) yaması.
// Pencere küçültülünce ya da başka pencerelerin arkasında kalınca Chrome sayfayı "gizli" sayar:
// requestAnimationFrame hiç çalışmaz, zamanlayıcılar saniyede bire, 5 dakika sonra dakikada bire düşer.
// Site cevabı ekrana bu yüzden geç (ya da hiç) yazar. Bu yama:
//  1) sayfaya "görünürsün, odaktasın" der (görünürlük olaylarını yutar),
//  2) gizliyken vadesi gelen zamanlayıcıları ve kare isteklerini uzantının ritmiyle (≈250 ms) çalıştırır.
// Uzantı betiği (content.js) her ritimde document üzerinde "__aida_pump" olayı yayınlar.
(() => {
  if (window.__aidaPage) return;
  Object.defineProperty(window, '__aidaPage', { value: true });

  const W = window;
  const D = Document.prototype;
  const realHiddenGet = Object.getOwnPropertyDescriptor(D, 'hidden').get;
  const reallyHidden = () => realHiddenGet.call(document);
  const report = (x) => { try { W.reportError(x); } catch { /* yut */ } };

  // Değiştirilen her fonksiyon Proxy; toString aslının metnini döndürsün ki siteler fark etmesin.
  const originals = new WeakMap(); // proxy -> asıl fonksiyon
  const P = (orig, handler) => { const p = new Proxy(orig, handler); originals.set(p, orig); return p; };
  const fnToString = Function.prototype.toString;
  Function.prototype.toString = P(fnToString, {
    apply: (t, self, args) => Reflect.apply(t, originals.get(self) || self, args),
  });

  // ---- 1) görünürlük ----
  const fake = (prop, value) => {
    const d = Object.getOwnPropertyDescriptor(D, prop);
    if (!d || !d.get) return;
    Object.defineProperty(D, prop, { ...d, get: P(d.get, { apply: () => value }) });
  };
  fake('hidden', false);
  fake('webkitHidden', false);
  fake('visibilityState', 'visible');
  fake('webkitVisibilityState', 'visible');
  D.hasFocus = P(D.hasFocus, { apply: () => true });
  const swallow = (e) => e.stopImmediatePropagation();
  for (const t of ['visibilitychange', 'webkitvisibilitychange']) {
    W.addEventListener(t, swallow, true);
    document.addEventListener(t, swallow, true); // ilk kaydolan biziz (document_start)
  }

  // ---- 2) zamanlayıcılar ----
  const nST = W.setTimeout, nCT = W.clearTimeout, nSI = W.setInterval, nCI = W.clearInterval;
  const nRAF = W.requestAnimationFrame, nCAF = W.cancelAnimationFrame;
  const timers = new Map(); // id -> { fn, args, due, period }
  const frames = new Map(); // id -> cb

  const fire = (id, e, pumped) => {
    if (timers.get(id) !== e) return;
    const now = performance.now();
    if (e.period == null) {
      timers.delete(id);
      if (pumped) nCT.call(W, id);
    } else {
      if (now < e.due - e.period / 2) return; // ritim az önce çalıştırdı, yerel tetiklemeyi atla
      e.due = now + e.period;
    }
    if (pumped) { try { e.fn.apply(W, e.args); } catch (x) { report(x); } }
    else e.fn.apply(W, e.args);
  };

  const wrapTimer = (native, repeat) => P(native, {
    apply(t, _self, args) {
      const [fn, ms, ...rest] = args;
      if (typeof fn !== 'function') return Reflect.apply(t, W, args);
      const delay = Math.max(0, Number(ms) || 0);
      const e = { fn, args: rest, due: performance.now() + delay, period: repeat ? Math.max(1, delay) : null };
      const id = Reflect.apply(t, W, [() => fire(id, e, false), ms]);
      timers.set(id, e);
      return id;
    },
  });
  const wrapClear = (native) => P(native, {
    apply(t, _self, args) { timers.delete(args[0]); return Reflect.apply(t, W, args); },
  });
  W.setTimeout = wrapTimer(nST, false);
  W.setInterval = wrapTimer(nSI, true);
  W.clearTimeout = wrapClear(nCT);
  W.clearInterval = wrapClear(nCI);

  W.requestAnimationFrame = P(nRAF, {
    apply(t, _self, args) {
      const cb = args[0];
      if (typeof cb !== 'function') return Reflect.apply(t, W, args);
      const id = Reflect.apply(t, W, [(ts) => { if (frames.delete(id)) cb(ts); }]);
      frames.set(id, cb);
      return id;
    },
  });
  W.cancelAnimationFrame = P(nCAF, {
    apply(t, _self, args) { frames.delete(args[0]); return Reflect.apply(t, W, args); },
  });

  const pump = () => {
    if (!reallyHidden()) return; // görünürken tarayıcı kendisi çalıştırır
    const now = performance.now();
    for (const [id, e] of [...timers]) if (now >= e.due) fire(id, e, true);
    if (frames.size) {
      const list = [...frames];
      frames.clear();
      for (const [id, cb] of list) { nCAF.call(W, id); try { cb(now); } catch (x) { report(x); } }
    }
  };
  document.addEventListener('__aida_pump', pump);
})();
