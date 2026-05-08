#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

mkdir -p "$LOG_DIR"

is_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

start_backend() {
  if [[ -f "$BACKEND_PID_FILE" ]]; then
    local pid
    pid="$(cat "$BACKEND_PID_FILE")"
    if is_running "$pid"; then
      echo "Backend already running (pid $pid)"
      return
    fi
  fi

  echo "Starting backend..."
  (
    cd "$ROOT_DIR/backend"
    nohup npm run dev >"$LOG_DIR/backend.log" 2>&1 &
    echo $! >"$BACKEND_PID_FILE"
  )
  echo "Backend started (pid $(cat "$BACKEND_PID_FILE"))"
}

start_frontend() {
  if [[ -f "$FRONTEND_PID_FILE" ]]; then
    local pid
    pid="$(cat "$FRONTEND_PID_FILE")"
    if is_running "$pid"; then
      echo "Frontend already running (pid $pid)"
      return
    fi
  fi

  echo "Starting frontend..."
  (
    cd "$ROOT_DIR/frontend"
    nohup npm run dev >"$LOG_DIR/frontend.log" 2>&1 &
    echo $! >"$FRONTEND_PID_FILE"
  )
  echo "Frontend started (pid $(cat "$FRONTEND_PID_FILE"))"
}

start_backend
start_frontend

echo ""
echo "Services launched."
echo "- Backend:  http://localhost:3001"
echo "- Frontend: http://127.0.0.1:5173"
echo "Logs: $LOG_DIR"
