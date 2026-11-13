// Weitere API: Rangliste, Profile (Phase 4) und Bürgermeister-Dashboard (Phase 5).
// Jede /api/admin/*-Route prüft serverseitig eine gültige Bürgermeister-Sitzung.
import * as DB from './db.js';
import * as ADMIN from './admin.js';
import { PLACES } from './world.js';

const TYPES = ['erkundung', 'versorgung', 'medizin', 'evakuierung', 'verwaltung'];
const EVENT_TYPES = ['meldung', 'sirene', 'stromausfall', 'regen', 'nebel', 'klar', 'radio'];

let lbCache = { t: 0, data: null };

export function extraRoutes({ readJson, tokenFrom, limited, clientIp, room }) {
  const needAdmin = (req) => ADMIN.checkSession(req.headers['x-admin-token']);
  const admin = (fn) => async (req, params) => (needAdmin(req) ? fn(req, params) : [401, { fehler: 'Nur für den Bürgermeister. Bitte anmelden.' }]);

  return [
    // ---------- Öffentlich ----------
    ['GET', /^\/api\/rangliste$/, async () => {
      if (Date.now() - lbCache.t > 5000) lbCache = { t: Date.now(), data: await DB.leaderboard(100) };
      return [200, { liste: lbCache.data, stand: lbCache.t, buerger: await DB.countPlayers() }];
    }],
    ['GET', /^\/api\/profil\/([^/]+)$/, async (req, [name]) => {
      const p = await DB.findByName(decodeURIComponent(name)); if (!p) return [404, { fehler: 'Diesen Bürger gibt es nicht.' }];
      const full = await DB.fullProfile(p); const me = await DB.findByToken(tokenFrom(req));
      return [200, { profil: { ...full, eigenes: !!me && me.id === p.id } }];
    }],

    // ---------- Bürgermeister ----------
    ['GET', /^\/api\/admin\/status$/, async () => [200, { eingerichtet: ADMIN.adminConfigured() }]],
    ['POST', /^\/api\/admin\/login$/, async (req) => {
      if (limited('adm:' + clientIp(req), 5)) return [429, { fehler: 'Zu viele Versuche. Bitte warte eine Minute.' }];
      if (!ADMIN.adminConfigured()) return [503, { fehler: 'Der Bürgermeister-Zugang ist noch nicht eingerichtet (npm run admin:passwort).' }];
      const { passwort } = await readJson(req);
      if (!ADMIN.verifyPassword(passwort)) { await DB.adminLog('login_fehlgeschlagen', clientIp(req)); return [401, { fehler: 'Falsches Passwort.' }]; }
      await DB.adminLog('login', clientIp(req)); return [200, { token: ADMIN.createSession() }];
    }],
    ['POST', /^\/api\/admin\/logout$/, async (req) => { ADMIN.endSession(req.headers['x-admin-token']); return [200, { ok: true }]; }],
    ['GET', /^\/api\/admin\/uebersicht$/, admin(async () => [200, { stats: await DB.stats(), online: [...room.clientsOf().values()].map((c) => ({ id: c.id, name: c.name, raum: c.room.name, mission: c.mission?.def.titel || null })), log: await DB.adminLogList(15), events: await DB.recentEvents(10) }])],
    ['GET', /^\/api\/admin\/buerger$/, admin(async (req) => {
      const u = new URL(req.url, 'http://x'); const q = (u.searchParams.get('q') || '').slice(0, 30); const seite = Math.max(0, +u.searchParams.get('seite') || 0);
      return [200, await DB.searchPlayers(q, 50, seite * 50)];
    })],
    ['GET', /^\/api\/admin\/buerger\/([\w-]+)$/, admin(async (req, [id]) => {
      const p = await DB.findById(id); if (!p) return [404, { fehler: 'Nicht gefunden.' }];
      return [200, { profil: { ...await DB.fullProfile(p), letzte: await DB.completionsOf(id, 50), online: room.clientsOf().has(id), last_seen: p.last_seen } }];
    })],
    ['POST', /^\/api\/admin\/buerger\/([\w-]+)\/punkte$/, admin(async (req, [id]) => {
      const { delta, grund } = await readJson(req); const d = Math.trunc(+delta);
      if (!Number.isFinite(d) || d === 0 || Math.abs(d) > 100000) return [400, { fehler: 'Ungültige Punktzahl.' }];
      if (!grund || String(grund).trim().length < 3) return [400, { fehler: 'Bitte einen Grund angeben.' }];
      const p = await DB.adjustPoints(id, d); if (!p) return [404, { fehler: 'Nicht gefunden.' }];
      await DB.adminLog('punkte', p.name, { delta: d, grund: String(grund).slice(0, 200) });
      const c = room.clientsOf().get(id); if (c) room.send(c.ws, { t: 'profil', profil: DB.publicProfile(p), text: `Der Bürgermeister hat deine Punkte angepasst (${d > 0 ? '+' : ''}${d}).` });
      return [200, { profil: DB.publicProfile(p) }];
    })],
    ['POST', /^\/api\/admin\/buerger\/([\w-]+)\/sperre$/, admin(async (req, [id]) => {
      const { gesperrt, grund } = await readJson(req); const p = await DB.setBanned(id, !!gesperrt); if (!p) return [404, { fehler: 'Nicht gefunden.' }];
      await DB.adminLog(gesperrt ? 'sperre' : 'entsperrt', p.name, { grund: String(grund || '').slice(0, 200) });
      if (gesperrt) { const c = room.clientsOf().get(id); if (c) c.ws.close(4004, 'gesperrt'); }
      lbCache.t = 0; return [200, { ok: true, gesperrt: !!p.banned }];
    })],
    ['GET', /^\/api\/admin\/missionen$/, admin(async () => [200, { liste: await DB.listMissions(false), typen: TYPES, orte: Object.entries(PLACES).filter(([k]) => !k.startsWith('tafel')).map(([k, v]) => ({ key: k, name: v.name })) }])],
    ['POST', /^\/api\/admin\/missionen$/, admin(async (req) => {
      const b = await readJson(req); const err = validateMission(b); if (err) return [400, { fehler: err }];
      const id = b.id && /^[a-z0-9_]{3,40}$/.test(b.id) ? b.id : `m_${Date.now().toString(36)}`;
      const m = await DB.saveMission({ id, typ: b.typ, titel: b.titel.trim(), beschreibung: b.beschreibung.trim(), punkte: Math.trunc(b.punkte), aktiv: b.aktiv !== false, params: cleanParams(b) });
      await DB.adminLog(b.id ? 'mission_bearbeitet' : 'mission_erstellt', m.titel, { id: m.id }); return [200, { mission: m }];
    })],
    ['POST', /^\/api\/admin\/missionen\/([\w-]+)\/aktiv$/, admin(async (req, [id]) => {
      const m = await DB.getMission(id); if (!m) return [404, { fehler: 'Nicht gefunden.' }];
      const { aktiv } = await readJson(req); const s = await DB.saveMission({ ...m, aktiv: !!aktiv });
      await DB.adminLog(aktiv ? 'mission_aktiviert' : 'mission_deaktiviert', m.titel); return [200, { mission: s }];
    })],
    ['POST', /^\/api\/admin\/ereignis$/, admin(async (req) => {
      const { typ, text, dauer } = await readJson(req);
      if (!EVENT_TYPES.includes(typ)) return [400, { fehler: 'Unbekanntes Ereignis.' }];
      const t = String(text || '').trim().slice(0, 240); const d = Math.min(600, Math.max(5, Math.trunc(+dauer || 30)));
      if ((typ === 'meldung' || typ === 'radio') && t.length < 3) return [400, { fehler: 'Bitte einen Text eingeben.' }];
      room.broadcastAll({ t: 'event', typ, text: t, dauer: d, at: Date.now() });
      room.setWorldState?.(typ, d); await DB.logEvent(typ, t, d); await DB.adminLog('ereignis', typ, { text: t, dauer: d });
      return [200, { ok: true, empfaenger: room.clientsOf().size }];
    })],
  ];
}

function validateMission(b) {
  if (!TYPES.includes(b.typ)) return 'Ungültiger Missionstyp.';
  if (!b.titel || String(b.titel).trim().length < 3 || b.titel.length > 60) return 'Titel: 3–60 Zeichen.';
  if (!b.beschreibung || String(b.beschreibung).trim().length < 5 || b.beschreibung.length > 300) return 'Beschreibung: 5–300 Zeichen.';
  const p = Math.trunc(+b.punkte); if (!(p >= 10 && p <= 1000)) return 'Punkte: 10–1000.';
  if (['versorgung', 'medizin'].includes(b.typ)) { if (!PLACES[b.von] || !PLACES[b.nach] || b.von === b.nach) return 'Bitte Start- und Zielort wählen (verschieden).'; }
  return null;
}
function cleanParams(b) {
  if (['versorgung', 'medizin'].includes(b.typ)) return { von: b.von, nach: b.nach, ...(b.zeit ? { zeit: Math.min(1800, Math.max(60, Math.trunc(+b.zeit))) } : {}) };
  return { anzahl: Math.min(6, Math.max(1, Math.trunc(+b.anzahl || 3))) };
}
