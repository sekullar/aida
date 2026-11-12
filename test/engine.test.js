// Sahte uzantı ile motoru test eder (tarayıcı gerekmez)
const assert = require('assert');
const EventEmitter = require('events');
const { Engine } = require('../src/engine');

function makeBridge(script) {
  const b = new EventEmitter();
  b.log = [];
  b.connected = () => true;
  b.send = (m) => {
    b.log.push(m);
    if (m.type === 'open') setTimeout(() => b.emit('message', { type: 'tab', ai: m.ai, state: 'ready' }), 0);
    if (m.type === 'ask') {
      const out = script(m);
      setTimeout(() => b.emit('message', { type: 'result', reqId: m.reqId, ai: m.ai, ...out }), 5);
    }
    return true;
  };
  return b;
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await tick(10); } }

async function setup(script) {
  const bridge = makeBridge(script);
  const e = new Engine(bridge);
  for (const id of ['chatgpt', 'gemini', 'claude']) e.invite(id);
  await until(() => e.usableSeats().length === 3);
  return { e, bridge };
}

(async () => {
  // 1) Manuel tur: sıra ChatGPT -> Gemini -> Claude, dinleyenler -muted- döner
  {
    const { e, bridge } = await setup((m) => {
      const listen = m.text.includes('SIRA: DİNLE —');
      return listen ? { ok: true, text: '-muted-' } : { ok: true, text: `${m.ai} cevabı` };
    });
    e.send('Merhaba masa');
    await until(() => !e.running);
    const says = e.transcript.filter((t) => t.kind === 'say').map((t) => t.from);
    assert.deepStrictEqual(says, ['user', 'chatgpt', 'gemini', 'claude']);
    const asks = bridge.log.filter((m) => m.type === 'ask');
    const turn2 = asks.find((m) => m.ai === 'gemini' && m.text.includes('SIRA: SENDE —'));
    assert(turn2.text.includes('ChatGPT: chatgpt cevabı'), 'Gemini ChatGPT cevabını görmeli');
    assert(!asks.some((m) => m.text.includes('SIRA: DİNLE')), 'dinleyenlere ayrı mesaj gitmemeli');
    assert.strictEqual(asks.length, 3, 'her yapay zekaya yalnızca kendi sırasında 1 mesaj');
    const turn3 = asks.find((m) => m.ai === 'claude');
    assert(turn3.text.includes('Kullanıcı: Merhaba masa') && turn3.text.includes('ChatGPT: chatgpt cevabı') && turn3.text.includes('Gemini: gemini cevabı'), 'Claude öncekilerin hepsini tek mesajda almalı');
    const lens = asks.map((m) => (m.text.match(/BAKIŞ AÇIN — ([A-ZÇĞİÖŞÜ ]+):/) || [])[1]);
    assert(lens.every(Boolean) && new Set(lens).size === 3, 'her koltuğa farklı bakış açısı verilmeli: ' + lens);
    assert(asks[0].text.includes('OBJEKTİF VE KESKİN OL'), 'ilk mesaj keskinlik kuralını içermeli');
    console.log('ok 1: manuel tur sırası, geçmiş tek mesajda');
  }
  // 2) Limit: Gemini limit dolunca pas geçilir ve tespit edilir
  {
    const { e } = await setup((m) => {
      if (m.text.includes('SIRA: DİNLE —')) return m.ai === 'gemini' ? { ok: false, error: 'limit' } : { ok: true, text: '-muted-' };
      if (m.ai === 'gemini') return { ok: false, error: 'limit' };
      return { ok: true, text: `${m.ai} cevabı` };
    });
    e.send('soru');
    await until(() => !e.running);
    assert.strictEqual(e.seat('gemini').status, 'limit');
    assert(e.transcript.some((t) => t.kind === 'system' && /Gemini.*limit/.test(t.text)));
    assert.deepStrictEqual(e.transcript.filter((t) => t.kind === 'say').map((t) => t.from), ['user', 'chatgpt', 'claude']);
    console.log('ok 2: limit tespiti ve atlama');
  }
  // 3) Otopilot: herkes [[BITIR]] yazınca durur
  {
    let n = 0;
    const { e } = await setup((m) => {
      if (m.text.includes('SIRA: DİNLE —')) return { ok: true, text: '-muted-' };
      n++;
      return { ok: true, text: n > 5 ? 'katılıyorum [[BITIR]]' : 'tartışıyoruz' };
    });
    e.setAuto(true);
    e.send('konu');
    await until(() => !e.running, 6000);
    assert.strictEqual(e.auto, false);
    assert(e.transcript.some((t) => /bitirmeye karar/.test(t.text)));
    assert(!e.transcript.some((t) => /BITIR/.test(t.text)), 'etiket temizlenmeli');
    console.log('ok 3: otopilot sohbeti bitirir');
  }
  // 4) Durdur
  {
    const { e } = await setup((m) => (m.text.includes('SIRA: DİNLE —') ? { ok: true, text: '-muted-' } : { ok: true, text: 'devam' }));
    e.setAuto(true);
    e.send('x');
    await tick(60);
    e.stop();
    await until(() => !e.running);
    assert.strictEqual(e.auto, false);
    console.log('ok 4: durdur');
  }
  // 5) Hepsi -muted- ise otopilot biter
  {
    const { e } = await setup(() => ({ ok: true, text: '-muted-' }));
    e.setAuto(true);
    e.send('x');
    await until(() => !e.running);
    assert(e.transcript.some((t) => /bitirmeye karar/.test(t.text)));
    console.log('ok 5: herkes pas geçince biter');
  }
  console.log('TÜM TESTLER GEÇTİ');
  process.exit(0);
})().catch((e) => { console.error('BAŞARISIZ:', e); process.exit(1); });
