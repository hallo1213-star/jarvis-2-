// Audius – open, decentralized music platform. Artists upload their own music and
// publish it for free streaming through the public Audius API (no key, no account).
// https://docs.audius.org
import { registerTracks } from './tracks.js'

export const AUDIUS_API = 'https://api.audius.co/v1'
const APP = 'app_name=AURIX'
const TTL = 5 * 60 * 1000
const cache = new Map()

export const AUDIUS_GENRES = [
  'Electronic', 'Hip-Hop/Rap', 'Pop', 'Lo-Fi', 'House', 'Techno', 'R&B/Soul', 'Rock', 'Alternative',
  'Ambient', 'Dubstep', 'Drum & Bass', 'Trap', 'Deep House', 'Jazz', 'Latin', 'Acoustic', 'Classical',
  'Funk', 'Reggae', 'Metal', 'Soundtrack', 'Downtempo', 'Disco', 'Future Bass', 'Trance', 'World',
]

const PALETTES = [
  ['#7c3aed', '#c084fc', '#1e1036'], ['#6d8bff', '#b69cff', '#0b1024'], ['#ff7aa8', '#a78bfa', '#2a0f2f'],
  ['#a78bfa', '#d4d4e0', '#111118'], ['#f9a88a', '#a78bfa', '#3b2c4f'], ['#5b21b6', '#c9cbd6', '#0c0a14'],
]
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

async function get(path, params = {}) {
  const qs = new URLSearchParams({ ...params }).toString()
  const url = `${AUDIUS_API}${path}?${qs ? qs + '&' : ''}${APP}`
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < TTL) return hit.data
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Audius ${res.status}`)
  const json = await res.json()
  cache.set(url, { at: Date.now(), data: json.data })
  return json.data
}

const playable = (t) => t && t.is_streamable !== false && !t.is_stream_gated && !t.is_delete && t.is_available !== false

export function normalizeTrack(t) {
  const art = t.artwork || {}
  const user = t.user || {}
  return {
    id: `au:${t.id}`,
    audiusId: t.id,
    source: 'audius',
    title: t.title,
    artist: user.name || user.handle || 'Unbekannt',
    artistId: user.id,
    artistHandle: user.handle,
    album: 'Audius',
    albumId: null,
    genre: t.genre || '',
    mood: t.mood || '',
    moods: [],
    cover: art['480x480'] || art['150x150'] || art['1000x1000'] || null,
    coverLarge: art['1000x1000'] || art['480x480'] || null,
    src: `${AUDIUS_API}/tracks/${encodeURIComponent(t.id)}/stream?${APP}`,
    duration: t.duration || 0,
    peaks: null,
    palette: PALETTES[hash(String(t.id)) % PALETTES.length],
    permalink: t.permalink ? `https://audius.co${t.permalink}` : null,
  }
}

const tracksFrom = (list) => registerTracks((list || []).filter(playable).map(normalizeTrack))

export function normalizeUser(u) {
  const pic = u.profile_picture || {}
  return {
    id: u.id,
    name: u.name || u.handle,
    handle: u.handle,
    picture: pic['480x480'] || pic['150x150'] || pic['1000x1000'] || null,
    cover: u.cover_photo?.['2000x'] || u.cover_photo?.['640x'] || null,
    followers: u.follower_count || 0,
    trackCount: u.track_count || 0,
    bio: u.bio || '',
    verified: Boolean(u.is_verified),
  }
}

export const audius = {
  trending: ({ genre, time = 'week', limit = 30 } = {}) =>
    get('/tracks/trending', { time, ...(genre ? { genre } : {}) }).then((d) => tracksFrom(d).slice(0, limit)),
  searchTracks: (query) => get('/tracks/search', { query }).then(tracksFrom),
  searchUsers: (query) => get('/users/search', { query }).then((d) => (d || []).map(normalizeUser)),
  user: (id) => get(`/users/${encodeURIComponent(id)}`).then(normalizeUser),
  userTracks: (id) => get(`/users/${encodeURIComponent(id)}/tracks`, { sort: 'plays', limit: 50 }).then(tracksFrom),
}
