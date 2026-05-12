#!/bin/bash
set -e

PROJECT="slide-generate-tool"
DEV_VARS=".dev.vars"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo ""
  echo "  ⚠ コミットされていない変更があります:"
  echo ""
  git status --short
  echo ""
  read -p "  このまま続行しますか？ (y/N): " answer
  if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
    echo "  中止しました。先にコミットしてから再実行してください。"
    exit 1
  fi
fi

# Build
echo "Building..."
npm run build

# Deploy
echo "Deploying to Cloudflare Pages..."
COMMIT_MSG=$(git log -1 --format="%h %s" | LC_ALL=C tr -cd '[:print:] ' | head -c 100)
[ -z "$COMMIT_MSG" ] && COMMIT_MSG="deploy"
wrangler pages deploy dist --project-name "$PROJECT" --commit-message "$COMMIT_MSG"

# Sync secrets from .dev.vars
if [ -f "$DEV_VARS" ]; then
  echo "Syncing secrets from $DEV_VARS..."
  while IFS='=' read -r key value; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    # Trim whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)
    [ -z "$key" ] && continue
    echo "$value" | wrangler pages secret put "$key" --project-name "$PROJECT"
    echo "  ✓ $key"
  done < "$DEV_VARS"
fi

# Git push
echo "Pushing to remote..."
git push -u origin main

echo ""
echo "Deploy complete!"
