# HVAC Grid Ver 2.0 계획서 — 작업 · 일정 · 검증

작성 2026-10-25 · 상태: 계획 — K0 결정 완료(2026-10-25, [DECISIONS.md](DECISIONS.md)), 착수는 지시 뒤 · 기획서: [PLAN_V2.md](PLAN_V2.md) · V2-1 세부: [PLAN_PHG_LIB.md](PLAN_PHG_LIB.md) · 1.x 기준 커밋: `70a1e8d`(main, 2026-10-25)

## 1. 범위와 전제

- **무엇을**: 기획서의 목표 G1~G9(한 모델 · 엔진 · 한 캔버스와 모듈 여섯 · 한 흐름 · 데크 상하 관계 · 속도 · 큰 도면 · 같은 답 · 가벼운 배포)를 단계 V2-0~V2-6으로 만든다.
- **언제 시작하나**: 기획서를 검토하고 결정 D1~D6(기획서 11장)을 정한 뒤(게이트 K0). 그 전에는 이 계획서의 어떤 작업도 시작하지 않는다.
- **1.x는 그대로 간다**: 지금 프로그램(main)은 계속 쓰고 고치고 배포한다. 2.0 작업은 별도 브랜치·폴더에서 하고, main의 수정은 2.0 쪽으로 주기적으로 합친다(2장).
- **강제 항목은 모든 단계에 적용**: F-1 풍량은 여름(냉방) 기준 하나, 겨울은 같은 풍량에 난방 용량 · F-2 표준 값은 원문(`C:\Users\HK\Desktop\Program\DATA\7547.pdf`)으로 확인, 조항 번호를 값 옆에(`AGENTS.md`).
- **원본은 원본에서**: SketchCAD(ceronfs/SketchCAD), PHG(ceronfs/PHG), CAL_Enhance는 각자 저장소에서만 고친다. HVAC Grid 2.0은 잘라 낸 사본(`npm run extract:*`)만 담는다.
- **같은 답이 기준**: 옮긴 엔진의 결과가 1.x 결과(V2-0 기준값)와 같아야 단계가 끝난다. 다르면 원인을 적고 사용자 확인 없이 2.0 결과로 바꾸지 않는다.

## 2. 작업 방식

| 항목 | 방식 |
|---|---|
| 브랜치·폴더 | `v2` 브랜치를 별도 폴더(worktree) `C:\Users\HK\Desktop\HVAC_Grid_v2`에 둔다. main 폴더(`HVAC_Grid`)는 1.x 그대로 |
| main 반영 | 1.x 수정은 main에 먼저, 단계가 끝날 때마다 main → v2 병합. v2 → main은 V2-6 출시 때 한 번 |
| 원본 저장소 작업 | V2-2(SketchCAD 데크 지정)는 SketchCAD 저장소의 브랜치에서. 끝나면 원본 main → HVAC Grid가 잘라 옴 |
| 커밋 | 작업 항목(4장의 번호) 하나에 커밋 하나 이상. 메시지에 항목 번호(예: `V2-1.3`) |
| 게이트 | 단계가 끝나면 검토 보고서 `docs/v2/REVIEW_V2-n.md`(강제 항목 F-1·F-2 지킴/어김 포함) → 사용자 승인 → 다음 단계 |
| 기록 | 결정·측정은 `docs/v2/`에(결정 기록 `DECISIONS.md`, 측정 `BASELINE.md`) |
| 시험 | 단계마다 `npm test`(단위) + 해당 e2e. 게이트에서 `npm run test:all` + N3 정기 시험 |

## 3. 일정 개요 (추정)

작업일 = 실제 작업하는 날. 추정은 V2-0 조사 뒤(게이트 K1) 다시 한다.

