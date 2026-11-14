import { useEffect, useRef, useState } from 'react';
import Logo from './Logo.jsx';
import { api, raumWahl } from '../lib/api.js';
import { testErgebnis, PROFILE } from '../core/quality.js';

// Hintergrund: ruhige Nachtsilhouette von Valenheim (Canvas 2D – lädt sofort, kostet keine Leistung).
// Ab Phase 2 ersetzt durch einen Kameraflug über die echte Karte.
function Skyline({ canvasRef }) {
  useEffect(() => {
    const c = canvasRef.current; const g = c.getContext('2d'); let raf; let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const bauten = Array.from({ length: 90 }, (_, i) => ({ x: i / 90, w: 0.012 + rnd() * 0.02, h: 0.12 + rnd() ** 2 * 0.45, f: Array.from({ length: 30 }, () => rnd() < 0.35) }));
    bauten.push({ x: 0.72, w: 0.008, h: 0.78, turm: true, f: [] });
    const draw = (t) => {
      const W = (c.width = c.clientWidth * devicePixelRatio), H = (c.height = c.clientHeight * devicePixelRatio);
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#060b18'); gr.addColorStop(0.6, '#13224a'); gr.addColorStop(1, '#2a2440'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 120; i++) { const sx = (i * 97.3 % 100) / 100 * W, sy = (i * 41.7 % 55) / 100 * H; g.fillStyle = `rgba(255,255,255,${0.25 + 0.25 * Math.sin(t / 900 + i)})`; g.fillRect(sx, sy, 1.5 * devicePixelRatio, 1.5 * devicePixelRatio); }
      for (const b of bauten) {
        const x = b.x * W, w = b.w * W, h = b.h * H, y = H - h;
        g.fillStyle = b.turm ? '#0d1530' : '#0a1226'; g.fillRect(x, y, w, h);
        if (b.turm) { g.beginPath(); g.arc(x + w / 2, y + h * 0.18, w * 2.2, 0, 7); g.fill(); g.fillStyle = Math.sin(t / 300) > 0.3 ? '#ff3b3b' : '#5a1010'; g.fillRect(x + w / 2 - 2, y - 6, 4, 6); continue; }
        b.f.forEach((on, k) => { if (!on) return; const fx = x + 3 + (k % 3) * (w / 3), fy = y + 6 + Math.floor(k / 3) * (h / 11); if (fy > H - 4) return; g.fillStyle = 'rgba(255, 205, 130, 0.75)'; g.fillRect(fx, fy, Math.max(2, w / 6), 3 * devicePixelRatio); });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [canvasRef]);
  return null;
}

export default function Hauptmenue({ konto, laedt, onAbmelden }) {
  const ref = useRef(null); const [status, setStatus] = useState(null);
  useEffect(() => { api.status().then(setStatus).catch(() => setStatus(false)); }, []);
  const lt = testErgebnis();
  return (
    <div className="menue">
      <canvas ref={ref} className="menue__bg" aria-hidden="true" /><Skyline canvasRef={ref} />
      <div className="menue__schatten" />
      <div className="menue__inhalt">
        <Logo />
        <p className="sub" style={{ maxWidth: 420 }}>Die Republik Valenheim. Ein eigenes Land, ein eigenes Leben. <b style={{ color: '#fff' }}>Testversion</b>: Die Stadt aus der Serie, eigener Charakter, Tag &amp; Nacht, Wetter – mit bis zu 12 Spielern pro Server.</p>
        {laedt ? <div className="spinner" /> : (
          <nav className="menue__liste">
            <a className="menue__punkt menue__punkt--haupt" href="#/spielen" onClick={() => raumWahl.setze({})}>SPIELEN <small>{konto ? `als ${konto.profil.name}` : 'Anmelden nötig'}</small></a>
            <a className="menue__punkt" href="#/server">SERVER AUSWÄHLEN <small>Öffentlich · Privat mit Code</small></a>
            <a className="menue__punkt" href="#/charakter">CHARAKTER <small>{konto?.spielstand.charakter?.aussehen ? 'Aussehen ändern' : 'Jetzt erstellen'}</small></a>
            <a className="menue__punkt" href="#/leistung">LEISTUNGSTEST <small>{lt ? `Empfehlung: ${PROFILE[lt.empfehlung].name}` : 'Noch nicht gemacht'}</small></a>
            <a className="menue__punkt" href="#/einstellungen">EINSTELLUNGEN <small>Grafik · Kamera · Ton</small></a>
            {konto ? <button className="menue__punkt" onClick={onAbmelden}>ABMELDEN <small>{konto.profil.name}</small></button>
              : <a className="menue__punkt" href="#/konto">ANMELDEN / REGISTRIEREN <small>Konto für alle Geräte</small></a>}
          </nav>
        )}
        <div className="menue__fuss">
          {status === null ? <span className="badge" style={{ '--c': '#ffb347' }}>Verbinde …</span> : status ? <span className="badge">Server online · {status.online} im Spiel</span> : <span className="badge" style={{ '--c': '#ff6b6b' }}>Server nicht erreichbar</span>}
          <span className="punkt" /><span>Version {status?.version || '2.0'}</span>
        </div>
      </div>
    </div>
  );
}
