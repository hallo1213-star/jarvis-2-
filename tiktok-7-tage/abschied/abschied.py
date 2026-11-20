#!/usr/bin/env python3
"""Abschiedsvideo „Die letzte Folge von Valenheim“ – Erinnerungen aus der Serie + Stadt in Zeitlupe + Hymne."""
import json, subprocess
from pathlib import Path
import numpy as np
from scipy.io import wavfile

HIER = Path(__file__).resolve().parent; B = HIER / 'build'; T7 = HIER.parent; AUS = T7 / 'ausgabe'
BILDER = T7 / 'spielvideo' / 'build' / 'bilder'; SCHRIFT = T7 / 'spielvideo' / 'schrift'
L = json.load(open(B / 'laengen.json')); TEXT = {s['id']: s['text'] for s in json.load(open(HIER / 'text.json'))}
W, H, FPS, XF = 1080, 1920, 24, 0.5  # XF = Überblendung zwischen Abschnitten
def ff(*a): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *map(str, a)], check=True)

# ---------- Erinnerung: Ausschnitt einer alten Folge im weißen Rahmen über verschwommenem Hintergrund ----------
def erinnerung(datei, start, dauer, aus, drehung=0.0):
    fc = (f"[0:v]trim=start={start}:duration={dauer},setpts=PTS-STARTPTS,fps={FPS},split[a][b];"
          f"[a]scale={W}:{H},boxblur=28:2,eq=brightness=-0.28:saturation=0.6[bg];"
          f"[b]scale=780:-2,eq=saturation=0.72:contrast=1.04,colorbalance=rs=0.06:bs=-0.05,pad=iw+28:ih+28:14:14:white,"
          f"format=rgba,rotate={drehung}:ow=rotw({drehung}):oh=roth({drehung}):c=none[fg];"
          f"[bg][fg]overlay=(W-w)/2:(H-h)/2-40,format=yuv420p")
    ff('-i', AUS / datei, '-filter_complex', fc, '-t', dauer, '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', aus)

# ---------- Stadt aus Bildfolge in Zeitlupe ----------
def zeitlupe(ordner, dauer, aus, rueckwaerts=False):
    bilder = sorted((BILDER / ordner).glob('*.jpg'), reverse=rueckwaerts); fps_q = len(bilder) / dauer
    lst = B / f'{aus.stem}.txt'; lst.write_text(''.join(f"file '{p}'\nduration {1 / fps_q}\n" for p in bilder))
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-vf', f"fps={FPS},scale={W}:{H}:flags=lanczos,eq=saturation=0.85:brightness=-0.03,vignette=PI/5,format=yuv420p",
       '-t', dauer, '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', aus)

# ---------- Flagge + Wappen: langsamer Zoom, dann Schwarz ----------
def flagge(dauer, aus):
    ff('-loop', '1', '-i', AUS / 'republik-flagge-wappen.png', '-filter_complex',
       f"color=c=0x05080f:s={W}x{H}:d={dauer}[bg];[0:v]scale=1060:-2,zoompan=z='1+0.0012*on':d={int(dauer * FPS)}:s=1060x498:fps={FPS}[f];"
       f"[bg][f]overlay=(W-w)/2:(H-h)/2-260,fade=t=out:st={dauer - 1.6}:d=1.4,format=yuv420p",
       '-t', dauer, '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', aus)

# ---------- Abschnitte ----------
D = {'start': L['start'] + 1.9, 'rueck': 12.6, 'schluss': L['schluss'] + 1.6, 'danke': L['danke'] + 1.4, 'ende': L['ende'] + 4.2}
teile = []
erinnerung('folge-01.mp4', 24.9, D['start'] + XF, B / 'a_start.mp4'); teile.append(('start', B / 'a_start.mp4'))
momente = [('folge-01.mp4', 38.6, -1.5), ('folge-03.mp4', 6.8, 1.5), ('folge-03.mp4', 28.0, -1.0), ('folge-05.mp4', 31.4, 1.2), ('folge-07.mp4', 53.4, -1.2), ('folge-07.mp4', 83.0, 1.0)]
d1 = D['rueck'] / len(momente)
for i, (f, s, r) in enumerate(momente):
    erinnerung(f, s, d1 + (XF if i == len(momente) - 1 else 0), B / f'r{i}.mp4', drehung=r * np.pi / 180)
liste = B / 'rueck.txt'; liste.write_text(''.join(f"file '{B / f'r{i}.mp4'}'\n" for i in range(len(momente))))
ff('-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', B / 'a_rueck.mp4'); teile.append(('rueck', B / 'a_rueck.mp4'))
zeitlupe('ende', D['schluss'] + XF, B / 'a_schluss.mp4'); teile.append(('schluss', B / 'a_schluss.mp4'))
zeitlupe('nacht', D['danke'] + XF, B / 'a_danke.mp4'); teile.append(('danke', B / 'a_danke.mp4'))
flagge(D['ende'], B / 'a_ende.mp4'); teile.append(('ende', B / 'a_ende.mp4'))

