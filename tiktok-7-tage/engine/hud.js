// 2D-Overlay: HUD, Untertitel, Callouts, Titel, Alarm, Endkarte. Alles zeitbasiert gezeichnet.
import { clamp, smooth, ease, lerp, makeRng } from './rng.js';

export const W = 1080, H = 1920;
const C = {
  cyan: '#45e3ff', cyanDim: 'rgba(69,227,255,0.35)', orange: '#ff8a3d', red: '#ff3b3b', yellow: '#ffd84a',
  panel: 'rgba(6,12,18,0.58)', white: '#ffffff', mute: 'rgba(210,235,245,0.62)',
};
const F = { hud: 'Oxanium', big: 'Montserrat' };

const fmt = (n) => Math.round(n).toLocaleString('de-DE');
const GLYPHS = '01#%&$@ABCDEFGHJKLMNPQRSTUVWXYZ<>/\\';
function scramble(text, k, seed) {
  if (k >= 1) return text;
  const r = makeRng(Math.floor(seed * 37) + text.length);
  const n = Math.floor(text.length * k);
  return text.split('').map((ch, i) => (i < n || ch === ' ' ? ch : GLYPHS[Math.floor(r() * GLYPHS.length)])).join('');
}

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

function panel(g, x, y, w, h, a = 1, accent = C.cyan) {
  g.save(); g.globalAlpha *= a;
  rr(g, x, y, w, h, 14); g.fillStyle = C.panel; g.fill();
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(140,225,255,0.22)'; g.stroke();
  // Eck-Markierungen
  g.strokeStyle = accent; g.lineWidth = 3; const L = 16;
  g.beginPath(); g.moveTo(x, y + L); g.lineTo(x, y); g.lineTo(x + L, y); g.moveTo(x + w - L, y + h); g.lineTo(x + w, y + h); g.lineTo(x + w, y + h - L); g.stroke();
  g.restore();
}

function text(g, s, x, y, { size = 32, font = F.hud, weight = 600, color = C.white, align = 'left', base = 'alphabetic', spacing = 0, shadow = 0, alpha = 1 } = {}) {
  g.save(); g.globalAlpha *= alpha;
  g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = base; g.fillStyle = color;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  if (shadow) { g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = shadow; g.shadowOffsetY = 2; }
  g.fillText(s, x, y); g.restore();
}

function icon(g, kind, x, y, s, color) {
  g.save(); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'person') { g.beginPath(); g.arc(x, y - s * 0.22, s * 0.2, 0, 7); g.fill(); g.beginPath(); g.arc(x, y + s * 0.42, s * 0.36, Math.PI, 0); g.fill(); }
  if (kind === 'coin') { g.beginPath(); g.arc(x, y, s * 0.36, 0, 7); g.stroke(); text(g, '€', x, y + s * 0.18, { size: s * 0.5, align: 'center', weight: 700, color }); }
  if (kind === 'build') { g.strokeRect(x - s * 0.32, y - s * 0.1, s * 0.28, s * 0.44); g.strokeRect(x + 0.02 * s, y - s * 0.36, s * 0.3, s * 0.7); }
  if (kind === 'chart') { g.beginPath(); g.moveTo(x - s * 0.35, y + s * 0.3); g.lineTo(x - s * 0.1, y); g.lineTo(x + s * 0.08, y + s * 0.12); g.lineTo(x + s * 0.36, y - s * 0.28); g.stroke(); }
  if (kind === 'warn') { g.beginPath(); g.moveTo(x, y - s * 0.45); g.lineTo(x + s * 0.5, y + s * 0.4); g.lineTo(x - s * 0.5, y + s * 0.4); g.closePath(); g.stroke(); g.fillRect(x - 2, y - s * 0.15, 4, s * 0.3); g.fillRect(x - 2, y + s * 0.22, 4, 5); }
  if (kind === 'bubble') { rr(g, x - s * 0.45, y - s * 0.35, s * 0.9, s * 0.62, s * 0.18); g.fill(); g.beginPath(); g.moveTo(x - s * 0.15, y + s * 0.25); g.lineTo(x - s * 0.3, y + s * 0.5); g.lineTo(x + s * 0.05, y + s * 0.25); g.fill(); }
  g.restore();
}

function avatar(g, img, x, y, r, ring = '#fff') {
  g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.closePath();
  if (img) { g.save(); g.clip(); const s = Math.max((2 * r) / img.width, (2 * r) / img.height); g.drawImage(img, x - img.width * s / 2, y - img.height * s / 2, img.width * s, img.height * s); g.restore(); }
  else { g.fillStyle = '#888'; g.fill(); }
  g.lineWidth = Math.max(3, r * 0.08); g.strokeStyle = ring; g.stroke(); g.restore();
}

export class HUD {
  constructor(layout) { this.layout = layout; this.minimap = null; }

