// Electron <-> Chrome uzantısı köprüsü (yerel WebSocket, sadece 127.0.0.1)
const { WebSocketServer } = require('ws');
const EventEmitter = require('events');

class Bridge extends EventEmitter {
  constructor(port = 47821) {
    super();
    this.port = port;
    this.client = null;
    this.error = null;
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
      if (this.client && this.client !== ws) {
        try { this.client.close(); } catch {}
      }
      this.client = ws;
      this.emit('connection', true);
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(String(raw)); } catch { return; }
        if (msg && msg.type === 'ping') return;
        this.emit('message', msg);
      });
      ws.on('close', () => {
        if (this.client === ws) {
          this.client = null;
          this.emit('connection', false);
        }
      });
      ws.on('error', () => {});
    });
  }

  connected() {
    return !!this.client && this.client.readyState === 1;
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
