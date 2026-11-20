// AURIX Video Server – keeps API keys server-side, receives orders (app, ChatGPT, CLI),
// runs generation jobs, stores finished videos and serves them (with Range support).
//   npm run server        → http://127.0.0.1:8787
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, extname, normalize, sep } from 'node:path'
import { config, dirs, ROOT } from './config.js'
import { PROVIDERS } from './providers/index.js'
import { ffmpegAvailable } from './media.js'
import { openapi } from './openapi.js'
import {
  HttpError, cancelJob, confirmJob, createJob, deleteJob, getJob, listJobs, listModels, publicJob, rejectJob, spentToday, quote,
} from './jobs.js'

const MIME = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' }
const DIST = join(ROOT, 'dist')

// ------------------------------------------------------------------ auth
const tokenOf = (req) => {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : String(req.headers['x-api-key'] || '').trim()
}
// "Local" = direct loopback connection without proxy/tunnel headers. Tunnels (ngrok,
// cloudflared) connect from 127.0.0.1 but add forwarding headers → not treated as local.
const isLocal = (req) => {
  const a = req.socket.remoteAddress || ''
  const forwarded = req.headers['x-forwarded-for'] || req.headers.forwarded || req.headers['cf-connecting-ip'] || req.headers['x-real-ip']
  return !forwarded && (a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1')
}
function role(req) {
  const t = tokenOf(req)
  if (t && config.appToken && t === config.appToken) return 'app'
  if (t && config.intakeToken && t === config.intakeToken) return 'intake'
  if (!config.appToken && isLocal(req)) return 'app'
  return null
}
function need(req, allowed) {
  const r = role(req)
  if (!r) throw new HttpError(401, 'Nicht autorisiert – Token fehlt oder ist falsch')
  if (!allowed.includes(r)) throw new HttpError(403, 'Dieser Schlüssel darf diese Aktion nicht ausführen (Bestätigen geht nur in der App)')
  return r
}

// ------------------------------------------------------------------ helpers
function cors(req, res) {
  const o = req.headers.origin
  if (!o) return
  const okDev = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o)
  if (okDev || config.corsOrigins.includes(o) || config.corsOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', o)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  }
}
const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}
function readJson(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new HttpError(413, 'Anfrage zu groß')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new HttpError(400, 'Ungültiges JSON')) }
    })
    req.on('error', reject)
  })
}
const withLinks = (j, req) => {
  const base = config.publicUrl || `http://${req.headers.host}`
  const p = publicJob(j)
  return { ...p, app_url: `${base}/#/studio/${j.id}`, video: p.video && { ...p.video, url: base + p.video.url, poster: p.video.poster && base + p.video.poster } }
}

function serveFile(req, res, file, { cache = 'no-cache' } = {}) {
  if (!existsSync(file) || !statSync(file).isFile()) return false
  const { size } = statSync(file)
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream'
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache }
  if (new URL(req.url, 'http://x').searchParams.has('download')) headers['Content-Disposition'] = `attachment; filename="${file.split(sep).pop()}"`
  if (range) {
    let start = range[1] ? parseInt(range[1], 10) : size - parseInt(range[2], 10)
    let end = range[1] && range[2] ? parseInt(range[2], 10) : size - 1
    if (start >= size || start < 0 || end < start) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return true }
    end = Math.min(end, size - 1)
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
    createReadStream(file, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': size })
    if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res)
  }
  return true
}
const inside = (base, rel) => {
  const p = normalize(join(base, decodeURIComponent(rel)))
  return p.startsWith(base + sep) ? p : null
}

