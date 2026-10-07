"""Woman cutout from the original HEIC (not from the flyer art).

BiRefNet-portrait matte (rembg) -> keep main subject component -> 1px choke
-> pymatting foreground estimation (removes background colour spill / halos).

Usage: python3 tools/cutout.py IMG_0244.HEIC assets/woman.png
"""
import sys

import numpy as np
import pillow_heif
from PIL import Image, ImageFilter, ImageOps
from pymatting import estimate_foreground_ml
from rembg import new_session, remove
from scipy import ndimage

pillow_heif.register_heif_opener()
src, dst = sys.argv[1], sys.argv[2]
im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
crop = im.crop((800, 800, 3300, 4900))           # head -> upper thighs
mask = remove(crop, session=new_session("birefnet-portrait"), only_mask=True)

OUT_W = 1500
size = (OUT_W, round(crop.height * OUT_W / crop.width))
img = np.asarray(crop.resize(size, Image.LANCZOS), dtype=np.float64) / 255
a = np.asarray(mask.resize(size, Image.LANCZOS), dtype=np.float64) / 255

# keep only the largest connected subject (drops stray background blobs)
lab, n = ndimage.label(a > 0.5)
if n > 1:
    keep = lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)
    keep = ndimage.binary_dilation(keep, iterations=6)
    a = a * keep
# gentle choke: shave the outermost semi-transparent pixel ring
a = np.clip((a - 0.06) / 0.94, 0, 1)
a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)),
               dtype=np.float64) / 255 * 0.5 + a * 0.5

fg = estimate_foreground_ml(img, a)
rgba = np.dstack([np.clip(fg, 0, 1), a])
Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(dst, optimize=True)
print("saved", dst, size)
