import { useEffect, useState } from 'react';
import Logo, { Emblem } from '../ui/Logo.jsx';
import { api } from '../lib/api.js';
import { LOOK } from '../game/character.js';

const zeit = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)} min`);
const datum = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Bürgerprofil: eigenes (#/profil) oder öffentlich (#/profil/Name)
export default function Profil({ name }) {
  const [p, setP] = useState(null); const [fehler, setFehler] = useState('');
  useEffect(() => {
    setP(null); setFehler('');
    (name ? api.profil(name) : api.me()).then((d) => setP(d.profil)).catch((e) => setFehler(e.status === 401 ? 'Du bist noch nicht angemeldet. Betritt zuerst die Stadt.' : e.message));
  }, [name]);
  const next = p ? 125 * (p.level + 1) * p.level : 0, prev = p ? 125 * p.level * (p.level - 1) : 0;
  const pct = p ? Math.min(100, ((p.points - prev) / Math.max(1, next - prev)) * 100) : 0;
  return (
    <div className="page">
      <div className="page__head"><a href="#/" className="back">←</a><Logo small /></div>
      <div className="wrap">
        {fehler && <div className="card"><div className="error">{fehler}</div><a className="btn btn--gold" href="#/">Zur Startseite</a></div>}
        {!p && !fehler && <div className="spinner" />}
        {p && (
          <>
            <div className="card profile">
              <div className="avatar" style={{ background: LOOK.jacke[p.look?.jacke ?? 0] }}><Emblem size={46} /></div>
              <div className="profile__main">
                <div className="eyebrow">BÜRGERPROFIL{p.eigenes || !name ? ' · DU' : ''}</div>
                <h1 className="h1 h1--tight">{p.name}</h1>
                <div className="sub">Bürger seit {datum(p.created_at)}{p.gesperrt ? ' · gesperrt' : ''}</div>
              </div>
            </div>
            <div className="stats">
              <div className="stat"><small>RANG</small><b>{p.rang ? `#${p.rang}` : '–'}</b></div>
              <div className="stat"><small>PUNKTE</small><b>{p.points.toLocaleString('de-DE')}</b></div>
              <div className="stat"><small>LEVEL</small><b>{p.level}</b></div>
              <div className="stat"><small>MISSIONEN</small><b>{p.missions}</b></div>
              <div className="stat"><small>SPIELZEIT</small><b>{zeit(p.playtime_s)}</b></div>
            </div>
            <div className="card">
              <div className="row-between"><span className="eyebrow">FORTSCHRITT ZU LEVEL {p.level + 1}</span><span className="sub">{p.points} / {next}</span></div>
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
            </div>
            <div className="card">
              <div className="eyebrow">ERFOLGE ({p.erfolge.filter((e) => e.erreicht).length}/{p.erfolge.length})</div>
              <div className="badges">
                {p.erfolge.map((e) => <div key={e.id} className={`badge ${e.erreicht ? 'is-on' : ''}`} title={e.text}><span>{e.icon}</span><b>{e.titel}</b><small>{e.text}</small></div>)}
              </div>
            </div>
            <div className="card">
              <div className="eyebrow">LETZTE MISSIONEN</div>
              {p.letzte.length === 0 ? <p className="sub">Noch keine Mission erledigt.</p> : (
                <div className="list">{p.letzte.map((m, i) => <div key={i} className="list__row"><span>{m.titel}</span><span className="sub">{datum(m.at)}</span><b>+{m.punkte}</b></div>)}</div>
              )}
            </div>
            {(p.eigenes || !name) && <a className="btn btn--gold" href="#/spiel">STADT BETRETEN</a>}
          </>
        )}
      </div>
    </div>
  );
}
