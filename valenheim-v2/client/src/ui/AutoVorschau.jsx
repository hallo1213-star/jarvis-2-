import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { baueAuto, entsorge, ladeAutos } from '../fahrzeuge/modelle.js';

// Kleine 3D-Vorschau eines Autos (dreht sich, per Ziehen drehbar)
export default function AutoVorschau({ look, hoehe = 200 }) {
  const box = useRef(null); const s = useRef({});
  useEffect(() => {
    const el = box.current; const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; el.appendChild(r.domElement);
    const scene = new THREE.Scene(); { const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.8; pm.dispose(); } const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    scene.add(new THREE.HemisphereLight('#e8f0ff', '#2a2420', 1.3)); const k = new THREE.DirectionalLight('#fff', 2.6); k.position.set(4, 6, 5); scene.add(k); const rim = new THREE.DirectionalLight('#9fc0ff', 1.6); rim.position.set(-5, 3, -4); scene.add(rim);
    const boden = new THREE.Mesh(new THREE.CircleGeometry(3.6, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#141c33', roughness: 0.5 })); scene.add(boden);
    Object.assign(s.current, { r, scene, cam, dreh: 0.7, auto: null });
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }; resize(); const ro = new ResizeObserver(resize); ro.observe(el);
    let drag = null; const down = (e) => { drag = e.clientX; }; const move = (e) => { if (drag !== null) { s.current.dreh += (e.clientX - drag) * 0.01; drag = e.clientX; } }; const up = () => { drag = null; };
    el.addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up);
    let raf; const loop = () => { const a = s.current.auto; if (a) { if (drag === null) s.current.dreh += 0.006; a.rotation.y = s.current.dreh; const L = a.userData.T.L; cam.position.set(0, 1.6 + L * 0.12, L * 1.45); cam.lookAt(0, 0.6, 0); } r.render(scene, cam); raf = requestAnimationFrame(loop); }; loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('pointermove', move); removeEventListener('pointerup', up); r.dispose(); el.removeChild(r.domElement); };
  }, []);
  useEffect(() => { let weg = false; ladeAutos().then(() => { const st = s.current; if (weg || !st.scene || !look) return; if (st.auto) { st.scene.remove(st.auto); entsorge(st.auto); } st.auto = baueAuto(look); st.scene.add(st.auto); }); return () => { weg = true; }; }, [JSON.stringify(look)]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={box} style={{ height: hoehe, width: '100%', cursor: 'grab', touchAction: 'none' }} aria-label="3D-Vorschau des Autos" />;
}
