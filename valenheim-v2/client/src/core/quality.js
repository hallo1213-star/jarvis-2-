// Grafikprofile + Geräteerkennung + automatische Anpassung an die Leistung.
export const PROFILE = {
  niedrig: { name: 'Niedrig', pr: 1.0, schatten: 0, schattenWeite: 0, aa: false, sicht: 350, nebel: 0.0055, details: 0.4, post: false },
  mittel: { name: 'Mittel', pr: 1.5, schatten: 1024, schattenWeite: 50, aa: false, sicht: 650, nebel: 0.0032, details: 0.7, post: false },
  hoch: { name: 'Hoch', pr: 2.0, schatten: 2048, schattenWeite: 80, aa: true, sicht: 1200, nebel: 0.0018, details: 1.0, post: true },
};
export const STUFEN = ['niedrig', 'mittel', 'hoch'];

export function geraet() {
  const ua = navigator.userAgent; const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  let gpu = 'unbekannt', maxTex = 0;
  try {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) { const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  } catch { /* kein WebGL */ }
  return {
    mobil: touch, ios, android: /Android/.test(ua), gpu, maxTex, kerne: navigator.hardwareConcurrency || 0, speicherGB: navigator.deviceMemory || null,
    dpr: window.devicePixelRatio || 1, bildschirm: `${screen.width}×${screen.height}`,
    browser: /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'anderer',
  };
}
export const zielFps = (g = geraet()) => (g.mobil ? 30 : 55);

// Gespeichertes Ergebnis des Leistungstests (nur auf diesem Gerät)
export function testErgebnis() { try { return JSON.parse(localStorage.getItem('vh2_leistung') || 'null'); } catch { return null; } }
export function speichereTest(r) { try { localStorage.setItem('vh2_leistung', JSON.stringify(r)); } catch { /* privat */ } }

// Startstufe bei „Automatisch“: Testergebnis > Heuristik
export function autoStufe(g = geraet()) {
  const t = testErgebnis(); if (t?.empfehlung && PROFILE[t.empfehlung]) return t.empfehlung;
  if (/SwiftShader|llvmpipe|Software/i.test(g.gpu)) return 'niedrig';
  if (g.mobil) return 'mittel';
  if (/Intel/i.test(g.gpu) && !/Arc/i.test(g.gpu)) return 'mittel';
  return 'hoch';
}

// Wächter: senkt die Stufe, wenn die Bildrate dauerhaft zu niedrig ist
export class FpsWaechter {
  constructor(ziel, onSenken) { this.ziel = ziel; this.onSenken = onSenken; this.frames = 0; this.t = 0; this.schlecht = 0; this.fps = 0; this.ruhe = 4; }
  tick(dt) {
    this.frames++; this.t += dt; if (this.ruhe > 0) { this.ruhe -= dt; return; }
    if (this.t >= 1) { this.fps = this.frames / this.t; this.frames = 0; this.t = 0; this.schlecht = this.fps < this.ziel - 5 ? this.schlecht + 1 : 0; if (this.schlecht >= 6) { this.schlecht = 0; this.ruhe = 6; this.onSenken?.(); } }
  }
}
