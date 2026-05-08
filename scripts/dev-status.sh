#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

show_status() {
  local name="$1"
  local pid_file="$2"
  local port="$3"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" >/dev/null 2>&1; then
      echo "$name: running (pid $pid, port $port)"
      return
    fi
    echo "$name: pid file exists but process is not running"
    return
  fi

  local pids
  pids="$(lsof -ti tcp:"$port" || true)"
  if [[ -n "$pids" ]]; then
    echo "$name: running by port (pid(s): $pids, port $port)"
  else
    echo "$name: stopped"
  fi
}

show_status "Backend" "$BACKEND_PID_FILE" 3001
show_status "Frontend" "$FRONTEND_PID_FILE" 5173
