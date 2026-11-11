#!/usr/bin/env python3
"""
Schritt 2: Musik + Soundeffekte + Mischung.

Alles wird prozedural erzeugt (keine Lizenzprobleme, kostenlos):
  - atmosphärische Musik in d-moll (dunkler Anfang, Spannung beim Krieg, Puls beim Countdown,
    hoffnungsvoller Teil ab "Und jetzt kommt ihr ins Spiel")
  - Soundeffekte (Whoosh, Boom, Alarm, HUD-Blips, Scan, Spawn, Bau, Ticken …) an den Zeitpunkten aus timeline.json
  - Sprecher wird darübergelegt, Musik automatisch unter der Stimme abgesenkt (Ducking)
Ausgabe: build/folge-XX/mix.wav (48 kHz Stereo, -14 LUFS für TikTok)
"""
import json, sys, subprocess
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
rng = np.random.default_rng(7)


def t_arr(d): return np.arange(int(d * SR)) / SR
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x, axis=0)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x, axis=0)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], 'band', fs=SR, output='sos'), x, axis=0)
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)


def env_adsr(n, a, d, s, r):
    e = np.ones(n) * s
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    A = min(A, n); e[:A] = np.linspace(0, 1, A)
    D2 = min(D, max(0, n - A)); e[A:A + D2] = np.linspace(1, s, D2)
    R = min(R, n); e[n - R:] *= np.linspace(1, 0, R)
    return e


def stereo(x, pan=0.0):
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l * 1.414, x * r * 1.414], axis=1)


def add(buf, sig, t0, gain=1.0):
    i = int(t0 * SR)
    if i >= len(buf): return
    if sig.ndim == 1: sig = stereo(sig)
    if i < 0: sig = sig[-i:]; i = 0
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n] * gain


def reverb_ir(dur=2.6, damp=3.2, seed=1):
    r = np.random.default_rng(seed)
    n = int(dur * SR); t = np.arange(n) / SR
    ir = r.standard_normal((n, 2)) * np.exp(-damp * t)[:, None]
    ir = lp(ir, 6000)
    ir[:int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    return ir / np.sqrt((ir ** 2).sum(axis=0))


def reverb(x, wet=0.3, dur=2.6, damp=3.2):
    ir = reverb_ir(dur, damp)
    if x.ndim == 1: x = stereo(x)
    w = np.stack([fftconvolve(x[:, 0], ir[:, 0])[:len(x)], fftconvolve(x[:, 1], ir[:, 1])[:len(x)]], axis=1)
    return x * (1 - wet) + w * wet


# ---------------------------------------------------------------- Instrumente
def saw(f, t, ph=0.0): return 2.0 * np.mod(f * t + ph, 1.0) - 1.0


def pad_chord(notes, dur, bright=1400, vol=0.12):
    t = t_arr(dur); out = np.zeros((len(t), 2))
    for k, n in enumerate(notes):
        f = midi(n)
        for dt, pan in ((-0.09, -0.6), (0.0, 0.0), (0.11, 0.6)):
            ff = f * 2 ** (dt / 12)
            v = saw(ff, t, rng.random()) * 0.6 + np.sin(2 * np.pi * ff * t) * 0.4
            out += stereo(v, pan) / 3
    out = lp(out, bright, 2)
    e = env_adsr(len(t), min(1.2, dur * 0.4), 0.5, 0.85, min(1.4, dur * 0.45))
    lfo = 1 + 0.12 * np.sin(2 * np.pi * 0.23 * t)
    return out * (e * lfo)[:, None] * vol / max(1, len(notes) ** 0.5)


def drone(dur, root=38, vol=0.18):
    t = t_arr(dur); f = midi(root)
    x = np.sin(2 * np.pi * f * t) * 0.7 + np.sin(2 * np.pi * f * 2 * t + 0.3) * 0.25 + saw(f, t) * 0.08
    x = lp(x, 400) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.11 * t))
    return stereo(x * env_adsr(len(t), 2.0, 0.1, 1.0, 2.0) * vol)