| 단계 | 내용 | 추정(작업일) | 먼저 끝나야 하는 것 | 병행 | 게이트 |
|---|---|---|---|---|---|
| K0 | 기획서 검토, D1~D6 결정 | — | — | — | K0 |
| V2-0 | 기준값 · 조사 · 성능 기준 측정 | 3~4 | K0 | — | K1 |
| V2-1 | PHG 엔진(④가 PHG D 창 없이, 계통 병렬) | 8~12 | V2-0 | V2-2 | K2 |
| V2-2 | SketchCAD 데크 지정 · 여러 데크 내보내기 | 4~6 | K0 | V2-1 | (K2에 포함) |
| V2-3 | 모델 v2 · 캔버스 코어 · 모듈 틀 · ③④⑤ 모듈 | 10~15 | V2-1 | — | K3 |
| V2-4 | 부하 엔진 · ② 모듈 | 8~15 | V2-3, V2-0 조사 | — | K4 |
| V2-5 | 도면·격실 엔진 · 0·① 모듈 · 큰 도면 | 10~15 | V2-2, V2-4 | — | K5 |
| V2-6 | 정리 · 배포 · 매뉴얼 · 성능표 | 4~5 | V2-5 | — | K6 출시 |
| 합계 | | **약 47~72** | | | |

주 경로: K0 → V2-0 → V2-1 → V2-3 → V2-4 → V2-5 → V2-6. V2-2는 V2-1과 함께 진행한다. 폭이 가장 큰 V2-4는 CAL이 BOX에 얼마나 묶여 있는지(V2-0.3 조사)에 달렸다.

```
작업일  0    10    20    30    40    50    60    70
V2-0   ███
V2-1      ██████████
V2-2      █████
V2-3                ████████████
V2-4                            ███████████
V2-5                                       ████████████
V2-6                                                   ████
게이트  K1        K2          K3          K4          K5  K6
```

## 4. 단계별 작업

### V2-0 기준값 · 조사 · 성능 기준

**목표**: 1.x가 내는 답과 성능을 고정하고, 큰 단계(V2-1·V2-4·V2-5)의 막힐 곳을 미리 확인한다.

| 번호 | 작업 | 산출물 |
|---|---|---|
| 0.1 | 1.x 기준값 수집 도구: S5·T3·N3에서 계약, 격실 부하, 풍량, 계통, RU 배치, 덕트망(경로·크기·풍량), 계통 결과(Pa·ESP·팬), SOLAS(분류·경계·관통부), 출력(XLSX 셀 값, DXF 엔티티 수) | `tools/v1-golden.cjs`, `test/fixtures/v1-golden/{s5,t3,n3}/` |
| 0.2 | PHG 기준값(PLAN_PHG_LIB P0): 계통마다 loadPlan 직후 상태, 워커 입력·출력, AUTO 후보, 덕트, 압력 | `tools/phg-golden.cjs`, `test/fixtures/phg-golden/` |
| 0.3 | 조사 — CAL ↔ BOX 결합: CAL이 BOX에서 받는 것(격실, 6면, 접한 면적 A6, 면 경계 BC, 데크 z·층고), 함수 목록, 떼어 낼 범위와 대안 | `docs/v2/STUDY_CAL.md` |
| 0.4 | 조사 — PHG 어댑터가 기대는 `scope.*`·화면 함수 목록, 막을 곳(빈 함수) | `docs/v2/STUDY_PHG.md` |
| 0.5 | 조사 — SketchCAD 코어(DXF 읽기, 계산용 정리, 경계, 실 찾기) 함수와 캔버스 구조, 잘라 낼 경계 | `docs/v2/STUDY_SKETCHCAD.md` |
| 0.6 | 성능 기준: T3·N3 전체 AUTO 시간, 큰 도면(20·100·200 MB) 열기·실 찾기 시간·메모리, 한 파일판·독립망 크기 | `docs/v2/BASELINE.md` |

**완료 기준**: 기준값을 1.x로 다시 뽑아도 같다(두 번 실행 비교). 조사 세 건이 끝나고 4장의 V2-1·V2-4·V2-5 작업 목록과 3장 추정을 고친다(K1).
**주의**: 기준값은 PHG D 방향 수정(`d92643f`) 뒤의 1.x로 뽑는다(그 전 값과 일부 계통 ESP가 다르다 — T3 AHU-ACC 338.2 Pa, N3 EF-SAN 98 Pa).

