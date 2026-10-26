# PHG D 조사 — 다시 짤 경로·덕트·크기·압력 엔진의 기능 명세 (V2-0.4)

작성 2026-10-25 · 작업 V2-0.4([PLAN_V2_WORK.md](PLAN_V2_WORK.md) 0.4) · 대상 사본 `vendor/DuctConcept_PHG_D.html` sha256_16 **`c3f7fa67380d1a2e`**(`vendor/VERSIONS.json`, ceronfs/PHG be5ffb0) · 방향 [DECISIONS.md](DECISIONS.md) **D7**(처음부터 새로 짠다, PHG D는 기능 참조) · **D8**(기능이 같으면 된다, 차이는 기준값과 비교해 기록) · D1(PHG D 편집기는 선택 편집기로 남김)

- 줄 번호는 `vendor/DuctConcept_PHG_D.html:<줄>`, 괄호 안은 `<script id>` 블록. 압축된 V2 모듈(969–1011)은 함수 이름이 한 글자라 `줄 + 압축 이름`으로 적는다.
- **F-2**: 이 환경에는 표준 원문(ISO 7547:2022 PDF, ASHRAE Duct Fitting Database, SOLAS)이 없다. 아래에 나오는 표준 조항·값은 모두 PHG D·1.0 코드에 적힌 것을 옮긴 것이며 **"원문 미확인"**이다. PHG D의 속도·최소 길이 기본값은 표준을 인용하지 않는 프로그램 기본값이다.
- **F-1**: 이 엔진은 RU 풍량을 계획(`lib/phg-plan.cjs`, 계약의 여름 풍량)에서 받기만 한다. 난방·겨울 풍량 입력이 없다. 새 엔진도 RU 풍량 입력 하나만 둔다(겨울 풍량 경로를 만들지 않음).

## 1. 결론

| 항목 | 내용 |
|---|---|
| 순수 계산과 접착의 비율 | 경로 탐색 엔진(`duct-concept-routing-engine`, 89 KB)과 크기 워커(`duct-concept-native-sizing-worker`, 13 KB)는 화면 없는 순수 코드. 어댑터(`duct-concept-routing-adapter`, 205 KB) 중 `weightedRouteCost`·`calculateWithMainSpine`·`calculateMinimumBranches`(약 25 KB)는 워커로 직렬화되는 순수 코드, 나머지(입력 만들기 `prepare`, 결과 적용 `applyResult`, 위상 정리, 후보·적용)는 `LineDesignLegacy` 상태에 묶인 접착이다. 압력(V2 모듈 안 약 25 KB)은 순수지만 압축되어 있고 ASHRAE 피팅 표를 담는다. 덕트 지정(`createDuctsFromSelection`, 레거시 화면 블록 450 KB 안)은 화면 상태에 묶여 있다. 대략 **계산 40 % · 접착 60 %**(어댑터 기준) |
| 1.0 경로의 특징 | AUTO 결과를 덕트로 바로 쓰지 않고 **AUTO → 선(AUTO_ROUTE 엔티티) → 덕트 지정(AD) → 크기 계산을 두 번** 거친다(미리보기 때 한 번, 지정 뒤 한 번). 1.0 입력(빈 덕트망 + Root + RU)에서는 변형이 하나뿐이라 **후보가 늘 1개**다(S5 18/18 계통 `candidates: 1`) — "다른 경로"는 사실상 쓰이지 않는다 |
| 새로 짤 것 | ① 계획 → 경로 입력(실·복도·금지 구역·선체 밖·포트) ② 격자 A*(방향 상태, 꺾임 비용, 엘보 사이 최소 직관) ③ 덕트망 계획(Prim 순서로 RU를 하나씩 붙임, 접속점 규칙 300/500 mm, 십자 Tee 금지, 실 묶음, 완화 재시도) ④ 주관 척추 후보와 가중 비용 선택(복도 우선) ⑤ 금지 구역 단계 완화(1.0 브리지 규칙) ⑥ 덕트 지정(종류·이름) ⑦ 크기(풍량 누적·사각/원형 선정) ⑧ 압력(마찰·엘보·분기/합류·RU, 임계 경로) ⑨ D1 편집기용 PHG D 문서 3.0.0 내보내기·되읽기 |
| 그대로 쓰지 않아도 되는 것 | DXF 가져오기(엔진은 계약의 실 다각형을 직접 받으면 됨), 미리보기 가상선 편집, 계통 비교 창, 풍량 초안, 압력 균형(1.0가 부르지 않음), 소음 |
| V2-1 추정 | 처음부터 짜면 **18~22 작업일**(계획서의 8~12일은 "잘라 오기" 전제). 8장 표 |

## 2. 1.0가 PHG D를 부르는 길

`app/bridge.js` `class Phg`(309–440). 셸(`app/shell.js` `sendPlan` 284, `autoKey` 295, `runAll` 313, `reroute` 334, `resizeDuct` 342, `moveRu` 353)이 아래를 부른다.

| 브리지 단계 | 브리지가 하는 일 | PHG D 안에서 실제로 도는 것 |
|---|---|---|
| `load` | 숨긴 iframe에서 PHG D를 열고 빈 프로젝트를 `serialize()`로 받아 둠(`blank`) | `LineDesignV2.serializeTypedProject` → V2 `toDocument`/`Uo`(969) |
| `loadPlan(pl, dxf)` 1 | `open(blank)` → `loadTypedProjectJson` + `renderEverything` | V2 `loadJson`(993)·`Vo`(969) |
| 2 | `fileInput`에 DXF `File`을 넣고 `dxfImportOptionsDialog` 제출 단추 클릭, 엔티티가 생길 때까지 대기 | `duct-concept-routing-dxfImport`(16969): 대화상자 → V2 DXF 워커(`so`, 998) → `DuctDxfPreparation`(474, **y 뒤집기** `normalizeEntity` 486) → `loadParsedDxf`(이때 `settings.routingForbiddenZones` 삭제) |
| 3 | `R.placeRoot({x,y})`, Root에 `pressureFlowMode`(supply/exhaust)·`memo`(`[y=BOX]` 표시) | `place('root')`(13410): 격자(`settings.grid.minorMm`=100) 맞춤, 같은 위치 노드 거부, 노드 `AR-N-n` |
| 4 | RU마다 `R.placeRu({x,y,flowCmh})`, RU `memo = 'HVAC Grid <ruId>'` | `place('diffuser')`: 노드 + diffuser `AR-RU-n`, 그룹 `G001` |
| 5 | `settings.routingForbiddenZones` = 제한 구역(`HG-n`, 50 mm 안쪽으로 줄인 실, `lib/phg-plan.cjs` AVOID — SOLAS II-2/9.7.2 근거라고 적혀 있음, 원문 미확인) + 선체 밖(`HG-OUT-n`) | `DuctConceptZones.read`(17046) |
| `auto({pick})` 1 | 금지 구역 4단계 시도: 전부 → 선체 밖만 해제(`outside`) → 제한 구역만 해제(`rooms`) → 모두 해제(`all`). 첫 후보가 모든 RU에 닿으면 멈춤 | `DuctConceptRouting.preview({timeoutMs:120000})`(15288) |
| 2 | 좋은 후보(미접속 RU 0) 중 `pick % n`번째 → `applyPreview(id)` | `applyPreview`(15515) → `applyAutoRouteEntities`(9869): AUTO_ROUTE 레이어 선 |
| 3 | `autoRoute` 엔티티 전부 선택 → `makeDuctBtn` 클릭 → 변환 창 `phgb-conversion-apply` 클릭 | `duct-phgb-controller`(17351)가 단추를 가로챔(17630) → `prepareConversion`(17410)/`applyConversion`(17419) → `createDuctsFromSelection`(5744) |
| 4 | `calculateBtn` 클릭, 모든 덕트에 단면이 생길 때까지 대기 | 컨트롤러 `calculate`(17433): 연결 검토 `PHGBModel.analyze`(365) → `LineDesignV2.calculateTypedNetwork('')` → V2 그래프 워커 |
| `setDuctSize(id, size)` | 덕트에 `manualSize`·단면을 쓰고 `calculateTypedNetwork('')` | 크기 워커가 수동 단면을 유지 |
| `result()` | RU·풍량·덕트 수·길이·종류별 수, `indexPa = round(max(paths.totalPressureLossPa))` | `LineDesignV2.calculateSimplePressure({})`(1009 `de`) — **빈 설정 = 기본값**(저장된 압력 설정을 쓰지 않음, RU 전단 댐퍼 없음). 부를 때마다 RU에 압력 필드를 쓰고 결과 창을 엶(부작용) |
| `geometry()` | 덕트(id·이름·종류·단면·풍량·수동·점), RU, Root. y = −BOX y | 상태 읽기 |
| `open/serialize/changedSince` | 계통별 PHG D 프로젝트(`S.projects[key]`) 저장·열기, 편집 여부 비교 | `serializeTypedProject`/`loadTypedProjectJson` |

