// Multiplayer: gemeinsame Stadt über WebSocket (/ws).
// Der Server ist maßgeblich: Anmeldung per Token, Geschwindigkeits-/Grenzprüfung, Instanzen à 50 Spieler.
import { WebSocketServer } from 'ws';
import * as DB from './db.js';

const TICK_HZ = 15, MAX_PER_ROOM = 50, BOUNDS = 330;
const MAX_SPEED = 8.4;           // m/s (Rennen 7.6 + Puffer)
const EMOTES = ['hallo', 'hilfe', 'folgen', 'danke', 'super', 'achtung'];

// Fehler in Spiellogik dürfen den Server nie beenden
function safe(fn) { try { fn(); } catch (e) { console.error('Spiellogik-Fehler:', e); } }

const rooms = new Map(); let roomSeq = 0;
const online = new Map(); // playerId -> client
global.VALENHEIM_ONLINE = () => online.size;

function getRoom() {
  for (const r of rooms.values()) if (r.clients.size < MAX_PER_ROOM) return r;
  const id = ++roomSeq; const r = { id, name: `Valenheim #${id}`, clients: new Map() }; rooms.set(id, r); return r;
}
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
function broadcast(room, msg, except) { const s = JSON.stringify(msg); for (const c of room.clients.values()) if (c !== except && c.ws.readyState === 1) c.ws.send(s); }
function broadcastAll(msg) { const s = JSON.stringify(msg); for (const c of online.values()) if (c.ws.readyState === 1) c.ws.send(s); }
const pub = (c) => ({ id: c.id, name: c.name, look: c.look, level: c.level, x: c.x, y: c.y, z: c.z, h: c.h });

export const hooks = { onJoin: [], onLeave: [], onMessage: [], onMove: [] }; // für Missionen (Phase 3)
export function clientsOf() { return online; }
export { send, broadcast, broadcastAll };

// Aktueller Weltzustand (Wetter, Stromausfall) – neue Spieler bekommen ihn beim Betreten
const worldState = {};
export function setWorldState(typ, dauer) {
  const until = Date.now() + dauer * 1000;
  if (typ === 'regen' || typ === 'nebel') { worldState.wetter = { typ, until }; }
  if (typ === 'klar') delete worldState.wetter;
  if (typ === 'stromausfall') worldState.strom = { until };
}
function currentWorld() { const now = Date.now(); const o = {}; for (const [k, v] of Object.entries(worldState)) if (v.until > now) o[k] = { ...v, rest: Math.round((v.until - now) / 1000) }; return o; }

export function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });

  wss.on('connection', (ws, req) => {
    let c = null; ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    const helloTimer = setTimeout(() => { if (!c) ws.close(4001, 'keine Anmeldung'); }, 8000);
    let msgCount = 0, msgWindow = Date.now();

    ws.on('message', async (raw) => {
      // Flutschutz: max. 40 Nachrichten pro Sekunde
      const now = Date.now(); if (now - msgWindow > 1000) { msgWindow = now; msgCount = 0; } if (++msgCount > 40) return;
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!c) {
        if (m.t !== 'hello') return;
        if (ws.helloBusy) return; ws.helloBusy = true;
        const p = await DB.findByToken(String(m.token || ''));
        if (!p) return ws.close(4003, 'ungültig');
        if (p.banned) return ws.close(4004, 'gesperrt');
        clearTimeout(helloTimer);
        // Gleiches Konto schon online? Alte Verbindung beenden (nur eine Sitzung pro Konto)
        const old = online.get(p.id); if (old) { send(old.ws, { t: 'kicked', grund: 'Du hast dich auf einem anderen Gerät oder Tab angemeldet.' }); old.ws.close(4005, 'doppelt'); leave(old); }
        const room = getRoom(); const prof = DB.publicProfile(p);
        c = { id: p.id, name: p.name, look: prof.look, level: prof.level, role: p.role, ws, room, x: 0, y: 0.15, z: 21, h: Math.PI, a: 0, lastT: now, joinedAt: now, lastEmote: 0, warn: 0 };
        room.clients.set(c.id, c); online.set(c.id, c); DB.touch(c.id).catch(() => {});
        send(ws, { t: 'welcome', welt: currentWorld(), you: c.id, room: room.name, players: [...room.clients.values()].filter((o) => o !== c).map(pub), online: online.size });
        broadcast(room, { t: 'join', p: pub(c) }, c);
        broadcastAll({ t: 'online', n: online.size });
        safe(() => hooks.onJoin.forEach((f) => f(c)));
        return;
      }
      if (m.t === 'in') {
        const x = +m.x, y = +m.y, z = +m.z, h = +m.h; if (![x, y, z, h].every(Number.isFinite)) return;
        const dt = Math.max(0.05, (now - c.lastT) / 1000); const d = Math.hypot(x - c.x, z - c.z);
        const inside = Math.abs(x) <= BOUNDS && Math.abs(z) <= BOUNDS && y > -1 && y < 12;
        if (!inside || d > MAX_SPEED * dt + 1.5) { // zu schnell / außerhalb: Server setzt zurück
          c.warn++; send(ws, { t: 'fix', x: c.x, y: c.y, z: c.z }); c.lastT = now; return;
        }
        c.x = x; c.y = y; c.z = z; c.h = h; c.a = Math.min(9, Math.max(0, +m.a || 0)); c.lastT = now;
        safe(() => hooks.onMove.forEach((f) => f(c, dt, d)));
        return;
      }
      if (m.t === 'emote') {
        if (!EMOTES.includes(m.k) || now - c.lastEmote < 1200) return; c.lastEmote = now;
        broadcast(c.room, { t: 'emote', id: c.id, k: m.k });
        return;
      }
      if (m.t === 'ping') return send(ws, { t: 'pong', ts: m.ts, now });
      safe(() => hooks.onMessage.forEach((f) => f(c, m)));
    });
    ws.on('close', () => { clearTimeout(helloTimer); if (c) leave(c); });
    ws.on('error', () => {});
  });

  function leave(c) {
    if (!c.room.clients.has(c.id) || c.room.clients.get(c.id) !== c) return;
    c.room.clients.delete(c.id); if (online.get(c.id) === c) online.delete(c.id);
    Promise.resolve(DB.addPlaytime(c.id, (Date.now() - c.joinedAt) / 1000)).then(() => DB.touch(c.id)).catch((e) => console.error(e));
    broadcast(c.room, { t: 'leave', id: c.id });
    broadcastAll({ t: 'online', n: online.size });
    safe(() => hooks.onLeave.forEach((f) => f(c)));
    if (c.room.clients.size === 0 && rooms.size > 1) rooms.delete(c.room.id);
  }

  // Zustand an alle senden (15× pro Sekunde)
  setInterval(() => {
    const ts = Date.now();
    for (const room of rooms.values()) {
      if (room.clients.size < 2) continue;
      const p = [...room.clients.values()].map((c) => [c.id, +c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2), +c.h.toFixed(2), +c.a.toFixed(1)]);
      broadcast(room, { t: 'snap', ts, p });
    }
  }, 1000 / TICK_HZ).unref();

  // Tote Verbindungen aufräumen
  setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 20000).unref();

  console.log('Multiplayer aktiv auf /ws');
  return wss;
}
