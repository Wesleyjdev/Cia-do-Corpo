#!/usr/bin/env bash
# Encode a PNG frame sequence + the original music into an Instagram-ready MP4.
# Usage: tools/mux.sh <frames_dir> <audio> <out.mp4> [fps=30] [crf=18]
# Video length = number of frames / fps; the audio is trimmed to exactly that
# (no other edits to the music).
set -euo pipefail
frames=${1:?frames dir}; audio=${2:?audio file}; out=${3:?output mp4}
fps=${4:-30}; crf=${5:-18}
n=$(find "$frames" -maxdepth 1 -name '*.png' | wc -l)
dur=$(awk -v n="$n" -v f="$fps" 'BEGIN { printf "%.4f", n / f }')
mkdir -p "$(dirname "$out")"
ffmpeg -v error -stats -y \
  -framerate "$fps" -i "$frames/%05d.png" \
  -i "$audio" \
  -map 0:v:0 -map 1:a:0 -t "$dur" \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf "$crf" -profile:v high -level 4.1 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 256k -ar 48000 \
  -movflags +faststart "$out"
echo "$out: $n frames @ ${fps}fps = ${dur}s"
