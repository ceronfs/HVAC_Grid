# HVAC Grid 실행 시험 보고서 — 실행기(HVAC_Grid.bat)와 사용자 흐름

## 1. 목적

새 실행기 `HVAC_Grid.bat`(더블클릭 시작)를 실제로 실행해 보고, 그 실행기가 띄운 로컬 서버에 브라우저로 접속해 사용자처럼 다섯 단계(① 도면·격실 → ② 부하 → ③ 풍량·계통 → ④ RU·덕트 → ⑤ 검토·출력)를 끝까지 써 본다. 출력(XLSX·DXF·HTML 보고서·프로젝트 JSON)을 외부 도구로 검증하고, 단위 시험을 돌리고, 발견한 문제를 심각도별로 정리한다.

## 2. 환경

| 항목 | 값 |
|---|---|
| 일시 | 2026-10-19 (월) 18:39 ~ 18:55 KST |
| OS | Windows 11 Home 10.0.26200 (빌드 26200.9711) |
| Node.js | v24.18.0 |
| 브라우저 | Microsoft Edge 155.0.4283.62 (기본 브라우저 `MSEdgeHTM`) · 자동화는 헤드리스 Edge(msedge 채널) |
| Playwright | `tools/browser.cjs` 경유. 저장소에 `node_modules`가 없어(`npm install` 안 됨) 도우미가 마지막 대안인 PC의 Playwright 1.62.1을 사용 |
| Python | 3.14.6 · openpyxl 3.1.5 · ezdxf 1.4.4 |
| 커밋 | `3f9cae1` (작업 트리: `HVAC_Grid.bat`, `tools/launch.cjs` 미추적, `.gitattributes` 수정. `README.md`는 시험 중 다른 곳에서 수정됨 — 이 시험은 소스를 바꾸지 않음) |
| 서버 | `http://127.0.0.1:8792/app/` — 실행기(`node tools\launch.cjs`)가 띄운 서버 |

참고: 시험을 시작할 때 포트 8792에는 이미 실행기 서버가 떠 있었다(PID 11600, 부모 `cmd.exe /c HVAC_Grid.bat`, 그 부모 `explorer.exe`, 18:38:31 시작 — 사용자가 탐색기에서 더블클릭한 것). 그래서 "처음 시작" 경로는 실행기에 포트 인수를 주어 8793에서 시험했고(`HVAC_Grid.bat 8793`, 배치 파일이 `%*`를 넘김), 기본 포트 8792에서는 "이미 실행 중" 경로를 시험했다. 브라우저 자동화는 8792(사용자의 실행기 서버)에 접속했다. 서버는 정적 파일만 내주므로 결과에 영향은 없다.

## 3. 실행한 것

1. 실행기: `Start-Process`로 `HVAC_Grid.bat`를 실제 창으로 실행(작업 폴더를 `C:\Windows\System32`, `C:\Users`, `C:\Windows`로 바꿔 가며), 두 번째 실행, 포트 충돌, node 없음(PATH 조작), 브라우저 열기 확인.
2. 앱(Playwright, `out/run-report/scripts/*.cjs`, 1600×900 · 1280×800):
   - `t3-run.cjs`: 빈 화면 → **T3 시험선 열기** → ③ 4개 Deck(전달 공기 화살표, 방화 보기) → ④ **보내기 + AUTO** 1개 → ⑤ 최하층 아래 지정 → **모든 계통 AUTO** → 탭 4개 → 검토 그룹 → 1280 px 리본 ‹ › → 출력 4종 다운로드.
   - `reopen.cjs`: 새 브라우저에서 저장한 프로젝트 열기 → 수치 비교 → ④ PHG D 재열기 → **남은 것만**.
   - `s5-run.cjs`: 빈 화면 → **예제 설계 데이터 열기 (S5)** → **모든 계통 AUTO**.
   - `box-path.cjs`: ① 리본 **T3 시험선**(BOX) → ② → **설계 데이터 만들기**.
   - `edits.cjs`: ③ 급기 ΔT·가압·최소 신기 적용, 잘못된 입력, 실행 취소/다시 실행(헤더 버튼, Ctrl+Z/Y), 속성 패널 **전달 공기 출처**, **공간 지정**(SOLAS), 결과 "다시 보내기", Alt+1~5, 1280 px 리본.
   - 보조 확인: `pen-probe.cjs`(관통 표 첫 행), `stair-probe.cjs`(계단실 전달 공기), `align-probe.cjs`(검토 그룹 정렬).
3. 출력 검증: `validate.py`(openpyxl, ezdxf `readfile` + `recover` 감사), `report-pdf.cjs`(HTML 보고서 → A4 가로 PDF, 페이지 확인).
4. `npm test`.
5. 정리: 내가 띄운 서버(8793, PID 2284)와 헤드리스 브라우저 종료.

