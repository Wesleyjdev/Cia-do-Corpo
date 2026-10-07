"""Audio analysis -> data/audio.json (per-frame bands, onsets, beats, BPM).

Usage: python3 tools/analyze_audio.py assets/audio.mp3 data/audio.json   (also writes data/audio.js)
"""
import json
import sys

import librosa
import numpy as np

FPS = 30
src, dst = sys.argv[1], sys.argv[2]
y, sr = librosa.load(src, sr=44100, mono=True)
dur = len(y) / sr
n_frames = int(round(dur * FPS))
hop = 512

tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop, units="frames")
beats = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=hop, units="time", backtrack=False)
on_t = librosa.frames_to_time(np.arange(len(onset_env)), sr=sr, hop_length=hop)

S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
st = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)


def band(lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return S[m].mean(axis=0)


bands = {"sub": band(20, 80), "bass": band(80, 250), "lowmid": band(250, 1000),
         "mid": band(1000, 4000), "high": band(4000, 16000)}
rms = librosa.feature.rms(y=y, hop_length=hop)[0]

# 64 mel bands for the radial spectrum ring (every band has energy, unlike narrow log bins)
mel = librosa.feature.melspectrogram(S=S ** 2, sr=sr, n_mels=64, fmin=30, fmax=14000)
spec_db = librosa.power_to_db(mel, ref=np.max)
spec_n = np.clip((spec_db + 55) / 55, 0, 1)


def norm(a):
    a = np.asarray(a, float)
    return a / (np.percentile(a, 99) + 1e-9)


ft = np.arange(n_frames) / FPS
frames = []
for i, t in enumerate(ft):
    j = min(int(np.searchsorted(st, t)), S.shape[1] - 1)
    frames.append({k: round(float(min(1.5, norm(v)[j])), 4) for k, v in bands.items()} |
                  {"rms": round(float(min(1.5, norm(rms)[min(j, len(rms) - 1)])), 4),
                   "onset": round(float(min(1.5, norm(onset_env)[min(j, len(onset_env) - 1)])), 4),
                   "spec": [round(float(x), 3) for x in spec_n[:, j]]})

# strong hits = onsets with high low-end energy
strength = np.interp(onsets, on_t, norm(onset_env))
hits = [{"t": round(float(t), 3), "s": round(float(s), 3)} for t, s in zip(onsets, strength)]
out = {"fps": FPS, "duration": round(dur, 3), "n_frames": n_frames,
       "bpm": round(float(np.atleast_1d(tempo)[0]), 2),
       "beats": [round(float(b), 3) for b in beats], "onsets": hits, "frames": frames}
json.dump(out, open(dst, "w"), separators=(",", ":"))
# same data as a script so the page also works from file:// (no fetch)
open(dst.rsplit(".", 1)[0] + ".js", "w").write("window.AUDIO=" + json.dumps(out, separators=(",", ":")) + ";\n")
print("dur", dur, "frames", n_frames, "bpm", out["bpm"])
print("beats", out["beats"])
print("strong onsets", [(h["t"], h["s"]) for h in hits if h["s"] > 0.35])
# energy envelope per 0.5s
for k in range(0, int(dur * 2)):
    a, b = k * 0.5, k * 0.5 + 0.5
    m = (st >= a) & (st < b)
    print(f"{a:5.1f} rms={rms[m[:len(rms)]].mean():.3f} bass={norm(bands['bass'])[m].mean():.2f}")
