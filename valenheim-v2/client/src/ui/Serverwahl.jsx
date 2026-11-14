import { useEffect, useState } from 'react';
import Logo from './Logo.jsx';
import { api, raumWahl } from '../lib/api.js';
import { geh } from './App.jsx';

// Phase 4: öffentliche Server (je 12 Spieler) · privaten Server erstellen · mit Code beitreten
export default function Serverwahl({ konto }) {
  const [liste, setListe] = useState(null); const [fehler, setFehler] = useState('');
  const [name, setName] = useState(konto ? `${konto.profil.name}s Server` : ''); const [code, setCode] = useState(''); const [privat, setPrivat] = useState(null);
  const laden = () => api.server().then((d) => setListe(d.server)).catch((e) => setFehler(e.message));
  useEffect(() => { laden(); const id = setInterval(laden, 5000); return () => clearInterval(id); }, []);
  const los = (w) => { raumWahl.setze(w); geh('spielen'); };
  const erstellen = async () => { setFehler(''); try { setPrivat(await api.privatServer(name)); } catch (e) { setFehler(e.message); } };
  return (
    <div className="seite">
      <div className="seite__kopf"><a className="zurueck" href="#/" aria-label="Zurück">←</a><Logo small /></div>
      <div className="inhalt stack" style={{ maxWidth: 560 }}>
        <div className="card stack">
          <div className="eyebrow">Öffentliche Server · je 12 Spieler</div>
          <button className="btn btn--gold" onClick={() => los({})}>SCHNELL BEITRETEN</button>
          <div className="serverliste">
            {liste === null ? <div className="spinner" /> : liste.map((s) => (
              <div key={s.id} className="server"><b>{s.name}</b><div className="balken"><div style={{ width: `${(s.spieler / s.max) * 100}%` }} /></div><small>{s.spieler}/{s.max}</small>
                <button className="btn btn--ghost" style={{ width: 'auto', padding: '8px 14px' }} disabled={s.spieler >= s.max} onClick={() => los({ raum: s.id })}>{s.spieler >= s.max ? 'VOLL' : 'BEITRETEN'}</button></div>
            ))}
          </div>
          <p className="hinweis">Sind alle Server voll, wird automatisch ein neuer geöffnet.</p>
        </div>
        <div className="card stack">
          <div className="eyebrow">Privater Server</div>
          {!konto ? <p className="sub">Melde dich an, um einen privaten Server zu erstellen.</p> : privat ? (<>
            <p className="sub">{privat.vorhanden ? 'Du hast schon einen privaten Server:' : 'Dein privater Server ist bereit:'} <b style={{ color: '#fff' }}>{privat.name}</b>. Schick deinen Freunden diesen Code:</p>
            <div className="codebox">{privat.code}</div>
            <button className="btn btn--gold" onClick={() => los({ code: privat.code })}>JETZT BETRETEN</button>
            <p className="hinweis">Nur wer den Code hat, kann rein (max. 12). Der Server schließt 10 Minuten, nachdem der Letzte gegangen ist.</p>
          </>) : (<>
            <div className="feld"><label htmlFor="sn">Name des Servers</label><input id="sn" className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} /></div>
            <button className="btn btn--ghost" onClick={erstellen}>PRIVATEN SERVER ERSTELLEN</button>
          </>)}
          <div className="feld"><label htmlFor="code">Code von einem Freund</label><input id="code" className="input code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="z. B. K7Q2MX" autoCapitalize="characters" spellCheck="false" /></div>
          <button className="btn btn--ghost" disabled={code.length !== 6} onClick={() => los({ code })}>MIT CODE BEITRETEN</button>
        </div>
        {fehler && <div className="fehler" role="alert">{fehler}</div>}
      </div>
    </div>
  );
}