원자료: `out/run-report/*.json`(결과), `out/run-report/logs/`(콘솔 출력), `out/run-report/downloads/`(출력 파일), `out/run-report/shots/`(캡처). `out/`은 git 제외 폴더다.

## 4. 결과

### 4.1 실행기 (HVAC_Grid.bat)

| 시험 | 방법 | 결과 |
|---|---|---|
| 처음 시작 | `Start-Process HVAC_Grid.bat -ArgumentList 8793 -WorkingDirectory C:\Windows\System32` (실제 창) | **통과** — 642 ms 만에 `/app/` 200. `127.0.0.1:8793` LISTEN, PID 2284 `node tools\launch.cjs 8793`(부모 cmd.exe). 작업 폴더와 무관하게 동작(`cd /d "%~dp0"`) |
| 창 출력 (처음) | 같은 실행을 출력 리디렉션으로(포트 8794, 확인 후 종료) | `HVAC Grid 실행 중: http://127.0.0.1:8794/app/` / `이 창을 닫으면 HVAC Grid가 종료됩니다.` 한글 정상(chcp 65001) |
| 서버 보안 | 같은 서버에 요청 | `/` → 302(`/app/`), `/package.json` → 404, Host `evil.example` → 421, 바인드 127.0.0.1 전용 |
| 두 번째 실행 (8792) | 실제 창, 작업 폴더 `C:\Users` | **통과** — 281 ms 만에 종료 코드 0, 출력 `HVAC Grid가 이미 실행 중입니다: http://127.0.0.1:8792/app/`, 포트 충돌 없음, 리스너 그대로(11600) |
| 두 번째 실행 (8793) | 실제 창 | **통과** — 249 ms, 종료 코드 0, 리스너 그대로(2284) |
| 브라우저 열기 | `launch.cjs`와 같은 `spawn('cmd', ['/c','start','""',url])`로 탐지용 서버(8796)를 열게 함 | **통과** — 기본 브라우저(Edge 155)가 요청을 보냄. Node가 `""`를 `"\"\""`로 바꿔 넘기지만 `start`는 정상 동작 |
| 포트를 다른 프로그램이 점유 | 8795에 404만 내는 node 서버를 띄우고 `HVAC_Grid.bat 8795` | 멈추지 않음(210 ms). stderr `서버를 시작하지 못했습니다 (포트 8795): listen EADDRINUSE: address already in use 127.0.0.1:8795` 후 `pause` (→ P3-8) |
| node 없음 | `cmd /d /c "set PATH=C:\Windows\System32 && call HVAC_Grid.bat"` | **통과** — `Node.js 20 이상이 필요합니다: https://nodejs.org 에서 설치한 뒤 다시 실행하세요.` 후 `pause`, 130 ms |
| node 없음 (PATH 완전히 빔) | `set "PATH="` | 메시지는 나오지만 `chcp`도 못 찾아 한글이 깨짐(`'chcp'은(는) …` 오류). 현실적이지 않은 조건이라 문제로 올리지 않음 |

### 4.2 T3 시험선 — 단계별 (1600×900)

