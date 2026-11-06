import { useMemo } from 'react'
import { Shuffle } from 'lucide-react'
import { ALBUMS, ARTISTS, MOODS, TRACKS } from '../data/catalog.js'
import { useLibrary } from '../store/LibraryContext.jsx'
import { usePlayer } from '../store/PlayerContext.jsx'
import { Link } from '../router.jsx'
import { Cover, PageHeader, Section, Shelf } from '../components/ui.jsx'
import { AlbumCard, ArtistCard, MoodCard } from '../components/Cards.jsx'
import { TrackList } from '../components/TrackRow.jsx'
import { AudiusCredit, GenreChips, TrendingShelf } from './Audius.jsx'

export default function Discover() {
  const { playCounts } = useLibrary()
  const player = usePlayer()
  const allIds = TRACKS.map((t) => t.id)
  const genres = useMemo(() => [...new Set(ARTISTS.map((a) => a.genre))], [])
  // "Deine Top-Titel" is based on real local play counts; untouched catalog order otherwise.
  const top = useMemo(() => [...TRACKS].sort((a, b) => (playCounts[b.id] || 0) - (playCounts[a.id] || 0)).slice(0, 6).map((t) => t.id), [playCounts])
  const hasPlays = Object.keys(playCounts).length > 0

  return (
    <div className="page">
      <PageHeader title="Entdecken" subtitle="Trends, Genres und die AURIX Originals – frei hörbar, ohne Limits." />

      <div className="hero-carousel">
        {ALBUMS.map((a) => (
          <Link key={a.id} to={`/album/${a.id}`} className="hero-slide" style={{ '--h1': a.palette[0], '--h2': a.palette[2] }}>
            <Cover src={a.cover} className="hero-slide-cover" />
            <div className="hero-slide-text">
              <span className="eyebrow">{a.type} · {a.year}</span>
              <strong>{a.title}</strong>
              <span>{a.artist}</span>
            </div>
          </Link>
        ))}
      </div>

      <button className="btn primary wide shuffle-all" onClick={() => player.playQueue(allIds, 0, { key: 'catalog', label: 'Gesamter Katalog', to: '/discover' }, { shuffle: true, randomStart: true })}>
        <Shuffle size={18} /> AURIX Originals mischen
      </button>

      <TrendingShelf title="Trending diese Woche" />

      <Section title="Genres">
        <GenreChips />
      </Section>

      <TrendingShelf title="Pop" genre="Pop" />
      <TrendingShelf title="House" genre="House" />
      <TrendingShelf title="R&B / Soul" genre="R&B/Soul" />
      <AudiusCredit />

      <Section title="Stimmungen (AURIX Originals)">
        <div className="mood-grid">{MOODS.map((m) => <MoodCard key={m.id} mood={m} />)}</div>
      </Section>

      <Section title={hasPlays ? 'Deine meistgehörten Titel' : 'Highlights'}>
        <TrackList ids={top} numbered context={{ key: 'discover:top', label: hasPlays ? 'Meistgehört' : 'Highlights', to: '/discover' }} />
      </Section>

      <Section title="Alle Alben & EPs">
        <Shelf>{ALBUMS.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf>
      </Section>

      <Section title="Genres der AURIX Originals">
        <div className="chip-cloud">
          {genres.map((g) => <Link key={g} to={`/search?q=${encodeURIComponent(g.split(' ')[0])}`} className="chip">{g}</Link>)}
        </div>
      </Section>

      <Section title="Künstler">
        <Shelf>{ARTISTS.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf>
      </Section>
    </div>
  )
}
