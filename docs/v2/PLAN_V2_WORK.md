# HVAC Grid Ver 2.0 계획서 — 작업 · 일정 · 검증

작성 2026-10-25 · 고침 2026-10-25(V2-0 조사 뒤, D7·D8 반영 — 게이트 K1 대기) · 상태: K1 통과(2026-10-26, D9~D14 — 권장안), K2 통과(2026-10-26, D15~D18 — 권장안), V2-3 끝 — K3 통과(D21~D25, [REVIEW_V2-3.md](REVIEW_V2-3.md)) · **2026-10-26 보류(D26): 1.0 먼저 완성, 다시 시작하면 1.0 기능을 그대로 이어받아 한 캔버스로** — K0 결정 완료(2026-10-25, [DECISIONS.md](DECISIONS.md)) · 기획서: [PLAN_V2.md](PLAN_V2.md) · V2-1 세부: [PLAN_PHG_LIB.md](PLAN_PHG_LIB.md) · 1.0 기준 커밋: `70a1e8d`(main, 2026-10-25)

## 1. 범위와 전제

- **무엇을**: 기획서의 목표 G1~G9(한 모델 · 엔진 · 한 캔버스와 모듈 여섯 · 한 흐름 · 데크 상하 관계 · 속도 · 큰 도면 · 같은 답 · 가벼운 배포)를 단계 V2-0~V2-6으로 만든다.
- **언제 시작하나**: 기획서를 검토하고 결정 D1~D6(기획서 11장)을 정한 뒤(게이트 K0). 그 전에는 이 계획서의 어떤 작업도 시작하지 않는다.
- **1.0는 그대로 간다**: 지금 프로그램(main)은 계속 쓰고 고치고 배포한다. 2.0 작업은 별도 브랜치·폴더에서 하고, main의 수정은 2.0 쪽으로 주기적으로 합친다(2장).
- **강제 항목은 모든 단계에 적용**: F-1 풍량은 여름(냉방) 기준 하나, 겨울은 같은 풍량에 난방 용량 · F-2 표준 값은 원문(`C:\Users\HK\Desktop\Program\DATA\7547.pdf`)으로 확인, 조항 번호를 값 옆에(`AGENTS.md`).
- **처음부터 새로 짠다(D7, 2026-10-25)**: SketchCAD(ceronfs/SketchCAD), PHG D(ceronfs/PHG), BOX CAL과 HVAC Grid 1.0 `lib`는 **기능 참조**로만 쓴다. 2.0은 그 코드를 가져오거나 잘라 오지 않는다(옛 `extract:*`·`lib/phg/*` 사본·해시 시험 계획은 없앰). 기능 명세는 조사 세 건([STUDY_CAL.md](STUDY_CAL.md) · [STUDY_PHG.md](STUDY_PHG.md) · [STUDY_SKETCHCAD.md](STUDY_SKETCHCAD.md)). 원본 프로그램은 각자 저장소에서만 고친다.
- **같은 기능, 차이는 기록(D8)**: 새 엔진은 1.0와 같은 기능을 내야 한다. 값이 1.0 기준값(V2-0, `test/fixtures/v1-golden`·`phg-golden`)과 다르면 차이와 원인을 기록하고, 받아들일 범위는 단계 게이트에서 사용자가 정한다. F-1·F-2는 D8과 관계없이 지킨다.

## 2. 작업 방식

| 항목 | 방식 |
|---|---|
| 브랜치·폴더 | `v2` 브랜치를 별도 폴더(worktree) `C:\Users\HK\Desktop\HVAC_Grid_v2`에 둔다. main 폴더(`HVAC_Grid`)는 1.0 그대로 |
| main 반영 | 1.0 수정은 main에 먼저, 단계가 끝날 때마다 main → v2 병합. v2 → main은 V2-6 출시 때 한 번 |
| 원본 저장소 작업 | V2-2(SketchCAD 데크 지정)는 SketchCAD 저장소의 브랜치에서. 끝나면 원본 main → HVAC Grid가 잘라 옴 |
| 커밋 | 작업 항목(4장의 번호) 하나에 커밋 하나 이상. 메시지에 항목 번호(예: `V2-1.3`) |
| 게이트 | 단계가 끝나면 검토 보고서 `docs/v2/REVIEW_V2-n.md`(강제 항목 F-1·F-2 지킴/어김 포함) → 사용자 승인 → 다음 단계 |
| 기록 | 결정·측정은 `docs/v2/`에(결정 기록 `DECISIONS.md`, 측정 `BASELINE.md`) |
| 시험 | 단계마다 `npm test`(단위) + 해당 e2e. 게이트에서 `npm run test:all` + N3 정기 시험 |

