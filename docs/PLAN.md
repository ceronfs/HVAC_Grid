# HVAC Grid — 계획

작성 2026-10-18 · 갱신 2026-10-19 · 상태: H0~H4 완료, H5 S1, 리뷰 2차 진행 — [REVIEW.md](REVIEW.md)

## 1. 목표

BOX Cal과 PHG D를 묶어, 선박 HVAC 설계를 **Deck · 격실 단위의 한 데이터 흐름**으로 처리한다.

| 단계 | 담당 | 결과 |
|---|---|---|
| 격실·Deck 정의 | BOX Cal | 격실 외곽, 용도, 면적·체적, Deck |
| 부하 계산 | BOX Cal | 현열·잠열, 최소 신기량, 장비(SUP) 용량 |
| 격실 풍량 | 공통 | 급기(부하 기반), 환기(신기 배분), 배출(ACH) |
| RU 배치 | PHG D | 격실별 RU, 풍량 분배 (PHG D의 같은 실 BR·풍량 초안 활용) |
| 덕트 라우팅·계산 | PHG D | AUTO(복도 우선 주관, 병렬 계산), 단면·압력·소음, 설계 비교 |
| 검토 | PHG D + SOLAS | 방화 경계·관통 조건(PHG D SOLAS 계획), 풍속·압력 |
| 출력 | 공통 | 통합 프로젝트 저장, XLSX·DXF·보고서 |

## 2. 이전 시도에서 배운 점

(Box_PHG_Integrated 2026-09-29, NODE HVAC Studio 2026-10-01 — `SOURCES.md`)

**잘 된 점**
- 기존 엔진을 고치지 않고 iframe으로 결합해 빠르게 연결함
- 격실 부하 → RU 풍량(현열 W × 안전율 × 3 ÷ ΔT), 환기 신기 배분, 배출 ACH, 풍량 합계를 보존하는 배분(34+33+33=100)
- 통합 JSON 저장·복구, 3단계 작업 순서, 테스트 7개

**한계**
1. 두 앱의 상태가 따로 있어 **수동 새로고침**이 필요하고, 한쪽에서 바꾼 것이 다른 쪽에 바로 반영되지 않음
2. **도형을 공유하지 않음**: 두 앱에 같은 좌표의 도면을 각각 불러와야 함, 격실 경계와 RU 위치를 서로 검사하지 않음
3. 여러 Deck의 RU가 **한 PHG 네트워크**에 섞임(Deck별 계통 분리 없음)
4. 로컬 서버가 필요(통합 저장), 두 앱 UI가 이질적
5. 검증이 UI·풍량 흐름에 한정 — 부하·덕트 계산을 실도면으로 검증하지 않음

## 3. 통합 방식 선택지

| 방식 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A. 셸 + 브리지 | 두 앱을 그대로 띄우고 메시지 브리지로 격실·풍량·RU를 자동 동기화 (이전 방식 개선) | 빠름, 두 앱 독립 개발 유지 | 상태 이중화, 도형 공유 어려움 |
| B. 공통 모델 단일 앱 | 공통 프로젝트 모델 위에 BOX 계산·PHG D 덕트를 모듈로 통합 | 데이터 일관성, 하나의 도면·Undo·저장 | 개발량 큼, 두 앱 구조 차이(BOX `src/` 모듈 vs PHG D 패치 빌드) |
| C. PHG D 중심 | PHG D를 주 앱으로, BOX 부하 계산 엔진만 모듈로 가져옴 | PHG D의 도면·실 인식과 바로 결합 | BOX 화면 기능(3D 등) 일부 포기 |

**권장: A → B 단계 전환.** 두 앱 모두 지금 개발 중이므로(BOX Cal `CAL_Enhance` 오늘 커밋, PHG D A 보완 병행) 먼저 **설계 데이터**를 확정하고 브리지로 실도면 흐름을 검증한 뒤, 설계 데이터를 그대로 공통 모델로 옮겨 단일 앱으로 점진 통합한다.

