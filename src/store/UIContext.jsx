import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Heart, ListPlus, ListEnd, ListStart, Disc3, UserRound, Trash2, Plus, Check, Share2 } from 'lucide-react'
import { getTrack, artistPath, albumPath } from '../data/tracks.js'
import { useLibrary } from './LibraryContext.jsx'
import { usePlayer } from './PlayerContext.jsx'
import { useRouter } from '../router.jsx'
import { toast } from './toast.js'
import { Cover, Sheet, TextPrompt, playlistMosaic, plural } from '../components/ui.jsx'

const UIContext = createContext(null)

export function UIProvider({ children }) {
  const lib = useLibrary()
  const player = usePlayer()
  const { navigate } = useRouter()
  const [menu, setMenu] = useState(null) // { trackId, playlistId }
  const [adding, setAdding] = useState(null) // trackId
  const [creating, setCreating] = useState(null) // { trackIds, open: true, go }

  const openTrackMenu = useCallback((trackId, opts = {}) => setMenu({ trackId, ...opts }), [])
  const openAddToPlaylist = useCallback((trackId) => setAdding(trackId), [])
  const openCreatePlaylist = useCallback((trackIds = [], go = true) => setCreating({ trackIds, go }), [])

  const t = menu ? getTrack(menu.trackId) : null
  const fav = t ? lib.isFavorite(t.id) : false

  const close = () => setMenu(null)
  const act = (fn) => () => { fn(); close() }

  const share = async (track) => {
    const url = track.permalink || `${window.location.origin}${window.location.pathname}#${albumPath(track) || artistPath(track)}`
    const data = { title: `${track.title} – ${track.artist}`, text: `Hör „${track.title}“ von ${track.artist} auf AURIX`, url }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(url)
        toast('Link kopiert')
      }
    } catch (e) {
      if (e?.name !== 'AbortError') toast('Teilen nicht möglich')
    }
  }

  const value = useMemo(() => ({ openTrackMenu, openAddToPlaylist, openCreatePlaylist }),
    [openTrackMenu, openAddToPlaylist, openCreatePlaylist])

  return (
    <UIContext.Provider value={value}>
      {children}

      <Sheet open={Boolean(menu)} onClose={close}>
        {t && (
          <>
            <div className="menu-track">
              <Cover src={t.cover} size={56} />
              <div className="menu-track-meta">
                <strong>{t.title}</strong>
                <span>{t.artist} · {t.source === 'audius' ? 'via Audius' : t.album}</span>
              </div>
            </div>
            <div className="menu-list">
              <button onClick={act(() => {
                const added = lib.toggleFavorite(t.id)
                toast(added ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt')
              })}>
                <Heart size={22} className={fav ? 'filled-heart' : ''} fill={fav ? 'currentColor' : 'none'} />
                {fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              </button>
              <button onClick={act(() => setAdding(t.id))}><ListPlus size={22} />Zu Playlist hinzufügen</button>
              <button onClick={act(() => player.addNext(t.id))}><ListStart size={22} />Als Nächstes spielen</button>
              <button onClick={act(() => player.addToQueue(t.id))}><ListEnd size={22} />Zur Warteschlange</button>
              {albumPath(t) && <button onClick={act(() => { player.setFullOpen(false); navigate(albumPath(t)) })}><Disc3 size={22} />Zum Album</button>}
              <button onClick={act(() => { player.setFullOpen(false); navigate(artistPath(t)) })}><UserRound size={22} />Zum Künstler</button>
              <button onClick={act(() => share(t))}><Share2 size={22} />Teilen</button>
              {menu.playlistId && (
                <button className="danger" onClick={act(() => {
                  lib.removeFromPlaylist(menu.playlistId, t.id)
                  toast('Aus Playlist entfernt')
                })}><Trash2 size={22} />Aus dieser Playlist entfernen</button>
              )}
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={Boolean(adding)} onClose={() => setAdding(null)} title="Zu Playlist hinzufügen">
        <div className="pick-list">
          <button className="pick-row create" onClick={() => { const id = adding; setAdding(null); setCreating({ trackIds: [id], go: false }) }}>
            <span className="pick-plus"><Plus size={24} /></span>
            <span className="pick-meta"><strong>Neue Playlist</strong><span>Mit diesem Song erstellen</span></span>
          </button>
          {lib.playlists.map((p) => {
            const has = adding && p.trackIds.includes(adding)
            return (
              <button key={p.id} className="pick-row" disabled={has} onClick={() => {
                lib.addToPlaylist(p.id, adding)
                toast(`Zu „${p.name}“ hinzugefügt`)
                setAdding(null)
              }}>
                <Cover mosaic={playlistMosaic(p)} size={48} />
                <span className="pick-meta"><strong>{p.name}</strong><span>{plural(p.trackIds.length, 'Song', 'Songs')}</span></span>
                {has && <Check size={20} className="accent" />}
              </button>
            )
          })}
        </div>
      </Sheet>

      <TextPrompt
        open={Boolean(creating)}
        onClose={() => setCreating(null)}
        title="Neue Playlist"
        label="Name der Playlist"
        initial=""
        confirm="Erstellen"
        onSubmit={(name) => {
          const p = lib.createPlaylist(name, creating?.trackIds || [])
          toast(`Playlist „${p.name}“ erstellt`)
          if (creating?.go) navigate(`/playlist/${p.id}`)
        }}
      />
    </UIContext.Provider>
  )
}

export const useUI = () => useContext(UIContext)
