#!/usr/bin/env python3
"""Spielvideo VALENHEIM 2.0: Bilder der Einstellungen + Sprecher + eigene Musik + Untertitel -> 1080x1920 MP4."""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from scipy.io import wavfile
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'pipeline'))
import audio as A  # Klangbausteine aus der Serie (prozedural, lizenzfrei)

HIER = Path(__file__).resolve().parent; BUILD = HIER / 'build'; SR = A.SR; FPS = 24
L = json.load(open(BUILD / 'laengen.json')); TEXT = {s['id']: s['text'] for s in json.load(open(HIER / 'text.json'))}
DAUER = {'intro': L['intro'] + 0.9, 'strasse': L['strasse'] + 0.8, 'leute': L['leute'] + 0.8, 'autohaus': L['autohaus'] + 0.9, 'fahren': 3.6, 'leben': L['leben'] + 0.8, 'nacht': L['nacht'] + 1.0, 'ende': L['ende'] + 1.4}
FOLGE = ['intro', 'strasse', 'leute', 'autohaus', 'fahren', 'leben', 'nacht', 'ende']
# tatsächliche Bildanzahl je Einstellung
N = {k: len(list((BUILD / 'bilder' / k).glob('*.jpg'))) for k in FOLGE}
START = {}; t = 0.0
for k in FOLGE: START[k] = t; t += N[k] / FPS
T = t; print('Länge', round(T, 2), 's', N)

# ---------- Musik: 104 BPM, a-Moll – F – C – G, Drop bei „Fahren“ ----------
mix = np.zeros((int((T + 1.5) * SR), 2)); bpm = 104; beat = 60 / bpm
CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; BASS = [45, 41, 36, 43]
takt = 4 * beat; drop = START['fahren']
for i in range(int(T / takt) + 1):
    t0 = i * takt; c = i % 4
    A.add(mix, A.pad_chord(CH[c], takt + 0.3, bright=1600 if t0 >= drop else 1100, vol=0.075), t0)
    for b in range(4):
        tb = t0 + b * beat
        if tb > T: break
        if tb >= START['strasse'] - 0.01: A.add(mix, A.stereo(A.kick(0.42 if tb >= drop else 0.3)), tb)
        A.add(mix, A.stereo(A.pluck(BASS[c] + (12 if b % 2 else 0), 0.5, vol=0.16)), tb)
        if tb >= START['strasse']:
            h = A.hp(A.noise(0.05), 7000) * np.exp(-np.arange(int(0.05 * SR)) / SR * 70) * 0.06
            A.add(mix, A.stereo(h), tb + beat / 2)
    if t0 >= drop and t0 < START['ende']:
        for k2, n in enumerate([CH[c][2] + 12, CH[c][1] + 12, CH[c][0] + 24, CH[c][1] + 12]): A.add(mix, A.stereo(A.pluck(n, 0.6, vol=0.07), 0.3 * (k2 % 2 * 2 - 1)), t0 + k2 * beat)
A.add(mix, A.sfx_whoosh(0.8, True, 0.3), 0.0)
A.add(mix, A.sfx_riser(1.4, 0.22), drop - 1.4); A.add(mix, A.sfx_impact(0.5), drop)
for k in FOLGE[1:]: A.add(mix, A.sfx_whoosh(0.5, True, 0.12), START[k] - 0.25)
A.add(mix, A.sfx_boom(0.45, 3.0), START['ende'] + 0.2)
# Ausblenden am Ende
n_end = int((T + 1.5) * SR); fade = np.linspace(1, 0, int(1.4 * SR)); mix[n_end - len(fade):n_end] *= fade[:, None]

# ---------- Sprecher + Ducking ----------
stimme = np.zeros_like(mix)
for k in FOLGE:
    sr, w = wavfile.read(BUILD / f'{k}.wav'); w = w.astype(np.float64) / 32768.0
    if sr != SR: w = np.interp(np.arange(int(len(w) * SR / sr)) / SR, np.arange(len(w)) / sr, w)
    A.add(stimme, A.stereo(w * 1.0), START[k] + 0.35)
env = np.abs(stimme[:, 0]); k = int(0.25 * SR); env = np.convolve(env, np.ones(k) / k, mode='same'); duck = 1 - 0.55 * np.clip(env * 12, 0, 1)
gesamt = mix * duck[:, None] + stimme
gesamt *= 0.89 / max(1e-6, np.max(np.abs(gesamt)))
wavfile.write(BUILD / 'ton.wav', SR, (gesamt * 32767).astype(np.int16))

# ---------- Untertitel (ASS, TikTok-Stil, Wort-Gruppen) ----------
def ts(x): h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60; return f'{h}:{m:02d}:{s:05.2f}'
ass = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1080', 'PlayResY: 1920', '', '[V4+ Styles]',
       'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
       'Style: Text,Montserrat ExtraBold,74,&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,1,0,0,0,100,100,0,0,1,7,3,2,80,80,520,1',
       'Style: Titel,Montserrat ExtraBold,150,&H0037AFD4,&H0037AFD4,&H00101010,&H64000000,1,0,0,0,100,100,4,0,1,9,4,5,40,40,0,1',
       'Style: Unter,Montserrat ExtraBold,64,&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,1,0,0,0,100,100,2,0,1,6,3,5,60,60,0,1',
       '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
for k in FOLGE:
    woerter = TEXT[k].split(); dauer = L[k]; t0 = START[k] + 0.35; n = len(woerter)
    gruppen = [woerter[i:i + 3] for i in range(0, n, 3)]; pos = 0
    for g in gruppen:
        a = t0 + dauer * pos / n; pos += len(g); e = t0 + dauer * pos / n
        ass.append(f'Dialogue: 0,{ts(a)},{ts(e + 0.05)},Text,,0,0,0,,{{\\fad(60,0)}}{" ".join(g).upper()}')
ass.append(f'Dialogue: 1,{ts(0.15)},{ts(START["strasse"] - 0.1)},Titel,,0,0,0,,{{\\fad(250,200)\\pos(540,560)}}VALENHEIM 2.0')
ass.append(f'Dialogue: 1,{ts(START["ende"] + 0.4)},{ts(T)},Titel,,0,0,0,,{{\\fad(300,0)\\pos(540,700)}}VALENHEIM 2.0')
ass.append(f'Dialogue: 1,{ts(START["ende"] + 1.0)},{ts(T)},Unter,,0,0,0,,{{\\fad(300,0)\\pos(540,860)}}BALD ONLINE · FOLG MIR!')
(BUILD / 'untertitel.ass').write_text('\n'.join(ass), encoding='utf-8')

# ---------- Video ----------
liste = BUILD / 'bilder.txt'
with open(liste, 'w') as f:
    for k in FOLGE:
        for p in sorted((BUILD / 'bilder' / k).glob('*.jpg')): f.write(f"file '{p}'\nduration {1 / FPS}\n")
aus = HIER.parent / 'ausgabe' / 'valenheim-2-0.mp4'
cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(liste), '-i', str(BUILD / 'ton.wav'),
       '-vf', f"fps={FPS},scale=1080:1920:flags=lanczos,eq=contrast=1.06:saturation=1.12,unsharp=5:5:0.5,ass={BUILD / 'untertitel.ass'}:fontsdir={HIER / 'schrift'}",
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(aus)]
subprocess.run(cmd, check=True); print('Fertig:', aus)
