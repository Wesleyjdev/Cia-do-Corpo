"""Background clean plate: the gym from the original photo, without the woman.

HEIC -> woman matte (BiRefNet-general) + background-person matte (Apple portrait matte
        embedded in the HEIC, blobs away from the woman)
     -> LaMa inpainting (big-lama TorchScript) at 384x512 (best fill for big holes on bokeh)
     -> upscaled fill composited into the full-res photo, softened inside the hole only
     -> 9:16 cover crop (no stretching) -> assets/bg_plate_raw.jpg
     -> grade: ~35 % brightness, light magenta tint -> assets/bg_plate.jpg
Bottom gradient and vignette are applied live in flyer.js (they stay fixed to the frame).

Usage: python3 tools/clean_plate.py IMG_0244.HEIC assets/
Model: https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt
       -> ~/.cache/lama/big-lama.pt   (needs torch)
"""
import sys
from pathlib import Path

import numpy as np
import pillow_heif
import torch
from PIL import Image, ImageFilter, ImageOps
from rembg import new_session, remove
from scipy import ndimage

pillow_heif.register_heif_opener()
src, out = sys.argv[1], Path(sys.argv[2])
LAMA = Path.home() / ".cache/lama/big-lama.pt"

heif = pillow_heif.open_heif(src)
im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
W0, H0 = im.size

# woman: largest subject blob
m = np.asarray(remove(im, session=new_session("birefnet-general"), only_mask=True), float) / 255
lab, n = ndimage.label(m > 0.4)
woman = lab == np.argmax(np.bincount(lab.ravel())[1:]) + 1 if n else m > 0.4
woman |= (m > 0.08) & ndimage.binary_dilation(woman, iterations=20)
# other people: Apple portrait-effects matte blobs that are not the woman
aux = heif[0].info["aux"]["urn:com:apple:photo:2018:aux:portraiteffectsmatte"][0]
a = heif[0].get_aux_image(aux)
apple = Image.frombytes("L", a.size, bytes(a.data), "raw", "L", a.stride).resize((W0, H0))
other = (np.asarray(apple) > 76) & ~ndimage.binary_dilation(woman, iterations=150)
lab, n = ndimage.label(other)
cnt = np.bincount(lab.ravel())
people = np.isin(lab, [i for i in range(1, n + 1) if cnt[i] > 20000])
hole = ndimage.binary_dilation(woman, iterations=70) | ndimage.binary_dilation(people, iterations=110)

WK = (384, 512)
img_s = np.asarray(im.resize(WK, Image.LANCZOS), np.float32) / 255
hole_im = Image.fromarray((hole * 255).astype(np.uint8))
m_s = (np.asarray(hole_im.resize(WK, Image.BILINEAR), np.float32) / 255 > 0.1).astype(np.float32)
model = torch.jit.load(str(LAMA), map_location="cpu").eval()
with torch.no_grad():
    r = model(torch.from_numpy(img_s).permute(2, 0, 1)[None], torch.from_numpy(m_s)[None, None])
fill = Image.fromarray((r[0].permute(1, 2, 0).clamp(0, 1).numpy() * 255).astype(np.uint8))
fill = fill.resize((W0, H0), Image.LANCZOS).filter(ImageFilter.GaussianBlur(14))   # fill matches the bokeh
soft = hole_im.filter(ImageFilter.GaussianBlur(30))
plate = Image.composite(fill, im, soft)

cw = round(H0 * 9 / 16)
x0 = (W0 - cw) // 2
plate = plate.crop((x0, 0, x0 + cw, H0)).resize((1240, 2204), Image.LANCZOS)
plate.save(out / "bg_plate_raw.jpg", quality=93)

# grade: ~35 % brightness, light magenta cast, colours kept
p = np.asarray(plate, np.float32) / 255
p = p * 0.35
tint = np.array([1.06, 0.90, 1.05])
p = p * tint + np.array([0.012, 0.0, 0.008])
Image.fromarray((np.clip(p, 0, 1) * 255).astype(np.uint8)).save(out / "bg_plate.jpg", quality=93)
print("plate", plate.size)
