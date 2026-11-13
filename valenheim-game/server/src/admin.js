// Bürgermeister-Zugang: Passwort (scrypt-Hash) + kurzlebige Sitzungen. Alles serverseitig geprüft.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const FILE = process.env.ADMIN_FILE || path.resolve('data', 'admin.json');
const SESSION_MS = 12 * 3600_000;
const sessions = new Map(); // Hash des Sitzungs-Tokens -> Ablaufzeit

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16); const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return ['scrypt', salt.toString('base64'), key.toString('base64')].join('$');
}
function storedHash() {
  if (process.env.ADMIN_PASSWORD_HASH) return process.env.ADMIN_PASSWORD_HASH;
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')).hash; } catch { return null; }
}
export const adminConfigured = () => !!storedHash();

export function verifyPassword(pw) {
  const h = storedHash(); if (!h || typeof pw !== 'string' || pw.length > 200) return false;
  const [kind, salt, key] = h.split('$'); if (kind !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(want, got);
}
const hashT = (t) => crypto.createHash('sha256').update(t).digest('hex');
export function createSession() { const t = crypto.randomBytes(32).toString('base64url'); sessions.set(hashT(t), Date.now() + SESSION_MS); return t; }
export function checkSession(t) {
  if (!t) return false; const k = hashT(t); const exp = sessions.get(k);
  if (!exp) return false; if (Date.now() > exp) { sessions.delete(k); return false; } return true;
}
export function endSession(t) { if (t) sessions.delete(hashT(t)); }
export function writeAdminFile(pw) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ hash: hashPassword(pw) }, null, 2), { mode: 0o600 });
  return FILE;
}
