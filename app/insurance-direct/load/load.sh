#!/usr/bin/env bash
# Telemetry load in two phases, run one after another:
#   Phase 1 — k6 API load via Docker (bulk traces/metrics/logs).
#   Phase 2 — Playwright browser smoke, VISIBLE window (realistic UI traffic).
#
# Usage:
#   ./load.sh                          # full k6 run + headed browser smoke
#   ./load.sh --skip-k6                # only the browser phase
#   ./load.sh --skip-browser           # only k6
#   ./load.sh --headless               # browser phase without visible window
#   ./load.sh --browser-duration 120   # seconds for browser phase (default 90)
#   ./load.sh --vus 5 --duration 30s   # any other args are forwarded to k6
#   BASE_URL=http://localhost:8083 ./load.sh
#
# Env overrides:
#   BASE_URL, WEB_URL (default http://localhost:5173), OUT_FILE,
#   SKIP_K6 / SKIP_BROWSER (0/1), HEADED (default 1),
#   BROWSER_DURATION_S (default 90), SLOWMO_MS (default 150)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${BASE_URL:-http://localhost:8083}"
WEB_URL="${WEB_URL:-http://localhost:5173}"
OUT_FILE="${OUT_FILE:-$SCRIPT_DIR/results.json}"
WEB_DIR="$SCRIPT_DIR/../insurance-web"

SKIP_K6="${SKIP_K6:-0}"
SKIP_BROWSER="${SKIP_BROWSER:-0}"
HEADED="${HEADED:-1}"
BROWSER_DURATION_S="${BROWSER_DURATION_S:-90}"
SLOWMO_MS="${SLOWMO_MS:-150}"

K6_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-k6) SKIP_K6=1; shift ;;
    --skip-browser) SKIP_BROWSER=1; shift ;;
    --headless) HEADED=0; shift ;;
    --browser-duration) BROWSER_DURATION_S="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) K6_ARGS+=("$1"); shift ;;
  esac
done

K6_STATUS=0
BROWSER_STATUS=0

if [ "$SKIP_K6" != "1" ]; then
  echo "=== Phase 1/2: k6 API load (target: $BASE_URL) ==="
  docker run --rm -i \
    --network=host \
    -v "$SCRIPT_DIR:/scripts" \
    -e "BASE_URL=$BASE_URL" \
    grafana/k6 run /scripts/claims-load.js "${K6_ARGS[@]}" || K6_STATUS=$?
  echo ""
else
  echo "=== Phase 1/2: k6 skipped ==="
fi

if [ "$SKIP_BROWSER" != "1" ]; then
  echo "=== Phase 2/2: Playwright browser smoke (${BROWSER_DURATION_S}s, target: $WEB_URL) ==="
  if [ ! -d "$WEB_DIR/node_modules/@playwright/test" ]; then
    echo "Playwright is not installed in insurance-web. Run first:"
    echo "  cd $WEB_DIR && npm i && npx playwright install chromium"
    BROWSER_STATUS=1
  else
    if [ "$HEADED" = "1" ] && [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
      echo "No display detected (DISPLAY/WAYLAND_DISPLAY unset) — falling back to headless."
      echo "Force headless explicitly next time with: ./load.sh --headless"
      HEADED=0
    fi
    if ! curl -s -m 5 -o /dev/null "$WEB_URL"; then
      echo "WARNING: $WEB_URL is not reachable. Is insurance-web running?"
    fi
    (
      cd "$WEB_DIR" && \
        WEB_URL="$WEB_URL" \
        LOAD_DURATION_S="$BROWSER_DURATION_S" \
        LOAD_WORKERS=1 \
        LOAD_HEADED="$HEADED" \
        LOAD_SLOWMO_MS="$SLOWMO_MS" \
        LOAD_THINK_MIN_MS="${LOAD_THINK_MIN_MS:-200}" \
        LOAD_THINK_MAX_MS="${LOAD_THINK_MAX_MS:-800}" \
        npx playwright test --project=browser
    ) || BROWSER_STATUS=$?
  fi
else
  echo "=== Phase 2/2: browser smoke skipped ==="
fi

echo ""
echo "Done. k6 exit=$K6_STATUS browser exit=$BROWSER_STATUS (target was: $BASE_URL)"
echo "Tip: JSON export -> OUT_FILE=results.json ./load.sh --out json=/scripts/results.json"

if [ "$K6_STATUS" -ne 0 ]; then exit "$K6_STATUS"; fi
exit "$BROWSER_STATUS"
