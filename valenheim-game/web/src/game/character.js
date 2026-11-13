// Spielfigur: einfacher, sauber proportionierter Mensch mit prozeduraler Lauf-/Rennanimation.
import * as THREE from 'three';

export const LOOK = {
  jacke: ['#1b2f55', '#7a1f24', '#2d4a32', '#3a3a3a', '#d4af37', '#5a3e8a', '#1f6f8b', '#c76b2a', '#e8e4da', '#0e0e10', '#8a8f6a', '#b8323e'],
  hose: ['#23262b', '#2c3e5c', '#4a4038', '#6b6f73', '#151515', '#3d4a2e', '#5a4632', '#1c2a44', '#8c8577', '#2e2e3a', '#4b2b2b', '#33475b'],
  haut: ['#f1c9a5', '#e0ac85', '#c68a62', '#a8704a', '#7d4f32', '#5a3825'],
  haare: ['#1a1410', '#3b2a1e', '#6b4a2a', '#a8763e', '#d9b46a', '#8a8a8a', '#b03a1e', '#0d0d0d'],
};

export class Character {
  constructor(look = {}) {
    const c = (k, d) => LOOK[k][look[k] ?? d] || LOOK[k][d];
    const mat = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
    const jacket = mat(c('jacke', 0), 0.75), pants = mat(c('hose', 0)), skin = mat(c('haut', 1), 0.6), hair = mat(c('haare', 0), 0.9);
    const shoe = mat('#1a1a1a', 0.6);
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const part = (geo, m, parent, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = false; parent.add(mesh); return mesh; };

    // Becken + Torso
    this.hips = new THREE.Group(); this.hips.position.y = 0.95; this.body.add(this.hips);
    part(new THREE.CapsuleGeometry(0.17, 0.12, 4, 10).rotateZ(Math.PI / 2), pants, this.hips, 0, 0, 0);
    this.torso = new THREE.Group(); this.torso.position.y = 0.06; this.hips.add(this.torso);
    const chest = part(new THREE.CapsuleGeometry(0.2, 0.36, 6, 12), jacket, this.torso, 0, 0.3, 0); chest.scale.set(1.05, 1, 0.7);
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skin, this.torso, 0, 0.62, 0);
    // Kopf
    this.head = new THREE.Group(); this.head.position.y = 0.78; this.torso.add(this.head);
    const headMesh = part(new THREE.SphereGeometry(0.135, 20, 16), skin, this.head, 0, 0, 0); headMesh.scale.set(0.92, 1.08, 0.98);
    const hairMesh = part(new THREE.SphereGeometry(0.142, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, this.head, 0, 0.025, -0.012); hairMesh.scale.set(0.95, 1.05, 1.02);
    part(new THREE.SphereGeometry(0.03, 8, 6), skin, this.head, 0, -0.01, 0.135); // Nase
    for (const x of [-0.045, 0.045]) part(new THREE.SphereGeometry(0.014, 8, 6), mat('#1b1b1b', 0.3), this.head, x, 0.025, 0.122);

    // Arme (Schulter → Ellbogen)
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.26 * s, 0.52, 0); this.torso.add(sh);
      part(new THREE.CapsuleGeometry(0.065, 0.26, 4, 8), jacket, sh, 0, -0.17, 0);
      const el = new THREE.Group(); el.position.y = -0.34; sh.add(el);
      part(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), jacket, el, 0, -0.14, 0);
      part(new THREE.SphereGeometry(0.055, 10, 8), skin, el, 0, -0.31, 0.01);
      this.arms.push({ sh, el, s });
    }
    // Beine (Hüfte → Knie)
    this.legs = [];
    for (const s of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(0.1 * s, -0.04, 0); this.hips.add(hp);
      part(new THREE.CapsuleGeometry(0.085, 0.32, 4, 8), pants, hp, 0, -0.22, 0);
      const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
      part(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), pants, kn, 0, -0.2, 0);
      const sh = part(new THREE.BoxGeometry(0.12, 0.08, 0.26), shoe, kn, 0, -0.43, 0.04);
      sh.geometry.translate(0, 0, 0.02);
      this.legs.push({ hp, kn, s });
    }
    // Schatten-Blob (für Geräte ohne Schatten)
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    blob.position.y = 0.02; this.root.add(blob); this.blob = blob;
    this.phase = 0; this.speedSmooth = 0;
  }

  // speed: m/s, dt: s, airborne: bool
  animate(dt, speed, airborne = false) {
    this.speedSmooth += (speed - this.speedSmooth) * Math.min(1, dt * 10);
    const v = this.speedSmooth; const run = Math.min(1, Math.max(0, (v - 4) / 3));
    const stride = v > 0.1 ? 1 : 0;
    this.phase += dt * (v > 0.1 ? 1.9 + v * 0.95 : 0);
    const p = this.phase; const amp = Math.min(1, v / 4) * (0.6 + run * 0.35);
    const swing = Math.sin(p) * amp;
    for (const L of this.legs) {
      const ph = L.s > 0 ? swing : -swing;
      L.hp.rotation.x = -ph * 0.8;
      L.kn.rotation.x = Math.max(0, Math.sin(p * 1 + (L.s > 0 ? 0 : Math.PI) - 0.6)) * amp * (1.1 + run * 0.6);
    }
    for (const A of this.arms) {
      if (this.carry) { A.sh.rotation.set(-1.05, 0, -A.s * 0.12); A.el.rotation.x = -0.55; continue; }
      const ph = A.s > 0 ? -swing : swing;
      A.sh.rotation.x = -ph * (0.7 + run * 0.3); A.sh.rotation.z = A.s * (0.08 + run * 0.05);
      A.el.rotation.x = -(0.25 + run * 0.9) * (stride ? 1 : 0.4);
    }
    const bob = Math.abs(Math.cos(p)) * 0.05 * amp * stride;
    this.hips.position.y = 0.95 + bob - run * 0.03;
    this.torso.rotation.x = run * 0.18 + (airborne ? 0.1 : 0);
    // Atmen im Stand
    const idle = 1 - Math.min(1, v / 0.5); this.torso.scale.y = 1 + Math.sin(performance.now() / 650) * 0.008 * idle;
    this.head.rotation.y = Math.sin(performance.now() / 2300) * 0.12 * idle;
  }
}

// Namensschild über der Figur (Sprite mit Canvas)
export function nameTag(name, { color = '#ffffff', badge = null } = {}) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.font = '700 54px system-ui, -apple-system, Segoe UI, sans-serif';
  const w = Math.min(500, g.measureText(name).width + 56);
  g.fillStyle = 'rgba(8,16,34,0.72)'; const x = (512 - w) / 2;
  g.beginPath(); g.roundRect(x, 24, w, 76, 38); g.fill();
  g.strokeStyle = 'rgba(212,175,55,0.9)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 256, 64);
  if (badge) { g.fillStyle = '#d4af37'; g.beginPath(); g.arc(x + 4, 30, 14, 0, 7); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1); s.position.y = 2.15; s.renderOrder = 10;
  return s;
}
