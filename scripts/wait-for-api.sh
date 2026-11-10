#!/usr/bin/env bash
# Health check before a run: poll GET /ping until restful-booker answers.
#   scripts/wait-for-api.sh [base-url] [attempts]
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:3001}}"
ATTEMPTS="${2:-30}"

for i in $(seq 1 "$ATTEMPTS"); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE_URL/ping" || true)
  if [ "$code" = "201" ]; then
    echo "restful-booker is up at $BASE_URL (attempt $i)"
    exit 0
  fi
  echo "waiting for $BASE_URL/ping (attempt $i/$ATTEMPTS, got ${code:-no response})"
  sleep 2
done

echo "restful-booker did not become healthy at $BASE_URL" >&2
exit 1
