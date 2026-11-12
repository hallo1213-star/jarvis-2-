// Staatliche Identität der REPUBLIK VALENHEIM: Farben, Flagge, Wappen, Valenheim-TV-Logo, Dokument-Stil.
// Alle Grafiken werden im Code gezeichnet (keine fremden Bilder, keine Lizenzen).

export const FARBEN = {
  nachtblau: '#14244a',
  nachtblauHell: '#1f3a70',
  gold: '#f2c230',
  goldDunkel: '#b8901e',
  weiss: '#ffffff',
  rot: '#c8102e', // nur für Warn-/Eilmeldungen
};

// Siebenzackiger Stern (7 Tage)
function stern(g, cx, cy, r, ri = r * 0.45, n = 7, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? ri : r; const a = rot + (i * Math.PI) / n;
    g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}

// Nationalflagge 3:2 — Nachtblau, goldenes „V“ mit weißer Kante, weißer Siebenstern im oberen Dreieck
export function flaggeCanvas(w = 900) {
  const h = Math.round(w * 2 / 3);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = FARBEN.nachtblau; g.fillRect(0, 0, w, h);
  const b = h * 0.17; // Balkenbreite
  const v = (inset, col) => {
    g.beginPath();
    g.moveTo(-inset * 0.2, 0); g.lineTo(b * 1.2 + inset * 0.2, 0); g.lineTo(w / 2, h - b * 1.5 - inset * 0.0);
    g.lineTo(w - b * 1.2 - inset * 0.2, 0); g.lineTo(w + inset * 0.2, 0); g.lineTo(w / 2 + b * 0.7 + inset * 0.6, h); g.lineTo(w / 2 - b * 0.7 - inset * 0.6, h);
    g.closePath(); g.fillStyle = col; g.fill();
  };
  // weiße Kante, dann Gold
  g.save(); g.lineJoin = 'miter';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(b * 1.2, 0); g.lineTo(w / 2, h - b * 1.5); g.lineTo(w - b * 1.2, 0); g.lineTo(w, 0); g.lineTo(w / 2 + b * 0.7, h); g.lineTo(w / 2 - b * 0.7, h); g.closePath();
  g.strokeStyle = FARBEN.weiss; g.lineWidth = h * 0.045; g.stroke(); g.fillStyle = FARBEN.gold; g.fill();
  g.restore();
  // Stern im oberen Dreieck
  stern(g, w / 2, h * 0.3, h * 0.13); g.fillStyle = FARBEN.weiss; g.fill();
  return c;
}