// ------------------------------------------------------------------ routes
async function handle(req, res) {
  cors(req, res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const url = new URL(req.url, 'http://x')
  const path = url.pathname
  const m = (re) => re.exec(path)
  let k

  if (path === '/api/video/health' && req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      ffmpeg: ffmpegAvailable(),
      providers: Object.values(PROVIDERS).map((p) => ({ id: p.id, name: p.name, configured: Boolean(p.configured()), keyHint: p.keyHint })),
      access: role(req) || 'none',
      appTokenRequired: Boolean(config.appToken),
      intakeConfigured: Boolean(config.intakeToken),
      limits: { maxCostPerJob: config.maxCostPerJob, dailyBudget: config.dailyBudget, spentToday: spentToday() },
      publicUrl: config.publicUrl || null,
    })
  }
  if (path === '/openapi.json' && req.method === 'GET') return send(res, 200, openapi(req))
  if (path === '/api/video/models' && req.method === 'GET') { need(req, ['app', 'intake']); return send(res, 200, { models: listModels() }) }

  if (path === '/api/video/quote' && req.method === 'POST') {
    need(req, ['app', 'intake'])
    const body = await readJson(req)
    delete body.image_base64 // price does not depend on the image; mode does
    return send(res, 200, quote({ ...body, ...(body.with_image ? { image_url: 'https://placeholder' } : {}) }))
  }
  if (path === '/api/video/jobs') {
    if (req.method === 'GET') {
      need(req, ['app', 'intake'])
      const limit = Math.min(200, Number(url.searchParams.get('limit')) || 100)
      return send(res, 200, { jobs: listJobs().slice(0, limit).map((j) => withLinks(j, req)) })
    }
    if (req.method === 'POST') {
      const r = need(req, ['app', 'intake'])
      const body = await readJson(req)
      const source = r === 'intake' ? (String(body.source || 'chatgpt').slice(0, 30)) : (String(body.source || 'app').slice(0, 30))
      const job = await createJob(body, source)
      return send(res, 201, withLinks(job, req))
    }
  }
  if ((k = m(/^\/api\/video\/jobs\/([\w-]+)$/))) {
    if (req.method === 'GET') {
      need(req, ['app', 'intake'])
      const j = getJob(k[1])
      if (!j) throw new HttpError(404, 'Auftrag nicht gefunden')
      return send(res, 200, withLinks(j, req))
    }
    if (req.method === 'DELETE') { need(req, ['app']); await deleteJob(k[1]); return send(res, 200, { ok: true }) }
  }
  if ((k = m(/^\/api\/video\/jobs\/([\w-]+)\/(confirm|reject|cancel)$/)) && req.method === 'POST') {
    need(req, ['app']) // ChatGPT's intake key can never start paid generations
    const body = await readJson(req)
    const fn = { confirm: () => confirmJob(k[1], { expected_cost_usd: body.expected_cost_usd }), reject: () => rejectJob(k[1]), cancel: () => cancelJob(k[1]) }[k[2]]
    return send(res, 200, withLinks(await fn(), req))
  }

  if ((k = m(/^\/media\/(videos|uploads)\/(.+)$/)) && (req.method === 'GET' || req.method === 'HEAD')) {
    const f = inside(dirs[k[1]], k[2])
    if (f && serveFile(req, res, f, { cache: 'public, max-age=31536000, immutable' })) return
    return send(res, 404, { error: 'Datei nicht gefunden' })
  }
  if (path.startsWith('/api/')) return send(res, 404, { error: 'Unbekannter Endpunkt' })

  // Serve the built app (npm run build) so one process hosts everything.
  if ((req.method === 'GET' || req.method === 'HEAD') && existsSync(DIST)) {
    const f = path === '/' ? join(DIST, 'index.html') : inside(DIST, path.slice(1))
    if (f && serveFile(req, res, f)) return
    if (serveFile(req, res, join(DIST, 'index.html'))) return
  }
  send(res, 404, { error: 'Nicht gefunden', hint: 'Frontend mit "npm run build" bauen oder "npm run dev" nutzen' })
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    const status = e.status || 500
    if (status >= 500) console.error(e)
    if (!res.headersSent) send(res, status, { error: e.message })
    else res.end()
  })
})

server.listen(config.port, config.host, () => {
  const configured = Object.values(PROVIDERS).filter((p) => p.configured()).map((p) => p.name)
  console.log(`\n  AURIX Video Server  →  http://${config.host}:${config.port}`)
  console.log(`  Anbieter bereit:     ${configured.join(', ') || '–'}`)
  if (!config.falKey && !config.replicateToken) console.log('  Hinweis: Kein KI-Schlüssel gesetzt → nur Test-Modus. FAL_KEY in .env eintragen.')
  if (!config.appToken && config.host !== '127.0.0.1' && config.host !== 'localhost') console.log('  WARNUNG: VIDEO_APP_TOKEN ist nicht gesetzt – Admin-Zugriff nur über direkte localhost-Verbindungen.')
  console.log(`  ChatGPT-Schema:      ${config.publicUrl || `http://${config.host}:${config.port}`}/openapi.json\n`)
})
