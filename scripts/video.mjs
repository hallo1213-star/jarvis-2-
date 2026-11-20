#!/usr/bin/env node
// Submit a video order to the AURIX video server from the command line / Claude Code.
//   npm run video -- "A red sports car on a coastal road at sunset, drone shot" --format 9:16
//   npm run video -- --file order.json --watch
// Paid jobs are only CREATED here; you confirm the price in the app (Video Studio).
import { readFileSync } from 'node:fs'
import '../server/config.js' // loads .env (tokens)

const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : undefined }
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args.splice(i, 1), true) : false }

const base = (process.env.VIDEO_SERVER_URL || `http://127.0.0.1:${process.env.VIDEO_SERVER_PORT || 8787}`).replace(/\/$/, '')
const token = process.env.VIDEO_APP_TOKEN || process.env.VIDEO_INTAKE_TOKEN || ''
const file = opt('file')
const watch = flag('watch')
const order = file ? JSON.parse(readFileSync(file, 'utf8')) : {}
const set = (k, v) => { if (v !== undefined) order[k] = v }
set('title', opt('title'))
set('aspect_ratio', opt('format'))
set('quality', opt('quality'))
set('model', opt('model'))
set('resolution', opt('resolution'))
const d = opt('duration'); if (d) order.duration = Number(d)
if (flag('audio')) order.audio = true
if (args.length) order.prompt = args.join(' ')
order.source = 'cli'

if (!order.prompt && !order.scenes?.length) {
  console.error('Usage: npm run video -- "<prompt>" [--title T] [--format 9:16|16:9|1:1] [--quality test|cheap|standard|premium] [--model id] [--duration s] [--resolution 720p] [--audio] [--watch]\n       npm run video -- --file order.json [--watch]')
  process.exit(1)
}

const h = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
const res = await fetch(`${base}/api/video/jobs`, { method: 'POST', headers: h, body: JSON.stringify(order) }).catch(() => null)
if (!res) { console.error(`Video-Server unter ${base} nicht erreichbar – starte ihn mit "npm run server".`); process.exit(1) }
const job = await res.json()
if (!res.ok) { console.error('Fehler:', job.error); process.exit(1) }

console.log(`\n✔ Auftrag ${job.id} – "${job.title}"`)
console.log(`  Modell: ${job.modelName} · ${job.settings.aspect_ratio} · ${job.settings.resolution} · ${job.scenes.length} Szene(n)`)
console.log(`  Geschätzte Kosten: ${job.estimate_usd} USD`)
console.log(job.status === 'awaiting_confirmation' ? `  → Bitte in der App bestätigen: ${job.app_url}` : `  Status: ${job.status}`)

if (watch) {
  let last = ''
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000))
    const j = await (await fetch(`${base}/api/video/jobs/${job.id}`, { headers: h })).json()
    const line = `  [${j.progress}%] ${j.status}: ${j.message}`
    if (line !== last) console.log((last = line))
    if (j.status === 'completed') { console.log(`\n🎬 Fertig: ${j.video.url}`); break }
    if (['failed', 'cancelled', 'rejected'].includes(j.status)) { console.log(j.error || ''); process.exit(1) }
  }
}