def pluck(n, dur=1.6, vol=0.16):
    t = t_arr(dur); f = midi(n)
    x = sum(np.sin(2 * np.pi * f * h * t) * a for h, a in ((1, 1), (2, 0.45), (3, 0.2), (4, 0.1)))
    x *= np.exp(-t * 4.5) * np.minimum(1, t / 0.004)
    return x * vol


def piano(n, dur=3.0, vol=0.14):
    t = t_arr(dur); f = midi(n)
    x = sum(np.sin(2 * np.pi * f * h * t * (1 + 0.0004 * h)) * a * np.exp(-t * (1.2 + h * 0.6)) for h, a in ((1, 1), (2, 0.5), (3, 0.25), (5, 0.08)))
    return x * np.minimum(1, t / 0.003) * vol


def kick(vol=0.5):
    t = t_arr(0.5); f = 45 + 80 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7) * vol


# ---------------------------------------------------------------- Soundeffekte
def noise(d): return rng.standard_normal(int(d * SR))


def sfx_whoosh(dur=0.7, up=True, vol=0.35):
    n = noise(dur); t = t_arr(dur)
    out = np.zeros_like(n); seg = 512
    for i in range(0, len(n), seg):
        k = i / len(n); fc = (300 + 4000 * (k if up else 1 - k))
        out[i:i + seg] = n[i:i + seg]
    out = bp(out, 200, 5000)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    # Pitch-Sweep durch zwei Filterbänder überblenden
    lo, hi = lp(out, 900), hp(out, 1800)
    k = np.clip(t / dur, 0, 1); mixk = k if up else 1 - k
    x = (lo * (1 - mixk) + hi * mixk) * env
    l = x * (1 - 0.6 * k); r = x * (0.4 + 0.6 * k)
    return np.stack([l, r], 1) * vol


def sfx_boom(vol=0.8, dur=3.5):
    t = t_arr(dur); f = 30 + 55 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    n = lp(noise(dur), 300) * np.exp(-t * 5) * 0.6
    x = (s + n) * np.minimum(1, t / 0.005)
    return reverb(x * vol, 0.35, 3.0, 2.0)


def sfx_impact(vol=0.9):
    t = t_arr(2.5)
    x = sfx_boom(vol * 0.9, 2.5)
    crack = hp(noise(2.5), 2000) * np.exp(-t * 22) * 0.5
    sub = np.sin(2 * np.pi * 38 * t) * np.exp(-t * 2.2) * 0.6
    return x + stereo((crack + sub) * vol)


def sfx_riser(dur=1.6, vol=0.28):
    t = t_arr(dur); k = t / dur
    f = 200 + 1400 * k ** 2
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3
    n = bp(noise(dur), 800, 7000) * 0.7
    x = (tone + n) * k ** 2.2
    return reverb(x * vol, 0.3)


def sfx_alarm(dur=2.5, vol=0.12):
    t = t_arr(dur)
    f = np.where(np.mod(t, 0.9) < 0.45, 620, 830)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = (np.sin(ph) + 0.3 * np.sign(np.sin(ph))) * env_adsr(len(t), 0.05, 0.1, 1, 0.6)
    x = lp(bp(x, 300, 3000), 2500)
    return reverb(x * vol, 0.55, 3.5, 1.4)


def sfx_blip(f=1500, dur=0.09, vol=0.18):
    t = t_arr(dur)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 1.5 * t)) * np.exp(-t * 40) * np.minimum(1, t / 0.002) * vol


def sfx_hud_boot(vol=0.9):
    out = np.zeros((int(1.8 * SR), 2))
    for i, f in enumerate([880, 1320, 990, 1760, 1480, 2200, 1100, 1650]):
        add(out, sfx_blip(f, 0.07, 0.12), 0.06 * i + (0.25 if i > 3 else 0))
    t = t_arr(0.6); sw = np.sin(2 * np.pi * np.cumsum(300 + 2500 * t / 0.6) / SR) * np.exp(-t * 3) * 0.08
    add(out, stereo(sw), 0.0)
    add(out, stereo(lp(noise(0.5), 1200) * np.exp(-t_arr(0.5) * 9) * 0.25), 0.0)
    return reverb(out * vol, 0.25, 1.2)


