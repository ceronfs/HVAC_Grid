# H2 ~ H4 결과 — 다층 계통, 통합 저장·출력, SOLAS

실행 2026-10-19 · 원본: `vendor/BOX_CAL_Enhance.html`(bd942611), `vendor/DuctConcept_PHG_D.html`(643f328a), `vendor/SOLAS_fire_rating.html`(05b6440e) — 원본 파일은 읽기 전용, 결과는 `out/`(git 제외)

## 1. 무엇이 생겼나

| 단계 | 기능 | 구현 |
|---|---|---|
| H2 Deck·계통 | 급기·**배기·환기** 계통 모두 Deck별 PHG D 프로젝트(배기·환기는 PHG D 합류 압력 계산 모드) | `lib/phg-plan.cjs`, `app/bridge.js` |
| | 여러 Deck 계통: 공조기 Deck(지정·팬룸·최대 풍량), 다른 Deck은 샤프트(트렁크 실·공조기 수직 위아래·지정)에서 시작 | `lib/phg-plan.cjs` |
| | **수직 덕트**: 구간별 풍량·크기(10 m/s, 2 Pa/m)·손실, 계통 최대 압력손실 = Deck 최대 + 수직 경로 | `lib/risers.cjs`, `lib/ducts.cjs` |
| | 같은 팬룸·트렁크 안 여러 계통 공조기·샤프트 분리(600 mm) | `lib/phg-plan.cjs` |
| H3 통합 저장·출력 | 프로젝트 파일 `hvac-grid-project/1`(계약 + 모든 PHG D 프로젝트 + 결과 + 덕트 형상), 결과 서명으로 바뀐 계획만 "다시 보내기" | `lib/project.cjs` |
| | **통합 XLSX** 11시트(요약·격실·계통·Deck 덕트망·덕트·수직 덕트·RU·방화 경계·관통 목록·물량·검토), 의존성 없는 작성기 | `lib/xlsx.cjs`, `lib/report.cjs` |
| | **통합 DXF**(모든 Deck 나란히: 격실·RU·덕트+크기·공조기·샤프트·수직 덕트·방화 경계 등급별 레이어·관통), 한글 `\U+` | `lib/dxf-out.cjs` |
| | **HTML 보고서**(인쇄용, Deck 평면 SVG, 검토·계통·수직 덕트·덕트망·방화·관통·물량·격실) | `lib/report.cjs`, `lib/plan-svg.cjs` |
| | 헤드리스 전체 실행(계약 → 모든 Deck·계통 AUTO → 프로젝트·출력) | `tools/hvac-run.cjs` |
| H4 SOLAS | 실 분류(이름·ISO 분류·사용자), 격벽·외벽·갑판 경계 등급, Deck 덕트·수직 덕트 관통 조치, 계통 분리 경고, 물량 | `lib/solas.cjs` — [SOLAS.md](SOLAS.md) |
| 셸 | ③ 계통 종류(급기·배기·환기), 공조기 Deck, 수직 덕트 위치, 방화 오버레이 · ⑤ 탭(덕트망·계통·수직 덕트·방화·검토), 선종·방화방식, 미분류 실 지정, 출력 4종 · HVAC Grid 편집 실행 취소(Ctrl+Z/Y) | `app/shell.js` |
| 시험 도면 | T3 시험선(4 Deck, 73실, L자 선실, 다층 계통, 케이싱, 조리실) BOX 프로젝트 + Deck별 DXF, 도면 대조 도구 | [TEST_DRAWINGS.md](TEST_DRAWINGS.md), `lib/dxf-in.cjs`, `tools/dxf-check.cjs` |

## 2. T3 시험선 — 15개 Deck·계통 (`npm run run:t3`, 67 s)

| Deck · 계통 | 시작점 | RU | RU 풍량 / 설계 (CMH) | 덕트 | 길이 | Deck 최대 | 수직 덕트 | AUTO |
|---|---|---|---|---|---|---|---|---|
| UPPER DK · 급기 AHU-ACC | 공조기·팬 · 팬룸 120 | 11 | 3,610 / 3,610 | 32 | 63.1 m | 180 Pa | — | 5.8 s |
| A DK · 급기 AHU-ACC | 수직 덕트 · 샤프트 204 | 13 | 2,780 / 2,780 | 32 | 78.1 m | 175 Pa | 60 Pa | 7.4 s |
| B DK · 급기 AHU-ACC | 수직 덕트 · 샤프트 304 | 12 | 3,400 / 3,400 | 31 | 71.1 m | 203 Pa | 83.9 Pa | 5 s |
| NAV BRG DK · 급기 AHU-BRG | 공조기·팬 · 팬룸 405 | 15 | 4,870 / 4,870 | 41 | 61.9 m | 166 Pa | — | 6.5 s |
| UPPER DK · 급기 SF-GAL | 공조기·팬 · 팬룸 120 | 7 | 3,080 / 3,080 | 17 | 31.5 m | 144 Pa | — | 4.4 s |
| NAV BRG DK · 배기 EF-BRG | 공조기·팬 · 팬룸 405 | 2 | 470 / 470 | 6 | 15.8 m | 72 Pa | — | 1.7 s |
| UPPER DK · 배기 EF-GAL | 공조기·팬 · 팬룸 120 | 10 | 4,270 / 4,270 | 23 | 42.2 m | 161 Pa | — | 2.7 s |
| UPPER DK · 배기 EF-LAU | 공조기·팬 · 팬룸 120 | 2 | 680 / 680 | 5 | 14.6 m | 91 Pa | — | 1.8 s |
| UPPER DK · 배기 EF-SAN | 공조기·팬 · 팬룸 120 | 3 | 860 / 860 | 9 | 17.9 m | 88 Pa | — | 2.5 s |
| A DK · 배기 EF-SAN | 수직 덕트 · 샤프트 204 | 11 | 1,630 / 1,630 | 24 | 39.5 m | 125 Pa | 46.4 Pa | 3.6 s |
| B DK · 배기 EF-SAN | 수직 덕트 · 샤프트 304 | 8 | 1,210 / 1,210 | 17 | 31.9 m | 57 Pa | 60.2 Pa | 3.4 s |
| UPPER DK · 환기 RA-ACC | 공조기·팬 · 팬룸 120 | 7 | 2,820 / 2,820 | 20 | 47.6 m | 120 Pa | — | 3.8 s |
| A DK · 환기 RA-ACC | 수직 덕트 · 샤프트 204 | 12 | 2,760 / 2,760 | 28 | 75.7 m | 207 Pa | 55.2 Pa | 6.3 s |
| B DK · 환기 RA-ACC | 수직 덕트 · 샤프트 304 | 11 | 3,350 / 3,350 | 28 | 66.2 m | 239 Pa | 78.5 Pa | 3.4 s |
| NAV BRG DK · 환기 RA-BRG | 공조기·팬 · 팬룸 405 | 13 | 4,770 / 4,770 | 36 | 58.5 m | 87 Pa | — | 3.2 s |