## 3. 일정 개요 (K1 결정 뒤 추정, 2026-10-26)

작업일 = 실제 작업하는 날. K0 추정(합계 47~72일)은 "잘라 오기" 전제였다. D7(처음부터 새로)과 V2-0 조사 세 건으로 다시 추정했고(K1 추정 85~111일), K1 결정 D11(V2-2 없음)·D12(범위 줄이기)를 반영했다. 근거는 각 조사의 작업 목록(STUDY_PHG 8장, STUDY_CAL 9장, STUDY_SKETCHCAD 8장)이다.

| 단계 | 내용 | K0 추정 | **추정(D11·D12 뒤)** | 바뀐 이유 | 먼저 끝나야 하는 것 | 게이트 |
|---|---|---|---|---|---|---|
| V2-0 | 기준값 · 조사 · 성능 기준 측정 | 3~4 | **약 1.5(실제)** | | K0 | K1 ✓ |
| V2-1 | 덕트 엔진(경로·덕트 지정·크기·압력, 계통 병렬) | 8~12 | **17~21** | 새로 짬. 편집기 교환(1.9)은 V2-6 뒤(D12) | V2-0 | K2 |
| V2-2 | SketchCAD 데크 지정(단독판) | 4~6 | **0** | D11: 2.0 안에서 한 번(V2-5.8) | — | — |
| V2-3 | 모델 v2 · 캔버스 코어 · 모듈 틀 · ③④⑤ 모듈 | 10~15 | **18~26** | 1.0 `lib`(풍량 F-1·계통·RU 배치·수직 덕트·SOLAS·보고서·DXF, 약 200 KB)도 새로 짬(D7) | V2-1 | K3 |
| V2-4 | 부하 엔진 · ② 모듈 | 8~15 | **13~17** | 새로 짬. 입력은 1.0 면 행 어댑터(D9). XLSX 수식판은 V2-6 뒤(D12) | V2-3(모델) | K4 |
| V2-5 | 도면·격실 엔진(면 행 포함) · 0·① 모듈 · 큰 도면 | 10~15 | **23.5~33** | DXF 읽기·면 그래프·실 찾기·데크로 지정(SketchCAD 최신 데크 모델 + 기준점 맞춤 D5) + 문·창 읽기 + 면 행(직선 외판, D12) | V2-4 | K5 |
| V2-6 | 정리 · 배포 · 매뉴얼 · 성능표 | 4~5 | **5~6** | | V2-5 | K6 출시 |
| 합계 | | 47~72 | **약 78.5~105** | K0의 약 1.4~1.6배 | | |
| 2.0 뒤 (D12) | 부하 XLSX 수식판(4.8) · PHG D 편집기 교환(1.9) · 곡면 외판(5.10 곡면) | | +2~3 · +1.5 · +3 | | V2-6 | |

주 경로: K0 → V2-0 → V2-1 → V2-3 → V2-4 → V2-5 → V2-6. 작업하는 사람이 하나면 병행해도 작업일 합은 줄지 않는다. 엔진(V2-1·V2-4·V2-5의 `lib` 부분)은 화면 없이 노드 시험으로 끝나므로, 모델 스키마(V2-3.1)가 서면 V2-4 엔진은 V2-3 화면 작업과 순서를 바꿀 수 있다.

```
작업일  0     10    20    30    40    50    60    70    80    90   100
V2-0   █
V2-1    █████████████████▌
V2-3                      ██████████████████████
V2-4                                            ███████████████
V2-5                                                           ███████████████████████████
V2-6                                                                                      █████
게이트  K1                K2                    K3             K4                         K5   K6
```

## 4. 단계별 작업

### V2-0 기준값 · 조사 · 성능 기준

**목표**: 1.0가 내는 답과 성능을 고정하고, 큰 단계(V2-1·V2-4·V2-5)의 막힐 곳을 미리 확인한다.

**결과(2026-10-25, D7 뒤 목적을 바꿔 진행)**: 기준값은 새 엔진의 정답지(D8), 조사 세 건은 다시 짤 기능 명세. 검토 [REVIEW_V2-0.md](REVIEW_V2-0.md), 측정 [BASELINE.md](BASELINE.md). 0.1에 면 행(`faces.json.gz`)·CAL 부하 전체(`cal-loads.json.gz`)를 더함(STUDY_CAL 8장).

