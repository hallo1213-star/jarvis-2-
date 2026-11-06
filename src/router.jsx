import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// Hash router: works on any static host (GitHub Pages, Netlify, local files) and in the
// installed iOS web app without server-side rewrites.
const RouterContext = createContext(null)
let depth = 0 // in-app history depth, so "back" never leaves the app

const parse = () => {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, qs] = raw.split('?')
  const parts = path.split('/').filter(Boolean)
  return { path: '/' + parts.join('/'), parts, query: new URLSearchParams(qs || '') }
}

export function RouterProvider({ children }) {
  const [route, setRoute] = useState(parse)
  const [direction, setDirection] = useState('forward')

  useEffect(() => {
    const onHash = () => {
      setRoute(parse())
      window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((to, { replace = false } = {}) => {
    setDirection('forward')
    const target = '#' + to
    if (window.location.hash === target) return
    if (replace) {
      window.history.replaceState(null, '', target)
      setRoute(parse())
      window.scrollTo(0, 0)
    } else {
      depth += 1
      window.location.hash = to
    }
  }, [])

  const back = useCallback((fallback = '/') => {
    setDirection('back')
    if (depth > 0) {
      depth -= 1
      window.history.back()
    } else {
      window.history.replaceState(null, '', '#' + fallback)
      setRoute(parse())
      window.scrollTo(0, 0)
    }
  }, [])

  return (
    <RouterContext.Provider value={{ ...route, navigate, back, direction }}>
      {children}
    </RouterContext.Provider>
  )
}

export const useRouter = () => useContext(RouterContext)

export function Link({ to, children, className, onClick, ...rest }) {
  const { navigate } = useRouter()
  return (
    <a
      href={'#' + to}
      className={className}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey) return
        e.preventDefault()
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
