#!/usr/bin/env bash
# Collect fresh headlines, build the static site and zip it for upload: npm run package
# Extract bartaboard.zip into the site's root folder (e.g. public_html); no Node.js needed there.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run fetch
npm run build

OUT="bartaboard.zip"
rm -f "$OUT"
# Includes .htaccess, which the share links and 404 page need.
(cd out && zip -qr -X "../$OUT" . -x "*.DS_Store")
echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
