# PHG D 로직을 HVAC Grid lib로 옮기는 계획 (2026-10-25)

상태: Ver 2.0 기획의 일부(V2-1) — 검토 후 진행(2026-10-25). [PLAN_V2.md](PLAN_V2.md)

④ RU·덕트가 PHG D 화면(숨긴 iframe)을 거치지 않고, 경로(AUTO)·덕트 지정·크기·압력 계산을 `lib/`에서 직접 부른다.
사용자 결정(2026-10-25): PHG 원본을 엔진으로 고치는 대신 **HVAC Grid lib로 옮긴다**.

## 1. 지금 구조

```
HVAC Grid (app/shell.js, app/bridge.js)
 ├─ lib/            HVAC Grid 자체 로직: 계약(contract)·풍량(F-1)·계통·RU 배치(phg-plan)·SOLAS·보고서·DXF
 ├─ iframe BOX      vendor/BOX_CAL_Enhance.html (7.0 MB) ①② 도면 + ③④ 바탕 캔버스
 │   └─ iframe CAL  BOX 안의 CAL 패널: 부하 계산 (숨김, 셸이 단추를 대신 누르고 CAL_ENHANCE.report()로 값만 가져옴)
 └─ iframe PHG D    vendor/DuctConcept_PHG_D.html (1.5 MB) ④ 덕트 (숨김, 셸이 화면 조작으로 돌림)
```

④ 한 계통을 돌릴 때 셸이 PHG D에 하는 일(`app/bridge.js` `Phg`):

| 단계 | 지금 방법 | PHG D 안의 실제 로직 |
|---|---|---|
| 계통 보내기 | `lib/phg-plan.cjs`가 DXF를 만들고 → PHG D "DXF 가져오기" 창에 넣고 확인 클릭 → `placeRoot`·`placeRu` → 금지 구역 설정 | DXF 워커(V2 모듈 안), `duct-dxf-preparation`, `DuctConceptRouting.placeRoot/placeRu` |
| AUTO | `DuctConceptRouting.preview()` → 후보 고름 → `applyPreview()` | `duct-concept-routing-adapter`(198 KB, 입력 만들기·후보·적용) + `duct-concept-routing-engine`(88 KB, **워커에서 도는 순수 계산**) |
| 덕트 지정 | `makeDuctBtn` 클릭 → 변환 창 '적용' 클릭 | `LineDesignLegacy.previewDuctConversion/applyDuctConversion` → `createDuctsFromSelection`(화면 블록 440 KB 안) |
| 크기 계산 | `calculateBtn` 클릭 | `LineDesignV2.calculateTypedNetwork` → `createCalculationInput` → 계산 워커(V2 모듈 안, **순수**) → `applyCalculationResult` |
| 수동 크기 | `setDuctSize` → `calculateTypedNetwork` | 같음 |
| 압력 | `calculateSimplePressure` | V2 모듈 안 압력 계산 |

계산의 무거운 부분(경로 탐색, 크기·압력)은 **이미 화면 없는 워커 코드**다. 화면에 묶인 것은 그 앞뒤의 접착 코드(상태 만들기, 후보 처리, 덕트 변환, 결과 적용)다.

## 2. 목표 구조

