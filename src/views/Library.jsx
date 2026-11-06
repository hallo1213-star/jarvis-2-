import { useState } from 'react'
import { Heart, History, Plus, ListMusic, ChevronRight, Shuffle, Play, Trash2, UserRound, Disc3 } from 'lucide-react'
import { ALBUMS, ARTISTS, albumById, artistById, trackById } from '../data/catalog.js'
import { useLibrary } from '../store/LibraryContext.jsx'
import { usePlayer } from '../store/PlayerContext.jsx'
import { useUI } from '../store/UIContext.jsx'
import { Link } from '../router.jsx'
import { Confirm, Cover, EmptyState, PageHeader, fmtTotal, playlistMosaic, plural } from '../components/ui.jsx'
import { TrackList } from '../components/TrackRow.jsx'

export default function Library() {
  const lib = useLibrary()
  const ui = useUI()
  const [tab, setTab] = useState('playlists')
  // Albums/artists in your library = followed artists + albums of anything you saved or played
  const savedAlbumIds = [...new Set([...lib.favorites, ...lib.recent.map((r) => r.id)].map((id) => trackById[id]?.albumId).filter(Boolean))]
  const artistIds = [...new Set([...lib.followed, ...savedAlbumIds.map((a) => albumById[a].artistId)])]

  return (
    <div className="page">
      <PageHeader title="Bibliothek" right={
        <button className="icon-btn glass" onClick={() => ui.openCreatePlaylist()} aria-label="Neue Playlist"><Plus size={22} /></button>
      } />

      <div className="lib-shortcuts">
        <Link to="/favorites" className="lib-shortcut fav">
          <span className="lib-ico"><Heart size={22} fill="currentColor" /></span>
          <span><strong>Favoriten</strong><em>{plural(lib.favorites.length, 'Song', 'Songs')}</em></span>
          <ChevronRight size={18} />
        </Link>
        <Link to="/recent" className="lib-shortcut">
          <span className="lib-ico"><History size={22} /></span>
          <span><strong>Zuletzt gehört</strong><em>{plural(lib.recent.length, 'Song', 'Songs')}</em></span>
          <ChevronRight size={18} />
        </Link>
      </div>

      <div className="segmented" role="tablist">
        {[['playlists', 'Playlists'], ['artists', 'Künstler'], ['albums', 'Alben']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'playlists' && (
        <div className="list">
          <button className="list-row create" onClick={() => ui.openCreatePlaylist()}>
            <span className="list-plus"><Plus size={24} /></span>
            <span className="list-meta"><strong>Neue Playlist erstellen</strong><span>Unbegrenzt viele, komplett kostenlos</span></span>
          </button>
          {lib.playlists.map((p) => (
            <Link key={p.id} to={`/playlist/${p.id}`} className="list-row">
              <Cover mosaic={playlistMosaic(p)} size={56} />
              <span className="list-meta"><strong>{p.name}</strong><span>Playlist · {plural(p.trackIds.length, 'Song', 'Songs')}</span></span>
              <ChevronRight size={18} className="muted" />
            </Link>
          ))}
        </div>
      )}

      {tab === 'artists' && (
        artistIds.length ? (
          <div className="list">
            {artistIds.map((id) => {
              const a = artistById[id]
              return (
                <Link key={id} to={`/artist/${id}`} className="list-row">
                  <Cover src={a.cover} size={56} round />
                  <span className="list-meta"><strong>{a.name}</strong><span>{lib.followed.includes(id) ? 'Gefolgt · ' : ''}{a.genre}</span></span>
                  <ChevronRight size={18} className="muted" />
                </Link>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={UserRound} title="Noch keine Künstler" text="Folge Künstlern oder höre Musik – sie erscheinen dann hier."
            action={<Link to="/discover" className="btn primary">Künstler entdecken</Link>} />
        )
      )}

      {tab === 'albums' && (
        savedAlbumIds.length ? (
          <div className="list">
            {savedAlbumIds.map((id) => {
              const a = albumById[id]
              return (
                <Link key={id} to={`/album/${id}`} className="list-row">
                  <Cover src={a.cover} size={56} />
                  <span className="list-meta"><strong>{a.title}</strong><span>{a.type} · {a.artist}</span></span>
                  <ChevronRight size={18} className="muted" />
                </Link>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={Disc3} title="Noch keine Alben" text="Alben von Songs, die du hörst oder favorisierst, landen automatisch hier."
            action={<Link to="/discover" className="btn primary">Alben entdecken</Link>} />
        )
      )}
      <p className="lib-foot muted small-text">{ARTISTS.length} Künstler · {ALBUMS.length} Releases im Katalog</p>
    </div>
  )
}

function CollectionHeader({ title, subtitle, cover, mosaic, ids, context, children, kind }) {
  const player = usePlayer()
  return (
    <div className="collection-head">
      <div className="collection-art"><Cover src={cover} mosaic={mosaic} /></div>
      <span className="eyebrow">{kind}</span>
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
      <div className="collection-actions">
        <button className="btn primary" disabled={!ids.length} onClick={() => player.playQueue(ids, 0, context, { shuffle: false })}><Play size={18} fill="currentColor" /> Abspielen</button>
        <button className="btn secondary" disabled={!ids.length} onClick={() => player.playQueue(ids, 0, context, { shuffle: true, randomStart: true })}><Shuffle size={18} /> Zufall</button>
        {children}
      </div>
    </div>
  )
}
export { CollectionHeader }

export function Favorites() {
  const lib = useLibrary()
  const ids = lib.favorites
  return (
    <div className="page">
      <PageHeader title="" back="/library" />
      <CollectionHeader kind="Sammlung" title="Favoriten" subtitle={`${plural(ids.length, 'Song', 'Songs')} · ${fmtTotal(ids)}`}
        mosaic={[...new Set(ids.map((id) => trackById[id].cover))].length >= 4 ? [...new Set(ids.map((id) => trackById[id].cover))] : null}
        cover={ids[0] ? trackById[ids[0]].cover : null} ids={ids} context={{ key: 'favorites', label: 'Favoriten', to: '/favorites' }} />
      {ids.length ? <TrackList ids={ids} context={{ key: 'favorites', label: 'Favoriten', to: '/favorites' }} /> : (
        <EmptyState icon={Heart} title="Noch keine Favoriten" text="Tippe bei einem Song auf das Herz – er wird hier gespeichert und bleibt auch nach dem Schließen erhalten."
          action={<Link to="/discover" className="btn primary">Musik entdecken</Link>} />
      )}
    </div>
  )
}

export function Recent() {
  const lib = useLibrary()
  const [confirm, setConfirm] = useState(false)
  const ids = lib.recent.map((r) => r.id)
  const ctx = { key: 'recent', label: 'Zuletzt gehört', to: '/recent' }
  const fmtAgo = (at) => {
    const s = (Date.now() - at) / 1000
    if (s < 60) return 'gerade eben'
    if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`
    if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`
    return new Date(at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
  }
  return (
    <div className="page">
      <PageHeader title="Zuletzt gehört" back="/library" right={ids.length > 0 && (
        <button className="icon-btn glass" onClick={() => setConfirm(true)} aria-label="Verlauf löschen"><Trash2 size={20} /></button>
      )} />
      {ids.length ? (
        <>
          <p className="muted small-text">Zuletzt: {fmtAgo(lib.recent[0].at)}</p>
          <TrackList ids={ids} context={ctx} />
        </>
      ) : (
        <EmptyState icon={History} title="Noch nichts gehört" text="Sobald du Musik abspielst, findest du sie hier wieder."
          action={<Link to="/" className="btn primary">Zur Startseite</Link>} />
      )}
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Verlauf löschen?" text="Alle zuletzt gehörten Songs werden aus dem Verlauf entfernt." onConfirm={lib.clearRecent} />
    </div>
  )
}

export function Playlists() {
  const lib = useLibrary()
  const ui = useUI()
  return (
    <div className="page">
      <PageHeader title="Playlists" back="/library" right={
        <button className="icon-btn glass" onClick={() => ui.openCreatePlaylist()} aria-label="Neue Playlist"><Plus size={22} /></button>
      } />
      {lib.playlists.length === 0 && (
        <EmptyState icon={ListMusic} title="Keine Playlists" text="Erstelle deine erste Playlist – ohne Limit."
          action={<button className="btn primary" onClick={() => ui.openCreatePlaylist()}>Playlist erstellen</button>} />
      )}
      <div className="grid-cards">
        {lib.playlists.map((p) => (
          <Link key={p.id} to={`/playlist/${p.id}`} className="card">
            <div className="card-art"><Cover mosaic={playlistMosaic(p)} /></div>
            <strong>{p.name}</strong>
            <span>{plural(p.trackIds.length, 'Song', 'Songs')} · {fmtTotal(p.trackIds)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