| 번호 | 작업 | 산출물 |
|---|---|---|
| 0.1 | 1.0 기준값 수집 도구: S5·T3·N3에서 계약, 격실 부하, 풍량, 계통, RU 배치, 덕트망(경로·크기·풍량), 계통 결과(Pa·ESP·팬), SOLAS(분류·경계·관통부), 출력(XLSX 셀 값, DXF 엔티티 수) | `tools/v1-golden.cjs`, `test/fixtures/v1-golden/{s5,t3,n3}/` |
| 0.2 | PHG 기준값(PLAN_PHG_LIB P0): 계통마다 loadPlan 직후 상태, 워커 입력·출력, AUTO 후보, 덕트, 압력 | `tools/phg-golden.cjs`, `test/fixtures/phg-golden/` |
| 0.3 | 조사 — CAL ↔ BOX 결합: CAL이 BOX에서 받는 것(격실, 6면, 접한 면적 A6, 면 경계 BC, 데크 z·층고), 함수 목록, 떼어 낼 범위와 대안 | `docs/v2/STUDY_CAL.md` |
| 0.4 | 조사 — PHG 어댑터가 기대는 `scope.*`·화면 함수 목록, 막을 곳(빈 함수) | `docs/v2/STUDY_PHG.md` |
| 0.5 | 조사 — SketchCAD 코어(DXF 읽기, 계산용 정리, 경계, 실 찾기) 함수와 캔버스 구조, 잘라 낼 경계 | `docs/v2/STUDY_SKETCHCAD.md` |
| 0.6 | 성능 기준: T3·N3 전체 AUTO 시간, 큰 도면(20·100·200 MB) 열기·실 찾기 시간·메모리, 한 파일판·독립망 크기 | `docs/v2/BASELINE.md` |

**완료 기준**: 기준값을 1.0로 다시 뽑아도 같다(두 번 실행 비교). 조사 세 건이 끝나고 4장의 V2-1·V2-4·V2-5 작업 목록과 3장 추정을 고친다(K1).
**주의**: 기준값은 PHG D 방향 수정(`d92643f`) 뒤의 1.0로 뽑는다(그 전 값과 일부 계통 ESP가 다르다 — T3 AHU-ACC 338.2 Pa, N3 EF-SAN 98 Pa).

### V2-1 덕트 엔진 (새로 짬 — [STUDY_PHG.md](STUDY_PHG.md))

**결과(2026-10-26)**: 1.1~1.8·1.10 끝, 1.9는 V2-6 뒤(D12). 52계획 RU 425/425, 금지 구역 완화 52/52 같음, 길이 비 중앙 1.00, 지수 압력 비 중앙 1.04, T3 계약 → 출력 5 s(1.0 AUTO 152 s). 검토 [REVIEW_V2-1.md](REVIEW_V2-1.md), 계획별 차이 [V2-1_COMPARE.md](V2-1_COMPARE.md).

**목표**: ④ RU·덕트의 경로(AUTO)·덕트 지정·크기·압력을 `lib`의 새 엔진으로 계산하고, 계통을 병렬로 돌린다. PHG D는 기능 참조(D7)와 선택 편집기(D1)다. 옛 세부 계획 [PLAN_PHG_LIB.md](PLAN_PHG_LIB.md)의 P1(잘라 오기)·P2(DXF 없는 PHG D 상태)는 이 목록으로 대체된다.

