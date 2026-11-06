import { useMemo, useState } from 'react'
import { Pencil, Trash2, Plus, ListMusic, Search, Check, ArrowUpDown } from 'lucide-react'
import { TRACKS, searchCatalog } from '../data/catalog.js'
import { useLibrary } from '../store/LibraryContext.jsx'
import { useRouter } from '../router.jsx'
import { toast } from '../store/toast.js'
import { Confirm, Cover, EmptyState, PageHeader, Sheet, TextPrompt, fmtTotal, playlistMosaic, plural } from '../components/ui.jsx'
import { TrackList } from '../components/TrackRow.jsx'
import { CollectionHeader } from './Library.jsx'
import NotFound from './NotFound.jsx'

export default function PlaylistDetail({ id }) {
  const lib = useLibrary()
  const { navigate } = useRouter()
  const p = lib.playlists.find((x) => x.id === id)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [sorting, setSorting] = useState(false)
  const [q, setQ] = useState('')
  const candidates = useMemo(() => (q.trim() ? searchCatalog(q).tracks : TRACKS), [q])

  if (!p) return <NotFound text="Diese Playlist existiert nicht (mehr)." />
  const ctx = { key: `playlist:${p.id}`, label: p.name, to: `/playlist/${p.id}` }

  return (
    <div className="page">
      <PageHeader title="" back="/library" />
      <CollectionHeader kind="Playlist" title={p.name} subtitle={`${plural(p.trackIds.length, 'Song', 'Songs')} · ${fmtTotal(p.trackIds)}`}
        mosaic={playlistMosaic(p)} ids={p.trackIds} context={ctx}>
      </CollectionHeader>

      <div className="tool-row">
        <button className="tool" onClick={() => setAdding(true)}><Plus size={18} /> Songs hinzufügen</button>
        <button className="tool" onClick={() => setRenaming(true)}><Pencil size={16} /> Umbenennen</button>
        {p.trackIds.length > 1 && <button className={`tool ${sorting ? 'on' : ''}`} onClick={() => setSorting((s) => !s)}><ArrowUpDown size={16} /> {sorting ? 'Fertig' : 'Sortieren'}</button>}
        <button className="tool danger" onClick={() => setDeleting(true)}><Trash2 size={16} /> Löschen</button>
      </div>

      {p.trackIds.length ? (
        <TrackList ids={p.trackIds} context={ctx} playlistId={p.id} numbered={sorting} showCover={!sorting}
          onMove={sorting ? (from, to) => lib.moveInPlaylist(p.id, from, to) : undefined} />
      ) : (
        <EmptyState icon={ListMusic} title="Diese Playlist ist leer" text="Füge Songs hinzu, um loszulegen."
          action={<button className="btn primary" onClick={() => setAdding(true)}><Plus size={18} /> Songs hinzufügen</button>} />
      )}

      <TextPrompt open={renaming} onClose={() => setRenaming(false)} title="Playlist umbenennen" label="Neuer Name" initial={p.name}
        onSubmit={(name) => { lib.renamePlaylist(p.id, name); toast('Playlist umbenannt') }} />

      <Confirm open={deleting} onClose={() => setDeleting(false)} title="Playlist löschen?"
        text={`„${p.name}“ wird dauerhaft gelöscht. Die Songs bleiben im Katalog erhalten.`}
        onConfirm={() => { lib.deletePlaylist(p.id); toast('Playlist gelöscht'); navigate('/library', { replace: true }) }} />

      <Sheet open={adding} onClose={() => { setAdding(false); setQ('') }} title={`Zu „${p.name}“ hinzufügen`}>
        <label className="search-field compact">
          <Search size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Katalog durchsuchen" enterKeyHint="search" />
        </label>
        <div className="pick-list">
          {candidates.map((t) => {
            const has = p.trackIds.includes(t.id)
            return (
              <button key={t.id} className={`pick-row ${has ? 'added' : ''}`} onClick={() => {
                if (has) { lib.removeFromPlaylist(p.id, t.id); toast('Entfernt') }
                else { lib.addToPlaylist(p.id, t.id); toast(`„${t.title}“ hinzugefügt`) }
              }}>
                <Cover src={t.cover} size={48} />
                <span className="pick-meta"><strong>{t.title}</strong><span>{t.artist}</span></span>
                <span className={`pick-toggle ${has ? 'on' : ''}`}>{has ? <Check size={18} /> : <Plus size={18} />}</span>
              </button>
            )
          })}
          {candidates.length === 0 && <p className="muted small-text">Keine Treffer.</p>}
        </div>
      </Sheet>
    </div>
  )
}
