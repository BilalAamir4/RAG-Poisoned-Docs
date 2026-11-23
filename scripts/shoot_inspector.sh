#!/bin/bash
# usage: scripts/shoot_inspector.sh <outdir> [base_url]   (vite on :5173, headless Chrome, 1440x900)
OUT="$1"; BASE="${2:-http://localhost:5173}"
WOUT="$(cygpath -w "$(realpath "$OUT")")"
WTMP="$(cygpath -w "$TEMP")"
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
for r in trace chat documents audit replay test-runs settings; do
  FILE="${WOUT}\\${r}.png"
  "$CH" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --virtual-time-budget=8000 \
    --user-data-dir="${WTMP}\\chr_${r}" --screenshot="$FILE" "${BASE}/#/${r}" >/dev/null 2>&1
done
ls "$OUT"
