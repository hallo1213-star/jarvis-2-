import { useEffect, useMemo, useRef, useState } from 'react'
import { Search as SearchIcon, X, Clock, SearchX } from 'lucide-react'
import { MOODS, searchCatalog } from '../data/catalog.js'
import { useLibrary } from '../store/LibraryContext.jsx'
import { useRouter } from '../router.jsx'
import { EmptyState, Section, Shelf } from '../components/ui.jsx'
import { AlbumCard, ArtistCard, MoodCard, PlaylistCard } from '../components/Cards.jsx'
import { TrackList } from '../components/TrackRow.jsx'
import { AudiusSearch, GenreChips } from './Audius.jsx'

const FILTERS = [['all', 'Alle'], ['tracks', 'Songs'], ['artists', 'Künstler'], ['albums', 'Alben'], ['playlists', 'Playlists']]

export default function Search() {
  const { query, navigate } = useRouter()
  const lib = useLibrary()
  const [q, setQ] = useState(query.get('q') || '')
  const [filter, setFilter] = useState('all')
  const input = useRef(null)

  useEffect(() => {
    const fromUrl = query.get('q')
    if (fromUrl != null) setQ(fromUrl)
  }, [query])

  useEffect(() => {
    if (!query.get('q')) {
      const t = setTimeout(() => input.current?.focus({ preventScroll: true }), 250)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // store a search once the user paused typing
  useEffect(() => {
    if (q.trim().length < 2) return
    const t = setTimeout(() => lib.addSearch(q), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const res = useMemo(() => searchCatalog(q), [q])
  const playlists = useMemo(() => {
    const v = q.trim().toLowerCase()
    return v ? lib.playlists.filter((p) => p.name.toLowerCase().includes(v)) : []
  }, [q, lib.playlists])
  const total = res.tracks.length + res.artists.length + res.albums.length + playlists.length
  const show = (k) => filter === 'all' || filter === k
  const ctx = { key: `search:${q}`, label: `Suche „${q}“`, to: `/search?q=${encodeURIComponent(q)}` }

  return (
    <div className="page">
      <h1 className="page-title standalone">Suche</h1>
      <form className="search-field" onSubmit={(e) => { e.preventDefault(); lib.addSearch(q); input.current?.blur() }} role="search">
        <SearchIcon size={20} />
        <input
          ref={input}
          type="search"
          value={q}
          placeholder="Was willst du hören?"
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Suche"
        />
        {q && <button type="button" className="icon-btn ghost small" onClick={() => { setQ(''); navigate('/search', { replace: true }); input.current?.focus() }} aria-label="Suche leeren"><X size={18} /></button>}
      </form>

      {!q.trim() && (
        <>
          {lib.searches.length > 0 && (
            <Section title="Letzte Suchen" action={<button className="see-all" onClick={lib.clearSearches}>Löschen</button>}>
              <div className="chip-cloud">
                {lib.searches.map((s) => (
                  <button key={s} className="chip" onClick={() => setQ(s)}><Clock size={14} /> {s}</button>
                ))}
              </div>
            </Section>
          )}
          <Section title="Genres">
            <GenreChips />
          </Section>
          <Section title="Stöbern nach Stimmung">
            <div className="mood-grid">{MOODS.map((m) => <MoodCard key={m.id} mood={m} />)}</div>
          </Section>
        </>
      )}

      {q.trim() && (
        <>
          <div className="filter-row" role="tablist">
            {FILTERS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
          {(filter === 'all' || filter === 'tracks' || filter === 'artists') && <AudiusSearch query={q} filter={filter} />}
          {show('tracks') && res.tracks.length > 0 && <Section title="AURIX Originals"><TrackList ids={res.tracks.map((t) => t.id)} context={ctx} /></Section>}
          {show('artists') && res.artists.length > 0 && <Section title="Künstler"><Shelf>{res.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf></Section>}
          {show('albums') && res.albums.length > 0 && <Section title="Alben"><Shelf>{res.albums.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf></Section>}
          {show('playlists') && playlists.length > 0 && <Section title="Deine Playlists"><Shelf>{playlists.map((p) => <PlaylistCard key={p.id} playlist={p} />)}</Shelf></Section>}
          {((filter === 'albums' && !res.albums.length) || (filter === 'playlists' && !playlists.length)) && (
            <EmptyState icon={SearchX} title="Nichts in dieser Kategorie" text={`Keine ${filter === 'albums' ? 'Alben' : 'Playlists'} für „${q}“.`} />
          )}
        </>
      )}
    </div>
  )
}
