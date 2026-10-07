# Cia Pink Mov 21 Dias — motion flyer

1080x1920 · 30 fps · 17,47 s (duração exata do áudio) · H.264 + AAC.

## Estrutura
- `index.html` + `flyer.js` — animação em canvas, timeline determinística (`renderFrame(t)`).
  Abra `index.html` num navegador para pré-visualizar com áudio (play/scrub); `?t=9.7` abre num instante.
- `data/audio.json` (+ `audio.js`) — análise do áudio: BPM, batidas, onsets, bandas e espectro mel por frame.
- `assets/` — trilha, logos originais (sem alteração), recorte da mulher (`woman.png`), fontes, texturas procedurais.
- `tools/` — scripts que geram os assets:
  - `analyze_audio.py` (librosa) · `cutout.py` (BiRefNet-portrait + pymatting, a partir do HEIC original) · `gen_textures.py`

## Renderizar
```
pip install librosa rembg onnxruntime pillow-heif pymatting scipy   # só para regenerar assets
npm i playwright                                                     # ou playwright global
node render.mjs --stills 4,8,15      # quadros-chave
node render.mjs --sheet 0.5          # contact sheet
node render.mjs                      # vídeo final -> output/cia-pink-mov-21-dias.mp4
```
Requer ffmpeg no PATH.
