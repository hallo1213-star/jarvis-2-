// Die Valenheim-Karte aus den TikTok-Videos – gebaut mit demselben Code und Startwert wie die Videos.
// Ergänzt für das Spiel: Kollision (Rapier), Gebäude aus dem Serienstand, Spawn am Rathausplatz.
import * as THREE from 'three';
import { buildWorld, P, SLAB, U, BAUPLAETZE, KOLLISION } from './valenheim/world.js';
import { baueRepublik } from './valenheim/republik.js';
import { buildBuilding, buildObjekt } from './valenheim/catalog.js';
import STATUS from '../../../shared/serienstand.json';
import { baueAutohaus } from './autohaus.js';
import m600 from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff2?url';
import m700 from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url';
import m800 from '@fontsource/montserrat/files/montserrat-latin-800-normal.woff2?url';
import m900 from '@fontsource/montserrat/files/montserrat-latin-900-normal.woff2?url';
import o600 from '@fontsource/oxanium/files/oxanium-latin-600-normal.woff2?url';
import o700 from '@fontsource/oxanium/files/oxanium-latin-700-normal.woff2?url';

export const SPAWN = { x: 7, y: SLAB + 1.0, z: 22, h: Math.PI };
export const GRENZE = 1060; // innerhalb der Ringautobahn

async function ladeSchriften() {
  const liste = [['Montserrat', 600, m600], ['Montserrat', 700, m700], ['Montserrat', 800, m800], ['Montserrat', 900, m900], ['Oxanium', 600, o600], ['Oxanium', 700, o700]];
  await Promise.all(liste.map(async ([fam, w, url]) => { try { const f = new FontFace(fam, `url(${url})`, { weight: String(w) }); document.fonts.add(await f.load()); } catch { /* Ersatzschrift */ } }));
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _b = new THREE.Box3(), _c = new THREE.Vector3(), _z = new THREE.Vector3();

export async function baueValenheim(scene, RAPIER, physik, { onFortschritt } = {}) {
  await ladeSchriften(); onFortschritt?.('Stadt wird gebaut …', 0.2);
  KOLLISION.liste.length = 0; KOLLISION.aktiv = true;
  const zusatz = [...new Set([...(STATUS.gebaeude || []).map((b) => b.platz), 'B15'])]; // B15 = Janniks Autohaus
  const world = buildWorld(scene, { seed: STATUS.welt_seed || 7071, licht: 'standard', zusatz, republik: true });
  // Gebäude der Community (wie in den Folgen)
  const sonder = [];
  for (const [i, b] of (STATUS.gebaeude || []).entries()) {
    if (!BAUPLAETZE[b.platz] && !b.platz?.startsWith('B')) continue;
    const ij = BAUPLAETZE[b.platz] || null; if (!ij) continue;
    const grp = buildBuilding(b.typ, { status: b.status || 'fertig', name: b.name, seed: i + 1, fortschritt: b.fortschritt ?? 0.5 });
    grp.position.set(ij[0] * P, SLAB, ij[1] * P); grp.rotation.y = Math.atan2(-ij[0], -ij[1]) + Math.PI; scene.add(grp); sonder.push(grp);
    world.setLotFree(b.platz, false);
  }
  for (const o of STATUS.objekte || []) { const g = buildObjekt(o.typ_obj || o.typ, { name: o.name }); g.position.set(o.pos[0], SLAB, o.pos[1]); g.rotation.y = THREE.MathUtils.degToRad(o.richtung || 0); scene.add(g); sonder.push(g); }
  onFortschritt?.('Republik wird gebaut …', 0.45);
  const rep = baueRepublik(scene, world, U, { villen: [], megaVilla: 'PRÄSIDENTENVILLA' });
  KOLLISION.aktiv = false;
  // Janniks Autohaus (Phase 6) – vor der Kollision bauen, damit Wände automatisch fest sind
  world.setLotFree('B15', false); const autohaus = baueAutohaus(scene, { slab: SLAB });

  // ---------- Kollision ----------
  onFortschritt?.('Kollision wird berechnet …', 0.7);
  physik.createCollider(RAPIER.ColliderDesc.cuboid(2200, 1, 2200).setTranslation(0, -1, 0)); // Boden (Straßen auf y = 0)
  let n = 0;
  const box = (cx, cy, cz, sx, sy, sz, quat) => {
    if (Math.abs(cx) > GRENZE + 60 || Math.abs(cz) > GRENZE + 60 || sx < 0.05 || sz < 0.05 || sy < 0.05) return;
    const d = RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(cx, cy, cz); if (quat) d.setRotation(quat); physik.createCollider(d); n++;
  };
  for (const [x, y0, z, sx, sy, sz, ry] of KOLLISION.liste) box(x, y0 + sy / 2, z, sx, sy, sz, ry ? { x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) } : null);
  // Einzelne Bauteile (Sondergebäude, Säulen, Türme …): orientierte Box je Mesh
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSprite || !o.geometry || o.userData.keineKollision) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material; if (mat?.transparent && mat.opacity < 0.9) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _b.copy(o.geometry.boundingBox); _b.getSize(_s); _b.getCenter(_c);
    o.matrixWorld.decompose(_p, _q, _z); const sx = _s.x * _z.x, sy = _s.y * _z.y, sz = _s.z * _z.z;
    if (Math.max(sx, sy, sz) > 260 || Math.min(sx, sz) < 0.08 || sy < 0.08) return; // Sammel-Meshes / flache Schilder überspringen
    _c.applyMatrix4(o.matrixWorld); box(_c.x, _c.y, _c.z, sx, sy, sz, { x: _q.x, y: _q.y, z: _q.z, w: _q.w });
  });
  onFortschritt?.('Fertig', 1);
  return {
    world, rep, sonder, autohaus, zonen: autohaus.zonen, kollisionen: n,
    update(t, camera) { U.time.value = t; world.update?.(t, camera); rep?.update?.(t); autohaus.update(t); },
  };
}