| 번호 | 작업 | 산출물 | 작업일 |
|---|---|---|---|
| 1.1 | 엔진 입력: 계획 → 경로 모델(실·복도·RU 실·금지 구역·선체 밖·포트·격자 상한). 좌표는 BOX y 하나(기획서 원칙 7) | `lib/duct/input.cjs` | 1.5 |
| 1.2 | 격자 A*: 방향 상태, 꺾임 비용, 포트 방향, 엘보 사이 최소 직관, 장애물·구역·덕트 폭 | `lib/duct/astar.cjs` | 2.5 |
| 1.3 | 덕트망 계획: RU를 하나씩 붙이는 순서(Prim), 접속 규칙(300/500 mm, 십자 Tee 금지), 실 묶음, 완화 재시도, 부분 결과, 검증 | `lib/duct/network.cjs` | 3 |
| 1.4 | 주관 척추·복도 우선·가중 비용 선택, 금지 구역 단계 완화(`zonesRelaxed`: outside → rooms → all), 후보 n개("다른 경로") | `lib/duct/route.cjs` | 2 |
| 1.5 | 덕트 지정(종류 main/branch/sub_branch, 안정 id) + 크기(풍량 누적, 사각·원형, 속도·높이 한도, 50 mm 단위, 수동 크기 유지) | `lib/duct/assign.cjs`, `size.cjs` | 1.5 |
| 1.6 | 압력: 마찰·수동 K·RU 손실·지수 경로, 배기·환기 합류. ASHRAE 이음쇠 표는 PHG D 값을 같게, "원문 미확인" 표시(D14) — 원문 확인이 완료 기준 | `lib/duct/pressure.cjs` | 2.5 |
| 1.7 | 비교 도구: 기준값의 경로 모델·덕트망을 각 단계에 넣어 비교, 차이 기록(D8) | `tools/engine-compare.cjs` | 1.5 |
| 1.8 | 엔진 API(`auto`·`resize`·멈춤)와 워커 풀(코어 수 − 1, 계통 병렬; 노드 `worker_threads`) | `lib/duct/engine.cjs`, `app/duct-worker.js` | 1.5 |
| ~~1.9~~ | ~~D1 선택 편집기 교환: 모델 덕트망 → PHG D 문서(`serializeTypedProject` 형식), 되읽기~~ — **V2-6 뒤(D12)** | `lib/duct/phgd-doc.cjs` | (1.5) |
| 1.10 | 브라우저 없는 일괄 실행(1.0 셸 ④ 전환은 하지 않음, D17) | `tools/hvac-run.cjs --node` | 2 |
| 소계 | | | **18 (17~21)** |

**완료 기준**: 단위 시험(엔진 단계마다), T3 18/18·N3 16/16 AUTO 완료, 기준값 대비 차이표(경로 길이·덕트 수·크기·ESP·팬 압력) — 받아들일 범위는 K2 전에 사용자가 정함(D8). 측정: T3·N3 전체 AUTO 시간이 0.6 기준의 절반 이하(G6, 같은 기계).
**위험**: 경로가 1.0와 달라짐(순서·동점·척추 선택이 얽힘) → 기능 지표로 비교. ASHRAE 표 원문 없음 → 수동 K 먼저. 1.0 수동 크기 유지가 덕트 이름으로 찾음 → 새 엔진은 안정 id.

### V2-2 SketchCAD 데크 지정 (SketchCAD 저장소) — **하지 않음(D11, 2026-10-26)**: 데크 지정은 2.0 안에서 한 번(V2-5.8). 아래는 기록용

**목표**: SketchCAD 한 파일에서 여러 데크를 정리하고, 데크(상위 레이어)마다 높이·층고·기준점을 정해 한 번에 넘긴다.

| 번호 | 작업 | 산출물 |
|---|---|---|
| 2.1 | 데크 표와 "데크로 지정" 도구(영역 선택 + 기준점 FR0·중심선), 레이어 패널 데크 ▸ 레이어 트리. 이름은 기존 `DECK`(갑판·천장 경계 용도)와 구별 | SketchCAD `SketchCAD.html` |
| 2.2 | 데크 필터 보기(지금 데크 / 위·아래 흐리게 / 모두) | SketchCAD |
| 2.3 | 여러 데크 JSON 내보내기: 데크 표, 경계 선(용도 STR·PNL·DECK), 격실(번호·이름·외곽) | 형식 `sketchcad-decks/1`, SketchCAD 문서 |
| 2.4 | HVAC Grid 변환기: SketchCAD JSON → BOX 프로젝트 JSON(z·층고·기준점 → `decks[].z/height/offsetX/offsetY`). ①에서 1.0 경로로 바로 열기 | `lib/io/sketchcad.cjs`, ① 리본 "SketchCAD 데크 열기" |
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
| 3.4 | 1.0 가져오기(계약 + PHG D 프로젝트 + BOX JSON → v2). 옛 `rules.heatingSupplyDeltaTK`는 버림(F-1) | `lib/io/v1.cjs` |
| 3.5 | 캔버스 코어: 보기(이동·확대·맞춤), 층 쌓기(래스터·벡터), 고르기, 스냅, 끌기, 선택, 데크 필터 | `app/canvas/` |
| 3.6 | 모듈 약속과 모듈 시험(`reads`·`writes` 밖 쓰기 금지, 모듈 간 호출 금지) | `app/modules/README.md`, `test/modules.test.cjs` |
| 3.7 | ③ `airflow`, ④ `ducts`, ⑤ `review` 모듈: 층·도구·패널 | `app/modules/{airflow,ducts,review}/` |
| 3.9 | 엔진 새로 짜기(D7, 1.0 `lib`는 기능 참조): 격실 풍량(F-1: 여름 하나, 겨울은 난방 용량)·구역 수지·전달 공기, 계통·공조기 데크·RU 배치, 수직 덕트·ESP, SOLAS II-2 분류·경계·관통부·제한 구역, 보고서·XLSX·통합 DXF·방화 등급도·계통도. 1.0 기준값과 차이표(D8) | `lib/engines/{airflow,systems,fire,output}/` |
| 3.8 | 이 단계의 도면 층: 모델의 격실·경계 선을 직접 그림(BOX 캔버스 바탕 끔). ①②는 아직 BOX | `app/modules/rooms/layer.js`(임시) |

