import { useEffect, useRef } from 'react';
import { CENTERS, HALF, districtOfBlock, DISTRICTS } from '../game/city.js';

// Minikarte: Stadtplan (Blöcke nach Viertel eingefärbt), Spielerpfeil, wichtige Orte
const SIZE = 168, RANGE = 340;
function basemap(pois) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); const k = 512 / (RANGE * 2);
  const P = (v) => (v + RANGE) * k;
  g.fillStyle = '#0a1426'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#1d2a40'; g.fillRect(P(-330), P(-330), 660 * k, 660 * k);
  for (const cx of CENTERS) for (const cz of CENTERS) {
    const d = districtOfBlock(Math.round(cx / 80), Math.round(cz / 80));
    g.fillStyle = DISTRICTS[d].farbe; g.globalAlpha = 0.55; g.fillRect(P(cx - HALF), P(cz - HALF), HALF * 2 * k, HALF * 2 * k);
  }
  g.globalAlpha = 0.6; g.fillStyle = DISTRICTS.bahnhof.farbe; g.fillRect(P(-322), P(-118), 30 * k, 236 * k);
  g.globalAlpha = 1; g.fillStyle = '#ffffff';
  for (const p of pois) { g.beginPath(); g.arc(P(p.x), P(p.z), 2.4, 0, 7); g.fill(); }
  return c;
}
export default function Minimap({ engine }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!engine) return; const base = basemap(engine.city.pois); const g = ref.current.getContext('2d'); let raf;
    const draw = () => {
      const s = engine.minimapState(); const k = 512 / (RANGE * 2); const zoom = 2.2;
      g.save(); g.clearRect(0, 0, SIZE, SIZE); g.beginPath(); g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, 7); g.clip();
      g.translate(SIZE / 2, SIZE / 2); g.rotate(s.yaw); g.scale(zoom, zoom);
      g.drawImage(base, -(s.x + RANGE) * k, -(s.z + RANGE) * k);
      g.restore();
      // Missionsziel (am Rand, wenn außerhalb)
      const tg = engine.missionTarget;
      if (tg) {
        const dx = (tg.x - s.x) * k * zoom, dz = (tg.z - s.z) * k * zoom; const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
        let px = dx * c - dz * sn, pz = dx * sn + dz * c; const R = SIZE / 2 - 10; const L = Math.hypot(px, pz); if (L > R) { px *= R / L; pz *= R / L; }
        g.fillStyle = '#ffd54a'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(SIZE / 2 + px, SIZE / 2 + pz, 6, 0, 7); g.fill(); g.stroke();
      }
      // Spielerpfeil
      g.save(); g.translate(SIZE / 2, SIZE / 2); g.rotate(-(s.heading - s.yaw) + Math.PI);
      g.fillStyle = '#d4af37'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
      // Norden
      g.save(); g.translate(SIZE / 2, SIZE / 2); g.rotate(s.yaw); g.fillStyle = '#fff'; g.font = '700 12px system-ui'; g.textAlign = 'center'; g.fillText('N', 0, -SIZE / 2 + 16); g.restore();
      raf = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, [engine]);
  return <canvas ref={ref} width={SIZE} height={SIZE} className="minimap" />;
}
