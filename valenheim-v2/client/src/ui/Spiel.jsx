import { useEffect, useRef, useState } from 'react';
import { Emblem } from './Logo.jsx';
import { PROFILE } from '../core/quality.js';
import { api } from '../lib/api.js';

// Spielansicht Phase 1: Testgelände, HUD, Pausenmenü, Touch-Bedienung
export default function Spiel({ konto, onEnde }) {
  const canvas = useRef(null); const gameRef = useRef(null);
  const [laedt, setLaedt] = useState(true); const [fehler, setFehler] = useState('');
  const [st, setSt] = useState({ fps: 0, netz: 'verbinde', online: 0, stufe: null, kamera: konto.spielstand.settings.kamera });
  const [menue, setMenue] = useState(false); const [hinweis, setHinweis] = useState(null);
  const [joy, setJoy] = useState(null); const [ladung, setLadung] = useState({ text: 'Physik wird vorbereitet …', anteil: 0.1 }); const [rennen, setRennen] = useState(false);
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;

  useEffect(() => {
    let tot = false;
    import('../core/game.js').then(async ({ Game }) => {
      if (tot) return;
      const g = await Game.erstelle(canvas.current, { konto, onStatus: (s) => setSt((a) => ({ ...a, ...s })), onHinweis: (text) => setHinweis({ text, k: Date.now() }), onFortschritt: (text, anteil) => setLadung({ text, anteil }) });
      if (tot) { g.beenden(); return; } gameRef.current = g; setSt((a) => ({ ...a, stufe: g.stufe })); setLaedt(false);
    }).catch((e) => { console.error(e); setFehler('Das Spiel konnte nicht starten: ' + e.message); });
    return () => { tot = true; gameRef.current?.beenden(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!hinweis) return; const id = setTimeout(() => setHinweis(null), 4000); return () => clearTimeout(id); }, [hinweis]);
  useEffect(() => { const k = (e) => { if (e.code === 'Escape') setMenue((m) => !m); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  useEffect(() => { const g = gameRef.current; if (!g) return; g.input.enabled = !menue; if (menue && document.pointerLockElement) document.exitPointerLock(); }, [menue, laedt]);
  useEffect(() => { if (!touch || laedt) return; let raf; const f = () => { setJoy(gameRef.current?.input.joystick() || null); raf = requestAnimationFrame(f); }; f(); return () => cancelAnimationFrame(raf); }, [touch, laedt]);
  useEffect(() => { if (gameRef.current) gameRef.current.input.runToggle = rennen; }, [rennen]);

  const kamera = () => { const m = gameRef.current?.wechsleKamera(); if (m) api.einstellungen({ kamera: m }).catch(() => {}); };
  const stufe = (s) => { const g = gameRef.current; if (!g) return; g.settings.grafik = s; g.setzeStufe(s === 'auto' ? g.stufe : s); api.einstellungen({ grafik: s }).catch(() => {}); setSt((a) => ({ ...a, grafikWahl: s })); };
  const grafikWahl = st.grafikWahl || konto.spielstand.settings.grafik;

  return (
    <div className="spiel">
      <canvas ref={canvas} />
      {!laedt && (<>
        <div className="hud hud--lo">
          <div className="chip chip--name"><Emblem size={28} /> {konto.profil.name}</div>
          <div className="chip"><small>{gameRef.current?.welt === 'test' ? 'Testgelände' : 'Republik Valenheim'}</small></div>
        </div>
        <div className="hud hud--ro" style={{ top: 'calc(120px + var(--st))' }}>
          <div className="chip" style={{ '--c': st.netz === 'online' ? '#3cff8f' : '#ff6b6b' }}><span className="badge" style={{ border: 0, background: 'none', padding: 0, '--c': st.netz === 'online' ? '#3cff8f' : '#ffb347' }}>{st.netz === 'online' ? 'Gespeichert · online' : st.netz === 'getrennt' ? 'Verbindung weg …' : 'Verbinde …'}</span></div>
          {st.uhr !== undefined && <div className="chip">{String(Math.floor(st.uhr)).padStart(2, '0')}:{String(Math.floor((st.uhr % 1) * 60)).padStart(2, '0')} <small>{st.wetter}</small></div>}
          <div className="chip"><small>{PROFILE[st.stufe]?.name} · {st.fps} FPS</small></div>
        </div>
        <button className="knopf knopf--menue" onClick={() => setMenue(true)} aria-label="Menü">☰</button>
        <button className="knopf knopf--kamera" style={{ fontSize: 13 }} onClick={kamera} aria-label="Kamera wechseln" title="Kamera (V)">{st.kamera === 'ego' ? '1P' : '3P'}</button>
        {!touch && !menue && <div className="hilfe">Klick zum Umsehen · <kbd>W A S D</kbd> laufen · <kbd>Shift</kbd> rennen · <kbd>Leertaste</kbd> springen · <kbd>V</kbd> Kamera · <kbd>Esc</kbd> Menü</div>}
        {touch && (<>
          {joy && <div className="joy" style={{ left: joy.ox, top: joy.oy }}><div style={{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }} /></div>}
          <button className={`knopf knopf--rennen ${rennen ? 'an' : ''}`} onClick={() => setRennen(!rennen)}>RENNEN</button>
          <button className="knopf knopf--sprung" onTouchStart={(e) => { e.preventDefault(); if (gameRef.current) gameRef.current.input.jump = true; }}>SPRUNG</button>
        </>)}
        {hinweis && <div key={hinweis.k} className="toast">{hinweis.text}</div>}
      </>)}

      {menue && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setMenue(false)}>
          <div className="card stack" style={{ width: 'min(420px, 100%)' }}>
            <div className="eyebrow">Pause</div>
            <button className="btn btn--gold" onClick={() => setMenue(false)}>WEITERSPIELEN</button>
            <div className="einst"><div><span>Grafik</span><small>Jetzt: {PROFILE[st.stufe]?.name}</small></div>
              <div className="seg">{['auto', 'niedrig', 'mittel', 'hoch'].map((k) => <button key={k} className={grafikWahl === k ? 'an' : ''} onClick={() => stufe(k)}>{k === 'auto' ? 'Auto' : PROFILE[k].name}</button>)}</div></div>
            <div className="einst"><div><span>Kamera</span></div>
              <div className="seg">{[['verfolger', 'Third Person'], ['ego', 'First Person']].map(([k, l]) => <button key={k} className={st.kamera === k ? 'an' : ''} onClick={() => st.kamera !== k && kamera()}>{l}</button>)}</div></div>
            <button className="btn btn--ghost" onClick={onEnde}>ZUM HAUPTMENÜ</button>
            <p className="hinweis">Deine Position wird automatisch gespeichert (alle 30 Sekunden und beim Verlassen).</p>
          </div>
        </div>
      )}

      {laedt && (
        <div className="lader">
          <Emblem size={110} />
          <div className="lader__titel">VALENHEIM WIRD GELADEN</div>
          {fehler ? <div className="fehler">{fehler}</div> : <><div className="balken"><div style={{ width: `${Math.round(ladung.anteil * 100)}%` }} /></div><div className="lader__text">{ladung.text}</div></>}
          {fehler && <a className="btn btn--ghost" style={{ width: 'auto' }} href="#/">Zurück</a>}
        </div>
      )}
    </div>
  );
}
