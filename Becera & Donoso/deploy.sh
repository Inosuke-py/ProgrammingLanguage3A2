#!/usr/bin/env bash
# One-shot deploy script for Kino on the AWS Ubuntu VPS.
#
# Usage (on the VPS, from any directory):
#   bash /var/www/kino/deploy.sh
#
# What it does:
#   1. git pull the latest from origin/main
#   2. install / sync Python deps inside the existing venv
#   3. rebuild the frontend
#   4. restart the kino-backend systemd service
#   5. reload nginx (no downtime)
#   6. probe /api/health for 10s so you can see it came up clean
#
# Safe to re-run. Bails out at the first error.

set -euo pipefail

# --- Paths --------------------------------------------------------------------
PROJECT_DIR="${PROJECT_DIR:-/var/www/kino}"
VENV_BIN="$PROJECT_DIR/backend/venv/bin"
SERVICE="kino-backend"

# Colors (only when stdout is a tty)
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RED='\033[0;31m'
    NC='\033[0m'
else
    GREEN='' ; YELLOW='' ; RED='' ; NC=''
fi

step()  { printf "${GREEN}==>${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}!!${NC} %s\n" "$*"; }
fail()  { printf "${RED}xx${NC} %s\n" "$*"; exit 1; }

# --- Sanity checks ------------------------------------------------------------
[ -d "$PROJECT_DIR/.git" ] || fail "$PROJECT_DIR is not a git checkout"
[ -d "$VENV_BIN" ] || fail "venv missing at $VENV_BIN -- run python3 -m venv first"

cd "$PROJECT_DIR"

# Refuse to run with uncommitted CONTENT changes (mode-only changes are fine,
# e.g. running chmod +x deploy.sh on the VPS will not block deploy).
if ! git diff --quiet --ignore-submodules HEAD; then
    # There ARE diffs. Filter mode-only ones out by re-running with text only.
    real_changes=$(git diff --name-only --diff-filter=M HEAD | head -5 || true)
    # Compare ignoring exec bit
    if ! git -c core.fileMode=false diff --quiet --ignore-submodules HEAD; then
        warn "Uncommitted content changes detected. Stash or commit them before deploying."
        git status --short
        exit 1
    fi
    # Fall through: only mode bits changed, that's fine
fi

# --- 1. Pull latest -----------------------------------------------------------
step "Pulling latest from origin/main..."
git fetch origin
git reset --hard origin/main

# --- 2. Backend deps ----------------------------------------------------------
step "Syncing backend dependencies..."
"$VENV_BIN/pip" install --quiet --upgrade pip
"$VENV_BIN/pip" install --quiet -r backend/requirements.txt

# --- 3. Frontend build --------------------------------------------------------
step "Building frontend..."
cd "$PROJECT_DIR/frontend"
npm install --silent
npm run build

# --- 4. Restart backend -------------------------------------------------------
step "Restarting $SERVICE..."
sudo systemctl restart "$SERVICE"

# --- 5. Reload nginx ----------------------------------------------------------
step "Reloading nginx..."
sudo nginx -t
sudo systemctl reload nginx

# --- 6. Verify backend came up ------------------------------------------------
step "Waiting for backend health..."
HEALTH_TIMEOUT=30
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
        printf "${GREEN}==> Backend healthy (after ${i}s).${NC}\n"
        break
    fi
    sleep 1
    if [ "$i" -eq "$HEALTH_TIMEOUT" ]; then
        warn "Backend not responding after ${HEALTH_TIMEOUT}s. Check logs:"
        sudo journalctl -u "$SERVICE" -n 30 --no-pager
        exit 1
    fi
done

step "Done. Site: https://mykino.fun"
