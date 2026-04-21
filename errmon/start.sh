#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  AI Error Monitor — One-click startup script
# ─────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
FRONTEND="$SCRIPT_DIR/frontend"

echo ""
echo "  ◈ AI Error Monitor"
echo "  ───────────────────"
echo ""

# ── Python check ─────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "  ✕  Python 3 not found. Install from https://python.org"
  exit 1
fi
PY=$(python3 --version | awk '{print $2}')
echo "  ✓  Python $PY"

# ── Node check ───────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  ✕  Node.js not found. Install from https://nodejs.org"
  exit 1
fi
NODE=$(node --version)
echo "  ✓  Node $NODE"

# ── Install Python deps ──────────────────────────────────
echo ""
echo "  Installing Python dependencies…"
cd "$BACKEND"
pip3 install -r requirements.txt -q

# ── Build frontend ───────────────────────────────────────
if [ ! -d "$BACKEND/static" ] || [ ! -f "$BACKEND/static/index.html" ]; then
  echo "  Building React frontend…"
  cd "$FRONTEND"
  npm install -q
  npm run build
  echo "  ✓  Frontend built → backend/static/"
else
  echo "  ✓  Frontend already built"
fi

# ── Copy .env if needed ──────────────────────────────────
cd "$BACKEND"
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "  ✓  Created .env from .env.example"
fi

# ── Start server ─────────────────────────────────────────
echo ""
echo "  ✓  Starting server on http://localhost:8000"
echo ""
echo "  Open http://localhost:8000 in your browser."
echo "  Press Ctrl+C to stop."
echo ""

python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
