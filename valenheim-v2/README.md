# VALENHEIM – THE CITY CHALLENGE 2.0

Neuaufbau als Open-World-Lebenssimulation. Läuft **getrennt** vom alten Spiel (`../valenheim-game`, bleibt online).

## Stand: Phase 1 – Grundlage ✅
- Hauptmenü, Leistungstest (misst iPhone/PC und empfiehlt eine Grafikstufe), Einstellungen (im Konto gespeichert)
- Konto mit **Name + Passwort** (scrypt) auf allen Geräten, **Wiederherstellungscode**, Sitzungen 30 Tage (überleben Server-Neustarts)
- Speichersystem: Position + Einstellungen (Server prüft Tempo/Grenzen, speichert alle 30 s und beim Verlassen)
- Steuerung mit **Rapier-Physik** (Treppen, Bordsteine, Rampen, Springen, Kisten schieben), **Third/First Person** (V), Touch-Joystick
- Grafikstufen Niedrig/Mittel/Hoch + **Automatisch** (senkt die Stufe selbst, wenn es ruckelt)
- Datenbank: eigene Tabellen `v2_*` (Supabase/Postgres online, SQLite lokal) – das alte Spiel bleibt unberührt
- Tests: `cd server && node --test test/*.test.js` (5 Tests mit echter Postgres-Engine)

Nächster Schritt: **Phase 2 – die Valenheim-Karte aus den TikTok-Videos**.

## Lokal
```bash
npm run install:all && npm run build && npm start   # http://localhost:2600
```

## Online (kostenlos, zweiter Render-Dienst)
Render → New → Web Service → Repo `jarvis-2-`, Branch `claude/tiktok-7-days-city-series-ru97i7`,
Root Directory `valenheim-v2`, Build `npm run install:all && npm run build`, Start `npm start`, Instance **Free**,
Umgebungsvariablen: `NODE_VERSION=22.12.0`, `DATABASE_URL=` (derselbe Supabase-Link wie beim alten Spiel).
