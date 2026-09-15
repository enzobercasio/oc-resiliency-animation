#!/usr/bin/env bash
# Serve the site locally. ES modules are blocked by CORS over file://, so the
# site must be served over HTTP even though it is entirely static.
#
# Caching is disabled on every response: plain `python3 -m http.server` sends
# no Cache-Control header, so browsers apply heuristic caching to the JS
# modules. During active editing that serves a stale module on a normal
# reload with no console error - it looks exactly like a broken feature.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8080}"
echo "Serving on http://localhost:${PORT}  (Ctrl-C to stop)"
if command -v python3 >/dev/null 2>&1; then
  exec python3 -c '
import http.server, socketserver, sys
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", int(sys.argv[1])), Handler) as httpd:
    httpd.serve_forever()
' "$PORT"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" .
else
  echo "Need python3 or npx on PATH" >&2; exit 1
fi