**완료 기준**: ③④⑤가 한 캔버스에서 모듈로 돌고 단계 전환 때 보기·선택이 유지됨. 1.0 프로젝트를 열어 v2로 저장·다시 열기가 같음. 실행 취소 하나. 풍량·SOLAS·출력을 0.1 기준값과 비교한 차이표(D8), F-1 시험("one airflow all year" 같은 뜻의 새 시험) 통과.
**위험**: 셸 코드(142 KB)를 나누다 흐름이 깨짐 → 모듈 하나씩 옮기고 그때마다 e2e.

### V2-4 부하 엔진 · ② 모듈 (새로 짬 — [STUDY_CAL.md](STUDY_CAL.md))

**목표**: 부하를 숨긴 CAL 창 없이 새 엔진으로 계산한다. 입력은 모델(격실·경계 면·조건·K). 조사 결과 CAL은 형상을 계산하지 않고 BOX가 만든 면 행(A6) 위에서 경계 조건·K·부하만 계산한다 — 부하 계산은 얕게, 형상은 깊게 묶여 있다.

| 번호 | 작업 | 산출물 | 작업일 |
|---|---|---|---|
| 4.1 | 모델 입력 정의: `boundaries[]`에 방향(6면)·경계 종류(8종)·소유 격실 면적·z 구간·안정 면 키, `conditions.project/rooms/k`. V2-5 전까지는 1.0 BOX 면 행 → `boundaries` 어댑터(D9) | `lib/engines/load/input.cjs`, `lib/io/v1.cjs` 일부 | 2 |
| 4.2 | 경계 조건: 8종(인접·외기·해수·탱크·지면·비공조·사용자·오류), 프리셋, 면 재정의, 흘수선 해수, 용도 기본 조건, `isoClass` 추정 | `lib/engines/load/boundary.cjs` | 1.5 |
| 4.3 | K: 모드(프로젝트·ISO 적용·LY 적용·KU), LY 층 계산, 면 K 종류·직접 K. 값마다 ISO 7547 조항 번호(F-2, 원문 대조 전에는 "원문 미확인") | `lib/engines/load/k.cjs` | 1.5 |
| 4.4 | 격실 부하: 관류, 창, 일사 3방식, 인체, 조명(주광), 기기, 신기·ACH, 잠열 2방식, 안전율, 완료 판정 | `lib/engines/load/room.cjs` | 2.5 |
| 4.5 | 계통 신기, AHU 난방(주 히터·재열)·냉각 코일 — F-1: 풍량은 여름 하나(계약 풍량, D10), 겨울은 같은 풍량에 난방 용량, 22 K 초과는 확인 사항 | `lib/engines/load/ahu.cjs` | 1.5 |
| 4.6 | ② `load` 모듈: 부하 색 층(W/m²), 외기 면 표시, 조건·K 패널, 격실 부하표, K 변경 비교 | `app/modules/load/` | 2.5 |
| 4.7 | 시험: CAL 자체 시험 중 부하·K·습공기·AHU·ISO 구분·6.4.1 묶음을 같은 입력·기대값으로 옮김, S5 LOAD 7합계, 기준값 격실·면 비교와 차이 기록(`docs/v2/LOAD_DIFF.md`), K 변경, F-1 | `test/load.test.cjs` | 2 |
| 소계 | | | **14.5 (13~17)** |
| 4.8 | 부하 XLSX 수식판 — **V2-6 뒤(D12)** | `lib/engines/output/load-xlsx.cjs` | (+2~3) |

**완료 기준**: 4.7 통과(기준값 대비 차이표, 받아들일 범위는 K4에서 사용자가 정함 — D8), ②가 캔버스 모듈, F-1 시험(겨울 풍량 경로 없음) 통과.
**기준값**: `test/fixtures/v1-golden/<배>/faces.json.gz`(BOX 면 행, CAL이 받는 그대로) · `cal-loads.json.gz`(CAL 격실 부하 전체 필드) · `cal.json` · `loads.json`. 면별 K·ΔT 추적(`roomLoadInputTrace`)은 CAL 프레임 밖에서 부를 수 없어 담지 못했다 — 같은 값을 4.7에서 면 행 + 조건으로 다시 계산해 비교한다.

