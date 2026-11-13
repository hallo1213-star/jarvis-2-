// Valenheim – The City Challenge: Spielserver
// - REST-API (Anmeldung, Profil)
// - liefert im Produktivbetrieb die gebaute Website (web/dist) aus
// - WebSocket-Multiplayer: siehe room.js (ab Phase 2)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as DB from './db.js';
import { checkName } from './names.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 2567);
const DIST = path.resolve(__dirname, '../../web/dist');
const MAX_BODY = 4096;

// ---------- kleine Helfer ----------
function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('zu groß')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('ungültiges JSON')); } });
    req.on('error', reject);
  });
}
export function tokenFrom(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
}

// Einfache Begrenzung: höchstens N Aufrufe pro Minute und IP für einen Schlüssel
const buckets = new Map();
function limited(key, max) {
  const now = Date.now(); const b = buckets.get(key) || { n: 0, t: now };
  if (now - b.t > 60_000) { b.n = 0; b.t = now; }
  b.n++; buckets.set(key, b); return b.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 120_000) buckets.delete(k); }, 60_000).unref();

// Aussehen der Figur: nur erlaubte Werte übernehmen
const LOOK_KEYS = { jacke: 12, hose: 12, haut: 6, haare: 8 };
function cleanLook(look) {
  const out = {};
  if (look && typeof look === 'object') for (const [k, n] of Object.entries(LOOK_KEYS)) {
    const v = Number(look[k]); if (Number.isInteger(v) && v >= 0 && v < n) out[k] = v;
  }
  return out;
}

// ---------- API ----------
const routes = {
  'GET /api/status': async () => [200, { ok: true, spiel: 'Valenheim – The City Challenge', buerger: DB.countPlayers(), online: global.VALENHEIM_ONLINE?.() ?? 0 }],

  'POST /api/register': async (req) => {
    if (limited('reg:' + clientIp(req), 5)) return [429, { fehler: 'Zu viele Versuche. Bitte warte eine Minute.' }];
    const body = await readJson(req);
    const name = String(body.name || '').trim();
    const err = checkName(name);
    if (err) return [400, { fehler: err }];
    if (DB.findByName(name)) return [409, { fehler: 'Dieser Name ist schon vergeben. Bitte wähle einen anderen.' }];
    try {
      const { token, player } = DB.createPlayer(name, cleanLook(body.look));
      return [201, { token, profil: DB.publicProfile(player) }];
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return [409, { fehler: 'Dieser Name ist schon vergeben. Bitte wähle einen anderen.' }];
      throw e;
    }
  },

  'GET /api/me': async (req) => {
    const p = DB.findByToken(tokenFrom(req));
    if (!p) return [401, { fehler: 'Nicht angemeldet.' }];
    if (p.banned) return [403, { fehler: 'Dieses Konto wurde gesperrt.' }];
    DB.touch(p.id);
    return [200, { profil: DB.publicProfile(p) }];
  },
};

// ---------- statische Dateien (gebaute Website) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) return send(res, 404, 'Website noch nicht gebaut (npm run build).');
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.normalize(path.join(DIST, url));
  if (!file.startsWith(DIST)) return send(res, 403, 'verboten');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html'); // SPA-Routen
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

export const server = http.createServer(async (req, res) => {
  const key = `${req.method} ${req.url.split('?')[0]}`;
  const h = routes[key];
  if (h) {
    try { const [status, data] = await h(req, res); send(res, status, data); }
    catch (e) { console.error(e); send(res, e.message === 'ungültiges JSON' || e.message === 'zu groß' ? 400 : 500, { fehler: 'Serverfehler.' }); }
    return;
  }
  if (req.url.startsWith('/api/')) return send(res, 404, { fehler: 'Unbekannte Anfrage.' });
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  send(res, 405, 'Methode nicht erlaubt');
});

// Multiplayer anhängen (Phase 2), falls vorhanden
try { const room = await import('./room.js'); room.attach(server); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

server.listen(PORT, () => console.log(`Valenheim-Server läuft auf http://localhost:${PORT}`));
