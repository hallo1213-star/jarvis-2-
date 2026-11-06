// AURIX demo catalog.
// Every track below is an "AURIX Original": composed & synthesized procedurally by
// scripts/generate_music.py and shipped with the app under CC0 1.0. The audio
// files live in /public/audio – nothing is streamed from third parties.
import meta from './audio-meta.json'

export const LICENSE = {
  name: 'CC0 1.0 Universal (Public Domain)',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  note: 'Alle Demo-Titel wurden von AURIX selbst prozedural komponiert und synthetisiert (scripts/generate_music.py). Keine Samples, keine fremden Aufnahmen.',
}

export const ARTISTS = [
  { id: 'nova-lumen', name: 'Nova Lumen', genre: 'Synthwave', bio: 'Neonlicht, analoge Wärme und Nächte, die nie ganz dunkel werden. Nova Lumen baut Klangräume zwischen Retro und Zukunft.' },
  { id: 'kairo-bay', name: 'Kairo Bay', genre: 'Lo-Fi', bio: 'Langsame Morgen, Regen am Fenster und Beats, die atmen. Kairo Bay ist der Soundtrack für Fokus und Ruhe.' },
  { id: 'vanta-grid', name: 'Vanta Grid', genre: 'House / Techno', bio: 'Präzise Kicks, hypnotische Basslines und Hallen voller Licht. Vanta Grid steht für Energie ohne Kompromisse.' },
  { id: 'solvi', name: 'Sølvi', genre: 'Ambient', bio: 'Polarlicht in Klang übersetzt. Sølvi komponiert weite, stille Landschaften für Konzentration und Schlaf.' },
  { id: 'echo-atlas', name: 'Echo Atlas', genre: 'Downtempo', bio: 'Cineastische Downtempo-Stücke über Räume, Erinnerungen und die Schwerkraft des Augenblicks.' },
  { id: 'juno-ray', name: 'Juno Ray', genre: 'Electro Pop', bio: 'Sonnenlicht, Tempo und Groove. Juno Ray macht Musik für offene Fenster und lange Abende.' },
]

// palette: colours used for the animated player background
export const ALBUMS = [
  { id: 'afterglow-theory', title: 'Afterglow Theory', artistId: 'nova-lumen', year: 2026, released: '2026-10-24', type: 'EP', palette: ['#7c3aed', '#c084fc', '#1e1036'] },
  { id: 'slow-mornings', title: 'Slow Mornings', artistId: 'kairo-bay', year: 2026, released: '2026-09-12', type: 'EP', palette: ['#f9a88a', '#a78bfa', '#3b2c4f'] },
  { id: 'signal-noise', title: 'Signal & Noise', artistId: 'vanta-grid', year: 2026, released: '2026-10-31', type: 'EP', palette: ['#a78bfa', '#d4d4e0', '#111118'] },
  { id: 'northern-quiet', title: 'Northern Quiet', artistId: 'solvi', year: 2026, released: '2026-08-02', type: 'EP', palette: ['#6d8bff', '#b69cff', '#0b1024'] },
  { id: 'parallel-rooms', title: 'Parallel Rooms', artistId: 'echo-atlas', year: 2026, released: '2026-07-18', type: 'EP', palette: ['#7c4dff', '#c9cbd6', '#24203a'] },
  { id: 'bright-side-club', title: 'Bright Side Club', artistId: 'juno-ray', year: 2026, released: '2026-11-01', type: 'EP', palette: ['#ff7aa8', '#ffb86b', '#8a5cff'] },
]

const T = (id, title, albumId, moods, bpm, genre) => ({ id, title, albumId, moods, bpm, genre })