### V2-5 도면·격실 엔진 · 0·① 모듈 (새로 짬 — [STUDY_SKETCHCAD.md](STUDY_SKETCHCAD.md), STUDY_CAL 2장)

**목표**: 도면 읽기·정리·경계·실 찾기와 부하가 쓰는 면 행(경계 면)을 HVAC Grid 안에서 새 엔진으로 하고, BOX를 주 경로에서 뺀다. iframe 0개. SketchCAD는 기능 참조: 사용자가 2026-10-26 올린 최신 파일(sha256_16 `48354a74270b287c`, 데크·문·창·ROOMNAME 포함 — STUDY_SKETCHCAD 10장)과 main `8285aef`.

| 번호 | 작업 | 산출물 | 작업일 |
|---|---|---|---|
| 5.1 | DXF 읽기: Worker 바이트 스트림, 코드 페이지(UTF-8 → `$DWGCODEPAGE` → EUC-KR), 2패스(레이어 개수만 → 고른 레이어만 객체로), typed array | `lib/io/dxf-read.cjs`, `app/workers/dxf.js` | 3~4 |
| 5.2 | 레이어 용도·조선소 매핑 규칙(모델 `source.mapping`), 계산용 열기·정리 한 함수 | `lib/engines/geometry/mapping.cjs` | 1~1.5 |
| 5.3 | 경계 용도 지정(선마다 STR·PNL·DECKEDGE·HULL·OPENING, D13; SketchCAD `DECK`는 가져올 때 `DECKEDGE`) | `lib/engines/geometry/purpose.cjs` | 0.5~1 |
| 5.4 | 평면 그래프: 교차 분할, 꼭짓점 합침, 매달린 변, 문 틈(≤ 1 000 mm), 면 추적, 섬 = 구멍, 면 색인(SketchCAD의 15만 조각 잘림·반변 전체 검색은 따라 하지 않음) | `lib/engines/geometry/faces.cjs` | 3~4 |
| 5.5 | 실 찾기·지정·번호/이름 규칙·면적 거르기, 이웃 실 경계 | `lib/engines/geometry/rooms.cjs` | 2~3 |
| 5.6 | 면적표, 가져오기(SketchCAD JSON `sketchcad-rooms/1` — 데크 표·실별 데크·창·문 포함, SketchCAD 여러 데크 DXF 2010, "HVAC Grid용 DXF"·1.0) | `lib/io/sketchcad.cjs` | 1.5~2 |
| 5.7 | 큰 도면 래스터 층(색인 질의, 스타일 묶음, LOD, 이동 중 비트맵 재사용, 층별 그리기 시간) | `app/canvas/raster.js` | 2~3 |
| 5.8 | 데크로 지정 — 2.0 안에서 한 번(D11). 데크 표는 SketchCAD 최신 데크 모델(코드·이름·EL·층고, 모든 데크가 같은 좌표에 겹침)을 따름. 나란히 그린 도면(N3_ALL처럼)은 영역 + 기준점(FR0·중심선, D5)으로 같은 좌표에 옮김(SketchCAD에는 이 정렬이 없음). 데크 필터, D4 층고 검사 | `app/modules/drawing/` | 2~3 |
| 5.8b | 문·루버 문·창 읽기(SketchCAD 레이어 `DOOR`·`DOOR_LV`·`WIN`·JSON `windowsM`·`doors`; 그리기 명령은 넣지 않음): 창 → 부하 창 폭·소유 외벽의 기본값(높이·개수는 사람이 넣음, V2-4), 루버 문 → 전달 공기 출처 후보(사용자 지정 다음, 딸린 실·복도·공유 벽 규칙 앞, V2-3). 풍량 규칙은 그대로(F-1) | `lib/engines/geometry/openings.cjs` | 1~1.5 |
| 5.9 | 데크 상하 접촉(바닥·천장 다각형 교집합, z 허용 10 mm, 외기 판정) — BOX `deckStackIssues` 규칙과 같은 기능 | `lib/engines/geometry/stack.cjs` | 1.5~2 |
| 5.10 | 면 행(부하 입력): 벽 변 분할·판넬 간극 접촉·높이 패치, 외판(직선 — 데크 윤곽 수직, D12; 곡면 하부·상부 윤곽은 2.0 뒤), 흘수선 분할(해수·외기), 면적 보존 검사 — V2-4.1 어댑터를 대체(STUDY_CAL 2장) | `lib/engines/geometry/boundaries.cjs` | 2~3 |
| 5.11 | 0 `drawing`·① `rooms` 모듈 화면, BOX를 주 경로에서 뺌, 1.0 가져오기는 `lib/io/v1.cjs` | `app/modules/{drawing,rooms}/` | 2~3 |
| 5.12 | 시험·벤치: 면·실·경계 단위 시험, 20·100·200 MB 합성 벤치(0.6과 같은 도면), S5·T3·N3 격실·면 행 기준값 비교·차이 기록(D8) | `test/geometry.test.cjs`, 벤치 | 1.5~2 |
| 소계 | | | **약 23.5~33** (2026-10-26 SketchCAD 최신 파일 반영: 5.6 +0.5, 5.8b +1~1.5) |

