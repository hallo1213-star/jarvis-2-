import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { trackById, artistById } from '../data/catalog.js'
import { load, save, clearAll } from './storage.js'

const LibraryContext = createContext(null)

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
const validTrack = (id) => Boolean(trackById[id])

function initialPlaylists() {
  const stored = load('playlists', null)
  if (Array.isArray(stored)) {
    return stored
      .filter((p) => p && p.id && typeof p.name === 'string')
      .map((p) => ({ ...p, trackIds: (p.trackIds || []).filter(validTrack) }))
  }
  // A starter playlist so the library never feels empty – fully editable/deletable.
  return [
    {
      id: uid(),
      name: 'Late Night Drive',
      description: 'Neon, Bass und leere Straßen.',
      trackIds: ['midnight-bloom', 'neon-cathedral', 'gravity-lines', 'velvet-orbit'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]
}

export function LibraryProvider({ children }) {
  const [favorites, setFavorites] = useState(() => load('favorites', []).filter(validTrack))
  const [playlists, setPlaylists] = useState(initialPlaylists)
  const [recent, setRecent] = useState(() => load('recent', []).filter((r) => r && validTrack(r.id)))
  const [followed, setFollowed] = useState(() => load('followed', []).filter((id) => artistById[id]))
  const [playCounts, setPlayCounts] = useState(() => load('playCounts', {}))
  const [searches, setSearches] = useState(() => load('searches', []))
  const [profile, setProfile] = useState(() => ({ name: '', ...load('profile', {}) }))

  useEffect(() => { save('favorites', favorites) }, [favorites])
  useEffect(() => { save('playlists', playlists) }, [playlists])
  useEffect(() => { save('recent', recent) }, [recent])
  useEffect(() => { save('followed', followed) }, [followed])
  useEffect(() => { save('playCounts', playCounts) }, [playCounts])
  useEffect(() => { save('searches', searches) }, [searches])
  useEffect(() => { save('profile', profile) }, [profile])

  const isFavorite = useCallback((id) => favorites.includes(id), [favorites])
  const toggleFavorite = useCallback((id) => {
    const added = !favorites.includes(id)
    setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [id, ...f]))
    return added
  }, [favorites])

  const createPlaylist = useCallback((name, trackIds = []) => {
    const p = {
      id: uid(),
      name: name.trim() || 'Neue Playlist',
      description: '',
      trackIds: trackIds.filter(validTrack),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setPlaylists((ps) => [p, ...ps])
    return p
  }, [])

  const updatePlaylist = useCallback((id, patch) => {
    setPlaylists((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)))
  }, [])

  const renamePlaylist = useCallback((id, name) => {
    if (!name.trim()) return
    updatePlaylist(id, { name: name.trim() })
  }, [updatePlaylist])

  const deletePlaylist = useCallback((id) => setPlaylists((ps) => ps.filter((p) => p.id !== id)), [])

  const addToPlaylist = useCallback((playlistId, trackId) => {
    const target = playlists.find((p) => p.id === playlistId)
    const added = Boolean(target) && !target.trackIds.includes(trackId)
    setPlaylists((ps) => ps.map((p) => {
      if (p.id !== playlistId || p.trackIds.includes(trackId)) return p
      return { ...p, trackIds: [...p.trackIds, trackId], updatedAt: Date.now() }
    }))
    return added
  }, [playlists])

  const removeFromPlaylist = useCallback((playlistId, trackId) => {
    setPlaylists((ps) => ps.map((p) => (p.id === playlistId
      ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId), updatedAt: Date.now() }
      : p)))
  }, [])

  const moveInPlaylist = useCallback((playlistId, from, to) => {
    setPlaylists((ps) => ps.map((p) => {
      if (p.id !== playlistId) return p
      if (to < 0 || to >= p.trackIds.length) return p
      const ids = [...p.trackIds]
      const [m] = ids.splice(from, 1)
      ids.splice(to, 0, m)
      return { ...p, trackIds: ids, updatedAt: Date.now() }
    }))
  }, [])

  const markPlayed = useCallback((id) => {
    setRecent((r) => [{ id, at: Date.now() }, ...r.filter((x) => x.id !== id)].slice(0, 50))
    setPlayCounts((c) => ({ ...c, [id]: (c[id] || 0) + 1 }))
  }, [])

  const clearRecent = useCallback(() => setRecent([]), [])

  const toggleFollow = useCallback((artistId) => {
    setFollowed((f) => (f.includes(artistId) ? f.filter((x) => x !== artistId) : [artistId, ...f]))
  }, [])

  const addSearch = useCallback((q) => {
    const v = q.trim()
    if (!v) return
    setSearches((s) => [v, ...s.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 8))
  }, [])
  const clearSearches = useCallback(() => setSearches([]), [])

  const resetAll = useCallback(() => {
    clearAll()
    window.location.reload()
  }, [])

  const value = useMemo(() => ({
    favorites, isFavorite, toggleFavorite,
    playlists, createPlaylist, updatePlaylist, renamePlaylist, deletePlaylist,
    addToPlaylist, removeFromPlaylist, moveInPlaylist,
    recent, markPlayed, clearRecent, playCounts,
    followed, toggleFollow,
    searches, addSearch, clearSearches,
    profile, setProfile,
    resetAll,
  }), [favorites, isFavorite, toggleFavorite, playlists, createPlaylist, updatePlaylist, renamePlaylist,
    deletePlaylist, addToPlaylist, removeFromPlaylist, moveInPlaylist, recent, markPlayed, clearRecent,
    playCounts, followed, toggleFollow, searches, addSearch, clearSearches, profile, resetAll])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export const useLibrary = () => useContext(LibraryContext)