좌표: PHG D 앱 y = −DXF y. 1.0는 `PL.deckDxf(…, {cad:true})`(DXF y = −BOX y)를 보내므로 앱 y = BOX y이고 Root memo에 `[y=BOX]`를 붙인다(`bridge.js` 308·336–363). 새 엔진은 처음부터 BOX y 하나로 계산하면 된다.

## 3. 기능 명세

### 3.1 상태와 입력

경로 계산 전에 어댑터 `prepare`(13587–13855)가 PHG D 상태를 엔진 입력(RouteModel)으로 바꾼다. 새 엔진은 계획(`lib/phg-plan.cjs` `plan()`)에서 같은 정보를 직접 만든다.

| 입력 | PHG D에서 오는 곳 | RouteModel에서 | 새 엔진에서 |
|---|---|---|---|
| Root 1개 | `nodes[type=root]`(`rootFor` 13512: 여럿이면 선택된 것, 아니면 오류) | `systems[0] = {id:'SYS', priority:90, rootNodeId, root}`, 노드 `ROOT` | 계획 `root` |
| RU | `diffusers` + 말단 노드. 풍량 ≥ 0, 노드와 좌표 같음, 덕트 하나 이하 | 노드 `TERMINAL`, `flowCmh`, `required:true`, **포트** `{direction:'AUTO', leadLengthMm: RU 직선거리 + 기호 반폭}` | 계획 `rus`(F-1: 여름 풍량) |
| RU 직선거리 | `settings.aroute.ruRunoutMm`, 기본 **800 mm**(`duct-routing-preferences` 908), 0–5000 | 포트 `leadLengthMm` — RU에서 이 길이만큼 곧게 나간 뒤 꺾음 | 설정 |
| 기존 덕트 | 선택 Root에 이어진 덕트 → `edges`(LOCKED, `nativeRole`); 다른 망 → 얇은 장애물 `PROTECTED-*` | 1.0는 빈 망이라 없음 | 수동 덕트를 지원하면 같은 규칙 |
| 금지 구역 | `settings.routingForbiddenZones[]` {id, name, polygon, clearanceMm, enabled} | `routingZones[FORBIDDEN]` + (이격>0) `obstacles` | 계획 `avoid[].zone`, `outside` |
| 벽 | `settings.phgdWallLayers`(선택한 DXF 레이어의 선 → 폭 2 mm 장애물 `WALL-n`, 13833; `phgd-walls-script` 18682). **1.0는 설정하지 않음 → 배경 도면은 장애물이 아님** | `obstacles` | 선택 기능(실 벽을 장애물로). 기본 끔이 1.0와 같음 |
| 복도("복도 우선 주관") | 배경 엔티티의 TEXT/MTEXT가 복도 이름(`ALLEY, ALLEYWAY, CORRIDOR, PASSAGE, PASSAGEWAY, 복도, 통로`, 영문은 단어 단위·한글은 포함)이면 그 글자를 둘러싼 가장 작은 닫힌 선, 아니면 상하좌우 가장 가까운 선의 상자(`phgd-corridor-script` 18736, `PHGDCorridors`) | `routingSettings.corridorMain = {penalty:1, corridors:[{name, source, polygon}]}` | 계약 실 중 `isCorridor`(`lib/contract.cjs`)의 다각형을 그대로 — 글자 찾기가 필요 없음 |
| RU의 실 | `PHGDRooms.index(entities).roomAt(RU)`(같은 방법). 같은 실로 판정된 RU를 합집합으로 묶음, 복도 실 표시 | `routingSettings.ruRooms = {byRu:{노드→ROOM-k}, shapes:{ROOM-k:{corridor, polys:[{pts,min/max}]}}}` | 계획 `rus[].roomId` + 실 다각형 |
| 기호 상자 | Root/RU에 `symbolWidthMm/HeightMm`가 있을 때(1.0 없음) | 장애물 `SYMBOL-*`(자기 리드만 통과) | 생략 가능 |
| 격자 | `gridMm` 기본 **200 mm**(10–5000). **AUTO 격자 자동 확대** `PHGDAutoGrid`(260): 예상 셀 수 × 2 ms가 제한시간의 절반을 넘으면 250·300·400·500·600·800·1000·1200·1500·2000 중 맞는 첫 값 | `canvas.routingGrid` | 같은 규칙을 시간 대신 셀 수 상한으로(기계 속도와 무관하게) |
| 캔버스 | 노드·덕트·금지 구역(+이격) 범위 + 여백 max(3 격자, RU 직선거리+기호 반폭+격자); 원점 이동 `offset`, 좌표 1e-6 반올림; 셀 수 > 400 000이면 `CANVAS_TOO_LARGE`(엔진 자체 한도 500 000) | `canvas {width,height,routingGrid,snapGrid:1}` | 같음(원점 이동은 엔진 안에서만) |
| 규칙 값 | 아래 표 | `routingSettings` | 설정 |

`routingSettings`(13766–13799) — 1.0가 실제로 쓰는 값:

| 키 | 값(기본) | 출처 설정 | 뜻 |
|---|---|---|---|
| `connectionMode` | `TRUNK_BRANCH` | 고정 | RU를 하나씩 기존 망에 붙임(RU는 잎) |
| `costWeights` | main {length 1.3, bend 3000}, branch {1.1, 1500}, subBranch {1, 600} | `settings.aroute.costWeights`(12832) | 후보 선택용 가중 비용(3.2 ⑤) |
| `minDuctPieceMm` | **500** | `settings.phgdMinDuctPieceMm`(`phgd-duct-min-script` 18826) | 새 주관·분기관 피팅 사이 최소 길이 |
| `minElbowRunMm` | **500** | `phgdMinElbowRunMm` | 양 끝이 엘보인 직관 최소 길이 |
| RU 잎 최소 | **300**(고정, 13063) | — | RU 말단 덕트(서브 브랜치) 최소 길이 |
| `autoGroupSpacingMm` | **2000** | `aroute.ruGroupSpacingMm` | 이 거리 안의 RU를 한 BR로 묶음(주관 정책이 없을 때) |
| `roomGroupMaxMm` | **8000** | `phgdRoomGroupMm` | 같은 실 RU 묶음 최대 거리 |
| `ductEnvelope` | 보온 25, 설치 여유 25, 종류별 sizing, 원형 지름 목록, RU 노드별 풍량 | `phgdDuctWidthRouting`(기본 켬), `phgdInsulationMm`, `phgdInstallClearanceMm`, `settings.sizing` | 풍량으로 덕트 폭을 추정해 반폭+보온+여유만큼 띄움 |
| `corridorMain`, `ruRooms` | 위 표 | `phgdCorridorMain`, `phgdRoomBranch`(기본 켬) | |
| `crossingPolicy` / `clearanceDefault` | `FORBIDDEN` / 0 | 고정 | 같은 계통 교차 금지, 기본 이격 0 |
| `maxGlobalIterations`·`maxReroutePerEdge`·`maxReroutePerSystem` | 3 · 2 · 8 | 고정 | 계통 간 재배선(1.0는 계통 하나라 거의 안 씀) |
| `useCorridors` / `useCongestion` | false / false | 고정 | 엔진 자체의 복도 가중(0.75)·혼잡 비용은 끔. 복도 우선은 `corridorMain`이 가중 비용으로 처리 |

### 3.2 AUTO 경로

전체 흐름(`preview` 15288 → `runCandidate` 14885, 단계 표시 "1/3 · 직교 경로와 분기 연결…"):

1. 옵션: 수동 Root·수동 접속점(`DuctConceptAssistant`), 자동 격자(`PHGDAutoGrid`). 변형 목록: 주관 덕트가 없으면 `[0]`(1.0), 주관이 있으면 0–7, 주덕트 지정이면 0–2(15305–15306).
2. 변형마다 `runCandidate(stageOnly)`: `prepareRouting`(14245) → 경로 워커 → `applyResult`(14740) → 검증(`validateMinimumBranches` 13289, `verifyTrunk` 14419, `validateRouteGeometry` 12663) → 크기 워커(풍량·단면, 미리보기용) → 금지 구역 검사(`DuctConceptZones.assertNetwork`) → 묶음(bundle).
3. 후보 설명(`candidateDescription` 15219), 경로가 같은 후보 제거(단순화한 경로 서명), 정렬: 미접속 RU 수 → 300 mm 예외 유무 → 가중 비용 → id(15359).
4. `applyPreview(id)`(15515): 최종 형상 다시 검증(`validateFinalPreview` 15470: RU 직선거리 확인, 노드 포트 0으로 다시 `prepare` + `Validator.validate`, 가중 비용 재계산) → **덕트망을 바꾸지 않고** 생성 경로를 AUTO_ROUTE 선으로만 넣음(`entityOnly`).

