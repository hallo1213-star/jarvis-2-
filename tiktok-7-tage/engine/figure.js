// Spielfigur ("ICH") und Einwohner. Prozedurale Gelenk-Animation, rein zeitbasiert (deterministisch).
import * as THREE from 'three';
import { makeRng, clamp, smooth, ease } from './rng.js';

export const SPIELER_LOOK = {
  jacke: 0xc2561d, kragen: 0x7a3210, hose: 0x1b2230, schuhe: 0xe9e9e6, sohle: 0x222222,
  haut: 0xc6977a, haare: 0x261a12, rucksack: 0x353b2c, gurt: 0xc2561d,
};

const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10).translate(0, -len / 2 - r * 0.2, 0);

export function holoMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uProg: { value: 1 }, uBase: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Color(0x3fe0ff) } },
    vertexShader: `varying vec3 vWP; varying vec3 vN; varying vec3 vV;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uTime; uniform float uProg; uniform float uBase; uniform float uFade; uniform vec3 uColor; varying vec3 vWP; varying vec3 vN; varying vec3 vV;
      void main(){
        float cut = uBase + uProg*2.1;
        if (vWP.y > cut) discard;
        float fres = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
        float scan = 0.65 + 0.35*step(0.5, fract(vWP.y*14.0 - uTime*2.0));
        float edge = smoothstep(0.12, 0.0, cut - vWP.y) * step(uProg, 0.999);
        vec3 c = uColor * (0.25 + 1.4*fres) * scan + vec3(0.8,1.0,1.0)*edge*2.5;
        gl_FragColor = vec4(c * uFade, 1.0);
      }`,
  });
}

