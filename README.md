# HVAC Grid

**BOX Cal**(격실·부하·장비·신기 계산)과 **PHG**(RU 배치·AUTO 덕트 라우팅·덕트 계산)를 묶어
선박 HVAC 설계를 한 흐름으로 처리하는 플랫폼 프로젝트입니다.

```
Deck · 격실 ─▶ 부하 계산 ─▶ 격실별 풍량(급기·배기·환기) ─▶ RU·공조기·샤프트 ─▶ 덕트 라우팅 ─▶ 덕트·수직 덕트 계산 ─▶ 방화(SOLAS) 검토 ─▶ 출력
   (BOX Cal)        (BOX Cal)             (공통)                       (공통)           (PHG D)          (PHG D · 공통)          (공통)          (공통)
```

상태: **H2 · H3 · H4 완료, H5 S1, 리뷰 1차 반영 (2026-10-19)** — 급기·배기·환기 계통 모두 Deck별 PHG D 덕트망, 여러 Deck 계통의 공조기 Deck·샤프트·수직 덕트, 공조 구역 풍량 수지(전달 공기), 제한 구역을 피하는 AUTO, 한 프로젝트 파일, 통합 XLSX·DXF·HTML 보고서, SOLAS 방화 경계·덕트 관통·제한 구역 통과·점검표, T3 시험선(4 Deck 합성 선박)과 도면 대조. 결과 [docs/H2_H4_RESULT.md](docs/H2_H4_RESULT.md), 리뷰 [docs/REVIEW.md](docs/REVIEW.md).
테스트: 단위 테스트(`npm test`)와 E2E 7개(`npm run test:e2e` — S5·T3 셸 흐름, vendor 패치, 프로젝트·BOX, 방화 등급도, SOLAS 도구, K 변경; 실제 BOX·PHG D). 개수는 각 명령의 출력이 기준입니다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | 목표, 이전 시도에서 배운 점, 통합 방식, 단계 계획과 상태, **직접 정한 것(8장)** |
| [docs/CONTRACT.md](docs/CONTRACT.md) | 설계 데이터·프로젝트 파일, BOX → 설계 데이터 · 설계 데이터 → PHG D 대응, 수직 덕트, 풍량 규칙, 검증 |
| [docs/SOLAS.md](docs/SOLAS.md) | SOLAS II-2 판정: 데이터 대조, 실 분류, 경계, 관통, 한계 |
| [docs/WORKFLOW_SKETCHCAD.md](docs/WORKFLOW_SKETCHCAD.md) | **처음 쓰는 사람용 따라 하기**: 받은 DXF → SketchCAD(계산 준비·경계 지정·실 만들기·HVAC Grid용 DXF) → HVAC Grid ①~⑤ |
| [docs/TEST_DRAWINGS.md](docs/TEST_DRAWINGS.md) | T3 시험선(BOX 프로젝트로 시작)과 N3 시험선(DXF 도면 3장으로 시작, 날짜 시드로 매일 다른 배치): 도면·계통·파일·검토 |
| [docs/H2_H4_RESULT.md](docs/H2_H4_RESULT.md) | H2~H4 결과(T3·S5 실행, 자동 시험) |
| [docs/H1_S5_RESULT.md](docs/H1_S5_RESULT.md) | H1 결과(S5 급기 10계통) |
| [docs/REVIEW.md](docs/REVIEW.md) | 리뷰 기록: 등급, 지적 사항과 처리 |
| [docs/SOURCES.md](docs/SOURCES.md) | 통합 대상 원본(경로·크기·해시·상태)과 이전 통합 시도 |
| [docs/UI_REVIEW.md](docs/UI_REVIEW.md) · [docs/UI_DESIGN_REVIEW.md](docs/UI_DESIGN_REVIEW.md) | 셸 UI 설계와 디자이너 검토 |

## 준비

- Node.js 20 이상, Microsoft Edge(헤드리스 실행·E2E용 — 다른 브라우저는 `HVAC_GRID_BROWSER=chrome`, 설치된 Chromium 실행 파일은 `HVAC_GRID_BROWSER_PATH=<경로>`)
- `npm install` — devDependency `playwright-core`(브라우저 내려받기 없음, 설치된 Edge를 씀). 이미 설치된 Playwright를 쓰려면 `PLAYWRIGHT_MODULE=<경로>`
- 셸만 쓸 때는 **`HVAC_Grid.bat`을 더블클릭**하면 됩니다. 독립 프로그램처럼 **자기 창**(탭·주소창 없는 Edge 앱 창, 최대화, 작업 표시줄에 HVAC Grid 아이콘)으로 열리고, 콘솔 창은 남지 않습니다. 창을 닫으면 로컬 서버와 그 창의 Edge도 몇 초 안에 함께 끝납니다. 저장하지 않은 작업이 있으면 닫기 전에 묻습니다. 다시 실행하면 창이 하나 더 열립니다. Edge가 없으면 Chrome 앱 창, 둘 다 없으면 기본 브라우저 탭으로 엽니다.
  - 문제 확인용: `HVAC_Grid.bat console`(콘솔에 진행 표시), 기록은 `%LOCALAPPDATA%\HVAC_Grid\launch.log`. 포트를 바꾸려면 `HVAC_Grid.bat 8793`.
  - 명령줄에서는 `npm start`(브라우저 탭).
- 사용법은 앱 안 **? 도움말(F1)**에 있습니다. 저장 Ctrl+S, 다른 이름으로 저장 Ctrl+Shift+S, 열기 Ctrl+O, 단계 이동 Alt+1~5. 상태 줄의 **다음:** 단추가 지금 할 일을 알려 줍니다.

