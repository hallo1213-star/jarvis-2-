// Phase 8: Job-Punkte an den Firmen + Lichtsäule über dem aktuellen Lieferziel
import * as THREE from 'three';
import { KATALOG } from '../fahrzeuge/modelle.js';
import { firmaPos } from '../../../shared/jobs.js';

export function baueJobPunkte(scene, slab = 0.22) {
  const J = KATALOG.jobs; const zonen = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: '#3cff8f', transparent: true, opacity: 0.8, depthWrite: false });
  const ringe = [];
  for (const key of Object.keys(J.firmen)) {
    const p = firmaPos(J, key);
    const r = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.65, 48).rotateX(-Math.PI / 2), ringMat); r.position.set(p.x, slab + 0.05, p.z); r.userData.keineKollision = true; scene.add(r); ringe.push(r);
    zonen.push({ art: 'job', firma: key, x: p.x, z: p.z, r: 3, text: `${J.firmen[key].name} – Lieferfahrer werden` });
  }
  // Lichtsäule fürs Ziel (grün)
  const saeule = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 120, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#3cff8f', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  saeule.visible = false; saeule.userData.keineKollision = true; scene.add(saeule);
  const zielRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 48).rotateX(-Math.PI / 2), ringMat); zielRing.visible = false; zielRing.userData.keineKollision = true; scene.add(zielRing);
  return {
    zonen,
    setzeZiel(z) { saeule.visible = zielRing.visible = !!z; if (z) { saeule.position.set(z.x, 60, z.z); zielRing.position.set(z.x, slab + 0.06, z.z); } },
    update(t) { ringMat.opacity = 0.55 + Math.sin(t * 3) * 0.3; for (const r of ringe) r.scale.setScalar(1 + Math.sin(t * 2) * 0.05); },
  };
}