export class Figure {
  constructor(look = SPIELER_LOOK, { scale = 1, seed = 1 } = {}) {
    this.look = look; this.seed = seed;
    this.root = new THREE.Group(); this.root.scale.setScalar(scale);
    this.meshes = [];
    const M = (hex, rough = 0.8) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough });
    const mats = { jacke: M(look.jacke, 0.7), kragen: M(look.kragen), hose: M(look.hose, 0.85), schuhe: M(look.schuhe, 0.6), sohle: M(look.sohle),
      haut: M(look.haut, 0.6), haare: M(look.haare, 0.9), rucksack: M(look.rucksack, 0.85), gurt: M(look.gurt, 0.7), auge: M(0x0d0d0d, 0.3) };
    this.mats = mats;
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); this.meshes.push(m); return m; };
    const G = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    this.hips = G(this.root, 0, 0.98, 0);
    add(this.hips, new THREE.CapsuleGeometry(0.15, 0.06, 4, 10).scale(1.1, 1, 0.75), mats.hose, 0, -0.02, 0);
    this.torso = G(this.hips, 0, 0.04, 0);
    add(this.torso, new THREE.CapsuleGeometry(0.17, 0.32, 4, 12).scale(1.08, 1, 0.72), mats.jacke, 0, 0.27, 0);
    add(this.torso, new THREE.TorusGeometry(0.09, 0.045, 6, 14).rotateX(Math.PI / 2), mats.kragen, 0, 0.56, 0);
    add(this.torso, new THREE.BoxGeometry(0.012, 0.36, 0.01), mats.kragen, 0, 0.3, 0.128); // Reißverschluss
    // Rucksack
    add(this.torso, new THREE.BoxGeometry(0.3, 0.38, 0.14), mats.rucksack, 0, 0.3, -0.18);
    add(this.torso, new THREE.BoxGeometry(0.24, 0.12, 0.05), mats.gurt, 0, 0.2, -0.26);
    for (const s of [-1, 1]) add(this.torso, new THREE.BoxGeometry(0.04, 0.34, 0.03), mats.rucksack, s * 0.1, 0.32, 0.12);
    this.neck = G(this.torso, 0, 0.58, 0);
    add(this.neck, new THREE.CylinderGeometry(0.05, 0.055, 0.08, 8), mats.haut, 0, 0.03, 0);
    this.head = G(this.neck, 0, 0.08, 0);
    add(this.head, new THREE.SphereGeometry(0.112, 16, 12).scale(0.95, 1.12, 1.02), mats.haut, 0, 0.1, 0.005);
    add(this.head, new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.99, 0.95, 1.04), mats.haare, 0, 0.152, -0.012);
    add(this.head, new THREE.SphereGeometry(0.118, 12, 10, Math.PI * 0.9, Math.PI * 1.2, Math.PI * 0.45, Math.PI * 0.3), mats.haare, 0, 0.13, -0.008);
    add(this.head, new THREE.BoxGeometry(0.06, 0.012, 0.01), M(0x6a3a30, 0.6), 0, 0.058, 0.108);
    for (const s of [-1, 1]) {
      add(this.head, new THREE.SphereGeometry(0.014, 6, 6), mats.auge, s * 0.038, 0.115, 0.1);
      add(this.head, new THREE.BoxGeometry(0.035, 0.008, 0.01), mats.haare, s * 0.04, 0.143, 0.103);
      add(this.head, new THREE.SphereGeometry(0.022, 6, 6).scale(0.5, 1, 0.8), mats.haut, s * 0.108, 0.1, 0);
    }
    add(this.head, new THREE.ConeGeometry(0.016, 0.04, 6).rotateX(Math.PI / 2), mats.haut, 0, 0.085, 0.118);
    // Accessoires (für benannte Einwohner): lange Haare, Weihnachtsmütze, Basecap
    if (look.langeHaare) {
      add(this.head, new THREE.BoxGeometry(0.25, 0.3, 0.07), mats.haare, 0, -0.02, -0.085);
      for (const sx of [-1, 1]) add(this.head, new THREE.BoxGeometry(0.05, 0.22, 0.12), mats.haare, sx * 0.112, 0.0, -0.02);
      add(this.head, new THREE.BoxGeometry(0.21, 0.045, 0.04), mats.haare, 0, 0.19, 0.095); // Pony
    }
    if (look.hut === 'weihnacht') {
      const rot = M(0xc8102e, 0.7), weiss = M(0xf4f4f0, 0.95);
      add(this.head, new THREE.TorusGeometry(0.118, 0.032, 8, 20).rotateX(Math.PI / 2), weiss, 0, 0.2, -0.005);
      const cone = add(this.head, new THREE.ConeGeometry(0.115, 0.3, 14).translate(0, 0.15, 0), rot, 0, 0.21, -0.01);
      cone.rotation.set(-0.55, 0, 0.25);
      add(this.head, new THREE.SphereGeometry(0.04, 8, 8), weiss, 0.07, 0.42, -0.16);
    }
    if (look.kapuze) {
      const km = M(look.kapuze === true ? look.jacke : look.kapuze, 0.85);
      add(this.head, new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 1.08, 1.1), km, 0, 0.11, -0.025);
    }
    if (look.hut === 'krone') {
      const gold = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.9, roughness: 0.25, emissive: 0xffb020, emissiveIntensity: 0.55 });
      add(this.head, new THREE.CylinderGeometry(0.105, 0.11, 0.06, 16, 1, true), gold, 0, 0.29, -0.01);
      for (let k = 0; k < 5; k++) { const a2 = (k / 5) * Math.PI * 2; add(this.head, new THREE.ConeGeometry(0.025, 0.09, 6), gold, Math.sin(a2) * 0.1, 0.355, Math.cos(a2) * 0.1 - 0.01); }
      add(this.head, new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 1.2 }), 0, 0.29, 0.1);
    }
    if (look.hut === 'stroh') {
      const stroh = M(0xe2b44a, 0.95), band = M(0xc81e1e, 0.7);
      add(this.head, new THREE.CylinderGeometry(0.27, 0.27, 0.015, 24), stroh, 0, 0.2, 0);
      add(this.head, new THREE.CylinderGeometry(0.115, 0.125, 0.12, 20), stroh, 0, 0.27, -0.005);
      add(this.head, new THREE.CylinderGeometry(0.127, 0.127, 0.04, 20), band, 0, 0.225, -0.005);
    }
    if (look.hut === 'helm') {
      const hm = M(look.helmFarbe || 0x4f5a34, 0.8);
      add(this.head, new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(1.02, 0.9, 1.1), hm, 0, 0.15, -0.005);
      add(this.head, new THREE.CylinderGeometry(0.145, 0.15, 0.02, 18), hm, 0, 0.16, 0);
    }
    if (look.hut === 'cap') {
      const cm = M(look.capFarbe || 0x161616, 0.7);
      add(this.head, new THREE.SphereGeometry(0.124, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.85, 1.05), cm, 0, 0.165, -0.008);
      add(this.head, new THREE.CylinderGeometry(0.12, 0.12, 0.012, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.25), cm, 0, 0.17, 0.07);
    }

    this.arms = []; this.legs = [];
    for (const s of [-1, 1]) {
      const sh = G(this.torso, s * 0.215, 0.47, 0);
      add(sh, capsule(0.058, 0.24), mats.jacke);
      const el = G(sh, 0, -0.31, 0);
      add(el, capsule(0.05, 0.22), mats.jacke);
      add(el, new THREE.SphereGeometry(0.047, 8, 8).scale(0.9, 1.1, 0.7), mats.haut, 0, -0.31, 0);
      this.arms.push({ sh, el, s });
      const hp = G(this.hips, s * 0.095, -0.02, 0);
      add(hp, capsule(0.075, 0.36), mats.hose);
      const kn = G(hp, 0, -0.46, 0);
      add(kn, capsule(0.062, 0.36), mats.hose);
      const ft = add(kn, new THREE.BoxGeometry(0.1, 0.075, 0.25), mats.schuhe, 0, -0.47, 0.045);
      add(ft, new THREE.BoxGeometry(0.105, 0.025, 0.26), mats.sohle, 0, -0.045, 0);
      this.legs.push({ hp, kn, s });
    }
    this.action = 'idle'; this.actionT = 0;
  }

  // Aufhellung (z. B. am Abend im Schatten): Grundfarbe leicht selbstleuchtend
  setFill(k) { for (const m of this.meshes) { const mat = m.userData.orig || m.material; if (mat.emissive) { mat.emissive.copy(mat.color); mat.emissiveIntensity = k; } } }
  setHolo(mat) { this.holo = mat; for (const m of this.meshes) { m.userData.orig = m.userData.orig || m.material; m.material = mat; m.castShadow = false; } }
  setNormal() { for (const m of this.meshes) { if (m.userData.orig) m.material = m.userData.orig; m.castShadow = true; } this.holo = null; }

  // t: Zeit in s; action: idle | umsehen | blick_stadt | winken | laufen
  pose(t, action = 'idle', at = 0) {
    const lt = t - at; const sd = this.seed * 1.7;
    const br = Math.sin(t * 1.9 + sd);
    // Grundhaltung
    this.hips.position.y = 0.98 + br * 0.004; this.hips.rotation.set(0, 0, Math.sin(t * 0.45 + sd) * 0.018);
    this.torso.rotation.set(0.03 + br * 0.012, 0, -Math.sin(t * 0.45 + sd) * 0.02);
    this.neck.rotation.set(0, 0, 0); this.head.rotation.set(0.02, Math.sin(t * 0.3 + sd) * 0.12, 0);
    for (const a of this.arms) { a.sh.rotation.set(0.04 + br * 0.015, 0, a.s * 0.1); a.el.rotation.set(-0.18, 0, 0); }
    for (const l of this.legs) { l.hp.rotation.set(0, 0, l.s * 0.035); l.kn.rotation.set(0, 0, 0); }

    if (action === 'umsehen') {
      // nach links, nach rechts, nach oben – unsicher
      const k = clamp(lt / 4.2);
      const yaw = Math.sin(k * Math.PI * 2.0) * 0.75 * smooth(0, 0.08, k);
      this.head.rotation.y = yaw; this.torso.rotation.y = yaw * 0.25;
      this.head.rotation.x = -0.12 * Math.sin(k * Math.PI);
    } else if (action === 'blick_stadt') {
      this.head.rotation.x = -0.1; this.head.rotation.y = Math.sin(t * 0.4) * 0.08;
      for (const a of this.arms) { a.sh.rotation.z = a.s * 0.13; }
    } else if (action === 'winken') {
      const k = smooth(0.2, 0.9, lt);
      const R = this.arms[1];
      // Arm hoch über die Seite, Unterarm winkt
      R.sh.rotation.z = THREE.MathUtils.lerp(0.1, 2.55, k);
      R.sh.rotation.x = THREE.MathUtils.lerp(0.04, -0.15, k);
      R.el.rotation.x = 0; R.el.rotation.z = k * (0.35 + Math.sin(lt * 9) * 0.45);
      this.head.rotation.y = 0.0; this.head.rotation.x = -0.05;
      this.torso.rotation.z -= k * 0.05;
    } else if (action === 'laufen') {
      const ph = t * 7.2 + sd;
      for (const l of this.legs) { const p = ph + (l.s > 0 ? Math.PI : 0); l.hp.rotation.x = Math.sin(p) * 0.5; l.kn.rotation.x = Math.max(0, -Math.cos(p)) * 0.8 + 0.05; }
      for (const a of this.arms) { const p = ph + (a.s > 0 ? 0 : Math.PI); a.sh.rotation.x = Math.sin(p) * 0.45; a.el.rotation.x = -0.35; }
      this.hips.position.y = 0.97 + Math.abs(Math.cos(ph)) * 0.035;
      this.torso.rotation.x = 0.07;
    }
  }
}

