// Testgelände (Phase 1): prüft Laufen, Treppen, Bordsteine, Rampen, Springen, Physik-Kisten und Kamera-Kollision.
// Ab Phase 2 kommt die echte Valenheim-Karte dazu; das Testgelände bleibt als Prüfstrecke erhalten.
import * as THREE from 'three';

function pflasterTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#5d5a55'; g.fillRect(0, 0, 256, 256); let s = 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) { const v = 0.85 + r() * 0.25; g.fillStyle = `rgb(${118 * v | 0},${113 * v | 0},${105 * v | 0})`; g.fillRect(x + 1.5, y + 1.5, 29, 29); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function schild(text, farbe = '#0b1a33') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = farbe; g.fillRect(0, 0, 512, 128); g.fillStyle = '#d4af37'; g.fillRect(0, 118, 512, 10);
  g.fillStyle = '#fff'; g.font = '800 58px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function baueTestgelaende(scene, RAPIER, world) {
  const grp = new THREE.Group(); grp.name = 'testgelaende'; scene.add(grp);
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const stein = mat('#c9c2b5'), dunkel = mat('#4a4f57'), gold = mat('#d4af37', { metalness: 0.8, roughness: 0.3 }), holz = mat('#8a6440');
  const kisten = [];
  // feste Box: sichtbar + Kollision
  const box = (w, h, d, x, y, z, m = stein, rot = null) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); if (rot) mesh.quaternion.copy(rot); mesh.castShadow = mesh.receiveShadow = true; grp.add(mesh);
    const cd = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z); if (rot) cd.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }); world.createCollider(cd); return mesh;
  };
  const tafel = (text, x0, y, z, ry = 0, farbe) => { const x = x0 + 4.2; /* Schild seitlich neben der Station */ const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshStandardMaterial({ map: schild(text, farbe), roughness: 0.6 })); m.position.set(x, y, z); m.rotation.y = ry; grp.add(m); box(0.12, y - 0.4, 0.12, x, (y - 0.4) / 2, z - 0.05 * Math.cos(ry), dunkel); };

  // Boden (Pflaster) + Bordstein-Ring
  const tex = pflasterTextur(); tex.repeat.set(60, 60);
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); boden.receiveShadow = true; grp.add(boden);
  world.createCollider(RAPIER.ColliderDesc.cuboid(120, 0.5, 120).setTranslation(0, -0.5, 0));
  for (const [w, d, x, z] of [[240, 2, 0, -119], [240, 2, 0, 119], [2, 240, -119, 0], [2, 240, 119, 0]]) box(w, 3, d, x, 1.5, z, dunkel); // Begrenzung

  // 1) Bordsteine 15 cm (automatisch hochgehen)
  tafel('BORDSTEIN 15 CM', -14, 2.3, -2, 0); box(10, 0.15, 6, -14, 0.075, -6, stein); box(10, 0.15, 4, -14, 0.225, -11, stein);
  // 2) Treppe (8 Stufen à 20 cm) mit Podest
  tafel('TREPPE', 0, 2.3, -2, 0);
  for (let i = 0; i < 8; i++) box(5, 0.2 * (i + 1), 0.4, 0, 0.1 * (i + 1), -4 - i * 0.4, stein);
  box(5, 1.6, 6, 0, 0.8, -10.2, stein);
  // 3) Rampe 20° (begehbar) und 50° (zu steil)
  tafel('RAMPE 20°', 14, 2.3, -2, 0);
  const q20 = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(20), 0, 0)); box(5, 0.3, 10, 14, 1.65, -7, stein, q20);
  box(5, 3.4, 6, 14, 1.7, -14.6, stein);
  tafel('RAMPE 50° – ZU STEIL', 26, 2.3, -2, 0, '#5a1414');
  const q50 = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(50), 0, 0)); box(5, 0.3, 8, 26, 3, -6.5, stein, q50);
  // 4) Sprung-Parcours
  tafel('SPRINGEN', -28, 2.3, -2, 0);
  [[-28, 0.5, -5], [-28, 1.0, -8.5], [-26, 1.5, -12], [-29, 2.0, -15.5], [-27, 2.6, -19]].forEach(([x, y, z]) => box(2.4, 0.4, 2.4, x, y, z, holz));
  // 5) Physik-Kisten zum Schieben
  tafel('KISTEN SCHIEBEN', 0, 2.3, 14, Math.PI);
  const kistenGeo = new THREE.BoxGeometry(1, 1, 1); const kistenMat = mat('#a77b47');
  for (let i = 0; i < 9; i++) {
    const x = -2 + (i % 3) * 1.6, z = 18 + Math.floor(i / 3) * 1.6, y = 0.5;
    const mesh = new THREE.Mesh(kistenGeo, kistenMat); mesh.castShadow = mesh.receiveShadow = true; grp.add(mesh);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.6).setAngularDamping(0.6));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setDensity(0.35).setFriction(0.8), body); kisten.push({ mesh, body });
  }
  // 6) Säulengang (Kamera-Kollision testen)
  tafel('KAMERA-TEST', 24, 2.3, 14, Math.PI);
  for (let i = 0; i < 6; i++) { box(0.8, 5, 0.8, 20 + (i % 2) * 8, 2.5, 18 + Math.floor(i / 2) * 5, stein); }
  box(9.6, 0.5, 15, 24, 5.25, 23, stein);
  // Fahnenmast mit Valenheim-Flagge
  box(0.16, 10, 0.16, -20, 5, 18, gold);
  const fc = document.createElement('canvas'); fc.width = 256; fc.height = 160; const fg = fc.getContext('2d'); fg.fillStyle = '#0d1f45'; fg.fillRect(0, 0, 256, 160);
  fg.lineJoin = 'round'; const v = () => { fg.beginPath(); fg.moveTo(46, 20); fg.lineTo(128, 144); fg.lineTo(210, 20); }; fg.strokeStyle = '#fff'; fg.lineWidth = 30; v(); fg.stroke(); fg.strokeStyle = '#d4af37'; fg.lineWidth = 21; v(); fg.stroke();
  const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
  const flagge = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.9, 12, 4).translate(1.5, 0, 0), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide })); flagge.position.set(-19.92, 9, 18); flagge.castShadow = true; grp.add(flagge);
  const basis = flagge.geometry.attributes.position.array.slice();

  return {
    grp,
    update(t) {
      for (const k of kisten) { const p = k.body.translation(), r = k.body.rotation(); k.mesh.position.set(p.x, p.y, p.z); k.mesh.quaternion.set(r.x, r.y, r.z, r.w); }
      const p = flagge.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = basis[i * 3]; p.setZ(i, Math.sin(x * 1.8 - t * 4) * 0.18 * (x / 3)); } p.needsUpdate = true; flagge.geometry.computeVertexNormals();
    },
  };
}