| 단계 | 사용자 동작 | 결과 |
|---|---|---|
| 시작 | `/app/` 열기 | ① 도면·격실(BOX)에서 시작, BOX 준비 0.35 s. 오류 0 |
| ③ 빈 화면 | ③ 탭 클릭 | "아직 설계 데이터가 없습니다" + **② 부하에서 설계 데이터 만들기 / 예제 설계 데이터 열기 (S5) / T3 시험선 열기** 버튼 표시 |
| T3 열기 | **T3 시험선 열기** | 0.14 s. Deck 4 · 격실 79 · 계통 11(급기 3, 배기 6, 환기 2) · Deck·계통 17 · 급기 21,700 CMH. 헤더 `T3.box.json · 79실` |
| ③ 전달 공기 화살표 | Deck 4개 차례로 | 화살표 UPPER DK 6 · A DK 11 · B DK 8 · NAV BRG DK 1. 툴팁 예: `전달 공기 250 CMH: 102 복도 → 106 공용화장실 · 경계 B-0 (자동)`. 범례에 "→ 전달 공기 CMH (실선 = 지정 · 주황 = A급 경계)" |
| ③ 속성 패널 | 404 선교화장실 클릭 | "전달 공기 받음 170 CMH · 409 도선사실", **전달 공기 출처** 선택 상자(자동 / 자체 흡입구 / 403 계단실 / 405 선교팬룸 / 409 도선사실) |
| ③ 방화 보기 | **방화** | 경계선 UPPER 35 · A 35 · B 33 · NAV BRG 17, 범례(A-60·A-0·B-0 수, 방화댐퍼·관통), "모든 실 분류됨" |
| ③ 공조 구역 수지 | (⑤ 계통 탭, 분석값) | AHU-ACC 급기 12,910 · 배기 4,630 · 신기 4,870 · 환기 8,040 · 37.7 % 적합 / AHU-BRG 5,710 · 170 · 1,430 · 4,280 · 25 % 적합 / SF-GAL 3,080 · 3,080 · 3,080 · 0 · 100 % 적합 — `docs/H2_H4_RESULT.md`와 같음 |
| ④ 한 계통 | ④ → **보내기 + AUTO** | NAV BRG DK 급기 AHU-BRG: 덕트 41개 · 63.2 m · 최대 142 Pa, 3.0 s |
| ⑤ 설정 | **최하층 아래** = 기관실 — A류 (`samples/t3/T3.solas.json`과 같게) | 관통 9 → 20 (수직 덕트만), 검토 통과 10 · 확인 5 · 실패 0 |
| ⑤ **모든 계통 AUTO** | 리본 클릭 | **50.5 s**, 진행 표시 `1/17 · D1 · AHU-ACC AUTO`, 상태 `AUTO 완료: 17/17 (이번에 17개)` |
| ⑤ 탭 | 덕트망 · 계통·수직 덕트 · 방화 (SOLAS) · 검토 | 4개 탭 모두 표시(수직 덕트는 "계통·수직 덕트" 탭 안의 표). 검토 탭 배지 `● 5` |
| ⑤ 검토 그룹 | 검토 탭 | 미해결 확인 사항 26건, 그룹 5개: ● 풍량 5(펼침) · ● 제한 구역 통과 1(펼침) · ● SOLAS 점검표 4(펼침) · ● SOLAS 실 4(펼침) · ● 방화 경계 12(접힘). 5건 이하·실패 그룹은 펼침 규칙대로. 그룹 표 글이 가운데 정렬됨(→ P3-3) |
| ⑤ 관통 행 → ③ | 방화 탭 관통 표 행 클릭 | 첫 행 P-001은 표 머리에 가려 클릭 불가(→ **P2-1**). P-002 클릭 시 ③ 방화 보기, A DK, 위치 (4800, 9800) 강조로 이동 — 정상 |
| ④ 다층 계통 | A DK AHU-ACC 열기 | PHG D에 덕트망 표시. 떠날 때 상태 줄 `D2 · AHU-ACC: PHG D에서 고친 내용을 읽었습니다` — 고친 것 없음(→ P3-1) |
| 1280×800 리본 | 단계별 리본 | ① 넘침 135 px · ③ 283 px · ④ 424 px → **›** 표시, ② 넘침 없음 · ⑤ 2 px(화살표 없음). › 클릭 시 ‹ 나타나고 스크롤됨. 끝까지 가려면 › 두 번(→ P3-2) |
| 출력 | ⑤ **통합 XLSX / 통합 DXF / 보고서 / 프로젝트 저장** | 4개 모두 다운로드(각 0.25 s 이하) — 4.4 참조 |
| 다시 열기 | 새 브라우저 → 헤더 **열기**(폴더 아이콘) → 저장한 JSON | 0.22 s. 검토 수치·관통·Deck·계통 17개 결과 **모두 같음**. ④ B DK AHU-ACC: PHG D 결과(덕트 31 · 75.4 m · 187 Pa) = 저장값. **남은 것만** → `AUTO 완료: 17/17 (이번에 0개)` |

T3 계통별 AUTO 결과(17/17)는 `docs/H2_H4_RESULT.md` 2장의 표와 덕트 수·길이·Deck 최대 손실이 모두 같았다(예: UPPER DK AHU-ACC 48개 · 81.3 m · 198 Pa, A DK AHU-ACC 41 · 88.4 · 206, NAV BRG DK RA-BRG 31 · 58.8 · 97). 연결 안 된 RU 0, RU 풍량 = 설계 풍량.

### 4.3 수치 요약

| 항목 | T3 | S5 |
|---|---|---|
| 설계 데이터 열기 | 0.14 s | 0.09 s |
| 모든 계통 AUTO | **17/17, 50.5 s** | **18/18, 32.6 s** |
| 검토 통과 · 확인 · 실패 | **10 · 5 · 0** | **8 · 6 · 1** |
| 덕트 관통 · 방화댐퍼 | **152 · 11** | **209 · 4** |
| 방화 경계 | 391 (A-60 47, A-0 81, B-0 46, C 65, * 148, A-15 4) | 454 (미정 35 포함) |
| 슬리브 | 200 mm × 27, 900 mm × 41 | 200 mm × 74, 900 mm × 34 |
| SOLAS 미분류 · 실 밖 덕트 · 제한 구역 통과 금지 | 0 · 0 m · 0 | 3 · 0 m · 0 |
| 공조 구역 수지 적합 | 3/3 | 10/10 |
| 금지 영역 완화 | 0 | 1 (S1 RET-ROOM, 실 밖 영역만) |
| 페이지 오류 · 콘솔 오류 | 0 · 0 | 0 · 0 |