def sfx_scan(vol=0.14):
    out = np.zeros((int(2.6 * SR), 2))
    for k in range(4):
        t = t_arr(0.5); f = 500 + 1600 * (t / 0.5)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.5) ** 2
        add(out, stereo(x, -0.5 + k * 0.33), k * 0.45)
    add(out, stereo(sfx_blip(400, 0.25, 1.0)), 1.45); add(out, stereo(sfx_blip(300, 0.3, 1.0)), 1.62)
    return reverb(out * vol, 0.3, 1.5)


def sfx_spawn(vol=0.3):
    out = np.zeros((int(2.5 * SR), 2))
    for i, n in enumerate([74, 78, 81, 86, 90]):
        add(out, stereo(pluck(n, 1.2, 0.12), -0.4 + i * 0.2), i * 0.055)
    t = t_arr(1.0); sh = bp(noise(1.0), 3000, 9000) * np.sin(np.pi * t) ** 2 * 0.15
    add(out, stereo(sh), 0.0)
    add(out, stereo(np.sin(2 * np.pi * 55 * t_arr(0.4)) * np.exp(-t_arr(0.4) * 9) * 0.5), 0.0)
    return reverb(out * vol, 0.45, 2.4)


def sfx_build(vol=0.22):
    out = np.zeros((int(1.8 * SR), 2))
    for i in range(10):
        add(out, stereo(sfx_blip(600 + (i % 4) * 300, 0.05, 0.25), (-1) ** i * 0.4), i * 0.07)
    t = t_arr(1.2); hum = saw(110, t) * 0.2 * np.sin(np.pi * t / 1.2)
    add(out, stereo(lp(hum, 800)), 0.0)
    return reverb(out * vol, 0.3)


def sfx_kasse(vol=0.3, plus=True):
    """Münzen + Kassenklingel (plus) bzw. absteigender Ton (minus)."""
    out = np.zeros((int(2.0 * SR), 2))
    for k in range(9 if plus else 4):
        t = t_arr(0.25); f = rng.uniform(2800, 5200)
        x = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.47 * t)) * np.exp(-t * 26) * 0.35
        add(out, stereo(x, rng.uniform(-0.6, 0.6)), k * 0.055 + rng.uniform(0, 0.02))
    if plus:
        t = t_arr(1.2); bell = sum(np.sin(2 * np.pi * f * t) * a for f, a in ((1568, 1), (2093, 0.6), (3136, 0.25))) * np.exp(-t * 3.5)
        add(out, stereo(bell * 0.5), 0.45)
    else:
        t = t_arr(0.6); f = 700 - 400 * t / 0.6
        add(out, stereo(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4) * 0.4), 0.25)
    return reverb(out * vol, 0.3, 1.4)


def sfx_flicker(vol=0.06):
    t = t_arr(1.6); buzz = np.sign(np.sin(2 * np.pi * 100 * t)) * 0.5 + np.sin(2 * np.pi * 200 * t) * 0.3
    gate = (np.sin(t * 37) * np.sin(t * 13.7 + 2) > 0.2).astype(float)
    return lp(buzz * gate, 1500) * vol


def sfx_ticks(dur, vol=0.18):
    out = np.zeros(int((dur + 0.2) * SR))
    for k in range(int(dur)):
        c = hp(noise(0.03), 3000) * np.exp(-t_arr(0.03) * 160) * (1.0 if k % 2 == 0 else 0.7)
        i = int(k * SR); out[i:i + len(c)] += c
    return reverb(out * vol, 0.2, 0.8)


def wind(dur, vol=0.07):
    t = t_arr(dur)
    n = lp(noise(dur), 700)
    mod = 0.6 + 0.4 * np.sin(2 * np.pi * 0.09 * t) * np.sin(2 * np.pi * 0.031 * t + 1)
    l = n * mod; r = np.roll(n, 2400) * (1.2 - mod)
    return np.stack([l, r], 1) * vol


