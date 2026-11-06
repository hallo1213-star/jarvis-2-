import { useEffect, useState } from 'react'
import { Loader2, WifiOff, RefreshCw, UserPlus, UserCheck, Play, Pause, Shuffle, BadgeCheck, Radio } from 'lucide-react'
import { audius, AUDIUS_GENRES } from '../data/audius.js'
import { useLibrary } from '../store/LibraryContext.jsx'
import { usePlayer } from '../store/PlayerContext.jsx'
import { toast } from '../store/toast.js'
import { Link } from '../router.jsx'
import { Cover, EmptyState, PageHeader, Section, Shelf } from '../components/ui.jsx'
import { TrackCard } from '../components/Cards.jsx'
import { TrackList } from '../components/TrackRow.jsx'

// Small data hook: loading / error / retry for Audius requests
export function useAudius(fn, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then(
      (data) => alive && setState({ loading: false, error: null, data }),
      (error) => alive && setState({ loading: false, error, data: null }),
    )
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])
  return { ...state, retry: () => setAttempt((a) => a + 1) }
}

export function Loading({ label = 'Lade Musik …' }) {
  return <div className="loading-row"><Loader2 size={20} className="spin" /> {label}</div>
}

export function LoadError({ retry }) {
  return (
    <div className="load-error">
      <WifiOff size={20} />
      <span>Audius ist gerade nicht erreichbar. Prüfe deine Internetverbindung.</span>
      <button className="btn secondary" onClick={retry}><RefreshCw size={16} /> Erneut versuchen</button>
    </div>
  )
}

export function AudiusCredit() {
  return (
    <p className="audius-credit">
      <Radio size={14} /> Gestreamt über <a href="https://audius.co" target="_blank" rel="noreferrer">Audius</a> – Musik, die Künstler selbst zum freien Streamen veröffentlichen.
    </p>
  )
}

const shelfSkeleton = (
  <Shelf>{Array.from({ length: 5 }, (_, i) => <div key={i} className="card skeleton"><div className="card-art"><div className="cover" /></div><i /><i /></div>)}</Shelf>
)

// Shelf of trending tracks (Home / Discover)
export function TrendingShelf({ title = 'Trending weltweit', genre }) {
  const { loading, error, data, retry } = useAudius(() => audius.trending({ genre, limit: 20 }), [genre])
  const ids = (data || []).map((t) => t.id)
  const ctx = { key: `audius:trending:${genre || 'all'}`, label: genre ? `Trending · ${genre}` : 'Trending auf Audius', to: genre ? `/audius/genre/${encodeURIComponent(genre)}` : '/audius/trending' }
  return (
    <Section title={title} action={<Link to={ctx.to} className="see-all">Alle</Link>}>
      {loading && shelfSkeleton}
      {error && <LoadError retry={retry} />}
      {data && <Shelf>{data.map((t) => <TrackCard key={t.id} track={t} ids={ids} context={ctx} />)}</Shelf>}
    </Section>
  )
}

export function GenreChips() {
  return (
    <div className="chip-cloud">
      {AUDIUS_GENRES.map((g) => <Link key={g} to={`/audius/genre/${encodeURIComponent(g)}`} className="chip">{g}</Link>)}
    </div>
  )
}

function TrackPage({ title, subtitle, load, deps, ctx, back = '/discover', children }) {
  const player = usePlayer()
  const { loading, error, data, retry } = useAudius(load, deps)
  const ids = (data || []).map((t) => t.id)
  return (
    <div className="page">
      <PageHeader title={title} back={back} subtitle={subtitle} />
      {children}
      <div className="collection-actions left">
        <button className="btn primary" disabled={!ids.length} onClick={() => player.playQueue(ids, 0, ctx, { shuffle: false })}><Play size={18} fill="currentColor" /> Abspielen</button>
        <button className="btn secondary" disabled={!ids.length} onClick={() => player.playQueue(ids, 0, ctx, { shuffle: true, randomStart: true })}><Shuffle size={18} /> Zufall</button>
      </div>
      {loading && <Loading />}
      {error && <LoadError retry={retry} />}
      {data && data.length === 0 && <EmptyState title="Keine Titel gefunden" text="Hier gibt es gerade keine abspielbaren Songs." />}
      {data && data.length > 0 && <TrackList ids={ids} context={ctx} numbered />}
      <AudiusCredit />
    </div>
  )
}

const TIMES = [['week', 'Woche'], ['month', 'Monat'], ['allTime', 'Allzeit']]

export function TrendingPage() {
  const [time, setTime] = useState('week')
  return (
    <TrackPage title="Trending" subtitle="Die meistgehörten Songs auf Audius" load={() => audius.trending({ time, limit: 100 })} deps={[time]}
      ctx={{ key: `audius:trending:all:${time}`, label: 'Trending auf Audius', to: '/audius/trending' }}>
      <div className="filter-row flush">
        {TIMES.map(([k, l]) => <button key={k} className={`chip ${time === k ? 'on' : ''}`} onClick={() => setTime(k)}>{l}</button>)}
      </div>
    </TrackPage>
  )
}

