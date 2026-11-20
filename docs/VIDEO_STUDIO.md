# AURIX Video Studio – KI-Videos per ChatGPT, Claude Code oder App

```
 Du ──„Erstelle mir ein Video über …“──▶ ChatGPT (eigener GPT)
                                            │  Konzept + Szenen-Prompts
                                            ▼  POST /api/video/jobs  (VIDEO_INTAKE_TOKEN)
                                   AURIX Video-Server (server/)
                                            │  Status: „Wartet auf Bestätigung“ + Preis
                     Du bestätigst in der App ──▶ Generierung bei fal.ai / Replicate
                                            │  Fortschritt, Download, Szenen-Schnitt (ffmpeg)
                                            ▼
                         server/storage/videos/<id>.mp4 ──▶ Video Studio: Vorschau & Download
```

* **Echte KI-Videos** (Text→Video und Bild→Video) mit Bewegung, Kamerafahrten, Menschen, Autos, Landschaften – keine Diashow.
* **Mehrere Szenen** werden einzeln generiert und automatisch zu einem Film zusammengeschnitten.
* **Kostenschutz:** Kostenpflichtige Aufträge starten **nur**, wenn du den angezeigten Preis in der App bestätigst. ChatGPTs Schlüssel kann technisch gar nicht bestätigen. Zusätzlich: Limit pro Video und Tagesbudget.
* **API-Schlüssel nur auf dem Server** (Datei `.env`, nicht im Git, nie im Browser).

---

## 1. Schnellstart (lokal)

```bash
npm install
cp .env.example .env          # Schlüssel eintragen (siehe unten)
npm run server                # Video-Server  → http://127.0.0.1:8787
npm run dev                   # App (Vite)    → http://localhost:5173/#/studio
```

