import { memo } from 'react'
import { Heart, MoreHorizontal, Play, ChevronUp, ChevronDown } from 'lucide-react'
import { getTrack } from '../data/tracks.js'
import { usePlayer } from '../store/PlayerContext.jsx'
import { useLibrary } from '../store/LibraryContext.jsx'
import { useUI } from '../store/UIContext.jsx'
import { toast } from '../store/toast.js'
import { Cover, Equalizer, fmtTime } from './ui.jsx'

function TrackRowInner({ id, ids, context, index, showCover = true, numbered, playlistId, onMove, count }) {
  const t = getTrack(id)
  const player = usePlayer()
  const lib = useLibrary()
  const ui = useUI()
  if (!t) return null
  const active = player.current?.id === id
  const fav = lib.isFavorite(id)

  const playIt = () => {
    if (active) player.toggle()
    else player.playTrack(id, ids, context)
  }

  return (
    <div className={`track-row ${active ? 'active' : ''}`}>
      <button className="track-main" onClick={playIt} aria-label={`${t.title} von ${t.artist} abspielen`}>
        {numbered && (
          <span className="track-num">
            {active ? <Equalizer playing={player.isPlaying} small /> : index + 1}
          </span>
        )}
        {showCover && (
          <span className="track-cover">
            <Cover src={t.cover} size={48} />
            {active && !numbered && <span className="track-cover-eq"><Equalizer playing={player.isPlaying} small /></span>}
            {!active && <span className="track-cover-play"><Play size={18} fill="currentColor" /></span>}
          </span>
        )}
        <span className="track-meta">
          <strong>{t.title}</strong>
          <span>{t.artist}<span className="dot">·</span>{fmtTime(t.duration)}</span>
        </span>
      </button>
      {onMove && (
        <span className="track-move">
          <button className="icon-btn ghost small" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Nach oben"><ChevronUp size={18} /></button>
          <button className="icon-btn ghost small" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label="Nach unten"><ChevronDown size={18} /></button>
        </span>
      )}
      <button
        className={`icon-btn ghost heart-btn ${fav ? 'on' : ''}`}
        onClick={() => {
          const added = lib.toggleFavorite(id)
          toast(added ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt')
        }}
        aria-label={fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
        aria-pressed={fav}
      >
        <Heart size={20} fill={fav ? 'currentColor' : 'none'} />
      </button>
      <button className="icon-btn ghost" onClick={() => ui.openTrackMenu(id, { playlistId })} aria-label="Weitere Optionen">
        <MoreHorizontal size={20} />
      </button>
    </div>
  )
}

export const TrackRow = memo(TrackRowInner)

export function TrackList({ ids, context, numbered, showCover = true, playlistId, onMove }) {
  return (
    <div className="track-list">
      {ids.map((id, i) => (
        <TrackRow key={id + i} id={id} ids={ids} context={context} index={i} numbered={numbered}
          showCover={showCover} playlistId={playlistId} onMove={onMove} count={ids.length} />
      ))}
    </div>
  )
}
