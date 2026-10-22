#!/usr/bin/env bash
# The daily N3 run on a Linux cloud runner (no Edge): install, find a Chromium, draw today's N3 test ship and run
# HVAC Grid on it from the drawings to the outputs. The report is out/n3/<YYYYMMDD>/summary.md (Asia/Seoul date).
#   bash tools/cloud-n3.sh [seed]
# The browser: HVAC_GRID_BROWSER_PATH if set; else a Chromium already on the runner (Playwright's browser folder,
# PLAYWRIGHT_BROWSERS_PATH or /opt/pw-browsers - the cloud runner blocks the Playwright download host); else download.
set -uo pipefail
cd "$(dirname "$0")/.."
seed="${1:-$(TZ=Asia/Seoul date +%Y%m%d)}"
npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null
if [ -z "${HVAC_GRID_BROWSER_PATH:-}" ]; then
 for dir in "${PLAYWRIGHT_BROWSERS_PATH:-}" /opt/pw-browsers "$HOME/.cache/ms-playwright"; do
  [ -n "$dir" ] && [ -d "$dir" ] || continue
  found="$(find "$dir" -maxdepth 3 -type f \( -path '*chromium-*/chrome-linux*/chrome' -o -path '*chromium-*/chrome-linux*/chromium' \) 2>/dev/null | sort -V | tail -1)"
  if [ -n "$found" ]; then export HVAC_GRID_BROWSER_PATH="$found"; break; fi
 done
fi
if [ -z "${HVAC_GRID_BROWSER_PATH:-}" ]; then
 npx playwright-core install --with-deps chromium >/dev/null 2>&1 || npx playwright-core install chromium >/dev/null 2>&1 || echo "브라우저 내려받기 실패 — Chromium이 없으면 실행이 멈춥니다"
fi
echo "browser: ${HVAC_GRID_BROWSER_PATH:-Playwright Chromium}"
node test/e2e/n3.e2e.cjs "$seed"
status=$?
echo "----- out/n3/$seed/summary.md -----"
cat "out/n3/$seed/summary.md" 2>/dev/null || echo "(summary.md 없음 — 실행이 시작 전에 멈춤)"
exit $status
