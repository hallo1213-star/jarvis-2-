import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Logo from './Logo.jsx';
import { api } from '../lib/api.js';
import { AUSWAHL, NAMEN, REGLER, HAUT, HAARFARBEN, STOFF, STANDARD, zufall } from '../spieler/mensch.js';
import { Mensch3D, ladeFiguren } from '../spieler/figur3d.js';

// 3D-Vorschau: drehbar per Ziehen, Zoom auf Gesicht bei Gesichts-Reitern
function Vorschau({ look, naheGesicht }) {
  const box = useRef(null); const ref = useRef({});
  useEffect(() => {
    const el = box.current; const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; el.appendChild(r.domElement);
    const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3028', 1.1)); const key = new THREE.DirectionalLight('#fff2e0', 2.4); key.position.set(2, 3, 3); key.castShadow = true; scene.add(key);
    const rim = new THREE.DirectionalLight('#9fc0ff', 1.4); rim.position.set(-3, 2, -2); scene.add(rim);
    const boden = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#141c33', roughness: 0.6 })); boden.receiveShadow = true; scene.add(boden);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.12, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d4af37' })); ring.position.y = 0.002; scene.add(ring);
    const s = ref.current; Object.assign(s, { r, scene, cam, m: null, dreh: 0.4, ziel: 0.4, zoom: 0 });
    ladeFiguren().then(() => { if (s.weg) return; s.m = new Mensch3D(s.look || look); scene.add(s.m.root); });
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }; resize(); addEventListener('resize', resize);
    let drag = null; const down = (e) => { drag = e.clientX; }; const move = (e) => { if (drag !== null) { s.ziel += (e.clientX - drag) * 0.01; drag = e.clientX; } }; const up = () => { drag = null; };
    el.addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up);
    let raf; const loop = () => {
      s.dreh += (s.ziel - s.dreh) * 0.15; if (s.m) { s.m.root.rotation.y = s.dreh; s.m.animate(1 / 60, 0); } s.zoom += ((s.nahe ? 1 : 0) - s.zoom) * 0.12;
      const y = THREE.MathUtils.lerp(1.0, 1.72, s.zoom), d = THREE.MathUtils.lerp(4.6, 1.25, s.zoom); cam.position.set(0, y + 0.08, d); cam.lookAt(0, y, 0);
      r.render(scene, cam); raf = requestAnimationFrame(loop);
    }; loop();
    return () => { s.weg = true; s.m?.dispose(); cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('pointermove', move); removeEventListener('pointerup', up); r.dispose(); el.removeChild(r.domElement); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ref.current.look = look; ref.current.m?.setzeAussehen(look); }, [look]);
  useEffect(() => { ref.current.nahe = naheGesicht; }, [naheGesicht]);
  return <div ref={box} className="cv" aria-label="3D-Vorschau, zum Drehen ziehen" />;
}

const Farben = ({ liste, wert, onWahl, label }) => (
  <div className="cfeld"><span>{label}</span><div className="farben">{liste.map((c, i) => <button key={c + i} className={`farbe ${wert === i ? 'an' : ''}`} style={{ background: c }} onClick={() => onWahl(i)} aria-label={`${label} ${i + 1}`} />)}</div></div>
);
const Wahl = ({ feld, wert, onWahl, label, filter }) => (
  <div className="cfeld"><span>{label}</span><div className="seg">{AUSWAHL[feld].filter(filter || (() => true)).map((k) => <button key={k} className={wert === k ? 'an' : ''} onClick={() => onWahl(k)}>{NAMEN[feld][k]}</button>)}</div></div>
);
const Regler = ({ feld, wert, onWahl, label }) => (
  <div className="cfeld"><span>{label}</span><input type="range" min={REGLER[feld][0]} max={REGLER[feld][1]} step="0.01" value={wert} onChange={(e) => onWahl(+e.target.value)} aria-label={label} /></div>
);

