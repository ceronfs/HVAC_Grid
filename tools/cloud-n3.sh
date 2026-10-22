#!/usr/bin/env bash
# The daily N3 run on a Linux cloud runner (no Edge): install, fetch Playwright's Chromium, draw today's N3 test ship
# and run HVAC Grid on it from the drawings to the outputs. The report is out/n3/<YYYYMMDD>/summary.md (Asia/Seoul date).
#   bash tools/cloud-n3.sh [seed]
set -uo pipefail
cd "$(dirname "$0")/.."
seed="${1:-$(TZ=Asia/Seoul date +%Y%m%d)}"
npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null
npx playwright-core install --with-deps chromium >/dev/null 2>&1 || npx playwright-core install chromium >/dev/null
node test/e2e/n3.e2e.cjs "$seed"
status=$?
echo "----- out/n3/$seed/summary.md -----"
cat "out/n3/$seed/summary.md" 2>/dev/null || echo "(summary.md 없음 — 실행이 시작 전에 멈춤)"
exit $status