| 계통 | 종류 | 공조기 Deck | 팬 풍량 (CMH) | 수직 덕트 | 계통 최대 압력손실 |
|---|---|---|---|---|---|
| AHU-ACC | 급기 | UPPER DK | 9,790 | D1→D2 550×350 6,180 CMH 60 Pa<br>D2→D3 400×300 3,400 CMH 24 Pa | 286.9 Pa (B DK) |
| AHU-BRG | 급기 | NAV BRG DK | 4,870 | — | 166 Pa (NAV BRG DK) |
| SF-GAL | 급기 | UPPER DK | 3,080 | — | 144 Pa (UPPER DK) |
| EF-BRG | 배기 | NAV BRG DK | 470 | — | 72 Pa (NAV BRG DK) |
| EF-GAL | 배기 | UPPER DK | 4,270 | — | 161 Pa (UPPER DK) |
| EF-LAU | 배기 | UPPER DK | 680 | — | 91 Pa (UPPER DK) |
| EF-SAN | 배기 | UPPER DK | 3,700 | D1→D2 350×300 2,840 CMH 46.4 Pa<br>D2→D3 300×200 1,210 CMH 13.8 Pa | 171.4 Pa (A DK) |
| RA-ACC | 환기 | UPPER DK | 8,930 | D1→D2 550×350 6,110 CMH 55.2 Pa<br>D2→D3 400×300 3,350 CMH 23.3 Pa | 317.5 Pa (B DK) |
| RA-BRG | 환기 | NAV BRG DK | 4,770 | — | 87 Pa (NAV BRG DK) |


- AUTO 15/15, 연결 안 된 RU 0, RU 풍량 = 설계 풍량(모든 계획), 페이지 오류 0, 검토 항목 9개 모두 통과.
- SOLAS: 경계 333 (A-60 26, A-0 66, B-0 43, - 1, C 64, A-15 5, * 128), 관통 134, 방화댐퍼 20, 슬리브 200 mm × 19, 900 mm × 56, 미분류 0 (덕트 트렁크 3실 `T3.solas.json`으로 지정 후).
- 표는 `node tools/result-table.cjs out/t3/project.json`으로 만든 것. 자세한 값은 `out/t3/report.xlsx`, `report.html`.

## 3. S5 — 18개 Deck·계통 (`npm run run:s5`, 57 s)

- AUTO 18/18(급기 10 + 배기 EXH-ROOM 4 Deck + 환기 RET-ROOM 4 Deck), 페이지 오류 0.
- 남는 검토 항목은 **S5 데이터의 실제 문제**를 보여 줌: 공조기 위치 임시 4계통(S2·S3에 팬룸 없음), SOLAS 미분류 3실(관측실·예비실·소화장비실), SUP-ER-02가 기관구역과 기관제어실을 함께 담당(II-2/9.7.2.1 경고).

## 4. 자동 시험

| 시험 | 내용 | 결과 |
|---|---|---|
| `npm test` | 30개: 계약, 계획(종류·다층·간격), 수직 덕트 물리, 프로젝트 파일, 출력(XLSX·DXF·보고서 다시 읽기), SOLAS(워크북 830칸 대조 포함), 시험 도면 대조 | 통과 |
| `test/e2e/shell.e2e.cjs` | S5: BOX → 계약(도구 결과와 동일) → 공조기 위치 → ΔT → 배기 공조기 Deck 변경·실행 취소·다시 실행 → 방화 오버레이 → AUTO(급기·배기 모드) → 검토 탭 → SOLAS 지정 → 다운로드 4종 검증 → 1280 px · 어두운 화면 | 통과 |
| `test/e2e/t3.e2e.cjs` | T3: BOX에서 시험선 → 계약(샘플과 동일) → 트렁크 SOLAS 지정 → 15개 AUTO → 저장·다시 열기(동일) → PHG D에서 다시 열기 → 시험 DXF를 PHG D(실 인식)·BOX로 가져오기 | 통과 |
