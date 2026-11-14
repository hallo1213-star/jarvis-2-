// VALENHEIM 2.0 – Phase 9: Straßenverkehr (NPC-Autos). Alle Autos eines Modells = wenige InstancedMeshes
// (eins pro Material), damit es auch auf dem Handy flüssig bleibt. Rechtsverkehr auf dem Straßenraster.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { baueAuto, KATALOG, verkehrsModell, SPORT_MASSE } from './modelle.js';

const P = 74, SPUR = 2.6, BEREICH = 5, ECKE = 9;
const MODELLE = ['kompakt', 'kombi', 'limousine', 'suv'];

// Ein Automodell in je eine Geometrie pro Material „backen“ (Lack wird später pro Instanz eingefärbt)
export function backe(modell, vorlage) {
  const echt = modell === 'echt' ? (vorlage || verkehrsModell()) : null;
  const car = echt ? echt.clone(true) : baueAuto({ modell, farbe: 4, kennzeichen: 'VH-VK 100', tuning: {} }); if (echt) car.position.z = -0.24; car.updateMatrixWorld(true);
  const istLack = (m) => (echt ? /^Paint/.test(m.name) : m === car.userData.body.children[0].material); const gruppen = new Map();
  car.traverse((o) => {
    if (!o.isMesh || o.material.blending === THREE.AdditiveBlending) return;
    const key = istLack(o.material) ? 'lack' : o.material.uuid; const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld); for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!gruppen.has(key)) gruppen.set(key, { mat: key === 'lack' ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.5, clearcoat: 0.8 }) : o.material, geos: [] });
    gruppen.get(key).geos.push(g);
  });
  return { T: echt ? SPORT_MASSE : car.userData.T, teile: [...gruppen.entries()].map(([k, v]) => ({ lack: k === 'lack', mat: v.mat, geo: mergeGeometries(v.geos) })) };
}

const knoten = (i, j) => new THREE.Vector3((i + 0.5) * P, 0, (j + 0.5) * P);
const RICHT = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, -x, -z
// Rechte Spur: rechts von der Fahrtrichtung f ist (-f.z, f.x)
const spur = (f) => new THREE.Vector3(-f[1] * SPUR, 0, f[0] * SPUR);

export class Verkehr {
  constructor(scene, RAPIER, world, { anzahl = 16 } = {}) {
    this.world = world; this.autos = []; this.meshes = []; let s = 4242; this.rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const quellen = verkehrsModell() ? ['echt'] : MODELLE; const proModell = Math.ceil(anzahl / quellen.length);
    quellen.forEach((modell, mi) => {
      const b = backe(modell); const inst = b.teile.map((t) => { const m = new THREE.InstancedMesh(t.geo, t.mat, proModell); m.userData.dynamisch = true; m.castShadow = t.lack || /Glass|Tire/.test(t.mat.name || ''); m.receiveShadow = true; m.frustumCulled = false; scene.add(m); this.meshes.push(m); return { ...t, m }; });
      for (let k = 0; k < proModell && this.autos.length < anzahl; k++) {
        const farbe = new THREE.Color(KATALOG.farben[Math.floor(this.rnd() * KATALOG.farben.length)]);
        inst.filter((t) => t.lack).forEach((t) => t.m.setColorAt(k, farbe));
        const a = { inst, k, T: b.T, tempo: 0, ziel: 11 + this.rnd() * 5, pos: new THREE.Vector3(), h: 0 };
        // Start: zufällige Kreuzung + Richtung
        a.i = Math.floor(this.rnd() * (2 * BEREICH)) - BEREICH; a.j = Math.floor(this.rnd() * (2 * BEREICH)) - BEREICH; a.d = Math.floor(this.rnd() * 4);
        this.neuesStueck(a, true); a.t = this.rnd() * 0.8;
        a.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
        world.createCollider(RAPIER.ColliderDesc.cuboid(b.T.W / 2, 0.7, b.T.L / 2).setTranslation(0, 0.75, 0), a.body);
        this.autos.push(a);
      }
      inst.forEach((t) => { if (t.m.instanceColor) t.m.instanceColor.needsUpdate = true; });
    });
    this._o = new THREE.Object3D(); this._q = new THREE.Quaternion();
  }
  // Nächstes Stück: von Kreuzung (i,j) in Richtung d zur nächsten Kreuzung (gerade), danach eine Kurve
  neuesStueck(a, start = false) {
    const f = RICHT[a.d]; const A = knoten(a.i, a.j), B = knoten(a.i + f[0], a.j + f[1]); const o = spur(f);
    const p0 = A.clone().add(o).addScaledVector(new THREE.Vector3(f[0], 0, f[1]), ECKE), p2 = B.clone().add(o).addScaledVector(new THREE.Vector3(f[0], 0, f[1]), -ECKE);
    a.kurve = { p0, p1: p0.clone().lerp(p2, 0.5), p2, len: p0.distanceTo(p2) }; a.gerade = true; if (start) a.t = 0;
    a.i += f[0]; a.j += f[1];
  }
  abbiegen(a) {
    const f = RICHT[a.d]; const im = (dd) => Math.abs(a.i + RICHT[dd][0]) <= BEREICH && Math.abs(a.j + RICHT[dd][1]) <= BEREICH;
    const wahl = [[a.d, 0.5], [(a.d + 1) % 4, 0.25], [(a.d + 3) % 4, 0.25]].filter(([dd]) => im(dd));
    let d = (a.d + 2) % 4; // Wenden, wenn es nicht weitergeht
    if (wahl.length) { const sum = wahl.reduce((x, [, g]) => x + g, 0); let r = this.rnd() * sum; for (const [dd, g] of wahl) { r -= g; if (r <= 0) { d = dd; break; } } if (r > 0) d = wahl[0][0]; }
    const K = knoten(a.i, a.j); const p0 = a.kurve.p2.clone(); const nf = RICHT[d];
    const p2 = K.clone().add(spur(nf)).addScaledVector(new THREE.Vector3(nf[0], 0, nf[1]), ECKE);
    const p1 = d === a.d ? p0.clone().lerp(p2, 0.5) : d === (a.d + 2) % 4 ? K.clone().addScaledVector(new THREE.Vector3(f[0], 0, f[1]), 4) : (() => {
      // Kurvenpunkt: Schnittpunkt der beiden Spuren
      const q = K.clone().add(spur(f)).add(spur(nf)); return q; })();
    a.kurve = { p0, p1, p2, len: p0.distanceTo(p1) + p1.distanceTo(p2) }; a.gerade = false; a.d = d; a.t = 0;
  }
  punkt(k, t, v) { const u = 1 - t; return v.set(u * u * k.p0.x + 2 * u * t * k.p1.x + t * t * k.p2.x, 0, u * u * k.p0.z + 2 * u * t * k.p1.z + t * t * k.p2.z); }

