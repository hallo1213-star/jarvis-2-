// Job store + worker. Jobs are persisted to storage/jobs.json and survive restarts
// (running provider requests are resumed by polling again).
import { existsSync, readFileSync } from 'node:fs'
import { readFile, rename, writeFile, copyFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { config, dirs, jobsFile } from './config.js'
import { MODELS, getModel, normaliseSettings, sceneCost } from './models.js'
import { getProvider } from './providers/index.js'
import { concatClips, download, ffmpegAvailable, poster, probeDuration, safeUnlink, videoSize } from './media.js'

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

const jobs = new Map()
const running = new Set()
const ACTIVE = ['queued', 'generating', 'finalizing']
const MAX_SCENES = 8
const MAX_CONCURRENT = 2

// ------------------------------------------------------------------ persistence
if (existsSync(jobsFile)) {
  try { for (const j of JSON.parse(readFileSync(jobsFile, 'utf8'))) jobs.set(j.id, j) } catch (e) { console.error('jobs.json unreadable:', e.message) }
}
let saveTimer = null
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const tmp = jobsFile + '.tmp'
    await writeFile(tmp, JSON.stringify([...jobs.values()], null, 2))
    await rename(tmp, jobsFile)
  }, 150)
}
function update(job, patch) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() })
  save()
  return job
}

// ------------------------------------------------------------------ helpers
export const isAvailable = (m) => getProvider(m.provider)?.configured()

export function listModels() {
  return MODELS.map((m) => {
    const p = getProvider(m.provider)
    return {
      id: m.id, provider: m.provider, providerName: p.name, name: m.name, tier: m.tier, description: m.description,
      modes: m.modes, durations: m.durations, aspectRatios: m.aspectRatios, resolutions: m.resolutions, defaultResolution: m.defaultResolution || m.resolutions[0], audio: m.audio,
      available: Boolean(p.configured()), keyHint: p.keyHint,
      priceExamples: Object.fromEntries(m.resolutions.map((r) => [r, +(m.pricePerSecond({ resolution: r, audio: m.audio }) || 0).toFixed(3)])),
    }
  })
}

const TIER_ALIASES = { cheap: 'günstig', guenstig: 'günstig', günstig: 'günstig', draft: 'günstig', standard: 'standard', high: 'premium', premium: 'premium', best: 'premium', test: 'test', free: 'test' }

function chooseModel({ model, quality, mode }) {
  if (model) {
    const m = getModel(model)
    if (!m) throw new HttpError(400, `Unbekanntes Modell "${model}". Verfügbar: ${MODELS.map((x) => x.id).join(', ')}`)
    return m
  }
  const tier = TIER_ALIASES[String(quality || '').toLowerCase()]
  const ok = (m) => isAvailable(m) && m.modes.includes(mode)
  if (tier) {
    const m = MODELS.find((x) => x.tier === tier && ok(x))
    if (m) return m
  }
  if (config.defaultModel && getModel(config.defaultModel) && ok(getModel(config.defaultModel))) return getModel(config.defaultModel)
  return MODELS.find((x) => x.tier === 'standard' && ok(x)) || MODELS.find((x) => x.provider !== 'demo' && ok(x)) || MODELS.find(ok) || MODELS[0]
}

const today = () => new Date().toISOString().slice(0, 10)
export function spentToday() {
  return +[...jobs.values()].filter((j) => j.confirmedAt?.startsWith(today()) && !['rejected'].includes(j.status))
    .reduce((s, j) => s + (j.estimate_usd || 0), 0).toFixed(3)
}

