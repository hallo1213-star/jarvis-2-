import { useEffect, useRef } from 'react';

// Minikarte (GTA-Stil): dreht sich mit der Kamera, zeigt Straßen, Spieler, dein Auto, Autohaus, Jobs und das Lieferziel
const P = 74, HB = 28, R = 230; // Raster, halber Block, sichtbarer Radius in Metern
export default function Minikarte({ gameRef, groesse = 170 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; const g = c.getContext('2d'); const dpr = Math.min(2, devicePixelRatio); c.width = c.height = groesse * dpr; let id;
    const zeichne = () => {
      const G = gameRef.current; if (!G) return; const k = G.karte(); const W = c.width, m = W / 2, s = (W / 2) / R;
      g.save(); g.clearRect(0, 0, W, W); g.beginPath(); g.arc(m, m, m - 2 * dpr, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#1b2235'; g.fillRect(0, 0, W, W);
      g.translate(m, m); g.rotate(k.yaw); g.scale(s, s); g.translate(-k.x, -k.z);
      // Blöcke (Straßen = Zwischenräume)
      const i0 = Math.floor((k.x - R * 1.5) / P), i1 = Math.ceil((k.x + R * 1.5) / P), j0 = Math.floor((k.z - R * 1.5) / P), j1 = Math.ceil((k.z + R * 1.5) / P);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        g.fillStyle = i === 0 && j === 0 ? '#3a4566' : (i === 1 && j === -1) ? '#5a4a1c' : '#2c3550'; g.fillRect(i * P - HB, j * P - HB, HB * 2, HB * 2);
      }
      // Zonen (Autohaus gold, Jobs grün)
      const punkt = (x, z, farbe, r = 7) => { g.fillStyle = farbe; g.beginPath(); g.arc(x, z, r / s * 0.5, 0, Math.PI * 2); g.fill(); };
      for (const z of k.zonen) if (z.art === 'autohaus') punkt(z.x, z.z, '#d4af37', 9 * dpr); else if (z.art === 'job') punkt(z.x, z.z, '#3cff8f', 6 * dpr);
      g.fillStyle = '#8a93a8'; for (const v of k.verkehr) g.fillRect(v.x - 5, v.z - 5, 10, 10);
      if (k.auto) { g.fillStyle = '#2a7bff'; g.fillRect(k.auto.x - 3, k.auto.z - 5, 6, 10); }
      for (const o of k.andere) punkt(o.x, o.z, o.f ? '#ff9f43' : '#ffffff', 5 * dpr);
      g.restore();
      // Lieferziel: im Kreis oder am Rand als Pfeil
      if (k.ziel) {
        const dx = k.ziel.x - k.x, dz = k.ziel.z - k.z; const a = Math.atan2(dz, dx) + k.yaw; const d = Math.hypot(dx, dz) * s; const rr = Math.min(d, m - 12 * dpr);
        const zx = m + Math.cos(a) * rr, zy = m + Math.sin(a) * rr; g.fillStyle = '#3cff8f'; g.strokeStyle = '#04160b'; g.lineWidth = 2 * dpr;
        g.beginPath(); g.arc(zx, zy, 7 * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      // Spieler-Pfeil (zeigt Laufrichtung relativ zur Kamera)
      g.save(); g.translate(m, m); g.rotate(Math.PI - k.heading + k.yaw);
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.moveTo(0, -9 * dpr); g.lineTo(6 * dpr, 7 * dpr); g.lineTo(0, 3 * dpr); g.lineTo(-6 * dpr, 7 * dpr); g.closePath(); g.fill(); g.stroke(); g.restore();
      g.strokeStyle = 'rgba(212,175,55,0.9)'; g.lineWidth = 3 * dpr; g.beginPath(); g.arc(m, m, m - 2 * dpr, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff'; g.font = `800 ${11 * dpr}px Inter, sans-serif`; g.textAlign = 'center';
      const nA = k.yaw - Math.PI / 2; g.fillText('N', m + Math.cos(nA) * (m - 11 * dpr), m + Math.sin(nA) * (m - 11 * dpr) + 4 * dpr);
    };
    const loop = () => { try { zeichne(); } catch { /* Spiel noch nicht bereit */ } id = setTimeout(loop, 100); }; loop();
    return () => clearTimeout(id);
  }, [gameRef, groesse]);
  return <canvas ref={ref} className="minikarte" style={{ width: groesse, height: groesse }} aria-label="Minikarte" />;
}
