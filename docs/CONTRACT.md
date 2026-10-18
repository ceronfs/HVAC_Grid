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
  rus:     [],   // H1: PHG D에 배치한 RU
  ducts:   {}    // H1~: 계통별 PHG D 프로젝트
}
```

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

## 3. 계약 → PHG D 대응 (H1에서 구현)

| 계약 | PHG D |
|---|---|
| decks + rooms.polygon + no/name | Deck별 배경 도면: 닫힌 외곽선(ROOM 레이어) + 실 번호·이름 문자 → PHG D 실 인식(복도 우선 주관, 같은 실 BR, 풍량 초안, SOLAS 계획)이 그대로 동작 |
| systems(kind=supply) | 급기 계통별 PHG D 프로젝트(Root 1개) |
| airflow.supplyCmh | 계통 RU 풍량(격실 안 RU에 균등 배분, 합계 보존) |
| 좌표 | PHG D는 y를 뒤집음(앱 y = −DXF y) |

## 4. 풍량 규칙 v0

| 풍량 | 규칙 | 근거 |
|---|---|---|
| 급기 | 급기 계통이 있는 격실: ⌈냉방 현열 W × 3 ÷ ΔT⌉₁₀, ΔT 기본 10 K | 이전 통합(Box_PHG_Integrated, HVAC Studio)과 같은 근사(1/(ρ·cp) ≈ 2.99) |
| 배기 | 배기 계통이 있는 격실: ⌈ACH × 체적⌉₁₀ | BOX `ventilationAirCmh` |
| 환기 | 환기 계통이 있는 격실: max(0, 급기 − 배기) | 단순 수지 |
| 신기 | 정보값: 최소 신기량 | 계통 OA 배분은 BOX AHU 계산 결과로 대체 예정 |

BOX의 AHU 계산(`CAL_ENHANCE.ahu`)이 유효하면(AHU 조건 입력 완료) 그 격실 SA 풍량을 우선하도록 v1에서 바꿉니다. S5 예제는 AHU 조건이 없어 `AHU_INPUT` 경고 상태입니다.

## 5. 검증

`npm test` (`node --test "test/**/*.test.cjs"`) — 계약 구조(Deck·격실 ID, polygon, 부하·풍량 존재, 계통 참조), 풍량 규칙(급기·배기·환기·미완료), S5 샘플(5 Deck, 94실, 급기 10계통, 합계 10,420 CMH).
