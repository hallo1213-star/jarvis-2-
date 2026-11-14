// VALENHEIM 2.0 – Phase 6: Fahrzeuge kaufen, Kennzeichen, Tuning. Preise kommen nur aus dem Katalog des Servers.
import crypto from 'node:crypto';
import * as DB from './db.js';
import * as GELD from './geld.js';
import { KATALOG } from './katalog.js';
import { normalize } from './names.js';

const BAD = ['fick', 'fuck', 'hure', 'nutte', 'nazi', 'hitler', 'nsdap', 'ss', 'sa', 'kkk', 'hj', 'ahh', 'nigg', 'neger', 'isis', 'fotze', 'wichser', 'arsch', 'sex', 'porn'];
const KURZ_VERBOTEN = new Set(['SS', 'SA', 'HJ', 'KZ', 'NS', 'AH', 'HH']);
const zeile = (r) => ({ id: r.id, modell: r.modell, farbe: Number(r.farbe), kennzeichen: r.kennzeichen, tuning: JSON.parse(r.tuning || '{}'), gekauft: Number(r.gekauft) });

export async function liste(pid) { return (await DB.q('SELECT * FROM v2_fahrzeuge WHERE player_id = ? ORDER BY gekauft', [pid])).map(zeile); }
export async function eins(pid, fid) { const r = await DB.one('SELECT * FROM v2_fahrzeuge WHERE id = ? AND player_id = ?', [String(fid || ''), pid]); return r ? zeile(r) : null; }

function zufallsKennzeichen() {
  const Z = 'ABCDEFGHJKLMNPRSTUVWXYZ'; const b = crypto.randomBytes(4);
  let mitte = Z[b[0] % Z.length] + Z[b[1] % Z.length]; if (KURZ_VERBOTEN.has(mitte)) mitte = 'VA';
  return `VH-${mitte} ${100 + (b.readUInt16BE(2) % 9900)}`;
}
// Wunschkennzeichen: VH-XX 1234 (1–2 Buchstaben, 1–4 Ziffern, keine führende 0) – wie in Deutschland
export function pruefeKennzeichen(raw) {
  const k = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const m = /^VH-([A-Z]{1,2}) ([1-9][0-9]{0,3})$/.exec(k); if (!m) return { fehler: 'Format: VH-AB 1234 (1–2 Buchstaben, 1–4 Ziffern).' };
  if (KURZ_VERBOTEN.has(m[1]) || ['88', '18', '1888', '8888', '188', '888'].includes(m[2])) return { fehler: 'Dieses Kennzeichen ist nicht erlaubt.' };
  if (BAD.some((b) => b.length > 2 && normalize(m[1] + m[2]).includes(b))) return { fehler: 'Dieses Kennzeichen ist nicht erlaubt.' };
  return { kennzeichen: k };
}

export async function kaufen(pid, modell, farbe) {
  const M = KATALOG.modelle[modell]; if (!M) return { fehler: 'Dieses Modell gibt es nicht.' };
  const f = Number(farbe); if (!Number.isInteger(f) || f < 0 || f >= KATALOG.farben.length) return { fehler: 'Ungültige Farbe.' };
  const anzahl = Number((await DB.one('SELECT COUNT(*) AS n FROM v2_fahrzeuge WHERE player_id = ?', [pid])).n);
  if (anzahl >= KATALOG.kennzeichen.max_fahrzeuge) return { fehler: `Du hast schon ${anzahl} Fahrzeuge (Maximum).` };
  const stand = await GELD.abbuchen(pid, M.preis, 'kauf', `${M.name} bei Janniks Autohaus`); if (!stand) return { fehler: `Dein Kontostand reicht nicht (${M.preis.toLocaleString('de-DE')} € nötig).` };
  for (let i = 0; i < 8; i++) {
    const fz = { id: crypto.randomBytes(8).toString('base64url'), modell, farbe: f, kennzeichen: zufallsKennzeichen(), tuning: {}, gekauft: Date.now() };
    try { await DB.q('INSERT INTO v2_fahrzeuge (id, player_id, modell, farbe, kennzeichen, tuning, gekauft) VALUES (?, ?, ?, ?, ?, ?, ?)', [fz.id, pid, modell, f, fz.kennzeichen, '{}', fz.gekauft]); return { fahrzeug: fz, konto: stand }; }
    catch (e) { if (!/unique|duplicate/i.test(e.message)) { await GELD.gutschreiben(pid, M.preis, 'erstattung', 'Kauf fehlgeschlagen'); throw e; } }
  }
  await GELD.gutschreiben(pid, M.preis, 'erstattung', 'Kauf fehlgeschlagen'); return { fehler: 'Bitte nochmal versuchen.' };
}

