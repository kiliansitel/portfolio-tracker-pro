#!/bin/bash
# Auto-deploy script for Portfolio Tracker Pro
# Checks for new commits and deploys beta + prod
# Run via cron: */5 * * * * /home/skynet/.openclaw/workspace/portfolio-tracker-beta/scripts/auto-deploy.sh

BETA_DIR="/home/skynet/.openclaw/workspace/portfolio-tracker-beta"
PROD_DIR="/home/skynet/.openclaw/workspace/portfolio-tracker"
LOG="/tmp/auto-deploy.log"

deploy_branch() {
    local dir=$1
    local service=$2
    local label=$3
    
    cd "$dir" || return 1
    
    # Fetch latest
    git fetch origin 2>/dev/null
    
    # Check if behind
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)
    
    if [ "$LOCAL" = "$REMOTE" ]; then
        return 0  # Already up to date
    fi
    
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$label] Deploying $LOCAL → $REMOTE" >> "$LOG"
    
    git pull origin main 2>&1 >> "$LOG"
    
    # Install deps if package.json changed
    if git diff "$LOCAL" "$REMOTE" --name-only | grep -q "package.json"; then
        cd server && npm ci --production 2>&1 >> "$LOG"
        cd ..
    fi
    
    sudo systemctl restart "$service" 2>&1 >> "$LOG"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$label] Deploy complete" >> "$LOG"
}

deploy_branch "$BETA_DIR" "portfolio-tracker-beta.service" "BETA"
deploy_branch "$PROD_DIR" "portfolio-tracker.service" "PROD"
