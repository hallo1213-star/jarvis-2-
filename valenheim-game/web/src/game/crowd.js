// Fußgänger: günstige Figuren (3 Draw-Calls je Person), laufen auf den Gehwegen um die Blöcke, bleiben stehen, weichen dem Spieler aus.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CENTERS, districtOfBlock } from './city.js';
import { LOOK } from './character.js';

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo; const c = new THREE.Color(hex); const n = g.attributes.position.count;
  const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g;
}
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });

function person(look, female) {
  const J = LOOK.jacke[look.jacke], H = LOOK.hose[look.hose], S = LOOK.haut[look.haut], R = LOOK.haare[look.haare];
  const parts = [
    colored(new THREE.CapsuleGeometry(0.19, 0.36, 4, 10).scale(1.05, 1, 0.7).translate(0, 1.32, 0), J),
    colored(new THREE.CapsuleGeometry(0.06, 0.5, 4, 6).translate(-0.27, 1.2, 0), J),
    colored(new THREE.CapsuleGeometry(0.06, 0.5, 4, 6).translate(0.27, 1.2, 0), J),
    colored(new THREE.SphereGeometry(0.05, 8, 6).translate(-0.27, 0.9, 0), S), colored(new THREE.SphereGeometry(0.05, 8, 6).translate(0.27, 0.9, 0), S),
    colored(new THREE.SphereGeometry(0.13, 14, 10).scale(0.92, 1.08, 0.98).translate(0, 1.79, 0), S),
    colored(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI * (female ? 0.75 : 0.55)).translate(0, 1.81, -0.015), R),
    colored(new THREE.CapsuleGeometry(0.17, 0.1, 4, 8).rotateZ(Math.PI / 2).translate(0, 0.95, 0), H),
  ];
  if (female) parts.push(colored(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8).translate(0, 1.6, -0.1), R));
  const body = new THREE.Mesh(mergeGeometries(parts), MAT); body.castShadow = true;
  const leg = () => { const g = new THREE.Group(); const m = new THREE.Mesh(mergeGeometries([colored(new THREE.CapsuleGeometry(0.08, 0.66, 4, 6).translate(0, -0.42, 0), H), colored(new THREE.BoxGeometry(0.12, 0.08, 0.26).translate(0, -0.84, 0.05), '#1a1a1a')]), MAT); m.castShadow = true; g.add(m); g.position.y = 0.92; return g; };
  const root = new THREE.Group(); root.add(body); const L = leg(), Rg = leg(); L.position.x = -0.1; Rg.position.x = 0.1; root.add(L, Rg);
  return { root, body, legs: [L, Rg] };
}

export class Crowd {
  constructor(scene, n, rand = Math.random) {
    this.people = [];
    const blocks = []; for (const cx of CENTERS) for (const cz of CENTERS) { const d = districtOfBlock(Math.round(cx / 80), Math.round(cz / 80)); if (d !== 'militaer' && Math.abs(cx) <= 200 && Math.abs(cz) <= 200) blocks.push([cx, cz, d]); }
    for (let i = 0; i < n; i++) {
      const [cx, cz] = blocks[Math.floor(rand() * blocks.length)];
      const look = { jacke: Math.floor(rand() * 12), hose: Math.floor(rand() * 12), haut: Math.floor(rand() * 6), haare: Math.floor(rand() * 8) };
      const p = person(look, rand() < 0.5); scene.add(p.root);
      const e = 31.7 + rand() * 0.35; // Gehweg-Abstand vom Blockzentrum
      this.people.push({ ...p, cx, cz, e, s: rand() * 4, dir: rand() < 0.5 ? 1 : -1, speed: 1.1 + rand() * 0.5, phase: rand() * 6, pause: 0, x: 0, z: 0 });
    }
  }
  // Position auf dem Rechteck-Umfang (s in 0..4, je Seite 1)
  at(p) {
    const s = ((p.s % 4) + 4) % 4; const side = Math.floor(s); const f = s - side; const e = p.e; const a = -e + f * 2 * e;
    switch (side) { case 0: return [p.cx + a, p.cz - e]; case 1: return [p.cx + e, p.cz + a]; case 2: return [p.cx - a, p.cz + e]; default: return [p.cx - e, p.cz - a]; }
  }
  update(dt, player, cam) {
    for (const p of this.people) {
      const far = cam && Math.hypot(p.x - cam.x, p.z - cam.z) > 140;
      p.root.visible = !far;
      if (p.pause > 0) p.pause -= dt; else if (Math.random() < dt * 0.02) p.pause = 2 + Math.random() * 4;
      let v = p.pause > 0 ? 0 : p.speed;
      if (player && Math.hypot(player.x - p.x, player.z - p.z) < 1.4) v = 0; // nicht durch den Spieler laufen
      p.s += (v * p.dir * dt) / (2 * p.e);
      const [x, z] = this.at(p); const dx = x - p.x, dz = z - p.z; p.x = x; p.z = z;
      if (far) continue;
      p.root.position.set(x, 0.15, z); if (Math.abs(dx) + Math.abs(dz) > 1e-4) p.root.rotation.y = Math.atan2(dx, dz);
      p.phase += dt * v * 3.2; const sw = Math.sin(p.phase) * 0.5 * Math.min(1, v);
      p.legs[0].rotation.x = sw; p.legs[1].rotation.x = -sw; p.body.position.y = Math.abs(Math.cos(p.phase)) * 0.03 * Math.min(1, v);
    }
  }
}
