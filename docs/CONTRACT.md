# HVAC Grid 데이터 계약 v0 (`hvac-grid/0`)

작성 2026-10-18 · 구현 `lib/contract.cjs` · 추출 `tools/box-extract.cjs` · 샘플 `samples/s5.contract.json`

BOX CAL이 계산한 격실·부하를 PHG D가 쓸 수 있는 형태로 옮기는 공통 형식입니다. 단위는 mm(좌표), m²·m³(면적·체적), W(부하), CMH(풍량).

## 1. 구조

```
{
  schema: 'hvac-grid/0', units: 'mm',
  source:  { app, file, sha256, project },          // 어떤 BOX 파일·프로젝트에서 뽑았는지
  rules:   { supplyDeltaTK, roundCmh, exhaustFrom }, // 풍량 규칙(4장)
  conditions: { ... },                               // BOX 설계 조건 그대로 (외기온도, 인원 발열, 1인 신기량 …)
  decks:   [{ id, name, elevationMm, heightMm, offsetMm:{x,y}, rotationDeg }],
  rooms:   [{ id, no, name, deckId, isoClass, polygon:[{x,y}], holes:[[{x,y}]], areaM2, volumeM3, ceilingHeightMm,
              systems:{ supply, exhaust, return } }],
  loads:   { [roomId]: { coolingSensibleW, coolingLatentW, coolingW, heatingW, minFreshAirCmh, minAch, achAirCmh, complete, status } },
  airflow: { [roomId]: { supplyCmh, exhaustCmh, returnCmh, freshAirCmh, source } },
  systems: [{ id, kind:'supply'|'exhaust'|'return', deckIds, roomIds, designCmh }],
  rus:     [],   // (예약) PHG D RU는 프로젝트 파일의 PHG D 프로젝트에 있음
  ducts:   {},   // (예약)
  // H2~H4: 셸에서 사용자가 정한 것 (모두 선택 항목, 없으면 자동)
  roots:     { ['<deckId>__<systemKey>']: { x, y } },   // 공조기 Deck: 공조기·팬 위치 / 다른 Deck: 수직 덕트(샤프트) 위치 (mm, 도면 좌표)
  unitDecks: { ['<systemKey>']: deckId },               // 여러 Deck 계통의 공조기 Deck
  solas:     { ship:'CARG'|'TANK'|'P36P'|'P36M', method:'IC'|'IIC'|'IIIC', sprinkler, rooms:{ [roomId]: { space } }, bounds:{ [boundaryId]: { grade } } }
}
```

`systemKey`는 계통 이름(`id`)입니다. 같은 이름이 두 종류에 쓰이면 `id~kind`가 됩니다. 계획 키는 `<deckId>__<systemKey>`(Deck·계통별 PHG D 프로젝트 1개).

### 프로젝트 파일 `hvac-grid-project/1` (`lib/project.cjs`)

```
{ schema: 'hvac-grid-project/1', savedAt, app:{ name },
  contract,                                  // 위 계약 (사용자 지정 포함)
  projects: { [planKey]: '<PHG D 프로젝트 JSON 문자열>' },
  results:  { [planKey]: { rus, flowCmh, ducts, lengthM, indexPa, auto, unconnected, seconds, sig, at, ... } },
  geometry: { [planKey]: { root, rus, ducts:[{ displayName, type, widthMm, heightMm, diameterMm, flowCmh, points }] } } }   // PHG D 좌표(y 아래)
```

- `sig`: 결과를 만든 계획(Root·RU 위치·풍량·흐름 방향)의 서명. 풍량 규칙·공조기 위치·공조기 Deck이 바뀌면 서명이 달라져 **그 계획만** "다시 보내기 필요"가 됩니다.
- 읽기(`read`): `/0` 파일은 변환, 계약 검사 실패는 거부, 지금 계획에 없는 키의 결과는 버림(보고).

## 2. BOX → 계약 대응

BOX CAL Enhance에서 격실 계산 결과는 계산 프레임의 `CAL_ENHANCE.report().loads`, Deck은 `CAD_APP.stack.decks`에서 읽습니다.

| 계약 | BOX 필드 | 비고 |
|---|---|---|
| rooms.id / no / name | `id`, `no`, `name` | 격실 식별 — 두 앱이 공유하는 키 |
| rooms.deckId | `deckId` | |
| rooms.isoClass | `isoClass` | ISO 7547 분류(AC, WHEELHOUSE, BOILER, ALLEY_SOUND …) — SOLAS 범주 대응에도 사용 예정 |
| rooms.polygon / holes | `polygon`, `holes` | Deck 도면 좌표(mm). Deck 변위·회전은 decks에 별도 |
| rooms.areaM2 / volumeM3 / ceilingHeightMm | `floor`, `volume`, `ceilingHeight` | ceilingHeight 0은 null |
| rooms.systems | `sup`, `exh`, `ret` | 급기·배기·환기 계통 이름 |
| loads.coolingSensibleW … heatingW | `coolingSensibleW`, `coolingLatentW`, `coolingW`, `heatingW` | 안전율 포함, 외기부하 제외(BOX 기준) |
| loads.minFreshAirCmh | `minimumFreshAirCmh` | 인원 × 1인 신기량 |
| loads.minAch / achAirCmh | `minimumAch`, `ventilationAirCmh` | 환기 횟수와 그 풍량(ACH × 체적) |
| loads.complete / status | `calculationComplete`, `calculationStatus` | 미완료 격실은 풍량 0(대기) |

