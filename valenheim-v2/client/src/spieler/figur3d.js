// VALENHEIM 2.0 – realistische Menschen: echtes 3D-Modell (Ready Player Me, Babylon.js-Assets CC-BY 4.0)
// mit Bewegungsaufnahmen (Mixamo: Stehen, Gehen, Rennen, Nicken, Tanzen). Haut, Haare und Kleidung werden eingefärbt.
// Gleiche Schnittstelle wie die alte Figur: root, setzeAussehen(look), animate(dt, tempo, inLuft), zeige(art).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { HAUT, HAARFARBEN, STOFF, STANDARD } from './mensch.js';

let vorlage = null, clips = null, laden = null;

// Bewegung relativ zur Grundhaltung der Quelle → auf die Grundhaltung der Zielfigur übertragen
function ruhe(root) { const r = {}; root.traverse((o) => { r[o.name.replace('mixamorig:', '')] = o.quaternion.clone(); }); return r; }
function umrechnen(gltf, ziel) {
  const quelle = ruhe(gltf.scene);
  return gltf.animations.map((c0) => {
    const c = c0.clone(); c.tracks = c.tracks.filter((k) => k.name.endsWith('.quaternion'));
    for (const k of c.tracks) {
      k.name = k.name.replace('mixamorig:', ''); const bone = k.name.split('.')[0]; const qs = quelle[bone], qd = ziel[bone]; if (!qs || !qd) continue;
      const inv = qs.clone().invert(); const q = new THREE.Quaternion(); const v = k.values;
      for (let i = 0; i < v.length; i += 4) { q.fromArray(v, i); q.premultiply(inv).premultiply(qd); q.toArray(v, i); }
    }
    return c;
  });
}

export function ladeFiguren() {
  if (laden) return laden;
  const L = new GLTFLoader(); const ld = (f) => new Promise((ok, no) => L.load(f, ok, undefined, no));
  laden = Promise.all([ld('/modelle/mensch.glb'), ld('/modelle/bewegung.glb'), ld('/modelle/tanz.glb')]).then(([m, b, t]) => {
    vorlage = m.scene; const box = new THREE.Box3().setFromObject(vorlage); vorlage.userData.hoehe = box.max.y - box.min.y;
    const ziel = ruhe(vorlage); clips = Object.fromEntries([...umrechnen(b, ziel), ...umrechnen(t, ziel)].map((c) => [c.name, c]));
  });
  return laden;
}
export const figurenBereit = () => !!vorlage;

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export class Mensch3D {
  constructor(look = STANDARD) {
    if (!vorlage) throw new Error('ladeFiguren() zuerst aufrufen');
    this.root = new THREE.Group(); this.v = 0; this.emote = null;
    this.modell = SkeletonUtils.clone(vorlage); this.root.add(this.modell);
    this.mats = []; this.knochen = {};
    this.modell.traverse((o) => {
      if (o.isBone) this.knochen[o.name] = o;
      if (o.isMesh) { o.material = o.material.clone(); o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; this.mats.push(o.material); }
    });
    this.mixer = new THREE.AnimationMixer(this.modell);
    this.a = {}; for (const n of ['Idle', 'Walk', 'Run', 'Tanzen', 'Nicken']) { const c = clips[n]; if (!c) continue; const a = this.mixer.clipAction(c); a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); this.a[n] = a; }
    this.mixer.update(Math.random() * 2);
    this.setzeAussehen(look);
  }
  setzeAussehen(lookIn) {
    const L = { ...STANDARD, ...lookIn }; this.look = L;
    const haut = new THREE.Color(HAUT[L.haut] || HAUT[2]).multiplyScalar(1.35);
    for (const m of this.mats) {
      const n = m.name;
      if (/Skin|Body/.test(n)) m.color.copy(haut);
      else if (/Hair/.test(n)) m.color.set(HAARFARBEN[L.haarfarbe] || HAARFARBEN[1]).multiplyScalar(1.3);
      else if (/Top/.test(n)) m.color.set(STOFF[L.oberteilFarbe] || STOFF[0]).multiplyScalar(1.15);
      else if (/Bottom/.test(n)) m.color.set(STOFF[L.hoseFarbe] || STOFF[4]).multiplyScalar(1.15);
      else if (/Footwear/.test(n)) m.color.set(STOFF[L.schuheFarbe] || STOFF[0]);
    }
    const H = 1.78 * (L.groesse || 1) / (vorlage.userData.hoehe || 1.8); const w = L.koerper === 'w' ? 0.93 : 1;
    this.modell.scale.set(H * w * (L.statur || 1) ** 0.5, H, H * w * (L.statur || 1) ** 0.5);
  }
  zeige(art) { const t = this.uhr || 0; this.emote = { art, start: t, bis: t + (art === 'tanzen' ? 20 : 3) }; }
  animate(dt, speed, inLuft = false) {
    this.v += (speed - this.v) * Math.min(1, dt * 8); const v = this.v; this.uhr = (this.uhr || 0) + dt; const t = this.uhr;
    if (this.emote && (v > 0.6 || t > this.emote.bis)) this.emote = null;
    const e = this.emote?.art;
    // Gewichte: Stehen ↔ Gehen ↔ Rennen nach Tempo, Emotes überblenden alles
    let wI = 0, wW = 0, wR = 0, wT = 0, wN = 0;
    if (e === 'tanzen') wT = 1; else if (e === 'jubeln' || e === 'winken') wI = 1;
    else if (inLuft) wR = 1;
    else if (v < 0.2) wI = 1;
    else if (v < 2.6) { const k = THREE.MathUtils.smoothstep(v, 0.2, 1.2); wI = 1 - k; wW = k; }
    else { const k = THREE.MathUtils.smoothstep(v, 2.6, 4.0); wW = 1 - k; wR = k; }
    const s = (n, w) => { const a = this.a[n]; if (!a) return; const cur = a.getEffectiveWeight(); a.setEffectiveWeight(cur + (w - cur) * Math.min(1, dt * 10)); };
    s('Idle', wI); s('Walk', wW); s('Run', wR); s('Tanzen', wT); s('Nicken', wN);
    if (this.a.Walk) this.a.Walk.timeScale = THREE.MathUtils.clamp(v / 1.5, 0.6, 1.5);
    if (this.a.Run) this.a.Run.timeScale = inLuft ? 0.2 : THREE.MathUtils.clamp(v / 4.6, 0.75, 1.35);
    this.mixer.update(dt);
    // Winken / Jubeln: Arme über die Animation legen
    if (e === 'winken' || e === 'jubeln') {
      const a = t - this.emote.start; const k = Math.min(1, a * 5); const R = this.knochen.RightArm, Lf = this.knochen.LeftArm, RF = this.knochen.RightForeArm, LF = this.knochen.LeftForeArm;
      const dreh = (b, x, z) => { if (!b) return; _e.set(x * k, 0, z * k); b.quaternion.multiply(_q.setFromEuler(_e)); };
      if (e === 'winken') { dreh(R, -2.2, 0.3); dreh(RF, 0, 0.35 + Math.sin(a * 9) * 0.45); }
      else { const hops = Math.sin(a * 8) * 0.12; dreh(R, -0.9, 1.9 + hops); dreh(Lf, -0.9, -1.9 - hops); dreh(RF, 0, 0.2); dreh(LF, 0, -0.2); }
    }
  }
  dispose() { this.mixer.stopAllAction(); for (const m of this.mats) m.dispose(); }
}
