// Tag-Nacht-Wechsel für die Video-Stadt: mischt die Lichtstimmungen aus den Folgen (Morgen, Mittag, Abend, Nacht).
// Ein Valenheim-Tag dauert 40 echte Minuten und ist für alle Spieler gleich (an die Uhrzeit gekoppelt).
import * as THREE from 'three';
import { LICHT, U } from '../welt/valenheim/world.js';

export const TAG_SEKUNDEN = 40 * 60;
export const uhrzeit = (now = Date.now()) => (((now / 1000) % TAG_SEKUNDEN) / TAG_SEKUNDEN) * 24;

// Stützpunkte (Stunde → Lichtstimmung)
const PLAN = [[0, 'nacht'], [5, 'nacht'], [6.5, 'morgen'], [9, 'mittag'], [16.5, 'mittag'], [18.5, 'standard'], [19.6, 'abend'], [21, 'nacht'], [24, 'nacht']];
const C = (h) => new THREE.Color(h); const V = (a) => new THREE.Vector3(...a).normalize();
const PRE = Object.fromEntries(Object.entries(LICHT).map(([k, L]) => [k, { ...L, sunColC: C(L.sunCol), skyTopC: C(L.skyTop), skyHorC: C(L.skyHor), fogC: C(L.fog), hemiC: C(L.hemiSky), dir: V(L.sunDir), nachtwert: L.laternen ? 1 : 0 }]));
PRE.standard.nachtwert = 0; PRE.abend.nachtwert = 0.7; PRE.nacht.nachtwert = 1; PRE.morgen.nachtwert = 0.15;

const tmp = { c1: new THREE.Color(), v: new THREE.Vector3() };
export function lichtstimmung(h) {
  let i = 0; while (i < PLAN.length - 2 && PLAN[i + 1][0] <= h) i++;
  const [h0, a] = PLAN[i], [h1, b] = PLAN[i + 1]; const k = THREE.MathUtils.smoothstep(h, h0, h1);
  return { a: PRE[a], b: PRE[b], k };
}

export class Tageszeit {
  constructor(world, renderer) { this.w = world; this.r = renderer; this.uhr = uhrzeit(); this.manuell = null; }
  update() {
    const h = this.manuell ?? uhrzeit(); this.uhr = h; const { a, b, k } = lichtstimmung(h); const L = (x, y) => x + (y - x) * k;
    U.skyTop.value.copy(a.skyTopC).lerp(b.skyTopC, k); U.skyHor.value.copy(a.skyHorC).lerp(b.skyHorC, k);
    U.sunCol.value.copy(a.sunColC).lerp(b.sunColC, k); U.sunDir.value.copy(a.dir).lerp(b.dir, k).normalize(); U.litThr.value = L(a.lit, b.lit);
    const w = this.w; w.sun.color.copy(U.sunCol.value); w.sun.intensity = L(a.sunI, b.sunI); w.hemi.intensity = L(a.hemiI, b.hemiI); w.hemi.color.copy(a.hemiC).lerp(b.hemiC, k);
    w.fogFarbe?.copy(a.fogC).lerp(b.fogC, k); this.r.toneMappingExposure = L(a.exposure, b.exposure);
    const nacht = L(a.nachtwert, b.nachtwert); this.nacht = nacht;
    if (w.glowMat) w.glowMat.emissiveIntensity = nacht * 3.2; if (w.poolMat) w.poolMat.opacity = nacht * 0.16;
    return h;
  }
}
