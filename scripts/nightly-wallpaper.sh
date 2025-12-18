#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/input-image.(png|jpg)"
  exit 1
fi

IN="$1"
if [[ ! -f "$IN" ]]; then
  echo "Input not found: $IN"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATERMARK="$ROOT/assets/watermarks/bayoufinds-handle.png"
OUTDIR="$ROOT/output/nightly"
mkdir -p "$OUTDIR"

if [[ ! -f "$WATERMARK" ]]; then
  echo "Missing watermark PNG: $WATERMARK"
  echo "Run: flatpak run org.inkscape.Inkscape assets/watermarks/bayoufinds-handle.svg --export-type=png --export-filename=assets/watermarks/bayoufinds-handle.png --export-width=1600 --export-background-opacity=0"
  exit 1
fi

# Output naming: nightly_YYYY-MM-DD_HHMM.png
STAMP="$(date +"%Y-%m-%d_%H%M")"
ZIP="$OUTDIR/nightly_${STAMP}.zip"
FINAL="$OUTDIR/nightly_${STAMP}.png"

# Requirements:
# - Server running at http://localhost:8787
# - API supports: image, logo, position, size, opacity, margin
# - We'll request 1080x1080 output if your API supports output sizing; otherwise it will keep original.
#
# NOTE: If your server doesn't resize, we'll still watermark correctly.
curl -s -L \
  -F "image=@${IN}" \
  -F "logo=@${WATERMARK}" \
  -F "position=bottom-right" \
  -F "size=small" \
  -F "opacity=0.85" \
  -F "margin=24" \
  http://localhost:8787/api/generate \
  -o "$ZIP"

# Extract the "best" png from the zip (first png found)
TMP="$(mktemp -d)"
unzip -qq "$ZIP" -d "$TMP"

FOUND="$(find "$TMP" -type f -iname "*.png" | head -n 1 || true)"
if [[ -z "$FOUND" ]]; then
  echo "No PNG found inside zip: $ZIP"
  echo "Zip contents:"
  unzip -l "$ZIP" | sed -n '1,120p'
  rm -rf "$TMP"
  exit 1
fi

cp -f "$FOUND" "$FINAL"
rm -rf "$TMP"

echo "✅ Done:"
echo "   $FINAL"
