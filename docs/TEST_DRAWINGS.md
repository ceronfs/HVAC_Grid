# 시험 도면 — T3 시험선

작성 2026-10-19 · 생성 `tools/make-test-ship.cjs` (`npm run make:t3`) · 결과 `samples/t3/`, `samples/t3.contract.json`

S5(BOX 내장 예제)는 계통이 모두 한 Deck이고 실이 직사각형뿐이라 H2~H4 기능을 시험할 수 없습니다. T3는 그 빈자리를 채우는 **합성 시험선**입니다. 실제 호선 설계가 아닙니다.

## 1. 선박

화물선 거주구 4층, 20 × 16 m (항해선교 갑판은 12 × 16 m), 갑판 높이 2,800 mm, 73실(L자 선실 15실).

| Deck | Z (mm) | 실 | 내용 |
|---|---|---|---|
| D4 NAV BRG DK | 8,400 | 10 | 조타실(96 m²), 해도실, 무선실, 배터리실, 도선사실, 항해장비실, 선교팬룸(AHU-BRG) |
| D3 B DK | 5,600 | 20 | 선장실·기관장실(큰 L자 선실) 등 사관 6실 + 각 화장실, 선박사무실, 회의실 |
| D2 A DK | 2,800 | 26 | 선원침실 9실(L자) + 각 화장실, 체육실, 린넨창고 |
| D1 UPPER DK | 0 | 17 | 조리실, 선원식당·사관식당, 배식실, 세탁실, CO2실, 탈의실, 식료품창고·냉장고, **공조기실**(AHU-ACC·SF-GAL·EF-GAL·EF-LAU·EF-SAN·RA-ACC) |

D1~D3 공통: **기관실 케이싱**(A류 기관구역, 공조 없음), 복도, 계단실, **덕트 트렁크**(수직 덕트 샤프트), 공용화장실, 청소도구실·린넨로커.

## 2. 계통 (BOX 실 데이터의 sup / exh / ret)

| 계통 | 종류 | Deck | 담당 | 시험하는 것 |
|---|---|---|---|---|
| AHU-ACC | 급기 | D1·D2·D3 | 거주구 전체 | **다층 계통**: 공조기 D1 팬룸, D2·D3는 트렁크 샤프트에서 시작, 수직 덕트 2구간 |
| RA-ACC | 환기 | D1·D2·D3 | 선실·식당·복도 | 다층 환기(배기 모드 압력 계산) |
| EF-SAN | 배기 | D1·D2·D3 | 화장실·탈의실·청소도구실 | 다층 배기, 화장실은 배기만(전달 공기) |
| SF-GAL / EF-GAL | 급기 / 배기 | D1 | 조리실(배식실 배기) | 조리실 전용 계통(SOLAS II-2/9.7.5), 부압(배기 > 급기) |
| EF-LAU | 배기 | D1 | 세탁실 | 단독 배기 |
| AHU-BRG / RA-BRG / EF-BRG | 급기 / 환기 / 배기 | D4 | 선교 | 별도 공조기, 배터리실 배기 |

## 3. 파일

| 파일 | 내용 | 쓰는 곳 |
|---|---|---|
| `T3.box.json` | BOX CAL 프로젝트(`NODE-BOX-L4` v2). BOX 내장 S5 예제와 같은 형식: Deck 외곽 LINE + RECT/POLY 격실(실 번호·이름·부하 입력·계통). 설계 조건은 BOX의 S5 설정을 그대로 씀 | BOX `JSON 열기`, 셸 ① `T3 시험선` |
| `T3_D1.dxf` ~ `T3_D4.dxf` | Deck별 일반배치도: `DECK_OUTLINE`, `ROOM`(닫힌 LWPOLYLINE), `ROOM_NO`·`ROOM_NAME`(TEXT, UTF-8), `TITLE` | PHG D·BOX DXF 가져오기, `tools/dxf-check.cjs` |
| `T3_ALL.dxf` | 4개 Deck을 25 m 간격으로 나란히 | 전체 검토 |
| `T3.solas.json` | SOLAS 사전에 없는 실(덕트 트렁크 3실)의 공간 지정 | `tools/hvac-run.cjs --solas=` |
| `../t3.contract.json` | BOX가 계산한 계약(`tools/box-extract.cjs`) | 셸 `T3 시험선` 계약, 테스트 |

생성은 결정적입니다(같은 입력 → 같은 파일, 격실 UUID는 이름 기반 해시).

## 4. 이중 검토 (도면 ↔ 계약 ↔ 앱)

| 검토 | 방법 | 결과 |
|---|---|---|
| 도면 = 계약 | `tools/dxf-check.cjs`가 DXF의 닫힌 외곽선과 문자를 읽어(`lib/dxf-in.cjs`) 계약과 실 번호·이름·면적 대조 | 4 Deck 73/73 일치 (첫 검사에서 L자 선실 번호가 화장실 안에 찍힌 결함을 찾아 고침) |
| BOX 계산 | BOX가 `T3.box.json`을 열고 CAL이 73실 모두 계산 | 미완료 0, 계약 검사 문제 0 |
| PHG D 실 인식 | 셸에서 `T3_D2.dxf`를 PHG D로 가져와 PHG D 자신의 실 인식으로 3개 지점 확인 | 211 선원침실 01 / 211T 화장실 / 202 복도 |
| BOX DXF 가져오기 | 셸에서 `T3_D2.dxf`를 BOX `DXF 열기`로 | 도형·문자 모두 들어옴 |
| PHG D 입력 도면 | HVAC Grid가 PHG D로 보내는 Deck 도면(`deckDxf`)을 다시 읽어 계약과 대조 | S5 5 Deck, T3 4 Deck 모두 일치 |

자동 테스트: `test/project.test.cjs`(도면 대조·생성기), `test/e2e/t3.e2e.cjs`(앱 전체).