경로 워커가 도는 함수(워커 코드 = 엔진 블록 글자 + 세 함수의 `toString()`, 13311–13314):

**① `calculateMinimumBranches(raw, phgdGiven)`**(13062–13280) — 엔진의 접속 후보·자르기 두 함수를 감싸 접속 규칙을 넣고, `calculateWithMainSpine`을 부른 뒤 완화와 측정을 한다.

| 규칙 | 내용 | 줄 |
|---|---|---|
| RU 잎 300 mm | 새 RU 말단 덕트 ≥ 300 mm. 접속점 후보에 "모자란 길이만큼 옆" 위치를 더함 | 13063, 13187–13188 |
| 주관·분기관 조각 500 mm | 새 덕트를 피팅(Root·분기점) 사이에서 자를 때 양쪽 조각 ≥ `minDuctPieceMm`. 반대쪽으로 엇갈린 Tee는 300 mm까지 허용 | 13067–13080 |
| 엘보 인접 직관 | 접속 구간 마지막 직선 ≥ `minElbowRunMm`, 기존 꺾임에서 그만큼 떨어져 분기 | 13083–13094 |
| 십자 Tee 금지 | 이미 덕트 3개가 모인 분기점에는 붙이지 않음 | 13086 |
| RU 묶음(주관 없음) | 미접속 RU를 합집합으로: 거리 ≤ `autoGroupSpacingMm`, 또는 같은 실(벽 없음·`ruRooms` 같은 키)·≤ `roomGroupMaxMm`. 다른 실은 묶지 않음 | 13101–13128 |
| ML → BR → SBR | 다른 묶음의 덕트에는 붙지 않음, 묶음의 첫 RU 뒤로는 그 묶음 덕트에만 붙음 | 13129–13136 |
| 남의 실 금지 | 다른 RU 실(복도·Root 제외) 안의 덕트에서 분기하지 않음 | 13109–13114 |
| 목표 구간 | `PHGD_TAP_OK`: 목표가 덕트 위의 점이면 그 선분 위 아무 유효 점이나 도착점(A* 목표 구간) | 13221–13228 |
| 완화 재시도 | 연결 못 한 RU만 `relaxedTerminals`로 규칙(300·500·엘보·십자 Tee·묶음)을 풀고, 만든 망을 이어받아 `calculateWithMainSpine` 한 번 더 | 13232–13238 |
| 부분 결과 | 남은 문제가 "미접속 RU"뿐이면 그 RU를 `required:false`로 한 부분망을 결과로(`partialResult.unconnectedTerminalIds`) | 13265–13277 |
| 측정 | `minimumSubBranch`, `minimumDuctPiece`, `minimumElbowRun`, `autoRuGroups`, `crossTees`, `ductEnvelope`(`PHGDEnvelope.check`), `corridorMain`(`PHGDCorridor.metrics`) | 13239–13261 |

**② `calculateWithMainSpine(raw)`**(12983–13059) — 새 망(기존 덕트 없음)·계통 하나·RU ≥ 3일 때만.

1. 기준망 `Duct.Orchestrator.calculate(raw)`(검색 예산 무한).
2. 축 x, y마다: 교차 좌표 후보 = Root의 좌표, RU 중앙값(그 선 위에 RU가 있으면 ±격자), 복도 밴드 안이면 복도 척추 값만(`PHGDCorridor.spines` 12137: 축 방향 복도에서 중심선에 가깝고 주관 반폭이 복도 안에 들며 RU와 300 mm/리드 이상 떨어진 격자 값, Root 선이 맞으면 포함).
3. 값마다 척추 씨앗: Root → (Root, 교차 좌표) 분기점 → 축 양 끝(lo, hi)까지 MAIN 간선(`plannedSpine`). RU를 지나거나 주관 반폭이 막히면 버림. `Orchestrator.calculate`(예산 12 000 000 확장, 실패 RU 하나면 중단 `PHGD_ABORT_ON_FAIL`).
4. 쓰이지 않은 척추 끝 제거, 척추 = MAIN·나머지 = BRANCH, 척추가 축 범위의 70 % 미만이면 버림, 검증, 길이 > 기준 × 1.6 또는 주관 꺾임 > 기준이면 버림.
5. 가중 비용 `weightedRouteCost` 최소(동점: 주관 꺾임 → 길이 → 축 → 값) 선택.
6. 병렬(`phgdRoutingTask` 13354): 코어 수 −1(최대 8) 레인. 워커 1개 `baseline`, 나머지가 척추 후보를 `spec % of === k`로 나눠 계산 → 주 스레드가 같은 규칙으로 합침 → 고른 망을 `phgdGiven`으로 워커 하나가 마무리(완화·측정). 코어 < 3·RU < 3·기존 덕트가 있으면 워커 하나.

**③ `weightedRouteCost(project, weights)`**(12851–12900) — 후보 고르기용(압력 계산이 아님).

| 항 | 계산 |
|---|---|
| 역할 | Root에서 너비 우선. 간선 역할 = `nativeRole`, RU에 닿으면 subBranch, `routeRole MAIN`이면 main, 그 밖 branch |
| 길이 | 맨해튼 길이 × `weights[role].length` |
| 꺾임 | (간선 안 꺾임 + 노드에서 들어온 방향과 다른 출발) × `weights[role].bend` |
| 수력 대용 | 길이 × 속도² / 1000 × 0.02(단면이 없으면 0 — 워커 안에서는 늘 0) |
| 덕트 폭 간섭 | `PHGDEnvelope.check` 간섭 수 × 20 000 |
| 복도 밖 주관 | 복도 밖 주관 길이 mm × main 길이 가중 × penalty(1) |

**④ 엔진 `Duct`**(`duct-concept-routing-engine` 11838–12562, `MST_GRID_ASTAR_1.2.0_MM_COST`, `scope.Duct` 12561):

| 부분 | 기능 | 줄 |
|---|---|---|
| `normalize` | 입력 검사: 단위 mm, 캔버스 정수, 셀 ≤ 500 000, id 중복, 좌표가 캔버스 안, 노드 종류, 포트, 구역 종류(PREFERRED/ALLOWED/RESTRICTED/FORBIDDEN/CORRIDOR/CROSSING_ZONE/RESERVED), 직교만 | 11931–11999 |
| `NetworkPlanner.plan` | **Prim 순서**: Root에서 시작, 방문 집합과 남은 RU 사이 맨해튼 거리가 가장 짧은 RU부터(동점은 id). `terminalOrder`가 있으면 그 순서 | 12062–12085 |
| `connectionTargets` | 기존 망의 노드·선분 위 가장 가까운 점(포트 리드만큼 끝에서 띄움, RU 끝점에서는 격자만큼), 거리순 6개(두 번째 바퀴 24개) | 12042–12061 |
| `connectionCandidates` | 템플릿 `DIRECT`, `ORTHOGONAL_X`, `ORTHOGONAL_Y`(포트 리드 포함) + `ASTAR`를 같은 비용으로 비교. 템플릿이 없으면 A*만 | 12287–12306 |
| `RouteEngine.route` | 포트 `AUTO`는 네 방향을 다 해 보고(하한 비용으로 가지치기) 가장 싼 것. 포트 리드 구간을 먼저 곧게 | 12232–12264 |
| `search`(A*) | 격자선(격자 배수 + 양 끝 좌표) 위 상태 = (점, 도착 방향 4 + 시작). 걸음 비용 = `SpaceManager.step`, 꺾임 +`WEIGHTS.bend` 1200, 되돌림 금지. 휴리스틱 = 맨해튼 × 최소 가중 + (두 축이 다르면 꺾임 1회) × 0.75 또는 1. 목표 구간이면 구간까지 거리 | 12307–12356 |
| 엘보 사이 최소 직관 | 먼저 규칙 없이 찾고, 위반이면 꺾은 뒤 `minElbowRunMm`만큼 한 번에 나아가는 탐색(비용 상한 = 평이한 경로 × 1.5 + 꺾임 6회) | 12266–12274, 12341–12347 |
| `SpaceManager.step` | 정적 검사(장애물까지 거리 < 이격 + 덕트 반폭, 금지 구역까지 거리 < 반폭, 잠긴 노드), 같은 계통 겹침·교차(분기 접속점만 허용), 덕트 폭 평행 간섭(`DUCT_ENVELOPE_PARALLEL`). 비용 = 길이 × (1, 복도 0.75, 제한 2) + 편차 × 0.8 + 교차 × 2500 + 평행 0.003/mm + 근접 0.004/mm (+혼잡 0.01/mm, 1.0 끔) | 12150–12222, `WEIGHTS` 11845 |
| 덕트 폭 추정 `PHGDEnvelope` | 반폭 = 추정 평면 폭/2 + 보온 + 설치 여유. 추정 폭: 원형이면 목록에서 속도 이하 첫 지름, 사각은 W 100~, H min~ 50 mm 단계에서 크기 워커와 같은 점수(속도 차·종횡비). 경로를 찾는 중에는 지금 붙이는 RU 풍량·`branch`, 완성망 검사에서는 하류 RU 풍량 합·역할 | 12088–12118 |
| `trimConnection` | 후보 경로가 기존 망에 처음 닿는 곳에서 자름(RU·잠긴 선 위 금지, 포트 보존) | 12361–12379 |
| `attach` | 접속점이 선분 중간이면 선분을 나눠 `BRANCH_NODE J-…` 추가, RU까지 간선(노드가 Root면 MAIN) | 12021–12035 |
| `Orchestrator.calculateConnections` | 사전 검사 → 2바퀴 × Prim 순서로 RU마다 후보 → 비용 최소 붙이기 → 검증·`networkSegments`·`measureCost` | 12477–12518 |
| `Validator.validate` | 미접속 필수 RU, 충돌, 금지 구역 침범, 잠긴 경로, 이격, 분류 안 된 교차, 형상, 포트, RU 차수(TRUNK_BRANCH에서 RU는 간선 1개) | 12381–12418 |
| `ConflictEngine.repair` | 계통 간 비켜 다시 찾기(반복 ≤ 3) | 12447–12470 |