// Einwohner-Aussehen: deterministisch aus Index
const JACKEN = [0x2f5d8a, 0x7a2d3b, 0x3f6b3a, 0xc9a227, 0x5b4a8a, 0x8a8a8a, 0x1f1f1f, 0xd9d4c7, 0x2a7a7a, 0x9a4f2a];
const HAUT = [0xf0c8a8, 0xd9a888, 0xb98463, 0x8d5a3e, 0x6b4430, 0xe6b898];
const HAARE = [0x1a120c, 0x3a2614, 0x6b4a2a, 0xb08850, 0x2a2a2a, 0x9a9a9a, 0x5a1f12];
export function einwohnerLook(i) {
  const r = makeRng(1000 + i * 17);
  return { jacke: r.pick(JACKEN), kragen: 0x222222, hose: r.pick([0x1b2230, 0x2a2a2a, 0x3a3a50, 0x4a3a2a, 0x2a3a4a]), schuhe: r.pick([0xe0e0e0, 0x222222, 0x6a4a2a]),
    sohle: 0x1a1a1a, haut: r.pick(HAUT), haare: r.pick(HAARE), rucksack: r.pick([0x333333, 0x4a3a2a, 0x2a3a2a]), gurt: 0x222222 };
}

// Einwohner bewegen sich auf festen Rundwegen um den Platz (für spätere Folgen mit echten Einwohnern)
export function crowdPath(i, t) {
  const r = makeRng(500 + i * 31);
  const rad = r.range(9, 25); const sp = r.range(0.18, 0.4) * (r.chance(0.5) ? 1 : -1) / rad * 1.3; const a0 = r.range(0, Math.PI * 2);
  const stand = r.chance(0.3);
  const a = stand ? a0 : a0 + t * sp;
  const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
  const ry = stand ? -a0 + Math.PI : (sp > 0 ? -a : -a + Math.PI);
  return { x, z, ry, walk: !stand };
}