## 4. 설계 데이터 초안 (v0)

```
HVACGridProject {
  schema: 'hvac-grid/0', units: 'mm',
  decks:   [{ id, name, elevationMm, drawing }],
  rooms:   [{ id, deckId, no, name, use, polygon:[{x,y}], areaM2, heightM, solas?: { space, category } }],
  loads:   { [roomId]: { sensibleW, latentW, oaCmh, achExhaust, status: 'done'|'pending' } },
  systems: [{ id, kind: 'SUP'|'EXH', unit, deckIds, roomIds, designCmh }],
  airflow: { [roomId]: { supplyCmh, ventCmh, exhaustCmh, source: 'load'|'oa'|'ach'|'manual' } },
  rus:     [{ id, roomId, systemId, use: 'supply'|'vent'|'exhaust', flowCmh, x, y }],
  ducts:   { [systemId]: <PHG D 프로젝트 JSON> }
}
```

핵심은 **격실 식별의 공유**: BOX 격실 ↔ PHG D 실 인식(외곽·이름)을 같은 `roomId`로 묶는다. 좌표는 mm, Deck별로 분리한다.

## 5. 단계 계획

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| H0 준비 ✅ | 두 원본 구조 분석(BOX 격실·부하 데이터, PHG D 프로젝트 JSON), 설계 데이터 v0 확정, 저장소·빌드·테스트 틀 | 설계 데이터 문서 + 샘플 프로젝트 1개 — **완료 2026-10-18**: `docs/CONTRACT.md`, `tools/box-extract.cjs`, `samples/s5.contract.json`, 테스트 4개 |
| H1 브리지 ✅ | BOX → PHG D: 격실 외곽·용도·풍량 전달, PHG D 풍량 초안을 **BOX 부하 기반 풍량**으로 대체 | S5 샘플·S03에서 격실 풍량이 RU에 자동 반영 — **완료 2026-10-18 (S5)**: `tools/phg-generate.cjs`, 10계통 RU 100개 전부 연결, `docs/H1_S5_RESULT.md` |
| H2 Deck·계통 ✅ | Deck별 PHG D 네트워크, SUP 계통별 Root, 급기·환기·배출 분리 | 다층 샘플에서 Deck·계통별 덕트망 — **완료 2026-10-19**: 통합 셸 S1 + 배기·환기 계통(PHG D 합류 압력 모드), 여러 Deck 계통의 공조기 Deck·샤프트, 수직 덕트 크기·손실·계통 최대 압력손실. T3 시험선 15계획·S5 18계획 AUTO 전부 — [H2_H4_RESULT.md](H2_H4_RESULT.md) |
| H3 통합 저장·출력 ✅ | 한 프로젝트 파일, 통합 XLSX(부하·풍량·덕트·압력), 보고서 | 저장·복구·출력 테스트 — **완료 2026-10-19**: `hvac-grid-project/1`(결과 서명), 통합 XLSX 11시트·통합 DXF·HTML 보고서, 헤드리스 실행 `tools/hvac-run.cjs`, 다시 읽기 테스트 |
| H4 SOLAS ✅ | PHG D SOLAS 계획(P1~P4)을 격실 공유 모델에 연결 | 경계·관통 표기가 통합 격실 기준으로 동작 — **완료 2026-10-19**: 워크북 830칸 대조, 실 분류, 격벽·외벽·갑판 등급, Deck·수직 덕트 관통 조치, 물량 — [SOLAS.md](SOLAS.md) |
| H5 단일 앱 (S1) | 공통 모델로 화면 통합(B 방식) | 하나의 도면·Undo·저장 — **S1 2026-10-19**: 하나의 저장(프로젝트 파일), 셸의 공통 평면(격실·계통·덕트·샤프트·방화 경계·관통), HVAC Grid 편집 실행 취소. 남은 것은 아래 8장 |
| 시험 도면 ✅ | 실도면이 없는 동안 기능을 끝까지 시험할 합성 선박 | **T3 시험선**(4 Deck·73실·L자 선실·다층 계통·케이싱·조리실): BOX 프로젝트 + Deck별 DXF + 도면 대조 — [TEST_DRAWINGS.md](TEST_DRAWINGS.md) |

