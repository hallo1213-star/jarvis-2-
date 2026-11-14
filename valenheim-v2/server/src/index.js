// VALENHEIM 2.0 – Server (Phase 1): Anmeldung, Spielstände, Echtzeit-Verbindung, Website ausliefern
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as DB from './db.js';
import * as AUTH from './auth.js';
import * as SAVE from './saves.js';
import * as RAUM from './raeume.js';
import * as GELD from './geld.js';
import * as FZ from './fahrzeuge.js';
import { KATALOG } from './katalog.js';
import * as BERUF from './berufe.js';

process.on('unhandledRejection', (e) => console.error('Unbehandelter Fehler:', e));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 2600);
const DIST = path.resolve(__dirname, '../../client/dist');
const VERSION = '2.0.0-test';

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

// Geld-Aktion: angemeldet, Spamschutz, optional nur in/an Janniks Autohaus (Position kommt vom Server, nicht vom Client)
async function geldAktion(req, fn, autohaus = false) {
  const p = await authed(req); if (!p) return [401, { fehler: 'Nicht angemeldet.' }];
  if (limited('geld:' + p.id, 30)) return [429, { fehler: 'Zu viele Aktionen. Bitte kurz warten.' }];
  if (autohaus && process.env.ORT_PRUEFUNG !== 'aus') {
    const c = clients.get(p.id); const A = KATALOG.autohaus;
    if (!c || Math.hypot(c.pos.x - A.x, c.pos.z - A.z) > A.radius + 30) return [403, { fehler: 'Das geht nur bei Janniks Autohaus.' }];
  }
  const r = await fn(p, await readJson(req));
  if (r.fehler) return [400, { fehler: r.fehler }];
  const c = clients.get(p.id); if (c && r.bargeld !== undefined) c.ws.send(JSON.stringify({ t: 'geld', konto: { bargeld: r.bargeld, bank: r.bank } }));
  if (c && r.konto) c.ws.send(JSON.stringify({ t: 'geld', konto: r.konto }));
  return [200, r];
}
async function authed(req) { const p = await AUTH.playerFromToken(tokenOf(req)); return p; }

