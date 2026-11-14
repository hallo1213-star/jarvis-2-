// Konten: Benutzername + Passwort (scrypt), Wiederherstellungscode, Sitzungen (in der Datenbank → überleben Neustarts)
import crypto from 'node:crypto';
import { q, one } from './db.js';
import { checkName } from './names.js';

const SESSION_MS = 30 * 24 * 3600_000; // 30 Tage
const SCRYPT = { N: 16384, r: 8, p: 1 };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function hashSecret(secret) {
  const salt = crypto.randomBytes(16); const key = crypto.scryptSync(secret, salt, 64, SCRYPT);
  return ['scrypt', salt.toString('base64'), key.toString('base64')].join('$');
}
export function verifySecret(secret, stored) {
  if (typeof secret !== 'string' || secret.length > 200 || !stored) return false;
  const [kind, salt, key] = stored.split('$'); if (kind !== 'scrypt') return false;
  const want = Buffer.from(key, 'base64'); const got = crypto.scryptSync(secret, Buffer.from(salt, 'base64'), want.length, SCRYPT);
  return crypto.timingSafeEqual(want, got);
}
// Wiederherstellungscode: 4×4 Zeichen ohne Verwechslungsgefahr (kein 0/O, 1/I/L)
export function newRecoveryCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; const b = crypto.randomBytes(16);
  return Array.from({ length: 4 }, (_, g) => Array.from({ length: 4 }, (_, i) => A[b[g * 4 + i] % A.length]).join('')).join('-');
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  if (pw.length > 100) return 'Das Passwort ist zu lang.';
  return null;
}

export const publicProfile = (p) => p && ({ id: p.id, name: p.username, rolle: p.role, seit: p.created_at });

async function createSession(playerId, geraet) {
  const token = crypto.randomBytes(32).toString('base64url'); const now = Date.now();
  await q('INSERT INTO v2_sessions (token_hash, player_id, created_at, expires_at, geraet) VALUES (?, ?, ?, ?, ?)', [sha(token), playerId, now, now + SESSION_MS, String(geraet || '').slice(0, 120)]);
  return token;
}

export async function register(username, password, geraet) {
  const name = String(username || '').trim();
  const e1 = checkName(name); if (e1) return { fehler: e1 };
  const e2 = checkPassword(password); if (e2) return { fehler: e2 };
  if (await one('SELECT id FROM v2_players WHERE username_lc = ?', [name.toLowerCase()])) return { fehler: 'Dieser Name ist schon vergeben.', status: 409 };
  const id = crypto.randomUUID(); const code = newRecoveryCode(); const now = Date.now();
  try {
    await q('INSERT INTO v2_players (id, username, username_lc, pass_hash, recovery_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, name.toLowerCase(), hashSecret(password), hashSecret(normCode(code)), now, now]);
  } catch (e) { if (/unique|duplicate/i.test(String(e.message))) return { fehler: 'Dieser Name ist schon vergeben.', status: 409 }; throw e; }
  await q('INSERT INTO v2_saves (player_id, pos, settings, updated_at) VALUES (?, ?, ?, ?)', [id, '{}', '{}', now]);
  const token = await createSession(id, geraet);
  return { token, wiederherstellungscode: code, profil: publicProfile(await one('SELECT * FROM v2_players WHERE id = ?', [id])) };
}

export async function login(username, password, geraet) {
  const p = await one('SELECT * FROM v2_players WHERE username_lc = ?', [String(username || '').trim().toLowerCase()]);
  // gleiche Rechenzeit, auch wenn es den Namen nicht gibt
  const ok = verifySecret(String(password || ''), p?.pass_hash || 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
  if (!p || !ok) return { fehler: 'Name oder Passwort falsch.', status: 401 };
  if (p.banned) return { fehler: 'Dieses Konto ist gesperrt.', status: 403 };
  return { token: await createSession(p.id, geraet), profil: publicProfile(p) };
}

export async function recover(username, code, newPassword, geraet) {
  const e = checkPassword(newPassword); if (e) return { fehler: e };
  const p = await one('SELECT * FROM v2_players WHERE username_lc = ?', [String(username || '').trim().toLowerCase()]);
  if (!p || !verifySecret(normCode(code), p.recovery_hash)) return { fehler: 'Name oder Wiederherstellungscode falsch.', status: 401 };
  const neu = newRecoveryCode();
  await q('UPDATE v2_players SET pass_hash = ?, recovery_hash = ? WHERE id = ?', [hashSecret(newPassword), hashSecret(normCode(neu)), p.id]);
  await q('DELETE FROM v2_sessions WHERE player_id = ?', [p.id]); // alle alten Anmeldungen beenden
  return { token: await createSession(p.id, geraet), wiederherstellungscode: neu, profil: publicProfile(p) };
}

export async function playerFromToken(token) {
  if (!token || token.length > 100) return null;
  const s = await one('SELECT * FROM v2_sessions WHERE token_hash = ?', [sha(token)]);
  if (!s || s.expires_at < Date.now()) return null;
  const p = await one('SELECT * FROM v2_players WHERE id = ?', [s.player_id]);
  return p && !p.banned ? p : null;
}
export async function logout(token) { if (token) await q('DELETE FROM v2_sessions WHERE token_hash = ?', [sha(token)]); }
export async function cleanupSessions() { await q('DELETE FROM v2_sessions WHERE expires_at < ?', [Date.now()]); }