```
lib/phg/                 tools/extract-phg.cjs가 vendor/DuctConcept_PHG_D.html에서 잘라 낸 사본(손으로 고치지 않음)
 ├─ routing-engine.cjs    duct-concept-routing-engine (+ weightedRouteCost, calculateWithMainSpine, calculateMinimumBranches)
 ├─ sizing-worker.cjs     duct-concept-native-sizing-worker
 ├─ typed-calc.cjs        V2 모듈의 계산 워커(크기·압력) 원문
 └─ helpers.cjs           PHGDWalls·PHGDCorridor·PHGDEnvelope·PHGDMinDuctPiece 등 경로에 쓰이는 PHG D 패치 함수
lib/phg-state.cjs        계획(plan) → PHG D 상태 객체 {entities, nodes, diffusers, ducts, settings} (DXF를 거치지 않음)
lib/phg-route.cjs        AUTO: 어댑터의 prepare / prepareRouting / 후보 / applyResult를 상태 객체에 대해 실행
lib/phg-ducts.cjs        덕트 지정(createDuctsFromSelection 이식), 크기 계산 입력·결과 적용, 압력
lib/phg-engine.cjs       ④가 부르는 한 개의 API
                           auto(plan, {pick, manual}) → {ducts, rus, root, result, candidates, zonesRelaxed}
                           resize(network, ductName, size) → 같은 모양
app/phg-worker.js        브라우저에서 lib/phg-engine을 Web Worker로 돌림(화면 멈춤 없음, 멈춤 단추 유지)
```

- **잘라 내는 사본, 손으로 고치지 않음**: BOX 예제(`extract:s5`)처럼 `npm run extract:phg`로 다시 뽑는다. 각 파일 머리에 원본 블록 id·vendor 해시를 적고, 단위 시험이 해시를 확인한다. PHG 원본이 바뀌면 vendor 사본을 바꾸고 다시 뽑는다(두 군데를 손으로 고치지 않기 위해).
- 손으로 쓰는 것은 `phg-state`·`phg-route`·`phg-ducts`·`phg-engine`의 접착 코드뿐이다. 어댑터가 화면에 기대는 곳(`LineDesignLegacy.renderEverything`, `DuctConceptRoutingWindow`, `DuctConceptAssistant`의 수동 Root·탭, `PHGPlacementOptions`, `document.createElement`, 이벤트)은 빈 함수로 막는다.
- Node(단위 시험, `tools/hvac-run.cjs`)에서는 워커 대신 같은 코드를 직접(또는 `worker_threads`로) 부른다.

## 3. 단계

| 단계 | 할 일 | 끝난 기준 |
|---|---|---|
| P0 기준값 | `tools/phg-golden.cjs`: 지금 PHG D 경로로 S5·T3·N3 모든 계통을 돌리며 ① loadPlan 직후 상태 ② 워커 입력·출력 ③ AUTO 후보 ④ 덕트(경로·종류·크기·풍량) ⑤ 압력을 `test/fixtures/phg-golden/`에 저장 | 기준값 파일, 지금 경로로 다시 뽑아도 같음 |
| P1 순수 계산 | `extract-phg.cjs` + 경로 엔진·크기 워커·V2 계산 워커를 `lib/phg/`로. P0의 워커 입력을 넣어 같은 출력이 나오는지 | 단위 시험: 워커 출력이 기준값과 같음 |
| P2 상태 | `lib/phg-state.cjs`: DXF 없이 격실 선·Root·RU·금지 구역·선체 밖을 상태로. DXF 가져오기가 만들던 엔티티(레이어, 닫힌 선, 정리 결과)와 같은 모양 | 단위 시험: P0 ①과 같음(id 정규화 후) |
| P3 AUTO | `lib/phg-route.cjs`: 어댑터 함수 이식, 후보 고르기·금지 구역을 단계적으로 푸는 규칙(`zonesRelaxed`)은 지금 `Phg.auto` 그대로 | 단위 시험: P0 ③ 후보·경로가 같음 |
| P4 덕트·크기·압력 | `lib/phg-ducts.cjs`: 덕트 지정, 크기 계산, 수동 크기 유지, 압력 | 단위 시험: P0 ④⑤와 같음(크기 mm, Pa 반올림 같음) |
| P5 ④ 전환 | `app/shell.js` `sendPlan`·`autoKey`·`reroute`·`resizeDuct`·`moveRu`·`runAll`이 `phg-engine`(워커)을 부름. ④에서 PHG D iframe을 띄우지 않음 | shell·T3·N3 e2e 통과, T3 18/18·N3 16/16 AUTO, ESP·팬 압력 값이 지금과 같음 |
| P6 밖으로 | `tools/hvac-run.cjs`를 브라우저 없이(노드만), 한 파일판·독립망 복사본에 `lib/phg` 포함, 문서(`docs/VENDOR_PATCHES.md`, `vendor/VERSIONS.json`, AGENTS 참고) | `test:single`, `offline-check`, 실행 시간 기록 |
| P7 정리 | `Phg` 브리지에서 ④가 안 쓰는 화면 조작(DXF 창, 단추 클릭) 삭제 | `npm run test:all` |

