#!/usr/bin/env bash
# Run k6 load test via Docker — no local k6 install needed.
# Usage:
#   ./load.sh                          # full 2m / 50 VUs run
#   ./load.sh --vus 5 --duration 30s   # override (passed to k6)
#   BASE_URL=http://localhost:8083 ./load.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${BASE_URL:-http://localhost:8083}"
OUT_FILE="${OUT_FILE:-$SCRIPT_DIR/results.json}"

docker run --rm -i \
  --network=host \
  -v "$SCRIPT_DIR:/scripts" \
  -e "BASE_URL=$BASE_URL" \
  grafana/k6 run /scripts/claims-load.js "$@"

echo ""
echo "Done. Target was: $BASE_URL"
echo "Tip: JSON export -> OUT_FILE=results.json ./load.sh --out json=/scripts/results.json"
