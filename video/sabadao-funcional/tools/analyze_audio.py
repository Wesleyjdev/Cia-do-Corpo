"""Analyse a music track for frame-accurate motion design.

Writes a JSON with tempo, beat grid, onsets, notable moments and per-frame
frequency bands, so the HTML timeline can be rendered deterministically
(every frame depends only on t and this file).

Usage: python3 analyze_audio.py <audio> <out.json> [--fps 30] [--js]
       --js also writes <out>.js as `window.AUDIO = {...}` so the page can be
       opened from file:// without fetch().
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 22050
HOP = 256
NFFT = 2048
BANDS = {"sub": (20, 60), "low": (60, 250), "mid": (250, 2000),
         "high": (2000, 6000), "air": (6000, 11000)}


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR),
         "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def stft_mag(x):
    pad = np.pad(x, (NFFT // 2, NFFT // 2))
    n = 1 + (len(pad) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    win = np.hanning(NFFT).astype(np.float32)
    return np.abs(np.fft.rfft(pad[idx] * win, axis=1))  # (frames, bins)


def smooth(x, n):
    if n <= 1:
        return x
    k = np.hanning(n + 2)[1:-1]
    return np.convolve(x, k / k.sum(), mode="same")


def norm(x, pct=98):
    hi = np.percentile(x, pct) or 1.0
    return np.clip(x / hi, 0, 1)


def peaks(x, min_dist, thresh):
    out = []
    for i in range(1, len(x) - 1):
        if x[i] >= thresh and x[i] >= x[i - 1] and x[i] > x[i + 1]:
            if out and i - out[-1] < min_dist:
                if x[i] > x[out[-1]]:
                    out[-1] = i
                continue
            out.append(i)
    return out


def tempo_and_grid(onset, fr, dur):
    """Autocorrelation tempo (70-180 BPM) + phase fit of a fixed beat grid."""
    o = onset - onset.mean()
    ac = np.correlate(o, o, mode="full")[len(o) - 1:]
    lags = np.arange(len(ac))
    bpm_of = 60 * fr / np.maximum(lags, 1)
    ok = (bpm_of >= 70) & (bpm_of <= 180)
    # mild preference for ~120 BPM to avoid octave errors
    w = np.exp(-0.5 * (np.log2(bpm_of / 120) / 0.9) ** 2)
    lag = lags[ok][np.argmax((ac * w)[ok])]
    # parabolic refinement
    if 1 <= lag < len(ac) - 1:
        a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
        lag = lag + 0.5 * (a - c) / (a - 2 * b + c + 1e-9)
    period = lag / fr
    bpm = 60 / period
    # phase: maximise onset strength sampled on the grid
    best, best_phase = -1, 0.0
    for ph in np.linspace(0, period, 200, endpoint=False):
        ts = np.arange(ph, dur, period)
        v = onset[np.clip((ts * fr).round().astype(int), 0, len(onset) - 1)].sum()
        if v > best:
            best, best_phase = v, ph
    beats = np.arange(best_phase, dur, period)
    return float(bpm), float(period), beats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--js", action="store_true")
    a = ap.parse_args()

    x = decode(a.audio)
    dur = len(x) / SR
    S = stft_mag(x)
    fr = SR / HOP
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)

    # spectral-flux onset envelope (log-compressed), low end weighted for kicks
    L = np.log1p(100 * S)
    flux = np.maximum(0, np.diff(L, axis=0, prepend=L[:1])).sum(1)
    lowmask = (freqs >= 30) & (freqs < 160)
    kick = np.maximum(0, np.diff(L[:, lowmask], axis=0, prepend=L[:1, lowmask])).sum(1)
    onset = norm(smooth(flux, 3))
    kick_env = norm(smooth(kick, 3))

    bpm, period, beats = tempo_and_grid(onset, fr, dur)

    # per-video-frame features
    nf = int(round(dur * a.fps))
    t_frames = (np.arange(nf) + 0.5) / a.fps
    fi = np.clip((t_frames * fr).astype(int), 0, len(S) - 1)
    rms = np.sqrt(np.mean(S ** 2, axis=1))
    bands = {}
    for k, (lo, hi) in BANDS.items():
        m = (freqs >= lo) & (freqs < hi)
        bands[k] = norm(smooth(np.log1p(S[:, m].mean(1) * 50), 5))[fi]
    energy = norm(smooth(rms, 9))[fi]
    onset_f = onset[fi]
    kick_f = kick_env[fi]

    # notable moments
    on_idx = peaks(onset, int(0.12 * fr), 0.35)
    onsets = [round(i / fr, 3) for i in on_idx]
    loud = norm(smooth(rms, int(0.25 * fr)))  # slow loudness curve
    # groove entry: first time the slow loudness + kick density stays high
    kd = smooth(kick_env, int(1.0 * fr))
    g = np.where((loud > 0.55) & (kd > np.percentile(kd, 50)))[0]
    groove = float(g[0] / fr) if len(g) else 0.0
    # biggest impact: strongest combined (kick + flux) transient
    impact_score = smooth(onset, 3) * 0.5 + smooth(kick_env, 3) * 0.5
    impact = float(np.argmax(impact_score[: int((dur - 1.0) * fr)]) / fr)
    # final drop: last big fall of the slow loudness curve
    dl = np.diff(smooth(loud, int(0.3 * fr)))
    tail = int(dur * 0.6 * fr)
    drop = float((tail + np.argmin(dl[tail:])) / fr)

    def snap(t):
        return float(beats[np.argmin(np.abs(beats - t))])

    beat_strength = [float(onset[min(int(b * fr), len(onset) - 1)]) for b in beats]
    data = {
        "source": Path(a.audio).name,
        "duration": round(dur, 4),
        "fps": a.fps,
        "frames": nf,
        "bpm": round(bpm, 2),
        "beat_period": round(period, 4),
        "beats": [round(float(b), 4) for b in beats],
        "beat_strength": [round(s, 3) for s in beat_strength],
        "onsets": onsets,
        "moments": {
            "groove": round(groove, 3), "groove_beat": round(snap(groove), 4),
            "impact": round(impact, 3), "impact_beat": round(snap(impact), 4),
            "drop": round(drop, 3), "drop_beat": round(snap(drop), 4),
        },
        "per_frame": {
            "energy": [round(float(v), 3) for v in energy],
            "onset": [round(float(v), 3) for v in onset_f],
            "kick": [round(float(v), 3) for v in kick_f],
            **{k: [round(float(v), 3) for v in b] for k, b in bands.items()},
        },
    }
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, separators=(",", ":")))
    if a.js:
        out.with_suffix(".js").write_text("window.AUDIO=" + json.dumps(data, separators=(",", ":")) + ";\n")
    m = data["moments"]
    print(f"duration {dur:.3f}s  bpm {bpm:.1f}  beats {len(beats)}  frames {nf}")
    print(f"groove {m['groove']}s (beat {m['groove_beat']})  impact {m['impact']}s "
          f"(beat {m['impact_beat']})  drop {m['drop']}s (beat {m['drop_beat']})")
    if abs(dur - 15.0) > 0.05:
        print(f"WARNING: duration is {dur:.3f}s, not 15s", file=sys.stderr)


if __name__ == "__main__":
    main()
