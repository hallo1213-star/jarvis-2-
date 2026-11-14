// Datenspeicher VALENHEIM 2.0
// - Online: Postgres (Supabase) über DATABASE_URL – nur eigene Tabellen mit Präfix v2_ (das alte Spiel bleibt unberührt)
// - Lokal: SQLite-Datei   - Tests: PGlite (echte Postgres-Engine im Speicher, DB_PGLITE=1)
import fs from 'node:fs';
import path from 'node:path';

let q, close = async () => {};
const PG = !!process.env.DATABASE_URL;
if (PG) {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, (v) => Number(v));
  // Robust lesen: Leerzeichen/Anführungszeichen weg, Passwort darf Sonderzeichen enthalten (Trennung am letzten '@')
  const raw = process.env.DATABASE_URL.trim().replace(/^['"]|['"]$/g, '').trim();
  const m = /^postgres(?:ql)?:\/\/([^:/@]+):(.*)@([^@/:]+)(?::(\d+))?\/([^?\s]+)/s.exec(raw);
  if (!m) { console.error('DATABASE_URL hat ein unbekanntes Format (erwartet: postgresql://BENUTZER:PASSWORT@HOST:5432/postgres).'); process.exit(1); }
  const [, user, password, host, port, database] = m;
  const pool = new pg.Pool({ user, password, host, port: Number(port || 5432), database, max: 5, ssl: process.env.DATABASE_SSL === 'aus' ? false : { rejectUnauthorized: false } });
  q = async (sql, params = []) => { let i = 0; return (await pool.query(sql.replace(/\?/g, () => `$${++i}`), params)).rows; };
  close = () => pool.end();
} else if (process.env.DB_PGLITE) {
  const { PGlite } = await import('@electric-sql/pglite'); const db = new PGlite();
  q = async (sql, params = []) => { let i = 0; return (await db.query(sql.replace(/\?/g, () => `$${++i}`), params)).rows; };
  close = () => db.close();
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const file = process.env.DB_PATH || path.resolve('data', 'valenheim-v2.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file); db.exec('PRAGMA journal_mode = WAL;');
  q = async (sql, params = []) => { const st = db.prepare(sql); return /^\s*(select|with)/i.test(sql) || /returning/i.test(sql) ? st.all(...params).map((r) => ({ ...r })) : (st.run(...params), []); };
  close = async () => db.close();
}
export const backend = PG ? 'postgres' : process.env.DB_PGLITE ? 'pglite' : 'sqlite';
export { q, close };
export const one = async (sql, p) => (await q(sql, p))[0];

// ---------- Schema (Version 1) ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS v2_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS v2_players (
     id TEXT PRIMARY KEY, username TEXT NOT NULL, username_lc TEXT NOT NULL UNIQUE,
     pass_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL,
     created_at BIGINT NOT NULL, last_seen BIGINT NOT NULL, banned INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'buerger')`,
  `CREATE TABLE IF NOT EXISTS v2_sessions (
     token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, geraet TEXT)`,
  'CREATE INDEX IF NOT EXISTS v2_idx_sessions_player ON v2_sessions(player_id)',
  `CREATE TABLE IF NOT EXISTS v2_saves (
     player_id TEXT PRIMARY KEY, pos TEXT NOT NULL DEFAULT '{}', settings TEXT NOT NULL DEFAULT '{}', updated_at BIGINT NOT NULL)`,
];
for (const s of SCHEMA) await q(s);
if (!(await one("SELECT value FROM v2_meta WHERE key = 'schema'"))) await q("INSERT INTO v2_meta (key, value) VALUES ('schema', '1')");
// ---------- Migrationen (nur hinzufügen, nie etwas löschen) ----------
const MIGRATIONEN = {
  2: ["ALTER TABLE v2_saves ADD COLUMN charakter TEXT NOT NULL DEFAULT '{}'"],
};
let version = Number((await one("SELECT value FROM v2_meta WHERE key = 'schema'")).value);
for (const [v, befehle] of Object.entries(MIGRATIONEN)) {
  if (Number(v) <= version) continue;
  for (const b of befehle) { try { await q(b); } catch (e) { if (!/duplicate|exists/i.test(e.message)) throw e; } }
  await q("UPDATE v2_meta SET value = ? WHERE key = 'schema'", [String(v)]); version = Number(v);
}
export const schemaVersion = () => version;
