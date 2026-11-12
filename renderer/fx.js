(() => {
  const root = document.documentElement;
  const canvas = document.getElementById('fxCanvas');
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = !reduce.matches;
  try {
    const saved = localStorage.getItem('aida-fx');
    if (!reduce.matches && saved === 'off') enabled = false;
    if (!reduce.matches && saved === 'on') enabled = true;
  } catch (_) {}
  const button = document.getElementById('btnFx');
  let raf = 0, last = 0, particles = [];
  const set = (on, save) => {
    enabled = !!on && !reduce.matches;
    root.dataset.fx = enabled ? 'on' : 'off';
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? 'Animasyonları kapat' : 'Animasyonları aç';
    button.setAttribute('aria-label', button.title);
    button.textContent = enabled ? '✧' : '✦';
    if (save) { try { localStorage.setItem('aida-fx', enabled ? 'on' : 'off'); } catch (_) {} }
    if (enabled) start(); else stop();
  };
  button.addEventListener('click', () => set(!enabled, true));
  reduce.addEventListener('change', () => set(enabled, false));
  function resize() {
    const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = Array.from({ length: 42 }, () => ({ x: Math.random() * box.width, y: Math.random() * box.height, r: .5 + Math.random() * 1.2, phase: Math.random() * 6.28, speed: .12 + Math.random() * .24 }));
  }
  function frame(now) {
    raf = 0;
    if (!enabled || document.hidden) return;
    if (now - last < 33) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min((now - (last || now)) / 1000, .05); last = now;
    const box = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, box.width, box.height);
    ctx.fillStyle = getComputedStyle(root).getPropertyValue('--accent').trim() || '#8294ff';
    for (const p of particles) {
      p.y -= p.speed * dt * 12; p.x += Math.sin(now / 7000 + p.phase) * dt * 2;
      if (p.y < -3) { p.y = box.height + 3; p.x = Math.random() * box.width; }
      ctx.globalAlpha = .09 + (Math.sin(now / 2300 + p.phase) + 1) * .035;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; raf = requestAnimationFrame(frame);
  }
  function start() { if (document.hidden || raf) return; resize(); last = 0; raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  window.addEventListener('resize', resize);
  set(enabled, false);
})();
