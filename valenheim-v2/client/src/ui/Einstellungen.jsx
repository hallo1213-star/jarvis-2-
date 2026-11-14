import { useState } from 'react';
import Logo from './Logo.jsx';
import { api } from '../lib/api.js';
import { PROFILE } from '../core/quality.js';

// Einstellungen werden im Konto gespeichert (alle Geräte). Ohne Konto: nur Hinweis.
export default function Einstellungen({ konto, onGespeichert }) {
  const [s, setS] = useState(konto?.spielstand.settings || { grafik: 'auto', kamera: 'verfolger', ton: true, empfindlichkeit: 1, yInvertiert: false });
  const [msg, setMsg] = useState('');
  const setze = async (patch) => {
    const neu = { ...s, ...patch }; setS(neu); setMsg('');
    if (!konto) return;
    try { await api.einstellungen(patch); setMsg('Gespeichert ✓'); onGespeichert?.(); } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="seite">
      <div className="seite__kopf"><a className="zurueck" href="#/" aria-label="Zurück">←</a><Logo small /></div>
      <div className="inhalt">
        <div><div className="eyebrow">Einstellungen</div><h1 className="h1">Grafik, Kamera, Ton</h1>
          <p className="sub">{konto ? 'Wird in deinem Konto gespeichert und gilt auf allen Geräten.' : 'Melde dich an, damit deine Einstellungen gespeichert werden.'}</p></div>
        <div className="card">
          <div className="einst"><div><span>Grafik</span><small>„Automatisch“ nutzt den Leistungstest und passt sich an.</small></div>
            <div className="seg">{['auto', 'niedrig', 'mittel', 'hoch'].map((k) => <button key={k} className={s.grafik === k ? 'an' : ''} onClick={() => setze({ grafik: k })}>{k === 'auto' ? 'Automatisch' : PROFILE[k].name}</button>)}</div></div>
          <div className="einst"><div><span>Kamera</span><small>Im Spiel jederzeit mit <b>V</b> oder 🎥 umschaltbar.</small></div>
            <div className="seg">{[['verfolger', 'Third Person'], ['ego', 'First Person']].map(([k, l]) => <button key={k} className={s.kamera === k ? 'an' : ''} onClick={() => setze({ kamera: k })}>{l}</button>)}</div></div>
          <div className="einst"><div><span>Kamera-Empfindlichkeit</span><small>{Number(s.empfindlichkeit).toFixed(1)}×</small></div>
            <input type="range" min="0.2" max="3" step="0.1" value={s.empfindlichkeit} onChange={(e) => setS({ ...s, empfindlichkeit: +e.target.value })} onPointerUp={(e) => setze({ empfindlichkeit: +e.target.value })} aria-label="Empfindlichkeit" /></div>
          <div className="einst"><div><span>Kamera umkehren (oben/unten)</span></div>
            <div className="seg">{[[false, 'Normal'], [true, 'Umgekehrt']].map(([k, l]) => <button key={l} className={s.yInvertiert === k ? 'an' : ''} onClick={() => setze({ yInvertiert: k })}>{l}</button>)}</div></div>
          <div className="einst"><div><span>Ton</span><small>Geräusche kommen ab Phase 2.</small></div>
            <div className="seg">{[[true, 'An'], [false, 'Aus']].map(([k, l]) => <button key={l} className={s.ton === k ? 'an' : ''} onClick={() => setze({ ton: k })}>{l}</button>)}</div></div>
        </div>
        {msg && <p className="sub" role="status">{msg}</p>}
      </div>
    </div>
  );
}