### V2-1 PHG 엔진

**목표**: ④ RU·덕트가 PHG D 창 없이 `lib`의 엔진으로 경로·덕트 지정·크기·압력을 계산하고, 계통을 병렬로 돌린다. 세부: [PLAN_PHG_LIB.md](PLAN_PHG_LIB.md).

| 번호 | 작업 | 산출물 |
|---|---|---|
| 1.1 | 잘라 내는 도구 + 해시 시험 | `tools/extract-phg.cjs`, `npm run extract:phg`, `lib/phg/*`(머리에 원본 블록 id·vendor 해시) |
| 1.2 | 순수 계산: 경로 엔진, 크기 워커, V2 계산 워커를 노드에서 실행해 0.2 워커 기준값과 비교 | `lib/phg/routing-engine.cjs`, `sizing-worker.cjs`, `typed-calc.cjs` |
| 1.3 | 상태 만들기: 계획 → PHG D 상태(DXF 없이). 좌표는 BOX y(1.x `[y=BOX]` 약속과 같음) | `lib/phg-state.cjs` |
| 1.4 | AUTO: 어댑터의 prepare·prepareRouting·후보·applyResult 이식, 금지 구역을 단계적으로 푸는 규칙(`zonesRelaxed`) 그대로 | `lib/phg-route.cjs` |
| 1.5 | 덕트 지정·크기·수동 크기 유지·압력 | `lib/phg-ducts.cjs` |
| 1.6 | 엔진 API와 워커 풀(코어 수 − 1, 계통 병렬, 멈춤 단추) | `lib/phg-engine.cjs`, `app/phg-worker.js` |
| 1.7 | 셸 전환: `sendPlan`·`autoKey`·`reroute`·`resizeDuct`·`moveRu`·`runAll`이 엔진 사용. PHG D 편집기는 D1 결정대로 | `app/shell.js`, `app/bridge.js` |
| 1.8 | 브라우저 없는 일괄 실행 | `tools/hvac-run.cjs --node` |

**완료 기준**: 단위 시험 — 각 단계 출력이 0.2 기준값과 같음. e2e — T3 18/18·N3 16/16 AUTO, 계통 ESP·팬 압력이 0.1 기준값과 같음, 검토 fail 0. 측정 — T3·N3 전체 AUTO 시간이 0.6 기준의 절반 이하(G6).
**위험**: 압축된 V2 모듈의 접착 함수 → 기준값으로만 판단. DXF를 건너뛴 상태가 다름 → 맞추기 어려우면 DXF 경로 유지(PLAN_PHG_LIB 5장).

### V2-2 SketchCAD 데크 지정 (SketchCAD 저장소)

**목표**: SketchCAD 한 파일에서 여러 데크를 정리하고, 데크(상위 레이어)마다 높이·층고·기준점을 정해 한 번에 넘긴다.

| 번호 | 작업 | 산출물 |
|---|---|---|
| 2.1 | 데크 표와 "데크로 지정" 도구(영역 선택 + 기준점 FR0·중심선), 레이어 패널 데크 ▸ 레이어 트리. 이름은 기존 `DECK`(갑판·천장 경계 용도)와 구별 | SketchCAD `SketchCAD.html` |
| 2.2 | 데크 필터 보기(지금 데크 / 위·아래 흐리게 / 모두) | SketchCAD |
| 2.3 | 여러 데크 JSON 내보내기: 데크 표, 경계 선(용도 STR·PNL·DECK), 격실(번호·이름·외곽) | 형식 `sketchcad-decks/1`, SketchCAD 문서 |
| 2.4 | HVAC Grid 변환기: SketchCAD JSON → BOX 프로젝트 JSON(z·층고·기준점 → `decks[].z/height/offsetX/offsetY`). ①에서 1.x 경로로 바로 열기 | `lib/io/sketchcad.cjs`, ① 리본 "SketchCAD 데크 열기" |
| 2.5 | 시험: N3 세 데크를 한 파일로 → BOX 상하 검사(`deckStackIssues`) 경고 0, 격실 부하가 데크별 DXF 경로와 같음 | `test/io-sketchcad.test.cjs`, e2e |

