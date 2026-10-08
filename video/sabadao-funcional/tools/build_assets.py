"""Build the animation layers for the Sabadão Funcional motion flyer.

Inputs  (project/assets/src): Capa_Funcional.psd, logo_sabadao_funcional.png,
                              arte_mulher.jpg
Outputs (project/assets/layers + project/assets/manifest.js)

- logo split into parts (palm, arc, birds, "Sabadão", "Funcional", brush base,
  Cia do Corpo mark) by connected components; anti-aliased edge pixels go to
  the nearest component so the parts recompose pixel-exact.
- group photo cleaned (PSD mask replaced by a soft band mask), Lanczos
  upscale + light unsharp.
- generated plates: sky with soft clouds, sand, dry-brush stroke masks.
- PSD wave lines (FORMAS).

Usage: python3 tools/build_assets.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from psd_tools import PSDImage
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "project" / "assets" / "src"
OUT = ROOT / "project" / "assets" / "layers"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(11)

LOGO_SCALE = 0.6  # parts are stored at 1200 px logo size (source is 2000)

# component ids from the labelled logo (see README); every other blob is
# attached to the group of its nearest big component
GROUPS = {
    "palm": [1, 4, 11],
    "arc": [2],
    "bird_l1": [5], "bird_l2": [6], "bird_l3": [12],
    "bird_r1": [13], "bird_r2": [15],
    "sabadao": [7, 8, 9, 10, 16],
    "funcional": [14, 17, 18],
    "base": [19],
    "cia": [20, 21, 23, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36],
}


def save(im, name):
    im.save(OUT / name, optimize=True)
    return name


def logo_parts():
    im = Image.open(SRC / "logo_sabadao_funcional.png").convert("RGBA")
    a = np.array(im)
    alpha = a[..., 3]
    lab, n = ndimage.label(alpha > 40, structure=np.ones((3, 3)))
    gid = np.zeros(n + 1, int)  # component -> group index (1-based)
    names = list(GROUPS)
    for gi, name in enumerate(names, 1):
        for c in GROUPS[name]:
            gid[c] = gi
    # tiny blobs (dots, accents) -> group of nearest assigned component
    assigned = gid[lab] > 0
    dist, (iy, ix) = ndimage.distance_transform_edt(~assigned, return_indices=True)
    owner = gid[lab[iy, ix]]
    # faint alpha noise far from the artwork is dropped
    owner[(alpha == 0) | ((dist > 6) & (alpha < 40))] = 0
    parts = {}
    for gi, name in enumerate(names, 1):
        m = owner == gi
        if not m.any():
            continue
        ys, xs = np.where(m)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        pad = 4
        x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
        x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
        part = a[y0:y1, x0:x1].copy()
        part[..., 3] = np.where(m[y0:y1, x0:x1], part[..., 3], 0)
        p = Image.fromarray(part)
        w, h = round(p.width * LOGO_SCALE), round(p.height * LOGO_SCALE)
        p = p.resize((w, h), Image.LANCZOS)
        fn = save(p, f"logo_{name}.png")
        parts[name] = {"src": fn, "x": round(x0 * LOGO_SCALE, 2), "y": round(y0 * LOGO_SCALE, 2),
                       "w": w, "h": h}
    return parts


def psd_layers():
    psd = PSDImage.open(SRC / "Capa_Funcional.psd")
    lay = {l.name: l for l in psd.descendants() if l.kind != "group"}
    out = {}
    # FORMAS (pixel): thin white wave lines, 50% opacity in the art
    f = lay["FORMAS"].topil()
    out["waves"] = save(f, "waves.png")

    # Group photo: the PSD mask hides smeared/retouch areas at the top and
    # holes in the sand at the bottom, so keep the clean band only.
    ph = lay["IMG_4545"].topil().convert("RGB")
    y0, y1 = 455, 885
    band = ph.crop((0, y0, ph.width, y1))
    s = 1.35
    band = band.resize((round(band.width * s), round(band.height * s)), Image.LANCZOS)
    band = band.filter(ImageFilter.UnsharpMask(radius=1.4, percent=55, threshold=2))
    # warm grade so the raw photo matches the art (sand ~#e3b180 in the PSD)
    g = np.array(band).astype(float)
    g *= np.array([1.12, 0.99, 0.90])
    lum = g.mean(2, keepdims=True)
    g = lum + (g - lum) * 1.12
    band = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8))
    h = band.height
    yy = np.arange(h)[:, None] / h
    top = np.clip((yy - 0.0) / 0.16, 0, 1)
    bot = np.clip((1.0 - yy) / 0.12, 0, 1)
    top, bot = top * top * (3 - 2 * top), bot * bot * (3 - 2 * bot)
    m = (top * bot * 255).astype(np.uint8).repeat(band.width, 1)
    band.putalpha(Image.fromarray(m))
    out["photo"] = save(band, "photo_group.png")
    # sky colour right above the trees (clean columns), for the generated sky
    arr = np.array(ph).astype(float)
    sky = arr[470:520, 520:580].reshape(-1, 3).mean(0)
    out["sky_low"] = "#%02x%02x%02x" % tuple(int(v) for v in sky)
    out["sand"] = "#e3b180"  # sand tone of the flattened art (Camada 0)
    return out


def fbm(h, w, octaves=5, base=4, seed=0):
    r = np.random.default_rng(seed)
    acc = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = base * 2 ** o
        g = r.random((n + 1, max(2, int(n * w / h)) + 1))
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        acc += amp * np.array(im) / 255
        tot += amp
        amp *= 0.5
    return acc / tot


def hex2rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)


def sky_plate(sky_low):
    W, H = 1080, 1300
    y = np.linspace(0, 1, H)[:, None, None]
    top = hex2rgb("#0b47b8")
    mid = hex2rgb("#1d6fcc")
    low = hex2rgb(sky_low)
    c = np.where(y < 0.55, top + (mid - top) * (y / 0.55), mid + (low - mid) * ((y - 0.55) / 0.45))
    c = np.broadcast_to(c, (H, W, 3)).copy()
    # soft cumulus towards the horizon and right side
    n = fbm(H, W, 6, 3, seed=4)
    yy = np.linspace(0, 1, H)[:, None]
    xx = np.linspace(0, 1, W)[None, :]
    bias = 0.55 * np.clip((yy - 0.25) / 0.6, 0, 1) + 0.12 * xx
    cl = np.clip((n + bias - 0.86) / 0.22, 0, 1) ** 1.6
    cl = ndimage.gaussian_filter(cl, 3)
    c = c * (1 - cl[..., None] * 0.85) + np.array([246, 249, 255]) * cl[..., None] * 0.85
    return save(Image.fromarray(np.clip(c, 0, 255).astype(np.uint8)), "sky.jpg")


def sand_plate(sand_hex):
    W, H = 1080, 1000
    base = hex2rgb(sand_hex)
    y = np.linspace(0, 1, H)[:, None, None]
    c = base * (1.02 - 0.10 * y) + np.array([8, 2, -6]) * y
    c = np.broadcast_to(c, (H, W, 3)).copy()
    n = fbm(H, W, 6, 8, seed=7)
    ripple = np.sin(np.linspace(0, 1, H)[:, None] * 90 + n * 9) * 0.5 + 0.5
    c *= (0.93 + 0.1 * n[..., None] + 0.03 * ripple[..., None])
    grain = rng.normal(0, 7, (H, W, 1))
    c = np.clip(c + grain, 0, 255).astype(np.uint8)
    im = Image.fromarray(c).filter(ImageFilter.GaussianBlur(0.6))
    return save(im, "sand.jpg")


def brush_mask(w, h, name, density=1.0, ragged=0.18, taper=0.25, seed=0, solid=0.0):
    """Dry-brush stroke along the x axis (white mask with alpha)."""
    r = np.random.default_rng(seed)
    S = 2  # supersample
    W, H = w * S, h * S
    img = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(img)
    nb = int(260 * density)
    cy = H / 2
    for i in range(nb):
        u = r.uniform(-1, 1)
        # stroke body: slightly bulged in the middle, tapered at ends
        x0 = r.uniform(0, ragged) * W + abs(u) ** 2 * taper * W * r.uniform(0.3, 1)
        x1 = W - r.uniform(0, ragged) * W - abs(u) ** 2 * taper * W * r.uniform(0.3, 1)
        if x1 <= x0:
            continue
        val = int(255 * r.uniform(0.55, 1.0))
        th = r.uniform(1.5, 5.5) * S
        pts = []
        steps = 24
        wob = r.uniform(0, 6.28)
        for k in range(steps + 1):
            t = k / steps
            x = x0 + (x1 - x0) * t
            env = np.sin(np.pi * (0.08 + 0.84 * t)) ** 0.35
            yv = cy + u * (H / 2 - 4 * S) * env + np.sin(t * 6 + wob) * 1.2 * S
            pts.append((x, yv))
        d.line(pts, fill=val, width=max(1, int(th)))
        # broken bristles: random gaps
        for _ in range(r.integers(0, 3)):
            gx = r.uniform(x0, x1)
            gl = r.uniform(10, 60) * S
            gy = cy + u * (H / 2 - 4 * S)
            d.line([(gx, gy), (gx + gl, gy)], fill=0, width=max(1, int(th * 0.7)))
    if solid > 0:
        core = Image.new("L", (W, H), 0)
        ImageDraw.Draw(core).rounded_rectangle(
            (W * 0.08, H * 0.2, W * 0.92, H * 0.8), radius=H * 0.3, fill=int(255 * solid))
        img = Image.fromarray(np.maximum(np.array(img), np.array(core.filter(ImageFilter.GaussianBlur(14 * S)))))
    img = img.filter(ImageFilter.GaussianBlur(0.7 * S)).resize((w, h), Image.LANCZOS)
    out = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    out.putalpha(img)
    return save(out, name)


def main():
    parts = logo_parts()
    psd = psd_layers()
    man = {
        "logo": {"scale": LOGO_SCALE, "parts": parts},
        "photo": psd["photo"],
        "waves": psd["waves"],
        "colors": {"sky_low": psd["sky_low"], "sand": psd["sand"]},
        "sky": sky_plate(psd["sky_low"]),
        "sand": sand_plate(psd["sand"]),
        "brush": {
            "big": brush_mask(1500, 420, "brush_big.png", density=2.2, ragged=0.10, taper=0.3, seed=1, solid=1.0),
            "band": brush_mask(1200, 240, "brush_band.png", density=1.8, ragged=0.05, taper=0.12, seed=2, solid=1.0),
            "under": brush_mask(900, 60, "brush_under.png", density=0.6, ragged=0.04, taper=0.5, seed=3, solid=0.9),
            "streak": brush_mask(1400, 90, "brush_streak.png", density=0.5, ragged=0.2, taper=0.6, seed=4),
        },
    }
    (ROOT / "project" / "assets" / "manifest.js").write_text(
        "window.MANIFEST=" + json.dumps(man, indent=1, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(json.dumps(man["colors"]), "parts:", ", ".join(parts))


if __name__ == "__main__":
    main()
