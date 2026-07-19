#!/usr/bin/env bash
# package.sh — build a clean Chrome Web Store ZIP containing ONLY the files the
# extension needs at runtime. Dev tooling, docs, and the catalog cache are excluded.
#
# Usage: ./package.sh
# Output: dist/url-param-cleaner-v<version>.zip
set -euo pipefail

cd "$(dirname "$0")"

# Files that ship inside the extension. Anything not listed here is excluded.
SHIP=(
  manifest.json
  rules.json
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
)

# Fail early if anything is missing.
for f in "${SHIP[@]}"; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f" >&2; exit 1; }
done

VERSION="$(node -p "require('./manifest.json').version")"
OUT="dist/url-param-cleaner-v${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

# -X strips extra macOS metadata; keeps the archive minimal and reproducible.
zip -X -q "$OUT" "${SHIP[@]}"

echo "Built $OUT"
echo "Contents:"
unzip -l "$OUT"
