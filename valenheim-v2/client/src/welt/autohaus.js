// VALENHEIM 2.0 – Janniks Autohaus (Bauplatz B15) mit Showroom, Ausstellungswagen, Theke und Werkstatt.
// Alle sichtbaren Teile bekommen automatisch Kollision (karte.js); Glas bekommt unsichtbare Wände.
import * as THREE from 'three';
import { baueAuto, KATALOG } from '../fahrzeuge/modelle.js';

const A = KATALOG.autohaus;
function schildTex(zeilen, { w = 1024, h = 160, bg = '#0b1530', fg = '#ffffff', akzent = '#d4af37', gross = 92 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = akzent; g.fillRect(0, h - 10, w, 10);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
  if (zeilen.length === 1) { g.font = `800 ${gross}px Oxanium, Montserrat, sans-serif`; g.fillText(zeilen[0], w / 2, h / 2, w - 40); }
  else { g.font = `800 ${gross * 0.62}px Oxanium, Montserrat, sans-serif`; g.fillText(zeilen[0], w / 2, h * 0.34, w - 30); g.fillStyle = akzent; g.font = `700 ${gross * 0.4}px Montserrat, sans-serif`; g.fillText(zeilen[1], w / 2, h * 0.72, w - 30); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function baueAutohaus(scene, { slab = 0.22 } = {}) {
  const g = new THREE.Group(); g.position.set(A.x, 0, A.z); scene.add(g);
  const Y = slab;
  const m = {
    boden: new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.85 }),
    hallBoden: new THREE.MeshStandardMaterial({ color: '#e9ebee', roughness: 0.18, metalness: 0.1 }),
    wand: new THREE.MeshStandardMaterial({ color: '#d8dbe0', roughness: 0.6 }),
    dunkel: new THREE.MeshStandardMaterial({ color: '#15181d', roughness: 0.5, metalness: 0.3 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.3, metalness: 0.9 }),
    glas: new THREE.MeshStandardMaterial({ color: '#9fc4e8', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.28, depthWrite: false }),
    licht: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e0', emissiveIntensity: 1.6 }),
    gelb: new THREE.MeshStandardMaterial({ color: '#ffd400', roughness: 0.6 }),
    weiss: new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.6 }),
    unsichtbar: new THREE.MeshBasicMaterial({ visible: false }),
  };
  const box = (sx, sy, sz, x, y, z, mat, opts = {}) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); b.position.set(x, y, z); b.castShadow = !opts.keinSchatten; b.receiveShadow = true; if (opts.keineKollision) b.userData.keineKollision = true; g.add(b); return b; };

  // Gelände: Asphalt + Parkmarkierungen
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(56, 56).rotateX(-Math.PI / 2), m.boden); fl.position.y = Y + 0.015; fl.receiveShadow = true; fl.userData.keineKollision = true; g.add(fl);
  for (let i = 0; i < 6; i++) box(0.12, 0.01, 5, -20 + i * 3, Y + 0.025, -18, m.weiss, { keineKollision: true, keinSchatten: true });

  // Showroom: u (= x) -2 … 22, v (= z) -20 … 20, Eingang (Glasfront) Richtung Stadtplatz
  const H = 7;
  box(24, 0.1, 40, 10, Y + 0.05, 0, m.hallBoden, { keineKollision: true });
  box(0.4, H, 40, 22, Y + H / 2, 0, m.wand);                         // Rückwand
  for (const s of [-1, 1]) { box(24, 1.2, 0.4, 10, Y + 0.6, s * 20, m.wand); const gl = box(24, H - 1.2, 0.08, 10, Y + 1.2 + (H - 1.2) / 2, s * 20, m.glas, { keineKollision: true, keinSchatten: true }); gl.renderOrder = 2; box(24, H - 1.2, 0.3, 10, Y + 1.2 + (H - 1.2) / 2, s * 20, m.unsichtbar); }
  for (const [a, b] of [[-20, -5], [5, 20]]) { const l = b - a, c = (a + b) / 2; const gl = box(0.08, H, l, -2, Y + H / 2, c, m.glas, { keineKollision: true, keinSchatten: true }); gl.renderOrder = 2; box(0.3, H, l, -2, Y + H / 2, c, m.unsichtbar); }
  box(25, 0.6, 41, 10, Y + H + 0.3, 0, m.dunkel);                      // Dach
  for (const v of [-20, -5, 5, 20]) box(0.5, H, 0.5, -2, Y + H / 2, v, m.dunkel);
  for (let u = 2; u < 22; u += 5) for (const v of [-12, 0, 12]) box(3, 0.06, 0.5, u, Y + H - 0.05, v, m.licht, { keineKollision: true, keinSchatten: true });
  // Großes Schild über dem Eingang + Säule an der Straße
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.1), new THREE.MeshStandardMaterial({ map: schildTex(['JANNIKS AUTOHAUS', 'NEUWAGEN · TUNING · KENNZEICHEN']), emissive: '#ffffff', emissiveIntensity: 0.25, emissiveMap: null }));
  s1.material.emissiveMap = s1.material.map; s1.position.set(-2.45, Y + H + 1.7, 0); s1.rotation.y = -Math.PI / 2; g.add(s1);
  box(0.5, 3.4, 20.4, -2.2, Y + H + 1.7, 0, m.dunkel);
  box(0.6, 11, 0.6, -24, Y + 5.5, -24, m.dunkel);
  const s2 = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.2), new THREE.MeshStandardMaterial({ map: schildTex(['JANNIKS', 'AUTOHAUS'], { w: 512, h: 190, gross: 120 }), emissiveIntensity: 0.4, emissive: '#ffffff' }));
  s2.material.emissiveMap = s2.material.map; s2.position.set(-24, Y + 9.6, -23.6); g.add(s2); const s2b = s2.clone(); s2b.rotation.y = -Math.PI / 2; s2b.position.set(-24.35, Y + 9.6, -24); g.add(s2b);

  // Ausstellungswagen auf Drehtellern (je Modell einer) + Preisschilder
  const modelle = Object.entries(KATALOG.modelle); const teller = [];
  modelle.forEach(([key, M], i) => {
    const u = 3 + (i % 3) * 6.5, v = i < 3 ? -11 : 11;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.14, 40), m.dunkel); t.position.set(u, Y + 0.17, v); t.receiveShadow = true; t.userData.keineKollision = true; g.add(t);
    const r = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.04, 6, 64).rotateX(Math.PI / 2), m.gold); r.position.set(u, Y + 0.24, v); r.userData.keineKollision = true; g.add(r);
    const car = baueAuto({ modell: key, farbe: [0, 2, 6, 8, 12, 14][i], kennzeichen: 'VH-JA ' + (i + 1), tuning: i >= 4 ? { felgen: 3, spoiler: 2 } : {} });
    car.position.set(u, Y + 0.24, v); car.rotation.y = 0.6 + i; g.add(car); teller.push(car);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.MeshStandardMaterial({ map: schildTex([M.name, `${M.preis.toLocaleString('de-DE')} €`], { w: 512, h: 176, gross: 92 }) }));
    p.position.set(u - 3.4, Y + 1.25, v); p.rotation.y = -Math.PI / 2; p.userData.keineKollision = true; g.add(p);
    box(0.08, 0.8, 0.08, u - 3.38, Y + 0.4, v, m.dunkel, { keineKollision: true });
  });
  // Theke
  const T = { u: A.theke[0] - A.x, v: A.theke[1] - A.z };
  box(1.2, 1.1, 4, T.u + 2, Y + 0.55, T.v, m.dunkel); box(1.3, 0.06, 4.1, T.u + 2, Y + 1.13, T.v, m.gold, { keineKollision: true });
  const ts = new THREE.Mesh(new THREE.PlaneGeometry(5, 1), new THREE.MeshStandardMaterial({ map: schildTex(['VERKAUF'], { w: 512, h: 100, gross: 70 }) })); ts.position.set(21.75, Y + 4, T.v); ts.rotation.y = -Math.PI / 2; g.add(ts);

  // Werkstatt (Überdachung mit Hebebühne) vor dem Showroom
  const W = { u: A.werkstatt[0] - A.x, v: A.werkstatt[1] - A.z };
  for (const [du, dv] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) box(0.35, 4.6, 0.35, W.u + du, Y + 2.3, W.v + dv, m.dunkel);
  box(11, 0.35, 9, W.u, Y + 4.75, W.v, m.wand);
  for (const s of [-1, 1]) box(0.5, 0.18, 5, W.u + s * 1.0, Y + 0.09, W.v, m.gelb, { keineKollision: true });
  box(8, 0.02, 0.2, W.u, Y + 0.03, W.v - 4, m.gelb, { keineKollision: true, keinSchatten: true });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.3), new THREE.MeshStandardMaterial({ map: schildTex(['WERKSTATT', 'TUNING · LACK · KENNZEICHEN'], { w: 1024, h: 150, gross: 100 }), emissive: '#ffffff', emissiveIntensity: 0.25 }));
  ws.material.emissiveMap = ws.material.map; ws.position.set(W.u - 5.55, Y + 4.1, W.v); ws.rotation.y = -Math.PI / 2; g.add(ws);

  // Markierungen (leuchtende Ringe) + Lichtsäule zum Finden aus der Ferne
  const ringMat = new THREE.MeshBasicMaterial({ color: '#d4af37', transparent: true, opacity: 0.85, depthWrite: false });
  const ring = (u, v) => { const r = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.35, 48).rotateX(-Math.PI / 2), ringMat); r.position.set(u, Y + 0.14, v); r.userData.keineKollision = true; g.add(r); return r; };
  const r1 = ring(T.u - 0.4, T.v), r2 = ring(W.u, W.v);
  const saeuleMat = new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const saeule = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 160, 16, 1, true), saeuleMat); saeule.position.set(-12, 80, 0); saeule.userData.keineKollision = true; g.add(saeule);

  const zonen = [
    { art: 'autohaus', x: A.x + T.u - 0.4, z: A.z + T.v, r: 2.6, text: 'Janniks Autohaus – Auto kaufen' },
    { art: 'werkstatt', x: A.x + W.u, z: A.z + W.v, r: 4.2, text: 'Werkstatt – Tuning & Kennzeichen' },
  ];
  return {
    gruppe: g, zonen, saeule,
    update(t) { for (const [i, c] of teller.entries()) c.rotation.y = 0.6 + i + t * 0.25; ringMat.opacity = 0.55 + Math.sin(t * 3) * 0.3; r1.scale.setScalar(1 + Math.sin(t * 2) * 0.05); r2.scale.copy(r1.scale); },
  };
}