export async function kennzeichenAendern(pid, fid, wunsch) {
  const fz = await eins(pid, fid); if (!fz) return { fehler: 'Fahrzeug nicht gefunden.' };
  const p = pruefeKennzeichen(wunsch); if (p.fehler) return p; if (p.kennzeichen === fz.kennzeichen) return { fehler: 'Das ist schon dein Kennzeichen.' };
  if (await DB.one('SELECT id FROM v2_fahrzeuge WHERE kennzeichen = ?', [p.kennzeichen])) return { fehler: 'Dieses Kennzeichen ist schon vergeben.' };
  const stand = await GELD.abbuchen(pid, KATALOG.kennzeichen.preis, 'kennzeichen', `Wunschkennzeichen ${p.kennzeichen}`); if (!stand) return { fehler: 'Dein Kontostand reicht nicht.' };
  try { await DB.q('UPDATE v2_fahrzeuge SET kennzeichen = ? WHERE id = ? AND player_id = ?', [p.kennzeichen, fz.id, pid]); }
  catch { await GELD.gutschreiben(pid, KATALOG.kennzeichen.preis, 'erstattung', 'Kennzeichen vergeben'); return { fehler: 'Dieses Kennzeichen ist schon vergeben.' }; }
  return { fahrzeug: { ...fz, kennzeichen: p.kennzeichen }, konto: stand };
}

// Tuning: { farbe?, felgen?, tiefer?, motor?, spoiler?, neon?, toenung? } – bezahlt wird nur, was sich ändert
export function tuningPreis(fz, wunsch) {
  const T = KATALOG.tuning; let summe = 0; const neu = { ...fz.tuning }; let farbe = fz.farbe; const posten = [];
  for (const [k, v] of Object.entries(wunsch || {})) {
    if (k === 'farbe') { const f = Number(v); if (!Number.isInteger(f) || f < 0 || f >= KATALOG.farben.length) return { fehler: 'Ungültige Farbe.' }; if (f !== farbe) { farbe = f; summe += T.farbe.preis; posten.push(T.farbe.name); } continue; }
    const t = T[k]; if (!t) continue; const s = Number(v);
    if (!Number.isInteger(s) || s < 0 || s >= t.stufen.length) return { fehler: `Ungültige Stufe für ${t.name}.` };
    if ((neu[k] || 0) !== s) { neu[k] = s; summe += t.preise[s]; posten.push(`${t.name}: ${t.stufen[s]}`); }
  }
  return { summe, neu, farbe, posten };
}
export async function tunen(pid, fid, wunsch) {
  const fz = await eins(pid, fid); if (!fz) return { fehler: 'Fahrzeug nicht gefunden.' };
  const p = tuningPreis(fz, wunsch); if (p.fehler) return p; if (!p.posten.length) return { fehler: 'Nichts geändert.' };
  let stand = await GELD.konto(pid);
  if (p.summe > 0) { stand = await GELD.abbuchen(pid, p.summe, 'tuning', `Tuning ${KATALOG.modelle[fz.modell]?.name}`); if (!stand) return { fehler: `Dein Kontostand reicht nicht (${p.summe.toLocaleString('de-DE')} € nötig).` }; }
  await DB.q('UPDATE v2_fahrzeuge SET tuning = ?, farbe = ? WHERE id = ? AND player_id = ?', [JSON.stringify(p.neu), p.farbe, fz.id, pid]);
  return { fahrzeug: { ...fz, tuning: p.neu, farbe: p.farbe }, konto: stand, summe: p.summe };
}
// Aussehen für andere Spieler (keine Besitz-/Kaufdaten)
export const aussehen = (fz) => ({ id: fz.id, modell: fz.modell, farbe: fz.farbe, kennzeichen: fz.kennzeichen, tuning: fz.tuning });
