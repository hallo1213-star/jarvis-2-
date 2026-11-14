// VALENHEIM 2.0 – Phase 4: Server-Räume (öffentlich + privat), je max. 12 Spieler, Chat mit Filter
import crypto from 'node:crypto';
import { normalize } from './names.js';

export const MAX_SPIELER = 12;
const MAX_OEFFENTLICH = 20, MAX_PRIVAT = 200;
const raeume = new Map(); // id -> { id, name, privat, code, besitzer, spieler: Map(id -> c), leerSeit }

function neuerRaum({ name, privat = false, besitzer = null }) {
  const id = privat ? 'p-' + crypto.randomBytes(4).toString('hex') : 'v' + (oeffentliche().length + 1);
  const code = privat ? codeErzeugen() : null;
  const r = { id, name, privat, code, besitzer, spieler: new Map(), leerSeit: Date.now(), erstellt: Date.now() };
  raeume.set(id, r); return r;
}
function codeErzeugen() {
  const Z = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c;
  do { c = Array.from(crypto.randomBytes(6), (b) => Z[b % Z.length]).join(''); } while ([...raeume.values()].some((r) => r.code === c));
  return c;
}
const oeffentliche = () => [...raeume.values()].filter((r) => !r.privat);
// Mindestens ein öffentlicher Server existiert immer
neuerRaum({ name: 'Valenheim 1' });

export function liste() {
  return oeffentliche().map((r) => ({ id: r.id, name: r.name, spieler: r.spieler.size, max: MAX_SPIELER }));
}

export function privatErstellen(besitzerId, name) {
  const eigene = [...raeume.values()].filter((r) => r.privat && r.besitzer === besitzerId);
  if (eigene.length) return { raum: eigene[0], vorhanden: true }; // pro Spieler ein privater Server
  if ([...raeume.values()].filter((r) => r.privat).length >= MAX_PRIVAT) return { fehler: 'Gerade sind zu viele private Server offen. Versuch es später.' };
  let n = String(name || '').replace(/[^\p{L}\p{N} _.\-!']/gu, '').trim().slice(0, 24);
  if (!n || BAD.some((b) => normalize(n).includes(b))) n = 'Privater Server';
  return { raum: neuerRaum({ name: n, privat: true, besitzer: besitzerId }) };
}

// Raum finden: { raum: 'v2' } | { code: 'ABC123' } | {} (= automatisch)
export function finde(wunsch = {}) {
  if (wunsch.code) {
    const code = String(wunsch.code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = [...raeume.values()].find((x) => x.code === code);
    if (!r) return { fehler: 'Kein privater Server mit diesem Code.' };
    if (r.spieler.size >= MAX_SPIELER) return { fehler: 'Dieser Server ist voll (12/12).' };
    return { raum: r };
  }
  if (wunsch.raum) {
    const r = raeume.get(String(wunsch.raum));
    if (r && !r.privat) { if (r.spieler.size >= MAX_SPIELER) return { fehler: `${r.name} ist voll (12/12).` }; return { raum: r }; }
  }
  // automatisch: vollster Server mit freiem Platz (damit man andere trifft), sonst neuer
  const frei = oeffentliche().filter((r) => r.spieler.size < MAX_SPIELER).sort((a, b) => b.spieler.size - a.spieler.size);
  if (frei.length) return { raum: frei[0] };
  if (oeffentliche().length >= MAX_OEFFENTLICH) return { fehler: 'Alle Server sind voll. Bitte versuch es gleich nochmal.' };
  return { raum: neuerRaum({ name: `Valenheim ${oeffentliche().length + 1}` }) };
}

export function betreten(r, c) { r.spieler.set(c.id, c); c.raum = r; r.leerSeit = null; }
export function verlassen(c) { const r = c.raum; if (!r) return; if (r.spieler.get(c.id) === c) r.spieler.delete(c.id); if (!r.spieler.size) r.leerSeit = Date.now(); c.raum = null; }

export function anAlle(r, msg, ausser) { const s = JSON.stringify(msg); for (const c of r.spieler.values()) if (c !== ausser && c.ws.readyState === 1) c.ws.send(s); }

// Aufräumen: leere private Server nach 10 Min, überzählige leere öffentliche nach 2 Min (Valenheim 1 bleibt)
export function aufraeumen(now = Date.now()) {
  for (const r of raeume.values()) {
    if (r.spieler.size || r.leerSeit === null) continue;
    if (r.privat ? now - r.leerSeit > 10 * 60_000 : r.id !== 'v1' && now - r.leerSeit > 2 * 60_000) raeume.delete(r.id);
  }
}

// ---------- Chat ----------
const BAD = ['fick', 'fuck', 'hure', 'nutte', 'wichser', 'fotze', 'schlampe', 'hurensohn', 'bastard', 'nazi', 'hitler',
  'siegheil', 'nigg', 'neger', 'kanake', 'spast', 'schwuchtel', 'missgeburt', 'cunt', 'bitch', 'whore', 'slut', 'vergewalt', 'kys', 'isis'];
export function filtere(text) {
  let t = String(text || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!t) return '';
  // Wort für Wort prüfen (mit Leetspeak-Normalisierung)
  t = t.split(' ').map((w) => (BAD.some((b) => normalize(w).includes(b)) ? '*'.repeat(Math.min(8, w.length)) : w)).join(' ');
  // Links blockieren (Schutz vor Werbung/Betrug)
  t = t.replace(/\b(https?:\/\/|www\.)\S+/gi, '[Link entfernt]');
  return t;
}
// Spamschutz: max. 1 Nachricht / 1,2 s und 6 Nachrichten / 15 s; gleiche Nachricht nicht 3× hintereinander
export function darfChatten(c, text, now = Date.now()) {
  const s = c.chat || (c.chat = { zeiten: [], letzte: '', gleich: 0, stummBis: 0 });
  if (now < s.stummBis) return `Bitte warte ${Math.ceil((s.stummBis - now) / 1000)} s.`;
  s.zeiten = s.zeiten.filter((z) => now - z < 15_000);
  if (s.zeiten.length && now - s.zeiten[s.zeiten.length - 1] < 1200) return 'Nicht so schnell.';
  if (s.zeiten.length >= 6) { s.stummBis = now + 20_000; return 'Zu viele Nachrichten – 20 s Pause.'; }
  s.gleich = text === s.letzte ? s.gleich + 1 : 0; if (s.gleich >= 2) return 'Bitte nicht dieselbe Nachricht wiederholen.';
  s.letzte = text; s.zeiten.push(now); return null;
}
