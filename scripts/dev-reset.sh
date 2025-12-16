#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8787}"

echo "[dev-reset] stopping anything on :$PORT ..."
PID="$(sudo ss -lptn "sport = :$PORT" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n1 || true)"
if [[ -n "${PID:-}" ]]; then
  echo "[dev-reset] kill $PID"
  kill "$PID" || sudo kill -9 "$PID"
fi

echo "[dev-reset] starting server on :$PORT ..."
export PORT="$PORT"
node server.js
