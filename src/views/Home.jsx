import { useMemo } from 'react'
import { Search, Plus, Settings, Sparkles } from 'lucide-react'
import { ALBUMS, ARTISTS, MOODS, TRACKS } from '../data/catalog.js'
import { getTrack } from '../data/tracks.js'
import { useLibrary } from '../store/LibraryContext.jsx'
import { usePlayer } from '../store/PlayerContext.jsx'
import { useUI } from '../store/UIContext.jsx'
import { Link, useRouter } from '../router.jsx'
import { Cover, Equalizer, Logo, Section, Shelf } from '../components/ui.jsx'
import { AlbumCard, ArtistCard, MoodCard, PlaylistCard, TrackCard } from '../components/Cards.jsx'
import { TrendingShelf } from './Audius.jsx'

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return 'Gute Nacht'
  if (h < 11) return 'Guten Morgen'
  if (h < 17) return 'Guten Tag'
  if (h < 22) return 'Guten Abend'
  return 'Gute Nacht'
}

// Recommendations: score tracks by moods/artists the listener already likes.
export function useRecommendations(limit = 8) {
  const { favorites, recent, playCounts } = useLibrary()
  return useMemo(() => {
    const moodScore = {}
    const artistScore = {}
    const seeds = [...favorites, ...recent.slice(0, 10).map((r) => r.id)]
    seeds.forEach((id) => {
      const t = getTrack(id)
      if (!t) return
      t.moods.forEach((m) => { moodScore[m] = (moodScore[m] || 0) + 1 })
      artistScore[t.artistId] = (artistScore[t.artistId] || 0) + 1
    })
    const hour = new Date().getHours()
    const timeMood = hour < 10 ? 'chill' : hour < 17 ? 'focus' : hour < 21 ? 'happy' : 'night'
    return [...TRACKS]
      .map((t, i) => {
        let s = t.moods.reduce((acc, m) => acc + (moodScore[m] || 0), 0) + (artistScore[t.artistId] || 0) * 0.6
        if (t.moods.includes(timeMood)) s += 1.5
        if (favorites.includes(t.id)) s -= 1.2 // surface new things
        s -= (playCounts[t.id] || 0) * 0.15
        s += ((i * 7) % 5) * 0.01 // stable tie-break
        return { t, s }
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.t)
  }, [favorites, recent, playCounts, limit])
}

export default function Home() {
  const lib = useLibrary()
  const player = usePlayer()
  const ui = useUI()
  const { navigate } = useRouter()
  const recs = useRecommendations(8)
  const recIds = recs.map((t) => t.id)
  const newReleases = [...ALBUMS].sort((a, b) => b.released.localeCompare(a.released))
  const recentIds = lib.recent.map((r) => r.id).slice(0, 6)
  const quick = recentIds.length ? recentIds : ['midnight-bloom', 'paper-skies', 'pulse-theory', 'aurora-drift', 'solar-run', 'gravity-lines']
  const name = lib.profile.name?.trim()
  const featured = newReleases[0]

  return (
    <div className="page home">
      <header className="home-top">
        <Logo size={30} />
        <Link to="/settings" className="avatar" aria-label="Profil & Einstellungen">
          {name ? name[0].toUpperCase() : <Settings size={18} />}
        </Link>
      </header>

      <div className="greeting">
        <h1>{greeting()}{name ? `, ${name}` : ''}</h1>
        <p>Millionen Songs, alles freigeschaltet – ohne Abo, ohne Werbung.</p>
      </div>

      <button className="search-launch" onClick={() => navigate('/search')}>
        <Search size={20} />
        <span>Was willst du hören?</span>
      </button>

      <section className="section">
        <div className="section-head"><h2>{recentIds.length ? 'Zuletzt gehört' : 'Leg direkt los'}</h2>
          {recentIds.length > 0 && <Link to="/recent" className="see-all">Alle</Link>}
        </div>
        <div className="quick-grid">
          {quick.map((id) => {
            const t = getTrack(id)
            if (!t) return null
            const active = player.current?.id === id
            return (
              <button key={id} className={`quick-tile ${active ? 'active' : ''}`}
                onClick={() => (active ? player.toggle() : player.playTrack(id, quick, { key: 'home:quick', label: recentIds.length ? 'Zuletzt gehört' : 'Startauswahl', to: recentIds.length ? '/recent' : '/' }))}>
                <Cover src={t.cover} size={52} />
                <span>{t.title}</span>
                {active && <Equalizer playing={player.isPlaying} small />}
              </button>
            )
          })}
        </div>
      </section>

      <Link to={`/album/${featured.id}`} className="hero" style={{ '--h1': featured.palette[0], '--h2': featured.palette[2] }}>
        <div className="hero-text">
          <span className="eyebrow"><Sparkles size={14} /> Neu auf AURIX</span>
          <h2>{featured.title}</h2>
          <p>{featured.artist} · {featured.type} · {featured.trackIds.length} Songs</p>
        </div>
        <Cover src={featured.cover} className="hero-cover" />
      </Link>

      <TrendingShelf title="Trending weltweit" />

      <TrendingShelf title="Hip-Hop & Rap" genre="Hip-Hop/Rap" />

      <Section title="Für dich empfohlen · AURIX Originals">
        <Shelf>
          {recs.map((t) => <TrackCard key={t.id} track={t} ids={recIds} context={{ key: 'home:recs', label: 'Für dich empfohlen', to: '/' }} />)}
        </Shelf>
      </Section>

      <TrendingShelf title="Electronic" genre="Electronic" />

      <Section title="Neue Veröffentlichungen" action={<Link to="/discover" className="see-all">Entdecken</Link>}>
        <Shelf>{newReleases.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf>
      </Section>

      <Section title="Musik nach Stimmung" action={<Link to="/moods" className="see-all">Alle</Link>}>
        <Shelf>{MOODS.map((m) => <MoodCard key={m.id} mood={m} />)}</Shelf>
      </Section>

      <TrendingShelf title="Lo-Fi zum Entspannen" genre="Lo-Fi" />

      <Section title="AURIX-Künstler">
        <Shelf>{ARTISTS.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf>
      </Section>

      <Section title="Deine Playlists" action={<Link to="/playlists" className="see-all">Alle</Link>}>
        <Shelf>
          {lib.playlists.map((p) => <PlaylistCard key={p.id} playlist={p} />)}
          <button className="card create-card" onClick={() => ui.openCreatePlaylist()}>
            <div className="card-art"><span className="create-art"><Plus size={34} /></span></div>
            <strong>Neue Playlist</strong>
            <span>Erstellen</span>
          </button>
        </Shelf>
      </Section>
    </div>
  )
}