결과 형식(워커 출력): `{project(간선·노드), validation{pass, counts, issues, crossings, metrics, networkStatus}, metrics{expandedNodes, peakOpenSet, rerouteIterations, globalCost…, weightedCost, weightedSelection, mainSpine, minimumSubBranch, minimumDuctPiece, minimumElbowRun, autoRuGroups, crossTees, ductEnvelope, corridorMain, routingTimeMs, phgdParallel}, failed[], connections[], failureDetails[], partialResult?, fullValidation?}`.

**⑤ 후보 이름**(15250–15260): `직교 연결 후보 n` (+ `· 주관 유속 초과 k구간`, `· RU 공유 가지 k개`, `· 미접속 RU k개`, `· 300mm 미만 k개`, `· 주관·분기관 500mm 미만 k개`, `· 주관 복도 경유 p%`, `· 덕트 폭 간섭 k곳`, `· 십자 Tee k개`, `· RU 묶음 a/b개`, `· 엘보 인접 직관 500mm 미만 k개`). 후보 필드: `id`(`PREVIEW-<세대>-<순번>`), `label`, `rootId`, `unconnectedRuIds`, `targetRuIds`, `routes[]`(id·점·종류·편집 범위), `lengthMm`, `bends`, `newDuctCount`, `minimumSubBranch`, `weightedCost`, `calculation.totalFlowCmh` 등.

**⑥ 금지 구역 단계 완화**(1.0 브리지 `auto` 375–386): 시도 순서 [전부, 제한 구역만(선체 밖 해제 → `outside`), 선체 밖만(제한 구역 해제 → `rooms`), 없음(`all`)], 구역 수가 줄지 않는 시도는 건너뜀. "좋음" = 첫 후보의 `unconnectedRuIds`가 비었음. 끝까지 좋은 것이 없으면 첫 후보가 나온 시도로 되돌아가 다시 미리보기. 결과에 `zonesRelaxed`. 새 엔진은 이 규칙을 엔진 API 안으로 넣는다.

**⑦ 1.0에서 쓰지 않는 AUTO 기능**: 사용자 주관 모드(`USER_MAIN`, `prepareUserMain` 14080, 변형 0–7과 실패 묶음 이웃 탐색 15344–15349), 가장 가까운 주관 접속(`createNearestMainTaps` 13927), 주덕트 중간 분기(`trunkDuctId`), 수동 접속점, 미리보기 가상선 편집(`applyPreview(id, {routes})`, 꺾임 ≤ 2, 15532–15606), `connectSelection`(15191). D1 편집기에서만 의미가 있다.

### 3.3 덕트 지정

1.0에서는 두 번 일어난다.

1) **미리보기 안**(`applyResult` 14740): 워커 노드 → 새 분기점 `AR-N-n`(같은 좌표 하나로 합침), 간선 → 덕트 `AR-D-n`(길이 0·중복 제거). 종류:
   - RU에 닿는 간선 → `sub_branch`
   - 하나의 RU 묶음만 먹이는 간선 → `branch`
   - RU 묶음이 있으면(주관 정책 없이) 나머지 → `main`
   - 아니면 `routeRole MAIN` → `main`, 그 밖 → `branch`
   - 꺾인 덕트는 직선마다 나눔(`splitGeneratedDuctSegments` 14482, 꺾인 점에 분기점). 서브 브랜치는 RU 쪽 마지막 직선만 `sub_branch`, 앞 직선은 `branch`. 이름 `<원래> / i`, `metadata.segmentGroupId`
   - 겹침·교차 정리 `reconcileGeneratedDuctTopology`(14671)
2) **적용 → AD**: `applyAutoRouteEntities`(9869)가 미리보기 덕트마다 `{suggestedRole: 종류}`를 단 선(AUTO_ROUTE, 2점이면 LINE)을 만들고(이미 덕트·AUTO 선이 덮은 구간은 뺌, 빠진 구간이 있으면 취소), 브리지가 그 선을 모두 골라 AD → `createDuctsFromSelection`(5744):
   - `prepareUniqueDuctPaths`(5680): 역할 순(main → branch → sub_branch)으로 정렬, 선끼리 교차·끝점에서 끊고 이미 덮인 원자 구간 제외(허용 오차 = 격자 minor × 0.02, 0.5–5 mm, 5433)
   - 같은 선의 이어진 원자 구간을 한 경로로(다른 선 2개 이상이 만나거나 팔이 3개 이상인 점에서는 끊음)
   - 경로 끝 노드: 허용 오차 안의 기존 노드(Root·RU·분기점), 아니면 필요할 때만 새 분기점
   - `createDuct`(5832): 기본 종류(RU에 닿으면 sub_branch, 아니면 branch) → `suggestedRole`이 있으면 `type = manualType = suggestedRole`
   - `splitDuctsAtConnectionNodes`, `syncModelSemantics`(8597): 그룹 전파, **이름** `M-D-n`(주관), `<그룹>-D-n`(나머지, 그룹 기본 `G001`), 기존 번호 유지(be5ffb0 D8 "stable duct names")
3) **풍량**: RU 풍량을 Root에서 너비 우선 순서의 역순으로 부모 덕트에 누적(크기 워커 `k`, 3.4).

새 엔진에서는 1)과 2)를 한 번에 한다: 경로 간선 → 직선 조각 덕트(꺾임·분기에 노드) → 종류 규칙 → 이름. 1.0 결과의 덕트 수는 **직선 조각 수**다(비교 때 주의, 7장).

### 3.4 크기

`duct-concept-native-sizing-worker`(12565, 워커 이름 `dline-native-sizing`)와 V2 그래프 워커(993 `no`, 이름 없음)는 **같은 코드**다(12 340자 중 끝 2자만 다름). 입력 `{nodes, ducts, diffusers, settings, groupFilter}`(V2 `createCalculationInput` 993 = 상태의 구조 복제).