각 단계 끝에 테스트·캡처로 확인을 받는다.

## 6. PHG D와의 관계

- PHG D는 A 수준 보완을 병행한다(실도면 설계 비교 검증·비용 보정, 대형 Deck 속도, 압력 계산 교차 검증). 그 결과는 이 프로젝트에 원본 버전 갱신으로 반영한다.
- PHG D에 이미 있는 실 인식·풍량 초안·같은 실 BR·설계 비교는 H1~H2에서 BOX 데이터와 연결하는 접점이 된다.

## 7. 결정 사항 (처음 질문의 현재 상태)

1. 통합 방식: **A → B 단계 전환**으로 진행 — 지금 A(셸 + 브리지) 위에 공통 모델(설계 데이터·프로젝트 파일·셸 평면)까지(H5 S1)
2. BOX Cal 원본: `CAL_Enhance/04_CAL_Enhance_fixed.html`(32976f8)을 고정 사본으로 사용 중 — 새 버전은 의도적으로 갱신(`vendor/VERSIONS.json`)
3. 1차 목표 범위: H0~H4 완료
4. 검증 샘플: S5(BOX 내장)·**T3 시험선**(합성) — **실제 호선 도면은 아직 필요**(PHG D A 계획 1번과 같은 자료)
5. GitHub 저장소: 미정 — 로컬 커밋만(원격 push 안 함)

## 8. H2~H5 진행 중 직접 정한 것 (2026-10-19, 사용자 부재 중 — 바꾸려면 알려 주세요)

