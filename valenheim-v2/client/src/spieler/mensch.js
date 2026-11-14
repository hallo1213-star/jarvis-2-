// VALENHEIM 2.0 – Spielfigur mit realistischen Proportionen (ca. 7,5 Kopfhöhen), komplett anpassbar.
// Aufbau als Gelenk-Hierarchie (Hüfte → Rumpf → Kopf/Arme, Hüfte → Beine) mit prozeduralen Bewegungsabläufen.
import * as THREE from 'three';
import { verschmelze } from '../core/verschmelzen.js';

// ---------- Auswahl im Editor (auch serverseitig geprüft: siehe server/src/charakter.js) ----------
export const HAUT = ['#f6d7c3', '#eac3a5', '#d9a982', '#c68a62', '#a8704a', '#8a5636', '#6b3f26', '#4a2c1b'];
export const HAARFARBEN = ['#0f0c0a', '#2b1d14', '#4a3020', '#6e4a2c', '#9a6a3a', '#c99a5a', '#e2c27a', '#8a8a8a', '#d8d8d8', '#a8321e', '#3a5aa8', '#c04a8a'];
export const AUGENFARBEN = ['#3a2416', '#6b4a2a', '#3d6a3a', '#3a5a8a', '#6a7a8a', '#1a1a1a'];
export const STOFF = ['#111216', '#f2f2ee', '#2b2f36', '#6b7076', '#1b3a6b', '#2f5a8a', '#6a1f24', '#a8323e', '#2d4a32', '#5d6b3a', '#c99a3a', '#d4af37', '#5a3e8a', '#c76b2a', '#8a6a4a', '#e8c8c8'];
export const AUSWAHL = {
  koerper: ['m', 'w'],
  frisur: ['kurz', 'buzz', 'seitenscheitel', 'locken', 'afro', 'lang', 'zopf', 'dutt', 'glatze'],
  bart: ['kein', 'stoppeln', 'kinnbart', 'vollbart', 'schnurrbart'],
  brauen: ['normal', 'dick', 'duenn', 'gebogen'],
  oberteil: ['tshirt', 'hoodie', 'jacke', 'hemd', 'anzug', 'pullover', 'tanktop'],
  hose: ['jeans', 'jogger', 'chino', 'shorts', 'rock', 'cargo'],
  schuhe: ['sneaker', 'boots', 'business', 'slipper'],
  muetze: ['keine', 'cap', 'beanie', 'hut'],
  brille: ['keine', 'rund', 'eckig', 'sonne'],
};
export const NAMEN = {
  koerper: { m: 'Männlich', w: 'Weiblich' },
  frisur: { kurz: 'Kurz', buzz: 'Buzzcut', seitenscheitel: 'Seitenscheitel', locken: 'Locken', afro: 'Afro', lang: 'Lang', zopf: 'Pferdeschwanz', dutt: 'Dutt', glatze: 'Glatze' },
  bart: { kein: 'Kein Bart', stoppeln: 'Stoppeln', kinnbart: 'Kinnbart', vollbart: 'Vollbart', schnurrbart: 'Schnurrbart' },
  brauen: { normal: 'Normal', dick: 'Kräftig', duenn: 'Dünn', gebogen: 'Gebogen' },
  oberteil: { tshirt: 'T-Shirt', hoodie: 'Hoodie', jacke: 'Jacke', hemd: 'Hemd', anzug: 'Anzug', pullover: 'Pullover', tanktop: 'Tanktop' },
  hose: { jeans: 'Jeans', jogger: 'Jogginghose', chino: 'Chino', shorts: 'Shorts', rock: 'Rock', cargo: 'Cargohose' },
  schuhe: { sneaker: 'Sneaker', boots: 'Boots', business: 'Business', slipper: 'Slipper' },
  muetze: { keine: 'Keine', cap: 'Cap', beanie: 'Beanie', hut: 'Hut' },
  brille: { keine: 'Keine', rund: 'Rund', eckig: 'Eckig', sonne: 'Sonnenbrille' },
};
export const REGLER = { groesse: [0.92, 1.08], statur: [0.85, 1.2], kopfform: [0, 1], kiefer: [0, 1], nase: [0, 1], augenabstand: [0, 1], augengroesse: [0, 1], lippen: [0, 1] };
export const STANDARD = {
  koerper: 'm', groesse: 1, statur: 1, haut: 2, kopfform: 0.5, kiefer: 0.5, nase: 0.5, augenabstand: 0.5, augengroesse: 0.5, lippen: 0.5, augenfarbe: 0,
  frisur: 'kurz', haarfarbe: 1, bart: 'kein', brauen: 'normal',
  oberteil: 'hoodie', oberteilFarbe: 4, hose: 'jeans', hoseFarbe: 5, schuhe: 'sneaker', schuheFarbe: 1, muetze: 'keine', muetzeFarbe: 0, brille: 'keine', kette: false, uhr: false,
};
export function zufall(rnd = Math.random) {
  const p = (a) => a[Math.floor(rnd() * a.length)]; const r = ([a, b]) => +(a + rnd() * (b - a)).toFixed(3);
  const k = p(AUSWAHL.koerper);
  return {
    ...STANDARD, koerper: k, groesse: r(REGLER.groesse), statur: r(REGLER.statur), haut: Math.floor(rnd() * HAUT.length),
    kopfform: r([0, 1]), kiefer: r([0, 1]), nase: r([0, 1]), augenabstand: r([0.2, 0.8]), augengroesse: r([0.2, 0.8]), lippen: r([0, 1]), augenfarbe: Math.floor(rnd() * AUGENFARBEN.length),
    frisur: k === 'w' ? p(['lang', 'zopf', 'dutt', 'locken', 'kurz', 'afro']) : p(['kurz', 'buzz', 'seitenscheitel', 'locken', 'afro', 'glatze']), haarfarbe: Math.floor(rnd() * 8),
    bart: k === 'w' ? 'kein' : p(AUSWAHL.bart), oberteil: p(AUSWAHL.oberteil), oberteilFarbe: Math.floor(rnd() * STOFF.length), hose: p(k === 'w' ? AUSWAHL.hose : AUSWAHL.hose.filter((h) => h !== 'rock')), hoseFarbe: Math.floor(rnd() * STOFF.length),
    schuhe: p(AUSWAHL.schuhe), schuheFarbe: Math.floor(rnd() * STOFF.length), muetze: rnd() < 0.25 ? p(['cap', 'beanie']) : 'keine', muetzeFarbe: Math.floor(rnd() * STOFF.length), brille: rnd() < 0.2 ? p(['rund', 'eckig', 'sonne']) : 'keine',
  };
}