각 단계는 따로 커밋한다. P5 전까지 ④는 지금처럼 PHG D로 돌아가므로, 중간에 멈춰도 프로그램은 그대로 쓸 수 있다.

## 4. 정해야 할 것 (1은 2026-10-25 D1로 결정: 편집기를 남긴다 — [DECISIONS.md](DECISIONS.md))

1. **PHG D 편집기**(④ 리본 'PHG D 편집기', 손으로 경로·이음쇠 고치기)
   - (권장) P5 뒤에도 남긴다: 편집기를 열 때만 PHG D를 띄우고, lib 결과를 PHG D 프로젝트로 넣는다. 그러려면 `S.projects`(PHG D 프로젝트 JSON)를 lib 상태에서 만들어야 한다 — V2의 `serializeTypedProject` 형식. P4 뒤에 따로 판단.
   - 또는 편집기를 없애고 ④ 평면 편집(RU 끌기, 수동 크기, 다른 경로)만 둔다.
2. **저장 파일의 `projects`**: 지금 프로젝트 JSON은 계통마다 PHG D 프로젝트를 담는다(`phg/<deck__system>.phg.json`도 출력). 편집기를 없애면 lib 상태(덕트망)만 담고, 옛 파일의 `projects`는 읽을 때 덕트망으로 바꾼다.
3. **부하 계산(BOX CAL)**: 같은 구조(숨긴 CAL 패널 + 단추 대리 클릭 + `CAL_ENHANCE.report()`)다. 이번 계획에는 넣지 않는다. ①② 도면이 BOX이고 CAL이 BOX 도면 위에서 계산하므로, 옮기려면 BOX 도면 모델까지 다뤄야 한다. 덕트가 끝난 뒤 따로 판단.

## 5. 위험

- **V2 모듈이 압축(minify)되어 있다**(196 KB, 함수 이름이 한 글자). 계산 워커는 모듈 안에 문자열로 들어 있어 그대로 잘라 낼 수 있지만, `createCalculationInput`·`applyCalculationResult`는 압축된 본문에서 찾아 옮겨야 한다. P0의 워커 입력·출력 기준값으로 맞는지만 확인한다.
- **덕트 변환(`createDuctsFromSelection`)은 화면 블록(440 KB) 안**에 있다. 닫힌 범위의 도우미 함수를 함께 옮겨야 하고, 이 단계가 가장 크다.
- **DXF를 건너뛰면 엔티티 모양이 달라질 수 있다**(레이어 이름, 선 정리, 좌표 반올림). P2의 기준값 비교로 막는다. 맞추기 어려우면 `lib/phg-plan.cjs` `deckDxf` + V2 DXF 워커를 그대로 쓰는 쪽으로 물러선다.
- **PHG 원본이 바뀔 때**: 잘라 낸 사본은 `extract:phg`로 다시 뽑지만, 손으로 쓴 접착 코드가 기대는 어댑터 함수 이름이 바뀌면 깨진다. 해시 시험이 먼저 알린다.
- **F-1·F-2**: 풍량·부하 쪽은 바뀌지 않는다(덕트 크기·압력만 옮김). 압력·속도 기준값(마찰 상한, 속도)은 PHG D 값을 그대로 옮기고 새로 정하지 않는다.