# ---------------------------------------------------------------- Musik
def music(T, sz):
    st = {s['id']: (s['start'], s['ende']) for s in sz}
    out = np.zeros((int((T + 4) * SR), 2))
    bar = 60 / 84 * 4
    # Abschnittsgrenzen
    t_war = next((e['t'] for s in sz for e in s.get('toene', []) if e['typ'] == 'impact'), st[sz[2]['id']][0] + 3)
    t_cd = sz[3]['start']; t_hope = sz[4]['start']; t_end = sz[-1]['start']
    dark = [[50, 53, 57, 62], [46, 50, 53, 58], [43, 46, 50, 55], [45, 49, 52, 57]]   # Dm Bb Gm A
    hope = [[50, 53, 57, 62], [46, 50, 53, 62], [41, 45, 48, 57], [48, 52, 55, 60]]   # Dm Bb F C
    # Drone durchgehend
    add(out, drone(T + 2, 38, 0.16), 0)
    # Pads
    t = 0.0; i = 0
    while t < T + 1:
        prog = hope if t >= t_hope else dark
        ch = prog[i % 4]; d = bar * 1.02
        vol = 0.09 if t < t_war else 0.12
        bright = 900 if t < t_hope else 1900
        add(out, pad_chord(ch, d + 1.2, bright, vol), t)
        if t >= t_end: add(out, pad_chord([c + 12 for c in ch[1:]], d + 1.2, 2600, 0.05), t)
        t += bar; i += 1
    # Klavier-Tropfen im dunklen Teil
    notes = [74, 72, 69, 74, 77, 76, 72, 69]
    k = 0; tt = 0.6
    while tt < t_war - 0.5:
        add(out, stereo(piano(notes[k % len(notes)], 3.0, 0.07), (-0.3, 0.3)[k % 2]), tt); tt += bar / 2; k += 1
    # Puls ab Countdown
    beat = 60 / 84; tt = t_cd
    while tt < T - 1.5:
        add(out, stereo(kick(0.32 if tt < t_hope else 0.4)), tt)
        if tt >= t_hope: add(out, stereo(hp(noise(0.05), 6000) * np.exp(-t_arr(0.05) * 90) * 0.05, 0.3), tt + beat / 2)
        tt += beat
    # Arpeggio ab "ihr kommt ins Spiel"
    tt = t_hope; i = 0; arp = [62, 65, 69, 74, 69, 65]
    while tt < T - 1.0:
        ci = int((tt - 0) / bar) % 4; base = hope[ci]
        n = [base[1] + 12, base[2] + 12, base[3] + 12, base[2] + 24, base[3] + 12, base[2] + 12][i % 6]
        add(out, stereo(pluck(n, 0.9, 0.07), 0.5 * np.sin(i * 0.7)), tt)
        tt += beat / 2; i += 1
    out = reverb(out, 0.32, 3.2, 1.8)
    # Spannungsfläche beim Krieg
    add(out, stereo(lp(saw(midi(39), t_arr(3.0)) * env_adsr(int(3.0 * SR), 0.05, 0.3, 0.6, 1.5), 900) * 0.08), t_war)
    # Ausklang
    n = len(out); fe = int((T - 0.2) * SR); out[fe:] *= np.linspace(1, 0, n - fe)[:, None] if n > fe else 1
    return out[:int((T + 0.5) * SR)]


