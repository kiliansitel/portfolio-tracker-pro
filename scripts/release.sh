#!/bin/bash
# Portfolio Tracker Pro — Automated Release Script
# Usage: ./scripts/release.sh <version> <codename> <description>
# Example: ./scripts/release.sh 0.18.0 "Chain" "Options chain viewer"

set -e

VERSION="$1"
CODENAME="$2"
DESC="$3"

if [ -z "$VERSION" ] || [ -z "$CODENAME" ] || [ -z "$DESC" ]; then
  echo "Usage: ./scripts/release.sh <version> <codename> <description>"
  echo "Example: ./scripts/release.sh 0.18.0 Chain 'Options chain viewer'"
  exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "🚀 Portfolio Tracker Pro — Release v${VERSION} \"${CODENAME}\""
echo "=================================================="

# Step 1: Bump package.json
echo ""
echo "📦 Step 1: Bumping package.json to v${VERSION}..."
cd server
npm version "$VERSION" --no-git-tag-version
cd ..
echo "   ✅ package.json updated"

# Step 2: Update version badge in README
echo ""
echo "📝 Step 2: Updating README.md version badge..."
sed -i "s/version-[0-9]*\.[0-9]*\.[0-9]*/version-${VERSION}/" README.md
echo "   ✅ README badge updated"

# Step 3: Remind about manual checks
echo ""
echo "⚠️  MANUAL CHECKS REQUIRED:"
echo "   - [ ] VERSIONS.md — add v${VERSION} \"${CODENAME}\" entry"
echo "   - [ ] README.md — Tech Stack (if deps changed)"
echo "   - [ ] README.md — Features (if new features)"
echo "   - [ ] README.md — API Endpoints (if new endpoints)"
echo "   - [ ] README.md — Version History"
echo "   - [ ] README.md — Roadmap checkboxes"
echo ""
echo "🧪 Step 4: ASK KILIAN TO TEST before continuing!"
echo ""
read -p "Has Kilian confirmed it works? (y/N): " CONFIRMED
if [ "$CONFIRMED" != "y" ] && [ "$CONFIRMED" != "Y" ]; then
  echo "❌ Aborted. Get Kilian's approval first!"
  exit 1
fi

# Step 5: Git commit
echo ""
echo "📦 Step 5: Committing..."
git add -A
git commit -m "v${VERSION} \"${CODENAME}\" — ${DESC}"

# Step 6: Tag
echo ""
echo "🏷️  Step 6: Creating tag v${VERSION}..."
git tag "v${VERSION}"

# Step 7: Push
echo ""
echo "🚀 Step 7: Pushing to GitHub..."
git push origin main
git push origin "v${VERSION}"

echo ""
echo "✅ Release v${VERSION} \"${CODENAME}\" pushed!"
echo ""
echo "📋 Remaining steps:"
echo "   - [ ] Create GitHub Release via API"
echo "   - [ ] Verify CI passes"
echo "   - [ ] Verify Docker Hub updated"
echo ""
echo "🎉 Done!"