  buildMinimap(blockTypeFn, P) {
    const c = document.createElement('canvas'); c.width = 240; c.height = 240; const g = c.getContext('2d');
    const s = 240 / (13.2 * P);
    g.fillStyle = 'rgba(4,10,14,0.85)'; g.fillRect(0, 0, 240, 240);
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
      const t = blockTypeFn(i, j); const x = 120 + (i * P - 28) * s, y = 120 + (j * P - 28) * s, w = 56 * s;
      g.fillStyle = { platz: 'rgba(255,138,61,0.75)', bauplatz: 'rgba(255,216,74,0.12)', supermarkt: 'rgba(47,191,113,0.8)', park: 'rgba(80,150,70,0.7)', downtown: 'rgba(150,185,210,0.75)', wohnblock: 'rgba(200,170,140,0.7)' }[t] || 'rgba(120,140,160,0.55)';
      g.fillRect(x, y, w, w);
      if (t === 'bauplatz') { g.setLineDash([3, 3]); g.strokeStyle = C.yellow; g.lineWidth = 1.5; g.strokeRect(x + 1, y + 1, w - 2, w - 2); g.setLineDash([]); }
    }
    this.minimap = { c, s };
  }

  // ------------------------------------------------------------- Haupt-Zeichnen
  draw(g, t, S) {
    // S: Zustand vom Orchestrator (main.js)
    this.drawViewfinder(g, t, S);
    for (const c of S.callouts) this.drawCallout(g, t, c, S);
    if (S.playerLabel && !S.endkarte && !(S.frage && t - S.frage.t < S.frage.dauer)) this.drawPlayerLabel(g, t, S);
    for (const p of S.plusOnes) this.drawPlusOne(g, t, p, S);
    if (S.scan) this.drawScan(g, t, S.scan, S);
    if (S.hudOn !== null && t >= S.hudOn) { g.save(); if (S.endkarte) g.globalAlpha = 1 - clamp((t - S.endkarte.t) / 0.4) * 0.85; this.drawHUD(g, t, S); g.restore(); }
    if (S.simLabel) this.drawSimLabel(g, t, S.simLabel);
    if (S.titel) this.drawTitle(g, t, S.titel, S.hudOn !== null && t >= S.hudOn);
    if (S.alarm) this.drawAlarm(g, t, S.alarm);
    if (S.hinweis) this.drawHint(g, t, S.hinweis);
    if (S.kommentare) this.drawComments(g, t, S.kommentare, S);
    if (S.namen && !S.endkarte) this.drawNameTags(g, t, S);
    if (S.geld && S.hudOn !== null && t >= S.hudOn) for (const e of S.geld) this.drawMoney(g, t, e);
    if (S.follower) this.drawFollower(g, t, S.follower, S);
    if (S.ausweis) this.drawAusweis(g, t, S.ausweis, S);
    if (S.ziel && S.hudOn !== null && t >= S.hudOn && !S.endkarte) this.drawZiel(g, t, S.ziel, S);
    if (S.frage) this.drawQuestion(g, t, S.frage);
    if (S.endkarte) this.drawEndcard(g, t, S.endkarte, S);
    if (S.cta) this.drawCTA(g, t, S.cta);
    this.drawSubtitles(g, t, S.subtitle);
  }

  drawViewfinder(g, t, S) {
    const a = S.hudOn !== null ? 1 - smooth(S.hudOn, S.hudOn + 0.5, t) : 1;
    if (a <= 0) return;
    g.save(); g.globalAlpha = a * 0.85; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3;
    const m = 60, L = 56, top = 200, bot = H - 330;
    for (const [x, y, dx, dy] of [[m, top, 1, 1], [W - m, top, -1, 1], [m, bot, 1, -1], [W - m, bot, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y + dy * L); g.lineTo(x, y); g.lineTo(x + dx * L, y); g.stroke();
    }
    const blink = Math.sin(t * 6) > -0.2;
    if (blink) { g.fillStyle = C.red; g.beginPath(); g.arc(m + 30, top + 44, 10, 0, 7); g.fill(); }
    text(g, 'LIVE · SIMULATION', m + 52, top + 55, { size: 30, weight: 600, spacing: 3, shadow: 8 });
    text(g, S.stadt + ' · SEKTOR 0', W - m - 24, top + 55, { size: 26, weight: 500, align: 'right', color: C.mute, spacing: 2, shadow: 8 });
    g.restore();
  }

  drawHUD(g, t, S) {
    const lt = t - S.hudOn;
    const k = (d) => ease.outCubic(clamp((lt - d) / 0.55));
    const sc = (d) => clamp((lt - d) / 0.7);
    // Scan-Sweep beim Booten
    if (lt < 1.0) {
      const y = lerp(150, H - 300, ease.inOutSine(clamp(lt / 0.9)));
      const grd = g.createLinearGradient(0, y - 60, 0, y + 4);
      grd.addColorStop(0, 'rgba(69,227,255,0)'); grd.addColorStop(1, 'rgba(69,227,255,0.35)');
      g.fillStyle = grd; g.fillRect(0, y - 60, W, 64); g.fillStyle = 'rgba(160,245,255,0.9)'; g.fillRect(0, y, W, 2);
    }
    // ---- Obere Leiste
    const a1 = k(0.0); const ty = 205 - (1 - a1) * 40;
    g.save(); g.globalAlpha = a1;
    panel(g, 48, ty, 984, 128);
    text(g, scramble('TAG', sc(0.1), lt), 84, ty + 44, { size: 24, color: C.mute, spacing: 4 });
    text(g, String(S.tag), 84, ty + 106, { size: 62, weight: 700 });
    g.font = `700 62px ${F.hud}`; const tagW = g.measureText(String(S.tag)).width;
    text(g, '/ 7', 84 + tagW + 10, ty + 106, { size: 32, weight: 500, color: C.mute });
    g.fillStyle = 'rgba(140,225,255,0.22)'; g.fillRect(250, ty + 22, 2, 84); g.fillRect(540, ty + 22, 2, 84);
    text(g, scramble('VERBLEIBENDE TAGE', sc(0.2), lt + 1), 280, ty + 44, { size: 19, color: C.mute, spacing: 1.5 });
    text(g, String(S.verbleibend), 280, ty + 106, { size: 62, weight: 700, color: C.yellow });
    // Tagesbalken
    for (let i = 0; i < 7; i++) { const on = i < S.verbleibend; g.fillStyle = on ? 'rgba(255,216,74,0.85)' : 'rgba(255,255,255,0.15)'; g.fillRect(352 + i * 24, ty + 76, 18, 30); }
    text(g, scramble('KRIEGSBEGINN IN', sc(0.3), lt + 2), 576, ty + 44, { size: 21, color: 'rgba(255,140,140,0.85)', spacing: 2.5 });
    const cd = S.countdown; const blinkSep = (t % 1) < 0.5 ? ':' : ' ';
    const cdS = `${String(cd.d).padStart(2, '0')}T ${String(cd.h).padStart(2, '0')}${blinkSep}${String(cd.m).padStart(2, '0')}${blinkSep}${String(cd.s).padStart(2, '0')}`;
    text(g, cdS, 576, ty + 104, { size: 54, weight: 700, color: C.red, spacing: 1 });
    g.restore();

    // ---- Linke Statistik-Karten
    const cards = [
      { ic: 'person', label: 'EINWOHNER', val: fmt(S.einwohner), col: S.einwohnerSim ? C.cyan : C.white, tag: S.einwohnerSim ? 'SIMULATION' : null },
      { ic: 'coin', label: 'STADTKASSE', val: `${fmt(S.kasse)} ${S.waehrung}`, col: C.white },
      { ic: 'build', label: 'GEBÄUDE', val: fmt(S.gebaeude), col: C.white },
      { ic: 'chart', label: 'STADTENTWICKLUNG', val: `${Math.round(S.entwicklung)} %`, col: C.white, bar: S.entwicklung / 100, sub: S.stufe },
    ];
    cards.forEach((c, i) => {
      const a = k(0.15 + i * 0.1); if (a <= 0) return;
      const x = 48 - (1 - a) * 80, y = 356 + i * 112, w = 392, h = 98;
      g.save(); g.globalAlpha = a;
      panel(g, x, y, w, h, 1, i === 0 ? C.orange : C.cyan);
      icon(g, c.ic, x + 44, y + 50, 40, i === 0 ? C.orange : C.cyan);
      text(g, scramble(c.label, sc(0.25 + i * 0.1), lt + i), x + 86, y + 36, { size: 21, color: C.mute, spacing: 2.5 });
      text(g, c.val, x + 86, y + 80, { size: 40, weight: 700, color: c.col });
      if (c.tag) { g.save(); const tw = 150; rr(g, x + w - tw - 16, y + 52, tw, 32, 8); g.fillStyle = 'rgba(69,227,255,0.18)'; g.fill(); g.strokeStyle = C.cyan; g.lineWidth = 1.5; g.stroke();
        text(g, c.tag, x + w - tw / 2 - 16, y + 75, { size: 18, align: 'center', color: C.cyan, spacing: 2 }); g.restore(); }
      if (c.bar !== undefined) {
        const bx = x + 230, by = y + 64, bw = 140; g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(bx, by, bw, 10);
        g.fillStyle = C.cyan; g.fillRect(bx, by, Math.max(3, bw * c.bar), 10);
        text(g, c.sub, bx + bw, by - 10, { size: 17, color: 'rgba(255,140,140,0.9)', align: 'right', spacing: 1.5 });
      }
      g.restore();
    });
    // Einwohner-Puls bei Änderung
    if (S.einwohnerPulse > 0) { g.save(); g.globalAlpha = S.einwohnerPulse; g.strokeStyle = C.cyan; g.lineWidth = 4; rr(g, 44, 352, 400, 106, 16); g.stroke(); g.restore(); }

    // ---- Minimap
    const am = k(0.45);
    if (am > 0 && this.minimap) {
      const x = 792, y = 356, s = 240;
      g.save(); g.globalAlpha = am;
      panel(g, x - 8, y - 8, s + 16, s + 50);
      g.save(); rr(g, x, y, s, s, 8); g.clip(); g.drawImage(this.minimap.c, x, y);
      const ms = this.minimap.s; const px = (wx) => x + 120 + wx * ms; const pz = (wz) => y + 120 + wz * ms;
      // Kamera-Kegel
      const cp = S.cam; const yaw = Math.atan2(cp.dx, cp.dz);
      g.fillStyle = 'rgba(69,227,255,0.22)'; g.beginPath(); g.moveTo(px(cp.x), pz(cp.z));
      const hf = 0.5; g.lineTo(px(cp.x) + Math.sin(yaw - hf) * 60, pz(cp.z) + Math.cos(yaw - hf) * 60); g.lineTo(px(cp.x) + Math.sin(yaw + hf) * 60, pz(cp.z) + Math.cos(yaw + hf) * 60); g.closePath(); g.fill();
      g.fillStyle = C.cyan; g.beginPath(); g.arc(px(cp.x), pz(cp.z), 4, 0, 7); g.fill();
      // Spieler
      const pr = 5 + 3 * (0.5 + 0.5 * Math.sin(t * 5));
      g.strokeStyle = C.orange; g.lineWidth = 2; g.beginPath(); g.arc(px(S.player.x), pz(S.player.z), pr + 4, 0, 7); g.stroke();
      g.fillStyle = C.orange; g.beginPath(); g.arc(px(S.player.x), pz(S.player.z), 5, 0, 7); g.fill();
      g.restore();
      text(g, scramble('KARTE · VALENHEIM', sc(0.5), lt + 5), x + 4, y + s + 30, { size: 18, color: C.mute, spacing: 2 });
      g.restore();
    }
  }

  drawCallout(g, t, c, S) {
    const lt = t - c.t; const a = clamp(lt / 0.25) * (1 - smooth(c.dauer - 0.3, c.dauer, lt));
    if (a <= 0) return;
    const p = S.project(c.anker); if (!p.visible) return;
    const x = clamp(p.x, 80, W - 420), y = clamp(p.y, S.hudOn !== null && t >= S.hudOn ? 900 : 420, H - 520);
    const lk = ease.outCubic(clamp(lt / 0.4));
    g.save(); g.globalAlpha = a;
    // Punkt + Puls
    g.fillStyle = C.cyan; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.strokeStyle = C.cyan; g.lineWidth = 2; const pr = 10 + ((lt * 1.6) % 1) * 26; g.globalAlpha = a * (1 - ((lt * 1.6) % 1)); g.beginPath(); g.arc(x, y, pr, 0, 7); g.stroke(); g.globalAlpha = a;
    // Leitlinie
    const x1 = x + 50 * lk, y1 = y - 70 * lk, x2 = x1 + 70 * lk;
    g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.lineTo(x2, y1); g.stroke();
    if (lk > 0.6) {
      const ka = clamp((lt - 0.25) / 0.5);
      g.font = `700 36px ${F.hud}`; const tw = Math.max(g.measureText(c.titel).width, (g.font = `600 24px ${F.hud}`, g.measureText(c.unter).width)) + 40;
      panel(g, x2, y1 - 52, tw, 100, ka);
      text(g, scramble(c.titel, clamp((lt - 0.25) / 0.5), lt), x2 + 20, y1 - 10, { size: 36, weight: 700, alpha: ka, spacing: 2 });
      text(g, scramble(c.unter, clamp((lt - 0.4) / 0.6), lt + 3), x2 + 20, y1 + 28, { size: 24, color: c.farbe || C.cyan, alpha: ka, spacing: 1.5 });
    }
    g.restore();
  }

  drawPlayerLabel(g, t, S) {
    const p = S.project(S.playerHead); if (!p.visible) return;
    const a = S.playerLabel.a; if (a <= 0 || p.y < 420 || p.y > 1220 || S.alarm && t - S.alarm.t < S.alarm.dauer) return;
    const y = clamp(p.y - 50, 380, H - 500), x = clamp(p.x, 120, W - 120);
    g.save(); g.globalAlpha = a;
    g.strokeStyle = C.orange; g.lineWidth = 2; g.beginPath(); g.moveTo(x, p.y - 12); g.lineTo(x, y + 8); g.stroke();
    rr(g, x - 64, y - 44, 128, 50, 25); g.fillStyle = C.orange; g.fill();
    text(g, 'ICH', x, y - 8, { size: 32, weight: 800, align: 'center', color: '#1a0d04', font: F.big, spacing: 2 });
    g.restore();
  }

  drawPlusOne(g, t, p, S) {
    const lt = t - p.t; if (lt < 0 || lt > 2.2) return;
    const q = S.project(p.pos); if (!q.visible) return;
    const a = clamp(lt / 0.2) * (1 - smooth(1.6, 2.2, lt));
    g.save(); g.globalAlpha = a;
    const y = q.y - 40 - lt * 60;
    rr(g, q.x - 120, y - 40, 240, 54, 27); g.fillStyle = 'rgba(6,30,40,0.75)'; g.fill(); g.strokeStyle = C.cyan; g.lineWidth = 2; g.stroke();
    text(g, '+1 EINWOHNER', q.x, y - 4, { size: 28, weight: 700, align: 'center', color: C.cyan, spacing: 1.5 });
    g.restore();
  }

  drawScan(g, t, sc, S) {
    const lt = t - sc.t; if (lt < 0 || lt > sc.dauer) return;
    const a = clamp(lt / 0.2) * (1 - smooth(sc.dauer - 0.4, sc.dauer, lt));
    g.save(); g.globalAlpha = a;
    const pp = S.project(S.playerFeet); const cx = pp.x, cy = pp.y, R = 330;
    // Radar
    g.save(); g.translate(cx, cy); g.scale(1, 0.32); g.translate(-cx, -cy);
    g.strokeStyle = 'rgba(69,227,255,0.45)'; g.lineWidth = 3;
    for (const r of [R * 0.33, R * 0.66, R]) { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
    const ang = lt * 4.2;
    const grd = g.createConicGradient ? g.createConicGradient(ang - 1.0, cx, cy) : null;
    if (grd) { grd.addColorStop(0, 'rgba(69,227,255,0)'); grd.addColorStop(0.16, 'rgba(69,227,255,0.35)'); grd.addColorStop(0.161, 'rgba(69,227,255,0)'); grd.addColorStop(1, 'rgba(69,227,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); }
    g.strokeStyle = C.cyan; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); g.stroke();
    g.restore();
    const done = lt > sc.dauer * 0.5;
    const px = W / 2, py = 330; const R2 = 0;
    panel(g, px - 330, py + R2 + 30, 660, 110, 1, done ? C.red : C.cyan);
    const dots = '.'.repeat(1 + Math.floor(lt * 4) % 3);
    text(g, done ? sc.text.replace('…', '') : sc.text.replace('…', dots), px, py + 74, { size: 30, align: 'center', color: C.mute, spacing: 2 });
    text(g, done ? sc.ergebnis : `${Math.floor(clamp(lt / (sc.dauer * 0.5)) * 100)} %`, px, py + 118, { size: 40, weight: 700, align: 'center', color: done ? C.red : C.cyan, spacing: 3 });
    g.restore();
  }

  drawSimLabel(g, t, s) {
    const lt = t - s.t; if (lt < 0) return; const a = clamp(lt / 0.3) * s.a;
    g.save(); g.globalAlpha = a; const y = 1490;
    rr(g, W / 2 - 280, y - 40, 560, 56, 28); g.fillStyle = 'rgba(6,30,40,0.7)'; g.fill(); g.strokeStyle = C.cyan; g.lineWidth = 2; g.setLineDash([10, 6]); g.stroke(); g.setLineDash([]);
    text(g, s.text, W / 2, y - 3, { size: 25, weight: 600, align: 'center', color: C.cyan, spacing: 2.5 });
    g.restore();
  }

  drawTitle(g, t, s, hudSichtbar = false) {
    const lt = t - s.t; if (lt < 0 || lt > s.dauer) return;
    const a = clamp(lt / 0.3) * (1 - smooth(s.dauer - 0.45, s.dauer, lt));
    g.save(); g.globalAlpha = a;
    const y = hudSichtbar ? 1060 : 700; const sp = lerp(22, 3, ease.outCubic(clamp(lt / 1.2)));
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y - 150, W, 260);
    text(g, s.unter, W / 2, y - 92, { size: 30, weight: 600, align: 'center', color: C.orange, spacing: 6, shadow: 10 });
    g.font = `900 82px ${F.big}`; const tfit = Math.min(1, 960 / (g.measureText(s.text).width + sp * s.text.length));
    g.save(); g.translate(W / 2, y + 10); g.scale(tfit, tfit);
    text(g, s.text, 0, 0, { size: 82, weight: 900, font: F.big, align: 'center', spacing: sp, shadow: 24 });
    g.restore();
    g.fillStyle = C.red; const lw = 360 * ease.outCubic(clamp((lt - 0.3) / 0.6)); g.fillRect(W / 2 - lw / 2, y + 44, lw, 6);
    g.restore();
  }

  drawAlarm(g, t, s) {
    const lt = t - s.t; if (lt < 0 || lt > s.dauer) return;
    const a = clamp(lt / 0.1) * (1 - smooth(s.dauer - 0.4, s.dauer, lt));
    const pulse = 0.5 + 0.5 * Math.sin(lt * 10);
    g.save();
    // roter Rand
    const grd = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
    grd.addColorStop(0, 'rgba(255,0,0,0)'); grd.addColorStop(1, `rgba(255,20,20,${0.55 * a * (0.6 + 0.4 * pulse)})`);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.globalAlpha = a;
    const y = 760; const hk = ease.outBack(clamp(lt / 0.35));
    g.save(); g.translate(W / 2, y); g.scale(1, Math.max(0.01, hk));
    g.fillStyle = 'rgba(30,0,0,0.78)'; g.fillRect(-W / 2, -120, W, 240);
    // Warnstreifen
    g.save(); g.beginPath(); g.rect(-W / 2, -120, W, 22); g.rect(-W / 2, 98, W, 22); g.clip();
    for (let x = -W / 2 - 60 + ((lt * 120) % 60); x < W / 2 + 60; x += 60) { g.fillStyle = C.red; g.beginPath(); g.moveTo(x, -120); g.lineTo(x + 30, -120); g.lineTo(x + 30 - 22, 120); g.lineTo(x - 22, 120); g.fill(); }
    g.restore();
    icon(g, 'warn', -250, -30, 70, C.red);
    text(g, s.text, -190, -6, { size: 78, weight: 900, font: F.big, color: pulse > 0.3 ? C.red : '#ff8080', spacing: 6 });
    text(g, s.unter, 0, 66, { size: 42, weight: 700, align: 'center', color: C.white, spacing: 3 });
    g.restore();
    g.restore();
  }

  drawHint(g, t, s) {
    const lt = t - s.t; if (lt < 0 || lt > s.dauer) return;
    const a = clamp(lt / 0.2) * (1 - smooth(s.dauer - 0.3, s.dauer, lt));
    const k = ease.outBack(clamp(lt / 0.4));
    g.save(); g.globalAlpha = a; g.translate(W / 2, 1000); g.scale(k, k);
    rr(g, -400, -60, 800, 104, 52); const grd = g.createLinearGradient(-400, 0, 400, 0); grd.addColorStop(0, '#ff8a3d'); grd.addColorStop(1, '#ff4f6d');
    g.fillStyle = grd; g.fill();
    icon(g, 'person', -345, -6, 48, '#fff');
    text(g, s.text, 36, 12, { size: 44, weight: 900, font: F.big, align: 'center', spacing: 1 });
    g.restore();
  }

  // Zuschauer-Kommentare (Folge 2+): Karten gleiten nacheinander herein
  drawComments(g, t, s, S = {}) {
    const lt = t - s.t; const d = s.dauer || 4;
    const out = 1 - smooth(d - 0.35, d, lt);
    (s.liste || []).slice(0, 4).forEach((c, i) => {
      const k = ease.outBack(clamp((lt - i * 0.35) / 0.45)); if (k <= 0) return;
      const y = 880 + i * 128, x = 70 + (1 - k) * -700;
      g.save(); g.globalAlpha = out * clamp((lt - i * 0.35) / 0.2);
      rr(g, x, y, 860, 108, 22); g.fillStyle = 'rgba(255,255,255,0.94)'; g.fill();
      const img = c.avatar && S.bilder ? S.bilder[c.avatar] : null;
      if (img) avatar(g, img, x + 56, y + 54, 36, '#ffffff');
      else { g.fillStyle = ['#ff8a3d', '#45e3ff', '#ff3b5c', '#ffd84a'][i % 4]; g.beginPath(); g.arc(x + 56, y + 54, 32, 0, 7); g.fill();
        text(g, (c.name || '?').replace(/^@/, '').slice(0, 1).toUpperCase(), x + 56, y + 66, { size: 34, weight: 800, align: 'center', font: F.big, color: '#111' }); }
      text(g, c.anzeige || ('@' + String(c.name || 'zuschauer').replace(/^@/, '')), x + 106, y + 42, { size: 24, weight: 700, color: 'rgba(0,0,0,0.55)', font: F.big });
      text(g, c.text || '', x + 106, y + 84, { size: 34, weight: 800, color: '#111', font: F.big });
      if (c.likes) { icon(g, 'bubble', x + 800, y + 40, 26, '#ff3b5c'); text(g, String(c.likes), x + 800, y + 88, { size: 22, weight: 700, align: 'center', color: 'rgba(0,0,0,0.6)', font: F.big }); }
      g.restore();
    });
  }

  // Namensschilder über benannten Einwohnern (mit Profilbild)
  drawNameTags(g, t, S) {
    for (const n of S.namen) {
      const p = S.project(n.pos); if (!p.visible) continue;
      const d = Math.hypot(S.camPos.x - n.pos[0], S.camPos.y - n.pos[1], S.camPos.z - n.pos[2]); if (d > 48) continue;
      if (p.y < 420 || p.y > 1240) continue;
      const a = clamp((t - n.t0 - 0.5) / 0.4) * (1 - smooth(34, 48, d));
      if (a <= 0) continue;
      const k = ease.outBack(clamp((t - n.t0 - 0.5) / 0.45));
      g.save(); g.globalAlpha = a; g.translate(clamp(p.x, 150, W - 150), p.y - 30); g.scale(k, k);
      g.font = `800 34px ${F.big}`; const tw = g.measureText(n.name).width;
      const w = tw + 120; rr(g, -w / 2, -40, w, 64, 32); g.fillStyle = 'rgba(8,16,22,0.82)'; g.fill(); g.strokeStyle = C.cyan; g.lineWidth = 2.5; g.stroke();
      avatar(g, S.bilder[n.avatar], -w / 2 + 34, -8, 26, C.cyan);
      text(g, n.name, -w / 2 + 70, 4, { size: 34, weight: 800, font: F.big });
      if (n.nr) text(g, '#' + n.nr, w / 2 - 14, 2, { size: 22, weight: 700, align: 'right', color: C.cyan });
      g.strokeStyle = C.cyan; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 24); g.lineTo(0, 46); g.stroke();
      g.restore();
    }
  }

  // Geldbewegung an der Stadtkasse (+/- Betrag)
  drawMoney(g, t, e) {
    const lt = t - e.t; const plus = e.betrag >= 0;
    const a = clamp(lt / 0.15) * (1 - smooth(1.8, 2.4, lt));
    const k = ease.outBack(clamp(lt / 0.35));
    g.save(); g.globalAlpha = a;
    // Karte hervorheben
    g.strokeStyle = plus ? '#3cff8f' : C.red; g.lineWidth = 4; rr(g, 44, 464, 400, 106, 16); g.stroke();
    g.translate(470, 530 - lt * 22); g.scale(k, k);
    const s = `${plus ? '+' : '−'}${fmt(Math.abs(e.betrag))} €`;
    g.font = `900 58px ${F.big}`; const tw = g.measureText(s).width;
    rr(g, -12, -52, tw + 24, 72, 18); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill();
    text(g, s, 0, 2, { size: 58, weight: 900, font: F.big, color: plus ? '#3cff8f' : '#ff5050', shadow: 14 });
    if (e.text) text(g, e.text, 0, 46, { size: 24, weight: 700, color: C.white, spacing: 1.5, shadow: 8 });
    g.restore();
  }

  // Karte "Neuer Follower = neuer Einwohner" mit Profilbild
  drawFollower(g, t, e, S) {
    const lt = t - e.t; const d = e.dauer || 3;
    const a = clamp(lt / 0.2) * (1 - smooth(d - 0.35, d, lt));
    const k = ease.outBack(clamp(lt / 0.5));
    g.save(); g.globalAlpha = a; g.translate(W / 2, 930); g.scale(k, k);
    rr(g, -400, -190, 800, 360, 36); const grd = g.createLinearGradient(-400, -190, 400, 170); grd.addColorStop(0, 'rgba(10,22,30,0.92)'); grd.addColorStop(1, 'rgba(30,12,30,0.92)');
    g.fillStyle = grd; g.fill(); g.strokeStyle = C.cyan; g.lineWidth = 3; g.stroke();
    // Glanz-Ring
    g.save(); g.translate(-230, -10); g.rotate(lt * 1.5); g.strokeStyle = 'rgba(69,227,255,0.7)'; g.lineWidth = 5; g.setLineDash([24, 14]); g.beginPath(); g.arc(0, 0, 122, 0, 7); g.stroke(); g.restore();
    avatar(g, S.bilder[e.avatar], -230, -10, 108, '#ffffff');
    text(g, e.text || 'NEUER FOLLOWER', -80, -96, { size: 30, weight: 700, color: C.cyan, spacing: 3 });
    g.font = `900 92px ${F.big}`; const fit = Math.min(1, 440 / g.measureText(e.name).width);
    g.save(); g.translate(-80, 10); g.scale(fit, fit); text(g, e.name, 0, 0, { size: 92, weight: 900, font: F.big }); g.restore();
    rr(g, -80, 46, 400, 64, 32); g.fillStyle = C.orange; g.fill();
    text(g, e.unter || 'NEUER EINWOHNER', 120, 89, { size: 30, weight: 800, align: 'center', font: F.big, color: '#1a0d04', spacing: 1 });
    g.restore();
  }

  // Einwohnerausweis mit Scan + Stempel
  drawAusweis(g, t, e, S) {
    const lt = t - e.t; const d = e.dauer || 1.1;
    const a = clamp(lt / 0.12) * (1 - smooth(d - 0.12, d, lt));
    const k = ease.outBack(clamp(lt / 0.25));
    g.save(); g.globalAlpha = a; g.translate(W / 2 + (1 - k) * 300, 900); g.rotate(-0.04); g.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
    const cw = 760, ch = 460;
    rr(g, -cw / 2, -ch / 2, cw, ch, 30);
    const grd = g.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2);
    if (e.ok) { grd.addColorStop(0, '#eef4ff'); grd.addColorStop(1, '#c9dbff'); } else { grd.addColorStop(0, '#3a3a3a'); grd.addColorStop(1, '#1d1d1d'); }
    g.fillStyle = grd; g.fill(); g.lineWidth = 4; g.strokeStyle = e.ok ? '#1f3d8a' : '#666'; g.stroke();
    // Kopfzeile
    g.save(); rr(g, -cw / 2, -ch / 2, cw, 86, 30); g.clip(); g.fillStyle = e.ok ? '#1f3d8a' : '#444'; g.fillRect(-cw / 2, -ch / 2, cw, 86); g.restore();
    text(g, 'VALENHEIM', -cw / 2 + 36, -ch / 2 + 56, { size: 40, weight: 900, font: F.big, color: '#f2c230', spacing: 3 });
    text(g, 'EINWOHNERAUSWEIS', cw / 2 - 36, -ch / 2 + 54, { size: 26, weight: 700, align: 'right', color: '#ffffff', spacing: 2 });
    if (e.ok) {
      g.save(); rr(g, -cw / 2 + 36, -ch / 2 + 116, 200, 240, 16); g.clip();
      const img = S.bilder[e.avatar]; if (img) g.drawImage(img, -cw / 2 + 36 - 20, -ch / 2 + 116, 240, 240); g.restore();
      text(g, 'NAME', -cw / 2 + 270, -ch / 2 + 150, { size: 22, weight: 700, color: '#5a6a8a', spacing: 2 });
      g.font = `900 66px ${F.big}`; const nf = Math.min(1, 420 / g.measureText(e.name).width);
      g.save(); g.translate(-cw / 2 + 270, -ch / 2 + 214); g.scale(nf, nf); text(g, e.name, 0, 0, { size: 66, weight: 900, font: F.big, color: '#0b1a40' }); g.restore();
      text(g, 'EINWOHNER-NR.', -cw / 2 + 270, -ch / 2 + 270, { size: 22, weight: 700, color: '#5a6a8a', spacing: 2 });
      text(g, '#' + String(e.nr).padStart(4, '0'), -cw / 2 + 270, -ch / 2 + 324, { size: 52, weight: 800, color: '#0b1a40' });
      for (let k2 = 0; k2 < 34; k2++) { g.fillStyle = '#0b1a40'; g.fillRect(-cw / 2 + 270 + k2 * 12, ch / 2 - 70, (k2 * 7) % 3 + 2, 40); }
    } else {
      text(g, '?', -cw / 2 + 136, 40, { size: 220, weight: 900, font: F.big, align: 'center', color: '#777' });
      text(g, 'KEIN AUSWEIS', -cw / 2 + 270, -20, { size: 54, weight: 900, font: F.big, color: '#bbbbbb' });
      text(g, 'NICHT REGISTRIERT', -cw / 2 + 270, 40, { size: 30, weight: 700, color: '#999', spacing: 2 });
    }
    // Scan-Laser
    if (lt < 0.45) { const y = -ch / 2 + (lt / 0.45) * ch; g.fillStyle = 'rgba(255,40,40,0.85)'; g.fillRect(-cw / 2 - 20, y, cw + 40, 5); g.fillStyle = 'rgba(255,40,40,0.18)'; g.fillRect(-cw / 2 - 20, y - 30, cw + 40, 30); }
    // Stempel
    if (lt >= 0.45) {
      const sk = ease.outBack(clamp((lt - 0.45) / 0.18)); const col = e.ok ? '#18c964' : '#ff2a2a';
      g.save(); g.translate(150, 60); g.rotate(-0.18); g.scale(2.2 - 1.2 * sk, 2.2 - 1.2 * sk); g.globalAlpha *= clamp((lt - 0.45) / 0.1);
      const txt = e.ok ? 'ZUGANG GEWÄHRT' : 'ZUGANG VERWEIGERT';
      g.font = `900 50px ${F.big}`; const tw = g.measureText(txt).width;
      g.lineWidth = 8; g.strokeStyle = col; rr(g, -tw / 2 - 26, -48, tw + 52, 92, 14); g.stroke();
      g.fillStyle = e.ok ? 'rgba(24,201,100,0.12)' : 'rgba(255,42,42,0.15)'; g.fill();
      text(g, txt, 0, 18, { size: 50, weight: 900, font: F.big, align: 'center', color: col });
      g.restore();
    }
    g.restore();
  }

  // Zielbalken unter der Karte: Überraschung bei X Followern
  drawZiel(g, t, z, S) {
    const a = clamp((t - (z.t0 ?? -9)) / 0.4); if (a <= 0) return;
    const x = 784, y = 652, w = 256, h = 96; const cur = Math.round(S.einwohner), ziel = z.ziel || 50;
    g.save(); g.globalAlpha = a;
    panel(g, x, y, w, h, 1, C.yellow);
    text(g, z.text || '🎁 ÜBERRASCHUNG', x + 16, y + 30, { size: 19, weight: 700, color: C.yellow, spacing: 1.5 });
    g.fillStyle = 'rgba(255,255,255,0.12)'; rr(g, x + 16, y + 46, w - 32, 16, 8); g.fill();
    const k = clamp(cur / ziel); const pulse = 0.75 + 0.25 * Math.sin(t * 4);
    g.fillStyle = `rgba(255,216,74,${pulse})`; rr(g, x + 16, y + 46, Math.max(16, (w - 32) * k), 16, 8); g.fill();
    text(g, `${cur} / ${ziel} FOLLOWER`, x + 16, y + 84, { size: 20, weight: 700, color: C.white, spacing: 1 });
    g.restore();
  }

  drawQuestion(g, t, s) {
    const lt = t - s.t; if (lt < 0 || lt > s.dauer) return;
    const a = clamp(lt / 0.25) * (1 - smooth(s.dauer - 0.3, s.dauer, lt));
    g.save(); g.globalAlpha = a;
    const k = ease.outBack(clamp(lt / 0.45));
    g.font = `900 72px ${F.big}`; const fit = Math.min(1, 980 / g.measureText(s.text).width);
    g.translate(W / 2, 905); g.scale(k * fit, k * fit);
    text(g, s.text, 0, 0, { size: 72, weight: 900, font: F.big, align: 'center', shadow: 26, color: C.yellow });
    g.restore();
  }

  drawEndcard(g, t, e, S) {
    const lt = t - e.t; if (lt < 0) return;
    const a = clamp(lt / 0.35);
    g.save(); g.globalAlpha = a;
    g.fillStyle = `rgba(0,0,0,${0.35 * a})`; g.fillRect(0, 0, W, H);
    const k = ease.outCubic(clamp(lt / 0.6));
    const y0 = (e.kasse !== null && e.kasse !== undefined ? 420 : 500) + (1 - k) * 60;
    panel(g, 120, y0, 840, e.kasse !== null && e.kasse !== undefined ? 560 : 470, 1, C.orange);
    text(g, 'VALENHEIM · STATUS', W / 2, y0 + 60, { size: 26, align: 'center', color: C.mute, spacing: 6 });
    const tagK = ease.outBack(clamp((lt - 0.1) / 0.5));
    g.save(); g.translate(W / 2, y0 + 190); g.scale(tagK, tagK);
    text(g, `TAG ${e.tag}`, 0, 0, { size: 150, weight: 900, font: F.big, align: 'center', shadow: 30, spacing: 4 });
    g.restore();
    g.fillStyle = 'rgba(140,225,255,0.25)'; g.fillRect(180, y0 + 238, 720, 2);
    const r1 = clamp((lt - 0.45) / 0.4), r2 = clamp((lt - 0.75) / 0.4);
    text(g, 'EINWOHNER:', 200, y0 + 320, { size: 46, weight: 600, alpha: r1, color: C.mute, spacing: 2 });
    text(g, fmt(e.einwohner), 880, y0 + 320, { size: 62, weight: 700, alpha: r1, align: 'right', color: C.cyan });
    text(g, 'VERBLEIBENDE TAGE:', 200, y0 + 410, { size: 46, weight: 600, alpha: r2, color: C.mute, spacing: 2 });
    text(g, String(e.verbleibend), 880, y0 + 410, { size: 62, weight: 700, alpha: r2, align: 'right', color: C.red });
    if (e.kasse !== null && e.kasse !== undefined) { const r3 = clamp((lt - 1.05) / 0.4);
      text(g, 'STADTKASSE:', 200, y0 + 500, { size: 46, weight: 600, alpha: r3, color: C.mute, spacing: 2 });
      text(g, `${fmt(e.kasse)} ${e.waehrung || '€'}`, 880, y0 + 500, { size: 62, weight: 700, alpha: r3, align: 'right', color: '#3cff8f' }); }
    g.restore();
  }

  drawCTA(g, t, c) {
    const lt = t - c.t; if (lt < 0) return;
    const a = clamp(lt / 0.3); const bounce = Math.sin(lt * 5) * 6 * clamp(lt - 0.6);
    g.save(); g.globalAlpha = a; g.translate(W / 2, 1060 + bounce); const k = ease.outBack(clamp(lt / 0.45)); g.scale(k, k);
    rr(g, -420, -52, 840, 100, 50); g.fillStyle = '#ffffff'; g.fill();
    icon(g, 'bubble', -350, -4, 58, '#ff3b5c');
    text(g, 'IDEEN IN DIE KOMMENTARE!', 34, 16, { size: 44, weight: 900, font: F.big, align: 'center', color: '#111', spacing: 0.5 });
    g.restore();
    const a2 = clamp((lt - 0.5) / 0.3);
    if (a2 > 0) { g.save(); g.globalAlpha = a2; g.translate(W / 2, 1172); rr(g, -330, -38, 660, 72, 36); g.fillStyle = '#ff3b5c'; g.fill();
      text(g, '+ FOLGEN = NEUER EINWOHNER', 0, 12, { size: 34, weight: 800, font: F.big, align: 'center', spacing: 1 }); g.restore(); }
  }

  drawSubtitles(g, t, sub) {
    if (!sub) return;
    const lt = t - sub.t0;
    const pop = ease.outBack(clamp(lt / 0.16));
    const fade = 1 - smooth(sub.t1 - 0.08, sub.t1, t);
    if (fade <= 0) return;
    const size = 84;
    g.save();
    g.font = `900 ${size}px ${F.big}`;
    const words = sub.woerter.map((w) => ({ ...w, s: w.text.toUpperCase() }));
    const space = size * 0.3;
    // Zeilenumbruch bei Bedarf
    const lines = [[]]; let lw = 0;
    for (const w of words) { const ww = g.measureText(w.s).width * (w.farbe ? 1.1 : 1); if (lw + ww > 900 && lines[lines.length - 1].length) { lines.push([]); lw = 0; } lines[lines.length - 1].push({ ...w, ww }); lw += ww + space; }
    const baseY = sub.y || 1340; const lh = size * 1.12;
    g.translate(W / 2, baseY); g.scale(lerp(0.82, 1, pop), lerp(0.82, 1, pop)); g.globalAlpha = fade * clamp(lt / 0.06);
    lines.forEach((ln, li) => {
      const total = ln.reduce((s, w) => s + w.ww, 0) + space * (ln.length - 1);
      let x = -total / 2; const y = (li - (lines.length - 1) / 2) * lh;
      for (const w of ln) {
        const active = t >= w.t0 - 0.02;
        const col = w.farbe === 'gelb' ? C.yellow : w.farbe === 'rot' ? '#ff4040' : '#ffffff';
        const wk = w.farbe ? ease.outBack(clamp((t - w.t0 + 0.05) / 0.2)) : 1;
        g.save(); g.translate(x + w.ww / 2, y); if (w.farbe) g.scale(lerp(0.9, 1.08, wk), lerp(0.9, 1.08, wk));
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
        g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
        g.lineWidth = 14; g.strokeStyle = '#000'; g.strokeText(w.s, 0, 0);
        g.shadowColor = 'transparent';
        g.fillStyle = active ? col : 'rgba(255,255,255,0.55)'; g.fillText(w.s, 0, 0);
        g.restore();
        x += w.ww + space;
      }
    });
    g.restore();
  }
}
