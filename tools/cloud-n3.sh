#!/usr/bin/env bash
# The daily N3 run on a Linux cloud runner (no Edge): install, find a Chromium, draw today's N3 test ship and run
# HVAC Grid on it from the drawings to the outputs. The report is out/n3/<YYYYMMDD>/summary.md and the PowerPoint
# N3_report_<YYYYMMDD>.pptx (Asia/Seoul date).
#   bash tools/cloud-n3.sh [seed] [--publish]
# --publish: the report (pptx, summary.md, the step captures) replaces the content of the branch claude/n3-report -
# one commit, force-pushed, so the branch holds the latest report and the repository does not grow day by day.
# The browser: HVAC_GRID_BROWSER_PATH if set; else a Chromium already on the runner (Playwright's browser folder,
# PLAYWRIGHT_BROWSERS_PATH or /opt/pw-browsers - the cloud runner blocks the Playwright download host); else download.
set -uo pipefail
cd "$(dirname "$0")/.."
seed="" publish=0
for a in "$@"; do case "$a" in --publish) publish=1 ;; *) seed="$a" ;; esac; done
seed="${seed:-$(TZ=Asia/Seoul date +%Y%m%d)}"
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
out="out/n3/$seed"
echo "----- $out/summary.md -----"
cat "$out/summary.md" 2>/dev/null || echo "(summary.md 없음 — 실행이 시작 전에 멈춤)"
if [ "$publish" = 1 ] && [ -d "$out" ]; then
 wt="$(mktemp -d)/report"
 if git worktree add --detach "$wt" >/dev/null 2>&1; then
  ( cd "$wt" && git checkout -q --orphan claude/n3-report && git rm -rqf . >/dev/null 2>&1
    cp "$OLDPWD/$out"/N3_report_*.pptx "$OLDPWD/$out"/summary.md . 2>/dev/null; mkdir -p captures; cp "$OLDPWD/$out"/*.png captures/ 2>/dev/null
    printf '# N3 일일 시험 보고 — %s\n\n- PowerPoint: [N3_report_%s.pptx](N3_report_%s.pptx)\n- 요약: [summary.md](summary.md)\n- 화면 캡처: captures/\n\n이 브랜치는 매일 최신 보고서 하나로 바뀝니다(강제 푸시).\n' "$seed" "$seed" "$seed" > README.md
    git add -A && git -c user.name="HVAC Grid daily" -c user.email="noreply@anthropic.com" commit -qm "N3 daily report $seed" && git push -qf origin HEAD:claude/n3-report && echo "published: claude/n3-report ($seed)" ) || echo "보고서 브랜치 올리기 실패"
  git worktree remove --force "$wt" >/dev/null 2>&1
 else echo "보고서 브랜치 올리기 실패 (worktree)"; fi
fi
exit $status
