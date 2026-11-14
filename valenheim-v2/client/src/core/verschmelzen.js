// Weniger Zeichenaufrufe: In jeder Gruppe werden die direkten Mesh-Kinder mit gleichem Material zu EINEM Mesh
// verschmolzen. Gruppen (Gelenke, drehende Teile) bleiben erhalten – Animationen funktionieren weiter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ATTR = ['position', 'normal', 'uv'];
function vorbereiten(mesh, behalten) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const n of Object.keys(g.attributes)) if (!ATTR.includes(n) && !behalten.has(n)) g.deleteAttribute(n);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {}; g.clearGroups(); mesh.updateMatrix(); g.applyMatrix4(mesh.matrix); return g;
}
export function verschmelze(wurzel, { tief = true } = {}) {
  const gruppen = [];
  wurzel.traverse((o) => { if (!o.isMesh && (tief || o === wurzel)) gruppen.push(o); });
  let vorher = 0, nachher = 0;
  for (const p of gruppen) {
    const kinder = p.children.filter((c) => c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh && !c.isSprite && c.children.length === 0 && !Array.isArray(c.material) && c.visible && !c.userData.einzeln && !c.userData.dynamisch && !c.material.transparent);
    const nachMat = new Map();
    for (const c of kinder) { const k = c.material.uuid + (c.castShadow ? 's' : '') + (c.receiveShadow ? 'r' : '') + (c.renderOrder || 0); if (!nachMat.has(k)) nachMat.set(k, []); nachMat.get(k).push(c); }
    for (const liste of nachMat.values()) {
      vorher += liste.length; if (liste.length < 2) { nachher++; continue; }
      // Eigene Shader-Attribute (z. B. Gebäudefarbe) nur behalten, wenn alle Teile sie haben – sonst nicht verschmelzen
      const extra = liste.map((c) => Object.keys(c.geometry.attributes).filter((n) => !ATTR.includes(n)).sort().join(','));
      if (extra.some((e) => e !== extra[0])) { nachher += liste.length; continue; }
      const behalten = new Set(extra[0] ? extra[0].split(',') : []);
      const geo = mergeGeometries(liste.map((c) => vorbereiten(c, behalten))); if (!geo) { nachher += liste.length; continue; }
      const m = new THREE.Mesh(geo, liste[0].material); m.castShadow = liste[0].castShadow; m.receiveShadow = liste[0].receiveShadow; m.renderOrder = liste[0].renderOrder;
      m.userData = { ...liste[0].userData, verschmolzen: true };
      for (const c of liste) { p.remove(c); c.geometry.dispose?.(); }
      p.add(m); nachher++;
    }
  }
  return { vorher, nachher };
}
