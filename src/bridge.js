// Electron <-> Chrome uzantısı köprüsü (yerel WebSocket, sadece 127.0.0.1)
const { WebSocketServer } = require('ws');
const EventEmitter = require('events');

class Bridge extends EventEmitter {
  // expectedExt: uygulamayla birlikte gelen uzantının sürümü. Chrome'da birden fazla AIDA Bridge
  // kopyası yüklüyse bu sürümdeki tercih edilir, diğerleri bağlı kalır ama komut almaz.
  constructor(port = 47821, { expectedExt = null } = {}) {
    super();
    this.port = port;
    this.expectedExt = expectedExt;
    this.client = null;
    this.error = null;
  }

  // Uzantı "hello" ile sürümünü bildirince aktif istemci seçilir
  adopt(ws) {
    const cur = this.client;
    if (cur && cur !== ws && cur.readyState === 1) {
      const good = (c) => !!this.expectedExt && c.aidaVersion === this.expectedExt;
      if (good(cur) && !good(ws)) return false; // doğru sürüm zaten bağlı, eski kopyayı dinlemeye alma
    }
    this.client = ws;
    this.emit('connection', true);
    return true;
  }

  start() {
    try {
      this.wss = new WebSocketServer({
        host: '127.0.0.1',
        port: this.port,
        // Sadece Chrome uzantılarından gelen bağlantıları kabul et (web sayfaları bağlanamasın)
        verifyClient: (info) => String(info.origin || '').startsWith('chrome-extension://'),
      });
    } catch (e) {
      this.error = e.message;
      return;
    }
    this.wss.on('error', (e) => {
      this.error = e.code === 'EADDRINUSE' ? `Port ${this.port} kullanımda (AIDA zaten açık olabilir)` : e.message;
      this.emit('error-state');
    });
    this.wss.on('connection', (ws) => {
      ws.aidaVersion = null;
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(String(raw)); } catch { return; }
        if (!msg || msg.type === 'ping') return;
        if (msg.type === 'hello') {
          ws.aidaVersion = msg.version ? String(msg.version) : '0'; // 0.4.0 öncesi uzantılar sürüm göndermez
          if (!this.adopt(ws)) return;
        }
        if (ws !== this.client) return;
        this.emit('message', msg);
      });
      ws.on('close', () => {
        if (this.client === ws) {
          // başka bir kopya bağlıysa ona geç
          const other = [...this.wss.clients].find((c) => c !== ws && c.readyState === 1 && c.aidaVersion);
          this.client = other || null;
          this.emit('connection', !!other);
        }
      });
      ws.on('error', () => {});
    });
  }

  connected() {
    return !!this.client && this.client.readyState === 1;
  }

  // Bağlı uzantının bildirdiği sürüm ('0' = sürüm göndermeyen eski uzantı)
  clientVersion() {
    return this.connected() ? this.client.aidaVersion : null;
  }

  // Bağlı uzantı kopyası sayısı (1'den fazlaysa Chrome'da birden çok AIDA Bridge yüklü)
  copies() {
    return this.wss ? [...this.wss.clients].filter((c) => c.readyState === 1 && c.aidaVersion).length : 0;
  }

  send(obj) {
    if (!this.connected()) return false;
    this.client.send(JSON.stringify(obj));
    return true;
  }

  stop() {
    try { this.wss && this.wss.close(); } catch {}
  }
}

module.exports = { Bridge };