| 결정 | 이유 | 바꾸는 곳 |
|---|---|---|
| SOLAS 기본: 화물선(Table 9.5/9.6), 방화방식 IC, 병기 값은 엄격한 쪽 + 확인 표시 | PHG D SOLAS 계획의 임시 기본값과 같게 | 셸 ⑤ 선종·방화방식 |
| 여러 Deck 계통의 공조기 Deck: 팬룸이 있는 Deck → 최대 풍량 Deck | 공조기는 팬룸에 둠 | 셸 ③ 공조기 Deck |
| 수직 덕트 크기: 10 m/s · 2 Pa/m · 50 mm 단위 · 종횡비 4 | PHG D 주 덕트 풍속과 같은 기준, 마찰 상한으로 작은 덕트 과손실 방지 | `lib/ducts.cjs RISER_RULES` |
| 수직 덕트는 먼 쪽 Deck의 샤프트 위치에서 수직, 수평 이동은 공조기 Deck에서 | 트렁크(샤프트) 실이 있는 배치에 맞음 | `lib/solas.cjs`, `lib/risers.cjs` |
| 덕트 트렁크·관측실 등 사전에 없는 실은 자동 분류하지 않음(미분류 경고) | 잘못된 자동 분류보다 사람 지정이 안전 | 셸 ⑤ 방화 탭, `--solas=` |
| H5는 B 방식 전면 통합 대신 S1(공통 저장·공통 평면·셸 Undo)까지 | BOX·PHG D가 계속 개발 중(원본 갱신 반영이 쉬워야 함). 두 앱을 다시 쓰는 일은 두 원본이 안정된 뒤가 맞음 | — |
| 시험 도면은 합성 T3 | 실도면 미제공. 실도면을 받으면 같은 도구(`dxf-check`, `hvac-run`)로 바로 시험 | `tools/make-test-ship.cjs` |
| 전달 공기 출처: 딸린 실(이름이 그 실 이름으로 시작하거나 둘레 40 % 이상을 그 실이 감쌈) → 복도(가장 긴 이웃 벽의 절반 이상) → 가장 긴 벽 | 선실 화장실 문은 선실로 열림. 공용화장실은 복도 문 그릴이 실무 관행. 실 정보에서 실마다 바꿀 수 있음 | `contract.transfers`, ③ 실 정보 |
| 금지 영역 안에서 모든 RU에 닿는 경로가 없을 때: 실 밖 영역 → 제한 구역 → 전부 순으로 풂 | PHG D 경로 탐색이 둘레 영역이 있으면 구석 RU를 놓치는 경우가 있음(S5 S1 환기 RU 1개). 실 밖 덕트는 검토에서 실패로 잡히므로 제한 구역을 지키는 쪽을 먼저 | `app/bridge.js auto` |
| 선주 최소 신기 비율(`minOaPct` 25 %)은 경고가 아니라 신기 하한 | 사양은 지켜야 할 값. 낮추려면 규칙을 바꿈 | `lib/contract.cjs` |
| 가압 기준 기본은 배기 대비 5 %, 급기 대비로 바꿀 수 있음(③ 리본) | 1차 리뷰 이후 수치 연속성. 선주 사양이 급기 대비면 바꿈 | `rules.pressurizationBasis` |
| 조리실 배기 계통은 다른 실 전부를 금지 영역으로(팬룸·트렁크만 통과), 급기는 제한 구역만 | 9.7.5 A급 덕트 구간을 만들지 않는 것이 실무 첫 선택(레인지 배기에 대한 요건). 경로가 없으면 완화 단계로 | `lib/phg-plan.cjs` |
| ④도 HVAC Grid 평면 하나(캔버스 공유 1단계): PHG D는 숨긴 채 계산하고, 세부 편집만 PHG D 편집기 화면 | 단계를 옮겨도 같은 평면·격실·색이 유지되어 덕트 배치까지 한 캔버스로 읽힘. PHG D 원본은 그대로(편집 기능은 원본 것을 씀). 2단계(구현): RU·공조기를 평면에서 끌어 옮기기(`contract.ruMoves`, 놓으면 다시 AUTO), 덕트 크기 바꾸기(PHG D `manualSize` + `calculateTypedNetwork`), 다른 경로(AUTO의 다음 좋은 후보, 후보가 하나면 안내). 숨은 PHG D가 키보드 포커스를 가져가지 않게 함(Ctrl+Z는 셸로) | `app/shell.js` `viewOf`, `openEditor`, `closeEditor` |
| 가압이 급기의 10 %를 넘으면 릴리프 확인 | 신기 하한 때문에 배기가 적은 구역(선교)은 과가압 → 문 개폐·소음 | `PJ.LIMITS.reliefPct` |
| 시험 도면·PHG D Deck 도면은 DXF 2007(AC1021) | 한글을 UTF-8 그대로 쓸 수 있는 가장 낮은 판. R12는 코드 페이지 문자라 PHG D·BOX가 한글을 못 읽음. 출력용 통합 DXF는 R12(`\U+`) 유지 | `lib/phg-plan.cjs deckDxf`, `tools/make-test-ship.cjs` |
| 화면·문서 용어 "계약" → "설계 데이터" (2026-10-19, 사용자 결정) | 사용자 요청. 격실·부하·풍량·계통을 다 담고 처음 쓰는 사람도 바로 아는 말 | 화면 문구·도움말·문서. 코드 이름(`contract`), 형식 `hvac-grid/0`, `*.contract.json` 파일 이름은 그대로(이미 저장한 파일 호환) |
| ② 부하는 상단 리본 중심 (2026-10-19, 사용자 결정): CAL 패널은 화면에 내지 않고 뒤에서 계산, 상태 줄에 "CAL: 격실 N개". 리본에 "격실 입력"(CAL 격실 리스트: 계통·인원·신기·장비) 추가, "CAL 열기" 없앰. K값 "구조 계산·구조 적용" → "LY·LY 적용". 표 창(BOX·CAL)은 셸이 열어 app/popup.css로 앱과 같은 모양·테마·한국어 제목 | 패널 단추 18개 중 16개가 리본과 같은 명령이고, 리본에 없던 것은 계통 입력표(RL)뿐; 패널은 도면을 가리는 빈 화면이었음. vendor는 읽기 전용이라 창 모양은 밖에서 입힘(BOX가 읽는 제목·RST 글자는 바꾸지 않고 화면에만 덧씀) | `app/shell.js` ② 리본, `app/bridge.js` openPopup·cal, `app/popup.css` |
| ①②③④ 캔버스를 같게 (2026-10-20, 사용자 결정): ③④ HVAC Grid 평면을 BOX 캔버스와 같은 방향(BOX의 Y가 화면 아래로)·같은 흰 바탕(격자 없음)·같은 실 선 색(ROOM 파랑)으로, 덱은 가운데 맞춤. 축 표시는 왼쪽 위(선수 →, 좌현 ↓) | ②→③에서 같은 Deck이 위아래 뒤집혀 보였음(BOX는 CAD처럼 Y를 화면 아래로 그림) | `app/shell.js` plan()의 Y(), `app/shell.css` .plan |
| ②→③ 같은 캔버스 (2026-10-20, 사용자 결정): ③④에서도 캔버스가 화면 폭 전체(①②와 같은 자리), 왼쪽 목록·오른쪽 속성은 그 위에 떠 있는 패널(BOX의 도구판처럼). ③은 BOX가 보여 주던 Deck으로 열리고, BOX가 그 Deck을 2D로 담고 있으면 BOX와 같은 축척·같은 위치(픽셀 일치). 아니면(다른 도면, 3D, Deck 배치가 있는 H5 같은 도면) 패널 사이에 맞춤. 범례는 실을 가릴 자리면 접힌 채 시작 | ②에서 ③으로 넘어가면 캔버스가 좁아지고 Deck이 다른 크기·위치로 다시 그려졌음 | `app/shell.js` boxView·followBoxDeck·legendRoom, `app/shell.css` .plan-view |
| ③④ 배경은 BOX 캔버스 (2026-10-20, 사용자 결정): Deck을 두 번 그리지 않는다. BOX가 그 Deck을 2D로 담고 있으면 BOX 캔버스(벽·실 번호·이름·축)를 그대로 배경으로 두고, HVAC Grid 층은 BOX에 없는 것(계통 색·CMH·공조기·RU·덕트·방화)만 투명하게 겹친다. BOX의 실 채움·선택·도구판·상태 줄은 배경에서만 숨김(BOX 자체는 그대로). 그렇지 않으면(3D, 다른 도면, 선박 좌표 배치 도면) 지금처럼 HVAC Grid가 그린 평면 | 같은 Deck을 BOX와 HVAC Grid가 따로 그려 모양이 달랐음 | `app/shell.js` plan() onBox, `app/bridge.js` backdrop·showDeck·BOX_CSS hg-bg |
| ② K값·설계 조건 창은 도면 없이도 (2026-10-22, 사용자 결정): ISO 기준·ISO 적용·LY·LY 적용·사용자·설계 조건은 BOX에 도면이 없어도 연다. CAL은 격실 0개로 열리고, 정한 값은 BOX가 들고 있다가 다음에 여는 DXF에 그대로 쓴다. 예제·BOX 프로젝트는 자기 설정을 쓴다. 격실 입력·경계 조건·격실 부하·내보내기는 도면이 있어야 한다 | K값 표를 보거나 회사 기준(KU·LY)을 먼저 정해 두려는 것. 이 창들은 CAL 설정만 다룸 | `app/bridge.js` `CAL_SETTINGS`, `app/shell.js` `boxCal`, `test/e2e/k-change.e2e.cjs` |
| 계통도 (2026-10-20): 계통당 한 장, 위아래 = Deck 높이 순, 왼쪽 공조기·팬, 가운데 수직 덕트, 오른쪽 Deck별 덕트망 상자. 화면·보고서는 SVG, DXF는 같은 도형을 선·글자로(1 단위 = 20 mm) | 검토(2026-10-20)에서 계통도가 어디에도 없었음. 데이터는 analysis().systems·risers에 이미 있음 | `lib/diagram.cjs`, ⑤ 탭, `lib/report.cjs`, `lib/dxf-out.cjs` |
| ISO 7547:2022 대조 (2026-10-21, 사용자 부재 중): 실내 여름 25 °C / 55 %로 되돌림(BOX 사본 패치 M·N, T3 v2.5), 급기에 겨울 풍량(난방 W × 3 ÷ 22 K) | 원문 4.2 b)·6.2.1 b)·6.3. 검토 L8이 기억에 의존해 거꾸로 바꿨던 것 | `docs/ISO7547_CHECK.md`, `rules.heatingSupplyDeltaTK` |
| 기관실 경계는 43/5 °C 유지(검토 보고서의 45 °C 권고 따르지 않음) | 5.2.2는 표 1의 ΔT(18/17 K)를 쓰라고 함 — 25 °C 실 + 18 K = 43 °C. 45 °C는 27 °C 실을 전제한 값 | `tools/make-test-ship.cjs` casing, `tools/t3-box-lines.cjs` |
| 난방 풍량은 거주구역만(제어실·조타실·기관·비공조 공간 제외) | C.3.1·D.3.1 별도 난방, 1장 범위(거주구역) | `SEPARATE_HEATING` (`lib/contract.cjs`) |
| 표 1 인접 ΔT·창 +200 mm·일사 지붕 + 벽은 BOX 사본을 고치지 않고 권고(O·P·J) | BOX 계산 구조를 바꾸는 일 — 원본 개발 중. T3는 입력(급기 없는 실 온도)으로 맞출 수 있는 만큼 맞춤 | `docs/VENDOR_PATCHES.md` |
| BOX 계산 방식도 ISO 7547:2022로 (2026-10-21, 사용자 지시 "모두 수정"): 사본 패치 J·O~U. 이전에 저장한 프로젝트는 이전 방식(새 설정이 없으면), 새 프로젝트는 ISO 기본; BOX 예제 S5·H5는 명시한 일사 정책 유지 | 원본 개발자의 기존 결과를 바꾸지 않으면서 새 설계는 표준대로. 화면 계산과 XLSX 수식을 함께 고치고 Excel 재계산으로 확인 | `docs/VENDOR_PATCHES.md` |
| 통합 프로젝트 파일에 BOX 도면(BOX 자신의 JSON)도 저장 (F05) | 한 파일로 ①~⑤ 복원. BOX의 "JSON 저장"을 그대로 써서 BOX 형식이 바뀌어도 맞음 | `PJ.make box`, `app/bridge.js projectJson` |
| 수평 덕트 방화댐퍼 손실은 그 Deck 계획의 모든 댐퍼 합을 여유로 (A05) | PHG D가 최대 손실 경로를 알려 주지 않음 — 보수적, 따로 표시 | `lib/project.cjs` deckDamperPa |
| 방화 등급도는 별도 기능 (2026-10-21, 사용자 제안): 등급을 글자로 적은 평면을 화면·DXF(별도 파일)·보고서로. 같은 등급으로 한 줄에 이어진 벽은 한 번, 1 m 미만·C급·외벽(*)은 기본 생략 | 덕트 도면과 섞으면 읽기 어려움. 짧은 조각마다 적으면 글자가 겹침 | `lib/fire-plan.cjs` |
| 실별 신기 부족(ROOM_OA)은 검사로 두고 구역 신기를 자동으로 올리지 않음 | 가장 불리한 실에 맞추면 T3 AHU-ACC 신기 47 % — 설계자 결정 | `lib/project.cjs` ROOM_OA |
| 한 파일판 (2026-10-25, 요청 "HVAC Grid 전체를 HTML 파일 하나로"): vendor 앱은 srcdoc iframe(페이지와 같은 출처)으로, lib·samples·popup.css는 `window.HVACGridFiles`에서 읽음. vendor 사본은 고치지 않고 글자 그대로 넣음. PHG D 설계 비교의 작업 창은 bridge가 같은 글자로 열어 줌 | `file://` 문서끼리·`blob:` iframe은 같은 출처가 아님(Edge로 시험). srcdoc은 BOX가 CAL 패널에 이미 쓰는 방식. 서버판은 그대로(`HVACGridFiles`가 없으면 fetch·src) | `tools/make-single.cjs`, `app/bridge.js` `get`·`compareFrame`, `docs/SINGLE_FILE.md` |

