// Realistische Bäume für das Spiel: Stamm + Äste mit Rinde, Krone aus Blattbüschel-Karten (Foto-Blätter, Poly Haven CC0).
// Als InstancedMesh: hunderte Bäume kosten nur 2 Zeichenaufrufe. Krone wiegt leicht im Wind.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let geoCache = null; const zeit = { value: 0 };
export const BAUM_ZEIT = zeit;

function rnd(s) { let x = s; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; }
function ast(von, nach, r0, r1) {
  const d = new THREE.Vector3().subVectors(nach, von); const l = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, l, 7, 3, true); g.translate(0, l / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.applyQuaternion(q); g.translate(von.x, von.y, von.z);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.5, uv.getY(i) * l / 2.2);
  return g;
}
export function baumGeometrie() {
  if (geoCache) return geoCache;
  const R = rnd(1234);
  // Stamm + Hauptäste
  const teile = [ast(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.1, 3.4, 0.05), 0.2, 0.12)];
  const top = new THREE.Vector3(0.1, 3.4, 0.05);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + R(); const h = 2.4 + R() * 1.0; const v = new THREE.Vector3(0.05, h, 0.02); teile.push(ast(v, new THREE.Vector3(Math.cos(a) * 1.6, h + 1.3 + R() * 0.6, Math.sin(a) * 1.6), 0.08, 0.035)); }
  teile.push(ast(top, new THREE.Vector3(0.2, 5.0, -0.1), 0.1, 0.04));
  const stamm = mergeGeometries(teile.map((g) => g.toNonIndexed()));
  // Krone: Karten auf einem Ellipsoid, Normalen zeigen vom Kronenmittelpunkt weg (weiches, rundes Licht)
  const C = new THREE.Vector3(0, 4.3, 0), RAD = new THREE.Vector3(2.5, 1.9, 2.5);
  const karten = [];
  for (let i = 0; i < 34; i++) {
    const u = R() * 2 - 1, phi = R() * Math.PI * 2, r = 0.45 + 0.55 * Math.cbrt(R());
    const dir = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(phi), u * 0.9, Math.sqrt(1 - u * u) * Math.sin(phi));
    const p = C.clone().add(dir.clone().multiply(RAD).multiplyScalar(r));
    const s = 1.8 + R() * 1.1; const g = new THREE.PlaneGeometry(s, s);
    const halb = R() < 0.5 ? 0 : 0.5; const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, halb + uv.getX(k) * 0.5);
    const m = new THREE.Object3D(); m.position.copy(p); m.lookAt(p.clone().add(new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5))); m.updateMatrix(); g.applyMatrix4(m.matrix);
    const nrm = g.attributes.normal; const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, k); const n = v.clone().sub(C).divide(RAD).normalize(); nrm.setXYZ(k, n.x, n.y, n.z);
      const innen = THREE.MathUtils.clamp(v.clone().sub(C).divide(RAD).length(), 0, 1); const unten = THREE.MathUtils.clamp((v.y - (C.y - RAD.y)) / (2 * RAD.y), 0, 1);
      const ao = 0.45 + 0.55 * Math.min(1, innen * 0.8 + unten * 0.5); col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); karten.push(g.toNonIndexed());
  }
  const krone = mergeGeometries(karten);
  // Stamm braucht dieselben Attribute für die Instanzfarbe nicht; Vertexfarbe weiß
  geoCache = { stamm, krone }; return geoCache;
}
export function baumMaterialien() {
  const ld = new THREE.TextureLoader();
  const blatt = ld.load('/tex/blaetter.png'); blatt.colorSpace = THREE.SRGBColorSpace; blatt.anisotropy = 4;
  const rinde = ld.load('/tex/rinde.jpg'); rinde.colorSpace = THREE.SRGBColorSpace; rinde.wrapS = rinde.wrapT = THREE.RepeatWrapping;
  const krone = new THREE.MeshStandardMaterial({ map: blatt, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85, name: 'krone' });
  krone.onBeforeCompile = (sh) => {
    sh.uniforms.uZeit = zeit;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uZeit;').replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 ip = instanceMatrix[3].xz; float ph = ip.x * 0.37 + ip.y * 0.21;
      #else
        float ph = 0.0;
      #endif
      float hoch = clamp((position.y - 2.5) / 3.0, 0.0, 1.0);
      transformed.x += sin(uZeit * 1.3 + ph + position.y * 0.6) * 0.07 * hoch;
      transformed.z += cos(uZeit * 1.1 + ph * 1.3 + position.x) * 0.05 * hoch;`);
  };
  const stamm = new THREE.MeshStandardMaterial({ map: rinde, roughness: 0.95, name: 'rinde' });
  return { krone, stamm };
}
