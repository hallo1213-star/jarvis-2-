// Multiplayer-Client: Verbindung, Senden der eigenen Position, Anzeigen anderer Spieler (interpoliert).
import * as THREE from 'three';
import { Character, nameTag } from './character.js';
import { getToken } from '../lib/api.js';
import { DEMO, LocalSocket } from '../demo/local.js';

const SEND_HZ = 15, DELAY = 140; // ms Interpolationsverzögerung

export const EMOTE_TEXT = { hallo: '👋 Hallo!', hilfe: '🆘 Hilfe!', folgen: '➡️ Folgt mir!', danke: '🙏 Danke!', super: '👍 Super!', achtung: '⚠️ Achtung!' };

function bubble(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.font = '700 50px system-ui, -apple-system, Segoe UI, sans-serif'; const w = Math.min(500, g.measureText(text).width + 60);
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.roundRect((512 - w) / 2, 14, w, 84, 30); g.fill();
  g.beginPath(); g.moveTo(240, 96); g.lineTo(256, 120); g.lineTo(272, 96); g.fill();
  g.fillStyle = '#0b1730'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 57);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true })); s.scale.set(1.9, 0.48, 1); s.position.y = 2.75; s.renderOrder = 11; return s;
}

export class Net {
  constructor(engine, ev = {}) {
    this.engine = engine; this.ev = ev; this.others = new Map(); this.closed = false; this.lastSend = 0; this.retry = 0;
    this.offset = 0; // Serverzeit - lokale Zeit
    engine.addUpdater((dt) => this.update(dt));
    this.connect();
  }

  connect() {
    if (this.closed) return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = DEMO ? new LocalSocket() : new WebSocket(url); this.ws = ws; this.ev.status?.('verbinde');
    ws.onopen = () => { this.retry = 0; ws.send(JSON.stringify({ t: 'hello', token: getToken() })); ws.send(JSON.stringify({ t: 'ping', ts: Date.now() })); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.handle(m); };
    ws.onclose = (e) => {
      for (const id of [...this.others.keys()]) this.remove(id);
      if (this.closed) return;
      if (e.code === 4005) { this.closed = true; this.ev.status?.('doppelt'); return; }
      if (e.code === 4004) { this.closed = true; this.ev.status?.('gesperrt'); return; }
      if (e.code === 4003) { this.closed = true; this.ev.status?.('ungueltig'); return; }
      this.ev.status?.('getrennt');
      const wait = Math.min(15000, 1000 * 2 ** this.retry++); setTimeout(() => this.connect(), wait);
    };
  }

  handle(m) {
    switch (m.t) {
      case 'welcome': this.ev.welt?.(m.welt || {}); this.you = m.you; this.ev.status?.('online', m.room); this.ev.online?.(m.online); for (const p of m.players) this.add(p); break;
      case 'join': this.add(m.p); this.ev.feed?.(`${m.p.name} hat die Stadt betreten`); break;
      case 'leave': { const o = this.others.get(m.id); if (o) this.ev.feed?.(`${o.name} hat die Stadt verlassen`); this.remove(m.id); break; }
      case 'online': this.ev.online?.(m.n); break;
      case 'snap': {
        for (const [id, x, y, z, h, a] of m.p) { const o = this.others.get(id); if (o) { o.buf.push({ ts: m.ts, x, y, z, h, a }); if (o.buf.length > 30) o.buf.shift(); } }
        break;
      }
      case 'fix': this.engine.pos.set(m.x, m.y, m.z); break;
      case 'emote': { if (m.id === this.you) this.showBubble(this.engine.char?.root, m.k, this); else { const o = this.others.get(m.id); if (o) this.showBubble(o.char.root, m.k, o); } break; }
      case 'pong': this.offset = m.now - (m.ts + Date.now()) / 2; break;
      case 'kicked': this.ev.feed?.(m.grund); break;
      case 'feed': this.ev.feed?.(m.text); break;
      default: this.ev.message?.(m);
    }
  }

  add(p) {
    if (p.id === this.you || this.others.has(p.id)) return;
    const char = new Character(p.look); const tag = nameTag(p.name); char.root.add(tag);
    char.root.position.set(p.x, p.y, p.z); char.root.rotation.y = p.h; this.engine.scene.add(char.root);
    this.others.set(p.id, { id: p.id, name: p.name, char, buf: [], bubble: null });
  }
  remove(id) { const o = this.others.get(id); if (!o) return; this.engine.scene.remove(o.char.root); o.char.root.traverse((x) => { x.geometry?.dispose(); x.material?.map?.dispose(); x.material?.dispose(); }); this.others.delete(id); }

  showBubble(root, k, holder) {
    if (!root) return; if (holder.bubble) root.remove(holder.bubble);
    const b = bubble(EMOTE_TEXT[k] || k); root.add(b); holder.bubble = b; const mine = b;
    setTimeout(() => { if (holder.bubble === mine) { root.remove(mine); holder.bubble = null; } mine.material.map.dispose(); mine.material.dispose(); }, 3200);
  }
  emote(k) { this.sendMsg({ t: 'emote', k }); }
  sendMsg(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }

  update(dt) {
    const e = this.engine; const now = performance.now();
    if (now - this.lastSend > 1000 / SEND_HZ && this.ws?.readyState === 1 && this.you) {
      this.lastSend = now;
      this.ws.send(JSON.stringify({ t: 'in', x: +e.pos.x.toFixed(2), y: +e.pos.y.toFixed(2), z: +e.pos.z.toFixed(2), h: +e.heading.toFixed(2), a: +(e.char?.speedSmooth || 0).toFixed(1) }));
    }
    // Andere Spieler: zwischen zwei Server-Zuständen interpolieren
    const renderTs = Date.now() + this.offset - DELAY;
    for (const o of this.others.values()) {
      const b = o.buf; if (!b.length) { o.char.animate(dt, 0); continue; }
      let i = b.length - 1; while (i > 0 && b[i - 1].ts > renderTs) i--;
      const B = b[i], A = b[Math.max(0, i - 1)];
      const k = B.ts === A.ts ? 1 : THREE.MathUtils.clamp((renderTs - A.ts) / (B.ts - A.ts), 0, 1);
      const r = o.char.root; r.position.set(A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k, A.z + (B.z - A.z) * k);
      let dh = B.h - A.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); r.rotation.y = A.h + dh * k;
      o.char.animate(dt, A.a + (B.a - A.a) * k);
      while (b.length > 2 && b[1].ts < renderTs - 500) b.shift();
    }
  }
  dispose() { this.closed = true; this.ws?.close(); for (const id of [...this.others.keys()]) this.remove(id); }
}