**완료 기준**: 2.5 통과, SketchCAD 단독판 회귀 시험 통과(큰 DXF 200 MB 포함).
**위험**: 메모리(데크마다 "계산용으로 열기"로 필요한 레이어만), 층고 정의(D4: BOX의 아래 z + 층고 = 위 z).

### V2-3 모델 v2 · 캔버스 코어 · 모듈 틀

**목표**: 모델 하나와 캔버스 하나, 모듈 약속을 세우고 이미 HVAC Grid 코드인 ③④⑤를 모듈로 옮긴다.

| 번호 | 작업 | 산출물 |
|---|---|---|
| 3.1 | 모델 스키마 `hvac-grid/2`(기획서 6장)와 검증 | `lib/model/schema.cjs` |
| 3.2 | 다시 계산 표: 결과마다 입력 해시, 바뀐 곳을 읽는 모듈만 stale | `lib/model/graph.cjs` |
| 3.3 | 명령·실행 취소 하나 | `lib/model/commands.cjs` |
| 3.4 | 1.x 가져오기(계약 + PHG D 프로젝트 + BOX JSON → v2). 옛 `rules.heatingSupplyDeltaTK`는 버림(F-1) | `lib/io/v1.cjs` |
| 3.5 | 캔버스 코어: 보기(이동·확대·맞춤), 층 쌓기(래스터·벡터), 고르기, 스냅, 끌기, 선택, 데크 필터 | `app/canvas/` |
| 3.6 | 모듈 약속과 모듈 시험(`reads`·`writes` 밖 쓰기 금지, 모듈 간 호출 금지) | `app/modules/README.md`, `test/modules.test.cjs` |
| 3.7 | ③ `airflow`, ④ `ducts`, ⑤ `review` 모듈: 1.x `plan()`·`report()`를 층·도구·패널로 나눔 | `app/modules/{airflow,ducts,review}/` |
| 3.8 | 이 단계의 도면 층: 모델의 격실·경계 선을 직접 그림(BOX 캔버스 바탕 끔). ①②는 아직 BOX | `app/modules/rooms/layer.js`(임시) |

**완료 기준**: ③④⑤가 한 캔버스에서 모듈로 돌고 단계 전환 때 보기·선택이 유지됨. 1.x 프로젝트를 열어 v2로 저장·다시 열기가 같음. 실행 취소 하나(셸·PHG 엔진 수정이 한 기록). 풍량·SOLAS·출력이 0.1 기준값과 같음.
**위험**: 셸 코드(142 KB)를 나누다 흐름이 깨짐 → 모듈 하나씩 옮기고 그때마다 e2e.

### V2-4 부하 엔진 · ② 모듈

**목표**: 부하를 숨긴 CAL 창 없이 엔진으로 계산한다. 입력은 모델(격실·경계·조건).

| 번호 | 작업 | 산출물 |
|---|---|---|
| 4.1 | CAL 계산부를 잘라 오는 도구(0.3 조사 결과의 범위) | `tools/extract-cal.cjs`, `lib/engines/load/` |
| 4.2 | 입력 어댑터: 모델 격실·경계·데크 상하 → CAL 입력(6면, 접한 면적, 외기 면) | `lib/engines/load/input.cjs` |
| 4.3 | K 표·모드(ISO 적용·LY 적용·KU)와 설계 조건. 값마다 ISO 7547 조항 번호(F-2) | `lib/engines/load/k.cjs` |
| 4.4 | ② `load` 모듈: 부하 색 층(W/m²), 외기 면 표시, 조건·K 패널, 격실 부하표 | `app/modules/load/` |
| 4.5 | 기준값 시험: 격실 부하(현열·잠열·난방·최소 신기) W 반올림 같음, CAL 자체 시험 110개, K 변경 시험(`k-change`) | `test/load.test.cjs` |

