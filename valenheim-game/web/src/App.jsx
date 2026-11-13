import { useEffect, useState } from 'react';
import Start from './pages/Start.jsx';
import Game from './pages/Game.jsx';
import Rangliste from './pages/Rangliste.jsx';
import Profil from './pages/Profil.jsx';
import Buergermeister from './pages/Buergermeister.jsx';
import { api, getToken, setToken } from './lib/api.js';

// Einfache Hash-Navigation: #/ (Start), #/spiel, #/profil, #/rangliste, #/buergermeister
function useRoute() {
  const [r, setR] = useState(() => location.hash.replace(/^#/, '') || '/');
  useEffect(() => { const f = () => setR(location.hash.replace(/^#/, '') || '/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}
export const go = (p) => { location.hash = p; };

export default function App() {
  const route = useRoute();
  const [profil, setProfil] = useState(null);
  const [checking, setChecking] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api.me().then((d) => setProfil(d.profil)).catch((e) => { if (e.status === 401 || e.status === 403) setToken(null); }).finally(() => setChecking(false));
  }, []);

  if (route === '/spiel' && profil) return <Game profil={profil} onExit={() => go('/')} />;
  if (route === '/profil') return <Profil />;
  if (route.startsWith('/profil/')) return <Profil name={decodeURIComponent(route.slice(8))} />;
  if (route === '/rangliste') return <Rangliste meinName={profil?.name} />;
  if (route === '/buergermeister') return <Buergermeister />;
  return <Start profil={profil} checking={checking} onLogin={(p) => { setProfil(p); go('/spiel'); }} onLogout={() => { setToken(null); setProfil(null); }} />;
}