// ---------- API ----------
const routes = {
  'GET /api/status': async () => [200, { ok: true, spiel: 'VALENHEIM 2.0', version: VERSION, datenbank: DB.backend, online: clients.size }],
  'POST /api/auth/register': async (req) => {
    if (limited('reg:' + ipOf(req), Number(process.env.REG_LIMIT || 5))) return [429, { fehler: 'Zu viele Versuche. Bitte warte eine Minute.' }];
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
  'PUT /api/charakter': async (req) => {
    const p = await authed(req); if (!p) return [401, { fehler: 'Nicht angemeldet.' }];
    return [200, { charakter: await SAVE.saveCharakter(p.id, await readJson(req)) }];
  },
  'GET /api/server': async () => [200, { server: RAUM.liste(), max: RAUM.MAX_SPIELER }],
  'POST /api/server/privat': async (req) => {
    const p = await authed(req); if (!p) return [401, { fehler: 'Nicht angemeldet.' }];
    if (limited('priv:' + p.id, 5)) return [429, { fehler: 'Zu viele Versuche.' }];
    const r = RAUM.privatErstellen(p.id, (await readJson(req)).name);
    return r.fehler ? [503, { fehler: r.fehler }] : [200, { code: r.raum.code, name: r.raum.name, vorhanden: !!r.vorhanden }];
  },
  // ---------- Phase 5: Bank ----------
  'GET /api/geld': async (req) => {
    const p = await authed(req); if (!p) return [401, { fehler: 'Nicht angemeldet.' }];
    return [200, { konto: await GELD.konto(p.id), verlauf: await GELD.verlauf(p.id) }];
  },
  'POST /api/geld/einzahlen': async (req) => geldAktion(req, (p, b) => GELD.einzahlen(p.id, b.betrag)),
  'POST /api/geld/abheben': async (req) => geldAktion(req, (p, b) => GELD.abheben(p.id, b.betrag)),
  'POST /api/geld/ueberweisen': async (req) => geldAktion(req, async (p, b) => {
    const r = await GELD.ueberweisen(p.id, p.username, b.an, b.betrag, b.text);
    if (!r.fehler) { const z = clients.get(r.zielId); if (z) { z.ws.send(JSON.stringify({ t: 'geld', konto: await GELD.konto(r.zielId), text: `+${r.betrag.toLocaleString('de-DE')} € von ${p.username}` })); } }
    return r;
  }),
  // ---------- Phase 6: Fahrzeuge ----------
  'GET /api/fahrzeuge': async (req) => {
    const p = await authed(req); if (!p) return [401, { fehler: 'Nicht angemeldet.' }];
    return [200, { fahrzeuge: await FZ.liste(p.id), konto: await GELD.konto(p.id) }];
  },
  'POST /api/fahrzeuge/kaufen': async (req) => geldAktion(req, (p, b) => FZ.kaufen(p.id, b.modell, b.farbe), true),
  'POST /api/fahrzeuge/kennzeichen': async (req) => geldAktion(req, (p, b) => FZ.kennzeichenAendern(p.id, b.id, b.kennzeichen), true),
  'POST /api/fahrzeuge/tuning': async (req) => geldAktion(req, async (p, b) => {
    const r = await FZ.tunen(p.id, b.id, b.tuning);
    // Steht das Auto gerade in der Welt? Dann sehen alle sofort das neue Aussehen.
    const c = clients.get(p.id); if (!r.fehler && c?.auto?.id === r.fahrzeug.id) { Object.assign(c.auto, FZ.aussehen(r.fahrzeug)); if (c.raum) RAUM.anAlle(c.raum, { t: 'auto', spieler: c.id, auto: c.auto }); }
    return r;
  }, true),
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

// ---------- Echtzeit (Phase 4): Räume, andere Spieler, Chat ----------
const clients = new Map(); // playerId -> client
const geparkt = new Map(); // playerId -> letzte Parkposition (schneller als die DB bei kurzem Neuverbinden)
const MAX_SPEED = 13, MAX_AUTO = 100, BOUNDS = 2200;
const info = (c) => ({ id: c.id, name: c.name, look: c.look, pos: c.pos, auto: c.auto || null, f: c.faehrt ? 1 : 0 });
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
      const old = clients.get(p.id); if (old) { old.ws.send(JSON.stringify({ t: 'doppelt' })); old.ws.close(4005, 'doppelt'); const r0 = old.raum; RAUM.verlassen(old); geparkt.set(old.id, old.auto ? { id: old.auto.id, x: old.auto.x, y: old.auto.y, z: old.auto.z, h: old.auto.h } : null); if (r0) RAUM.anAlle(r0, { t: 'weg', id: old.id, name: old.name }); }
      const f = RAUM.finde({ raum: m.raum, code: m.code });
      if (f.fehler) { ws.send(JSON.stringify({ t: 'abgelehnt', grund: f.fehler })); return ws.close(4010, 'voll'); }
      const sv = await SAVE.getSave(p.id);
      c = { id: p.id, name: p.username, ws, look: sv.charakter?.aussehen || null, pos: { ...sv.pos, welt: sv.pos.welt || 'valenheim' }, lastT: Date.now(), dirty: false, raum: null };
      const konto = await GELD.konto(p.id);
      const park = geparkt.has(p.id) ? geparkt.get(p.id) : sv.geparkt;
      if (park?.id) { const fz = await FZ.eins(p.id, park.id); if (fz) c.auto = { ...FZ.aussehen(fz), x: park.x, y: park.y, z: park.z, h: park.h }; }
      if (ws.readyState !== 1) return;
      clients.set(p.id, c); RAUM.betreten(f.raum, c);
      const r = f.raum;
      ws.send(JSON.stringify({ t: 'willkommen', du: c.id, konto, meinAuto: c.auto || null, pos: c.pos, online: clients.size, raum: { id: r.id, name: r.name, privat: r.privat, code: r.privat ? r.code : null, max: RAUM.MAX_SPIELER }, andere: [...r.spieler.values()].filter((o) => o !== c).map(info) }));
      RAUM.anAlle(r, { t: 'neu', ...info(c) }, c);
      return;
    }
    if (m.t === 'pos') {
      const x = +m.x, y = +m.y, z = +m.z, h = +m.h; if (![x, y, z, h].every(Number.isFinite)) return;
      const now = Date.now(); const dt = Math.max(0.05, (now - c.lastT) / 1000);
      const d = Math.hypot(x - c.pos.x, z - c.pos.z);
      // Fahren nur im eigenen, ausgeparkten Auto – und nur, wenn man direkt daneben eingestiegen ist
      let f = m.f === 1 && !!c.auto;
      if (f && !c.faehrt && Math.hypot(c.pos.x - c.auto.x, c.pos.z - c.auto.z) > 7) f = false;
      const max = f || c.faehrt ? MAX_AUTO : MAX_SPEED;
      if (Math.abs(x) > BOUNDS || Math.abs(z) > BOUNDS || y < -50 || y > 400 || d > max * dt + 2) { c.lastT = now; return ws.send(JSON.stringify({ t: 'korrektur', pos: c.pos })); }
      c.pos = { x, y, z, h, welt: c.pos.welt }; c.lastT = now; c.dirty = true; c.neu = true;
      if (f) Object.assign(c.auto, { x, y, z, h });
      if (f !== !!c.faehrt) { c.faehrt = f; if (c.raum) RAUM.anAlle(c.raum, { t: 'auto', spieler: c.id, auto: c.auto, f: f ? 1 : 0 }); }
    } else if (m.t === 'chat') {
      const text = RAUM.filtere(m.text); if (!text || !c.raum) return;
      const nein = RAUM.darfChatten(c, text); if (nein) return ws.send(JSON.stringify({ t: 'chat', system: true, text: nein }));
      RAUM.anAlle(c.raum, { t: 'chat', id: c.id, von: c.name, text });
    } else if (m.t === 'auto_raus') {
      // Eigenes Auto neben sich abstellen lassen (max. 15 m vom Spieler entfernt)
      if (limited('auto:' + c.id, 10)) return ws.send(JSON.stringify({ t: 'chat', system: true, text: 'Bitte kurz warten.' }));
      const fz = await FZ.eins(c.id, m.id); if (!fz) return;
      const x = +m.x, y = +m.y, z = +m.z, h = +m.h; if (![x, y, z, h].every(Number.isFinite) || Math.hypot(x - c.pos.x, z - c.pos.z) > 15) return;
      c.auto = { ...FZ.aussehen(fz), x, y, z, h }; c.faehrt = false;
      if (c.raum) RAUM.anAlle(c.raum, { t: 'auto', spieler: c.id, auto: c.auto, f: 0 });
    } else if (m.t === 'auto_weg') {
      c.auto = null; c.faehrt = false; if (c.raum) RAUM.anAlle(c.raum, { t: 'auto', spieler: c.id, auto: null, f: 0 });
    } else if (m.t === 'job_start' || m.t === 'job_liefern' || m.t === 'job_ende') {
      if (limited('job:' + c.id, 20)) return;
      const r = m.t === 'job_start' ? BERUF.starten(c, String(m.firma || '')) : m.t === 'job_liefern' ? await BERUF.liefern(c) : BERUF.abbrechen(c);
      ws.send(JSON.stringify({ t: 'job', ...r, job: c.job || null }));
      if (r.konto) ws.send(JSON.stringify({ t: 'geld', konto: r.konto, text: `+${(r.lohn + r.bonus).toLocaleString('de-DE')} € Lohn${r.bonus ? ' inkl. Trinkgeld' : ''}` }));
    } else if (m.t === 'emote') {
      if (!['winken', 'jubeln', 'tanzen'].includes(m.art) || limited('emote:' + c.id, 12) || !c.raum || c.faehrt) return;
      RAUM.anAlle(c.raum, { t: 'emote', id: c.id, art: m.art }, c);
    } else if (m.t === 'look') {
      // Aussehen neu vom Server laden (nach Änderung im Editor) – nie vom Client übernehmen
      if (limited('look:' + c.id, 6)) return;
      const sv = await SAVE.getSave(c.id); c.look = sv.charakter?.aussehen || null;
      if (c.raum) RAUM.anAlle(c.raum, { t: 'look', id: c.id, look: c.look }, c);
    }
  });
  ws.on('close', async () => {
    clearTimeout(timer);
    if (c && clients.get(c.id) === c) {
      clients.delete(c.id); const r = c.raum; RAUM.verlassen(c);
      if (r) RAUM.anAlle(r, { t: 'weg', id: c.id, name: c.name });
      if (c.dirty) await SAVE.savePos(c.id, c.pos).catch(console.error);
      const park = c.auto ? { id: c.auto.id, x: c.auto.x, y: c.auto.y, z: c.auto.z, h: c.auto.h } : null; geparkt.set(c.id, park);
      await SAVE.saveGeparkt(c.id, park).catch(console.error);
    }
  });
  ws.on('error', () => {});
});
// Positionen aller Spieler eines Raums 10×/s an alle im Raum
setInterval(() => {
  const proRaum = new Map();
  for (const c of clients.values()) { if (!c.raum || !c.neu) continue; c.neu = false; const l = proRaum.get(c.raum) || []; l.push([c.id, +c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2), +(c.pos.h || 0).toFixed(2), c.faehrt ? 1 : 0]); proRaum.set(c.raum, l); }
  for (const [r, p] of proRaum) RAUM.anAlle(r, { t: 's', p });
}, 100).unref();
setInterval(() => RAUM.aufraeumen(), 30_000).unref();
// Gehalt: jede Minute online zählt, alle 10 Minuten gibt es Bürgergeld aufs Konto
setInterval(() => { for (const c of clients.values()) GELD.gehaltTick(c.id).then((k) => { if (k && c.ws.readyState === 1) c.ws.send(JSON.stringify({ t: 'geld', konto: k, text: `+${KATALOG.gehalt.betrag} € ${KATALOG.gehalt.text}` })); }).catch(console.error); }, 60_000).unref();
// Automatisch speichern (alle 30 s) + tote Verbindungen schließen
setInterval(() => { for (const c of clients.values()) if (c.dirty) { c.dirty = false; SAVE.savePos(c.id, c.pos).catch(console.error); } }, 30_000).unref();
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 20_000).unref();
setInterval(() => AUTH.cleanupSessions().catch(() => {}), 6 * 3600_000).unref();

server.listen(PORT, () => console.log(`VALENHEIM 2.0 läuft auf http://localhost:${PORT} (Datenbank: ${DB.backend})`));

// Sauber beenden: offene Positionen speichern
async function shutdown() { for (const c of clients.values()) { if (c.dirty) await SAVE.savePos(c.id, c.pos).catch(() => {}); await SAVE.saveGeparkt(c.id, c.auto || null).catch(() => {}); } await DB.close(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
