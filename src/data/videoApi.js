// Client for the AURIX video server. The browser never sees provider API keys – it only
// talks to our own server (same origin in dev via Vite proxy / when served by the server,
// or a configured URL when the app runs on GitHub Pages).
const KEY = 'aurix:video-server'

export function getServerConfig() {
  try { return { url: '', token: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { url: '', token: '' } }
}
export function setServerConfig(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)) } catch { /* private mode */ }
}

const base = () => getServerConfig().url.replace(/\/+$/, '')
export const mediaUrl = (u) => (!u ? u : /^https?:/.test(u) ? u : base() + u)

async function req(path, { method = 'GET', body } = {}) {
  const { token } = getServerConfig()
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(base() + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw Object.assign(new Error('Video-Server nicht erreichbar'), { offline: true })
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status })
  return data
}

export const videoApi = {
  health: () => req('/api/video/health'),
  models: () => req('/api/video/models').then((d) => d.models),
  jobs: () => req('/api/video/jobs').then((d) => d.jobs),
  job: (id) => req(`/api/video/jobs/${id}`),
  quote: (body) => req('/api/video/quote', { method: 'POST', body }),
  create: (body) => req('/api/video/jobs', { method: 'POST', body: { ...body, source: 'app' } }),
  confirm: (id, expected_cost_usd) => req(`/api/video/jobs/${id}/confirm`, { method: 'POST', body: { expected_cost_usd } }),
  reject: (id) => req(`/api/video/jobs/${id}/reject`, { method: 'POST', body: {} }),
  cancel: (id) => req(`/api/video/jobs/${id}/cancel`, { method: 'POST', body: {} }),
  remove: (id) => req(`/api/video/jobs/${id}`, { method: 'DELETE' }),
  openapiUrl: () => (base() || window.location.origin) + '/openapi.json',
}

// Downscale an image file to a JPEG data URL (keeps uploads small for image-to-video).
export function imageToDataUrl(file, max = 1536) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * s)
      c.height = Math.round(img.height * s)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')) }
    img.src = url
  })
}

export const fmtUsd = (v) => (v === 0 ? 'kostenlos' : `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} $`)