**완료 기준**: 200 MB 합성 도면 → ⑤ 출력까지 한 프로그램, iframe 0개(G3·G4·G7). S5·T3·N3 격실(번호·면적·체적)·면 행을 0.1 기준값과 비교한 차이표, 받아들일 범위는 K5에서 사용자가 정함(D8).
**위험**: 실 찾기·면 행이 BOX·SketchCAD와 다름 → 다른 격실·면 목록을 사용자에게 보여 결정. 메모리(SketchCAD 200 MB에 2.8 GB) → 개수만 세는 첫 패스·고른 레이어만. 외판 곡면·판넬 간극 규칙이 가장 깊다(5.10).

### V2-6 정리 · 배포 · 매뉴얼

| 번호 | 작업 | 산출물 |
|---|---|---|
| 6.1 | 2.0 한 파일판·독립망 복사본 새로 구성(엔진 + 캔버스, 선택 편집기 PHG D는 따로 불러옴) | `tools/make-single.cjs`, `make-offline.cjs` |
| 6.2 | 성능표(0.6 기준 대비): AUTO 시간, 큰 도면, 크기, 메모리 | `docs/v2/RESULT.md` |
| 6.3 | 매뉴얼(워드·PPT), `AGENTS.md`에 2.0 항목, `docs/` 정리 | |
| 6.4 | 전체 시험 `npm run test:all`, N3 정기 시험 | |
| 6.5 | v2 → main 병합, 1.0 정리(D6) | |

**완료 기준**: 기획서 13장 지표를 채우고 G1~G9 충족, ASHRAE 이음쇠 표 원문 대조 끝("원문 미확인" 지움, D18), 검토 보고서 승인(K6).

## 5. 게이트

| 게이트 | 언제 | 확인할 것 | 결정 |
|---|---|---|---|
| K0 | 착수 전 | 기획서 검토, D1~D6 | 착수 여부 |
| K1 ✓ | V2-0 뒤 | 기준값, 조사 세 건, 다시 추정한 일정([REVIEW_V2-0.md](REVIEW_V2-0.md)) | 2026-10-26 D9~D14(권장안) |
| K2 ✓ | V2-1·V2-2 뒤 | AUTO 같은 답·시간([REVIEW_V2-1.md](REVIEW_V2-1.md)) | 2026-10-26 D15~D18(권장안) |
| K3 ✓ | V2-3 뒤 | 모듈 틀, 1.0 가져오기([REVIEW_V2-3.md](REVIEW_V2-3.md)) | 2026-10-26 D21~D25(권장안) |
| K4 | V2-4 뒤 | 부하 같은 답 | — |
| K5 | V2-5 뒤 | iframe 0, 큰 도면 | 출시 준비 |
| K6 | V2-6 뒤 | 지표, 전체 시험 | 출시(v2 → main) |

