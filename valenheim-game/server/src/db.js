// Datenspeicher von Valenheim – The City Challenge.
// Lokal / Phase 1: SQLite-Datei (node:sqlite, in Node 22 eingebaut).
// Später (Veröffentlichung): gleiche Funktionen gegen Supabase/Postgres – siehe README.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DB_PATH = process.env.DB_PATH || path.resolve('data', 'valenheim.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS players (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    name_lc      TEXT NOT NULL UNIQUE,
    token_hash   TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    last_seen    INTEGER NOT NULL,
    points       INTEGER NOT NULL DEFAULT 0,
    missions     INTEGER NOT NULL DEFAULT 0,
    playtime_s   INTEGER NOT NULL DEFAULT 0,
    banned       INTEGER NOT NULL DEFAULT 0,
    role         TEXT NOT NULL DEFAULT 'citizen',
    look         TEXT NOT NULL DEFAULT '{}'
  );
`);

export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Level-Kurve: Level n braucht 250 * n * (n-1) / 2 Punkte  (L2 = 250, L3 = 750, L4 = 1500 …)
export function levelFor(points) {
  let l = 1; while (points >= 125 * (l + 1) * l) l++; return l;
}

export function publicProfile(p) {
  if (!p) return null;
  return {
    id: p.id, name: p.name, points: p.points, level: levelFor(p.points), missions: p.missions,
    playtime_s: p.playtime_s, created_at: p.created_at, role: p.role, look: JSON.parse(p.look || '{}'),
  };
}

const q = {
  byNameLc: db.prepare('SELECT * FROM players WHERE name_lc = ?'),
  byToken: db.prepare('SELECT * FROM players WHERE token_hash = ?'),
  byId: db.prepare('SELECT * FROM players WHERE id = ?'),
  insert: db.prepare(`INSERT INTO players (id, name, name_lc, token_hash, created_at, last_seen, look)
                      VALUES (?, ?, ?, ?, ?, ?, ?)`),
  seen: db.prepare('UPDATE players SET last_seen = ? WHERE id = ?'),
  addPlaytime: db.prepare('UPDATE players SET playtime_s = playtime_s + ? WHERE id = ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM players'),
};

export function findByName(name) { return q.byNameLc.get(name.toLowerCase()); }
export function findByToken(token) { return token ? q.byToken.get(hashToken(token)) : null; }
export function findById(id) { return q.byId.get(id); }
export function countPlayers() { return q.count.get().n; }

export function createPlayer(name, look) {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  q.insert.run(id, name, name.toLowerCase(), hashToken(token), now, now, JSON.stringify(look || {}));
  return { token, player: findById(id) };
}

export function touch(id) { q.seen.run(Date.now(), id); }
export function addPlaytime(id, seconds) { if (seconds > 0) q.addPlaytime.run(Math.round(seconds), id); }

export default db;