Oder alles in einem Prozess: `npm start` (baut die App und liefert sie über den Video-Server aus → http://127.0.0.1:8787).

Ohne Schlüssel läuft der **Test-Modus** (kostenlos): Er prüft die komplette Kette Auftrag → Fortschritt → Speichern → Vorschau → Download mit einer lokal per ffmpeg gerenderten Testsequenz. Das ist ausdrücklich **kein KI-Video**.

## 2. Wo trage ich den API-Schlüssel ein?

Datei **`.env`** im Projekt-Hauptordner (neben `package.json`), anlegen per `cp .env.example .env`:

```ini
FAL_KEY=dein-fal-schlüssel              # https://fal.ai/dashboard/keys
VIDEO_INTAKE_TOKEN=lange-zufallszeichenkette   # für ChatGPT
VIDEO_APP_TOKEN=andere-zufallszeichenkette     # für deine App (Pflicht, sobald öffentlich)
```

Zufallswerte erzeugen: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`

Danach den Server neu starten. Im Video Studio zeigt der Button „Verbunden“ oben rechts, welche Anbieter aktiv sind.
Wenn `VIDEO_APP_TOKEN` gesetzt ist: in der App auf „Verbunden/Offline“ tippen → App-Token eintragen.

## 3. Anbieter & Kosten (Stand Ende 2026 – Schätzwerte, bitte beim Anbieter prüfen)

| Modell (ID) | Anbieter | Stärke | ca. Preis |
|---|---|---|---|
| `demo-motion` | lokal | Pipeline-Test, **keine KI** | kostenlos |
| `ltx-2-fast` | fal.ai | am günstigsten, schnell, bis 4K, optional Ton | ~0,04 $/s (1080p) → 6-s-Clip ≈ 0,24 $ |
| `wan-2.5` | fal.ai | Open Source, gutes Preis/Leistung | ~0,05–0,15 $/s |
| `kling-2.5-turbo-pro` | fal.ai | sehr realistische Menschen/Autos/Kamerafahrten (Standard) | ~0,07 $/s → 5 s ≈ 0,35 $ |
| `veo-3.1-fast` | fal.ai | Kinoqualität mit Ton | ~0,10–0,15 $/s |
| `replicate-wan-2.2-fast` | Replicate | Alternative | ~0,015–0,03 $/s |

**Empfehlung:** fal.ai – ein Schlüssel für alle Top-Modelle, Abrechnung pro Sekunde, kein Abo. Für Entwürfe `ltx-2-fast`,
für finale TikToks `kling-2.5-turbo-pro`. Echte, dauerhaft kostenlose KI-Video-APIs gibt es derzeit praktisch nicht
(Gratis-Kontingente sind klein, mit Wasserzeichen oder nur in Web-Apps) – deshalb Test-Modus + günstigstes Modell + Budgetbremse.

Preise und Endpunkte stehen zentral in `server/models.js` und lassen sich dort anpassen bzw. um weitere Modelle ergänzen.

## 4. ChatGPT verbinden („Erstelle mir ein Video über …“)

ChatGPT muss deinen Server über **HTTPS aus dem Internet** erreichen:

* **Schnell zum Testen:** Tunnel, z. B. `cloudflared tunnel --url http://127.0.0.1:8787` → die angezeigte `https://…trycloudflare.com`-Adresse als `PUBLIC_URL` in `.env` eintragen, Server neu starten.
* **Dauerhaft:** Server auf Render/Railway/Fly.io/VPS deployen (`npm start`, Umgebungsvariablen wie in `.env` setzen, persistente Disk für `server/storage`).

Dann in ChatGPT: **GPTs → Erstellen → Konfigurieren → Aktionen → Neue Aktion**

1. **Schema:** „Von URL importieren“ → `https://<PUBLIC_URL>/openapi.json`
2. **Authentifizierung:** API-Schlüssel → Auth-Typ **Bearer** → Wert = `VIDEO_INTAKE_TOKEN`
3. **Anweisungen** des GPT (einfügen):

```text
Du bist mein Video-Regisseur für das AURIX Video Studio.
Wenn ich sage „Erstelle mir ein Video über …“:
1. Entwickle ein kurzes Videokonzept (Ziel, Zielgruppe, Stimmung, Stil, Musik/Ton-Idee). Frage nur nach, wenn Wesentliches fehlt.
   Standardformat 9:16 (TikTok); 16:9, wenn ich YouTube/Querformat sage.
2. Zerlege es in 2–4 Szenen à 5–10 Sekunden. Schreibe pro Szene einen detaillierten ENGLISCHEN Prompt:
   Motiv + Handlung, Umgebung, Tageszeit/Licht, Kamerabewegung (dolly, drone, tracking, orbit), Objektiv, Stil
   („photorealistic, cinematic, 35mm“). Keine Schrift/Logos im Bild, keine echten Prominenten.
3. Rufe createVideoJob auf mit title, concept (deutsch), aspect_ratio, quality („standard“, „cheap“ für Entwürfe,
   „premium“ wenn ich beste Qualität will), negative_prompt („blurry, distorted faces, extra limbs, text, watermark“)
   und scenes.
4. Antworte mit Titel, Szenenübersicht, geschätzten Kosten (estimate_usd) und dem Link app_url.
   Sage mir, dass ich die Generierung dort bestätigen muss. Du kannst nichts Kostenpflichtiges selbst starten.
5. Wenn ich nach dem Stand frage, nutze getVideoJob und gib Fortschritt bzw. den Videolink aus.
```

Der Auftrag erscheint sofort in der App unter **„Wartet auf deine Bestätigung“** (der `app_url`-Link öffnet direkt die Bestätigung).

## 5. Claude Code

* Slash-Befehl im Projekt: `/video <Thema>` – Claude entwickelt Konzept + Prompts und reicht den Auftrag ein.
* Direkt: `npm run video -- "A red sports car on a coastal road, drone shot" --format 9:16 --quality cheap --watch`
* Mit Datei: `npm run video -- --file auftrag.json --watch`

## 6. API (Kurzreferenz)

| Methode & Pfad | Rolle | Zweck |
|---|---|---|
| `GET /api/video/health` | – | Status, aktive Anbieter, Budgets |
| `GET /api/video/models` | App, ChatGPT | Modelle mit Optionen & Preisen |
| `POST /api/video/quote` | App, ChatGPT | Kosten schätzen, nichts speichern |
| `POST /api/video/jobs` | App, ChatGPT | Auftrag anlegen (→ `awaiting_confirmation`) |
| `GET /api/video/jobs[/:id]` | App, ChatGPT | Status, Fortschritt, Video-URL |
| `POST /api/video/jobs/:id/confirm` | **nur App** | Body `{ "expected_cost_usd": <Preis> }` – startet die Generierung |
| `POST /api/video/jobs/:id/reject` · `/cancel` · `DELETE /api/video/jobs/:id` | nur App | Ablehnen, abbrechen, löschen |
| `GET /media/videos/<id>.mp4` | – | Video (Range-fähig, `?download` erzwingt Download) |
| `GET /openapi.json` | – | Schema für ChatGPT |

Auftrag (Beispiel):

```json
{
  "title": "Tokio bei Nacht",
  "concept": "Kinoreifer TikTok-Clip …",
  "aspect_ratio": "9:16",
  "quality": "standard",
  "negative_prompt": "blurry, distorted faces, text, watermark",
  "scenes": [
    { "title": "Opening", "prompt": "Cinematic aerial drone shot over neon-lit Tokyo at night, light rain, slow forward push", "duration": 5 },
    { "title": "Street", "prompt": "A young woman with a transparent umbrella walks through a rainy Shibuya street, tracking shot", "duration": 5 }
  ]
}
```

Bild→Video: zusätzlich `image_url` (öffentliche https-URL) oder `image_base64` (`data:image/jpeg;base64,…`); die erste Szene startet mit dem Bild.

## 7. Sicherheit

* Provider-Schlüssel stehen nur in `.env` bzw. Server-Umgebungsvariablen; `.env` und `server/storage/` sind in `.gitignore`.
* Zwei Rollen: `VIDEO_INTAKE_TOKEN` (ChatGPT: einreichen & lesen) und `VIDEO_APP_TOKEN` (alles, inkl. Bestätigen).
  Ohne `VIDEO_APP_TOKEN` hat nur eine **direkte** localhost-Verbindung vollen Zugriff (Anfragen über Tunnel/Proxy nicht).
  Hinweis: `npm run dev` mit `--host` leitet Anfragen aus deinem WLAN als localhost weiter – im fremden Netz `VIDEO_APP_TOKEN` setzen.
* Bestätigung verlangt den exakt angezeigten Preis; `MAX_COST_PER_JOB_USD` und `DAILY_BUDGET_USD` begrenzen zusätzlich.
* Video-Dateien sind über schwer erratbare IDs abrufbar (ohne Token), damit Vorschau und Links aus ChatGPT funktionieren.