**K1 결정 사항**(V2-0 조사에서 나옴, [REVIEW_V2-0.md](REVIEW_V2-0.md) 5장 — 2026-10-26 모두 권장안으로 결정, [DECISIONS.md](DECISIONS.md) D9~D14):
1. V2-4 방식 — D7로 옛 선택지(떼어 내기 / 중간 단계)는 없어졌다. 새 부하 엔진의 입력을 (가) V2-5 전까지 1.0 BOX 면 행 어댑터로 받는다(권장) / (나) 면 행 형상 엔진(5.10)을 V2-4로 당겨 먼저 짠다.
2. AHU 난방에 쓰는 여름 풍량: 1.0에는 둘(BOX AHU의 실온 − 급기 온도 ΔT / HVAC Grid 계약 풍량) — 2.0은 HVAC Grid 계약 풍량 하나(권장).
3. V2-2: SketchCAD 단독판 데크 지정(D3)을 지금 할지, 2.0 안의 "데크로 지정"(5.8) 한 번만 만들지.
4. 일정(85~111일, K0의 1.6~1.8배): 그대로 / 범위 줄이기(예: 4.8 XLSX 수식판·1.9 편집기 교환을 V2-6 뒤로, 5.10 곡면 외판을 직선 외판 먼저).
5. 선 용도 이름: SketchCAD `DECK`(갑판 가장자리·천장 선)와 데크(층) 이름 충돌 — `DECKEDGE`로 바꿀지, HULL을 STR과 따로 둘지.
6. 압력의 ASHRAE 이음쇠 표: 원문이 없다(F-2). PHG D 표의 값을 기능 참조로 같은 값으로 쓸지(원문 미확인 표시), 원문을 구해 확인할지.

게이트마다 검토 보고서에 강제 항목 F-1·F-2를 "지킴 / 어김"으로 적고, 어긴 곳은 결함(P1)으로 올린다(`AGENTS.md`).

## 6. 시험·측정

| 무엇 | 도구 | 어느 단계부터 |
|---|---|---|
| 1.0 기준값(정답지, D8: 차이 기록) | `npm test`(기준값을 1.0 `lib`로 다시 계산) · `npm run golden:check`(1.0를 다시 돌려 비교) · `tools/engine-compare.cjs` | V2-0부터 |
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
| 도구 | `tools/v1-golden.cjs`, `phg-golden.cjs`, `golden-run.cjs`, `v2-baseline.cjs`, `engine-compare.cjs` (D7: 잘라 오는 도구 `extract-*`는 만들지 않음) |
| 엔진 | `lib/duct/*`, `lib/engines/{geometry,load,airflow,systems,fire,output}/` (모두 새로 짬, D7) |
| 모델·입출력 | `lib/model/{schema,graph,commands}.cjs`, `lib/io/{v1,sketchcad,dxf}.cjs` |
| 화면 | `app/canvas/`, `app/modules/{drawing,rooms,load,airflow,ducts,review}/`, `app/phg-worker.js` |
| 시험 | `test/fixtures/{v1-golden,phg-golden}/`, `test/{modules,load,io-sketchcad}.test.cjs`, e2e |
| 원본 저장소 | SketchCAD: 데크 지정·여러 데크 JSON(V2-2) |

## 8. 위험 관리

| 위험 | 신호 | 대응 | 단계 |
|---|---|---|---|
| 면 행 형상이 깊다(0.3 조사) | 4.7·5.12 면 행 비교 | V2-4는 1.0 면 행 어댑터로 먼저, 형상 엔진은 V2-5.10 | V2-4, V2-5 |
| 새 엔진이 1.0와 다른 답(D8) | 기준값 비교 | 차이표·원인 기록, 받아들일 범위는 게이트에서 사용자가 정함 | V2-1~V2-5 |
| 엔진 결과가 1.0와 다름 | 기준값 시험 실패 | 원인 기록, 사용자 확인 전에는 2.0 결과로 바꾸지 않음 | 모든 단계 |
| 셸 분해 중 흐름 깨짐 | e2e 실패 | 모듈 하나씩, 매번 e2e | V2-3 |
| 원본 프로그램이 계속 바뀜 | 기능 명세와 원본 main 차이 | 명세는 조사 때 판(PHG D 사본 `c3f7fa67380d1a2e`, SketchCAD `3df0ba8`(최신 `8285aef`도 기능 같음, 2026-10-26 확인), BOX `8892c20e503108f2`)으로 고정, 게이트 때 차이만 더함 | 모든 단계 |
| 일정 초과 | 게이트 때 추정 대비 1.5배 이상 | 다음 단계 범위 줄이기(예: V2-5의 0 모듈을 SketchCAD 연결로 대체) | 게이트마다 |
| 1.0와 2.0 갈라짐 | main 수정이 v2에 안 들어감 | 단계마다 main → v2 병합 | 모든 단계 |

## 9. 착수 전 할 일

1. 기획서 검토, 결정 D1~D6 기록(K0) — **완료**(2026-10-25, 권장안으로 결정, [DECISIONS.md](DECISIONS.md)).
2. `v2` 브랜치와 작업 폴더 `HVAC_Grid_v2`(worktree) 만들기.
3. V2-0 시작: 기준값 도구(0.1·0.2)와 조사 세 건(0.3~0.5)은 서로 독립이라 함께 진행할 수 있다.