# Zusammensetzen mit weichen Überblendungen
START = {}; t = 0.0; ins = []; fc = ''.join(f'[{i}:v]settb=AVTB,fps={FPS},scale={W}:{H},setsar=1,format=yuv420p[n{i}];' for i in range(5)); prev = 'n0'
for i, (k, p) in enumerate(teile):
    ins += ['-i', p]; START[k] = t
    if i > 0:
        off = t - XF * 0 if False else t
        fc += f"[{prev}][n{i}]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}];"; prev = f'x{i}'
    t += D[k]
T = t; print('Länge', round(T, 2), START)

# ---------- Ton: Hymne leise darunter, Stimme darüber ----------
SR = 48000
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', AUS / 'nationalhymne-valenheim.m4a', '-ac', '2', '-ar', str(SR), B / 'hymne.wav'], check=True)
_, hy = wavfile.read(B / 'hymne.wav'); hy = hy.astype(np.float64) / 32768.0
n = int((T + 0.5) * SR); musik = np.zeros((n, 2)); m = min(n, len(hy)); musik[:m] = hy[:m]
stimme = np.zeros((n, 2))
for k in TEXT:
    sr, w = wavfile.read(B / f'{k}.wav'); w = w.astype(np.float64) / 32768.0
    if sr != SR: w = np.interp(np.arange(int(len(w) * SR / sr)) / SR, np.arange(len(w)) / sr, w)
    a = int((START[k] + 0.55) * SR); stimme[a:a + len(w)] += w[:n - a, None] * 1.0
env = np.convolve(np.abs(stimme[:, 0]), np.ones(int(0.3 * SR)) / int(0.3 * SR), mode='same')
duck = 1 - 0.6 * np.clip(env * 10, 0, 1)
fade_in = np.minimum(1, np.arange(n) / (1.5 * SR)); fade_out = np.clip((T - np.arange(n) / SR) / 2.5, 0, 1)
ton = musik * 0.42 * (duck * fade_in * fade_out)[:, None] + stimme
ton *= 0.89 / np.max(np.abs(ton)); wavfile.write(B / 'ton.wav', SR, (ton * 32767).astype(np.int16))

# ---------- Untertitel ----------
def ts(x): return f'{int(x // 3600)}:{int(x % 3600 // 60):02d}:{x % 60:05.2f}'
ass = ['[Script Info]', 'ScriptType: v4.00+', f'PlayResX: {W}', f'PlayResY: {H}', '', '[V4+ Styles]',
       'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
       'Style: Text,Montserrat ExtraBold,66,&H00FFFFFF,&H00FFFFFF,&H00101010,&H78000000,1,0,0,0,100,100,0,0,1,6,3,2,90,90,150,1',
       'Style: Gross,Montserrat ExtraBold,170,&H0037AFD4,&H0037AFD4,&H00101010,&H64000000,1,0,0,0,100,100,6,0,1,8,4,5,40,40,0,1',
       'Style: Klein,Montserrat ExtraBold,52,&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,1,0,0,0,100,100,3,0,1,5,2,5,60,60,0,1',
       '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
for k, text in TEXT.items():
    w = text.split(); t0 = START[k] + 0.55; d = L[k]; pos = 0
    for g in [w[i:i + 3] for i in range(0, len(w), 3)]:
        a = t0 + d * pos / len(w); pos += len(g); e = t0 + d * pos / len(w)
        ass.append(f'Dialogue: 0,{ts(a)},{ts(e + 0.05)},Text,,0,0,0,,{{\\fad(80,0)}}{" ".join(g).upper()}')
ass.append(f'Dialogue: 1,{ts(0.3)},{ts(START["rueck"] - 0.2)},Klein,,0,0,0,,{{\\fad(400,300)\\pos(540,118)}}DIE LETZTE FOLGE')
tD = START['ende'] + L['ende'] + 0.9
ass.append(f'Dialogue: 1,{ts(tD)},{ts(T - 0.3)},Gross,,0,0,0,,{{\\fad(500,700)\\pos(540,1180)}}DANKE')
ass.append(f'Dialogue: 1,{ts(tD + 0.5)},{ts(T - 0.3)},Klein,,0,0,0,,{{\\fad(500,700)\\pos(540,1340)}}VALENHEIM · 1–7')
(B / 'untertitel.ass').write_text('\n'.join(ass), encoding='utf-8')

aus = AUS / 'abschied-valenheim.mp4'
ff(*ins, '-i', B / 'ton.wav', '-filter_complex', fc + f"[{prev}]fade=t=in:st=0:d=0.8,ass={B / 'untertitel.ass'}:fontsdir={SCHRIFT}[v]",
   '-map', '[v]', '-map', f'{len(teile)}:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '9M', '-bufsize', '18M',
   '-pix_fmt', 'yuv420p', '-r', FPS, '-c:a', 'aac', '-b:a', '192k', '-t', f'{T:.2f}', '-movflags', '+faststart', aus)
print('Fertig:', aus)
