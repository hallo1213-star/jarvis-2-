// Unified track registry: AURIX Originals (static catalog) + tracks streamed from Audius.
// Remote tracks the listener actually uses (played, saved, queued) are remembered in
// LocalStorage so favorites, playlists and the last session survive a reload.
import { trackById as catalogTracks } from './catalog.js'
import { load, save } from '../store/storage.js'

const MAX_REMEMBERED = 1500
const memory = new Map()
let remembered = load('remoteTracks', {})
if (!remembered || typeof remembered !== 'object') remembered = {}
Object.values(remembered).forEach((t) => t && t.id && memory.set(t.id, t))

export const isRemote = (id) => typeof id === 'string' && id.startsWith('au:')

export function getTrack(id) {
  return catalogTracks[id] || memory.get(id) || null
}

export function registerTracks(tracks) {
  tracks.forEach((t) => t && memory.set(t.id, t))
  return tracks
}

let saveTimer = 0
export function keepTracks(ids) {
  let changed = false
  ids.forEach((id) => {
    if (!isRemote(id)) return
    const t = memory.get(id)
    if (!t) return
    if (remembered[id]) delete remembered[id] // re-insert → most recent last
    remembered[id] = t
    changed = true
  })
  if (!changed) return
  const keys = Object.keys(remembered)
  if (keys.length > MAX_REMEMBERED) keys.slice(0, keys.length - MAX_REMEMBERED).forEach((k) => delete remembered[k])
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save('remoteTracks', remembered), 300)
}

export const artistPath = (t) => (t.source === 'audius' ? `/audius/artist/${t.artistId}` : `/artist/${t.artistId}`)
export const albumPath = (t) => (t.albumId ? `/album/${t.albumId}` : null)
