import { UserPlus, UserCheck, Play, Pause, Shuffle } from 'lucide-react'
import { ARTISTS, MOODS, albumById, artistById, moodById, tracksForMood } from '../data/catalog.js'
import { useLibrary } from '../store/LibraryContext.jsx'
import { usePlayer } from '../store/PlayerContext.jsx'
import { toast } from '../store/toast.js'
import { Cover, PageHeader, Section, Shelf, fmtTotal, plural } from '../components/ui.jsx'
import { AlbumCard, ArtistCard, MoodCard } from '../components/Cards.jsx'
import { TrackList } from '../components/TrackRow.jsx'
import { CollectionHeader } from './Library.jsx'
import NotFound from './NotFound.jsx'

export function AlbumPage({ id }) {
  const a = albumById[id]
  if (!a) return <NotFound text="Dieses Album gibt es nicht." />
  const artist = artistById[a.artistId]
  const ctx = { key: `album:${a.id}`, label: a.title, to: `/album/${a.id}` }
  const more = ARTISTS.filter((x) => x.id !== a.artistId).slice(0, 4)
  return (
    <div className="page">
      <PageHeader title="" back="/" />
      <div className="album-glow" style={{ '--h1': a.palette[0] }} />
      <CollectionHeader kind={`${a.type} · ${a.year}`} title={a.title} cover={a.cover} ids={a.trackIds} context={ctx}
        subtitle={`${a.artist} · ${plural(a.trackIds.length, 'Song', 'Songs')} · ${fmtTotal(a.trackIds)}`} />
      <TrackList ids={a.trackIds} context={ctx} numbered showCover={false} />
      <p className="release-note muted small-text">
        Veröffentlicht am {new Date(a.released).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}<br />
        ℗ AURIX Originals · CC0 1.0 – frei nutzbar
      </p>
      <Section title={`Mehr von ${artist.name}`}>
        <Shelf>
          <ArtistCard artist={artist} />
          {artist.albumIds.filter((x) => x !== a.id).map((x) => <AlbumCard key={x} album={albumById[x]} />)}
        </Shelf>
      </Section>
      <Section title="Das könnte dir auch gefallen">
        <Shelf>{more.map((x) => <AlbumCard key={x.id} album={albumById[x.albumIds[0]]} />)}</Shelf>
      </Section>
    </div>
  )
}

export function ArtistPage({ id }) {
  const a = artistById[id]
  const lib = useLibrary()
  const player = usePlayer()
  if (!a) return <NotFound text="Diesen Künstler gibt es nicht." />
  const following = lib.followed.includes(a.id)
  const ctx = { key: `artist:${a.id}`, label: a.name, to: `/artist/${a.id}` }
  const playingHere = player.context?.key === ctx.key && player.isPlaying
  const related = ARTISTS.filter((x) => x.id !== a.id)
  return (
    <div className="page artist-page">
      <div className="artist-hero">
        <Cover src={a.cover} className="artist-hero-bg" />
        <div className="artist-hero-fade" />
        <div className="artist-hero-top"><PageHeader title="" back="/" /></div>
        <div className="artist-hero-text">
          <span className="eyebrow">{a.genre}</span>
          <h1>{a.name}</h1>
        </div>
      </div>
      <div className="artist-actions">
        <button className="play-fab large" onClick={() => (player.context?.key === ctx.key ? player.toggle() : player.playQueue(a.trackIds, 0, ctx, { shuffle: false }))}
          aria-label={playingHere ? 'Pause' : 'Abspielen'}>
          {playingHere ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="nudge" />}
        </button>
        <button className="icon-btn glass" onClick={() => player.playQueue(a.trackIds, 0, ctx, { shuffle: true, randomStart: true })} aria-label="Zufallswiedergabe"><Shuffle size={20} /></button>
        <button className={`btn ${following ? 'secondary' : 'outline'}`} onClick={() => { lib.toggleFollow(a.id); toast(following ? `${a.name} entfolgt` : `Du folgst jetzt ${a.name}`) }}>
          {following ? <><UserCheck size={18} /> Gefolgt</> : <><UserPlus size={18} /> Folgen</>}
        </button>
      </div>
      <Section title="Beliebte Songs"><TrackList ids={a.trackIds} context={ctx} numbered /></Section>
      <Section title="Releases"><Shelf>{a.albumIds.map((x) => <AlbumCard key={x} album={albumById[x]} />)}</Shelf></Section>
      <Section title="Über">
        <div className="about-card">
          <Cover src={a.cover} size={72} round />
          <p>{a.bio}</p>
        </div>
      </Section>
      <Section title="Ähnliche Künstler"><Shelf>{related.map((x) => <ArtistCard key={x.id} artist={x} />)}</Shelf></Section>
    </div>
  )
}

export function MoodsPage() {
  return (
    <div className="page">
      <PageHeader title="Stimmungen" back="/" subtitle="Wie fühlst du dich gerade?" />
      <div className="mood-grid">{MOODS.map((m) => <MoodCard key={m.id} mood={m} large />)}</div>
    </div>
  )
}

export function MoodPage({ id }) {
  const m = moodById[id]
  if (!m) return <NotFound text="Diese Stimmung gibt es nicht." />
  const ids = tracksForMood(m.id).map((t) => t.id)
  const ctx = { key: `mood:${m.id}`, label: `Stimmung: ${m.name}`, to: `/mood/${m.id}` }
  const others = MOODS.filter((x) => x.id !== m.id)
  const covers = [...new Set(tracksForMood(m.id).map((t) => t.cover))]
  return (
    <div className="page">
      <PageHeader title="" back="/moods" />
      <div className="mood-hero" style={{ '--g1': m.gradient[0], '--g2': m.gradient[1] }}>
        <span className="mood-glow" />
      </div>
      <CollectionHeader kind="Stimmung" title={m.name} subtitle={`${m.tagline} · ${plural(ids.length, 'Song', 'Songs')}`}
        mosaic={covers.length >= 4 ? covers : null} cover={covers[0]} ids={ids} context={ctx} />
      <TrackList ids={ids} context={ctx} />
      <Section title="Weitere Stimmungen"><Shelf>{others.map((x) => <MoodCard key={x.id} mood={x} />)}</Shelf></Section>
    </div>
  )
}
