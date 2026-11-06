/* AURIX service worker – generated at build time (see vite.config.js). */
const VERSION = '__VERSION__'
const SHELL = `aurix-shell-${VERSION}`
const MEDIA = 'aurix-media-v1'
const PRECACHE = __PRECACHE__

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('aurix-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Serve byte ranges from a fully cached file (Safari always requests audio with Range).
async function rangeResponse(request, cached) {
  const range = request.headers.get('range')
  const blob = await cached.blob()
  if (!range) {
    return new Response(blob, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(blob.size), 'Accept-Ranges': 'bytes' } })
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range)
  let start = m && m[1] ? parseInt(m[1], 10) : 0
  let end = m && m[2] ? parseInt(m[2], 10) : blob.size - 1
  if (m && !m[1] && m[2]) { start = Math.max(0, blob.size - parseInt(m[2], 10)); end = blob.size - 1 }
  end = Math.min(end, blob.size - 1)
  if (start > end || start >= blob.size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } })
  }
  const slice = blob.slice(start, end + 1)
  return new Response(slice, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(slice.size),
      'Content-Range': `bytes ${start}-${end}/${blob.size}`,
      'Accept-Ranges': 'bytes',
    },
  })
}

async function cacheAudioInBackground(url) {
  try {
    const cache = await caches.open(MEDIA)
    if (await cache.match(url)) return
    const res = await fetch(url, { credentials: 'same-origin' })
    if (res.ok && res.status === 200) await cache.put(url, res)
  } catch { /* offline – try again next time */ }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Audio: cached → serve ranges locally; otherwise stream from network and cache for offline use
  if (url.pathname.includes('/audio/') && url.pathname.endsWith('.mp3')) {
    const key = url.origin + url.pathname
    event.respondWith((async () => {
      const cached = await caches.open(MEDIA).then((c) => c.match(key))
      if (cached) return rangeResponse(request, cached)
      event.waitUntil(cacheAudioInBackground(key))
      return fetch(request)
    })())
    return
  }

  // Navigations: network first, fall back to the cached app shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone()
        caches.open(SHELL).then((c) => c.put('./index.html', copy)).catch(() => {})
        return res
      }).catch(() => caches.match('./index.html', { ignoreSearch: true }).then((r) => r || caches.match('./'))),
    )
    return
  }

  // Static assets: cache first, then network (and remember it)
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok && res.status === 200 && res.type === 'basic') {
        const copy = res.clone()
        caches.open(SHELL).then((c) => c.put(request, copy)).catch(() => {})
      }
      return res
    })),
  )
})
