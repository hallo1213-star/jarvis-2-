import { useEffect, useRef, useState } from 'react';
import { Engine, QUALITY, defaultQuality } from '../game/engine.js';
import Minimap from '../ui/Minimap.jsx';
import { Emblem } from '../ui/Logo.jsx';
import { Net, EMOTE_TEXT } from '../game/net.js';

const TIPPS = [
  'Halte Shift (PC) oder schiebe den Joystick ganz nach außen, um zu rennen.',
  'Mit Leertaste springst du – zum Beispiel auf den Bordstein.',
  'Das Militärgelände im Norden ist Sperrgebiet.',
  'Am Bahnhof im Westen fahren die Züge nach Valenheim.',
];

export default function Game({ profil, onExit }) {
  const canvas = useRef(null);
  const [engine, setEngine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tipp] = useState(() => TIPPS[Math.floor(Math.random() * TIPPS.length)]);
  const [district, setDistrict] = useState(null);
  const [toast, setToast] = useState(null);
  const [menu, setMenu] = useState(false);
  const [fps, setFps] = useState(0);
  const [quality, setQuality] = useState(defaultQuality());
  const [joy, setJoy] = useState(null);
  const [run, setRun] = useState(false);
  const [net, setNet] = useState({ status: 'verbinde', room: '', online: 0 });
  const [feed, setFeed] = useState([]);
  const [emotes, setEmotes] = useState(false);
  const netRef = useRef(null);
  const isTouch = typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);

  useEffect(() => {
    let eng; let alive = true; const t0 = performance.now();
    // Kurz warten, damit der Ladebildschirm sichtbar ist, dann Stadt aufbauen
    const id = setTimeout(() => {
      eng = new Engine(canvas.current, {
        mode: 'play', quality, player: profil,
        onDistrict: (d, info) => { setDistrict(info); setToast({ ...info, k: Date.now() }); },
        onStats: (s) => setFps(s.fps),
      });
      setEngine(eng);
      netRef.current = new Net(eng, {
        status: (st, room) => setNet((n) => ({ ...n, status: st, room: room || n.room })),
        online: (n) => setNet((x) => ({ ...x, online: n })),
        feed: (text) => setFeed((f) => [...f.slice(-3), { text, k: Date.now() + Math.random() }]),
      });
      setTimeout(() => alive && setLoading(false), Math.max(0, 1400 - (performance.now() - t0)));
    }, 60);
    return () => { alive = false; clearTimeout(id); netRef.current?.dispose(); eng?.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape → Menü
  useEffect(() => {
    const k = (e) => {
      if (e.code === 'Escape') setMenu((m) => !m);
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
      if (n >= 0 && e.target.tagName !== 'INPUT') netRef.current?.emote(Object.keys(EMOTE_TEXT)[n]);
    };
    const pl = () => { if (!document.pointerLockElement && !isTouch && engine && !loading) setMenu(true); };
    addEventListener('keydown', k); document.addEventListener('pointerlockchange', pl);
    return () => { removeEventListener('keydown', k); document.removeEventListener('pointerlockchange', pl); };
  }, [engine, loading, isTouch]);
  useEffect(() => { if (engine?.input) { engine.input.enabled = !menu; if (menu && document.pointerLockElement) document.exitPointerLock(); } }, [menu, engine]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2600); return () => clearTimeout(id); }, [toast]);
  // Joystick-Anzeige
  useEffect(() => { if (!engine?.input || !isTouch) return; let raf; const f = () => { setJoy(engine.input.joystick()); raf = requestAnimationFrame(f); }; f(); return () => cancelAnimationFrame(raf); }, [engine, isTouch]);
  useEffect(() => { if (engine?.input) engine.input.runToggle = run; }, [run, engine]);

  return (
    <div className="game">
      <canvas ref={canvas} className="game__canvas" />

      {!loading && (
        <>
          <div className="hud hud--tl">
            <div className="pcard">
              <Emblem size={34} />
              <div>
                <div className="pcard__name">{profil.name}</div>
                <div className="pcard__meta">Level {profil.level} · {profil.points} Punkte</div>
              </div>
            </div>
            {district && <div className="chip" style={{ '--c': district.farbe }}>{district.name}</div>}
          </div>
          <div className="hud hud--tr">
            <Minimap engine={engine} />
            <div className={`chip ${net.status === 'online' ? '' : 'chip--warn'}`} style={{ '--c': net.status === 'online' ? '#3cff8f' : '#e05a5a' }}>
              {net.status === 'online' ? `${net.online} online · ${net.room}` : net.status === 'doppelt' ? 'Auf anderem Gerät angemeldet' : net.status === 'gesperrt' ? 'Konto gesperrt' : 'Verbinde mit Server …'}
            </div>
          </div>
          <div className="feed">{feed.map((f) => <div key={f.k} className="feed__item">{f.text}</div>)}</div>
          {emotes && (
            <div className="emotes">
              {Object.entries(EMOTE_TEXT).map(([k, t], i) => <button key={k} onClick={() => { netRef.current?.emote(k); setEmotes(false); }}>{!isTouch && <kbd>{i + 1}</kbd>}{t}</button>)}
            </div>
          )}
          <button className="tbtn tbtn--emote" onClick={() => setEmotes(!emotes)} aria-label="Schnellnachrichten">💬</button>
          {toast && <div key={toast.k} className="toast" style={{ '--c': toast.farbe }}><small>DU BETRITTST</small>{toast.name}</div>}
          {!isTouch && !menu && <div className="hint-bar">Klicken zum Umsehen · WASD laufen · Shift rennen · Leertaste springen · Mausrad zoomen · 1–6 Nachrichten · Esc Menü</div>}
          {isTouch && (
            <>
              {joy && <div className="joy" style={{ left: joy.ox, top: joy.oy }}><div className="joy__knob" style={{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }} /></div>}
              {!joy && <div className="joy-hint">Links ziehen zum Laufen · rechts wischen zum Umsehen</div>}
              <button className={`tbtn tbtn--run ${run ? 'is-on' : ''}`} onClick={() => setRun(!run)}>RENNEN</button>
              <button className="tbtn tbtn--jump" onTouchStart={(e) => { e.preventDefault(); if (engine?.input) engine.input.jump = true; }}>SPRUNG</button>
              <button className="tbtn tbtn--menu" onClick={() => setMenu(true)} aria-label="Menü">☰</button>
            </>
          )}
          <div className="fps">{fps} FPS</div>
        </>
      )}

      {menu && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div className="card menu">
            <div className="eyebrow">MENÜ</div>
            <button className="btn btn--gold" onClick={() => setMenu(false)}>WEITERSPIELEN</button>
            <div className="menu__row">
              <span>Grafik</span>
              <div className="seg">
                {Object.keys(QUALITY).map((q) => <button key={q} className={q === quality ? 'is-on' : ''} onClick={() => { setQuality(q); engine?.setQuality(q); }}>{q[0].toUpperCase() + q.slice(1)}</button>)}
              </div>
            </div>
            <a className="btn btn--ghost" href="#/rangliste">Rangliste</a>
            <a className="btn btn--ghost" href="#/profil">Mein Profil</a>
            <button className="btn btn--ghost" onClick={onExit}>Stadt verlassen</button>
          </div>
        </div>
      )}

      {loading && (
        <div className="loader">
          <Emblem size={120} />
          <div className="loader__title">VALENHEIM WIRD GELADEN</div>
          <div className="loader__bar"><div /></div>
          <div className="loader__tip">{tipp}</div>
        </div>
      )}
    </div>
  );
}