**완료 기준**: 4.5 통과, ②가 캔버스 모듈, 강제 항목 시험(F-1: "one airflow all year", CAL "AHU 격실 풍량") 통과.
**대안**(0.3에서 결합이 깊다고 나오면): 모델 → BOX 프로젝트 JSON → 숨긴 CAL의 `report()`로 잇는 중간 단계를 먼저 두고, 떼어 내기는 V2-6 뒤로 미룬다. 일정은 K1에서 다시 정한다.

### V2-5 도면·격실 엔진 · 0·① 모듈

**목표**: SketchCAD 코어로 도면 정리·경계·실 찾기를 HVAC Grid 안에서 하고, BOX를 주 경로에서 뺀다. iframe 0개.

| 번호 | 작업 | 산출물 |
|---|---|---|
| 5.1 | SketchCAD 코어를 잘라 오는 도구(DXF 읽기·계산용 정리·경계·실 찾기·면적) | `tools/extract-sketchcad.cjs`, `lib/engines/geometry/` |
| 5.2 | 캔버스 코어에 큰 도면 래스터 층(SketchCAD 방식) | `app/canvas/raster.js` |
| 5.3 | 0 `drawing` 모듈: 계산용으로 열기, 정리, STR·PNL·DECK 경계, 데크로 지정 | `app/modules/drawing/` |
| 5.4 | ① `rooms` 모듈: 실 자동 찾기·지정·번호, 면적표, 상하 검사 | `app/modules/rooms/` |
| 5.5 | 데크 상하 접촉(바닥·천장 면, 외기 판정) — BOX `deckStackIssues` 규칙과 같게 | `lib/engines/geometry/stack.cjs` |
| 5.6 | BOX를 주 경로에서 뺌. 1.x 프로젝트 가져오기는 `lib/io/v1.cjs`로 유지 | `app/` |

**완료 기준**: 200 MB 합성 도면 → ⑤ 출력까지 한 프로그램, iframe 0개(G3·G4·G7). S5·T3·N3 격실(번호·면적·체적)이 0.1 기준값과 같음.
**위험**: SketchCAD 실 찾기와 BOX 실 인식의 결과 차이 → 0.1 기준값으로 비교, 다른 격실 목록을 사용자에게 보여 결정.

### V2-6 정리 · 배포 · 매뉴얼

| 번호 | 작업 | 산출물 |
|---|---|---|
| 6.1 | 한 파일판·독립망 복사본 다시 구성(선택 편집기는 따로 불러옴) | `tools/make-single.cjs`, `make-offline.cjs` |
| 6.2 | 성능표(0.6 기준 대비): AUTO 시간, 큰 도면, 크기, 메모리 | `docs/v2/RESULT.md` |
| 6.3 | 매뉴얼(워드·PPT), `AGENTS.md`에 2.0 항목, `docs/` 정리 | |
| 6.4 | 전체 시험 `npm run test:all`, N3 정기 시험 | |
| 6.5 | v2 → main 병합, 1.x 정리(D6) | |

**완료 기준**: 기획서 13장 지표를 채우고 G1~G9 충족, 검토 보고서 승인(K6).

## 5. 게이트

| 게이트 | 언제 | 확인할 것 | 결정 |
|---|---|---|---|
| K0 | 착수 전 | 기획서 검토, D1~D6 | 착수 여부 |
| K1 | V2-0 뒤 | 기준값, 조사 세 건, 다시 추정한 일정 | V2-4 방식(떼어 내기 / 중간 단계) |
| K2 | V2-1·V2-2 뒤 | AUTO 같은 답·시간, SketchCAD 데크 | ④를 엔진으로 바꿔 1.x에도 넣을지 |
| K3 | V2-3 뒤 | 모듈 틀, 1.x 가져오기 | 틀 확정 |
| K4 | V2-4 뒤 | 부하 같은 답 | — |
| K5 | V2-5 뒤 | iframe 0, 큰 도면 | 출시 준비 |
| K6 | V2-6 뒤 | 지표, 전체 시험 | 출시(v2 → main) |

게이트마다 검토 보고서에 강제 항목 F-1·F-2를 "지킴 / 어김"으로 적고, 어긴 곳은 결함(P1)으로 올린다(`AGENTS.md`).

