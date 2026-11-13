import { useEffect, useState } from 'react';
import Logo from '../ui/Logo.jsx';
import { api } from '../lib/api.js';

// Öffentliche Rangliste (Top 100), aktualisiert sich alle 10 Sekunden.
export default function Rangliste({ meinName }) {
  const [data, setData] = useState(null); const [fehler, setFehler] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () => api.rangliste().then((d) => { if (alive) { setData(d); setFehler(''); } }).catch((e) => alive && setFehler(e.message));
    load(); const id = setInterval(load, 10000); return () => { alive = false; clearInterval(id); };
  }, []);
  const top = data?.liste.slice(0, 3) || []; const rest = data?.liste.slice(3) || [];
  const order = [top[1], top[0], top[2]];
  return (
    <div className="page">
      <div className="page__head"><a href="#/" className="back">←</a><Logo small /></div>
      <div className="wrap">
        <div className="eyebrow">ÖFFENTLICHE RANGLISTE</div>
        <h1 className="h1">Die besten Bürger von Valenheim</h1>
        <p className="sub">{data ? `${data.buerger} Bürger · aktualisiert sich automatisch` : 'Wird geladen …'}</p>
        {fehler && <div className="error">{fehler}</div>}
        {data && data.liste.length === 0 && <div className="card">Noch keine Einträge – erledige die erste Mission!</div>}
        {top.length > 0 && (
          <div className="podium">
            {order.map((p, i) => p && (
              <a key={p.name} href={`#/profil/${encodeURIComponent(p.name)}`} className={`podium__item podium__item--${p.platz}`}>
                <div className="podium__medal">{['🥇', '🥈', '🥉'][p.platz - 1]}</div>
                <div className="podium__name">{p.name}</div>
                <div className="podium__pts">{p.points.toLocaleString('de-DE')}</div>
                <div className="podium__meta">Level {p.level} · {p.missions} Missionen</div>
                <div className="podium__bar"><span>{p.platz}</span></div>
              </a>
            ))}
          </div>
        )}
        {rest.length > 0 && (
          <div className="table">
            <div className="table__row table__row--head"><span>#</span><span>Bürger</span><span>Level</span><span>Missionen</span><span>Punkte</span></div>
            {rest.map((p) => (
              <a key={p.name} href={`#/profil/${encodeURIComponent(p.name)}`} className={`table__row ${p.name === meinName ? 'is-me' : ''}`}>
                <span className="table__rank">{p.platz}</span><span className="table__name">{p.name}</span><span>{p.level}</span><span>{p.missions}</span><b>{p.points.toLocaleString('de-DE')}</b>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
