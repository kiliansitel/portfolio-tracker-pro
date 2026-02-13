#!/bin/bash
# Push wiki files to the GitHub Wiki
# Prerequisites: Wiki must be initialized (create first page via GitHub web UI)
# Usage: GH_TOKEN=your_token ./push-to-wiki.sh

set -e
REPO="kiliansitel/portfolio-tracker-pro"
WIKI_DIR="$(dirname "$0")"

if [ -z "$GH_TOKEN" ]; then
  echo "Error: Set GH_TOKEN environment variable"
  exit 1
fi

TMPDIR=$(mktemp -d)
git clone "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.wiki.git" "$TMPDIR"
cp "$WIKI_DIR"/*.md "$TMPDIR/"
cd "$TMPDIR"
git add .
git commit -m "Update wiki documentation" || echo "No changes"
git push
rm -rf "$TMPDIR"
echo "Wiki updated!"
