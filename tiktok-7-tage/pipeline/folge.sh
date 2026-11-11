#!/usr/bin/env bash
# Komplette Produktion einer Folge:  bash pipeline/folge.sh <nummer> [--worker 3]
#   1) Stimme + Zeitachse   2) Musik/SFX/Mix   3) 3D-Frames rendern   4) MP4 mit Ton zusammenführen
set -euo pipefail
cd "$(dirname "$0")/.."
NR="${1:?Folgennummer angeben, z. B. 1}"; shift || true
PAD=$(printf "%02d" "$NR")
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
echo "== Folge $PAD: Stimme & Timeline";  python3 pipeline/stimme.py "$NR"
echo "== Folge $PAD: Musik & Mix";        python3 pipeline/audio.py "$NR"
echo "== Folge $PAD: Rendern";            node pipeline/render.js "$NR" "$@"
echo "== Folge $PAD: Zusammenführen"
mkdir -p ausgabe
ffmpeg -y -loglevel error -i "build/folge-$PAD/video_stumm.mp4" -i "build/folge-$PAD/mix.wav" \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart \
  -metadata title="Die letzten 7 Tage – Folge $NR" "ausgabe/folge-$PAD.mp4"
cp "build/folge-$PAD/untertitel.srt" "ausgabe/folge-$PAD.srt"
echo "Fertig: ausgabe/folge-$PAD.mp4"
echo "Nach dem Hochladen: 'node pipeline/folge-abschliessen.js $NR' schreibt den Serienstand fort."
