---
description: Erstellt aus einer kurzen Idee ein Videokonzept + Prompts und reicht den Auftrag beim AURIX-Video-Server ein
argument-hint: <worüber soll das Video sein?>
---

Erstelle ein KI-Video über: $ARGUMENTS

1. Entwickle ein kurzes Videokonzept (Ziel, Stimmung, Stil, Format). Standard: 9:16 (TikTok), außer der Nutzer nennt 16:9/YouTube.
2. Teile es in 2–4 Szenen à 5–10 s. Schreibe für jede Szene einen detaillierten englischen Generierungs-Prompt
   (Motiv, Handlung, Umgebung, Licht, Kamerabewegung, Objektiv, Stil – realistisch, filmisch, keine Texte/Logos im Bild).
3. Speichere den Auftrag als JSON in einer temporären Datei mit den Feldern
   `title`, `concept`, `aspect_ratio`, `quality` (Standard `standard`), `negative_prompt`, `scenes: [{title, prompt, duration}]`.
4. Reiche ihn ein: `npm run video -- --file <datei> --watch`
   (Läuft der Server nicht, zuerst `npm run server` im Hintergrund starten.)
5. Kostenpflichtige Aufträge bestätigt der Nutzer selbst im Video Studio der App – niemals selbst bestätigen.
   Gib dem Nutzer den Link aus der Ausgabe und die geschätzten Kosten.
