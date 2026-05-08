#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

stop_by_pid_file() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name pid file not found, skipping"
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "Stopping $name (pid $pid)..."
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  else
    echo "$name process not running (stale pid file)"
  fi

  rm -f "$pid_file"
}

# Fallback by known ports in case processes were started outside scripts
stop_by_port() {
  local name="$1"
  local port="$2"
  local pids
  pids="$(lsof -ti tcp:"$port" || true)"
  if [[ -n "$pids" ]]; then
    echo "Stopping $name by port $port (pid(s): $pids)..."
    kill $pids >/dev/null 2>&1 || true
  fi
}

stop_by_pid_file "Backend" "$BACKEND_PID_FILE"
stop_by_pid_file "Frontend" "$FRONTEND_PID_FILE"

stop_by_port "Backend" 3001
stop_by_port "Frontend" 5173

echo "Done."
