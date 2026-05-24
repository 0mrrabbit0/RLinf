#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUI_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== RLinf Studio Dev Mode ==="

# 1. Start FastAPI backend
echo "[1/2] Starting FastAPI backend on :18721 ..."
cd "$GUI_DIR/backend"
if [ ! -f ".venv/bin/activate" ]; then
    echo "  Creating Python venv..."
    rm -rf .venv
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip 2>&1 | tail -1
    pip install -e . 2>&1 | tail -5
else
    source .venv/bin/activate
fi
echo "  Python: $(which python) ($(python --version 2>&1))"
uvicorn main:app --host 0.0.0.0 --port 18721 --reload &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# 2. Start Vite dev server (frontend only, no Tauri shell needed for dev)
echo "[2/2] Starting Vite frontend on :1420 ..."
cd "$GUI_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "  Installing npm deps..."
    npm install 2>&1 | tail -5
fi
npx vite --port 1420 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

echo ""
echo "=== Dev servers running ==="
echo "  Backend:  http://localhost:18721/docs  (FastAPI Swagger)"
echo "  Frontend: http://localhost:1420        (Vite dev server)"
echo ""
echo "Press Ctrl+C to stop all."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
