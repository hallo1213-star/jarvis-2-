// VALENHEIM 2.0 – Phase 5: Bargeld + Bankkonto. Jede Änderung ist eine atomare Datenbank-Anweisung mit Prüfung
// (kein Minus möglich) und wird als Buchung protokolliert.
import crypto from 'node:crypto';
import * as DB from './db.js';
import { KATALOG } from './katalog.js';

const id = () => crypto.randomBytes(9).toString('base64url');
const ganz = (b) => { const n = Math.floor(Number(b)); return Number.isFinite(n) && n > 0 && n <= 100_000_000 ? n : null; };

export async function konto(pid) {
  let k = await DB.one('SELECT bargeld, bank FROM v2_konten WHERE player_id = ?', [pid]);
  if (!k) {
    const S = KATALOG.start;
    await DB.q('INSERT INTO v2_konten (player_id, bargeld, bank, gehalt_min) VALUES (?, ?, ?, 0) ON CONFLICT (player_id) DO NOTHING', [pid, S.bargeld, S.bank]);
    k = await DB.one('SELECT bargeld, bank FROM v2_konten WHERE player_id = ?', [pid]);
    await protokoll(pid, 'start', S.bank, 'Startguthaben – Willkommen in Valenheim');
  }
  return { bargeld: Number(k.bargeld), bank: Number(k.bank) };
}
async function protokoll(pid, art, betrag, text) { await DB.q('INSERT INTO v2_buchungen (id, player_id, art, betrag, text, zeit) VALUES (?, ?, ?, ?, ?, ?)', [id(), pid, art, betrag, String(text).slice(0, 80), Date.now() - (art === 'start' ? 1000 : 0)]); }
export async function verlauf(pid, n = 30) { return (await DB.q('SELECT art, betrag, text, zeit FROM v2_buchungen WHERE player_id = ? ORDER BY zeit DESC LIMIT ?', [pid, n])).map((r) => ({ ...r, betrag: Number(r.betrag), zeit: Number(r.zeit) })); }

// Betrag vom Bankkonto abbuchen (nur wenn gedeckt). Gibt neuen Stand oder null zurück.
export async function abbuchen(pid, betrag, art, text, feld = 'bank') {
  await konto(pid); const f = feld === 'bargeld' ? 'bargeld' : 'bank';
  const r = (await DB.q(`UPDATE v2_konten SET ${f} = ${f} - ? WHERE player_id = ? AND ${f} >= ? RETURNING bargeld, bank`, [betrag, pid, betrag]))[0];
  if (!r) return null; await protokoll(pid, art, -betrag, text); return { bargeld: Number(r.bargeld), bank: Number(r.bank) };
}
export async function gutschreiben(pid, betrag, art, text, feld = 'bank') {
  await konto(pid); const f = feld === 'bargeld' ? 'bargeld' : 'bank';
  const r = (await DB.q(`UPDATE v2_konten SET ${f} = ${f} + ? WHERE player_id = ? RETURNING bargeld, bank`, [betrag, pid]))[0];
  await protokoll(pid, art, betrag, text); return { bargeld: Number(r.bargeld), bank: Number(r.bank) };
}

export async function einzahlen(pid, b) {
  const n = ganz(b); if (!n) return { fehler: 'Ungültiger Betrag.' }; await konto(pid);
  const r = (await DB.q('UPDATE v2_konten SET bargeld = bargeld - ?, bank = bank + ? WHERE player_id = ? AND bargeld >= ? RETURNING bargeld, bank', [n, n, pid, n]))[0];
  if (!r) return { fehler: 'So viel Bargeld hast du nicht.' }; await protokoll(pid, 'einzahlung', n, 'Bargeld eingezahlt'); return { bargeld: Number(r.bargeld), bank: Number(r.bank) };
}
export async function abheben(pid, b) {
  const n = ganz(b); if (!n) return { fehler: 'Ungültiger Betrag.' }; await konto(pid);
  const r = (await DB.q('UPDATE v2_konten SET bargeld = bargeld + ?, bank = bank - ? WHERE player_id = ? AND bank >= ? RETURNING bargeld, bank', [n, n, pid, n]))[0];
  if (!r) return { fehler: 'Dein Kontostand reicht nicht.' }; await protokoll(pid, 'abhebung', -n, 'Bargeld abgehoben'); return { bargeld: Number(r.bargeld), bank: Number(r.bank) };
}
export async function ueberweisen(pid, vonName, anName, b, text) {
  const n = ganz(b); if (!n) return { fehler: 'Ungültiger Betrag.' };
  if (n > 1_000_000) return { fehler: 'Höchstens 1.000.000 € pro Überweisung.' };
  const ziel = await DB.one('SELECT id, username FROM v2_players WHERE username_lc = ?', [String(anName || '').trim().toLowerCase()]);
  if (!ziel) return { fehler: 'Diesen Spieler gibt es nicht.' }; if (ziel.id === pid) return { fehler: 'Du kannst dir nicht selbst Geld schicken.' };
  const zweck = String(text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
  const stand = await abbuchen(pid, n, 'ueberweisung', `An ${ziel.username}${zweck ? ': ' + zweck : ''}`); if (!stand) return { fehler: 'Dein Kontostand reicht nicht.' };
  await gutschreiben(ziel.id, n, 'ueberweisung', `Von ${vonName}${zweck ? ': ' + zweck : ''}`);
  return { ...stand, an: ziel.username, zielId: ziel.id, betrag: n };
}
// Gehalt: alle X Minuten Spielzeit (online) – Zähler liegt in der DB, damit es über Neustarts korrekt bleibt
export async function gehaltTick(pid) {
  const G = KATALOG.gehalt; await konto(pid);
  const r = (await DB.q('UPDATE v2_konten SET gehalt_min = gehalt_min + 1 WHERE player_id = ? RETURNING gehalt_min', [pid]))[0];
  if (r && Number(r.gehalt_min) % G.minuten === 0) return gutschreiben(pid, G.betrag, 'gehalt', G.text);
  return null;
}