## 3. 계약 → PHG D 대응 (`lib/phg-plan.cjs`, 실행 `app/bridge.js` · `tools/hvac-run.cjs`)

| 계약 | PHG D |
|---|---|
| decks + rooms.polygon + no/name | Deck별 배경 도면: 닫힌 외곽선(ROOM 레이어) + 실 번호·이름 문자 → PHG D 실 인식(복도 우선 주관, 같은 실 BR, 풍량 초안, SOLAS 계획)이 그대로 동작 |
| systems (급기·배기·환기) | **Deck·계통별** PHG D 프로젝트(Root 1개). 배기·환기는 Root의 `pressureFlowMode = 'exhaust'`(PHG D 합류 피팅 압력 계산) |
| airflow.supplyCmh / exhaustCmh / returnCmh | 종류별 RU 풍량(격실 안 RU에 균등 배분, 합계 보존). 배기·환기 RU는 같은 실 급기 RU와 400 mm 이상 |
| 좌표 | PHG D는 y를 뒤집음(앱 y = −DXF y) |
| 공조기 Deck (여러 Deck 계통) | `unitDecks` 지정 → 팬룸이 있는 Deck → 풍량이 가장 큰 Deck |
| Root (공조기 Deck) | `roots` 지정 → 팬룸·공조기실(이름) → 복도 끝 → Deck 모서리. 뒤의 둘은 `assumed:…`(임시) |
| Root (다른 Deck = 수직 덕트) | `roots` 지정 → 샤프트·트렁크 실 → 공조기 바로 위·아래(그 점이 실 안이면) → 복도 끝 |
| 같은 팬룸·트렁크의 여러 계통 | 서로 600 mm 이상 떨어진 점(실 안, 벽에서 200 mm 이상) |
| RU 배치 | 500 CMH마다 1개, 실 안 중심(또는 가장 안쪽 점, 구멍 제외), Root·다른 RU와 400 mm 이상, 풍량 합계 보존 |

### 수직 덕트 (`lib/risers.cjs`, `lib/ducts.cjs`)

- 공조기 Deck에서 위·아래로, 계통이 쓰는 Deck을 잇는 구간마다 1개. 풍량 = 그 너머 Deck 풍량 합.
- 길이 = Deck 높이 차 + 두 샤프트 점의 수평 거리(직각), 엘보 2개(+ 수평 이동 2개).
- 크기: 풍속 ≤ 10 m/s, 마찰 ≤ 2 Pa/m, 50 mm 단위, 종횡비 ≤ 4, 가장 작은 단면. 손실: Darcy–Weisbach(Colebrook, 아연도 0.09 mm, 공기 1.2 kg/m³) + 엘보 K 0.25.
- 계통 최대 압력손실 = max(각 Deck의 PHG D 최대 손실 + 공조기에서 그 Deck까지 수직 덕트 손실).

## 4. 풍량 규칙 v0

| 풍량 | 규칙 | 근거 |
|---|---|---|
| 급기 | 급기 계통이 있는 격실: ⌈냉방 현열 W × 3 ÷ ΔT⌉₁₀, ΔT 기본 10 K | 이전 통합(Box_PHG_Integrated, HVAC Studio)과 같은 근사(1/(ρ·cp) ≈ 2.99) |
| 배기 | 배기 계통이 있는 격실: ⌈ACH × 체적⌉₁₀ | BOX `ventilationAirCmh` |
| 환기 | 환기 계통이 있는 격실: max(0, 급기 − 배기) | 단순 수지 |
| 신기 | 정보값: 최소 신기량 | 계통 OA 배분은 BOX AHU 계산 결과로 대체 예정 |

BOX의 AHU 계산(`CAL_ENHANCE.ahu`)이 유효하면(AHU 조건 입력 완료) 그 격실 SA 풍량을 우선하도록 v1에서 바꿉니다. S5 예제는 AHU 조건이 없어 `AHU_INPUT` 경고 상태입니다.

풍량 검토(`lib/project.cjs airChecks`): 배기가 있고 환기가 없는 실(조리실·화장실·세탁실)에서 급기 > 배기이면 "부압 미확보" 경고, 부하 미완료 실, 계통은 있으나 풍량 0인 실·계통.

## 5. 검증

`npm test` (`node --test "test/**/*.test.cjs"`) — 계약 구조(Deck·격실 ID, polygon, 부하·풍량 존재, 계통 참조), 풍량 규칙(급기·배기·환기·미완료), S5 샘플(5 Deck, 94실, 급기 10계통, 합계 10,420 CMH), 계획(종류·Deck별 풍량 보존, 공조기 Deck, 배기 RU 간격), 수직 덕트(물리·크기·경로 손실), 프로젝트 파일(왕복·변환·거부·결과 서명), 출력(XLSX 다시 읽기, DXF 다시 읽기, 보고서), SOLAS(워크북 830칸 대조, 분류, 등급, 관통), 시험 도면 대조. `npm run test:e2e` — 셸 + 실제 BOX·PHG D(S5, T3).