S5의 실패 1건은 `계통 분리·점검표: 분리 경고 2 · 위반 2 · 확인 5` — `docs/H2_H4_RESULT.md` 3장에 적힌 S5 데이터 자체의 문제(축전지실 배기 계통 없음, 계통이 기관구역·조리실을 다른 구역과 함께 담당)와 같다.

① → ② 경로(`box-path.cjs`): ① 리본 **T3 시험선** → BOX에 4 Deck 0.88 s, ② **설계 데이터 만들기** 0.51 s → 격실 79 · 계획 17, 풍량이 `samples/t3.contract.json`과 같음. 단, 상태 줄은 `T3 시험선 → BOX (4 Deck · 73실)`(→ P3-5).

### 4.4 사용자 편집 (T3, `edits.cjs`)

| 동작 | 결과 |
|---|---|
| ③ 급기 ΔT 12 · 가압 10 % · 최소 신기 30 % → **적용** | 급기 합계 21,700 → **19,170 CMH**, 상태 `급기 ΔT 12 K · 가압 배기의 10 % 적용: 급기 합계 19,170 CMH`. 구역: AHU-ACC 11,840/5,150/5,670/6,170 · 47.9 % 적합, AHU-BRG 4,770/170/1,440/3,330 · 30.2 %, SF-GAL 2,560 |
| 급기 ΔT 2 → **적용** | 거부, 상태 줄(빨강) `급기 ΔT는 3–25 K`, 규칙은 12 그대로. (같은 오류가 `console.error`로도 찍힘 — 의도된 기록) |
| 헤더 실행 취소 / Ctrl+Y / Ctrl+Z | 10·5·25 → 12·10·30 → 10·5·25, 리본 입력란도 따라 바뀜. 상태 `실행 취소: 급기 ΔT 12 K · 가압 10 %` |
| 404 선교화장실 전달 공기 출처 = 자체 흡입구 | 404는 `own-inlet`, 409의 전달 공기 보냄 170 → 0, D4 화살표 1 → 0 |
| 출처 = 403 계단실 | 화살표 1(실선·주황 = 지정·A급 경계), 403 급기 70 → 180 CMH(보충). 검토 **실패**: `404 선교화장실: 계단실에서 전달 공기 — 계단실 문에는 통기구 불가 (II-2/9.4.2)` (→ P3-4) |
| 출처 = 자동 | 409 도선사실 170 CMH로 원복 |
| 208 선원휴게실 **공간 지정** = (9) 잡물창고 | 분류 근거 "사용자", 이 실 경계 `A-0,C,C,C,*,*,*` → `A-0,A-0,A-0,A-0,*,A-0,A-0`, 전체 A-0 81 → 86 · C 65 → 62. 실행 취소로 원복(`실행 취소: 208 SOLAS 공간`) |
| AUTO 뒤 ΔT 11 적용 | ⑤ 덕트망 `0/17 AUTO 완료 · 다시 보내기 1`, 행 상태 `다시 보내기 필요` |
| Alt+1 … Alt+5 | room → load → air → duct → review 이동 |

### 4.5 출력 검증