| 단계 | 내용 |
|---|---|
| 그래프 검사 `U` | Root 없음, 열린 덕트, 중복 연결, 순환(다리 아닌 간선 = 순환 덕트), RU 노드 없음·차수 ≠ 1·풍량 ≤ 0, Root 둘이 연결, Root에 닿지 않는 RU → 오류(크기 계산 안 함) |
| 풍량 누적 `k` | 각 Root에서 너비 우선 순서, 역순으로 RU 풍량을 부모 덕트·부모 노드에 더함 |
| 종류 `b` | `type` 또는 `ductClass`(main/branch/sub_branch), 없으면 sub_branch |
| 설정 `X` | 종류별 {shape, velocityMps, minHeightMm, maxHeightMm, maxFrictionPaPerM}: **main rect 10 m/s, 최소 H 200 · branch rect 8 m/s, 100 · sub_branch rect 8 m/s, 100**, 최대 H 0(없음), 마찰 상한 0(끔). 원형 지름 기본 [80, 100, 125, 160, 200](레거시 기본 설정 1873–1878). 표준 인용 없음 |
| 수동 크기 | `manualSize`면 단면 그대로, 실제 속도만 계산(목표의 110 % 넘으면 경고 `MANUAL_VELOCITY`) |
| 원형 `P` | 지름 목록(상한이 있으면 그 아래)에서 속도 ≤ 목표인 가장 작은 지름. 없으면 사각으로 |
| 사각 `j` | W = 100부터, H = 최소 H부터 **50 mm 단계**. 상한 u = min(5000, max(100, 최소 H, max(600, ⌈√(필요 면적)×4/50⌉×50))), H 상한 = min(설정 최대 H, u, 부모 주관 H). 조건 W ≥ H, W/H ≤ 3, 속도 ≤ 목표, (마찰 상한이 있으면) 마찰 ≤ 상한, 면적 ≥ 필요 면적. 점수 = \|목표−실제 속도\|×1000 + \|W/H−1\|×10 + (H ≤ 50이면 1e5) + 남는 면적 비. 최소 점수. 없으면 최대 단면 + `AUTO_VELOCITY` 경고 |
| 분기 높이 `K` | 주관이 아닌 덕트의 H(원형은 D)가 위쪽 주관 H보다 크면 그 H를 상한으로 다시 선정(수동 제외), 그래도 크면 `BRANCH_HEIGHT` 경고 |
| 경고 `W` | W < H, 종횡비 > 3, 주관 H < 최소, H ≤ 50, 최대 H 초과 |
| 마찰 `phgdPF` | Swamee–Jain 식, 거칠기 0.09 mm(9e-5 m), 동점성 1.51e-5, 밀도 1.2 (마찰 상한 검사에만) |
| 출력 | `{ok, messages[], ductUpdates[{id, flowCmh, shape, widthMm, heightMm, diameterMm, targetVelocityMps, actualVelocityMps, sizeVelocityExceeded}], rootFlows[], totalFlowCmh, visitedNodeIds[], loopDuctIds[], calculationTimeMs}` |
| 적용 | `applyCalculationResult`(993): 위 8개 필드를 덕트에 쓰고 `validationMessages`, `presentTypedCalculation` |

`calculateTypedNetwork(groupFilter)`(1009) = `applyNetworkSemantics` → `synchronize` → 워커 → 적용. 컨트롤러 `calculate`(17433)는 먼저 연결 검토(`analyze` 365: Root·덕트·RU 있음, 열린 끝, 중복, 형상, 길이 0, 수동 단면 > 0, Root 둘 연결, 순환, Root 없는 망, RU 차수·풍량·연결)를 통과해야 계산한다(통과 못 하면 검토 창만 열려 브리지는 30 s 뒤 시간 초과).

### 3.5 압력

`LineDesignV2.calculateSimplePressure(settings)`(1009, 압축 이름 `de`·`ti`·`wo`·`ri`·`fe`). 1.0는 `{}`를 넘김 → 아래 기본값.

| 항목 | 내용 |
|---|---|
| 설정 기본 `ne`/`Co` | 공기 밀도 1.2 kg/m³, 점성 1.81e-5 Pa·s, 거칠기 0.09 mm, 피팅 방법 `ashrae_auto`(또는 `manual_k`), 엘보 r/W 1, 수동 K: 엘보 0.25 · 분기 0.4 · RU 댐퍼 0.5, **RU 전단 댐퍼 자동 적용 끔**(`applyTerminalDamperToAllRu === true`일 때만), 추가 고정 손실 0 |
| 덕트 마찰 `wo` | Darcy–Weisbach, 마찰계수 `ci` = Haaland(Re < 2300이면 64/Re), 수력 직경(사각 2WH/(W+H)), 동압 ½ρv² |
| 덕트 안 꺾임 `Ae` | 점 사이 각도마다 K. `ashrae_auto`: 사각 W ≤ 200 → CR3-1, W > 200 → CR3-3(베인 1개), 중심 반경 0.1 m + W/2, 원형 CD3-5(r/D 1.5) — **ASHRAE 표, 원문 미확인**. `manual_k`: K90 × 각도 계수 |
| 노드 엘보 `Eo` | 차수 2 노드에서 방향이 15° 이상 바뀌면 엘보(하류 동압). 1.0 덕트는 직선 조각이라 **모든 꺾임이 노드 엘보**다 |
| 분기·합류 `Do`→`fe` | 차수 ≥ 3 노드. Root의 `pressureFlowMode`: `supply` → 분류(사각 SR5-13, 원형 SD5-9), `exhaust` → 합류(사각 ER5-3, 원형 ED5-3). 직진(≤ 22.5°)·분기 구분, 면적비·풍량비로 표 보간, 표 밖은 경계값(경고). 합류 음수 K는 그대로 합산 — **ASHRAE 표, 원문 미확인**. 1.0는 배기·환기 계통에 `exhaust`를 준다(`bridge.js` 350) |
| RU 손실 `Ne` | RU 형식(`ruNoiseType`) 목록 `bn`(998): 기본 `mesh_grille` 고정 10 Pa, Sound Box 20/35/50 Pa, MS-25·MS-35·MS-65 시험값 보간, 사용자 값 |
| 경로 `ri`·`ti` | Root에서 Dijkstra(비용 = 마찰+꺾임+노드 엘보+분기 손실 Pa)로 각 노드까지 최소 경로 → RU마다 경로. 합계 = 마찰 + 엘보 + 분기 + 댐퍼 + 추가 + RU, 0.1 Pa 반올림 |
| 출력 | `{mode, settings, paths[{rootId, diffuserId, pathDuctIds, pathLengthM, ductFrictionLossPa, elbowLossPa, branchLossPa, terminalDamperLossPa, ruPressureLossPa, totalPressureLossPa, maxVelocityMps, details[] …}], roots[{criticalDiffuserId, criticalPressureLossPa, pressureMarginPa …}], warnings[]}` |
| 임계 경로 | `max(totalPressureLossPa)` → 1.0 `indexPa`(정수 반올림) → `lib/risers.cjs` 수직 덕트·팬 정압 |
| 부작용 | `Bn`: RU마다 `pressure*` 필드, `settings.simplePressure` 저장, 결과 창 열기 |

**압력 균형**(`phgd-balance-script` 18927, `PHGDBalance.balance`): 임계 경로를 두고, 임계보다 허용차(기본 10 Pa) 넘게 작은 경로에만 쓰이는 하류 덕트를 한 단계씩 줄임(사각 긴 변 −50 mm, 원형 −25/−50 mm, 100 mm·최소 H 아래 금지, 속도 ≤ 12 m/s), 임계를 넘긴 단계는 되돌림, 줄인 덕트는 `manualSize` + memo "압력 균형". **1.0는 부르지 않는다** — 새 엔진에서는 선택 기능.

### 3.6 수동 크기 · 다른 경로 · RU 이동

| 기능 | 1.0 동작 | 새 엔진 명세 |
|---|---|---|
| 수동 크기 | `setDuctSize`: `manualSize = true`·단면(원형이면 지름) → 망 전체 다시 계산(풍량·나머지 크기·압력). `null`이면 수동 해제 | `resize(network, ductId, size)` — 같은 규칙(수동 단면 유지, 분기 높이 상한 적용 안 함) |
| AUTO 다시 | 셸 `autoKey`: 수동 크기 덕트를 **이름 + 종류**로 새 망에서 찾아 다시 지정, 못 찾으면 "다시 지정 필요" 알림. PHG D 편집기 수정은 사라짐 | 덕트 id를 경로에서 안정적으로 만들거나(예: 양 끝 노드 + 역할) 같은 이름 규칙 유지 |
| 다른 경로 | `reroute`: 좋은 후보의 다음 번호(`pick + 1`). **1.0 입력에서는 후보가 1개**라 늘 "경로가 하나뿐" 오류 | 엔진이 실제 대안(예: 척추 후보 상위 n개, 축 x/y)을 후보로 내도록 — D8 범위의 기능 개선. 사용자 결정 필요 |
| RU 이동 | `moveRu`: 계약 `ruMoves[ruId]`(100 mm 맞춤, 자기 실 안만) → 계획 다시 → `sendPlan` + AUTO | 같음(엔진 입력만 바뀜) |
| Root 이동 | 계약 `roots[key]` → 같은 흐름 | 같음 |
| PHG D 안 RU·Root 이동 | 미리보기 중 손잡이(`phgd-preview-move-script` 19008) | D1 편집기에서만 |

## 4. 워커 입력·출력 형식과 기준값 파일

