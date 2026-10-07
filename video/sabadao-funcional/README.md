# Sabadão Funcional 11ª Edição — motion flyer (1080x1920, 30 fps, 15 s)

Timeline em canvas (HTML/JS) determinística: cada frame depende só de `t` e da
análise de áudio em `project/audio.js`.

```bash
pip install psd-tools scipy numpy pillow       # uma vez
python3 tools/build_assets.py                  # PSD + logo -> project/assets/layers
python3 tools/analyze_audio.py project/assets/src/musica.m4a project/audio.json --js
node tools/render.mjs --page project/index.html --workers 4            # -> output/frames
node tools/render.mjs --page project/index.html --out output/keyframes --frames 135,225,390
tools/mux.sh output/frames project/assets/src/musica.m4a output/sabadao-funcional.mp4 30 18
```

Prévia ao vivo: sirva `project/` por HTTP (`npx http-server project`) e abra
`index.html?play` (clique para tocar) ou `index.html?t=7.5` para um frame.

- Textos, tempos (`T` em `js/main.js`, presos às batidas reais) e layout final (`FINAL`) ficam no topo do `main.js`.
- Música: 125,1 BPM; groove em 2,71 s; maior impacto em 6,55 s; final em 8,46 s; última batida em 14,22 s.
