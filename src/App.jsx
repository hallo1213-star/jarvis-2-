import { useEffect, useState } from 'react'
import { House, Compass, Search as SearchIcon, Library as LibraryIcon, Heart, History, Plus, Smile } from 'lucide-react'
import { RouterProvider, Link, useRouter } from './router.jsx'
import { LibraryProvider, useLibrary } from './store/LibraryContext.jsx'
import { PlayerProvider, usePlayer } from './store/PlayerContext.jsx'
import { UIProvider, useUI } from './store/UIContext.jsx'
import { onToast } from './store/toast.js'
import { FullPlayer, MiniPlayer, PlayerBar } from './components/Player.jsx'
import { Logo, Cover, playlistMosaic } from './components/ui.jsx'
import Home from './views/Home.jsx'
import Discover from './views/Discover.jsx'
import Search from './views/Search.jsx'
import Library, { Favorites, Playlists, Recent } from './views/Library.jsx'
import PlaylistDetail from './views/PlaylistDetail.jsx'
import { AlbumPage, ArtistPage, MoodPage, MoodsPage } from './views/Collections.jsx'
import Settings from './views/Settings.jsx'
import NotFound from './views/NotFound.jsx'

const TABS = [
  { to: '/', label: 'Start', icon: House, match: (p) => p === '/' || p.startsWith('/album') || p.startsWith('/artist') },
  { to: '/discover', label: 'Entdecken', icon: Compass, match: (p) => p.startsWith('/discover') || p.startsWith('/mood') },
  { to: '/search', label: 'Suche', icon: SearchIcon, match: (p) => p.startsWith('/search') },
  { to: '/library', label: 'Bibliothek', icon: LibraryIcon, match: (p) => ['/library', '/favorites', '/playlists', '/playlist', '/recent'].some((x) => p.startsWith(x)) },
]

function View() {
  const { parts } = useRouter()
  const [a, b] = parts
  switch (a) {
    case undefined: return <Home />
    case 'discover': return <Discover />
    case 'search': return <Search />
    case 'library': return <Library />
    case 'favorites': return <Favorites />
    case 'playlists': return <Playlists />
    case 'playlist': return <PlaylistDetail id={b} />
    case 'recent': return <Recent />
    case 'moods': return <MoodsPage />
    case 'mood': return <MoodPage id={b} />
    case 'artist': return <ArtistPage id={b} />
    case 'album': return <AlbumPage id={b} />
    case 'settings': return <Settings />
    default: return <NotFound />
  }
}

function TabBar() {
  const { path } = useRouter()
  return (
    <nav className="tab-bar" aria-label="Hauptnavigation">
      {TABS.map(({ to, label, icon: Icon, match }) => {
        const on = match(path)
        return (
          <Link key={to} to={to} className={`tab ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
            <Icon size={24} strokeWidth={on ? 2.4 : 1.8} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function Sidebar() {
  const { path } = useRouter()
  const lib = useLibrary()
  const ui = useUI()
  const extra = [
    { to: '/favorites', label: 'Favoriten', icon: Heart },
    { to: '/recent', label: 'Zuletzt gehört', icon: History },
    { to: '/moods', label: 'Stimmungen', icon: Smile },
  ]
  return (
    <aside className="sidebar">
      <Link to="/" className="sidebar-logo"><Logo size={30} /></Link>
      <nav>
        {TABS.map(({ to, label, icon: Icon, match }) => (
          <Link key={to} to={to} className={`side-link ${match(path) ? 'on' : ''}`}><Icon size={20} />{label}</Link>
        ))}
      </nav>
      <div className="side-sep" />
      <nav>
        {extra.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={`side-link ${path.startsWith(to) ? 'on' : ''}`}><Icon size={20} />{label}</Link>
        ))}
      </nav>
      <div className="side-head">
        <span>Playlists</span>
        <button className="icon-btn ghost small" onClick={() => ui.openCreatePlaylist()} aria-label="Neue Playlist"><Plus size={18} /></button>
      </div>
      <div className="side-playlists">
        {lib.playlists.map((p) => (
          <Link key={p.id} to={`/playlist/${p.id}`} className={`side-pl ${path === `/playlist/${p.id}` ? 'on' : ''}`}>
            <Cover mosaic={playlistMosaic(p)} size={36} />
            <span>{p.name}</span>
          </Link>
        ))}
      </div>
    </aside>
  )
}

function Toasts() {
  const [items, setItems] = useState([])
  useEffect(() => onToast((t) => {
    setItems((xs) => [...xs.slice(-1), t])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.duration)
  }), [])
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className="toast">{t.message}</div>)}
    </div>
  )
}

function Shell() {
  const { path } = useRouter()
  const player = usePlayer()
  const hasPlayer = Boolean(player.current)
  useEffect(() => {
    // Remove the HTML splash once the app is interactive
    const s = document.getElementById('boot')
    if (!s) return
    const t = setTimeout(() => {
      s.classList.add('done')
      setTimeout(() => s.remove(), 700)
    }, 650)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className={`app ${hasPlayer ? 'has-player' : ''}`}>
      <Sidebar />
      <main className="main">
        <div className="view" key={path}><View /></div>
      </main>
      <div className="bottom-dock">
        <MiniPlayer />
        <TabBar />
      </div>
      <PlayerBar />
      <FullPlayer />
      <Toasts />
    </div>
  )
}

export default function App() {
  return (
    <RouterProvider>
      <LibraryProvider>
        <PlayerProvider>
          <UIProvider>
            <Shell />
          </UIProvider>
        </PlayerProvider>
      </LibraryProvider>
    </RouterProvider>
  )
}
