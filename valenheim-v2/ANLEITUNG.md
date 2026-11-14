# Valenheim 2.0 online bringen und das Video posten

## 1. Spiel online stellen (Render, kostenlos, ca. 5 Minuten, am Laptop)
1. https://dashboard.render.com öffnen → oben **New** → **Web Service**.
2. Repository **jarvis-2-** auswählen → **Connect**.
3. Ausfüllen:
   - Name: `valenheim-v2`
   - Region: Frankfurt
   - Branch: `claude/tiktok-7-days-city-series-ru97i7`
   - Root Directory: `valenheim-v2`
   - Runtime: Node
   - Build Command: `npm run install:all && npm run build`
   - Start Command: `npm start`
   - Instance Type: **Free** (nicht 7 $!)
4. **Environment Variables** → zwei Einträge:
   - `NODE_VERSION` = `22.12.0`
   - `DATABASE_URL` = derselbe Supabase-Link wie beim alten Dienst „valenheim“
     (Render → Dienst „valenheim“ → Environment → Wert von DATABASE_URL kopieren). Nicht in den Chat schreiben.
5. **Create Web Service** → warten bis „Live“ (beim ersten Mal 5–10 Minuten).
6. Oben steht deine Adresse, z. B. `https://valenheim-v2.onrender.com`. Auf dem Handy öffnen → Konto erstellen → Charakter → Spielen.

Hinweis: Der kostenlose Render-Dienst schläft nach 15 Minuten ohne Besucher. Der erste Aufruf danach dauert bis zu 1 Minute.

## 2. Kurz selbst testen (10 Minuten)
- Leistungstest im Menü machen (stellt die Grafik passend fürs Handy ein).
- Spielen → zu Janniks Autohaus (goldene Lichtsäule) → Auto kaufen → mit E/Knopf einsteigen.
- Ruckelt es? Pause-Menü → Grafik „Niedrig“.
- Mit einem Freund: Server auswählen → Privaten Server erstellen → Code schicken.

## 3. Video posten
- Datei: `tiktok-7-tage/ausgabe/valenheim-2-0.mp4` (im Chat geschickt).
- Erst posten, wenn Schritt 1 „Live“ ist – dann kann jeder sofort spielen.
- Link in die TikTok-Bio: Profil bearbeiten → Website → deine Render-Adresse (Website-Link gibt es bei TikTok ab 1.000 Followern; vorher: Link in einen angepinnten Kommentar oder in die Story).
