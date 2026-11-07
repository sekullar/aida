// Sürüm kontrolü testleri: uygulama/uzantı sürümü eşleşmesi, karşılaştırma, köprünün doğru uzantıyı seçmesi
const assert = require('assert');
const path = require('path');
const WebSocket = require('ws');
const { compare, isNewer } = require('../src/version');
const { Bridge } = require('../src/bridge');

let n = 0;
const ok = (name) => console.log(`ok ${++n}: ${name}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1) Release etiketi = package.json sürümü = uzantı sürümü (Sentinel Hub etiketi okur, uygulama uzantıyı buna göre denetler)
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  const manifest = require(path.join(__dirname, '..', 'extension', 'manifest.json'));
  assert.strictEqual(manifest.version, pkg.version, `uzantı ${manifest.version} ≠ uygulama ${pkg.version}`);
  ok(`uygulama ve uzantı sürümü aynı (${pkg.version})`);

  // 2) karşılaştırma (Hub'daki isNewer ile aynı kural)
  assert.ok(isNewer('v0.4.0', '0.3.1'));
  assert.ok(isNewer('0.10.0', '0.9.9'));
  assert.ok(!isNewer('v0.4.0', '0.4.0'));
  assert.ok(!isNewer('0.3.9', 'v0.4.0'));
  assert.strictEqual(compare('1.0', '1.0.0'), 0);
  ok('sürüm karşılaştırma');

  // 3) iki uzantı kopyası: doğru sürüm aktif kalır, eski kopya komut almaz
  const port = 47900 + Math.floor(Math.random() * 50);
  const bridge = new Bridge(port, { expectedExt: '0.4.0' });
  const got = [];
  bridge.on('message', (m) => got.push(m));
  bridge.start();
  await wait(100);
  const connect = async (version) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'chrome-extension://test' });
    await new Promise((r) => ws.on('open', r));
    ws.send(JSON.stringify(version ? { type: 'hello', version, tabs: {} } : { type: 'hello', tabs: {} }));
    await wait(100);
    return ws;
  };
  const good = await connect('0.4.0');
  assert.strictEqual(bridge.clientVersion(), '0.4.0');
  const old = await connect(null); // 0.4.0 öncesi: sürüm göndermez
  assert.strictEqual(bridge.clientVersion(), '0.4.0', 'eski kopya doğru sürümün yerini almamalı');
  assert.strictEqual(bridge.copies(), 2);
  old.send(JSON.stringify({ type: 'tab', ai: 'x', state: 'ready' }));
  await wait(100);
  assert.ok(!got.some((m) => m.type === 'tab'), 'eski kopyanın mesajları yok sayılmalı');
  good.close();
  await wait(150);
  assert.strictEqual(bridge.clientVersion(), '0', 'doğru kopya kapanınca kalan kopyaya geçmeli');
  old.close();
  await wait(100);
  assert.strictEqual(bridge.connected(), false);
  ok('iki kopya bağlıyken doğru sürüm seçilir, eski kopya dinlenmez');

  // 4) web sayfaları bağlanamaz
  const web = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'https://evil.example' });
  const refused = await new Promise((r) => { web.on('open', () => r(false)); web.on('error', () => r(true)); });
  assert.ok(refused);
  ok('chrome-extension dışı kaynak reddedilir');

  bridge.stop();
  console.log('SÜRÜM TESTLERİ GEÇTİ');
  process.exit(0);
})().catch((e) => { console.error('BAŞARISIZ:', e); process.exit(1); });