| 출력 | 크기 | 검증 |
|---|---|---|
| 통합 XLSX `t3-hvac-grid-T3.box.json-202610191845.xlsx` | 911,762 B | openpyxl로 열림. 14시트: 요약 31행 · 확인 사항 27 · 격실 80(79+머리) · 구역 수지 4 · 계통·팬 12 · Deck 덕트망 18 · 덕트 377 · 수직 덕트 7 · RU 149 · 방화 경계 392 · 관통 목록 153 · 제한 구역 통과 2 · SOLAS 점검표 5 · 물량 18. 오류 셀(#…) 0, 틀 고정 A2, 자동 필터 있음. 요약의 검토 `실패 0 · 확인 필요 5 · 통과 10`, `391 · 152 · 11`이 화면과 같음 |
| 통합 DXF `….dxf` | 269,109 B | ezdxf `readfile` 감사 오류 0 · 수정 0, `recover` 오류 0 · 수정 0. AC1009(R12), 엔티티 1,865(TEXT 788, POLYLINE 653, LINE 254, CIRCLE 170), 레이어 ROOM 79 · FIRE_PEN 152 · RISER 24 · 덕트·RU·방화 등급별. 한글은 `\U+XXXX` 표기(85개 문자열), 범위 0,0 – 90,090 × 17,350 mm |
| HTML 보고서 `….html` | 436,917 B | CSP 메타(`default-src 'none'`), `@page { size: a4 landscape; margin: 12mm }`. Playwright로 A4 가로 PDF(`out/run-report/report-t3-a4-landscape.pdf`, 56쪽, 콘솔 오류 0) — 표 머리 반복, 평면 Deck별 1쪽, 실 번호·이름 대부분 읽힘. 일부 겹침·배치 문제(→ P3-7) |
| 프로젝트 `….json` | 2,020,981 B | `hvac-grid-project/1`, PHG D 프로젝트·결과 17개. 다시 열어 수치 동일(4.2). 다시 연 뒤 재저장본은 설계 데이터·형상 동일, 결과 값 동일(키 순서·`at`만 다름), ④에서 연 2개 PHG D 프로젝트는 `updatedAt`·덕트 객체 키 순서가 달라짐(P3-1과 같은 원인) |

### 4.6 npm test

`npm test` → **60개 통과, 실패 0** (1.2 s). 로그 `out/run-report/logs/npm-test.log`. (E2E `npm run test:e2e`는 이번 범위가 아니어서 돌리지 않음.)

## 5. 캡처 (docs/ 기준 상대 경로)

| 장면 | 파일 |
|---|---|
| 시작(① BOX) · ③ 빈 화면 · T3 열기 | [t3-00-start](../out/run-report/shots/t3-00-start.png) · [t3-01-air-empty](../out/run-report/shots/t3-01-air-empty.png) · [t3-02-air-opened](../out/run-report/shots/t3-02-air-opened.png) |
| ③ 전달 공기 화살표 D1~D4 | [D1](../out/run-report/shots/t3-03-air-D1.png) · [D2](../out/run-report/shots/t3-03-air-D2.png) · [D3](../out/run-report/shots/t3-03-air-D3.png) · [D4](../out/run-report/shots/t3-03-air-D4.png) · [속성 패널](../out/run-report/shots/t3-04-air-inspector-transfer.png) |
| ③ 방화 보기 D1~D4 | [D1](../out/run-report/shots/t3-05-fire-D1.png) · [D2](../out/run-report/shots/t3-05-fire-D2.png) · [D3](../out/run-report/shots/t3-05-fire-D3.png) · [D4](../out/run-report/shots/t3-05-fire-D4.png) |
| ④ 보내기 + AUTO | [t3-06-duct-entered](../out/run-report/shots/t3-06-duct-entered.png) · [t3-07-duct-auto-one](../out/run-report/shots/t3-07-duct-auto-one.png) · [t3-14-duct-D2](../out/run-report/shots/t3-14-duct-D2.png) |
| ⑤ AUTO 전·중 | [t3-08-review-before-auto](../out/run-report/shots/t3-08-review-before-auto.png) · [t3-09-review-auto-running](../out/run-report/shots/t3-09-review-auto-running.png) |
| ⑤ 탭 | [덕트망](../out/run-report/shots/t3-10-review-nets.png) · [계통·수직 덕트](../out/run-report/shots/t3-10-review-systems.png) · [방화](../out/run-report/shots/t3-10-review-fire.png) · [검토](../out/run-report/shots/t3-10-review-checks.png) · [검토 그룹](../out/run-report/shots/t3-11-review-checks-groups.png) |
| ③ AUTO 뒤 덕트 | [t3-13-air-ducts-D2](../out/run-report/shots/t3-13-air-ducts-D2.png) |
| 1280 px 리본 | [①](../out/run-report/shots/t3-15-ribbon-1280-room.png) · [① ›](../out/run-report/shots/t3-15-ribbon-1280-room-scrolled.png) · [②](../out/run-report/shots/t3-15-ribbon-1280-load.png) · [③](../out/run-report/shots/t3-15-ribbon-1280-air.png) · [④](../out/run-report/shots/t3-15-ribbon-1280-duct.png) · [④ ›](../out/run-report/shots/t3-15-ribbon-1280-duct-scrolled.png) · [⑤](../out/run-report/shots/t3-15-ribbon-1280-review.png) · [④ › 두 번](../out/run-report/shots/edit-08-ribbon-1280-duct-end.png) |
| 다시 열기 | [reopen-01-review-nets](../out/run-report/shots/reopen-01-review-nets.png) · [reopen-02-review-checks](../out/run-report/shots/reopen-02-review-checks.png) · [reopen-03-duct-D3-AHU-ACC](../out/run-report/shots/reopen-03-duct-D3-AHU-ACC.png) |
| S5 | [열기](../out/run-report/shots/s5-01-opened.png) · [덕트망](../out/run-report/shots/s5-02-review-nets.png) · [계통](../out/run-report/shots/s5-02-review-systems.png) · [방화](../out/run-report/shots/s5-02-review-fire.png) · [검토](../out/run-report/shots/s5-02-review-checks.png) · [③](../out/run-report/shots/s5-03-air.png) · [④](../out/run-report/shots/s5-04-duct.png) |
| ① → ② → 설계 데이터 | [box-01-room-t3](../out/run-report/shots/box-01-room-t3.png) · [box-02-load](../out/run-report/shots/box-02-load.png) · [box-03-air-after-contract](../out/run-report/shots/box-03-air-after-contract.png) |
| 편집 | [규칙 적용](../out/run-report/shots/edit-01-rules-applied.png) · [잘못된 입력](../out/run-report/shots/edit-02-bad-input.png) · [자체 흡입구](../out/run-report/shots/edit-03-transfer-own-inlet.png) · [계단실 출처](../out/run-report/shots/edit-04-transfer-from-stair.png) · [공간 지정](../out/run-report/shots/edit-05-solas-space-fire-view.png) · [④ 떠난 뒤](../out/run-report/shots/edit-06-after-leaving-duct.png) · [다시 보내기](../out/run-report/shots/edit-07-stale-after-rule-edit.png) |
| 문제 증거 | [관통 표 첫 행](../out/run-report/shots/probe-pen-table.png) · [P-002 → ③](../out/run-report/shots/probe-pen-jump-P002.png) · [계단실 전달 공기 검토](../out/run-report/shots/probe-stair-transfer-review.png) |

(`t3-12-air-penetration-focus.png`는 P-001 클릭이 머리 행에 막혀 ⑤에 머문 화면이다.)

## 6. 발견한 문제

P1 = 사용을 막음, P2 = 잘못된 결과·혼란, P3 = 다듬기.

**P1: 없음.**

### P2-1 ⑤ 방화 탭: 덕트 관통 표의 첫 행이 표 머리에 가려 보이지도, 눌리지도 않음
- 재현: T3 열기 → ⑤ → 방화 (SOLAS) 탭 → "덕트 관통 N곳" 표까지 스크롤. 머리 행 바로 아래에 P-002부터 보이고 P-001이 없다. AUTO 뒤 P-001은 `A-0 · 강재 슬리브 3t × 900 + 자동 방화댐퍼 · 102 복도 ↔ 120 공조기실 · 급기 AHU-ACC M-D-1`로, 조치가 필요한 행이다.
- 증거: [probe-pen-table.png](../out/run-report/shots/probe-pen-table.png), `out/run-report/pen-probe.json` — 표를 가운데로 스크롤한 뒤 첫 행 가운데 지점의 요소가 `TH 번호`. 같은 행을 누르면 `<th>경계</th> … intercepts pointer events`(`t3-run` 로그), P-002는 정상 이동.
- 원인(추정): `.report th{position:sticky;top:24px}`가 `overflow-x:auto`인 `.report .scrollx` 안에서는 그 상자를 기준으로 붙어 24 px 아래로 밀려 첫 행을 덮는다(관통 표만 `.scrollx` 안에 있음). XLSX·보고서에는 P-001이 있다.

### P3-1 PHG D에서 아무것도 고치지 않았는데 "PHG D에서 고친 내용을 읽었습니다"
- 재현: ④에서 **보내기 + AUTO** 후 PHG D를 건드리지 않고 ⑤로 이동 → 상태 줄 `D4 · AHU-BRG: PHG D에서 고친 내용을 읽었습니다`, 결과 `edited: true`. **모든 계통 AUTO** 뒤 저장한 프로젝트는 17개 결과가 모두 `edited: true`.
- 증거: `out/run-report/edits-results.json`(`leaveDuct`), 저장 파일 비교 — 다시 연 PHG D 프로젝트는 덕트 객체 키 순서(`shape`·`widthMm`…이 앞으로)와 `updatedAt`만 다름. `app/bridge.js`의 `changedSince()`가 직렬화 문자열을 그대로 비교해서 생기는 것으로 보인다. 수치는 바뀌지 않음.

### P3-2 1280 px 리본: › 한 번으로는 끝까지 가지 않고, › 가 마지막 명령을 일부 가림
- 재현: 1280×800, ④ RU·덕트 → 리본 › 클릭 → 스크롤 394 px인데 ‹ 가 생기며 리본 폭이 늘어(최대 418) › 가 남고 마지막 "오른쪽" 버튼이 "오른"까지만 보임. 한 번 더 눌러야 › 가 사라짐.
- 증거: `edits-results.json` `ribbonArrows`, [t3-15-ribbon-1280-duct-scrolled.png](../out/run-report/shots/t3-15-ribbon-1280-duct-scrolled.png). ‹ › 버튼이 흐름 안의 `position:sticky` 요소라 나타나고 사라질 때 스크롤 폭이 바뀜.

### P3-3 ⑤ 검토: 미해결 확인 사항 그룹의 글이 가운데 정렬
- 재현: ⑤ 검토 탭 → 그룹(● 풍량 5건 등) 안의 긴 문장이 가운데 정렬되어 훑어보기 어렵다.
- 증거: [t3-11-review-checks-groups.png](../out/run-report/shots/t3-11-review-checks-groups.png), 계산된 `text-align: center`(`align-probe.cjs`). 열이 하나인 `table.checks.wide`에 `table.checks td:first-child{text-align:center}`가 적용됨.

### P3-4 전달 공기 출처 목록에 계단실이 있고, 고르면 실패인데 요약 줄은 실패 원인을 말하지 않음
- 재현: ③ 404 선교화장실 → 전달 공기 출처 = 403 계단실. 속성 패널 `✕ 계단실에서 전달 공기 — 계단실 문에는 통기구 불가 (II-2/9.4.2)`, 검토 "✕ 실패 풍량 1건"은 맞다. 그러나 검토 표 요약 줄은 `✕ 실패 · 실 풍량: 부압 미확보 0 · 확인 4 (…)`로 실패 수를 보여 주지 않는다. 자동 규칙은 계단을 출처에서 빼는데 수동 목록에는 계단이 나온다.
- 증거: `out/run-report/stair-probe.json`, [probe-stair-transfer-review.png](../out/run-report/shots/probe-stair-transfer-review.png).

### P3-5 ① 리본 "T3 시험선" 상태 메시지의 실 수가 틀림
- 재현: ① → 리본 **T3 시험선** → 상태 `T3 시험선 → BOX (4 Deck · 73실)`. 설계 데이터를 만들면 79실(`T3.box.json`의 roomNo 79개, T3 v2.1).
- 증거: `out/run-report/box-path-results.json`. 문구가 `app/shell.js`에 고정되어 있음.

### P3-6 T3 프로젝트 이름이 파일 이름 "T3.box.json"
- 헤더 `T3.box.json · 79실`, 출력 파일 `hvac-grid-T3.box.json-202610191845.xlsx`, 보고서 제목 `HVAC Grid 보고서 — T3.box.json`, XLSX 요약 "프로젝트 T3.box.json". S5는 `S5 예제 (BOX 내장)`로 나온다. 확장자가 겹친 파일 이름이 어색하다.

### P3-7 HTML 보고서 인쇄(A4 가로) 배치
- 4쪽 끝에 "Deck 평면" 제목만 남고 평면은 다음 쪽부터(빈 반 쪽).
- 평면에서 일부 실 이름이 RU 기호·덕트 선에 가림(B DK 311 선장실·312 기관장실, A DK 211~215 선원침실 이름, UPPER DK 105·106 번호).
- 넓은 표(격실·방화 경계)는 첫 열 "Deck"이 넓고 나머지 열이 3~4줄로 접혀 56쪽이 됨(예: 부하 상태 "완료 · 흘수선 미검증"이 4줄).
- 증거: `out/run-report/report-t3-a4-landscape.pdf` 4·5~8·9~10·52~56쪽.

### P3-8 실행기: 포트를 다른 프로그램이 쓰면 원인 메시지만 나옴
- 재현: 8795를 다른 서버가 점유 → `서버를 시작하지 못했습니다 (포트 8795): listen EADDRINUSE: …` 후 `pause`. 무엇을 하면 되는지(다른 프로그램 종료, 또는 `HVAC_Grid.bat 8793`처럼 포트 지정)는 안내하지 않는다.
- 증거: `out/run-report/logs/conflict-8795.err.txt`.

### 기타 관찰 (문제로 올리지 않음)
- README의 "모든 계통 AUTO(약 40초)"와 달리 이번 T3는 50.5 s(문서 `run:t3` 52 s와 비슷).
- `HVAC_Grid.bat`는 node가 있는지만 보고 버전(20 이상)은 확인하지 않는다(코드 읽기로 확인, Node 19 이하로는 실행해 보지 않음).
- 실행기를 실행할 때마다 기본 브라우저에 새 탭이 열린다(설계대로). 이번 시험으로 사용자 Edge에 8792 탭 2개, 8793·8794·8796(탐지용) 탭이 열렸다.
- 저장소에 `node_modules`가 없어 E2E 도우미가 PC의 다른 Playwright(1.62.1)를 썼다. 실행기 자체는 Node 내장 모듈만 쓰므로 `npm install` 없이 동작한다.

## 7. 정리

- 내가 띄운 서버: 8793(PID 2284, `node tools\launch.cjs 8793`) 종료, 그 창(cmd 5712)도 닫힘. 8794 시험 서버, 8795 점유용 서버, 8796 탐지 서버도 종료.
- 헤드리스 Edge(Playwright)는 스크립트마다 닫음 — 남은 헤드리스 프로세스 0.
- **8792 서버(PID 11600)는 종료하지 않았다.** 시험 전에 사용자가 탐색기에서 실행한 것이라(부모 explorer.exe) 사용자의 작업을 끊지 않기 위해 남겨 두었다. 끄려면 그 "HVAC Grid" 창을 닫으면 된다.
- 소스 파일은 바꾸지 않았다. 만든 파일: `out/run-report/` 아래와 이 문서.

## 8. 종합 판정

**합격(조건부) — 사용할 수 있음.**
실행기는 작업 폴더와 무관하게 서버를 띄우고 브라우저를 열며, 이미 실행 중이면 브라우저만 열고, node가 없거나 포트를 못 쓰면 멈추지 않고 알린다. T3 시험선은 열기 → AUTO 17/17(50.5 s) → 검토 통과 10 · 확인 5 · 실패 0, 관통 152 · 방화댐퍼 11 → 출력 4종 → 다시 열기까지 문서(`docs/H2_H4_RESULT.md`)의 수치와 같게 끝났고, S5도 AUTO 18/18(32.6 s)에 문서대로의 데이터 실패 1건만 남았다. 페이지 오류·콘솔 오류 0, XLSX·DXF는 외부 도구로 오류 없이 읽혔고 `npm test` 60/60 통과. 사용을 막는 문제(P1)는 없고, 화면에서 관통 표 첫 행이 가려지는 P2 1건과 다듬기 P3 8건이 남았다.

## 9. 수정 결과 (같은 날, 이 보고서 뒤)

위 문제를 모두 고친 뒤 `npm test` 61개와 E2E 2개(S5·T3)가 통과했습니다. E2E에는 P2-1과 P3-1을 다시 확인하는 검사를 넣었습니다.

| 문제 | 수정 | 확인 |
|---|---|---|
| P2-1 관통 표 첫 행 가림 | 가로 스크롤 상자 안의 표 머리는 위 여백 없이 붙음(`.report .scrollx th{top:0}`) | T3 E2E: 첫 행 가운데 지점이 그 행의 칸 |
| P3-1 고치지 않았는데 "고친 내용을 읽었습니다" | PHG D가 다시 열 때 키 순서·시각·기본값(`ruNoiseType`)을 바꾸므로, 연 직후 PHG D 상태를 기준으로 시각을 뺀 정규형끼리 비교 | T3 E2E: 전체 AUTO → ④ → ⑤ 뒤 `edited` 결과 0 |
| P3-2 리본 › 두 번 | ‹ › 를 스크롤 상자 밖에 겹쳐 둠(스크롤 폭이 바뀌지 않음), 한 번에 80 % 이동 | 1280 px ④: › 한 번에 끝(409/409), 마지막 "오른쪽" 버튼 온전히 보임 |
| P3-3 그룹 글 가운데 정렬 | 그룹 표 전용 클래스로 왼쪽 정렬 | 계산된 `text-align: left` |
| P3-4 계단실 출처·요약 줄 | 계단실은 출처 목록에서 뺌(이미 지정된 것만 표시). 요약 줄에 "계단실 전달 공기 n"·"기타 실패 n" | 단위 테스트(404 ← 403 지정 시 `계단실 전달 공기 1`) |
| P3-5 "73실" | 시험선 파일의 실 수를 세어 표시(79) | 코드 |
| P3-6 이름 "T3.box.json" | 파일 확장자를 빼고, 시험선은 "T3 시험선" | 헤더 `T3 시험선 · 79실`, 단위 테스트 |
| P3-7 인쇄 배치 | "Deck 평면" 제목이 첫 평면과 같은 쪽에서 시작, 실 번호·이름을 덕트·RU 위에 흰 테두리로, Deck 열 폭 정상화·인쇄 표 글자 8.5 px | T3 보고서 A4 가로 56쪽 → **36쪽**, 평면 라벨이 덕트 위로 읽힘 |
| P3-8 포트 충돌 안내 | 포트를 다른 프로그램이 쓰면 "그 프로그램을 닫거나 `HVAC_Grid.bat <다음 포트>`로 실행" 안내 | 코드 |

README의 "모든 계통 AUTO 약 40초"는 실측(43~50 s)에 맞춰 "약 50초"로 고쳤습니다.
