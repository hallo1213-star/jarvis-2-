// Prozedurale Texturen (Canvas) – keine externen Dateien nötig, kleine Ladezeit.
import * as THREE from 'three';

const cache = new Map();
function canvasTex(key, w, h, draw, { repeat = true, srgb = true, aniso = 8 } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, t); return t;
}

// Deterministischer Zufall
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function noise(g, w, h, amount, seed, size = 1) {
  const r = rng(seed); const n = Math.floor((w * h) / (size * size) * 0.35);
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${r() * amount})`;
    g.fillRect(r() * w, r() * h, size, size);
  }
}

// ---------- Fassaden ----------
// Eine Kachel = 4 Fensterachsen × 4 Geschosse = 12 m × 12.8 m
export const FACADE_TILE = { w: 12, h: 12.8 };
export const FACADE_STYLES = [
  { name: 'altbau-creme', wall: '#d9cbb0', trim: '#efe6d2', frame: '#f4f1ea', shutter: null, brick: false, cornice: true },
  { name: 'altbau-ocker', wall: '#c99a5b', trim: '#e6c999', frame: '#f2ece0', shutter: null, brick: false, cornice: true },
  { name: 'putz-grau', wall: '#a9a9a3', trim: '#c7c6bf', frame: '#3a3d40', shutter: null, brick: false, cornice: false },
  { name: 'klinker', wall: '#8a4a36', trim: '#b3a597', frame: '#efe9df', shutter: null, brick: true, cornice: false },
  { name: 'altbau-blau', wall: '#8ea3b5', trim: '#dfe5ea', frame: '#f5f5f2', shutter: null, brick: false, cornice: true },
  { name: 'putz-rosa', wall: '#c99f96', trim: '#eadbd2', frame: '#f3efe8', shutter: '#4c6b52', brick: false, cornice: true },
  { name: 'modern', wall: '#e4e4e0', trim: '#cfcfca', frame: '#2b2e31', shutter: null, brick: false, cornice: false, modern: true },
];

function drawWindow(g, x, y, w, h, s, lit) {
  // Laibung + Rahmen + Glas mit Himmelsreflexion
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = s.frame; g.fillRect(x - 2, y - 2, w + 4, h + 4);
  const grd = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  if (lit) { grd.addColorStop(0, '#ffe2a8'); grd.addColorStop(1, '#f0b860'); }
  else { grd.addColorStop(0, '#9fb4c6'); grd.addColorStop(0.45, '#4d6276'); grd.addColorStop(1, '#253241'); }
  g.fillStyle = grd; g.fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle = s.frame; g.fillRect(x + w / 2 - 1.5, y, 3, h); g.fillRect(x, y + h * 0.32, w, 3);
  // Fensterbank
  g.fillStyle = s.trim; g.fillRect(x - 6, y + h + 2, w + 12, 6);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 6, y + h + 8, w + 12, 3);
  if (s.shutter) { g.fillStyle = s.shutter; g.fillRect(x - 16, y - 2, 12, h + 4); g.fillRect(x + w + 4, y - 2, 12, h + 4);
    g.fillStyle = 'rgba(0,0,0,0.2)'; for (let k = y; k < y + h; k += 6) { g.fillRect(x - 16, k, 12, 1.5); g.fillRect(x + w + 4, k, 12, 1.5); } }
}

export function facadeTexture(i, lit = false) {
  const s = FACADE_STYLES[i % FACADE_STYLES.length];
  return canvasTex(`fac-${i}-${lit}`, 512, 512, (g, W, H) => {
    g.fillStyle = s.wall; g.fillRect(0, 0, W, H);
    if (s.brick) {
      for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 ? -10 : 0; x < W; x += 20) {
        const v = 0.85 + Math.random() * 0.3; g.fillStyle = `rgb(${138 * v | 0},${74 * v | 0},${54 * v | 0})`; g.fillRect(x + 1, y + 1, 18, 6);
      }
    }
    noise(g, W, H, 0.07, 11 + i, 2);
    const fw = W / 4, fh = H / 4; const r = rng(100 + i);
    for (let fy = 0; fy < 4; fy++) {
      // Geschossgesims
      if (s.cornice) { g.fillStyle = s.trim; g.fillRect(0, fy * fh + fh - 8, W, 6); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, fy * fh + fh - 2, W, 2); }
      for (let fx = 0; fx < 4; fx++) {
        if (s.modern) {
          const x = fx * fw + 6, y = fy * fh + 14; const w = fw - 12, h = fh - 30;
          g.fillStyle = s.frame; g.fillRect(x - 2, y - 2, w + 4, h + 4);
          const lit2 = lit && r() < 0.35; const grd = g.createLinearGradient(x, y, x + w, y + h);
          if (lit2) { grd.addColorStop(0, '#ffe7b8'); grd.addColorStop(1, '#e8b56a'); } else { grd.addColorStop(0, '#a8bccc'); grd.addColorStop(1, '#2c3a48'); }
          g.fillStyle = grd; g.fillRect(x, y, w, h); g.fillStyle = s.frame; g.fillRect(x + w / 2 - 1, y, 2, h);
        } else {
          const w = fw * 0.42, h = fh * 0.58; const x = fx * fw + (fw - w) / 2, y = fy * fh + fh * 0.16;
          if (s.cornice) { g.fillStyle = s.trim; g.fillRect(x - 8, y - 14, w + 16, 8); }
          drawWindow(g, x, y, w, h, s, lit && r() < 0.4);
        }
      }
    }
    // Verschmutzung unten
    const dirt = g.createLinearGradient(0, H * 0.75, 0, H); dirt.addColorStop(0, 'rgba(0,0,0,0)'); dirt.addColorStop(1, 'rgba(40,30,20,0.12)');
    g.fillStyle = dirt; g.fillRect(0, 0, W, H);
  });
}

// Erdgeschoss mit Ladenfront: Kachel 12 m × 4.4 m
export const SHOP_TILE = { w: 12, h: 4.4 };
const SHOP_COLORS = ['#1f3b5c', '#5c1f24', '#24412c', '#3a2f22', '#2a2a2a', '#5a4a1a'];
export function shopTexture(i) {
  return canvasTex(`shop-${i}`, 512, 192, (g, W, H) => {
    const base = FACADE_STYLES[i % FACADE_STYLES.length];
    g.fillStyle = base.trim; g.fillRect(0, 0, W, H); noise(g, W, H, 0.08, 40 + i, 2);
    const col = SHOP_COLORS[i % SHOP_COLORS.length];
    // zwei Schaufenster + Tür
    for (const [x, w] of [[16, 200], [296, 200]]) {
      g.fillStyle = col; g.fillRect(x - 6, 40, w + 12, H - 40);
      const grd = g.createLinearGradient(x, 50, x + w, H); grd.addColorStop(0, '#a9bccb'); grd.addColorStop(0.5, '#3e5263'); grd.addColorStop(1, '#1d2731');
      g.fillStyle = grd; g.fillRect(x, 52, w, H - 60);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.moveTo(x + 20, 52); g.lineTo(x + 70, 52); g.lineTo(x + 20, H - 8); g.closePath(); g.fill();
    }
    g.fillStyle = col; g.fillRect(222, 40, 68, H - 40); g.fillStyle = '#20262c'; g.fillRect(230, 56, 52, H - 56);
    g.fillStyle = '#c9a54a'; g.fillRect(272, 120, 4, 18);
    // Markise-/Schildband
    g.fillStyle = col; g.fillRect(0, 8, W, 26); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 8, W, 3);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, H - 6, W, 6);
  });
}

// ---------- Boden ----------
export function asphaltTexture() {
  return canvasTex('asphalt', 512, 512, (g, W, H) => {
    g.fillStyle = '#3b3d40'; g.fillRect(0, 0, W, H);
    noise(g, W, H, 0.22, 1, 2); noise(g, W, H, 0.12, 2, 1);
    const r = rng(9); for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(20,20,20,${0.15 + r() * 0.2})`; g.lineWidth = 1 + r() * 2;
      g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * W, r() * H, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, 7); g.fill(); }
  });
}
export function pavingTexture(tint = '#8f8a82') {
  return canvasTex('paving' + tint, 512, 512, (g, W, H) => {
    g.fillStyle = '#6e6a63'; g.fillRect(0, 0, W, H);
    const r = rng(5); const s = 32;
    for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) {
      const v = 0.88 + r() * 0.2; const c = new THREE.Color(tint).multiplyScalar(v);
      g.fillStyle = `#${c.getHexString()}`; g.fillRect(x + 1.5, y + 1.5, s - 3, s - 3);
    }
    noise(g, W, H, 0.12, 6, 2);
  });
}
export function plazaTexture() {
  return canvasTex('plaza', 512, 512, (g, W, H) => {
    g.fillStyle = '#7d766c'; g.fillRect(0, 0, W, H); const r = rng(77);
    for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? -12 : 0; x < W; x += 24) {
      const v = 0.85 + r() * 0.25; g.fillStyle = `rgb(${128 * v | 0},${120 * v | 0},${108 * v | 0})`; g.fillRect(x + 1, y + 1, 22, 14);
    }
    noise(g, W, H, 0.1, 78, 2);
  });
}
export function grassTexture() {
  return canvasTex('grass', 512, 512, (g, W, H) => {
    g.fillStyle = '#4b6b32'; g.fillRect(0, 0, W, H); const r = rng(3);
    for (let i = 0; i < 26000; i++) { const v = r(); g.fillStyle = v < 0.5 ? `rgba(98,135,60,${0.5 * r()})` : `rgba(40,62,26,${0.5 * r()})`; g.fillRect(r() * W, r() * H, 1.5, 3 + r() * 3); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(110,100,60,${0.08 * r()})`; g.beginPath(); g.arc(r() * W, r() * H, 10 + r() * 40, 0, 7); g.fill(); }
  });
}
export function gravelTexture() {
  return canvasTex('gravel', 256, 256, (g, W, H) => { g.fillStyle = '#7a756b'; g.fillRect(0, 0, W, H); noise(g, W, H, 0.35, 21, 2); noise(g, W, H, 0.2, 22, 3); });
}
export function concreteTexture() {
  return canvasTex('concrete', 256, 256, (g, W, H) => { g.fillStyle = '#9a9890'; g.fillRect(0, 0, W, H); noise(g, W, H, 0.12, 31, 2);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; g.strokeRect(0, 0, W, H); });
}
export function roofTexture() {
  return canvasTex('roof', 256, 256, (g, W, H) => {
    g.fillStyle = '#5a3a30'; g.fillRect(0, 0, W, H); const r = rng(44);
    for (let y = 0; y < H; y += 12) for (let x = (y / 12) % 2 ? -8 : 0; x < W; x += 16) { const v = 0.8 + r() * 0.35;
      g.fillStyle = `rgb(${120 * v | 0},${58 * v | 0},${44 * v | 0})`; g.fillRect(x + 1, y + 1, 14, 10); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 1, y + 9, 14, 2); }
  });
}
export function flatRoofTexture() {
  return canvasTex('flatroof', 256, 256, (g, W, H) => { g.fillStyle = '#5b5c5e'; g.fillRect(0, 0, W, H); noise(g, W, H, 0.25, 51, 2); });
}
export function corrugatedTexture(color = '#8d969c') {
  return canvasTex('corr' + color, 256, 256, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, 0, 3, H); g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + 4, 0, 3, H); }
    noise(g, W, H, 0.12, 61, 2);
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(80,50,20,0.18)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  });
}

// Schild mit Text (nicht wiederholend)
export function signTexture(text, { bg = '#0b1a33', fg = '#ffffff', accent = '#d4af37', w = 1024, h = 192, font = 800 } = {}) {
  return canvasTex(`sign-${text}-${bg}-${fg}`, w, h, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = accent; g.fillRect(0, H - 10, W, 10);
    let size = H * 0.5; g.font = `${font} ${size}px system-ui, sans-serif`;
    while (g.measureText(text).width > W * 0.9 && size > 10) { size -= 2; g.font = `${font} ${size}px system-ui, sans-serif`; }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2);
  }, { repeat: false });
}

// Valenheim-Flagge: Navy, goldenes V mit weißem Rand, weißer 7-zackiger Stern
export function flagTexture() {
  return canvasTex('flag', 512, 320, (g, W, H) => {
    g.fillStyle = '#0d1f45'; g.fillRect(0, 0, W, H);
    g.lineJoin = 'round';
    const v = () => { g.beginPath(); g.moveTo(W * 0.18, H * 0.12); g.lineTo(W * 0.5, H * 0.9); g.lineTo(W * 0.82, H * 0.12); };
    g.strokeStyle = '#ffffff'; g.lineWidth = 62; v(); g.stroke();
    g.strokeStyle = '#d4af37'; g.lineWidth = 44; v(); g.stroke();
    const cx = W * 0.5, cy = H * 0.3, R = 34, r = 15; g.fillStyle = '#ffffff'; g.beginPath();
    for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + i * Math.PI / 7; const rr = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }, { repeat: false });
}

// Nacht: Leuchtende Fenster als Emissive-Maske (passt exakt auf facadeTexture)
export function facadeNightTexture(i) {
  const s = FACADE_STYLES[i % FACADE_STYLES.length];
  return canvasTex(`facn-${i}`, 256, 256, (g, W, H) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H); const r = rng(500 + i); const fw = W / 4, fh = H / 4;
    for (let fy = 0; fy < 4; fy++) for (let fx = 0; fx < 4; fx++) {
      if (r() > 0.42) continue; const warm = r() < 0.75;
      g.fillStyle = warm ? `rgb(255,${190 + r() * 40 | 0},${110 + r() * 40 | 0})` : 'rgb(170,200,255)';
      if (s.modern) g.fillRect(fx * fw + 3, fy * fh + 7, fw - 6, fh - 15);
      else { const w = fw * 0.42, h = fh * 0.58; g.fillRect(fx * fw + (fw - w) / 2 + 1, fy * fh + fh * 0.16 + 1, w - 2, h - 2); }
    }
  });
}
