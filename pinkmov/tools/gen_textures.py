"""Procedural textures for the Pink Mov motion flyer (deterministic, seeded).

- paper.jpg        dark crumpled paper (facets + folds + fibres), oversized for camera moves
- grain_{0..7}.png fine film grain tiles (cycled per frame)
- stroke_*.png     dry-brush strokes rebuilt from the flyer art (pink bands, orange streaks)
- worn.png         wear mask for the condensed title (white = keep)

Usage: python3 tools/gen_textures.py assets/tex
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(21)

PINK = np.array([246, 4, 92]) / 255
PINK_DEEP = np.array([200, 0, 78]) / 255
PINK_HI = np.array([255, 70, 140]) / 255
ORANGE = np.array([248, 99, 2]) / 255
ORANGE_HI = np.array([255, 150, 40]) / 255


def smooth_noise(shape, sigma, rng):
    n = ndimage.gaussian_filter(rng.standard_normal(shape), sigma, mode="wrap")
    return (n - n.mean()) / (n.std() + 1e-9)


def fbm(shape, sigmas, rng, falloff=0.55):
    acc, amp = np.zeros(shape), 1.0
    for s in sigmas:
        acc += amp * smooth_noise(shape, s, rng)
        amp *= falloff
    return acc / np.abs(acc).max()


# ------------------------------------------------------------------ paper
def paper(w=1400, h=2400):
    from scipy.spatial import cKDTree
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    P = np.c_[xx.ravel(), yy.ravel()]
    gx = np.zeros((h, w))
    gy = np.zeros((h, w))
    # multi-scale Voronoi facets, each with its own tilt -> straight creases, flat-ish faces
    for n_pts, amp in [(70, 1.0), (300, 0.55), (1400, 0.12)]:
        pts = np.c_[rng.uniform(-100, w + 100, n_pts), rng.uniform(-100, h + 100, n_pts)]
        _, idx = cKDTree(pts).query(P)
        idx = idx.reshape(h, w)
        gx += amp * rng.normal(0, 1, n_pts)[idx]
        gy += amp * rng.normal(0, 1, n_pts)[idx]
    gx = ndimage.gaussian_filter(gx, 1.6)
    gy = ndimage.gaussian_filter(gy, 1.6)
    # fine crinkle + slow undulation
    gx += smooth_noise((h, w), 3, rng) * 0.10 + smooth_noise((h, w), 120, rng) * 0.6
    gy += smooth_noise((h, w), 3, rng) * 0.10 + smooth_noise((h, w), 120, rng) * 0.6
    light = np.array([-0.45, -0.75, 1.3])
    light /= np.linalg.norm(light)
    nrm = np.dstack([-gx * 0.55, -gy * 0.55, np.ones_like(gx)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    lam = (nrm * light).sum(2)
    lam = (lam - np.percentile(lam, 1)) / (np.percentile(lam, 99.7) - np.percentile(lam, 1))
    fib = ndimage.gaussian_filter(rng.standard_normal((h, w)), (0.7, 2.0)) * 0.03
    shade = np.clip(lam, 0, 1.1) ** 1.6 + fib + fbm((h, w), [300, 140], rng) * 0.10
    base = np.array([8, 6, 9]) / 255
    hi = np.array([52, 45, 54]) / 255
    img = np.clip(base + (hi - base) * np.clip(shade, 0, 1.2)[..., None], 0, 1)
    Image.fromarray((img * 255).astype(np.uint8)).save(OUT / "paper.jpg", quality=92)


# ------------------------------------------------------------------ grain
def grain():
    for i in range(8):
        g = rng.normal(0, 1, (540, 960))
        g = ndimage.gaussian_filter(g, 0.55)
        g = (np.clip(g / 3 * 0.5 + 0.5, 0, 1) * 255).astype(np.uint8)
        Image.fromarray(g, "L").save(OUT / f"grain_{i}.png")


# ------------------------------------------------------------------ strokes
def stroke(name, L, T, c0, c1, c_hi, ragged=0.18, density=0.85, holes=0.25, seed=0):
    """Dry-brush stroke drawn left->right in local space (L x T), RGBA."""
    r = np.random.default_rng(seed)
    pad = int(T * 0.35)
    H, W = T + 2 * pad, L
    y = np.arange(H)[:, None].astype(float)
    x = np.arange(W)[None, :].astype(float)
    # wobbling edges along the stroke
    top = pad + smooth_noise((1, W), (0, W / 10), r)[0] * T * 0.03 + smooth_noise((1, W), (0, W / 300), r)[0] * T * 0.012
    bot = pad + T + smooth_noise((1, W), (0, W / 10), r)[0] * T * 0.03 + smooth_noise((1, W), (0, W / 300), r)[0] * T * 0.015
    soft = max(1.0, T * 0.006)
    body = np.clip((y - top) / soft, 0, 1) * np.clip((bot - y) / soft, 0, 1)
    # bristle streaks: per-row pressure, stretched along x
    rows = smooth_noise((H, 1), (0.9, 0), r)
    rows2 = smooth_noise((H, 1), (3, 0), r)
    streak = smooth_noise((H, W), (0.7, W / 25), r)
    press = 0.6 * rows + 0.3 * rows2 + 0.45 * streak
    # ragged dry ends: each bristle row starts/ends at its own x
    start = (r.uniform(0, 1, H) ** 1.6) * L * ragged + ndimage.gaussian_filter1d(r.uniform(0, 1, H), 2) * L * 0.04
    end = L - (r.uniform(0, 1, H) ** 1.4) * L * ragged * 1.3 - ndimage.gaussian_filter1d(r.uniform(0, 1, H), 2) * L * 0.05
    edge_d = np.abs((np.arange(H) - H / 2) / (T / 2))          # 0 centre .. 1 edge
    start = start + np.clip(edge_d - 0.55, 0, 1) ** 1.5 * L * 0.25 * r.uniform(0.3, 1, H)
    end = end - np.clip(edge_d - 0.5, 0, 1) ** 1.5 * L * 0.3 * r.uniform(0.3, 1, H)
    slant = (np.arange(H) - H / 2) / H * T * 0.9                 # swiped, slanted ends
    start, end = start - slant, end - slant
    start = ndimage.gaussian_filter1d(start, 0.8)[:, None]
    end = ndimage.gaussian_filter1d(end, 0.8)[:, None]
    ends = np.clip((x - start) / (L * 0.02), 0, 1) * np.clip((end - x) / (L * 0.035), 0, 1)
    # paint runs out toward the end -> more holes
    dry = (x / L) ** 2.2 * holes * 2.2 + (1 - x / L) ** 6 * holes * 0.6
    keep = press + density - dry * (1.2 + 0.6 * smooth_noise((H, W), (1.2, 12), r))
    a = np.clip(keep * 2.4, 0, 1) * body * ends
    # thin flyaway bristles beyond the main body edges
    fly = (smooth_noise((H, W), (0.5, W / 10), r) > 2.1) * np.exp(-((y - (top + bot) / 2) / (T * 0.62)) ** 2)
    fly *= np.clip((x - start) / (L * 0.05), 0, 1) * np.clip((end + L * 0.05 - x) / (L * 0.05), 0, 1)
    a = np.maximum(a, fly * 0.85)
    a = ndimage.gaussian_filter(a, 0.6)
    # colour: base gradient + lighter streaks + darker edges
    tone = np.clip(0.5 + 0.5 * streak * 0.6 + 0.3 * rows, 0, 1)[..., None]
    across = np.clip((y - top) / (bot - top + 1e-9), 0, 1)[..., None]
    col = c0 * (1 - across * 0.4) + c1 * across * 0.4
    col = col * (0.85 + 0.25 * tone) + c_hi * np.clip(streak[..., None] - 1.3, 0, 1) * 0.5
    rgba = np.dstack([np.clip(col, 0, 1), np.clip(a, 0, 1)])
    Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").save(OUT / f"stroke_{name}.png", optimize=True)


def worn(w=1600, h=400):
    n = fbm((h, w), [1.2, 4, 14], rng, 0.7)
    specks = ndimage.gaussian_filter(rng.standard_normal((h, w)), 0.8)
    m = np.ones((h, w))
    m -= (n > 0.56) * 0.75
    m -= (specks > 2.9) * 0.9
    scratches = ndimage.gaussian_filter(rng.standard_normal((h, w)), (0.4, 18)) > 0.17
    m -= scratches * 0.3
    m = np.clip(ndimage.gaussian_filter(m, 0.5), 0, 1)
    a = (m * 255).astype(np.uint8)            # wear lives in the alpha channel (canvas masks use alpha)
    Image.fromarray(np.dstack([np.full_like(a, 255)] * 3 + [a]), "RGBA").save(OUT / "worn.png")


if __name__ == "__main__":
    paper()
    if len(sys.argv) > 2:
        sys.exit()
    grain()
    stroke("band", 1700, 230, PINK, PINK_DEEP, PINK_HI, ragged=0.10, density=0.95, holes=0.18, seed=1)
    stroke("pink_a", 1500, 150, PINK, PINK_DEEP, PINK_HI, ragged=0.22, density=0.75, holes=0.35, seed=2)
    stroke("pink_b", 1300, 110, PINK, PINK_DEEP, PINK_HI, ragged=0.25, density=0.7, holes=0.4, seed=3)
    stroke("pink_c", 1100, 80, PINK_HI, PINK, PINK_HI, ragged=0.28, density=0.6, holes=0.45, seed=4)
    stroke("orange_a", 900, 22, ORANGE, ORANGE, ORANGE_HI, ragged=0.25, density=0.8, holes=0.3, seed=5)
    stroke("orange_b", 700, 16, ORANGE, ORANGE, ORANGE_HI, ragged=0.3, density=0.75, holes=0.35, seed=6)
    worn()
    print("ok")