### 하나의 캔버스 (2026-10-28 시작, 브랜치 claude/practical-gauss-p1ynfx)
①~⑤ 모든 단계를 BOX 캔버스 + HVAC Grid 평면 하나에서 한다. 계산 결과는 바꾸지 않는다(1.0 기준값 `npm run golden:check`, `test/v1-golden.test.cjs`).
1. ✓ ⑤ 검토·출력을 평면 위로: 평면(방화 경계·관통부·제한 구역·Deck의 모든 덕트)을 그대로 두고 표는 아래 도크(접기·끌어서 높이, 높이는 다음에도 기억). 관통부 행을 누르면 ③으로 가지 않고 그 평면에 위치 표시. 시험 `test/e2e/review-dock.e2e.cjs`
2. ✓ 공통 층 패널·데크 필터: 평면을 층(계통·풍량, 전달 공기, 공조기·수직 덕트, 덕트, RU, 덕트 크기, 방화 경계, 관통부, 제한 구역 통과)으로 그린다. 단계마다 기본 층이 있고(③ 풍량 / ③ 방화 / ④ / ⑤), 범례 위 체크로 켜고 끈 것은 그 단계에만 남는다(이 브라우저). 갑판 보기 "위·아래 Deck 흐리게"는 위(파선)·아래(점선) Deck 실 윤곽을 밑에 그린다. 시험 `test/e2e/layers.e2e.cjs`
3. ✓ ①②에도 HVAC Grid 층(리본 "HVAC Grid 층", 기본 꺼짐): BOX가 보여 주는 Deck 위에 겹치고 BOX의 이동·확대·Deck 전환을 따라감, 클릭은 BOX가 받음(그리기·선택 그대로), 계통 색이 켜지면 BOX 실 채움은 숨김. ③④⑤ → ①② 같은 보기(이전부터) 확인, 고른 실 공유(③에서 고른 실을 BOX가 강조, BOX 격실 목록·RM으로 고른 실이 ③의 선택). 시험 `test/e2e/box-layers.e2e.cjs`
4. ✓ PHG D 편집기 쓰는 일 줄이기: ④ 평면 층에 "금지 영역"(이 계통이 피하는 제한 구역 — PHG D AUTO 금지 영역, 빗금, 기본 켜짐)과 "덕트 풍속"(덕트마다 m/s, 풍량 ÷ 단면) 추가. 덕트를 누르면 오른쪽에서 종류(주 덕트·분기·보조 분기)를 바꿈 — PHG D의 ML/BR/SBR 지정 명령으로 그 덕트만 바꾸고 다시 계산, 실행 취소 됨. 편집기는 지금 평면이 보여 주는 곳으로 열림. 경로를 손으로 그리는 일만 편집기에 남음. 노드별 압력은 아직 편집기에서. 시험 `test/e2e/duct-plan.e2e.cjs`
5. (선택) 실행 취소 하나

### H5 남은 것
1. BOX·PHG D 편집과 HVAC Grid 편집을 하나의 Undo 기록으로 (지금은 화면별: ①② BOX, ④ PHG D, ③⑤ HVAC Grid)
2. 셸 공통 평면에서 RU 이동·덕트 편집 (지금은 PHG D 화면에서 편집 후 "결과 읽기")
3. 실도면 검증(설계자 덕트와 AUTO 비교) — PHG D A 계획 1번과 같은 자료 필요
