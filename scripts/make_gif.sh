#!/usr/bin/env bash
# usage: scripts/make_gif.sh <frames dir> <output.gif> [fps] [max seconds]
# Assembles the frames written by scripts/record_gif.mjs into a ~960 px wide GIF with the system ffmpeg.
set -e
dir="$1"; out="$2"; fps="${3:-6.45}"; max="${4:-24}"
ffmpeg -y -loglevel error -framerate "$fps" -i "$dir/f%05d.jpg" -t "$max" \
  -vf "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" "$out"
