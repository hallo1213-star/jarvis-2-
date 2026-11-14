// VALENHEIM 2.0 – Phase 8: Beruf Lieferfahrer. Ziel, Lohn und Zeit bestimmt der Server; abgerechnet wird nur,
// wenn der Server den Spieler wirklich am Ziel sieht und die Fahrt nicht unmöglich schnell war.
import crypto from 'node:crypto';
import { KATALOG } from './katalog.js';
import { firmaPos, zufallsAdresse, adresseName } from '../../shared/jobs.js';
import * as GELD from './geld.js';

const J = KATALOG.jobs; const rnd = () => crypto.randomInt(0, 1_000_000) / 1_000_000;
export const START_RADIUS = 6, ZIEL_RADIUS = 8;

export function starten(c, firma) {
  const F = J.firmen[firma]; if (!F) return { fehler: 'Diese Firma gibt es nicht.' };
  const fp = firmaPos(J, firma);
  if (Math.hypot(c.pos.x - fp.x, c.pos.z - fp.z) > START_RADIUS + 6) return { fehler: `Geh zuerst zu ${F.name}.` };
  if (c.job) return { fehler: 'Du hast schon eine Lieferung.' };
  if (c.jobPauseBis && Date.now() < c.jobPauseBis) return { fehler: 'Gleich gibt es die nächste Bestellung.' };
  let ziel, d;
  for (let i = 0; i < 40; i++) { ziel = zufallsAdresse(J, rnd); d = Math.hypot(ziel.x - fp.x, ziel.z - fp.z); if (d > 150 && d < 700) break; }
  const lohn = Math.round(J.basis + d * J.pro_meter);
  c.job = { firma, name: F.name, ware: F.ware, ziel: { x: ziel.x, z: ziel.z }, adresse: adresseName(ziel), d: Math.round(d), lohn, start: Date.now(), frist: Math.round(30 + d / 6) };
  return { job: c.job };
}
export async function liefern(c) {
  const j = c.job; if (!j) return { fehler: 'Du hast keine Lieferung.' };
  if (Math.hypot(c.pos.x - j.ziel.x, c.pos.z - j.ziel.z) > ZIEL_RADIUS) return { fehler: 'Du bist noch nicht an der Adresse.' };
  const s = (Date.now() - j.start) / 1000;
  if (s < j.d / J.min_tempo) { c.job = null; return { fehler: 'Diese Lieferung war unmöglich schnell – abgebrochen.' }; }
  const bonus = s <= j.frist ? Math.round(j.lohn * J.bonus_prozent / 100) : 0;
  c.job = null; c.jobPauseBis = Date.now() + J.pause_s * 1000;
  const konto = await GELD.gutschreiben(c.id, j.lohn + bonus, 'lohn', `${j.name}: Lieferung ${j.adresse}${bonus ? ' (+ Trinkgeld)' : ''}`, 'bargeld');
  c.lieferungen = (c.lieferungen || 0) + 1;
  return { lohn: j.lohn, bonus, konto, sekunden: Math.round(s) };
}
export function abbrechen(c) { c.job = null; return { ok: true }; }
