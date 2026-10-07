#!/usr/bin/env bash
# Monta o MP4 (H.264 + AAC) a partir da sequência de quadros e do áudio.
# A duração do vídeo é a da sequência (quadros / fps); o áudio é cortado nela.
#
#   ./mux.sh <pasta_quadros> <audio|none> <saida.mp4> [fps=30] [crf=18] [padrão=f_%05d.png]
#
# crf: 16 = master (arquivo grande), 18 = padrão, 20 = leve para redes (~10 MB por 17 s em 1080x1920)
set -euo pipefail
[ $# -ge 3 ] || { sed -n '2,7p' "$0"; exit 1; }
FRAMES=$1 AUDIO=$2 OUT=$3 FPS=${4:-30} CRF=${5:-18} PATTERN=${6:-f_%05d.png}

N=$(find "$FRAMES" -maxdepth 1 -name "${PATTERN%%%*}*" | wc -l)
[ "$N" -gt 0 ] || { echo "nenhum quadro em $FRAMES" >&2; exit 1; }
DUR=$(awk -v n="$N" -v f="$FPS" 'BEGIN { printf "%.4f", n / f }')

AUDIO_IN=() AUDIO_OPT=(-an)
if [ "$AUDIO" != "none" ]; then
  AUDIO_IN=(-i "$AUDIO")
  AUDIO_OPT=(-map 0:v -map 1:a -c:a aac -b:a 256k)
fi

ffmpeg -y -loglevel error -framerate "$FPS" -i "$FRAMES/$PATTERN" "${AUDIO_IN[@]}" "${AUDIO_OPT[@]}" \
  -c:v libx264 -preset slow -crf "$CRF" -profile:v high -pix_fmt yuv420p \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -t "$DUR" -movflags +faststart "$OUT"

echo "$OUT: $N quadros, ${DUR}s @ ${FPS} fps, crf $CRF ($(du -h "$OUT" | cut -f1))"
