#!/bin/bash
# BlobFX local dev server for Playwright testing
# Usage: ./serve.sh [port]
PORT=${1:-8080}

# Kill existing server on this port
lsof -ti:$PORT | xargs kill -9 2>/dev/null

echo "Starting BlobFX server on http://localhost:$PORT"
echo "Press Ctrl+C to stop"
python3 -m http.server $PORT --directory "$(dirname "$0")"