export default function Charakter({ konto, onGespeichert }) {
  const start = konto?.spielstand.charakter?.aussehen;
  const [look, setLook] = useState(() => ({ ...STANDARD, ...(start || zufall()) }));
  const [outfits, setOutfits] = useState(konto?.spielstand.charakter?.outfits || []);
  const [tab, setTab] = useState('koerper'); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setLook((l) => ({ ...l, [k]: v }));
  const KLEIDUNG = ['oberteil', 'oberteilFarbe', 'hose', 'hoseFarbe', 'schuhe', 'schuheFarbe', 'muetze', 'muetzeFarbe', 'brille', 'kette', 'uhr'];
  async function speichern(weiter) {
    if (!konto) return setMsg('Bitte zuerst anmelden.'); setBusy(true); setMsg('');
    try { await api.charakter({ aussehen: look, outfits }); setMsg('Gespeichert ✓'); await onGespeichert?.(); if (weiter) location.hash = '/spielen'; }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  const tabs = [['koerper', 'Körper'], ['haare', 'Haare'], ['kleidung', 'Kleidung'], ['outfits', 'Outfits']];
  return (
    <div className="seite seite--editor">
      <div className="seite__kopf"><a className="zurueck" href="#/" aria-label="Zurück">←</a><Logo small /></div>
      <div className="editor">
        <div className="editor__vorschau"><Vorschau look={look} naheGesicht={tab === 'haare'} />
          <div className="row" style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}><button className="btn btn--ghost" onClick={() => setLook(zufall())}>🎲 ZUFALL</button></div>
        </div>
        <div className="card editor__panel">
          <div className="eyebrow">Charakter-Editor</div>
          <div className="tabs tabs--wrap">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'an' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
          <div className="editor__felder">
            {tab === 'koerper' && <><Wahl feld="koerper" label="Körper" wert={look.koerper} onWahl={set('koerper')} /><Farben label="Hautton" liste={HAUT} wert={look.haut} onWahl={set('haut')} /><Regler feld="groesse" label="Größe" wert={look.groesse} onWahl={set('groesse')} /><Regler feld="statur" label="Statur" wert={look.statur} onWahl={set('statur')} /></>}
            {tab === 'haare' && <Farben label="Haarfarbe" liste={HAARFARBEN} wert={look.haarfarbe} onWahl={set('haarfarbe')} />}
            {tab === 'kleidung' && <><Farben label="Farbe Oberteil" liste={STOFF} wert={look.oberteilFarbe} onWahl={set('oberteilFarbe')} /><Farben label="Farbe Hose" liste={STOFF} wert={look.hoseFarbe} onWahl={set('hoseFarbe')} /><Farben label="Farbe Schuhe" liste={STOFF} wert={look.schuheFarbe} onWahl={set('schuheFarbe')} /></>}
            {tab === 'outfits' && <div className="stack">
              <p className="sub">Speichere bis zu 3 Outfits (nur Kleidung und Accessoires) und wechsle sie mit einem Klick.</p>
              {outfits.map((o, i) => <div key={i} className="row outfit"><b style={{ flex: 1 }}>{o.name}</b><button className="btn btn--ghost" style={{ width: 'auto' }} onClick={() => setLook((l) => ({ ...l, ...Object.fromEntries(KLEIDUNG.filter((k) => k in o).map((k) => [k, o[k]])) }))}>ANZIEHEN</button><button className="link" onClick={() => setOutfits(outfits.filter((_, j) => j !== i))}>Löschen</button></div>)}
              {outfits.length < 3 && <button className="btn btn--ghost" onClick={() => setOutfits([...outfits, { name: `Outfit ${outfits.length + 1}`, ...Object.fromEntries(KLEIDUNG.map((k) => [k, look[k]])) }])}>+ AKTUELLE KLEIDUNG ALS OUTFIT</button>}
            </div>}
          </div>
          {msg && <p className="sub" role="status">{msg}</p>}
          <div className="row"><button className="btn btn--ghost" disabled={busy} onClick={() => speichern(false)}>SPEICHERN</button><button className="btn btn--gold" disabled={busy} onClick={() => speichern(true)}>SPEICHERN &amp; SPIELEN</button></div>
        </div>
      </div>
    </div>
  );
}