| 워커(이름) | 들어감 | 나옴 | 코드 |
|---|---|---|---|
| `aroute-routing` | `{id, input: RouteModel, phgdGiven: null \| 결과}`. 병렬이면 `input.routingSettings.phgdSpineTask = {mode:'baseline'} \| {mode:'parts', k, of}` | `{id, result}` 또는 `{id, type:'error', message}`. 병렬 중간 결과 `result.phgdBaseline {ok,total,bends}` / `result.phgdParts[]` | 13311–13314, 13366–13379 |
| `dline-native-sizing` | `{id, type:'calculate', input:{nodes, ducts, diffusers, settings, groupFilter}}`(미리보기 단계, 부분 연결이면 Root 성분만) | `{id, type:'calculate-result', result}`; `type` 없으면 순환 검사 `{type:'loop-result'}` | 13344–13346, 12565 |
| V2 그래프 워커(이름 없음 → 기준값에서 `blob:<첫 메시지 type>`, 보통 `blob:calculate`) | `{id, type:'calculate', input}` (`calculateTypedNetwork`) | 위와 같음 | 993 `no`, 클래스 `gs` |
| V2 DXF 워커(이름 없음 → `blob:<첫 메시지 type>`) | DXF 글자 | 엔티티·블록·진단 | 998 `so` |

`tools/phg-golden.cjs`(+ `tools/golden-run.cjs` `phgWorkerLog`·`phgHooks`)가 담는 것 — `test/fixtures/phg-golden/<ship>/<deck__system>.json.gz`:

| 키 | 내용 | 새 엔진 시험에 쓰는 법 |
|---|---|---|
| `plan` | 1.0가 보낸 계획(Root, RU, 금지 구역, 선체 밖; DXF는 길이만) | 엔진 입력 원본 |
| `loaded.state` | loadPlan 직후 PHG D 상태(entities·nodes·diffusers·ducts·settings·layers·bounds·validationMessages), `loaded.workers`(DXF 워커) | 복도·실 찾기 결과 비교(엔티티 → 복도 다각형) |
| `auto.previews[]` | 미리보기마다 쓴 금지 구역 id와 미리보기 결과(후보·`searchSummary`·실패) | 구역 완화 단계, 후보 이름 |
| `auto.workers[]` | `{dir:'in'\|'out', worker, data}` 모든 워커 메시지 | `aroute-routing` in의 `input`은 **RouteModel 그 자체**(오프셋 좌표) — 새 경로 엔진의 입력 변환 시험 정답, out은 경로 정답지. 크기 워커 in/out은 크기 엔진의 정확 비교용 |
| `auto.ducts/diffusers/nodes` | AD·크기 계산 뒤 최종 망 | 크기·압력 엔진에 같은 망을 넣어 정확 비교 |
| `auto.pressure` | `calculateSimplePressure({})` 전체 | 경로별 Pa 비교 |
| `auto.result`, `auto.geometry` | 브리지 `auto()` 결과와 `geometry()` | 기능 비교(7장) |
| `index.json` | 계통별 요약(RU, 덕트, 길이, indexPa, 종류, 후보, 완화, 워커 메시지 수, 경로 수) | 한눈 비교 |

PHG D가 만드는 무작위 id·시간 필드는 `canonical()`이 번호·0으로 바꾼다. 하지만 **`routingTimeMs`·`calculationTimeMs`·`preparationMs`·`routingWorkerMs`·`nativeWorkerMs`·`graphTimeMs`는 `TIME_KEYS`에 없고**, `metrics.phgdParallel.workers`(코어 수에 따름)도 기계마다 달라 `--check`가 차이로 볼 수 있다(실행해 보지 않음 — 9장).

## 5. 어댑터가 기대는 scope·화면 함수

1.0 경로(브리지 + 어댑터)와 선택 편집기(D1)가 기대는 것. "막을 곳"은 1.0 사본을 화면 없이 돌릴 때 빈 함수로 막아야 했을 곳이다(D7 이후 새 엔진에는 해당 없음, 편집기 연동 때 무엇이 살아 있어야 하는지 보려고 남김).

| 기대는 것 | 누가 · 무엇에 | 성격 | 화면 없이 돌릴 때 | D1 편집기에 필요 |
|---|---|---|---|---|
| `LineDesignLegacy.getState` | 어댑터 전부, 브리지 | 상태 | 상태 객체 제공 | 예 |
| `LineDesignLegacy.captureSnapshot/restoreSnapshot` | `place`, `setSettings`, `runCandidate`, `applyPreview`, 균형 | 실행 취소 | JSON 복제로 대체 | 예 |
| `LineDesignLegacy.renderEverything` | `history`, `setNativeView`, 브리지 | 그리기 | 빈 함수 | 예 |
| `LineDesignLegacy.applyNetworkSemantics` | `runCandidate`(부분 아님), 크기 계산 전 | 종류·이름·그룹(레거시 `syncModelSemantics`) | **계산 — 막으면 안 됨** | 예 |
| `LineDesignLegacy.presentTypedCalculation` | 결과 표시 | 화면 + `validationMessages` | 메시지만 저장 | 예 |
| `LineDesignLegacy.applyAutoRouteEntities` | `applyPreview` | AUTO 선 만들기(계산) + 그리기 | 계산 부분 필요 | 예 |
| `LineDesignLegacy.setSummary/getProjectName/getProjectSummary/setProjectIdentity` | 상태 줄·지문 | 화면·이름 | 빈 함수/고정 값 | 예 |
| `LineDesignLegacy.getEditTolerance/setCalculationBusy` | `installRoutingTopologyBridge`(12724)가 **`scope.LineDesignLegacy`를 감싼 객체로 바꿈**(`duct-concept-routing-dxfImport` 16976도 `loadParsedDxf`를 감쌈) | 위상 허용 오차 | 감싼 뒤 객체를 써야 함 | 예 |
| `LineDesignLegacy.previewDuctConversion/applyDuctConversion`(11554) | 컨트롤러 AD | `createDuctsFromSelection` | 선택 상태(`selectedEntityIds`) 필요 | 예 |
| `LineDesignV2.synchronizeTypedNetwork` | `runCandidate` | 위상 동기화 | 필요 | 예 |
| `LineDesignV2.recordExternalMutation/commitLegacyMutation/cancelLegacyMutation` | `history`, 컨트롤러 | 명령 기록 | 빈 함수 | 예 |
| `LineDesignV2.autosaveNow/requestTypedViewportRender/getCommandHistoryState` | `history`, `applyPreview`, 설정 창 | localStorage·그리기 | 빈 함수(`false` 반환 시 경고) | 예 |
| `LineDesignV2.calculateTypedNetwork/calculateSimplePressure/serializeTypedProject/loadTypedProjectJson` | 브리지 | 계산·저장 | 필요 | 예 |
| `scope.Duct`(엔진) `Geometry.simplify`, `Validator.validate/measureCost` | 후보 설명·최종 검증 | 순수 | 엔진 블록 실행 | 예 |
| `DuctConceptZones.read/assertNetwork/blocked` | `prepare`, `runCandidate`, `applyPreview` | 순수 + 영역 창 UI | 순수 부분만 | 예 |
| `DuctRoutingPreferences.normalize/validate/bindings` | `settings`, `syncSettings` | 순수(`bindings`는 입력 칸 id) | 그대로 | 예 |
| `DuctRoutingFingerprint.routing` | 미리보기 유효성(도면이 바뀌면 `STALE_*`) | 순수 | 그대로 | 예 |
| `DuctNetworkCore.candidateSegmentPairs` | 위상 정리 | 순수 | 그대로 | 예 |
| `PHGDAutoGrid/PHGDAutoGridText` | `preview` | 순수(`window`에 정의) | 그대로 | 예 |
| `PHGDCorridors`, `PHGDRooms`, `PHGDWallSegments` | `prepare` | 순수 계산이지만 DOM 설치 코드와 같은 블록(18682, 18736) | 함수만 | 예 |
| `PHGDEnvelope`, `PHGDCorridor`(`globalThis`) | 워커 안·밖 | 순수(엔진 블록 12118, 12148) | 그대로 | 예 |
| `PHGD_SEARCH_BUDGET`, `PHGD_ABORT_ON_FAIL`, `PHGD_ELBOW_RELAXED`, `PHGD_TAP_OK`(`globalThis`) | 척추·최소 분기 ↔ 엔진 | **전역 변수로 넘기는 옵션**(엔진 함수를 바꿔 끼움) | 새 엔진은 인자로 | — |
| `PHGD_PARALLEL_ROUTING`, `navigator.hardwareConcurrency`, `Worker`, `Blob`, `URL.createObjectURL` | `phgdRoutingTask`, `workerTask` | 실행 | Node `worker_threads` 또는 직접 호출 | 예 |
| `routingElement('duct-concept-routing-engine'/'duct-concept-native-sizing-worker').textContent` | 워커 코드 = **DOM `<script>` 글자** | 실행 | 파일에서 읽기 | 예 |
| `DuctConceptRoutingWindow` | `routingElement`(12637) 대체 창 | 선택(정의되지 않음) | 없음 | 아니오 |
| `DuctConceptAssistant.getManualRootId/getManualTaps`(18331 `phgc-assistant`) | `preview` | 수동 Root·접속점 | `undefined`/`[]` | 예(수동 접속) |
| `PHGPlacementOptions.pending/keepOpen`(18301) | `place` | R+/RU+ 기호 크기 | `null` | 예 |
| `PHGDEntityJson.hold/release`(249) | `place` | 실행 취소 최적화 | 빈 함수 | 예 |
| `PHGDGridArea`(1129) | `setNativeView` | 그리기 | 빈 함수 | 예 |
| DOM id: `autoRouteBtn`, `autoRoutingBusy`(`setBusy` — 없으면 예외), `svg`, `selectBtn`, `zoomText`, `gridMinorRect/gridMajorRect`, `autoRuFlowCmh`, `autoRoutingGridMm`, `autosaveRecoveryBar`, `zoomAllBtn`, 설정 입력 칸(`bindings`) | `setBusy`, `setPlacement`, `syncSettings`, `initialize` | 화면 | 가짜 요소 필요(`setBusy`는 막지 않으면 실패) | 예 |
| `document.createElement/head/body/querySelector`, `document.title` | `initialize`(15677) 제어판·덮개 | 화면 | 빈 문서 | 예 |
| 이벤트 보냄: `duct-concept:routing-state`(`emit`), `duct-concept:placement-mode`, `duct-concept:auto-route-committed`, `duct-concept:routing-ready` | 화면 갱신 | 알림 | 무시 | 예 |
| 이벤트 받음: `line-design:v3-ready`, document click(캡처), window mousedown/keydown(캡처), `setInterval(syncSettings, 750)` | `initialize` | 화면 | 설치하지 않음 | 예 |
| `performance.now`, `setTimeout`(마감) | `assertCurrent`, 워커 시간 초과 | 실행 | 그대로 | 예 |
| 브리지 DOM: `fileInput`, `dxfImportOptionsDialog`, `makeDuctBtn`, `phgb-conversion(-apply)`, `calculateBtn`, `phgb-left/right-dock`, `header.topbar button`, `HTMLIFrameElement.src`(비교 창) | 1.0 브리지 | 화면 조작 | 새 엔진에서 없앰 | 편집기 열기·닫기만 |

