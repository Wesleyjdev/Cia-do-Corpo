# Sabadão Funcional 11ª Edição — motion flyer (1080x1920, 30 fps, 15 s)

Timeline em canvas (HTML/JS) determinística: cada frame depende só de `t` e da
análise de áudio em `project/audio.js`.

```bash
pip install psd-tools scipy numpy pillow       # uma vez
python3 tools/build_assets.py                  # PSD + logo -> project/assets/layers
python3 tools/build_woman.py                   # recorte + fundo limpo da foto dela (usa o matte salvo)
python3 tools/analyze_audio.py project/assets/src/musica.m4a project/audio.json --js
node tools/render.mjs --page project/index.html --workers 4            # -> output/frames
node tools/render.mjs --page project/index.html --out output/keyframes --frames 135,225,390
tools/mux.sh output/frames project/assets/src/musica.m4a output/sabadao-funcional.mp4 30 18
```

Prévia ao vivo: sirva `project/` por HTTP (`npx http-server project`) e abra
`index.html?play` (clique para tocar) ou `index.html?t=7.5` para um frame.

- v2: o relance usa `assets/src/foto_mulher.jpg`. O matte (`foto_mulher_matte.png`) foi gerado
  com o modelo ISNet que vem no pacote npm `@imgly/background-removal-node` (rodado offline):
  `python3 tools/build_woman.py --model <medium.onnx>` refaz o matte; sem `--model` reaproveita o salvo.
  Layout do portal (círculo, escala e posição dela) em `PORTAL` no `main.js`; só a cena da
  mulher (`sceneWoman`) mudou em relação à v1, transições e demais cenas são as aprovadas.
- Textos, tempos (`T` em `js/main.js`, presos às batidas reais) e layout final (`FINAL`) ficam no topo do `main.js`.
- Música: 125,1 BPM; groove em 2,71 s; maior impacto em 6,55 s; final em 8,46 s; última batida em 14,22 s.

## Reel com fala (IMG_1688.MOV), 26 s

```bash
python3 reel/tools/reel_prep.py            # frames SDR do bruto + EDL + mix de áudio (voz/música)
node tools/render.mjs --page project/reel.html --workers 4 --out output/reel_frames
tools/mux.sh output/reel_frames reel/work/mix.wav output/sabadao-funcional-reel-fala-v2.mp4 30 18
```

Fontes (fora do git): `project/assets/src/IMG_1688.MOV` e `project/assets/src/toca_o_trompete.mp3`.
Cortes, transições, legendas, destaques e chips ficam no topo de `project/js/reel.js`;
os trechos de fala, em `SEGMENTS` no `reel_prep.py`. A arte final é a do vídeo de 15 s (`window.SF`).

## Assets em loop com alfa (30 s, loop perfeito)

```bash
for a in logo_orange logo_white leaves; do
  node tools/render.mjs --page project/loop_assets.html --workers 4 --out output/loop_assets/png_$a --from 0 --to 899 --query asset=$a
done
```
`window.SF_LOOP = 30` (em `loop_assets.html`) ajusta cada período de movimento ao divisor exato de 30 s mais próximo;
sem ele, `main.js` usa os períodos originais (vídeos aprovados inalterados). Codificação: ProRes 4444
(`prores_ks -profile:v 4 -pix_fmt yuva444p10le`), WebM VP9 `yuva420p` (leve, crf 26, e `_alfa_exato`, lossless) e PNG.
