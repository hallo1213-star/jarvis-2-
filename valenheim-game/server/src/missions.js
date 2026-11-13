// Missionen – komplett serverseitig: Annahme, Fortschritt (anhand der vom Server geprüften Position),
// evakuierte Einwohner (vom Server gesteuert), Punktevergabe.
import * as DB from './db.js';
import { PLACES, BOARDS, EVAC_SPAWNS, EVAC_POINTS } from './world.js';
import { hooks, send, broadcast } from './room.js';

const NEAR = 4.5, VISIT = 7, COOLDOWN = 30_000, MAX_TIME = 15 * 60_000;
const TEAM_BONUS = 25, TEAM_RADIUS = 18, TEAM_EVERY = 120_000;
const EXPLORE_POOL = ['rathaus', 'brunnen', 'krankenhaus', 'rettung', 'bahnhof', 'bahnsteig', 'park', 'teich', 'militaer_tor', 'lager', 'industrie'];
const NOTICE_POOL = ['bahnhof', 'krankenhaus', 'park', 'rettung', 'brunnen', 'lager'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pick = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
let npcSeq = 0;

function targetInfo(key) { const p = PLACES[key]; return p ? { key, name: p.name, x: p.x, z: p.z } : null; }

// Zustand für den Client
function view(m) {
  const t = m.targets[m.idx];
  return {
    id: m.def.id, typ: m.def.typ, titel: m.def.titel, punkte: m.def.punkte,
    text: m.text(), ziel: t ? targetInfo(t.key) : null, schritt: m.idx + 1, schritte: m.targets.length,
    tragen: !!m.carrying, gerettet: m.saved || 0, deadline: m.deadline || null,
  };
}

function start(c, def) {
  const now = Date.now(); const p = def.params || {};
  const m = { def, idx: 0, startedAt: now, carrying: null, saved: 0, npcs: [], deadline: p.zeit ? now + p.zeit * 1000 : null };
  if (def.typ === 'erkundung') {
    const keys = pick(EXPLORE_POOL.filter((k) => dist(PLACES[k], c) > 25), p.anzahl || 3);
    m.targets = keys.map((key) => ({ key, mode: 'visit' }));
    m.text = () => `Gehe zu: ${PLACES[m.targets[m.idx].key].name}`;
  } else if (def.typ === 'versorgung' || def.typ === 'medizin') {
    m.targets = [{ key: p.von, mode: 'pickup' }, { key: p.nach, mode: 'deliver' }];
    const ware = def.typ === 'medizin' ? 'die Medikamente' : 'die Kiste';
    m.text = () => (m.idx === 0 ? `Hole ${ware}: ${PLACES[p.von].name} (E drücken)` : `Bringe ${ware} zu: ${PLACES[p.nach].name} (E drücken)`);
    m.ware = def.typ === 'medizin' ? 'medizin' : 'kiste';
  } else if (def.typ === 'verwaltung') {
    const keys = pick(NOTICE_POOL, p.anzahl || 3);
    m.targets = [{ key: 'rathaus', mode: 'pickup' }, ...keys.map((key) => ({ key, mode: 'notice' }))];
    m.text = () => (m.idx === 0 ? 'Hole die Aushänge im Rathaus ab (E drücken)' : `Hänge den Aushang aus: ${PLACES[m.targets[m.idx].key].name} (E drücken)`);
    m.ware = 'aushang';
  } else if (def.typ === 'evakuierung') {
    const n = p.anzahl || 3; const [sx, sz] = EVAC_SPAWNS[Math.floor(Math.random() * EVAC_SPAWNS.length)];
    const goal = EVAC_POINTS.map((k) => ({ k, d: Math.hypot(PLACES[k].x - sx, PLACES[k].z - sz) })).sort((a, b) => a.d - b.d)[0].k;
    for (let i = 0; i < n; i++) m.npcs.push({ id: 'n' + ++npcSeq, x: sx + (i - 1) * 1.6, z: sz + (i % 2) * 1.2, h: 0, v: 0, state: 'wartet', slot: i, look: { jacke: (i * 5 + 3) % 12, hose: (i * 3) % 12, haut: i % 6, haare: (i * 2) % 8 } });
    m.targets = [{ key: '_evac', mode: 'evac' }, { key: goal, mode: 'evac_goal' }];
    m.spawn = { x: sx, z: sz };
    m.text = () => (m.idx === 0 ? 'Finde die Einwohner im Wohnviertel (Markierung)' : `Führe die Einwohner zur Sammelstelle: ${PLACES[goal].name} (${m.saved}/${n} in Sicherheit)`);
  } else return null;
  return m;
}

function viewTarget(m) {
  if (m.def.typ === 'evakuierung' && m.idx === 0) return { key: '_evac', name: 'Einwohner in Not', x: m.spawn.x, z: m.spawn.z };
  return null;
}
function sendState(c) {
  const v = view(c.mission); const vt = viewTarget(c.mission); if (vt) v.ziel = vt;
  send(c.ws, { t: 'm_state', m: v });
}

function finish(c) { done(c).catch((e) => console.error('Punktevergabe fehlgeschlagen:', e)); }
async function done(c) {
  const m = c.mission; if (!m) return; const dauer = (Date.now() - m.startedAt) / 1000;
  c.mission = null; c.cooldown = Date.now() + COOLDOWN; // sofort, damit nichts doppelt zählt
  const p = await DB.awardMission(c.id, m.def.id, m.def.punkte, dauer);
  c.level = DB.levelFor(p.points);
  send(c.ws, { t: 'm_done', titel: m.def.titel, punkte: m.def.punkte, profil: DB.publicProfile(p) });
  // Teamwork-Bonus für Mitspieler in der Nähe
  for (const o of c.room.clients.values()) {
    if (o === c || dist(o, c) > TEAM_RADIUS || (o.lastTeam && Date.now() - o.lastTeam < TEAM_EVERY)) continue;
    o.lastTeam = Date.now(); const q = await DB.awardMission(o.id, 'teamwork', TEAM_BONUS, 0, false);
    send(o.ws, { t: 'm_bonus', punkte: TEAM_BONUS, wer: c.name, profil: DB.publicProfile(q) });
  }
  broadcast(c.room, { t: 'feed', text: `${c.name} hat „${m.def.titel}“ erledigt (+${m.def.punkte})` }, c);
}
function fail(c, grund) { c.mission = null; send(c.ws, { t: 'm_fail', grund }); }

function nearBoard(c) { return BOARDS.some((k) => dist(PLACES[k], c) <= NEAR + 1); }

// ---------- Nachrichten ----------
hooks.onJoin.push((c) => {
  c.mission = null; c.trail = [{ x: c.x, z: c.z }];
  send(c.ws, { t: 'world', places: PLACES, boards: BOARDS });
});
hooks.onLeave.push((c) => { c.mission = null; });

hooks.onMessage.push(async (c, msg) => {
  const now = Date.now();
  if (msg.t === 'm_list') {
    if (!nearBoard(c)) return send(c.ws, { t: 'm_info', text: 'Gehe zu einer Missionstafel.' });
    const list = (await DB.listMissions(true)).map(({ id, typ, titel, beschreibung, punkte, params }) => ({ id, typ, titel, beschreibung, punkte, zeit: params.zeit || null }));
    return send(c.ws, { t: 'm_list', list, cooldown: Math.max(0, (c.cooldown || 0) - now) });
  }
  if (msg.t === 'm_accept') {
    if (c.mission) return send(c.ws, { t: 'm_info', text: 'Du hast bereits eine Mission.' });
    if (!nearBoard(c)) return send(c.ws, { t: 'm_info', text: 'Missionen gibt es nur an der Missionstafel.' });
    if (c.cooldown && now < c.cooldown) return send(c.ws, { t: 'm_info', text: `Kurze Pause: neue Mission in ${Math.ceil((c.cooldown - now) / 1000)} s.` });
    if (c.accepting) return; c.accepting = true; let def; try { def = await DB.getMission(String(msg.id)); } finally { c.accepting = false; }
    if (c.mission) return; if (!def || !def.aktiv) return send(c.ws, { t: 'm_info', text: 'Diese Mission ist nicht verfügbar.' });
    const m = start(c, def); if (!m) return; c.mission = m; c.trail = [{ x: c.x, z: c.z }];
    return sendState(c);
  }
  if (msg.t === 'm_abort') { if (c.mission) { c.mission = null; send(c.ws, { t: 'm_state', m: null }); } return; }
  if (msg.t === 'act') {
    const m = c.mission;
    if (!m) { if (nearBoard(c)) hooks.onMessage.forEach((f) => f(c, { t: 'm_list' })); return; }
    const t = m.targets[m.idx]; if (!t || !['pickup', 'deliver', 'notice'].includes(t.mode)) return;
    if (dist(PLACES[t.key], c) > NEAR) return send(c.ws, { t: 'm_info', text: 'Du bist noch nicht am Ziel.' });
    if (t.mode === 'pickup') { m.carrying = m.ware; m.idx++; send(c.ws, { t: 'm_info', text: m.ware === 'aushang' ? 'Aushänge eingepackt.' : 'Aufgenommen! Laufen statt rennen – die Ladung ist schwer.' }); }
    else if (t.mode === 'notice') { m.idx++; send(c.ws, { t: 'm_info', text: `Aushang hängt (${m.idx - 1}/${m.targets.length - 1}).` }); }
    else if (t.mode === 'deliver') { m.carrying = null; m.idx++; }
    if (m.idx >= m.targets.length) return finish(c);
    return sendState(c);
  }
});

// Bewegung: Erkundungsziele, Spur für Einwohner, Tragen = kein Rennen
hooks.onMove = hooks.onMove || [];
hooks.onMove.push((c, dt, d) => {
  const last = c.trail[c.trail.length - 1];
  if (!last || Math.hypot(c.x - last.x, c.z - last.z) > 0.8) { c.trail.push({ x: c.x, z: c.z }); if (c.trail.length > 60) c.trail.shift(); }
  const m = c.mission; if (!m) return;
  if (m.carrying && m.ware !== 'aushang' && !c.v && d / dt > 5.6) { // mit schwerer Ladung nur gehen
    c.carryWarn = (c.carryWarn || 0) + 1;
    if (c.carryWarn === 1) send(c.ws, { t: 'm_info', text: 'Mit der Ladung kannst du nicht rennen!' });
    if (c.carryWarn > 20) { m.carrying = null; m.idx = 0; c.carryWarn = 0; send(c.ws, { t: 'm_info', text: 'Die Ladung ist dir heruntergefallen – hole eine neue!' }); sendState(c); }
  } else c.carryWarn = 0;
  const t = m.targets[m.idx];
  if (t?.mode === 'visit' && dist(PLACES[t.key], c) <= VISIT) {
    m.idx++; if (m.idx >= m.targets.length) return finish(c);
    send(c.ws, { t: 'm_info', text: `${PLACES[t.key].name}: alles in Ordnung ✓` }); sendState(c);
  }
});

// Einwohner (Evakuierung) + Zeitlimits: 5× pro Sekunde
setInterval(() => { try { tick(); } catch (e) { console.error('Missions-Tick-Fehler:', e); } }, 200).unref();
function tick() {
  const now = Date.now(); const perRoom = new Map();
  const { clientsOf } = hooksRef; if (!clientsOf) return;
  for (const c of clientsOf().values()) {
    const m = c.mission; if (!m) continue;
    if ((m.deadline && now > m.deadline) || now - m.startedAt > MAX_TIME) { fail(c, m.deadline ? 'Die Zeit ist abgelaufen.' : 'Mission abgebrochen (zu lange).'); continue; }
    if (m.def.typ !== 'evakuierung') continue;
    const goalKey = m.targets[1].key; const goal = PLACES[goalKey];
    for (const n of m.npcs) {
      if (n.state === 'sicher') continue;
      if (n.state === 'wartet' && dist(n, c) < 5) { n.state = 'folgt'; if (m.idx === 0) { m.idx = 1; send(c.ws, { t: 'm_info', text: 'Die Einwohner folgen dir. Führe sie zur Sammelstelle!' }); sendState(c); } }
      if (n.state === 'folgt') {
        const tr = c.trail; const target = tr[Math.max(0, tr.length - 3 - n.slot * 2)] || c;
        const dx = target.x - n.x, dz = target.z - n.z; const d = Math.hypot(dx, dz);
        const sp = Math.min(8, d * 2.2); n.v = d > 0.3 ? sp : 0;
        if (d > 0.3) { n.x += (dx / d) * sp * 0.2; n.z += (dz / d) * sp * 0.2; n.h = Math.atan2(dx, dz); }
        if (dist(n, c) > 30) { n.state = 'wartet'; send(c.ws, { t: 'm_info', text: 'Ein Einwohner hat dich verloren – gehe zurück!' }); }
        if (dist(n, goal) < 8) { n.state = 'sicher'; n.v = 0; m.saved++; send(c.ws, { t: 'm_info', text: `Einwohner in Sicherheit (${m.saved}/${m.npcs.length})` }); sendState(c); }
      }
    }
    if (m.saved >= m.npcs.length) { finish(c); continue; }
    if (!perRoom.has(c.room)) perRoom.set(c.room, []);
    perRoom.get(c.room).push(...m.npcs.filter((n) => n.state !== 'sicher').map((n) => [n.id, +n.x.toFixed(2), +n.z.toFixed(2), +n.h.toFixed(2), +n.v.toFixed(1), n.look]));
  }
  for (const room of new Set([...perRoom.keys(), ...[...clientsOf().values()].map((c) => c.room)])) {
    const l = perRoom.get(room) || []; if (!l.length && !room.hadNpc) continue;
    room.hadNpc = l.length > 0; broadcast(room, { t: 'npc', l });
  }
}

const hooksRef = {};
export function init(clientsOf) { hooksRef.clientsOf = clientsOf; }
