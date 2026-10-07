# motion-pipeline

Pipeline genérico para vídeos animados sincronizados com música:
**áudio → análise (JSON) → animação HTML/canvas renderizada quadro a quadro → MP4 com áudio.**

| Arquivo | Faz |
|---|---|
| `analyze_audio.py` | BPM, grade de batidas, ataques (onsets) e, por quadro de vídeo, bandas de frequência + RMS + espectro mel → JSON (e `.js` opcional) |
| `render.mjs` | abre a página em Chromium headless e salva cada quadro em PNG (paralelo), ou quadros avulsos / contact sheet |
| `mux.sh` | junta os PNGs + áudio em MP4 H.264/AAC, com a duração exata da sequência |
| `example/index.html` | página mínima que segue o contrato (anel de espectro + barras reagindo ao áudio) |

## Requisitos
```
pip install librosa numpy
npm install            # playwright (usa o Chromium do Playwright; ou CHROMIUM_PATH=/caminho/chromium)
ffmpeg no PATH
```

## Uso
```
# 1. analisar o áudio (--js também gera audio.js para abrir a página via file://)
python3 analyze_audio.py musica.mp3 example/audio.json --js

# 2. conferir: quadros avulsos e contact sheet
node render.mjs --page example/index.html --stills 1,4,8
node render.mjs --page example/index.html --sheet 0.5

# 3. renderizar todos os quadros e montar o vídeo
node render.mjs --page example/index.html --workers 4
./mux.sh output/frames musica.mp3 video.mp4 30 18
```
Opções do `render.mjs`: `--out output  --fps 30  --width 1080 --height 1920  --selector canvas  --duration <s> | --frames <n>  --workers 4  --root <pasta servida>`.
`mux.sh <quadros> <audio|none> <saida.mp4> [fps=30] [crf=18] [padrão=f_%05d.png]`; CRF 16 = master, 20 = versão leve para redes.

## Contrato da página
- `window.ready`: Promise resolvida quando fontes, imagens e dados carregaram.
- `window.renderFrame(t)`: desenha o quadro do tempo `t` (s). **Deve depender só de `t`** (nada de `Date.now`, `Math.random` sem semente ou estado acumulado entre quadros): os quadros são renderizados fora de ordem, em paralelo.
- `window.DURATION` (opcional): duração em segundos, usada quando `--duration`/`--frames` não são passados.
- A página é aberta com `?render=1`; sem esse parâmetro ela pode mostrar preview em tempo real.
- A pasta da página é servida por HTTP local, então caminhos relativos (imagens, fontes, `audio.js`) funcionam.

## Dicas
- Amarre os eventos às batidas do JSON (`beats`, `onsets`) em vez de digitar tempos à mão.
- Para reação suave, misture o quadro atual com 1–2 anteriores (`frames[i]`, `frames[i-1]`...).
- `destination-in` / `source-in` no canvas apagam tudo fora da área desenhada: aplique máscaras numa única chamada `drawImage` do tamanho do quadro.
