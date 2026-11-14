// VALENHEIM 2.0 – Phase 9: Passanten. Alle Fußgänger zusammen = 5 InstancedMeshes (Körper, Kopf, Haare, Arme, Beine).
// Sie laufen auf den Gehwegen um die Blöcke und werden in der Nähe des Spielers neu verteilt.
import * as THREE from 'three';
import { HAUT, HAARFARBEN, STOFF } from './mensch.js';

const P = 74, RAND = 26.2, SLAB = 0.22;
const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _o = new THREE.Object3D(), _c = new THREE.Color();

export class Passanten {
  constructor(scene, { anzahl = 28 } = {}) {
    let s = 777; this.rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const mat = () => new THREE.MeshStandardMaterial({ roughness: 0.75 });
    const mk = (geo, n) => { const m = new THREE.InstancedMesh(geo, mat(), n); m.userData.dynamisch = true; m.castShadow = true; m.frustumCulled = false; scene.add(m); return m; };
    this.koerper = mk(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10).scale(1, 1, 0.68), anzahl);
    this.kopf = mk(new THREE.SphereGeometry(0.115, 14, 10).scale(0.9, 1.1, 0.95), anzahl);
    this.haare = mk(new THREE.SphereGeometry(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.92, 1.05, 1).rotateX(-0.3), anzahl);
    this.arme = mk(new THREE.CapsuleGeometry(0.05, 0.5, 3, 6).translate(0, -0.29, 0), anzahl * 2);
    this.beine = mk(new THREE.CapsuleGeometry(0.07, 0.72, 3, 8).translate(0, -0.42, 0), anzahl * 2);
    this.leute = [];
    for (let k = 0; k < anzahl; k++) {
      const p = { k, tempo: 1.1 + this.rnd() * 0.6, phase: this.rnd() * 6, groesse: 0.92 + this.rnd() * 0.16, pos: new THREE.Vector3(), h: 0 };
      const hemd = new THREE.Color(STOFF[Math.floor(this.rnd() * STOFF.length)]); this.koerper.setColorAt(k, hemd);
      this.kopf.setColorAt(k, _c.set(HAUT[Math.floor(this.rnd() * HAUT.length)]));
      this.haare.setColorAt(k, _c.set(HAARFARBEN[Math.floor(this.rnd() * HAARFARBEN.length)]));
      const hose = new THREE.Color(STOFF[Math.floor(this.rnd() * STOFF.length)]), arm = hemd;
      for (const s2 of [0, 1]) { this.beine.setColorAt(k * 2 + s2, hose); this.arme.setColorAt(k * 2 + s2, arm); }
      this.platziere(p, 0, 0, 3); this.leute.push(p);
    }
    for (const m of [this.koerper, this.kopf, this.haare, this.arme, this.beine]) m.instanceColor.needsUpdate = true;
  }
  // Zufälliger Block um (cx, cz) – Platz (0,0) eingeschlossen, Autohaus-Gelände nicht
  platziere(p, cx, cz, r) {
    let i, j; do { i = Math.round(cx / P) + Math.floor(this.rnd() * (2 * r + 1)) - r; j = Math.round(cz / P) + Math.floor(this.rnd() * (2 * r + 1)) - r; } while (i === 1 && j === -1);
    p.i = i; p.j = j; p.s = this.rnd() * 4 * 2 * RAND; p.dir = this.rnd() < 0.5 ? 1 : -1;
  }
  // Position auf dem Rechteck um den Block (Umfang 8·RAND)
  ort(p, out) {
    const L = 2 * RAND, u = ((p.s % (4 * L)) + 4 * L) % (4 * L), seite = Math.floor(u / L), t = u % L - RAND; const cx = p.i * P, cz = p.j * P;
    if (seite === 0) out.set(cx + t, SLAB, cz - RAND); else if (seite === 1) out.set(cx + RAND, SLAB, cz + t); else if (seite === 2) out.set(cx - t, SLAB, cz + RAND); else out.set(cx - RAND, SLAB, cz - t);
    return out;
  }
  update(dt, kamera, sicht = 160) {
    const neu = new THREE.Vector3();
    for (const p of this.leute) {
      if (p.pos.distanceToSquared(kamera.position) > 220 * 220) this.platziere(p, kamera.position.x, kamera.position.z, 2);
      p.s += p.tempo * p.dir * dt; p.phase += p.tempo * dt * 5.2;
      this.ort(p, neu); const dx = neu.x - p.pos.x, dz = neu.z - p.pos.z;
      if (dx * dx + dz * dz > 1e-6 && dx * dx + dz * dz < 4) { const zh = Math.atan2(dx, dz); let d = zh - p.h; d = Math.atan2(Math.sin(d), Math.cos(d)); p.h += d * Math.min(1, dt * 8); }
      else if (dx * dx + dz * dz >= 4) p.h = Math.atan2(dx, dz);
      p.pos.copy(neu);
      const sichtbar = p.pos.distanceToSquared(kamera.position) < sicht * sicht; const g = sichtbar ? p.groesse : 0;
      _o.position.copy(p.pos); _o.rotation.set(0, p.h, 0); _o.scale.setScalar(g); _o.updateMatrix(); const root = _o.matrix;
      const sw = Math.sin(p.phase) * 0.5, bob = Math.abs(Math.cos(p.phase)) * 0.03;
      const teil = (mesh, idx, x, y, z, rx) => { _m.makeRotationX(rx); _m.setPosition(x, y + bob, z); _w.multiplyMatrices(root, _m); mesh.setMatrixAt(idx, _w); };
      teil(this.koerper, p.k, 0, 1.23, 0, 0); teil(this.kopf, p.k, 0, 1.66, 0.01, 0); teil(this.haare, p.k, 0, 1.69, -0.005, 0);
      teil(this.beine, p.k * 2, -0.09, 0.9, 0, sw); teil(this.beine, p.k * 2 + 1, 0.09, 0.9, 0, -sw);
      teil(this.arme, p.k * 2, -0.23, 1.47, 0, -sw * 0.8); teil(this.arme, p.k * 2 + 1, 0.23, 1.47, 0, sw * 0.8);
    }
    for (const m of [this.koerper, this.kopf, this.haare, this.arme, this.beine]) m.instanceMatrix.needsUpdate = true;
  }
}
