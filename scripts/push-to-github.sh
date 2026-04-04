#!/usr/bin/env bash
# Usage: bash scripts/push-to-github.sh
# Or:    bash scripts/push-to-github.sh git@github.com:himaparvathia23ec/Hackverse.git
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ORIGIN="${1:-https://github.com/himaparvathia23ec/Hackverse.git}"

git init
git branch -M main

git add -A
if [[ -n "$(git status --porcelain)" ]]; then
  git commit -m "feat: Interview Co-Pilot (frontend + backend API)"
fi

git remote remove origin 2>/dev/null || true
git remote add origin "$ORIGIN"

git fetch origin
if git show-ref --verify --quiet refs/remotes/origin/main 2>/dev/null; then
  git merge origin/main --allow-unrelated-histories -m "Merge remote main (README)" || {
    echo "Merge conflict: fix files, then: git add -A && git commit && git push -u origin main"
    exit 1
  }
fi

git push -u origin main
echo "Done: pushed to $ORIGIN"