export function GenrePage({ genre }) {
  const g = decodeURIComponent(genre || '')
  return (
    <TrackPage title={g} subtitle="Trending in diesem Genre" load={() => audius.trending({ genre: g, limit: 100 })} deps={[g]}
      ctx={{ key: `audius:genre:${g}`, label: `Genre: ${g}`, to: `/audius/genre/${encodeURIComponent(g)}` }} />
  )
}

export function AudiusArtistPage({ id }) {
  const lib = useLibrary()
  const player = usePlayer()
  const user = useAudius(() => audius.user(id), [id])
  const tracks = useAudius(() => audius.userTracks(id), [id])
  const u = user.data
  const ids = (tracks.data || []).map((t) => t.id)
  const key = `au-user:${id}`
  const following = lib.followed.includes(key)
  const ctx = { key: `audius:artist:${id}`, label: u?.name || 'Künstler', to: `/audius/artist/${id}` }
  const playingHere = player.context?.key === ctx.key && player.isPlaying
  return (
    <div className="page artist-page">
      <div className="artist-hero">
        {(u?.cover || u?.picture) && <Cover src={u.cover || u.picture} className="artist-hero-bg" />}
        <div className="artist-hero-fade" />
        <div className="artist-hero-top"><PageHeader title="" back="/" /></div>
        <div className="artist-hero-text">
          {u && <span className="eyebrow">{u.verified && <BadgeCheck size={14} />} {u.followers.toLocaleString('de-DE')} Follower · Audius</span>}
          <h1>{u ? u.name : user.loading ? '…' : 'Künstler'}</h1>
        </div>
      </div>
      {user.error && <LoadError retry={user.retry} />}
      <div className="artist-actions">
        <button className="play-fab large" disabled={!ids.length}
          onClick={() => (player.context?.key === ctx.key ? player.toggle() : player.playQueue(ids, 0, ctx, { shuffle: false }))}
          aria-label={playingHere ? 'Pause' : 'Abspielen'}>
          {playingHere ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="nudge" />}
        </button>
        <button className="icon-btn glass" disabled={!ids.length} onClick={() => player.playQueue(ids, 0, ctx, { shuffle: true, randomStart: true })} aria-label="Zufallswiedergabe"><Shuffle size={20} /></button>
        {u && (
          <button className={`btn ${following ? 'secondary' : 'outline'}`} onClick={() => {
            lib.toggleFollow(key, { name: u.name, picture: u.picture, handle: u.handle })
            toast(following ? `${u.name} entfolgt` : `Du folgst jetzt ${u.name}`)
          }}>
            {following ? <><UserCheck size={18} /> Gefolgt</> : <><UserPlus size={18} /> Folgen</>}
          </button>
        )}
      </div>
      <Section title="Beliebte Songs">
        {tracks.loading && <Loading />}
        {tracks.error && <LoadError retry={tracks.retry} />}
        {tracks.data && (ids.length ? <TrackList ids={ids} context={ctx} numbered /> : <p className="muted">Keine frei streambaren Songs.</p>)}
      </Section>
      {u?.bio && (
        <Section title="Über">
          <div className="about-card"><Cover src={u.picture} size={72} round /><p>{u.bio}</p></div>
        </Section>
      )}
      <AudiusCredit />
    </div>
  )
}

// Search results from Audius (used inside the Search view)
export function AudiusSearch({ query, filter }) {
  const [q, setQ] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => setQ(query), 350)
    return () => clearTimeout(t)
  }, [query])
  const tracks = useAudius(() => (q.trim() ? audius.searchTracks(q) : Promise.resolve([])), [q])
  const users = useAudius(() => (q.trim() ? audius.searchUsers(q) : Promise.resolve([])), [q])
  const ids = (tracks.data || []).map((t) => t.id)
  const ctx = { key: `audius:search:${q}`, label: `Suche „${q}“`, to: `/search?q=${encodeURIComponent(q)}` }
  const showTracks = filter === 'all' || filter === 'tracks'
  const showArtists = filter === 'all' || filter === 'artists'
  return (
    <>
      {showTracks && (
        <Section title="Songs auf Audius">
          {tracks.loading && <Loading label="Suche auf Audius …" />}
          {tracks.error && <LoadError retry={tracks.retry} />}
          {tracks.data && (ids.length ? <TrackList ids={ids} context={ctx} /> : <p className="muted small-text">Keine Songs auf Audius gefunden.</p>)}
        </Section>
      )}
      {showArtists && users.data && users.data.length > 0 && (
        <Section title="Künstler auf Audius">
          <Shelf>
            {users.data.slice(0, 12).map((u) => (
              <Link key={u.id} to={`/audius/artist/${u.id}`} className="card artist-card">
                <div className="card-art"><Cover src={u.picture} alt={u.name} round /></div>
                <strong>{u.name}</strong>
                <span>{u.followers.toLocaleString('de-DE')} Follower</span>
              </Link>
            ))}
          </Shelf>
        </Section>
      )}
      <AudiusCredit />
    </>
  )
}
