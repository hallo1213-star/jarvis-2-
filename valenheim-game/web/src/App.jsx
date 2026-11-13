import { useEffect, useState } from 'react';
import Start from './pages/Start.jsx';
import Game from './pages/Game.jsx';
import Soon from './pages/Soon.jsx';
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
  if (route === '/profil') return <Soon titel="Bürgerprofil" phase={4} />;
  if (route === '/rangliste') return <Soon titel="Rangliste" phase={4} />;
  if (route === '/buergermeister') return <Soon titel="Bürgermeister-Dashboard" phase={5} />;
  return <Start profil={profil} checking={checking} onLogin={(p) => { setProfil(p); go('/spiel'); }} onLogout={() => { setToken(null); setProfil(null); }} />;
}
