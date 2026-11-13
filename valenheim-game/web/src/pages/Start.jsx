import { useEffect, useRef, useState } from 'react';
import Logo from '../ui/Logo.jsx';
import { Engine } from '../game/engine.js';
import { LOOK } from '../game/character.js';
import { api, setToken } from '../lib/api.js';
import { DEMO } from '../demo/local.js';

// Startseite: cinematischer Flug über Valenheim, Name eingeben, Stadt betreten.
export default function Start({ profil, checking, onLogin, onLogout }) {
  const canvas = useRef(null);
  const [name, setName] = useState('');
  const [jacke, setJacke] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let eng;
    try { eng = new Engine(canvas.current, { mode: 'cinematic', quality: 'mittel' }); } catch (e) { console.warn('3D nicht verfügbar', e); }
    api.status().then(setStatus).catch(() => setStatus(null));
    return () => eng?.dispose();
  }, []);

  async function enter(e) {
    e.preventDefault(); setFehler(''); setBusy(true);
    try { const d = await api.register(name.trim(), { jacke, hose: 0, haut: 1, haare: 0 }); setToken(d.token); onLogin(d.profil); }
    catch (err) { setFehler(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="start">
      <canvas ref={canvas} className="start__bg" />
      <div className="start__shade" />
      <div className="start__content">
        <Logo />
        {DEMO && <div className="chip" style={{ '--c': '#d4af37' }}>DEMO-VERSION · Einzelspieler · Punkte nur auf diesem Gerät</div>}
        <p className="start__lead">Valenheim steht vor ungewissen Tagen. Betritt die Stadt, hilf den Menschen – und werde zur Nummer&nbsp;1.</p>
        {checking ? <div className="card start__card"><div className="spinner" /></div> : profil ? (
          <div className="card start__card">
            <div className="eyebrow">WILLKOMMEN ZURÜCK</div>
            <div className="start__name">{profil.name}</div>
            <div className="start__meta">Level {profil.level} · {profil.points} Punkte</div>
            <a className="btn btn--gold" href="#/spiel">STADT BETRETEN</a>
            <button className="link" onClick={() => { if (confirm('Abmelden? Ohne gesicherten Zugang kannst du dieses Konto danach NICHT wiederherstellen.')) onLogout(); }}>Abmelden</button>
          </div>
        ) : (
          <form className="card start__card" onSubmit={enter}>
            <label className="eyebrow" htmlFor="name">DEIN SPIELERNAME</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="z. B. Mohammed" autoComplete="nickname" autoCapitalize="off" spellCheck="false" />
            <div className="eyebrow eyebrow--small">FARBE DEINER JACKE</div>
            <div className="swatches">
              {LOOK.jacke.slice(0, 8).map((c, i) => <button type="button" key={c} className={`swatch ${i === jacke ? 'is-on' : ''}`} style={{ background: c }} onClick={() => setJacke(i)} aria-label={`Farbe ${i + 1}`} />)}
            </div>
            {fehler && <div className="error">{fehler}</div>}
            <button className="btn btn--gold" disabled={busy || name.trim().length < 3}>{busy ? 'BITTE WARTEN …' : 'STADT BETRETEN'}</button>
            <p className="hint">Dein Name ist öffentlich sichtbar und gehört nur dir. Dein Konto wird auf diesem Gerät gespeichert.</p>
          </form>
        )}
        <div className="start__foot">
          {status ? <span>{status.buerger} Bürger registriert</span> : <span>Server wird verbunden …</span>}
          <span className="dot" />
          <a href="#/rangliste">Rangliste</a>
          {profil && <><span className="dot" /><a href="#/profil">Mein Profil</a></>}
        </div>
      </div>
    </div>
  );
}
