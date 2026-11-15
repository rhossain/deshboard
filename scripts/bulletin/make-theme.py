"""Writes the bulletin's theme music as stems in assets/bulletin/audio (needs numpy and ffmpeg).

The theme is fixed, so the stems are committed and this only runs again when the music changes:
    python3 scripts/bulletin/make-theme.py

Stems, all at the level they are mixed at (scripts/render-bulletin.mjs adds no gain):
  intro.flac    0 to 8.4 s: opener and headline list, ending on a riser into the first story
  blip1-6.flac  the rising note as each headline row appears
  bed.flac      16.8 s loop that plays quietly under the voice
  hit.flac      story change: a short whoosh, then a soft hit 0.5 s in
  closer.flac   the ending, 3.6 s and a tail
"""
import os, subprocess, wave
import numpy as np

sr = 44100
B = 0.525  # one beat: the opener and headline list are 16 beats
rng = np.random.default_rng(7)
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "bulletin", "audio")

def f(n): return 440 * 2 ** ((n - 69) / 12)
def buf(sec): return np.zeros(int(sr * sec))
def add(b, t, x, g=1.0):
    i = int(t * sr)
    if 0 <= i < len(b):
        x = x[: len(b) - i]; b[i:i + len(x)] += x * g
def env(n, a, r):
    e = np.ones(n); na = min(n, int(a * sr)); nr = min(n, int(r * sr))
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e
def pluck(note, dur=0.6, bright=6):
    t = np.arange(int(dur * sr)) / sr; x = np.zeros_like(t); fr = f(note)
    for k in range(1, bright + 1): x += np.sin(2 * np.pi * fr * k * t) / k * np.exp(-t * (4 + 2.2 * k))
    return x * env(len(t), 0.004, 0.05)
def pad(notes, dur):
    t = np.arange(int(dur * sr)) / sr; x = np.zeros_like(t)
    for n in notes:
        for d in (-0.06, 0, 0.07):
            fr = f(n + d); x += np.sin(2*np.pi*fr*t) + 0.3*np.sin(2*np.pi*2*fr*t) + 0.12*np.sin(2*np.pi*3*fr*t)
    return x / len(notes) / 3 * env(len(t), min(0.5, dur / 3), min(0.7, dur / 3))
def bass(note, dur=0.45):
    t = np.arange(int(dur * sr)) / sr; fr = f(note)
    return (np.sin(2*np.pi*fr*t) + 0.4*np.sin(2*np.pi*2*fr*t)) * np.exp(-t * 5) * env(len(t), 0.005, 0.05)
def kick():
    t = np.arange(int(0.3 * sr)) / sr; fr = 45 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(fr) / sr) * np.exp(-t * 11)
def hat():
    n = int(0.05 * sr); x = np.diff(rng.standard_normal(n + 1)); return x * np.exp(-np.arange(n) / sr * 90) * 0.25
def whoosh(dur=0.7):
    n = int(dur * sr); x = rng.standard_normal(n)
    x = np.convolve(x, np.ones(60) / 60, mode="same"); x = np.diff(np.concatenate([[0], x])) * 25 + x
    return x * np.linspace(0, 1, n) ** 2.5
def hit(root):
    x = np.zeros(int(1.6 * sr))
    for n, g in ((root - 12, 1), (root, 0.8), (root + 7, 0.5), (root + 12, 0.5)):
        q = pluck(n, 1.6, 8); x[:len(q)] += q * g
    k = kick(); x[:len(k)] += k * 1.3
    m = int(0.5 * sr); nz = np.diff(rng.standard_normal(m + 1)) * np.exp(-np.arange(m) / sr * 9) * 0.12; x[:m] += nz
    return x

CH = [(50, [62, 65, 69]), (46, [58, 62, 65]), (41, [60, 65, 69]), (48, [60, 64, 67])]  # Dm, Bb, F, C

intro = buf(9.0)
add(intro, 0, whoosh(0.22), 0.25); add(intro, 0.18, hit(50), 0.5)
for bar in range(4):
    root, notes = CH[bar]; t0 = bar * 4 * B
    add(intro, t0, pad(notes, 4 * B + 0.3), 0.8)
    arp = [notes[0], notes[1], notes[2], notes[1] + 12, notes[2], notes[1], notes[0] + 12, notes[2]]
    for j in range(8): add(intro, t0 + j * B / 2, pluck(arp[j] + 12, 0.7, 3), 0.22 if bar else 0.17)
    for b in range(4):
        tb = t0 + b * B
        add(intro, tb, bass(root - 12 if root > 45 else root), 0.55)
        if bar >= 1: add(intro, tb, kick(), 0.22); add(intro, tb + B / 2, hat(), 0.18)
add(intro, 8.4 - 0.9, whoosh(0.9), 0.28)
intro *= env(len(intro), 0, 0.5)

blips = []
for n in (74, 77, 81, 84, 86, 89):
    b = buf(0.5); add(b, 0, pluck(n, 0.45, 2), 0.2); blips.append(b)

L = 4 * 8 * B  # 16.8 s
two = buf(2 * L + 1)
for rep in range(2):
    for bar in range(4):
        root, notes = CH[bar]; t = rep * L + bar * 8 * B
        add(two, t, pad(notes, 8 * B + 0.4), 0.6)
        for b in range(8):
            add(two, t + b * B, bass(root if root > 45 else root + 12, 0.4), 0.35)
            if b % 2 == 0: add(two, t + b * B + B / 2, pluck(notes[(b // 2) % 3] + 12, 0.5, 3), 0.16)
bed = two[int(L * sr): int(2 * L * sr)] * 0.40  # the second pass carries the first's tails, so it loops cleanly

change = buf(2.2)
add(change, 0, whoosh(0.52), 0.2 * 0.55); add(change, 0.5, hit(50), 0.22 * 0.55)

closer = buf(4.4); tc = 0
add(closer, tc, hit(50), 0.5); add(closer, tc, pad([62, 66, 69, 74], 3.7), 0.95)
for j, n in enumerate([62, 66, 69, 74, 78, 81, 86]): add(closer, tc + 0.25 + j * B / 2, pluck(n, 1.1, 3), 0.26)
for b in range(4):
    add(closer, tc + b * B, bass(38, 0.5), 0.7)
    if b < 3: add(closer, tc + b * B, kick(), 0.18)
add(closer, tc + 2.1, pluck(74, 1.4, 6), 0.4); add(closer, tc + 2.1, pluck(62, 1.4, 6), 0.4)
tt = np.arange(len(closer)) / sr
closer *= np.clip((3.55 - tt) / 1.2, 0, 1)

k = 0.5 / np.abs(intro).max() * 10 ** (2 / 20)
os.makedirs(OUT, exist_ok=True)
def save(name, x):
    x = np.tanh(x * k * 1.2) / 1.2
    wav = os.path.join(OUT, name + ".wav")
    w = wave.open(wav, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()); w.close()
    subprocess.check_call(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, os.path.join(OUT, name + ".flac")])
    os.remove(wav)
save("intro", intro); save("bed", bed); save("hit", change); save("closer", closer)
for i, b in enumerate(blips): save(f"blip{i + 1}", b)