  // hindernisse: [{x, z}] (Spieler, Spielerautos)
  update(dt, hindernisse, kamera, sicht = 260) {
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    for (const a of this.autos) {
      // Bremsen, wenn vorne etwas ist
      const fx = Math.sin(a.h), fz = Math.cos(a.h); let frei = 99;
      const pruefe = (x, z) => { const dx = x - a.pos.x, dz = z - a.pos.z; const vor = dx * fx + dz * fz, seit = Math.abs(dx * fz - dz * fx); if (vor > 0 && seit < 2.2) frei = Math.min(frei, vor); };
      for (const h of hindernisse) pruefe(h.x, h.z);
      for (const b of this.autos) if (b !== a) pruefe(b.pos.x, b.pos.z);
      const soll = frei < a.T.L / 2 + 2.5 ? 0 : frei < 16 ? a.ziel * (frei - a.T.L / 2 - 2.5) / 12 : a.gerade ? a.ziel : a.ziel * 0.55;
      a.tempo += THREE.MathUtils.clamp(soll - a.tempo, -14 * dt, 4 * dt);
      a.t += (a.tempo * dt) / Math.max(1, a.kurve.len);
      if (a.t >= 1) { a.t -= 1; if (a.gerade) this.abbiegen(a); else this.neuesStueck(a); }
      this.punkt(a.kurve, a.t, v); this.punkt(a.kurve, Math.min(1, a.t + 0.02), w);
      if (w.distanceToSquared(v) > 1e-6) { const zh = Math.atan2(w.x - v.x, w.z - v.z); let d = zh - a.h; d = Math.atan2(Math.sin(d), Math.cos(d)); a.h += d * Math.min(1, dt * 10); }
      a.pos.copy(v);
      a.body.setNextKinematicTranslation({ x: v.x, y: 0, z: v.z }); this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a.h); a.body.setNextKinematicRotation(this._q);
      const sichtbar = a.pos.distanceToSquared(kamera.position) < sicht * sicht;
      const o = this._o; o.position.copy(v); o.rotation.set(0, a.h, 0); o.scale.setScalar(sichtbar ? 1 : 0); o.updateMatrix();
      for (const t of a.inst) t.m.setMatrixAt(a.k, o.matrix);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
  karte() { return this.autos.map((a) => ({ x: a.pos.x, z: a.pos.z })); }
}
