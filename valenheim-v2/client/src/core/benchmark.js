// Leistungstest: misst eine stadtähnliche Szene in allen drei Grafikstufen und empfiehlt die beste flüssige Stufe.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PROFILE, STUFEN, geraet, zielFps } from './quality.js';

function szene(stufe) {
  const P = PROFILE[stufe]; const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fb6cc'); scene.fog = new THREE.FogExp2('#9fb6cc', P.nebel * 0.6);
  scene.add(new THREE.HemisphereLight('#cfe0ff', '#4a4034', 0.6));
  const sun = new THREE.DirectionalLight('#fff0d8', 2.2); sun.position.set(80, 140, 60); scene.add(sun);
  if (P.schatten) { sun.castShadow = true; sun.shadow.mapSize.set(P.schatten, P.schatten); Object.assign(sun.shadow.camera, { left: -P.schattenWeite, right: P.schattenWeite, top: P.schattenWeite, bottom: -P.schattenWeite, far: 400 }); }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4a4d52', roughness: 0.9 })); ground.receiveShadow = true; scene.add(ground);
  // Stadtblöcke: wie im Spiel zu wenigen Meshes zusammengefasst + einzelne Objekte (Zeichenaufrufe)
  const n = Math.round(1400 * P.details); const geos = [[], [], []]; let s = 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) { const x = (rnd() - 0.5) * 900, z = (rnd() - 0.5) * 900; if (Math.abs(x) < 8 && Math.abs(z) < 8) continue; const w = 8 + rnd() * 14, h = 8 + rnd() * (rnd() < 0.1 ? 90 : 25); geos[i % 3].push(new THREE.BoxGeometry(w, h, w, 2, Math.ceil(h / 4), 2).translate(x, h / 2, z)); }
  const mats = ['#d9cbb0', '#a9a9a3', '#8a4a36'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
  geos.forEach((g, i) => { const m = new THREE.Mesh(mergeGeometries(g), mats[i]); m.castShadow = m.receiveShadow = !!P.schatten; scene.add(m); });
  const prop = new THREE.MeshStandardMaterial({ color: '#2f5a24' }); const pg = new THREE.IcosahedronGeometry(2, 2);
  for (let i = 0; i < Math.round(240 * P.details); i++) { const t = new THREE.Mesh(pg, prop); t.position.set((rnd() - 0.5) * 300, 4, (rnd() - 0.5) * 300); t.castShadow = !!P.schatten; scene.add(t); }
  return scene;
}

// onFortschritt(text, anteil) → Ergebnis-Objekt
export async function leistungstest(container, onFortschritt) {
  const g = geraet(); const ziel = zielFps(g); const ergebnisse = {};
  for (const [k, stufe] of STUFEN.entries()) {
    const P = PROFILE[stufe];
    container.querySelector('canvas')?.remove(); const canvas = document.createElement('canvas'); canvas.className = 'lt__canvas'; container.appendChild(canvas);
    const r = new THREE.WebGLRenderer({ canvas, antialias: P.aa, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(g.dpr, P.pr)); r.setSize(canvas.clientWidth, canvas.clientHeight, false);
    r.shadowMap.enabled = !!P.schatten; r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = szene(stufe); const cam = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.5, P.sicht);
    const zeiten = []; let calls = 0, tris = 0;
    await new Promise((fertig) => {
      const t0 = performance.now(); let last = t0;
      const frame = (now) => {
        const el = (now - t0) / 1000; const a = el * 0.25;
        cam.position.set(Math.cos(a) * 40, 6 + Math.sin(a * 0.7) * 3, Math.sin(a) * 40); cam.lookAt(Math.cos(a + 0.6) * 120, 8, Math.sin(a + 0.6) * 120);
        r.render(scene, cam); if (el > 1) { zeiten.push(now - last); calls = r.info.render.calls; tris = r.info.render.triangles; }
        last = now; onFortschritt?.(`Stufe „${P.name}“ wird gemessen …`, (k + Math.min(1, el / 5)) / STUFEN.length);
        if (el < 5) requestAnimationFrame(frame); else fertig();
      };
      requestAnimationFrame(frame);
    });
    const sortiert = [...zeiten].sort((a, b) => a - b); const mittel = zeiten.reduce((a, b) => a + b, 0) / Math.max(1, zeiten.length);
    ergebnisse[stufe] = { fps: Math.round(1000 / mittel), tief: Math.round(1000 / (sortiert[Math.floor(sortiert.length * 0.99)] || mittel)), calls, dreiecke: tris };
    scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); r.setAnimationLoop(null); r.dispose();
    await new Promise((x) => setTimeout(x, 150));
  }
  let empfehlung = 'niedrig'; for (const s of STUFEN) if (ergebnisse[s].fps >= ziel) empfehlung = s;
  return { zeit: new Date().toISOString(), geraet: g, ziel, ergebnisse, empfehlung, version: 1 };
}
