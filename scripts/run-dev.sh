#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8787}"
export PORT="$PORT"

# Dev bypass so we can ship fast locally (matches requireLicense() in server.js)
export BSP_DEV_BYPASS="1"

# Keep a placeholder key so prod paths don't crash if referenced
export BSP_LICENSE_KEY="${BSP_LICENSE_KEY:-dev-bypass}"

# Free the port
PID="$(sudo ss -lptn "sport = :$PORT" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n1 || true)"
if [[ -n "${PID:-}" ]]; then
  echo "[run-dev] killing PID $PID on :$PORT"
  kill "$PID" || sudo kill -9 "$PID"
fi

echo "[run-dev] PORT=$PORT"
echo "[run-dev] BSP_DEV_BYPASS=$BSP_DEV_BYPASS"
exec node server.js