처음 써 보기: `HVAC_Grid.bat` 더블클릭 → HVAC Grid 창 → ③에서 **T3 시험선** → ⑤ **모든 계통 AUTO**(약 50초) → ⑤ **보고서**.

## 실행

```
HVAC_Grid.bat               # 더블클릭: 독립 창(Edge 앱 모드) + 로컬 서버, 창을 닫으면 종료
npm start                   # 통합 셸 → 브라우저에서 http://127.0.0.1:8792/app/
npm test                    # 단위 테스트 (개수는 출력 참조)
npm run test:e2e            # E2E 9개: S5 셸 흐름, T3 시험선 전체, vendor 패치, 프로젝트·BOX, 방화 등급도, SOLAS 도구, K 변경, SketchCAD → HVAC Grid, N3(고정 시드) (캡처 out/e2e*/, out/n3/)
npm run test:sketchcad      # SketchCAD에서 만든 실(HVAC Grid용 DXF)이 HVAC Grid ①로 들어오는지 — N3 도면 3가지 (SketchCAD는 ../SketchCAD/SketchCAD.html 또는 SKETCHCAD_HTML, 없으면 건너뜀)
npm run test:n3             # N3 시험선을 오늘 날짜 시드로 새로 그려 도면부터 끝까지 (결과 out/n3/<날짜>/summary.md)
npm run run:t3              # T3 설계 데이터 → 17개 Deck·계통 AUTO → out/t3/ (project.json, report.xlsx, report.html, integrated.dxf, shots/)
npm run run:s5              # S5 설계 데이터 → 18개 Deck·계통 AUTO → out/s5/
npm run make:t3             # 시험선 다시 만들기 (BOX 프로젝트·DXF) + BOX로 설계 데이터 추출
npm run solas:check         # lib/solas-data.json = SOLAS 도구 사본 확인
node tools/hvac-run.cjs <설계 데이터 또는 프로젝트.json> <출력 폴더> [--shots] [--solas=<SOLAS 설정.json>] [--strict]   # AUTO 미완료면 종료 1, --strict면 검토 실패도 종료 3
node tools/dxf-check.cjs <도면.dxf> <설계 데이터.json> <deckId>     # 도면과 설계 데이터의 실 번호·이름·면적 대조
node tools/box-extract.cjs <BOX 프로젝트.json> <출력.json>      # BOX → 설계 데이터
# 방화 등급도: ⑤ 검토·출력 "방화 등급도" 탭 · 리본 출력 "방화 등급도 DXF" · 보고서 (docs/SOLAS.md 6a)
npm run make:solas-tool      # 별도 프로그램 SOLAS 방화 등급 표기 → dist/SOLAS_방화등급표기.html (한 파일, 독립망에서 더블클릭, docs/SOLAS.md 6b)
node tools/make-offline.cjs [폴더]                               # 독립망용 복사본: 실행에 필요한 파일 + runtime\node.exe + MANIFEST.json → dist/HVAC_Grid_offline (이 도구가 만든 폴더만 교체)
node tools/offline-check.cjs [복사본 폴더]                        # 복사본 인수 시험: MANIFEST 해시 + 자체 서버로 S5·T3 예제 (독립망 PC에서도)
node tools/bench.cjs [Deck 수] [Deck당 실 수]                     # 대형선 처리 시간 (합성 선박)
```

셸 작업 순서: ① 도면·격실(BOX — S5·H5·**T3 시험선**) → ② 부하(BOX CAL) → **설계 데이터 만들기** → ③ 풍량·계통(ΔT, 급기·배기·환기, 공조기 위치·공조기 Deck·샤프트, 풍량·방화 보기) → ④ RU·덕트(③과 **같은 평면**: PHG D가 뒤에서 AUTO·크기·압력을 계산하고 덕트망을 이 평면에 그림, 덕트를 누르면 크기·풍량·풍속, 평면에서 **RU·공조기 끌어 옮기기**(놓으면 다시 AUTO)·**덕트 크기 바꾸기**(PHG D 수동 크기로 다시 계산)·**다른 경로**(AUTO 다음 후보), 그 밖의 세부 편집은 **PHG D 편집기** → **평면으로**가 고친 내용을 읽어 옴) → ⑤ 검토·출력(모든 계통 AUTO, 덕트망·계통·수직 덕트·**계통도**·방화·검토 탭, 선종·방화방식·최하층 아래·스프링클러, 프로젝트·XLSX·DXF·보고서). 검토는 통과·확인 필요·실패 3단계입니다. ③⑤에서 Ctrl+Z / Ctrl+Y는 HVAC Grid 편집(ΔT, 위치, 공조기 Deck, SOLAS 지정)을 되돌립니다.

셸은 두 앱을 같은 출처 iframe으로 띄우고 스크립트로 다루므로 `file://`이 아닌 로컬 서버(`npm start`, 127.0.0.1 전용, app·vendor·lib·samples만 제공)로 엽니다.
`vendor/`에는 원본의 **고정 사본**(PHG D, BOX CAL Enhance, SOLAS 도구·워크북)이 있고 도구는 이 사본만 씁니다. 원본 파일은 읽기 전용입니다(`vendor/VERSIONS.json`). 생성물은 `out/`(git 제외), `probe/`는 앱 구조 확인에 쓴 조사 스크립트입니다.

## 원칙

- 원본 앱(BOX Cal, PHG D)은 각 저장소에서 계속 개발되며, 이 프로젝트는 **확정된 버전(해시)** 을 기록해 사용합니다.
- 개발·검증은 localhost HTTP, 배포물은 가능하면 단일 HTML(`file://`)로 유지합니다(BOX 실행 원칙과 같음).
- 한국어 화면, 자동 테스트와 단계별 캡처로 검증합니다.
- 계산·판정 결과는 설계 보조이며 최종 판단은 설계자·주관청·선급에 따릅니다.
