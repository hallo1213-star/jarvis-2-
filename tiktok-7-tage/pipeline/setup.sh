#!/usr/bin/env bash
# Einmalige Einrichtung: Node-Pakete, Python-Pakete und die deutsche Piper-Stimme (kostenlos, offline).
set -euo pipefail
cd "$(dirname "$0")/.."
npm install --no-audit --no-fund
pip install --quiet piper-tts numpy scipy
mkdir -p build/stimmen
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high"
for f in de_DE-thorsten-high.onnx de_DE-thorsten-high.onnx.json; do
  [ -s "build/stimmen/$f" ] || curl -fL -o "build/stimmen/$f" "$BASE/$f"
done
# Playwright + Chromium werden für das Rendern benötigt (falls nicht vorhanden):
node -e "require('playwright')" 2>/dev/null || { npm install --no-save playwright && npx playwright install chromium; }
echo "Setup fertig."