def main():
    nr = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    out_dir = ROOT / 'build' / f'folge-{nr:02d}'
    tl = json.loads((out_dir / 'timeline.json').read_text())
    T = tl['dauer']; sz = tl['szenen']
    N = int((T + 0.5) * SR)

    mus = music(T, sz)[:N]
    if len(mus) < N: mus = np.pad(mus, ((0, N - len(mus)), (0, 0)))
    sfx = np.zeros((N, 2))
    add(sfx, wind(T + 0.5, 0.05), 0)
    for s in sz:
        for e in s.get('toene', []):
            ty, t0 = e['typ'], e['t']
            if ty == 'boom': add(sfx, sfx_boom(0.55), t0)
            elif ty == 'impact': add(sfx, sfx_impact(0.75), t0)
            elif ty in ('whoosh', 'whoosh_up'): add(sfx, sfx_whoosh(0.75, True, 0.32), t0 - 0.35)
            elif ty == 'whoosh_down': add(sfx, sfx_whoosh(0.8, False, 0.32), t0 - 0.2)
            elif ty == 'wind_swell': add(sfx, stereo(lp(noise(4), 900) * env_adsr(int(4 * SR), 1.5, 0.5, 0.8, 2.0) * 0.12), t0)
            elif ty == 'riser': add(sfx, sfx_riser(e.get('dauer', 1.5), 0.22), t0)
            elif ty == 'alarm': add(sfx, sfx_alarm(e.get('dauer', 2.5), 0.1), t0)
            elif ty == 'blip': add(sfx, stereo(sfx_blip(1700, 0.1, 0.16)), t0)
            elif ty == 'hud_boot': add(sfx, sfx_hud_boot(0.9), t0)
            elif ty == 'scan': add(sfx, sfx_scan(0.13), t0)
            elif ty == 'spawn': add(sfx, sfx_spawn(0.32), t0)
            elif ty == 'shimmer': add(sfx, sfx_spawn(0.18), t0)
            elif ty == 'build': add(sfx, sfx_build(0.2), t0)
            elif ty == 'kasse': add(sfx, sfx_kasse(0.35, True), t0)
            elif ty == 'kasse_minus': add(sfx, sfx_kasse(0.3, False), t0)
            elif ty == 'neon_flicker': add(sfx, stereo(sfx_flicker(0.05), -0.3), t0)
            elif ty == 'tick_folge': add(sfx, sfx_ticks(e.get('dauer', 4), 0.16), t0)
            elif ty == 'final_hit':
                add(sfx, sfx_impact(0.6), t0)
                add(sfx, reverb(pad_chord([50, 57, 62, 65, 69], 2.5, 3000, 0.25), 0.5), t0)
            else: print('  unbekannter Ton:', ty)

    # Stimme laden
    sr, v = wavfile.read(out_dir / 'stimme.wav')
    v = v.astype(np.float32) / 32768.0
    if v.ndim > 1: v = v.mean(axis=1)
    v = np.pad(v, (0, max(0, N - len(v))))[:N]
    # Ducking: Hüllkurve der Stimme
    envv = np.abs(v); win = int(0.12 * SR)
    envv = np.convolve(envv, np.ones(win) / win, mode='same')
    envv = np.convolve((envv > 0.01).astype(float), np.ones(int(0.35 * SR)) / int(0.35 * SR), mode='same')
    duck = 1 - 0.55 * np.clip(envv, 0, 1)
    mus *= duck[:, None]
    sfx_duck = 1 - 0.25 * np.clip(envv, 0, 1)
    sfx *= sfx_duck[:, None]

    # Pegel: Stimme (aktive Teile) auf -16 dBFS RMS, Musik -29 dBFS, Effekte Spitzen -7 dBFS
    def db(x): return 10 ** (x / 20)
    act = np.abs(v) > 0.003
    v *= db(-16) / (np.sqrt(np.mean(v[act] ** 2)) + 1e-9)
    mus *= db(-29) / (np.sqrt(np.mean(mus ** 2)) + 1e-9)
    sfx *= db(-7) / (np.abs(sfx).max() + 1e-9)
    mix = mus + sfx + stereo(v)
    # Anfangs-/End-Fade
    fi = int(0.25 * SR); mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    peak = np.abs(mix).max(); mix = mix / max(peak, 1e-6) * 0.95
    raw = out_dir / 'mix_roh.wav'
    wavfile.write(raw, SR, (mix * 32767).astype(np.int16))
    # Lautheit für TikTok normalisieren
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(raw), '-af',
                    'alimiter=limit=0.89:attack=3:release=60,loudnorm=I=-14:TP=-1.5:LRA=9', '-ar', str(SR), str(out_dir / 'mix.wav')], check=True)
    # Separate Stems (praktisch zum Nachbearbeiten)
    wavfile.write(out_dir / 'musik_sfx.wav', SR, (np.clip(mus + sfx, -1, 1) * 32767).astype(np.int16))
    print(f'Audio fertig: {out_dir / "mix.wav"} ({T:.2f} s)')


if __name__ == '__main__':
    main()