// ---------- Geometrie-Helfer ----------
// Kopf aus einer Kugel geformt: oben rund, unten zum Kinn schmaler, Stirn/Kinn leicht nach vorne
function kopfGeo(breit, kie) {
  const g = new THREE.SphereGeometry(0.11, 32, 24); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = y / 0.11; // -1 unten … 1 oben
    const unten = Math.max(0, -t); const sx = breit * (1 - unten * (1 - kie * 0.82) * 0.55);
    x *= sx; z *= 1.02 - unten * 0.12; if (z > 0 && t < -0.2) z += unten * 0.012; y *= 1.2;
    if (z < 0) z *= 1.08; // Hinterkopf
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); return g;
}
const mat = (c, r = 0.75, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
function lathe(profil, seg = 20) { return new THREE.LatheGeometry(profil.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function teil(parent, geo, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, schatten = true) {
  const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = schatten; parent.add(mesh); return mesh;
}

export class Mensch {
  constructor(look = STANDARD) {
    this.root = new THREE.Group(); this.phase = 0; this.v = 0; this.carry = false; this.bau(look);
  }

  setzeAussehen(look) { this.root.remove(this.body); this.body.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); this.bau(look); }

  bau(lookIn) {
    const L = { ...STANDARD, ...lookIn }; this.look = L; const w = L.koerper === 'w';
    const haut = mat(HAUT[L.haut] || HAUT[2], 0.55); const haar = mat(HAARFARBEN[L.haarfarbe] || HAARFARBEN[1], 0.85);
    const ober = mat(STOFF[L.oberteilFarbe] || STOFF[4], L.oberteil === 'jacke' ? 0.55 : 0.85); const hose = mat(STOFF[L.hoseFarbe] || STOFF[5], L.hose === 'jeans' ? 0.9 : 0.8);
    const schuh = mat(STOFF[L.schuheFarbe] || STOFF[1], L.schuhe === 'business' ? 0.3 : 0.6);
    const S = L.statur, H = L.groesse;
    const body = new THREE.Group(); body.scale.set(1, H, 1); this.body = body; this.root.add(body);
    const kurzArm = ['tshirt', 'tanktop'].includes(L.oberteil), kurzBein = ['shorts', 'rock'].includes(L.hose);

    // Hüfte (Becken) auf 0,98 m
    this.hips = new THREE.Group(); this.hips.position.y = 0.98; body.add(this.hips);
    teil(this.hips, lathe([[0.001, -0.1], [0.13 * S * (w ? 1.12 : 1), -0.085], [0.152 * S * (w ? 1.1 : 1), 0.0], [0.14 * S, 0.1], [0.001, 0.11]], 24), hose, 0, 0, 0, 1, 1, 0.7);
    // Rumpf: Taille → Brust → Schultern
    this.torso = new THREE.Group(); this.torso.position.y = 0.08; this.hips.add(this.torso);
    const brust = w ? 0.17 : 0.19, schulter = w ? 0.18 : 0.215;
    teil(this.torso, lathe([[0.135 * S, 0], [0.13 * S, 0.12], [brust * S, 0.3], [schulter * S, 0.44], [0.1, 0.52], [0.001, 0.53]], 24), ober, 0, 0, 0, 1, 1, 0.66);
    if (w) for (const s of [-1, 1]) teil(this.torso, new THREE.SphereGeometry(0.075, 14, 10), ober, s * 0.075 * S, 0.33, 0.085, 1, 0.9, 0.8);
    // Kleidungsdetails
    if (L.oberteil === 'hoodie') { teil(this.torso, new THREE.TorusGeometry(0.11, 0.045, 8, 18, Math.PI * 1.4), ober, 0, 0.5, -0.05, 1, 1, 1).rotation.set(1.4, 0, -0.68); teil(this.torso, new THREE.BoxGeometry(0.18 * S, 0.09, 0.02), ober, 0, 0.12, 0.125 * S, 1, 1, 1); for (const s of [-1, 1]) teil(this.torso, new THREE.CylinderGeometry(0.005, 0.005, 0.14), mat('#ddd'), s * 0.035, 0.38, 0.13 * S); }
    if (L.oberteil === 'jacke' || L.oberteil === 'anzug') { teil(this.torso, new THREE.BoxGeometry(0.05, 0.42, 0.02), mat(L.oberteil === 'anzug' ? '#f2f2ee' : '#2b2f36'), 0, 0.24, 0.12 * S * (w ? 1.05 : 1)); for (const s of [-1, 1]) teil(this.torso, new THREE.BoxGeometry(0.07, 0.16, 0.02), ober, s * 0.06, 0.4, 0.125 * S).rotation.z = s * 0.35; }
    if (L.oberteil === 'anzug') teil(this.torso, new THREE.BoxGeometry(0.035, 0.26, 0.015), mat('#6a1f24', 0.5), 0, 0.3, 0.135 * S);
    if (L.oberteil === 'hemd') { teil(this.torso, new THREE.BoxGeometry(0.13, 0.04, 0.03), mat('#f2f2ee'), 0, 0.5, 0.06); for (let i = 0; i < 4; i++) teil(this.torso, new THREE.SphereGeometry(0.008, 6, 4), mat('#ddd'), 0, 0.12 + i * 0.09, 0.125 * S); }
    // Hals + Kopf
    teil(this.torso, new THREE.CylinderGeometry(0.052, 0.06, 0.1, 12), haut, 0, 0.56, 0);
    this.kopf = new THREE.Group(); this.kopf.position.y = 0.68; this.torso.add(this.kopf); this.bauKopf(L, haut, haar);
    // Arme
    this.arme = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * (schulter * S + 0.02), 0.44, 0); this.torso.add(sh);
      teil(sh, new THREE.SphereGeometry(0.052 * S, 12, 10), ober, -Math.sign(s) * 0.012, -0.01, 0);
      teil(sh, new THREE.CapsuleGeometry(0.048 * S, 0.22, 6, 12), kurzArm && L.oberteil === 'tanktop' ? haut : ober, 0, -0.15, 0);
      if (L.oberteil === 'tshirt') teil(sh, new THREE.CapsuleGeometry(0.044 * S, 0.12, 6, 10), haut, 0, -0.22, 0);
      const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
      teil(el, new THREE.CapsuleGeometry(0.04 * S, 0.22, 6, 12), kurzArm ? haut : ober, 0, -0.13, 0);
      const hand = teil(el, new THREE.SphereGeometry(0.048, 12, 10), haut, 0, -0.29, 0.01, 0.8, 1.15, 0.6);
      if (L.uhr && s < 0) teil(el, new THREE.CylinderGeometry(0.043, 0.043, 0.03, 14), mat('#c0c4c8', 0.3, 0.9), 0, -0.23, 0);
      this.arme.push({ sh, el, s, hand });
    }
    if (L.kette) teil(this.torso, new THREE.TorusGeometry(0.07, 0.006, 6, 24), mat('#d4af37', 0.25, 1), 0, 0.5, 0.04).rotation.x = 1.35;
    // Beine
    this.beine = [];
    for (const s of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(s * 0.09 * S, -0.05, 0); this.hips.add(hp);
      teil(hp, new THREE.CapsuleGeometry(0.075 * S, 0.3, 6, 12), L.hose === 'rock' ? haut : hose, 0, -0.21, 0);
      if (L.hose === 'shorts') teil(hp, new THREE.CapsuleGeometry(0.079 * S, 0.16, 6, 12), hose, 0, -0.12, 0);
      const kn = new THREE.Group(); kn.position.y = -0.43; hp.add(kn);
      teil(kn, new THREE.CapsuleGeometry(0.058 * S, 0.32, 6, 12), kurzBein ? haut : hose, 0, -0.2, 0);
      if (L.hose === 'cargo') teil(hp, new THREE.BoxGeometry(0.05, 0.1, 0.07), hose, s * 0.07 * S, -0.25, 0.01);
      if (L.hose === 'jogger') teil(kn, new THREE.CylinderGeometry(0.052, 0.052, 0.04, 12), hose, 0, -0.4, 0);
      // Schuhe
      const sg = L.schuhe === 'boots' ? new THREE.BoxGeometry(0.11, 0.13, 0.27) : new THREE.BoxGeometry(0.1, L.schuhe === 'slipper' ? 0.06 : 0.08, 0.26);
      const fuss = teil(kn, sg, schuh, 0, L.schuhe === 'boots' ? -0.43 : -0.46, 0.045);
      if (L.schuhe === 'sneaker') teil(kn, new THREE.BoxGeometry(0.102, 0.025, 0.262), mat('#f2f2ee', 0.7), 0, -0.495, 0.045);
      fuss.userData.einzeln = true; this.beine.push({ hp, kn, s, fuss });
    }
    if (L.hose === 'rock') teil(this.hips, new THREE.CylinderGeometry(0.17 * S, 0.24 * S, 0.34, 18, 1, true), hose, 0, -0.17, 0, 1, 1, 0.8).material.side = THREE.DoubleSide;
    // Schatten-Fleck (Geräte ohne Schatten)
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.38, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.25, depthWrite: false })); blob.position.y = 0.02; this.body.add(blob);
    verschmelze(body);
  }

  bauKopf(L, haut, haar) {
    const k = this.kopf; const breit = 0.92 + (L.kopfform - 0.5) * 0.14, kie = 0.86 + L.kiefer * 0.22;
    teil(k, kopfGeo(breit, kie), haut, 0, 0.0, 0);                                                                  // Kopf (eine Form)
    for (const s of [-1, 1]) teil(k, new THREE.SphereGeometry(0.026, 10, 8), haut, s * 0.103 * breit, 0.0, -0.005, 0.5, 1, 0.8);                 // Ohren
    // Augen
    const ab = 0.034 + (L.augenabstand - 0.5) * 0.014, gr = 0.017 + (L.augengroesse - 0.5) * 0.006;
    const iris = mat(AUGENFARBEN[L.augenfarbe] || AUGENFARBEN[0], 0.3); const weiss = mat('#f4f1ea', 0.3); const pupille = mat('#050505', 0.2);
    for (const s of [-1, 1]) {
      teil(k, new THREE.SphereGeometry(gr, 14, 10), weiss, s * ab, 0.025, 0.094, 1, 0.75, 0.55, false);
      teil(k, new THREE.CircleGeometry(gr * 0.62, 14), iris, s * ab, 0.025, 0.1035, 1, 1, 1, false);
      teil(k, new THREE.CircleGeometry(gr * 0.28, 10), pupille, s * ab, 0.025, 0.104, 1, 1, 1, false);
      // Augenbrauen
      const bd = { normal: [0.034, 0.008], dick: [0.038, 0.013], duenn: [0.032, 0.005], gebogen: [0.034, 0.008] }[L.brauen] || [0.034, 0.008];
      const br = teil(k, new THREE.BoxGeometry(bd[0], bd[1], 0.008), haar, s * ab, 0.053, 0.1, 1, 1, 1, false); br.rotation.z = s * (L.brauen === 'gebogen' ? -0.25 : -0.08);
    }
    // Nase, Mund
    const ns = 0.85 + L.nase * 0.35; { const n = teil(k, new THREE.ConeGeometry(0.015 * ns, 0.042 * ns, 10), haut, 0, -0.008, 0.112, 1, 1, 0.9); n.rotation.x = Math.PI * 0.42; }
    teil(k, new THREE.CapsuleGeometry(0.004 + L.lippen * 0.003, 0.03, 4, 8).rotateZ(Math.PI / 2), mat('#8a4a40', 0.5), 0, -0.052, 0.1, 1, 1, 0.6, false);
    // Bart
    const bartForm = (dick) => { const g = new THREE.SphereGeometry(0.114 + dick, 24, 14, 0, Math.PI, Math.PI * 0.6, Math.PI * 0.32); g.scale(breit * (0.62 + kie * 0.3), 1.2, 1.0); return g; };
    const bart = { stoppeln: () => teil(k, bartForm(0.001), new THREE.MeshStandardMaterial({ color: haar.color, transparent: true, opacity: 0.4, roughness: 1 }), 0, 0, 0.004, 1, 1, 1, false),
      kinnbart: () => teil(k, new THREE.SphereGeometry(0.026, 10, 8), haar, 0, -0.112, 0.07, 1, 1.25, 0.8),
      vollbart: () => teil(k, bartForm(0.008), haar, 0, -0.004, 0.006),
      schnurrbart: () => teil(k, new THREE.BoxGeometry(0.05, 0.011, 0.012), haar, 0, -0.026, 0.1) };
    bart[L.bart]?.();
    // Frisur
    const kappe = (anteil, sx = 1.02, sy = 1.04, sz = 1.04, dy = 0.02) => { const m = teil(k, new THREE.SphereGeometry(0.113, 26, 16, 0, Math.PI * 2, 0, Math.PI * anteil), haar, 0, dy, -0.01, breit * sx, 1.2 * sy, sz * 1.05); m.rotation.x = -0.32; return m; };
    const f = L.frisur;
    if (f === 'kurz') kappe(0.42); else if (f === 'buzz') kappe(0.38, 1.0, 1.02, 1.02, 0.025);
    else if (f === 'seitenscheitel') { kappe(0.42); teil(k, new THREE.SphereGeometry(0.06, 12, 8), haar, 0.035, 0.125, 0.05, 1.3, 0.5, 1); }
    else if (f === 'locken') { kappe(0.45); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; teil(k, new THREE.SphereGeometry(0.032, 8, 6), haar, Math.cos(a) * 0.09 * breit, 0.1 + Math.sin(i * 1.7) * 0.02, Math.sin(a) * 0.08 - 0.01); } }
    else if (f === 'afro') teil(k, new THREE.SphereGeometry(0.155, 20, 14), haar, 0, 0.07, -0.02, breit, 1, 1.02);
    else if (f === 'lang' || f === 'zopf' || f === 'dutt') {
      kappe(0.5);
      if (f === 'lang') teil(k, new THREE.CapsuleGeometry(0.1, 0.18, 8, 16), haar, 0, -0.08, -0.04, breit * 1.08, 1, 0.75);
      if (f === 'zopf') teil(k, new THREE.CapsuleGeometry(0.035, 0.2, 6, 10), haar, 0, -0.03, -0.13).rotation.x = 0.35;
      if (f === 'dutt') teil(k, new THREE.SphereGeometry(0.05, 14, 10), haar, 0, 0.14, -0.08);
    }
    // Mütze
    const mf = mat(STOFF[L.muetzeFarbe] || STOFF[0], 0.8);
    if (L.muetze === 'cap') { teil(k, new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mf, 0, 0.045, -0.005, breit * 1.03, 1, 1.05); teil(k, new THREE.BoxGeometry(0.17, 0.012, 0.09), mf, 0, 0.05, 0.12); }
    if (L.muetze === 'beanie') teil(k, new THREE.SphereGeometry(0.122, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mf, 0, 0.05, -0.008, breit * 1.04, 1.25, 1.06);
    if (L.muetze === 'hut') { teil(k, new THREE.CylinderGeometry(0.2, 0.2, 0.012, 24), mf, 0, 0.1, 0); teil(k, new THREE.CylinderGeometry(0.1, 0.115, 0.11, 20), mf, 0, 0.16, 0); }
    // Brille
    if (L.brille !== 'keine') {
      const gm = L.brille === 'sonne' ? mat('#0a0a0a', 0.1, 0.6) : new THREE.MeshStandardMaterial({ color: '#aac8e0', transparent: true, opacity: 0.25, roughness: 0.05 });
      const rm = mat(L.brille === 'rund' ? '#c8a050' : '#151515', 0.4, 0.5);
      for (const s of [-1, 1]) {
        if (L.brille === 'rund') { teil(k, new THREE.TorusGeometry(0.022, 0.003, 6, 18), rm, s * ab, 0.03, 0.104, 1, 1, 1, false); teil(k, new THREE.CircleGeometry(0.021, 16), gm, s * ab, 0.03, 0.103, 1, 1, 1, false); }
        else { teil(k, new THREE.BoxGeometry(0.046, 0.032, 0.004), gm, s * ab, 0.03, 0.104, 1, 1, 1, false); teil(k, new THREE.BoxGeometry(0.05, 0.004, 0.006), rm, s * ab, 0.047, 0.105, 1, 1, 1, false); }
      }
      teil(k, new THREE.BoxGeometry(0.02, 0.004, 0.004), rm, 0, 0.035, 0.105, 1, 1, 1, false);
    }
  }

  // Bewegung: speed in m/s
  animate(dt, speed, inLuft = false) {
    this.v += (speed - this.v) * Math.min(1, dt * 10); const v = this.v;
    const rennen = THREE.MathUtils.clamp((v - 4.5) / 2.5, 0, 1); const geht = v > 0.15;
    this.phase += dt * (geht ? 2.2 + v * 0.95 : 0); const p = this.phase; const amp = Math.min(1, v / 4.2) * (0.55 + rennen * 0.4); const sw = Math.sin(p) * amp;
    for (const B of this.beine) {
      const ph = B.s > 0 ? sw : -sw; B.hp.rotation.x = inLuft ? -0.5 + (B.s > 0 ? 0.2 : -0.1) : -ph * 0.85;
      B.kn.rotation.x = inLuft ? 0.7 : Math.max(0, Math.sin(p + (B.s > 0 ? 0 : Math.PI) - 0.5)) * amp * (1.15 + rennen * 0.7);
      B.fuss.rotation.x = -B.kn.rotation.x * 0.3;
    }
    for (const A of this.arme) {
      if (this.carry) { A.sh.rotation.set(-1.05, 0, -A.s * 0.1); A.el.rotation.x = -0.6; continue; }
      const ph = A.s > 0 ? -sw : sw; A.sh.rotation.x = inLuft ? -0.6 : -ph * (0.7 + rennen * 0.35); A.sh.rotation.z = A.s * (0.07 + rennen * 0.06 + (inLuft ? 0.3 : 0));
      A.el.rotation.x = -(0.15 + rennen * 1.0 + (geht ? 0.15 : 0));
    }
    const ruhe = 1 - Math.min(1, v / 0.4); const t = performance.now() / 1000;
    this.hips.position.y = 0.98 + (geht ? Math.abs(Math.cos(p)) * 0.045 * amp : 0) - rennen * 0.04;
    this.hips.rotation.y = geht ? Math.sin(p) * 0.08 * amp : 0; this.torso.rotation.y = -this.hips.rotation.y * 1.4;
    this.torso.rotation.x = rennen * 0.2 + (inLuft ? 0.08 : 0); this.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.008 * ruhe;
    this.kopf.rotation.y = Math.sin(t * 0.37) * 0.18 * ruhe; this.kopf.rotation.x = -this.torso.rotation.x * 0.6;
  }
}

// Namensschild (Sprite)
export function namensschild(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.font = '700 54px Inter, system-ui, sans-serif'; const w = Math.min(500, g.measureText(name).width + 56); const x = (512 - w) / 2;
  g.fillStyle = 'rgba(8,15,32,0.75)'; g.beginPath(); g.roundRect(x, 24, w, 76, 38); g.fill(); g.strokeStyle = 'rgba(212,175,55,0.9)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true })); s.scale.set(1.6, 0.4, 1); s.position.y = 2.15; s.renderOrder = 10; return s;
}