// Staatswappen: nachtblauer Schild, goldenes Stadttor mit zwei Türmen, Siebenstern, Lorbeer, Bänder
export function wappenCanvas(size = 768, { baender = true } = {}) {
  const c = document.createElement('canvas'); c.width = size; c.height = size; const g = c.getContext('2d');
  const S = size / 768; g.scale(S, S);
  const cx = 384;
  // Lorbeer links/rechts
  g.fillStyle = FARBEN.gold;
  for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) {
    const t = i / 8; const a = Math.PI * (0.62 + 0.62 * t) * (sx > 0 ? -1 : 1) + (sx > 0 ? Math.PI : 0);
    const r = 285; const x = cx + Math.cos(a) * r * (sx > 0 ? -1 : 1) * -1, y = 400 - Math.sin(a) * r * 0.9;
    g.save(); g.translate(cx + sx * (230 - 30 * Math.sin(t * Math.PI)), 600 - t * 430); g.rotate(sx * (0.5 - t * 0.9));
    g.beginPath(); g.ellipse(sx * 26, 0, 34, 13, sx * 0.5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(-sx * 6, -10, 30, 11, -sx * 0.6, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // Schild
  const schild = () => { g.beginPath(); g.moveTo(cx - 200, 150); g.lineTo(cx + 200, 150); g.lineTo(cx + 200, 400); g.quadraticCurveTo(cx + 190, 560, cx, 650); g.quadraticCurveTo(cx - 190, 560, cx - 200, 400); g.closePath(); };
  schild(); g.fillStyle = FARBEN.gold; g.fill();
  g.save(); g.translate(cx, 400); g.scale(0.93, 0.94); g.translate(-cx, -400); schild(); g.fillStyle = FARBEN.nachtblau; g.fill(); g.restore();
  // Stadttor
  g.fillStyle = FARBEN.gold;
  const zinne = (x, y, w2, n) => { for (let i = 0; i < n; i++) g.fillRect(x + i * (w2 / n) + 2, y - 18, w2 / n - 8, 18); };
  g.fillRect(cx - 150, 330, 80, 220); zinne(cx - 150, 330, 80, 3);          // linker Turm
  g.fillRect(cx + 70, 330, 80, 220); zinne(cx + 70, 330, 80, 3);           // rechter Turm
  g.fillRect(cx - 75, 400, 150, 150); zinne(cx - 75, 400, 150, 5);         // Mauer
  g.fillStyle = FARBEN.nachtblau;
  g.beginPath(); g.moveTo(cx - 45, 550); g.lineTo(cx - 45, 470); g.arc(cx, 470, 45, Math.PI, 0); g.lineTo(cx + 45, 550); g.closePath(); g.fill(); // Torbogen
  for (const x of [cx - 110, cx + 110]) { g.fillRect(x - 10, 380, 20, 34); }
  // Stern über dem Tor
  stern(g, cx, 245, 62); g.fillStyle = FARBEN.weiss; g.fill();
  if (baender) {
    // oberes Band
    const band = (y, txt, fs) => {
      g.fillStyle = FARBEN.gold; g.beginPath(); g.moveTo(cx - 300, y - 34); g.quadraticCurveTo(cx, y - 70, cx + 300, y - 34); g.lineTo(cx + 300, y + 30); g.quadraticCurveTo(cx, y - 6, cx - 300, y + 30); g.closePath(); g.fill();
      g.fillStyle = FARBEN.nachtblau; g.font = `900 ${fs}px Montserrat`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, cx, y - 14);
    };
    band(100, 'REPUBLIK VALENHEIM', 44);
    g.fillStyle = FARBEN.nachtblau; g.beginPath(); g.moveTo(cx - 250, 690); g.quadraticCurveTo(cx, 730, cx + 250, 690); g.lineTo(cx + 250, 745); g.quadraticCurveTo(cx, 785, cx - 250, 745); g.closePath(); g.fill();
    g.strokeStyle = FARBEN.gold; g.lineWidth = 5; g.stroke();
    g.fillStyle = FARBEN.gold; g.font = '900 38px Montserrat'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GEMEINSAM STARK', cx, 728);
  }
  return c;
}

// VALENHEIM TV – Senderlogo
export function tvLogoCanvas(w = 700, h = 160) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = FARBEN.nachtblau; g.beginPath(); g.roundRect ? g.roundRect(0, 0, w, h, 22) : g.rect(0, 0, w, h); g.fill();
  // V-Zeichen
  g.fillStyle = FARBEN.gold; g.beginPath(); g.moveTo(22, 28); g.lineTo(58, 28); g.lineTo(84, 104); g.lineTo(110, 28); g.lineTo(146, 28); g.lineTo(102, 134); g.lineTo(66, 134); g.closePath(); g.fill();
  g.fillStyle = FARBEN.weiss; g.font = '900 56px Montserrat'; g.textBaseline = 'middle'; g.fillText('VALENHEIM', 166, 64);
  g.fillStyle = FARBEN.gold; g.font = '900 44px Montserrat'; g.fillText('TV', 166, 118);
  g.fillStyle = FARBEN.weiss; g.font = '700 24px Oxanium'; g.fillText('STAATLICHER NACHRICHTENSENDER', 240, 120);
  return c;
}