참고: 어댑터는 `module.exports`가 있으면 머리 없는 API(`prepareRouting`, `calculateMinimumBranches`, `createNearestMainTaps`, `applyResult`, `reconcileGeneratedDuctTopology`, `verifyUserMain`, `validateRouteGeometry`, `validateMinimumBranches`, `mainTapPoints`, `discoverUserMainDuctIds`, `clonePreviewBundle`, `moveCandidateMainNode`)를 내보낸다(15876) — PHG 저장소 자체 시험용. 하지만 `prepare`가 `settings()` → `state()` → `scope.LineDesignLegacy`를 부르므로 상태 객체 없이는 돌지 않는다.

## 6. 선택 편집기(D1): 모델 ↔ PHG D 프로젝트

PHG D 문서(`serializeTypedProject` = V2 `toDocument`/`Uo` 969, 읽기 `loadTypedProjectJson` → `loadJson` 993 → `Vo`/`en` 969):

```
{ schemaVersion: "3.0.0", app: "Line Design", createdAt, updatedAt,
  units: { drawing: "mm", flow: "CMH", velocity: "m/s", ductSize: "mm" },
  project: { name, sourceFileName },
  dxf: { entities: [ {id, type: LINE|LWPOLYLINE|POLYLINE|RECTANGLE|TEXT|MTEXT|CIRCLE|ARC|INSERT, layer, x1..y2 | points | x,y,text,h …, autoRoute?} ] },
  layers: { definitions: [[이름, {count, color …}]], visible: [이름], hiddenEntityIds: [] },
  network: { nodes: [...], ducts: [...], diffusers: [...] },
  settings: {...}, validationMessages: [...], view: {x, y, w, h} }
```

| 목록 | 필드(모델에서 채울 것) |
|---|---|
| `nodes` | `id`, `type`(root·diffuser·junction), `name`, `group`, `x`, `y`(앱 y — 1.0 약속: BOX y 그대로 + Root memo `[y=BOX]`), `connectedDuctIds`, `sourceEntityId`, `memo`; Root `pressureFlowMode`(supply/exhaust) |
| `ducts` | `id`, `displayName`, `type`, `manualType`, `group`, `fromNodeId`, `toNodeId`, `points`(양 끝 = 노드 좌표, 직교), `flowCmh`, `shape`, `widthMm`, `heightMm`, `diameterMm`, `manualSize`, `targetVelocityMps`, `actualVelocityMps`, `sizeVelocityExceeded`, `layer: "DUCT"`, `memo`, `sourceEntityId`, `sourceSegmentKey`, `metadata?` |
| `diffusers` | `id`, `displayName`(1.0 memo `HVAC Grid <ruId>`로 RU를 찾음), `group`, `serialNo`, `x`, `y`, `rotationDeg`, `flowCmh`, `flowSource`, `connectedNodeId`, `connectedDuctId`, `memo`, `ruNoiseType?` |
| `settings` | `sizing`(종류별 속도·최소 H…), `roundDiametersMm`, `grid`, `routingForbiddenZones`, `aroute`(경로 설정), `phgd*`(최소 길이·복도·덕트 폭…), `simplePressure`, `phgB`(작업 단계) |
| `dxf.entities` | 배경: 계약 실 다각형(ROOM), 번호·이름 TEXT(ROOM_NO, ROOM_NAME) — `lib/phg-plan.cjs` `deckDxf`와 같은 레이어 |

읽을 때 검사(969–992): 목록마다 id가 문자열·중복 없음, 엔티티 `type`·`layer` 문자열, 수치 필드 유한, 덕트가 있는 노드를 가리키고 점 ≥ 2, RU `connectedNodeId`가 있음, 레이어 정의 `[문자열, 객체]`. 실패하면 이전 상태로 되돌리고 예외.

되읽기: 편집기에서 바뀐 덕트망(`network`)을 모델로 — 덕트 종류·단면·수동 표시·점, 노드 좌표. PHG D는 다시 열 때 기본 필드·시간·키 순서를 바꾸므로 "바뀌었나"는 정규화해 비교한다(1.0 `changedSince` 413과 같은 방법). 덕트 이름은 계산 때 다시 매겨질 수 있으니 되읽을 때 id로 맞추고 이름은 보조로만.

## 7. 기준값과 비교하는 법 (D8)

| 비교 | 방법 | 같아야 하나 |
|---|---|---|
| 크기 | 기준값 `auto.ducts/nodes/diffusers`(최종 망, 단면 지움)를 새 크기 엔진에 넣음 → 덕트별 풍량·단면·속도 | **정확히 같음**이 목표(규칙이 결정적). 다르면 규칙 차이로 기록 |
| 풍량 누적 | 같은 입력 → 덕트 풍량, Root 풍량 | 정확히 같음 |
| 압력 | 기준값 최종 망(단면 포함) → 새 압력 엔진 → RU별 `totalPressureLossPa`, 임계 경로 | 같은 피팅 방법이면 0.1 Pa까지 같음이 목표. ASHRAE 표를 새로 넣기 전(수동 K 단계)은 차이 기록 |
| 덕트 지정 | 기준값 경로 워커 출력(`aroute-routing` out의 `project.edges`)을 새 지정 단계에 넣음 → 종류별 길이·조각 수 | 종류별 길이 같음. 이름·id는 비교하지 않음 |
| 경로 입력 | 기준값 `aroute-routing` in의 RouteModel과 새 입력 변환 결과 | 구역·포트·규칙 값 같음, 복도 다각형은 실 다각형이라 다를 수 있음(기록) |
| 경로 | 기능 지표만 | 아래 |

경로 기능 지표(계통마다, 기준값과 나란히 표로 — `docs/v2/RESULT.md` 또는 비교 도구 출력):

| 지표 | 판정 제안(사용자 결정 필요, K2) |
|---|---|
| 미접속 RU | 0 (기준값보다 나쁘면 실패) |
| `zonesRelaxed` | 같거나 덜 풂 |
| 금지 구역·선체 밖 침범 | 0 (검증기) |
| RU 잎 < 300 mm, 조각 < 500 mm, 엘보 직관 < 500 mm, 십자 Tee | 기준값 이하 |
| 총 길이, 종류별 길이 | 기준 대비 ± 15 % 안이면 기록만, 넘으면 원인 설명 |
| 주관 복도 경유 % | 기준값 이상이 바람직 |
| 꺾임·Tee 수 | 기록 |
| 임계 경로 Pa(`indexPa`), 최대 속도 | 기준 대비 ± 15 % 안이면 기록만 |
| 계산 시간 | 기준(0.6, S5 AUTO 86 s/18 계통)의 절반 이하(G6) |

