// VALENHEIM 2.0 – Server (Phase 1): Anmeldung, Spielstände, Echtzeit-Verbindung, Website ausliefern
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as DB from './db.js';
import * as AUTH from './auth.js';
import * as SAVE from './saves.js';

process.on('unhandledRejection', (e) => console.error('Unbehandelter Fehler:', e));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 2600);
const DIST = path.resolve(__dirname, '../../client/dist');
const VERSION = '2.0.0-phase1';

// ---------- Helfer ----------
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const readJson = (req) => new Promise((ok, no) => {
  let n = 0; const c = [];
  req.on('data', (d) => { n += d.length; if (n > 8192) { no(new Error('zu groß')); req.destroy(); } else c.push(d); });
  req.on('end', () => { try { ok(c.length ? JSON.parse(Buffer.concat(c).toString('utf8')) : {}); } catch { no(new Error('ungültig')); } });
});
const tokenOf = (req) => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7).trim() : null; };
const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const buckets = new Map();
const limited = (key, max, ms = 60_000) => { const now = Date.now(); const b = buckets.get(key) || { n: 0, t: now }; if (now - b.t > ms) { b.n = 0; b.t = now; } b.n++; buckets.set(key, b); return b.n > max; };
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 15 * 60_000) buckets.delete(k); }, 60_000).unref();

async function authed(req) { const p = await AUTH.playerFromToken(tokenOf(req)); return p; }

// ---------- API ----------
const routes = {
  'GET /api/status': async () => [200, { ok: true, spiel: 'VALENHEIM 2.0', version: VERSION, datenbank: DB.backend, online: clients.size }],
  'POST /api/auth/register': async (req) => {
    if (limited('reg:' + ipOf(req), 5)) return [429, { fehler: 'Zu viele Versuche. Bitte warte eine Minute.' }];
    const b = await readJson(req); const r = await AUTH.register(b.name, b.passwort, req.headers['user-agent']);
    return r.fehler ? [r.status || 400, { fehler: r.fehler }] : [201, r];
  },
  'POST /api/auth/login': async (req) => {
    const b = await readJson(req);
    if (limited('login:' + ipOf(req), 15) || limited('loginname:' + String(b.name || '').toLowerCase(), 10, 10 * 60_000)) return [429, { fehler: 'Zu viele Versuche. Bitte warte ein paar Minuten.' }];
    const r = await AUTH.login(b.name, b.passwort, req.headers['user-agent']);
    return r.fehler ? [r.status || 400, { fehler: r.fehler }] : [200, r];
  },
  'POST /api/auth/recover': async (req) => {
    if (limited('rec:' + ipOf(req), 5, 10 * 60_000)) return [429, { fehler: 'Zu viele Versuche. Bitte warte ein paar Minuten.' }];
    const b = await readJson(req); const r = await AUTH.recover(b.name, b.code, b.passwort, req.headers['user-agent']);
    return r.fehler ? [r.status || 400, { fehler: r.fehler }] : [200, r];
  },
  'POST /api/auth/logout': async (req) => { await AUTH.logout(tokenOf(req)); return [200, { ok: true }]; },
  'GET /api/me': async (req) => {
    const p = await authed(req); if (!p) return [401, { fehler: 'Nicht angemeldet.' }];
    await DB.q('UPDATE v2_players SET last_seen = ? WHERE id = ?', [Date.now(), p.id]);
    return [200, { profil: AUTH.publicProfile(p), spielstand: await SAVE.getSave(p.id) }];
  },
  'PUT /api/settings': async (req) => {
    const p = await authed(req); if (!p) return [401, { fehler: 'Nicht angemeldet.' }];
    return [200, { settings: await SAVE.saveSettings(p.id, await readJson(req)) }];
  },
};

// ---------- Website ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) { res.writeHead(404); return res.end('Website noch nicht gebaut (npm run build).'); }
  const url = decodeURIComponent(req.url.split('?')[0]); let file = path.normalize(path.join(DIST, url));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const h = routes[`${req.method} ${req.url.split('?')[0]}`];
  if (h) { try { const [s, d] = await h(req); send(res, s, d); } catch (e) { console.error(e); send(res, /zu groß|ungültig/.test(e.message) ? 400 : 500, { fehler: 'Serverfehler.' }); } return; }
  if (req.url.startsWith('/api/')) return send(res, 404, { fehler: 'Unbekannte Anfrage.' });
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405); res.end();
});

// ---------- Echtzeit (Phase 1: eigene Position, vom Server geprüft und gespeichert) ----------
const clients = new Map(); // playerId -> client
const MAX_SPEED = 13, BOUNDS = 2200;
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws) => {
  let c = null; ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  const timer = setTimeout(() => { if (!c) ws.close(4001, 'keine Anmeldung'); }, 8000);
  ws.on('message', async (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!c) {
      if (m.t !== 'hallo' || ws.busy) return; ws.busy = true;
      const p = await AUTH.playerFromToken(String(m.token || '')); if (!p) return ws.close(4003, 'ungültig');
      clearTimeout(timer);
      const old = clients.get(p.id); if (old) { old.ws.send(JSON.stringify({ t: 'doppelt' })); old.ws.close(4005, 'doppelt'); }
      const sv = await SAVE.getSave(p.id);
      c = { id: p.id, name: p.username, ws, pos: { ...sv.pos }, lastT: Date.now(), dirty: false };
      clients.set(p.id, c);
      return ws.send(JSON.stringify({ t: 'willkommen', pos: c.pos, online: clients.size }));
    }
    if (m.t === 'pos') {
      const x = +m.x, y = +m.y, z = +m.z, h = +m.h; if (![x, y, z, h].every(Number.isFinite)) return;
      const now = Date.now(); const dt = Math.max(0.05, (now - c.lastT) / 1000);
      const d = Math.hypot(x - c.pos.x, z - c.pos.z);
      if (Math.abs(x) > BOUNDS || Math.abs(z) > BOUNDS || y < -50 || y > 400 || d > MAX_SPEED * dt + 2) { c.lastT = now; return ws.send(JSON.stringify({ t: 'korrektur', pos: c.pos })); }
      c.pos = { x, y, z, h, welt: c.pos.welt }; c.lastT = now; c.dirty = true;
    }
  });
  ws.on('close', async () => { clearTimeout(timer); if (c && clients.get(c.id) === c) { clients.delete(c.id); if (c.dirty) await SAVE.savePos(c.id, c.pos).catch(console.error); } });
  ws.on('error', () => {});
});
// Automatisch speichern (alle 30 s) + tote Verbindungen schließen
setInterval(() => { for (const c of clients.values()) if (c.dirty) { c.dirty = false; SAVE.savePos(c.id, c.pos).catch(console.error); } }, 30_000).unref();
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 20_000).unref();
setInterval(() => AUTH.cleanupSessions().catch(() => {}), 6 * 3600_000).unref();

server.listen(PORT, () => console.log(`VALENHEIM 2.0 läuft auf http://localhost:${PORT} (Datenbank: ${DB.backend})`));

// Sauber beenden: offene Positionen speichern
async function shutdown() { for (const c of clients.values()) if (c.dirty) await SAVE.savePos(c.id, c.pos).catch(() => {}); await DB.close(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
