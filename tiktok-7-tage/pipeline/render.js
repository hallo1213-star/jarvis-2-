#!/usr/bin/env node
// Schritt 3: Frames im Headless-Chromium (Three.js/WebGL) rendern und mit ffmpeg zu MP4 kodieren.
// Nutzung:
//   node pipeline/render.js 1                       -> komplettes Video (ohne Ton) build/folge-01/video_stumm.mp4
//   node pipeline/render.js 1 --bilder 0.5,7,12     -> Standbilder nach build/folge-01/vorschau/
//   Optionen: --fps 30  --scale 1  --worker 2  --von 0 --bis <dauer>
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const nr = String(parseInt(args[0] || '1', 10)).padStart(2, '0');
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const FPS = Number(opt('fps', 30)); const SCALE = Number(opt('scale', 1)); const WORKERS = Number(opt('worker', 2));
const OUT = path.join(ROOT, 'build', `folge-${nr}`);

// Serienstand VOR dieser Folge einfrieren (damit Re-Renders identisch bleiben)
const frozen = path.join(OUT, 'status_vorher.json');
if (!fs.existsSync(frozen)) fs.copyFileSync(path.join(ROOT, 'serie', 'stadt-status.json'), frozen);

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' };
function server() {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(ROOT)) { r.statusCode = 403; return r.end(); }
      r.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
      fs.createReadStream(f).on('error', () => { r.statusCode = 404; r.end(); }).pipe(r);
    }).listen(0, () => res(s));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[browser]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/engine/index.html?folge=${nr}&scale=${SCALE}`);
  await page.waitForFunction('window.READY || window.FEHLER', null, { timeout: 180000 });
  const err = await page.evaluate('window.FEHLER'); if (err) throw new Error(err);
  return page;
}

(async () => {
  const srv = await server(); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
  const bilder = opt('bilder', null);
  if (bilder) {
    const page = await openPage(browser, port);
    const dir = path.join(OUT, 'vorschau'); fs.mkdirSync(dir, { recursive: true });
    for (const t of bilder.split(',').map(Number)) {
      const t0 = Date.now();
      const url = await page.evaluate((t) => window.renderFrame(t, 0.9), t);
      fs.writeFileSync(path.join(dir, `bild_${t.toFixed(2)}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
      console.log(`Bild t=${t}s (${Date.now() - t0} ms)`);
    }
    await browser.close(); srv.close(); return;
  }
  const probe = await openPage(browser, port);
  const dauer = await probe.evaluate('window.DAUER'); await probe.close();
  const von = Number(opt('von', 0)), bis = Number(opt('bis', dauer));
  const n0 = Math.round(von * FPS), n1 = Math.round(bis * FPS);
  const per = Math.ceil((n1 - n0) / WORKERS);
  console.log(`Rendere Folge ${nr}: ${(n1 - n0)} Frames @${FPS} fps, ${WORKERS} Worker`);
  const tStart = Date.now(); let done = 0;
  const segs = [];
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    const a = n0 + w * per, b = Math.min(n1, a + per); if (a >= b) return;
    const seg = path.join(OUT, `seg_${w}.mp4`); segs[w] = seg;
    const page = await openPage(browser, port);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-vf', 'scale=1080:1920:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-r', String(FPS), seg], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = a; f < b; f++) {
      const url = await page.evaluate((t) => window.renderFrame(t, 0.95), f / FPS);
      const buf = Buffer.from(url.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      done++;
      if (done % 30 === 0) { const el = (Date.now() - tStart) / 1000; console.log(`  ${done}/${n1 - n0} Frames, ${(el / done * 1000).toFixed(0)} ms/Frame, Rest ~${((n1 - n0 - done) * el / done / 60).toFixed(1)} min`); }
    }
    ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await page.close();
  }));
  const list = path.join(OUT, 'segmente.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(OUT, opt('ausgabe', 'video_stumm.mp4'))]);
  segs.filter(Boolean).forEach((s) => fs.unlinkSync(s));
  console.log(`Video (stumm) fertig in ${((Date.now() - tStart) / 60000).toFixed(1)} min -> ${path.join(OUT, 'video_stumm.mp4')}`);
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