주의:
- 1.0 덕트 수 = **직선 조각 수**(꺾임마다 노드). 새 엔진이 꺾인 덕트를 한 덕트로 두면 수가 다르다 — 길이·종류별 길이로 비교한다.
- 1.0는 미리보기 크기와 최종 크기를 따로 계산한다(최종만 의미 있음).
- 1.0 결과는 **기계 속도에 따라 다를 수 있다**: 미리보기 제한시간(120 s)을 넘기면 다음 구역 완화 단계로 넘어간다. 자동 격자는 시간 추정(셀 × 2 ms)이라 결정적이다.
- 기준값은 지금 `test/fixtures/v1-golden/s5`만 있다(`networks.json`: 계통별 결과 + geometry, 18 계통 모두 `candidates: 1`, `zonesRelaxed: false`). `phg-golden`은 도구만 있고 파일이 아직 없다.

## 8. V2-1 새 엔진 작업 목록 제안

계획서 4장 V2-1의 1.1(잘라 내기)·1.2(사본 실행)는 D7로 없어진다. 대신:

| 번호 | 작업 | 산출물(제안) | 작업일 |
|---|---|---|---|
| 1.0 | 기준값 만들기: `tools/phg-golden.cjs` S5·T3·N3 실행, `--check` 두 번 비교, 시간 필드 정규화 보완(4장 끝) | `test/fixtures/phg-golden/` | 0.5 |
| 1.1 | 엔진 입력: 계획 → RouteModel(실·복도(계약 `isCorridor`)·RU 실·금지 구역·선체 밖·포트·캔버스·격자 상한). BOX y 하나 | `lib/duct/input.cjs` | 1.5 |
| 1.2 | 격자 A*: 방향 상태, 꺾임 비용, 포트 리드·AUTO 방향, 목표 구간, 엘보 사이 최소 직관, 장애물·구역·덕트 폭 검사 | `lib/duct/astar.cjs` | 2.5 |
| 1.3 | 덕트망 계획: Prim 순서, 접속 후보(템플릿 + A*), 자르기·붙이기, 300/500 mm·엇갈림 Tee·십자 Tee·실 묶음·남의 실 규칙, 완화 재시도, 부분 결과, 검증기 | `lib/duct/network.cjs`, `validate.cjs` | 3 |
| 1.4 | 주관 척추 후보·복도 척추·가중 비용 선택, 금지 구역 단계 완화, 후보 n개(다른 경로 — 사용자 확인 뒤) | `lib/duct/spine.cjs`, `route.cjs` | 2 |
| 1.5 | 덕트 지정(직선 조각, 종류 규칙, 이름·그룹) + 크기(풍량 누적, 사각·원형, 분기 높이 상한, 수동 크기, 경고) | `lib/duct/assign.cjs`, `size.cjs` | 1.5 |
| 1.6 | 압력: 마찰(Darcy–Haaland)·수동 K·RU 손실·경로(Dijkstra)·임계 경로 0.5일 + ASHRAE 엘보·분기·합류 표 2일(**표 값의 원문 확인 필요**) | `lib/duct/pressure.cjs` | 2.5 |
| 1.7 | 비교 도구: 기준값의 RouteModel·최종 망을 각 단계에 넣어 7장 표 출력, 차이 기록 | `tools/engine-compare.cjs`, `docs/v2/RESULT.md` 일부 | 1.5 |
| 1.8 | 엔진 API(`auto`, `resize`, 멈춤)·워커 풀(Node `worker_threads`, 브라우저 Web Worker, 코어 수 −1, 계통 병렬) | `lib/duct/engine.cjs`, `app/duct-worker.js` | 1.5 |
| 1.9 | D1 편집기 교환: 모델 덕트망 → PHG D 문서 3.0.0(배경 실 포함), 되읽기·변경 판정 | `lib/duct/phgd-doc.cjs` | 1.5 |
| 1.10 | 셸 전환(`sendPlan`·`autoKey`·`reroute`·`resizeDuct`·`moveRu`·`runAll`) + 브라우저 없는 일괄 실행 | `app/shell.js`, `app/bridge.js`, `tools/hvac-run.cjs --node` | 2 |
| | **합계** | | **19.5 (18~22)** |

순서: 1.0 → 1.1 → 1.5(크기·지정은 기준값 망으로 먼저 정확 비교 가능) → 1.6 → 1.2 → 1.3 → 1.4 → 1.7(1.5부터 조금씩) → 1.8 → 1.9 → 1.10.

위험:

| 위험 | 영향 | 대응 |
|---|---|---|
| 경로가 1.0와 다름 | AUTO는 Prim 순서·템플릿/A* 동점·척추 선택·자동 격자가 얽혀 있어 같은 경로가 나오기 어렵다. ESP·SOLAS 관통·출력이 함께 바뀜 | D8대로 기능 지표 비교. 판정 범위(7장)를 K2 전에 사용자가 정함 |
| ASHRAE 피팅 표 | 1.0 ESP는 ASHRAE 표(SR5-13, ER5-3 등) 기반. D7로 코드를 가져오지 않으면 표 값을 원문에서 다시 넣어야 하는데 원문이 없다(F-2 취지) | 수동 K로 먼저 내고 차이 기록. 표는 원문 확보 뒤(사용자에게 ASHRAE DFDB 출처 문의) |
| 성능 | 200 mm 격자, 셀 ≤ 400 000, 계통당 최대 120 s. 1.0도 병렬 워커로 버팀(S5 86 s) | 처음부터 셀 상한·워커 풀. 1.2 끝에 S5 큰 계통으로 측정 |
| 1.0의 두 번 변환 | 최종 덕트는 AD 변환과 레거시 이름 규칙에서 나온다(이름 `M-D-n`, `G001-D-n`). 수동 크기 유지가 이름 + 종류로 찾음 | 새 엔진은 안정적인 덕트 id를 주고 셸이 id로 찾게 바꿈(1.10) |
| 기준값 재현성 | 시간 필드·코어 수 필드가 `canonical`에서 빠짐, 제한시간 초과 시 구역 완화가 달라짐 | 1.0에서 `--check` 두 번, 필드 정규화 |
| D1 편집기 왕복 | PHG D가 열 때 기본값·이름을 다시 매김, 편집 뒤 위상이 엔진 규칙(RU 잎 등)을 어길 수 있음 | 되읽은 망은 "수동 망"으로 표시, 엔진 검증기로 경고만 |
| "다른 경로" | 1.0에서도 사실상 동작하지 않음(후보 1개) | 새 엔진에서 척추 후보를 대안으로 낼지 사용자 결정 |

## 9. 확인하지 못한 것

- **표준 원문**: ISO 7547:2022, ASHRAE 피팅 표(CR3-1, CR3-3, CD3-5, SR5-13, SD5-9, ER5-3, ED5-3, CR9-1), SOLAS II-2/9.7.2·9.7.5 — 모두 원문 미확인(F-2). PHG D의 속도(10/8/8 m/s)·최소 높이·최소 길이(300/500 mm)·보온 25 mm·설치 여유 25 mm·묶음 거리 2000/8000 mm는 표준 인용이 없는 프로그램 기본값이다.
- **압축된 V2 모듈 세부**: 분기·합류 표의 행 값, 보간(`Jr`·`Qr` 등), 원형 엘보 각도 계수 표(`No`·`Mo`), RU 시험값 보간 `Ir`의 끝 처리는 이름과 흐름만 읽었고 값은 옮기지 않았다(D7).
- **위상 정리 함수**: `reconcileGeneratedDuctTopology`(14671), `validateRouteGeometry`(12663), `verifyTrunk`(14419), `createNearestMainTaps`(13927), `prepareUserMain`(14080)은 목적만 확인했다(1.0 입력에서는 대부분 겹침 정리·검증으로만 동작).
- **기준값 파일**: `test/fixtures/phg-golden/`이 없고(도구만 커밋 706a943), `v1-golden`도 S5뿐이다. 4장 `TIME_KEYS` 문제는 코드를 읽어 판단했을 뿐 `--check`를 실행해 보지 않았다(브라우저를 쓰지 않음).
- **브라우저 동작**: 워커 이름 `blob:*`가 기준값에 실제로 어떻게 찍히는지, 병렬 레인 수가 시험 기계에서 얼마인지 실행으로 확인하지 않았다.
- **연결 검토 실패 경로**: 컨트롤러 `calculate`가 `analyze` 실패로 검토 창만 열 때 브리지가 30 s 시간 초과로 끝나는지(코드상 그렇게 보임)는 실행하지 않았다.
