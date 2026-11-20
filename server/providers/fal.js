// fal.ai queue API (https://fal.ai) – one key gives access to Kling, Veo, Wan, LTX, ...
// Flow: POST queue.fal.run/<endpoint> → request_id + status_url/response_url → poll.
import { config } from '../config.js'

const QUEUE = process.env.FAL_QUEUE_URL || 'https://queue.fal.run' // override only for tests
const headers = () => ({ Authorization: `Key ${config.falKey}`, 'Content-Type': 'application/json' })

async function call(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } })
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
  if (!res.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map((d) => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ') : body.detail || body.error || body.raw || res.statusText
    const err = new Error(`fal.ai ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
    err.status = res.status
    throw err
  }
  return body
}

export const fal = {
  id: 'fal',
  name: 'fal.ai',
  configured: () => Boolean(config.falKey),
  keyHint: 'FAL_KEY in .env (https://fal.ai/dashboard/keys)',

  async submit({ endpoint, input }) {
    const r = await call(`${QUEUE}/${endpoint}`, { method: 'POST', body: JSON.stringify(input) })
    return { request_id: r.request_id, status_url: r.status_url, response_url: r.response_url, cancel_url: r.cancel_url }
  },

  async poll(ref) {
    const s = await call(`${ref.status_url}?logs=1`)
    const logs = (s.logs || []).map((l) => l.message).filter(Boolean)
    if (s.status === 'IN_QUEUE') return { state: 'queued', queuePosition: s.queue_position, logs }
    if (s.status === 'IN_PROGRESS') return { state: 'running', logs }
    if (s.status === 'COMPLETED') {
      if (s.error) return { state: 'failed', error: String(s.error) }
      const out = await call(ref.response_url)
      const url = out?.video?.url || out?.videos?.[0]?.url || out?.output?.video?.url
      if (!url) return { state: 'failed', error: 'Antwort enthielt keine Video-URL: ' + JSON.stringify(out).slice(0, 300) }
      return { state: 'done', videoUrl: url, seed: out.seed }
    }
    return { state: 'running', logs }
  },

  async cancel(ref) {
    if (!ref?.cancel_url) return
    await fetch(ref.cancel_url, { method: 'PUT', headers: headers() }).catch(() => {})
  },
}
