#!/usr/bin/env bash
# Serve the site locally. ES modules are blocked by CORS over file://, so the
# site must be served over HTTP even though it is entirely static.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8080}"
echo "Serving on http://localhost:${PORT}  (Ctrl-C to stop)"
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" .
else
  echo "Need python3 or npx on PATH" >&2; exit 1
fi
