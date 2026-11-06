import { Play, Pause } from 'lucide-react'
import { Link } from '../router.jsx'
import { usePlayer } from '../store/PlayerContext.jsx'
import { Cover, Equalizer, playlistMosaic, plural } from './ui.jsx'

// Big play button overlay that plays a whole collection
export function PlayFab({ ids, context, size = 44, className = '', shuffle }) {
  const player = usePlayer()
  const sameCtx = player.context?.key && context?.key && player.context.key === context.key
  const playing = sameCtx && player.isPlaying
  return (
    <button
      className={`play-fab ${className}`}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (sameCtx) player.toggle()
        else player.playQueue(ids, 0, context, shuffle ? { shuffle: true, randomStart: true } : {})
      }}
      aria-label={playing ? 'Pause' : 'Abspielen'}
      disabled={!ids.length}
    >
      {playing ? <Pause size={size * 0.42} fill="currentColor" /> : <Play size={size * 0.42} fill="currentColor" className="nudge" />}
    </button>
  )
}

export function AlbumCard({ album }) {
  const ctx = { key: `album:${album.id}`, label: album.title, to: `/album/${album.id}` }
  return (
    <Link to={`/album/${album.id}`} className="card">
      <div className="card-art">
        <Cover src={album.cover} alt={album.title} />
        <PlayFab ids={album.trackIds} context={ctx} className="card-fab" />
      </div>
      <strong>{album.title}</strong>
      <span>{album.type} · {album.artist}</span>
    </Link>
  )
}

export function TrackCard({ track, ids, context }) {
  const player = usePlayer()
  const active = player.current?.id === track.id
  return (
    <button
      className={`card ${active ? 'active' : ''}`}
      onClick={() => (active ? player.toggle() : player.playTrack(track.id, ids, context))}
    >
      <div className="card-art">
        <Cover src={track.cover} alt={track.title} />
        <span className="card-fab play-fab" aria-hidden="true">
          {active && player.isPlaying ? <Equalizer playing small /> : <Play size={18} fill="currentColor" className="nudge" />}
        </span>
      </div>
      <strong>{track.title}</strong>
      <span>{track.artist}</span>
    </button>
  )
}

export function ArtistCard({ artist }) {
  return (
    <Link to={`/artist/${artist.id}`} className="card artist-card">
      <div className="card-art"><Cover src={artist.cover} alt={artist.name} round /></div>
      <strong>{artist.name}</strong>
      <span>{artist.genre}</span>
    </Link>
  )
}

export function PlaylistCard({ playlist }) {
  const ctx = { key: `playlist:${playlist.id}`, label: playlist.name, to: `/playlist/${playlist.id}` }
  return (
    <Link to={`/playlist/${playlist.id}`} className="card">
      <div className="card-art">
        <Cover mosaic={playlistMosaic(playlist)} alt={playlist.name} />
        {playlist.trackIds.length > 0 && <PlayFab ids={playlist.trackIds} context={ctx} className="card-fab" />}
      </div>
      <strong>{playlist.name}</strong>
      <span>Playlist · {plural(playlist.trackIds.length, 'Song', 'Songs')}</span>
    </Link>
  )
}

export function MoodCard({ mood, large }) {
  return (
    <Link
      to={`/mood/${mood.id}`}
      className={`mood-card ${large ? 'large' : ''}`}
      style={{ '--g1': mood.gradient[0], '--g2': mood.gradient[1] }}
    >
      <span className="mood-glow" />
      <strong>{mood.name}</strong>
      <span>{mood.tagline}</span>
    </Link>
  )
}