// Holografischer Spawn-Effekt: Lichtsäule + Ring
export function makeSpawnFx() {
  const g = new THREE.Group();
  const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uA; uniform float uTime; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * uA; a *= 0.6 + 0.4*sin(vUv.y*40.0 - uTime*12.0); gl_FragColor = vec4(vec3(0.3,0.9,1.0)*a*0.7, 1.0); }` });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 40, 24, 1, true).translate(0, 20, 0), beamMat);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x4fe6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 48).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = 0.04;
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.6, 48).rotateX(-Math.PI / 2), ringMat.clone()); ring2.position.y = 0.04;
  g.add(beam, ring, ring2);
  return { g, update(lt, t) {
    beamMat.uniforms.uTime.value = t;
    const a = lt < 0 ? 0 : lt < 0.25 ? lt / 0.25 : Math.max(0, 1 - (lt - 0.25) / 0.9);
    beamMat.uniforms.uA.value = a; beam.scale.set(1 + (1 - a) * 0.6, 1, 1 + (1 - a) * 0.6);
    const rs = 1 + Math.max(0, lt) * 3.2; ring.scale.set(rs, 1, rs); ringMat.opacity = lt < 0 ? 0 : Math.max(0, 1 - lt / 1.2);
    ring2.material.opacity = lt < 0 ? 0 : 0.55 + 0.25 * Math.sin(t * 6); ring2.scale.setScalar(1);
    g.visible = lt >= 0;
  } };
}

// Auswahlring unter der Spielfigur (Simulations-Look)
export function makeSelectionRing() {
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uA: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uA; varying vec2 vUv;
      void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float ang = atan(p.y,p.x);
        float ring = smoothstep(0.03,0.0,abs(r-0.82)) + 0.5*smoothstep(0.02,0.0,abs(r-0.95))*step(0.5,fract(ang*6.0/6.2831 + uTime*0.15));
        float pulse = smoothstep(0.04,0.0,abs(r - fract(uTime*0.6)))*(1.0-fract(uTime*0.6))*0.6;
        float fill = smoothstep(0.85,0.0,r)*0.12;
        gl_FragColor = vec4(vec3(1.0,0.62,0.25)*(ring+pulse+fill)*uA*1.4, 1.0); }` });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2), mat);
  m.position.y = 0.03; m.renderOrder = 2;
  return m;
}
