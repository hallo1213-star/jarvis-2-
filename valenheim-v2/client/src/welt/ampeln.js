// Funktionierende Ampeln: leuchtende Signale an den Ampeln der Video-Stadt, mit Phasen (Grün → Gelb → Rot).
// Gruppe A und B schalten gegenläufig; die Phase ist für alle Spieler gleich (Uhrzeit-basiert).
import * as THREE from 'three';

export const ZYKLUS = 26; // Sekunden: A grün 11 s, gelb 2 s, rot 13 s
export function phase(gruppe, now = Date.now()) {
  const t = ((now / 1000) + (gruppe ? ZYKLUS / 2 : 0)) % ZYKLUS;
  return t < 11 ? 'gruen' : t < 13 ? 'gelb' : 'rot';
}

export function baueAmpeln(scene, ampeln) {
  if (!ampeln?.length) return { update() {} };
  const geo = new THREE.PlaneGeometry(0.2, 0.2);
  const farben = { rot: [0x220303, 0xff2a1a, 5.1], gelb: [0x1c1403, 0xffb21a, 4.7], gruen: [0x021a07, 0x2aff6a, 4.3] };
  const meshes = {}; const o = new THREE.Object3D();
  for (const [k, [aus, an, y]] of Object.entries(farben)) {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), ampeln.length); m.frustumCulled = false;
    ampeln.forEach((a, i) => { o.position.set(a.x, a.y, a.z); o.rotation.set(0, a.ry, 0); o.updateMatrix(); const loc = new THREE.Matrix4().makeTranslation(0, y, 0.48); m.setMatrixAt(i, o.matrix.clone().multiply(loc)); m.setColorAt(i, new THREE.Color(aus)); });
    m.userData = { aus: new THREE.Color(aus), an: new THREE.Color(an).multiplyScalar(2.2) }; scene.add(m); meshes[k] = m;
  }
  const gruppe = ampeln.map((a) => (a.ry < 0 ? 0 : 1)); let letzte = '';
  return {
    update() {
      const pa = phase(0), pb = phase(1); const key = pa + pb; if (key === letzte) return; letzte = key;
      for (const [k, m] of Object.entries(meshes)) { ampeln.forEach((_, i) => m.setColorAt(i, (gruppe[i] ? pb : pa) === k ? m.userData.an : m.userData.aus)); m.instanceColor.needsUpdate = true; }
    },
  };
}
