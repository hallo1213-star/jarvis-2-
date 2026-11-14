// Datenspeicher von Valenheim – The City Challenge.
// - Online (Render + Supabase): Postgres über DATABASE_URL  → Daten bleiben dauerhaft erhalten
// - Lokal: SQLite-Datei (node:sqlite, in Node 22 eingebaut)
// Alle Funktionen sind asynchron und liefern auf beiden Systemen dieselben Ergebnisse.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PG = !!process.env.DATABASE_URL;
let q; // q(sql, params) -> rows   (Platzhalter: ?)

if (PG) {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT als Zahl
  // DATABASE_URL robust lesen: Leerzeichen/Anführungszeichen entfernen, Passwort darf Sonderzeichen enthalten
  // (getrennt am LETZTEN '@', daher keine URL-Kodierung nötig).
  const raw = process.env.DATABASE_URL.trim().replace(/^['"]|['"]$/g, '').trim();
  const m = /^postgres(?:ql)?:\/\/([^:/@]+):(.*)@([^@/:]+)(?::(\d+))?\/([^?\s]+)/s.exec(raw);
  if (!m) { console.error('DATABASE_URL hat ein unbekanntes Format. Erwartet: postgresql://BENUTZER:PASSWORT@HOST:5432/postgres'); process.exit(1); }
  const [, user, password, host, port, database] = m;
  if (password.includes('[YOUR-PASSWORD]') || password === 'PASSWORT' || password === 'DEINPASSWORT') { console.error('DATABASE_URL: Bitte das echte Datenbank-Passwort einsetzen.'); process.exit(1); }
  console.log(`Datenbank: ${user}@${host}:${port || 5432}/${database}`);
  const pool = new pg.Pool({ user, password, host, port: Number(port || 5432), database, max: 5, ssl: process.env.DATABASE_SSL === 'aus' ? false : { rejectUnauthorized: false } });
  q = async (sql, params = []) => { let i = 0; const r = await pool.query(sql.replace(/\?/g, () => `$${++i}`), params); return r.rows; };
} else if (process.env.DB_PGLITE) {
  // Nur für Tests: echte Postgres-Engine im Speicher
  const { PGlite } = await import('@electric-sql/pglite'); const db = new PGlite();
  q = async (sql, params = []) => { let i = 0; const r = await db.query(sql.replace(/\?/g, () => `$${++i}`), params); return r.rows; };
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const DB_PATH = process.env.DB_PATH || path.resolve('data', 'valenheim.db');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH); db.exec('PRAGMA journal_mode = WAL;');
  q = async (sql, params = []) => { const st = db.prepare(sql); return /^\s*(select|with)/i.test(sql) || /returning/i.test(sql) ? st.all(...params).map((r) => ({ ...r })) : (st.run(...params), []); };
}
const PGSQL = PG || !!process.env.DB_PGLITE;
const one = async (sql, p) => (await q(sql, p))[0];
export const backend = PG ? 'postgres' : process.env.DB_PGLITE ? 'pglite' : 'sqlite';

// ---------- Schema ----------
const ID = PGSQL ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
const schema = [
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_lc TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL,
    created_at BIGINT NOT NULL, last_seen BIGINT NOT NULL, points INTEGER NOT NULL DEFAULT 0, missions INTEGER NOT NULL DEFAULT 0,
    playtime_s INTEGER NOT NULL DEFAULT 0, banned INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'citizen', look TEXT NOT NULL DEFAULT '{}')`,
  `CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY, typ TEXT NOT NULL, titel TEXT NOT NULL, beschreibung TEXT NOT NULL, punkte INTEGER NOT NULL,
    aktiv INTEGER NOT NULL DEFAULT 1, params TEXT NOT NULL DEFAULT '{}', created_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS completions (id ${ID}, player_id TEXT NOT NULL, mission_id TEXT NOT NULL, punkte INTEGER NOT NULL, dauer_s INTEGER NOT NULL, at BIGINT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS idx_completions_player ON completions(player_id)',
  'CREATE INDEX IF NOT EXISTS idx_completions_at ON completions(at)',
  'CREATE INDEX IF NOT EXISTS idx_players_points ON players(points DESC)',
  'CREATE INDEX IF NOT EXISTS idx_players_token ON players(token_hash)',
  `CREATE TABLE IF NOT EXISTS admin_log (id ${ID}, at BIGINT NOT NULL, aktion TEXT NOT NULL, ziel TEXT, details TEXT)`,
  `CREATE TABLE IF NOT EXISTS events (id ${ID}, at BIGINT NOT NULL, typ TEXT NOT NULL, text TEXT, dauer INTEGER)`,
];
for (const s of schema) await q(s);

// Standard-Missionen (nur beim ersten Start; danach im Bürgermeister-Dashboard bearbeitbar)
const DEFAULT_MISSIONS = [
  ['erk_rundgang', 'erkundung', 'Stadtrundgang', 'Besuche drei Orte in Valenheim und melde, dass dort alles in Ordnung ist.', 75, { anzahl: 3 }],
  ['vers_rathaus', 'versorgung', 'Lebensmittel für die Ausgabestelle', 'Hole eine Kiste Lebensmittel im Versorgungslager und bringe sie zum Rathaus.', 100, { von: 'lager', nach: 'rathaus' }],
  ['vers_krankenhaus', 'versorgung', 'Hilfsgüter fürs Krankenhaus', 'Bringe Hilfsgüter aus dem Versorgungslager zum Krankenhaus.', 100, { von: 'lager', nach: 'krankenhaus' }],
  ['med_bahnhof', 'medizin', 'Medikamente vom Bahnhof', 'Eine Lieferung Medikamente ist am Bahnsteig angekommen. Bringe sie schnell in die Notaufnahme.', 150, { von: 'bahnsteig', nach: 'notaufnahme', zeit: 300 }],
  ['med_rettung', 'medizin', 'Verbandsmaterial für den Rettungsdienst', 'Hole Verbandsmaterial im Krankenhaus und bringe es zur Rettungsstation.', 150, { von: 'krankenhaus', nach: 'rettung', zeit: 180 }],
  ['evak_wohnviertel', 'evakuierung', 'Evakuierung im Wohnviertel', 'Drei Einwohner brauchen Hilfe. Führe sie sicher zur nächsten Sammelstelle.', 200, { anzahl: 3 }],
  ['verw_aushang', 'verwaltung', 'Offizielle Aushänge verteilen', 'Hole die neuen Sicherheitshinweise im Rathaus ab und hänge sie an drei Orten aus.', 100, { anzahl: 3 }],
];
if (Number((await one('SELECT COUNT(*) AS n FROM missions')).n) === 0) {
  for (const [id, typ, titel, b, p, params] of DEFAULT_MISSIONS) {
    await q('INSERT INTO missions (id, typ, titel, beschreibung, punkte, aktiv, params, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)', [id, typ, titel, b, p, JSON.stringify(params), Date.now()]);
  }
}

// ---------- Spieler ----------
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
// Level n braucht 125·n·(n−1) Punkte (L2 = 250, L3 = 750, L4 = 1500 …)
export function levelFor(points) { let l = 1; while (points >= 125 * (l + 1) * l) l++; return l; }

export function publicProfile(p) {
  if (!p) return null;
  return { id: p.id, name: p.name, points: p.points, level: levelFor(p.points), missions: p.missions, playtime_s: p.playtime_s, created_at: p.created_at, role: p.role, look: JSON.parse(p.look || '{}') };
}
export const findByName = (name) => one('SELECT * FROM players WHERE name_lc = ?', [name.toLowerCase()]);
export const findByToken = (token) => (token ? one('SELECT * FROM players WHERE token_hash = ?', [hashToken(token)]) : null);
export const findById = (id) => one('SELECT * FROM players WHERE id = ?', [id]);
export const countPlayers = async () => Number((await one('SELECT COUNT(*) AS n FROM players')).n);

export async function createPlayer(name, look) {
  const id = crypto.randomUUID(); const token = crypto.randomBytes(32).toString('base64url'); const now = Date.now();
  await q('INSERT INTO players (id, name, name_lc, token_hash, created_at, last_seen, look) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, name, name.toLowerCase(), hashToken(token), now, now, JSON.stringify(look || {})]);
  return { token, player: await findById(id) };
}
export const touch = (id) => q('UPDATE players SET last_seen = ? WHERE id = ?', [Date.now(), id]);
export const addPlaytime = (id, s) => (s > 0 ? q('UPDATE players SET playtime_s = playtime_s + ? WHERE id = ?', [Math.round(s), id]) : null);

// ---------- Missionen ----------
const parseMission = (m) => m && { ...m, aktiv: !!m.aktiv, params: JSON.parse(m.params || '{}') };
export const listMissions = async (onlyActive = false) => (await q(`SELECT * FROM missions ${onlyActive ? 'WHERE aktiv = 1' : ''} ORDER BY punkte, titel`)).map(parseMission);
export const getMission = async (id) => parseMission(await one('SELECT * FROM missions WHERE id = ?', [id]));

// Punkte NUR hier und nur vom Server vergeben. Eine Anweisung je Tabelle – atomar genug für diesen Zweck.
export async function awardMission(playerId, missionId, punkte, dauer, zaehlt = true) {
  await q('UPDATE players SET points = points + ?, missions = missions + ? WHERE id = ?', [punkte, zaehlt ? 1 : 0, playerId]);
  await q('INSERT INTO completions (player_id, mission_id, punkte, dauer_s, at) VALUES (?, ?, ?, ?, ?)', [playerId, missionId, punkte, Math.round(dauer), Date.now()]);
  return findById(playerId);
}
export const completionsOf = (playerId, limit = 20) => q(`SELECT c.mission_id, c.punkte, c.dauer_s, c.at, m.titel, m.typ FROM completions c LEFT JOIN missions m ON m.id = c.mission_id
  WHERE c.player_id = ? ORDER BY c.at DESC LIMIT ?`, [playerId, limit]);

// ---------- Rangliste, Profil, Erfolge ----------
export async function leaderboard(limit = 100) {
  return (await q('SELECT name, points, missions FROM players WHERE banned = 0 ORDER BY points DESC, missions DESC, created_at ASC LIMIT ?', [limit]))
    .map((p, i) => ({ platz: i + 1, name: p.name, points: p.points, level: levelFor(p.points), missions: p.missions }));
}
export async function rankOf(p) {
  const r = await one(`SELECT COUNT(*) AS n FROM players WHERE banned = 0 AND (points > ? OR (points = ? AND missions > ?) OR (points = ? AND missions = ? AND created_at < ?))`,
    [p.points, p.points, p.missions, p.points, p.missions, p.created_at]);
  return Number(r.n) + 1;
}
export async function typeCounts(playerId) {
  const out = {};
  for (const r of await q('SELECT COALESCE(m.typ, c.mission_id) AS typ, COUNT(*) AS n FROM completions c LEFT JOIN missions m ON m.id = c.mission_id WHERE c.player_id = ? GROUP BY COALESCE(m.typ, c.mission_id)', [playerId])) out[r.typ] = Number(r.n);
  return out;
}
export const ACHIEVEMENTS = [
  ['erster', '🎖️', 'Erster Einsatz', 'Die erste Mission erledigt', (p) => p.missions >= 1],
  ['helfer', '🤝', 'Helfer', '10 Missionen erledigt', (p) => p.missions >= 10],
  ['held', '🏅', 'Held von Valenheim', '50 Missionen erledigt', (p) => p.missions >= 50],
  ['erkunder', '🧭', 'Erkunder', '5 Erkundungen', (p, t) => (t.erkundung || 0) >= 5],
  ['versorger', '📦', 'Versorger', '5 Versorgungsmissionen', (p, t) => (t.versorgung || 0) >= 5],
  ['sanitaeter', '🩺', 'Sanitäter', '5 medizinische Hilfsmissionen', (p, t) => (t.medizin || 0) >= 5],
  ['retter', '🚸', 'Lebensretter', '5 Evakuierungen', (p, t) => (t.evakuierung || 0) >= 5],
  ['verwaltung', '📋', 'Stadtdiener', '5 Verwaltungsaufgaben', (p, t) => (t.verwaltung || 0) >= 5],
  ['team', '👥', 'Teamplayer', '5× Teamwork-Bonus erhalten', (p, t) => (t.teamwork || 0) >= 5],
  ['stammgast', '⏱️', 'Stammgast', '1 Stunde in Valenheim verbracht', (p) => p.playtime_s >= 3600],
  ['level5', '⭐', 'Aufsteiger', 'Level 5 erreicht', (p) => levelFor(p.points) >= 5],
];
export async function fullProfile(p) {
  if (!p) return null; const t = await typeCounts(p.id);
  return {
    ...publicProfile(p), rang: p.banned ? null : await rankOf(p), gesperrt: !!p.banned,
    erfolge: ACHIEVEMENTS.map(([id, icon, titel, text, f]) => ({ id, icon, titel, text, erreicht: !!f(p, t) })),
    letzte: (await completionsOf(p.id, 10)).map((c) => ({ titel: c.mission_id === 'teamwork' ? 'Teamwork-Bonus' : c.titel || c.mission_id, punkte: c.punkte, at: c.at })),
    typen: t,
  };
}

// ---------- Verwaltung ----------
export const adminLog = (aktion, ziel, details) => q('INSERT INTO admin_log (at, aktion, ziel, details) VALUES (?, ?, ?, ?)', [Date.now(), aktion, ziel || null, details ? JSON.stringify(details) : null]);
export const adminLogList = (limit = 50) => q('SELECT * FROM admin_log ORDER BY at DESC LIMIT ?', [limit]);
export async function stats() {
  const day = Date.now() - 86400000; const n = async (sql, p) => Number((await one(sql, p)).n);
  const tag = PGSQL ? "to_char(to_timestamp(at / 1000), 'YYYY-MM-DD')" : "strftime('%Y-%m-%d', at / 1000, 'unixepoch')";
  return {
    buerger: await countPlayers(),
    neu_24h: await n('SELECT COUNT(*) AS n FROM players WHERE created_at > ?', [day]),
    aktiv_24h: await n('SELECT COUNT(*) AS n FROM players WHERE last_seen > ?', [day]),
    gesperrt: await n('SELECT COUNT(*) AS n FROM players WHERE banned = 1'),
    missionen_gesamt: await n("SELECT COUNT(*) AS n FROM completions WHERE mission_id <> 'teamwork'"),
    missionen_24h: await n("SELECT COUNT(*) AS n FROM completions WHERE mission_id <> 'teamwork' AND at > ?", [day]),
    punkte_gesamt: await n('SELECT COALESCE(SUM(points),0) AS n FROM players'),
    spielzeit_h: Math.round((await n('SELECT COALESCE(SUM(playtime_s),0) AS n FROM players')) / 360) / 10,
    beliebt: (await q("SELECT c.mission_id AS id, MAX(m.titel) AS titel, COUNT(*) AS n FROM completions c LEFT JOIN missions m ON m.id = c.mission_id WHERE c.mission_id <> 'teamwork' GROUP BY c.mission_id ORDER BY 3 DESC LIMIT 5")).map((r) => ({ ...r, n: Number(r.n) })),
    pro_tag: (await q(`SELECT ${tag} AS tag, COUNT(*) AS n FROM completions WHERE at > ? GROUP BY ${tag} ORDER BY 1`, [Date.now() - 14 * 86400000])).map((r) => ({ ...r, n: Number(r.n) })),
  };
}
export async function searchPlayers(qs = '', limit = 50, offset = 0) {
  const like = `%${qs.toLowerCase()}%`;
  return {
    gesamt: Number((await one('SELECT COUNT(*) AS n FROM players WHERE name_lc LIKE ?', [like])).n),
    liste: (await q('SELECT id, name, points, missions, playtime_s, banned, created_at, last_seen FROM players WHERE name_lc LIKE ? ORDER BY points DESC LIMIT ? OFFSET ?', [like, limit, offset]))
      .map((p) => ({ ...p, level: levelFor(p.points), banned: !!p.banned })),
  };
}
export async function adjustPoints(id, delta) {
  await q(`UPDATE players SET points = ${PGSQL ? 'GREATEST' : 'MAX'}(0, points + ?) WHERE id = ?`, [delta, id]); return findById(id);
}
export async function setBanned(id, banned) { await q('UPDATE players SET banned = ? WHERE id = ?', [banned ? 1 : 0, id]); return findById(id); }
export async function saveMission(m) {
  await q(`INSERT INTO missions (id, typ, titel, beschreibung, punkte, aktiv, params, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET typ = excluded.typ, titel = excluded.titel, beschreibung = excluded.beschreibung, punkte = excluded.punkte, aktiv = excluded.aktiv, params = excluded.params`,
  [m.id, m.typ, m.titel, m.beschreibung, m.punkte, m.aktiv ? 1 : 0, JSON.stringify(m.params || {}), Date.now()]);
  return getMission(m.id);
}
export const logEvent = (typ, text, dauer) => q('INSERT INTO events (at, typ, text, dauer) VALUES (?, ?, ?, ?)', [Date.now(), typ, text || null, dauer || null]);
export const recentEvents = (limit = 20) => q('SELECT * FROM events ORDER BY at DESC LIMIT ?', [limit]);