function estimate(model, settings, scenes) {
  return +scenes.reduce((sum, sc) => sum + sceneCost(model, { ...settings, duration: sc.duration }), 0).toFixed(3)
}

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function storeImage(id, { image_base64, image_url }) {
  if (image_base64) {
    const m = /^data:(image\/(png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(image_base64).replace(/\s/g, ''))
    if (!m) throw new HttpError(400, 'image_base64 muss eine data:image/png|jpeg|webp;base64,… URL sein')
    const buf = Buffer.from(m[3], 'base64')
    if (buf.length > 10 * 1024 * 1024) throw new HttpError(413, 'Bild ist größer als 10 MB')
    const ext = m[2] === 'png' ? 'png' : m[2] === 'webp' ? 'webp' : 'jpg'
    const file = `${id}.${ext}`
    await writeFile(join(dirs.uploads, file), buf)
    return { file, mime: m[1], url: `/media/uploads/${file}` }
  }
  if (image_url) {
    if (!/^https:\/\//i.test(image_url)) throw new HttpError(400, 'image_url muss eine öffentliche https-URL sein')
    return { remote: image_url, url: image_url }
  }
  return null
}

async function providerImageUrl(image) {
  if (!image) return undefined
  if (image.remote) return image.remote
  if (config.publicUrl) return `${config.publicUrl}/media/uploads/${image.file}`
  const buf = await readFile(join(dirs.uploads, image.file))
  return `data:${image.mime};base64,${buf.toString('base64')}`
}

// ------------------------------------------------------------------ public API
export function publicJob(j) {
  const { scenes, ...rest } = j
  return {
    ...rest,
    scenes: scenes.map(({ ref, clipFile, ...s }) => s),
    video: j.video ? { ...j.video, url: `/media/videos/${j.video.file}`, poster: j.video.poster ? `/media/videos/${j.video.poster}` : null } : null,
  }
}

export const listJobs = () => [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
export const getJob = (id) => jobs.get(id)

// Validate + normalise an order without saving it (used for quotes and job creation).
export function prepare(body) {
  let scenes = Array.isArray(body.scenes) ? body.scenes : []
  if (!scenes.length) scenes = [{ prompt: body.prompt, duration: body.duration }]
  if (scenes.length > MAX_SCENES) throw new HttpError(400, `Maximal ${MAX_SCENES} Szenen pro Video`)
  const hasImage = Boolean(body.image_base64 || body.image_url)
  const mode = hasImage ? 'i2v' : 't2v'
  const model = chooseModel({ model: body.model, quality: body.quality, mode })
  if (!model.modes.includes(mode)) throw new HttpError(400, `${model.name} unterstützt kein ${mode === 'i2v' ? 'Bild-zu-Video' : 'Text-zu-Video'}`)
  const settings = normaliseSettings(model, body)
  scenes = scenes.map((s, i) => {
    const prompt = clean(s.prompt, 4000)
    if (!prompt) throw new HttpError(400, scenes.length > 1 ? `Szene ${i + 1}: prompt fehlt` : 'prompt fehlt')
    const duration = normaliseSettings(model, { ...settings, duration: s.duration ?? settings.duration }).duration
    return { index: i, title: clean(s.title, 120), prompt, negative_prompt: clean(s.negative_prompt || body.negative_prompt, 1000), duration, state: 'pending', progress: 0 }
  })
  return { model, settings, scenes, mode, estimate_usd: estimate(model, settings, scenes) }
}

export function quote(body) {
  const filled = { ...body, prompt: body.prompt || '-', scenes: Array.isArray(body.scenes) ? body.scenes.map((x) => ({ ...x, prompt: x?.prompt || '-' })) : [] }
  const { model, settings, scenes, mode, estimate_usd } = prepare(filled)
  return { model: model.id, modelName: model.name, available: Boolean(isAvailable(model)), mode, settings, scenes: scenes.map((s) => ({ duration: s.duration })), estimate_usd,
    limits: { maxCostPerJob: config.maxCostPerJob, dailyBudget: config.dailyBudget, spentToday: spentToday() } }
}

export async function createJob(body, source) {
  const id = `vid_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`
  const { model, settings, scenes, mode, estimate_usd: est } = prepare(body)
  const image = await storeImage(id, body)
  const now = new Date().toISOString()
  const job = {
    id, createdAt: now, updatedAt: now, source,
    title: clean(body.title, 140) || clean(scenes[0].prompt, 60),
    concept: clean(body.concept, 8000),
    status: 'awaiting_confirmation', message: 'Wartet auf deine Bestätigung', progress: 0,
    mode, provider: model.provider, model: model.id, modelName: model.name, settings, image,
    scenes, estimate_usd: est, video: null, error: null,
  }
  jobs.set(id, job)
  if (est === 0) await confirmJob(id, { auto: true }) // free test mode needs no confirmation
  save()
  return job
}

export async function confirmJob(id, { expected_cost_usd, auto } = {}) {
  const job = jobs.get(id)
  if (!job) throw new HttpError(404, 'Auftrag nicht gefunden')
  if (job.status !== 'awaiting_confirmation') throw new HttpError(409, `Auftrag ist bereits "${job.status}"`)
  const model = getModel(job.model)
  if (!isAvailable(model)) throw new HttpError(412, `${getProvider(model.provider).name} ist nicht eingerichtet: ${getProvider(model.provider).keyHint}`)
  if (!auto && job.estimate_usd > 0) {
    if (Number(expected_cost_usd) !== job.estimate_usd) throw new HttpError(409, `Bitte den aktuellen Preis (${job.estimate_usd} USD) ausdrücklich bestätigen`)
    if (job.estimate_usd > config.maxCostPerJob) throw new HttpError(402, `Kosten ${job.estimate_usd} USD überschreiten MAX_COST_PER_JOB_USD=${config.maxCostPerJob}`)
    if (spentToday() + job.estimate_usd > config.dailyBudget) throw new HttpError(402, `Tagesbudget DAILY_BUDGET_USD=${config.dailyBudget} wäre überschritten (heute bereits ${spentToday()} USD)`)
  }
  update(job, { status: 'queued', message: 'In der Warteschlange', confirmedAt: new Date().toISOString() })
  kick()
  return job
}

export function rejectJob(id) {
  const job = jobs.get(id)
  if (!job) throw new HttpError(404, 'Auftrag nicht gefunden')
  if (job.status !== 'awaiting_confirmation') throw new HttpError(409, 'Nur unbestätigte Aufträge können abgelehnt werden')
  return update(job, { status: 'rejected', message: 'Abgelehnt – es sind keine Kosten entstanden' })
}

export async function cancelJob(id) {
  const job = jobs.get(id)
  if (!job) throw new HttpError(404, 'Auftrag nicht gefunden')
  if (!ACTIVE.includes(job.status)) throw new HttpError(409, 'Auftrag läuft nicht')
  const provider = getProvider(job.provider)
  for (const s of job.scenes) if (s.ref && s.state !== 'done') await provider.cancel(s.ref)
  return update(job, { status: 'cancelled', message: 'Abgebrochen (bereits gestartete Szenen können beim Anbieter trotzdem berechnet werden)' })
}

export async function deleteJob(id) {
  const job = jobs.get(id)
  if (!job) throw new HttpError(404, 'Auftrag nicht gefunden')
  if (ACTIVE.includes(job.status)) await cancelJob(id)
  if (job.video) { await safeUnlink(join(dirs.videos, job.video.file)); if (job.video.poster) await safeUnlink(join(dirs.videos, job.video.poster)) }
  for (const s of job.scenes) if (s.clipFile) await safeUnlink(join(dirs.videos, s.clipFile))
  if (job.image?.file) await safeUnlink(join(dirs.uploads, job.image.file))
  jobs.delete(id)
  save()
}

// ------------------------------------------------------------------ worker
function kick() {
  for (const job of jobs.values()) {
    if (running.size >= MAX_CONCURRENT) break
    if (ACTIVE.includes(job.status) && !running.has(job.id)) {
      running.add(job.id)
      runJob(job).catch((e) => {
        console.error(`[${job.id}]`, e)
        if (job.status !== 'cancelled') update(job, { status: 'failed', error: e.message, message: 'Fehlgeschlagen' })
      }).finally(() => { running.delete(job.id); kick() })
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stillActive = (job) => jobs.get(job.id) === job && ACTIVE.includes(job.status)

function overall(job) {
  const n = job.scenes.length
  const p = job.scenes.reduce((s, sc) => s + (sc.state === 'done' ? 1 : sc.progress || 0), 0) / n
  return Math.round(p * 92)
}

async function runJob(job) {
  const model = getModel(job.model)
  const provider = getProvider(job.provider)
  const endpoint = model.endpoints?.[job.mode]
  const n = job.scenes.length
  update(job, { status: 'generating' })

  for (const scene of job.scenes) {
    if (scene.state === 'done') continue
    const label = n > 1 ? `Szene ${scene.index + 1}/${n}` : 'Video'
    if (!scene.ref) {
      const input = model.build
        ? model.build({ ...job.settings, duration: scene.duration, prompt: scene.prompt, negative_prompt: scene.negative_prompt, image_url: scene.index === 0 ? await providerImageUrl(job.image) : undefined })
        : { ...job.settings, duration: scene.duration, prompt: scene.prompt }
      update(job, { message: `${label}: wird an ${provider.name} gesendet …` })
      scene.ref = await provider.submit({ endpoint, input })
      scene.startedAt = new Date().toISOString()
      scene.state = 'queued'
      save()
    }
    // poll
    let failures = 0
    for (;;) {
      if (!stillActive(job)) return
      let r
      try { r = await provider.poll(scene.ref); failures = 0 } catch (e) {
        if (++failures > 5) throw e
        await sleep(4000); continue
      }
      const elapsed = (Date.now() - Date.parse(scene.startedAt)) / 1000
      if (r.state === 'queued') {
        scene.state = 'queued'
        scene.progress = 0.03
        update(job, { progress: overall(job), message: `${label}: in der Warteschlange${r.queuePosition != null ? ` (Position ${r.queuePosition + 1})` : ''}` })
      } else if (r.state === 'running') {
        scene.state = 'running'
        // Providers rarely report percentages → estimate from typical runtime, asymptotic to 95 %.
        scene.progress = Math.min(0.95, 0.05 + 0.9 * (1 - Math.exp(-elapsed / model.expectedSeconds)))
        update(job, { progress: overall(job), message: `${label}: ${provider.local ? 'Testsequenz wird gerendert' : 'KI generiert'} …${r.logs?.length ? ' ' + r.logs.at(-1).slice(0, 80) : ''}` })
      } else if (r.state === 'failed') {
        scene.state = 'failed'
        throw new Error(`${label}: ${r.error}`)
      } else if (r.state === 'done') {
        update(job, { message: `${label}: wird heruntergeladen und gespeichert …` })
        const clipFile = `${job.id}-s${scene.index + 1}.mp4`
        const dest = join(dirs.videos, clipFile)
        if (r.localFile) { await copyFile(r.localFile, dest); await safeUnlink(r.localFile) } else await download(r.videoUrl, dest)
        Object.assign(scene, { state: 'done', progress: 1, clipFile, sourceUrl: r.videoUrl || null, finishedAt: new Date().toISOString() })
        update(job, { progress: overall(job) })
        break
      }
      await sleep(job.provider === 'demo' ? 700 : 3000)
    }
  }

  if (!stillActive(job)) return
  update(job, { status: 'finalizing', message: n > 1 ? 'Szenen werden zu einem Film zusammengeschnitten …' : 'Wird fertiggestellt …', progress: 94 })
  const file = `${job.id}.mp4`
  const out = join(dirs.videos, file)
  const clips = job.scenes.map((s) => join(dirs.videos, s.clipFile))
  if (n === 1) {
    await rename(clips[0], out)
    job.scenes[0].clipFile = null
  } else if (ffmpegAvailable()) {
    const size = (await videoSize(clips[0])) || { width: 1280, height: 720 }
    await concatClips(clips, out, size)
  } else {
    await copyFile(clips[0], out) // without ffmpeg: first scene is the main video, others stay as clips
  }
  const posterFile = `${job.id}.jpg`
  const hasPoster = await poster(out, join(dirs.videos, posterFile))
  const { size } = await stat(out)
  update(job, {
    status: 'completed', progress: 100, message: 'Fertig',
    completedAt: new Date().toISOString(),
    video: { file, poster: hasPoster ? posterFile : null, bytes: size, duration: await probeDuration(out), ...(await videoSize(out)) },
  })
}

// Resume after restart
setTimeout(kick, 500)
