"""Cut-out + clean plate of the woman photo for the "sun portal" glance (v2).

1. Matte: ISNet (the ONNX model shipped inside the npm package
   @imgly/background-removal-node, run offline with onnxruntime), inferred in
   overlapping tiles near native resolution so fingers, nails, cap and hair
   keep their edges. The matte is cached as assets/src/foto_mulher_matte.png,
   so later builds do not need the model.
2. Edge clean-up: soft edge choked ~0.5 px, colours decontaminated
   (blur-fusion foreground estimation) and edge pixels re-coloured from the
   solid interior, so no background colour (sand, a red shirt behind the
   arm) leaves a rim.
3. Light warm grade (skin tones kept) + discreet unsharp mask.
4. Clean plate: the woman region filled from its surroundings (pyramid
   normalised convolution) and softened, used as the beach inside the circle.

Usage: python3 tools/build_woman.py [--model path/to/medium.onnx]
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "project" / "assets" / "src"
OUT = ROOT / "project" / "assets" / "layers"
PHOTO = SRC / "foto_mulher.jpg"
MATTE = SRC / "foto_mulher_matte.png"

# overlapping tiles (x0, y0, x1, y1) over the figure, ~native resolution
TILES = [(130, 260, 930, 1060), (150, 700, 950, 1500), (150, 1200, 950, 2000)]


def matte_from_model(im, model):
    import onnxruntime as ort
    sess = ort.InferenceSession(str(model))

    def run(img):
        x = np.array(img.resize((1024, 1024), Image.BICUBIC)).astype(np.float32) / 255
        x = (x - 0.5).transpose(2, 0, 1)[None]
        return np.clip(sess.run(["output"], {"input": x})[0][0, 0], 0, 1)

    W, H = im.size
    full = run(im)
    full = np.array(Image.fromarray((full * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)) / 255.0
    acc, wsum = np.zeros((H, W)), np.zeros((H, W))
    for x0, y0, x1, y1 in TILES:
        o = run(im.crop((x0, y0, x1, y1)))
        o = np.array(Image.fromarray((o * 255).astype(np.uint8)).resize((x1 - x0, y1 - y0), Image.BICUBIC)) / 255.0
        wy = np.minimum(np.arange(y1 - y0), np.arange(y1 - y0)[::-1])[:, None]
        wx = np.minimum(np.arange(x1 - x0), np.arange(x1 - x0)[::-1])[None, :]
        w = np.clip(np.minimum(wy, wx) / 60, 0.01, 1)
        acc[y0:y1, x0:x1] += o * w
        wsum[y0:y1, x0:x1] += w
    return np.where(wsum > 0, acc / np.maximum(wsum, 1e-6), full)


def clean_matte(a):
    a = np.clip((a - 0.03) / 0.94, 0, 1)            # kill faint haze
    lab, n = ndimage.label(a > 0.5)
    if n > 1:                                       # keep the figure only
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        keep = lab == (1 + int(np.argmax(sizes)))
        keep = ndimage.binary_dilation(keep, iterations=6)
        a = a * keep
    return a


def blur_fusion_fg(img, a, radii=(90, 7)):
    """Approximate fast foreground colour estimation (Forte & Pitie 2021)."""
    F = img.copy()
    B = img.copy()
    A = a[..., None]
    for r in radii:
        size = 2 * r + 1
        bl = lambda x: ndimage.uniform_filter(x, size=(size, size, 1) if x.ndim == 3 else size)
        ba = bl(a)[..., None]
        bF = bl(F * A) / (ba + 1e-5)
        bB = bl(B * (1 - A)) / (bl(1 - a)[..., None] + 1e-5)
        F = bF + A * (img - A * bF - (1 - A) * bB)
        F = np.clip(F, 0, 1)
        B = bB
    return F


def edge_colour_from_interior(F, a, sigma=2.5):
    """Edge pixels take the colour of the nearby solid interior (no bleed)."""
    solid = (a > 0.97).astype(float)
    w = ndimage.gaussian_filter(solid, sigma)
    c = np.stack([ndimage.gaussian_filter(F[..., i] * solid, sigma) for i in range(3)], -1)
    inner = c / np.maximum(w, 1e-6)[..., None]
    k = np.clip((0.97 - a) / 0.6, 0, 1)[..., None] * (w > 0.02)[..., None]
    return F * (1 - k) + inner * k


def warm_grade(rgb):
    g = rgb * np.array([1.035, 1.0, 0.94])        # gentle warmth, skin stays natural
    lum = g.mean(2, keepdims=True)
    g = lum + (g - lum) * 1.06                      # touch of vibrance
    g = (g - 0.5) * 1.04 + 0.5                       # touch of contrast
    return np.clip(g, 0, 1)


def fill_plate(rgb, hole):
    """Fill `hole` from surrounding pixels with a normalised-convolution pyramid."""
    known = (~hole).astype(float)
    out = rgb.copy()
    est = np.zeros_like(rgb)
    filled = np.zeros(hole.shape, bool)
    for sigma in (4, 10, 24, 60, 140):
        w = ndimage.gaussian_filter(known, sigma)
        c = np.stack([ndimage.gaussian_filter(rgb[..., i] * known, sigma) for i in range(3)], -1)
        ok = (w > 0.02) & hole & ~filled
        est[ok] = (c / np.maximum(w, 1e-6)[..., None])[ok]
        filled |= ok
    out[hole] = est[hole]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", help="ISNet ONNX (only needed if the cached matte is missing)")
    a = ap.parse_args()
    im = Image.open(PHOTO).convert("RGB")
    W, H = im.size
    if a.model:
        alpha = matte_from_model(im, a.model)
        Image.fromarray((alpha * 255).astype(np.uint8)).save(MATTE)
    alpha = np.array(Image.open(MATTE)).astype(float) / 255
    alpha = clean_matte(alpha)
    # the pink/red shirt of a passer-by shows through the gap between the
    # raised arm and the shoulder: key it out locally (cap/nails are outside
    # this box and have no blue component anyway)
    src = np.array(im).astype(int)
    bx0, by0, bx1, by1 = 450, 795, 540, 895
    reg = src[by0:by1, bx0:bx1]
    key = (reg[..., 0] > 140) & (reg[..., 1] < 95) & (reg[..., 2] > 38) & (reg[..., 0] - reg[..., 1] > 90)
    key &= alpha[by0:by1, bx0:bx1] < 0.85        # only where the matte was unsure
    key = ndimage.binary_dilation(key, iterations=2) & (alpha[by0:by1, bx0:bx1] < 0.97)
    alpha[by0:by1, bx0:bx1] = np.where(key, 0, alpha[by0:by1, bx0:bx1])
    alpha[by0:by1, bx0:bx1] = ndimage.gaussian_filter(alpha[by0:by1, bx0:bx1], 0.6)

    sharp = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))
    rgb = np.array(sharp).astype(float) / 255
    # choke the soft edge ~0.5 px so no background rim survives
    alpha = np.clip((alpha - 0.18) / 0.8, 0, 1)
    fg = blur_fusion_fg(rgb, alpha)
    fg = warm_grade(edge_colour_from_interior(fg, alpha))
    # cut-out cropped to its bounding box
    ys, xs = np.where(alpha > 0.01)
    x0, y0, x1, y1 = max(0, xs.min() - 4), max(0, ys.min() - 4), min(W, xs.max() + 5), min(H, ys.max() + 5)
    rgba = np.dstack([fg, alpha])[y0:y1, x0:x1]
    Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA").save(OUT / "woman_cut.png", optimize=True)

    # clean plate (beach behind her): fill the dilated figure, soften for depth
    hole = ndimage.binary_dilation(alpha > 0.05, iterations=18)
    plate = fill_plate(np.array(im).astype(float) / 255, hole)
    plate = warm_grade(plate)
    pl = Image.fromarray((plate * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
    pl.save(OUT / "woman_plate.jpg", quality=92)

    meta = {
        "w": W, "h": H, "cut": {"src": "woman_cut.png", "x": int(x0), "y": int(y0)},
        "plate": "woman_plate.jpg",
        # landmarks in photo px (for layout)
        "face": [622, 790], "hand": [310, 390], "horizon": 700,
    }
    (ROOT / "project" / "assets" / "woman.js").write_text("window.WOMAN=" + json.dumps(meta) + ";\n")
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