const RAW_TRACKS = [
  T('midnight-bloom', 'Midnight Bloom', 'afterglow-theory', ['night', 'energy'], 100, 'Synthwave'),
  T('velvet-orbit', 'Velvet Orbit', 'afterglow-theory', ['dream', 'night'], 92, 'Dreamwave'),
  T('paper-skies', 'Paper Skies', 'slow-mornings', ['chill', 'focus'], 82, 'Lo-Fi'),
  T('rain-on-glass', 'Rain on Glass', 'slow-mornings', ['chill', 'focus', 'night'], 76, 'Lo-Fi'),
  T('pulse-theory', 'Pulse Theory', 'signal-noise', ['energy', 'workout'], 122, 'House'),
  T('neon-cathedral', 'Neon Cathedral', 'signal-noise', ['energy', 'night', 'workout'], 126, 'Techno'),
  T('aurora-drift', 'Aurora Drift', 'northern-quiet', ['dream', 'focus', 'sleep'], 66, 'Ambient'),
  T('silver-hours', 'Silver Hours', 'northern-quiet', ['sleep', 'chill', 'dream'], 72, 'Ambient Piano'),
  T('gravity-lines', 'Gravity Lines', 'parallel-rooms', ['focus', 'night'], 95, 'Downtempo'),
  T('hollow-light', 'Hollow Light', 'parallel-rooms', ['dream', 'sleep'], 84, 'Cinematic'),
  T('solar-run', 'Solar Run', 'bright-side-club', ['happy', 'energy', 'workout'], 118, 'Electro Pop'),
  T('golden-hour-avenue', 'Golden Hour Avenue', 'bright-side-club', ['happy', 'chill'], 108, 'Funk Pop'),
]

export const MOODS = [
  { id: 'chill', name: 'Chill', tagline: 'Durchatmen und treiben lassen', gradient: ['#f9a88a', '#7c5cff'] },
  { id: 'focus', name: 'Fokus', tagline: 'Klarer Kopf, tiefe Konzentration', gradient: ['#6d8bff', '#22253a'] },
  { id: 'energy', name: 'Energie', tagline: 'Volle Power, kein Limit', gradient: ['#ff5f9e', '#7c3aed'] },
  { id: 'night', name: 'Nachts', tagline: 'Neon, Stadt und Mitternacht', gradient: ['#3b1a8f', '#05050a'] },
  { id: 'dream', name: 'Träumen', tagline: 'Schwerelos durch weite Räume', gradient: ['#b69cff', '#2c3d7a'] },
  { id: 'happy', name: 'Gute Laune', tagline: 'Sonne im Ohr', gradient: ['#ffb86b', '#ff6fb5'] },
  { id: 'workout', name: 'Workout', tagline: 'Tempo für jede Wiederholung', gradient: ['#c9cbd6', '#5b21b6'] },
  { id: 'sleep', name: 'Schlafen', tagline: 'Sanft in die Ruhe', gradient: ['#1e293b', '#6d5bd0'] },
]

export const artistById = Object.fromEntries(ARTISTS.map((a) => [a.id, a]))
export const albumById = Object.fromEntries(ALBUMS.map((a) => [a.id, a]))
export const moodById = Object.fromEntries(MOODS.map((m) => [m.id, m]))

export const TRACKS = RAW_TRACKS.map((t) => {
  const album = albumById[t.albumId]
  const artist = artistById[album.artistId]
  const m = meta[t.id]
  return {
    ...t,
    artistId: artist.id,
    artist: artist.name,
    album: album.title,
    cover: `covers/${album.id}.jpg`,
    src: `audio/${t.id}.mp3`,
    duration: m.duration,
    peaks: m.peaks,
    palette: album.palette,
  }
})

export const trackById = Object.fromEntries(TRACKS.map((t) => [t.id, t]))

for (const a of ALBUMS) {
  a.artist = artistById[a.artistId].name
  a.cover = `covers/${a.id}.jpg`
  a.trackIds = TRACKS.filter((t) => t.albumId === a.id).map((t) => t.id)
}
for (const a of ARTISTS) {
  a.albumIds = ALBUMS.filter((al) => al.artistId === a.id).map((al) => al.id)
  a.trackIds = TRACKS.filter((t) => t.artistId === a.id).map((t) => t.id)
  a.cover = `covers/${a.albumIds[0]}.jpg`
}

export const tracksForMood = (moodId) => TRACKS.filter((t) => t.moods.includes(moodId))

export function searchCatalog(query) {
  const q = query.trim().toLowerCase()
  if (!q) return { tracks: [], artists: [], albums: [] }
  const match = (...fields) => fields.some((f) => f && f.toLowerCase().includes(q))
  return {
    tracks: TRACKS.filter((t) => match(t.title, t.artist, t.album, t.genre, ...t.moods.map((m) => moodById[m]?.name))),
    artists: ARTISTS.filter((a) => match(a.name, a.genre)),
    albums: ALBUMS.filter((a) => match(a.title, a.artist)),
  }
}
