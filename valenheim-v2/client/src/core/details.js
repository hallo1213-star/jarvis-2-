// Detail-Steuerung (Level of Detail für eine 2-km-Stadt):
// - Viele gleiche Kleinobjekte (Bäume, Laternen, Autos …) liegen als InstancedMesh vor → nur Exemplare im Umkreis zeichnen.
// - Einzelne kleine Meshes (Sondergebäude-Details) → ab einer Entfernung ausblenden.
// Weit entfernt bleiben nur die großen, zusammengefassten Gebäude sichtbar (wenige Zeichenaufrufe).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Sphere();

export class Detailsteuerung {
  constructor(scene) {
    this.inst = []; this.einzel = []; this.radius = 260; this.t = 0; this.letzte = new THREE.Vector3(1e9, 0, 0);
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (o.isInstancedMesh) {
        if (o.count < 40) return;
        const n = o.count; const mats = o.instanceMatrix.array.slice(0, n * 16); const pos = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { pos[i * 2] = mats[i * 16 + 12]; pos[i * 2 + 1] = mats[i * 16 + 14]; }
        const cols = o.instanceColor ? o.instanceColor.array.slice(0, n * 3) : null;
        o.frustumCulled = false; this.inst.push({ o, n, mats, pos, cols, schatten: o.castShadow });
        return;
      }
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      _s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      if (_s.radius < 30 && o.visible) this.einzel.push({ o, x: _s.center.x, z: _s.center.z, r: _s.radius });
    });
  }
  setzeRadius(r, schatten = true) {
    this.radius = r; this.letzte.set(1e9, 0, 0);
    for (const it of this.inst) it.o.castShadow = schatten && it.schatten;
  }
  update(dt, cam) {
    this.t += dt; if (this.t < 0.25) return; this.t = 0;
    if (cam.distanceToSquared(this.letzte) < 36) return; this.letzte.copy(cam);
    const R = this.radius + Math.min(400, Math.max(0, cam.y - 20) * 2); const R2 = R * R; // von oben weiter sehen
    for (const it of this.inst) {
      const { o, n, mats, pos, cols } = it; const dst = o.instanceMatrix.array; const dc = o.instanceColor?.array; let k = 0;
      for (let i = 0; i < n; i++) {
        const dx = pos[i * 2] - cam.x, dz = pos[i * 2 + 1] - cam.z; if (dx * dx + dz * dz > R2) continue;
        dst.set(mats.subarray(i * 16, i * 16 + 16), k * 16); if (cols && dc) dc.set(cols.subarray(i * 3, i * 3 + 3), k * 3); k++;
      }
      o.count = k; o.instanceMatrix.needsUpdate = true; if (dc) o.instanceColor.needsUpdate = true;
    }
    const RE = R * 1.4, RE2 = RE * RE;
    for (const e of this.einzel) { const dx = e.x - cam.x, dz = e.z - cam.z; e.o.visible = dx * dx + dz * dz < RE2 + e.r * e.r * 4; }
  }
  stats() { let sichtbar = 0, gesamt = 0; for (const it of this.inst) { sichtbar += it.o.count; gesamt += it.n; } return { sichtbar, gesamt, einzel: this.einzel.length }; }
}
