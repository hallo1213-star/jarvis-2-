import { useEffect, useRef, useState } from 'react';
import { Emblem } from './Logo.jsx';
import { PROFILE } from '../core/quality.js';
import { api, raumWahl } from '../lib/api.js';

// Spielansicht Phase 1: Testgelände, HUD, Pausenmenü, Touch-Bedienung
export default function Spiel({ konto, onEnde }) {
  const canvas = useRef(null); const gameRef = useRef(null);
  const [laedt, setLaedt] = useState(true); const [fehler, setFehler] = useState('');
  const [st, setSt] = useState({ fps: 0, netz: 'verbinde', online: 0, stufe: null, kamera: konto.spielstand.settings.kamera });
  const [menue, setMenue] = useState(false); const [hinweis, setHinweis] = useState(null);
  const [joy, setJoy] = useState(null); const [ladung, setLadung] = useState({ text: 'Physik wird vorbereitet …', anteil: 0.1 }); const [rennen, setRennen] = useState(false);
  const [chat, setChat] = useState([]); const [chatOffen, setChatOffen] = useState(false); const [eingabe, setEingabe] = useState(''); const [liste, setListe] = useState(false); const [abgelehnt, setAbgelehnt] = useState(null);
  const chatRef = useRef(null);
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;

  useEffect(() => {
    let tot = false;
    import('../core/game.js').then(async ({ Game }) => {
      if (tot) return;
      const g = await Game.erstelle(canvas.current, { konto, raumWunsch: raumWahl.hole(), onChat: (m) => setChat((c) => [...c.slice(-39), { ...m, k: Date.now() + Math.random() }]), onAbgelehnt: (grund) => setAbgelehnt(grund), onStatus: (s) => setSt((a) => ({ ...a, ...s })), onHinweis: (text) => setHinweis({ text, k: Date.now() }), onFortschritt: (text, anteil) => setLadung({ text, anteil }) });
      if (tot) { g.beenden(); return; } gameRef.current = g; setSt((a) => ({ ...a, stufe: g.stufe })); setLaedt(false);
    }).catch((e) => { console.error(e); setFehler('Das Spiel konnte nicht starten: ' + e.message); });
    return () => { tot = true; gameRef.current?.beenden(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!hinweis) return; const id = setTimeout(() => setHinweis(null), 4000); return () => clearTimeout(id); }, [hinweis]);
  useEffect(() => {
    const k = (e) => {
      if (chatOffen) { if (e.code === 'Escape') setChatOffen(false); return; }
      if (e.code === 'Escape') setMenue((m) => !m);
      else if (!menue && !laedt && (e.code === 'KeyT' || e.code === 'Enter')) { e.preventDefault(); setChatOffen(true); }
      else if (e.code === 'Tab') { e.preventDefault(); setListe((l) => !l); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [chatOffen, menue, laedt]);
  useEffect(() => { const g = gameRef.current; if (!g) return; g.input.enabled = !menue && !chatOffen; if ((menue || chatOffen) && document.pointerLockElement) document.exitPointerLock(); if (chatOffen) setTimeout(() => chatRef.current?.focus(), 0); }, [menue, laedt, chatOffen]);
  const [, tick] = useState(0); useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 2000); return () => clearInterval(id); }, []);
  const senden = (e) => { e.preventDefault(); gameRef.current?.chat(eingabe); setEingabe(''); setChatOffen(false); };
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
          <button className="chip chip--knopf" onClick={() => setListe(!liste)} title="Spielerliste (Tab)">👥 {st.spieler?.length || 1}/{st.raum?.max || 12} <small>{st.raum ? st.raum.name : 'Verbinde …'}{st.raum?.privat ? ' · privat' : ''}</small></button>
        </div>
        {liste && <div className="spielerliste card"><div className="eyebrow">{st.raum?.name}{st.raum?.privat && <> · Code <b className="code">{st.raum.code}</b></>}</div>
          {(st.spieler || []).map((p) => <div key={p.id} className="spielerliste__p">{p.name}{p.du && <small> (du)</small>}</div>)}</div>}
        <div className={`chat ${chatOffen ? 'chat--offen' : ''}`}>
          <div className="chat__verlauf">{chat.filter((m) => chatOffen || Date.now() - m.k < 12000).slice(-8).map((m) => <div key={m.k} className={`chat__z ${m.system ? 'chat__z--sys' : ''}`}>{m.system ? m.text : <><b>{m.von}:</b> {m.text}</>}</div>)}</div>
          {chatOffen && <form onSubmit={senden} className="chat__form"><input ref={chatRef} className="input" value={eingabe} maxLength={140} onChange={(e) => setEingabe(e.target.value)} onBlur={() => !eingabe && setChatOffen(false)} placeholder="Nachricht an alle im Server …" enterKeyHint="send" /></form>}
        </div>
        <div className="hud hud--ro" style={{ top: 'calc(120px + var(--st))' }}>
          <div className="chip" style={{ '--c': st.netz === 'online' ? '#3cff8f' : '#ff6b6b' }}><span className="badge" style={{ border: 0, background: 'none', padding: 0, '--c': st.netz === 'online' ? '#3cff8f' : '#ffb347' }}>{st.netz === 'online' ? 'Gespeichert · online' : st.netz === 'getrennt' ? 'Verbindung weg …' : 'Verbinde …'}</span></div>
          {st.uhr !== undefined && <div className="chip">{String(Math.floor(st.uhr)).padStart(2, '0')}:{String(Math.floor((st.uhr % 1) * 60)).padStart(2, '0')} <small>{st.wetter}</small></div>}
          <div className="chip"><small>{PROFILE[st.stufe]?.name} · {st.fps} FPS</small></div>
        </div>
        <button className="knopf knopf--menue" onClick={() => setMenue(true)} aria-label="Menü">☰</button>
        <button className="knopf knopf--kamera" style={{ fontSize: 13 }} onClick={kamera} aria-label="Kamera wechseln" title="Kamera (V)">{st.kamera === 'ego' ? '1P' : '3P'}</button>
        {!touch && !menue && <div className="hilfe">Klick zum Umsehen · <kbd>W A S D</kbd> laufen · <kbd>Shift</kbd> rennen · <kbd>Leertaste</kbd> springen · <kbd>V</kbd> Kamera · <kbd>T</kbd> Chat · <kbd>Tab</kbd> Spieler · <kbd>Esc</kbd> Menü</div>}
        {touch && (<>
          {joy && <div className="joy" style={{ left: joy.ox, top: joy.oy }}><div style={{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }} /></div>}
          <button className="knopf knopf--chat" onClick={() => setChatOffen(true)} aria-label="Chat">💬</button>
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
            {st.raum && <div className="einst"><div><span>Server</span><small>{st.raum.name} · {st.spieler?.length || 1}/{st.raum.max} Spieler</small></div>
              {st.raum.privat && <div><small>Code für Freunde:</small> <b className="code">{st.raum.code}</b></div>}</div>}
            <a className="btn btn--ghost" href="#/server">SERVER WECHSELN</a>
            <button className="btn btn--ghost" onClick={onEnde}>ZUM HAUPTMENÜ</button>
            <p className="hinweis">Deine Position wird automatisch gespeichert (alle 30 Sekunden und beim Verlassen).</p>
          </div>
        </div>
      )}

      {abgelehnt && (
        <div className="overlay"><div className="card stack" style={{ width: 'min(420px, 100%)' }}>
          <div className="eyebrow">Beitreten nicht möglich</div><p className="sub">{abgelehnt}</p>
          <a className="btn btn--gold" href="#/server" onClick={() => raumWahl.setze({})}>ANDEREN SERVER WÄHLEN</a>
        </div></div>
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
