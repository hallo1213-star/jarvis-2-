// Spielstände: Position + Einstellungen. Alle Werte werden vom Server geprüft.
import { q, one } from './db.js';

export const DEFAULT_POS = { x: 0, y: 1.2, z: 8, h: Math.PI, welt: 'test' };
export const SETTINGS = {
  grafik: (v) => ['auto', 'niedrig', 'mittel', 'hoch'].includes(v) ? v : undefined,
  kamera: (v) => ['verfolger', 'ego'].includes(v) ? v : undefined,
  ton: (v) => typeof v === 'boolean' ? v : undefined,
  empfindlichkeit: (v) => Number.isFinite(+v) ? Math.min(3, Math.max(0.2, +v)) : undefined,
  yInvertiert: (v) => typeof v === 'boolean' ? v : undefined,
};
export function cleanSettings(input, base = {}) {
  const out = { ...base };
  if (input && typeof input === 'object') for (const [k, f] of Object.entries(SETTINGS)) if (k in input) { const v = f(input[k]); if (v !== undefined) out[k] = v; }
  return out;
}
export async function getSave(playerId) {
  const s = await one('SELECT * FROM v2_saves WHERE player_id = ?', [playerId]);
  const pos = s ? JSON.parse(s.pos || '{}') : {}; const settings = s ? JSON.parse(s.settings || '{}') : {};
  return { pos: Number.isFinite(pos.x) ? pos : { ...DEFAULT_POS }, settings: cleanSettings(settings, { grafik: 'auto', kamera: 'verfolger', ton: true, empfindlichkeit: 1, yInvertiert: false }), updated: s?.updated_at || 0 };
}
export async function saveSettings(playerId, input) {
  const cur = await getSave(playerId); const settings = cleanSettings(input, cur.settings);
  await q('UPDATE v2_saves SET settings = ?, updated_at = ? WHERE player_id = ?', [JSON.stringify(settings), Date.now(), playerId]);
  return settings;
}
export async function savePos(playerId, pos) {
  const p = { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), h: +pos.h.toFixed(3), welt: pos.welt || 'test' };
  await q('UPDATE v2_saves SET pos = ?, updated_at = ? WHERE player_id = ?', [JSON.stringify(p), Date.now(), playerId]);
}