## 6. 시험·측정

| 무엇 | 도구 | 어느 단계부터 |
|---|---|---|
| 엔진 기준값(1.x와 같은 답) | `npm test` + `test/fixtures/v1-golden`, `phg-golden` | V2-1 |
| 잘라 온 사본 해시 | 단위 시험 | V2-1 |
| 모듈 약속 | `test/modules.test.cjs` | V2-3 |
| 강제 항목 F-1·F-2 | `test/iso7547.test.cjs`, `contract.test.cjs`, CAL 자체 시험 | 모든 단계 |
| 화면 흐름(한 캔버스, 단계 전환, 실행 취소) | e2e(Edge) | V2-3 |
| 큰 도면 시간·메모리 | 벤치(20·100·200 MB) | V2-0, V2-5 |
| AUTO 시간 | T3·N3 | V2-0, V2-1 |
| 실도면 | N3 정기 시험 `npm run test:n3` | 게이트마다 |

## 7. 산출물

| 구분 | 파일 |
|---|---|
| 문서 | `docs/v2/`: `DECISIONS.md`, `BASELINE.md`, `STUDY_CAL.md`, `STUDY_PHG.md`, `STUDY_SKETCHCAD.md`, `REVIEW_V2-n.md`, `RESULT.md` |
| 도구 | `tools/v1-golden.cjs`, `phg-golden.cjs`, `extract-phg.cjs`, `extract-cal.cjs`, `extract-sketchcad.cjs` |
| 엔진 | `lib/phg/*`, `lib/phg-*.cjs`, `lib/engines/{geometry,load,airflow,systems,route,size,fire,output}/` |
| 모델·입출력 | `lib/model/{schema,graph,commands}.cjs`, `lib/io/{v1,sketchcad,dxf}.cjs` |
| 화면 | `app/canvas/`, `app/modules/{drawing,rooms,load,airflow,ducts,review}/`, `app/phg-worker.js` |
| 시험 | `test/fixtures/{v1-golden,phg-golden}/`, `test/{modules,load,io-sketchcad}.test.cjs`, e2e |
| 원본 저장소 | SketchCAD: 데크 지정·여러 데크 JSON(V2-2) |

## 8. 위험 관리

| 위험 | 신호 | 대응 | 단계 |
|---|---|---|---|
| CAL이 BOX에 깊이 묶임 | 0.3 조사 | 중간 단계(모델 → BOX JSON → CAL) 먼저, 떼어 내기는 뒤로 | V2-0, V2-4 |
| 압축된 PHG V2 모듈 | 1.2·1.5에서 기준값 불일치 | 워커 원문은 그대로, 접착만 기준값으로 맞춤 | V2-1 |
| 엔진 결과가 1.x와 다름 | 기준값 시험 실패 | 원인 기록, 사용자 확인 전에는 2.0 결과로 바꾸지 않음 | 모든 단계 |
| 셸 분해 중 흐름 깨짐 | e2e 실패 | 모듈 하나씩, 매번 e2e | V2-3 |
| 원본 갱신으로 사본 깨짐 | 해시 시험 | `extract:*` 다시 → 기준값 시험 | V2-1 이후 |
| 일정 초과 | 게이트 때 추정 대비 1.5배 이상 | 다음 단계 범위 줄이기(예: V2-5의 0 모듈을 SketchCAD 연결로 대체) | 게이트마다 |
| 1.x와 2.0 갈라짐 | main 수정이 v2에 안 들어감 | 단계마다 main → v2 병합 | 모든 단계 |

## 9. 착수 전 할 일

1. 기획서 검토, 결정 D1~D6 기록(K0) — **완료**(2026-10-25, 권장안으로 결정, [DECISIONS.md](DECISIONS.md)).
2. `v2` 브랜치와 작업 폴더 `HVAC_Grid_v2`(worktree) 만들기.
3. V2-0 시작: 기준값 도구(0.1·0.2)와 조사 세 건(0.3~0.5)은 서로 독립이라 함께 진행할 수 있다.
