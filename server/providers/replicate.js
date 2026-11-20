// Replicate (https://replicate.com) – pay per prediction.
import { config } from '../config.js'

const API = 'https://api.replicate.com/v1'
const headers = () => ({ Authorization: `Bearer ${config.replicateToken}`, 'Content-Type': 'application/json' })

async function call(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${body.detail || body.title || res.statusText}`)
  return body
}

export const replicate = {
  id: 'replicate',
  name: 'Replicate',
  configured: () => Boolean(config.replicateToken),
  keyHint: 'REPLICATE_API_TOKEN in .env (https://replicate.com/account/api-tokens)',

  async submit({ endpoint, input }) {
    const p = await call(`${API}/models/${endpoint}/predictions`, { method: 'POST', body: JSON.stringify({ input }) })
    return { id: p.id, get: p.urls?.get, cancel: p.urls?.cancel }
  },

  async poll(ref) {
    const p = await call(ref.get)
    const logs = (p.logs || '').split('\n').filter(Boolean).slice(-5)
    if (p.status === 'starting') return { state: 'queued', logs }
    if (p.status === 'processing') return { state: 'running', logs }
    if (p.status === 'succeeded') {
      const url = Array.isArray(p.output) ? p.output[0] : typeof p.output === 'string' ? p.output : p.output?.video
      return url ? { state: 'done', videoUrl: url } : { state: 'failed', error: 'Keine Video-URL in der Antwort' }
    }
    return { state: 'failed', error: p.error || p.status }
  },

  async cancel(ref) {
    if (ref?.cancel) await fetch(ref.cancel, { method: 'POST', headers: headers() }).catch(() => {})
  },
}
