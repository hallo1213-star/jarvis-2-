// VALENHEIM 2.0 – Passanten: echte Menschen (gleiches Modell wie die Spieler, zufällig eingekleidet),
// laufen auf den Gehwegen um die Blöcke und tauchen in der Nähe des Spielers wieder auf.
import * as THREE from 'three';
import { zufall } from './mensch.js';
import { Mensch3D } from './figur3d.js';

const P = 74, RAND = 26.2, SLAB = 0.22;
export class Passanten {
  constructor(scene, { anzahl = 10 } = {}) {
    let s = 777; this.rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    this.leute = [];
    for (let k = 0; k < anzahl; k++) {
      const fig = new Mensch3D(zufall(this.rnd)); scene.add(fig.root);
      const p = { fig, tempo: 1.15 + this.rnd() * 0.45, pos: new THREE.Vector3(), h: 0 };
      this.platziere(p, 0, 0, 2); this.leute.push(p);
    }
  }
  platziere(p, cx, cz, r) {
    let i, j; do { i = Math.round(cx / P) + Math.floor(this.rnd() * (2 * r + 1)) - r; j = Math.round(cz / P) + Math.floor(this.rnd() * (2 * r + 1)) - r; } while (i === 1 && j === -1);
    p.i = i; p.j = j; p.s = this.rnd() * 8 * RAND; p.dir = this.rnd() < 0.5 ? 1 : -1; p.neu = true;
  }
  ort(p, out) {
    const L = 2 * RAND, u = ((p.s % (4 * L)) + 4 * L) % (4 * L), seite = Math.floor(u / L), t = u % L - RAND; const cx = p.i * P, cz = p.j * P;
    if (seite === 0) out.set(cx + t, SLAB, cz - RAND); else if (seite === 1) out.set(cx + RAND, SLAB, cz + t); else if (seite === 2) out.set(cx - t, SLAB, cz + RAND); else out.set(cx - RAND, SLAB, cz - t);
    return out;
  }
  update(dt, kamera, sicht = 110) {
    const neu = new THREE.Vector3();
    for (const p of this.leute) {
      if (p.pos.distanceToSquared(kamera.position) > 200 * 200) this.platziere(p, kamera.position.x, kamera.position.z, 2);
      p.s += p.tempo * p.dir * dt; this.ort(p, neu);
      const dx = neu.x - p.pos.x, dz = neu.z - p.pos.z;
      if (p.neu) { p.h = Math.atan2(dx || 0.001, dz); p.neu = false; } else if (dx * dx + dz * dz > 1e-6) { const zh = Math.atan2(dx, dz); let d = zh - p.h; d = Math.atan2(Math.sin(d), Math.cos(d)); p.h += d * Math.min(1, dt * 6); }
      p.pos.copy(neu);
      const r = p.fig.root; const sichtbar = p.pos.distanceToSquared(kamera.position) < sicht * sicht; r.visible = sichtbar;
      if (!sichtbar) continue;
      const schatten = p.pos.distanceToSquared(kamera.position) < 30 * 30; if (schatten !== p.schatten) { p.schatten = schatten; r.traverse((m) => { if (m.isMesh) m.castShadow = schatten; }); }
      r.position.copy(p.pos); r.rotation.y = p.h; p.fig.animate(dt, p.tempo, false);
    }
  }
}
