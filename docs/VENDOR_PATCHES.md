# vendor 사본 패치와 원본 반영 목록

작성 2026-10-20 · 대상 `vendor/BOX_CAL_Enhance.html` (원본 `C:/Users/HK/OneDrive/CAL_Enhance/04_CAL_Enhance_fixed.html`, CAL_Enhance 32976f8) · 기록 `vendor/VERSIONS.json` · 시험 `test/e2e/vendor.e2e.cjs`

원본은 읽기 전용이다. HVAC Grid를 쓰면서 찾은 BOX 결함 가운데 고치는 범위가 좁고 확실한 것(A·B, ISO 7547:2022 대조의 M·N)과, 사용자 지시(2026-10-21 "모두 수정")로 ISO 7547:2022 계산 방식(J·O~U)을, 사용자 지시(2026-10-22)로 LY 적용의 구조 K(W)를 **사본**에 고쳤다. 원본에는 아래 바뀐 줄을 그대로 옮기면 된다(재현 스크립트는 이 문서의 설명대로 문자열 치환 — 앵커가 정확히 한 번 맞을 때만 씀). 사본을 원본의 새 판으로 바꿀 때는 원본에 A·B·M·N·J·O~U·V·W·N2·O2가 들어갔는지 먼저 확인한다(`npm run test:e2e`의 vendor 시험이 확인).

PHG D(`vendor/DuctConcept_PHG_D.html`)는 2026-10-22까지 고칠 결함이 없었다(HVAC Grid가 하는 일은 자동 복구 막대 숨김, 패널 닫기, 한국어 툴팁 — 화면 정리). 2026-10-23 사용자 지시("GRID, PHG 모두 수정")로 **D9 다계통 AUTO**를 넣었다 — 아래 D9. D9는 사본만이 아니라 **원본(ceronfs/PHG)에도 같은 모듈**(`PHG_D_Build/foreign-ducts.cjs`)로 들어가며, 원본 빌드가 사본과 바이트까지 같다(sha256 앞 16자리 a4737b1aaf9dde47).

## 사본에 고친 것

### A. DXF 문자에서 실 번호 읽기 — 글자가 붙은 번호

- 증상: DXF를 "DXF 열기"로 열면 숫자로만 된 문자만 실 번호로 인정한다. "211T"(선실 화장실) 같은 번호는 실 이름 앞에 붙고("211T 선원침실 01 화장실") 번호 칸은 비어 격실 목록에 "미지정"으로 나온다.
- 고침: 숫자 앞이나 뒤에 영문자 한 자가 붙은 문자도 실 번호로 본다(211T, A12). 두 곳이 같은 규칙을 쓴다.

```diff
 /*@S:9:isRoomNumberText*/function isRoomNumberText(value) {
-    return /^\d+$/.test(String(value ?? "").trim());
+    return /^[A-Z]?\d+[A-Z]?$/i.test(String(value ?? "").trim());
   }
```
```diff
-      numberText=text=>/^\d+$/.test(text),
+      numberText=text=>/^[A-Z]?\d+[A-Z]?$/i.test(text),
```

- 그대로 둔 곳: 실 번호 자동 매기기(RN)가 Deck별 최대 번호를 찾는 줄(`numeric = /^\d+$/.test(stored)`)은 "211T"를 세지 않아도 번호가 겹치지 않으므로 두었다.
- 시험: 선 4개 + 칸막이 1개로 그린 두 실에 "211T"·"212" 문자 → 번호 211T · 212, 이름 "선원침실 화장실" · "선원침실". 원본에서는 실패, 사본에서는 통과.

### B. CAL 패널이 열린 채 도면이 바뀌면 다시 계산

- 증상: CAL을 연 뒤 다른 도면·예제를 열고 다시 CAL 단추를 누르면, 패널이 열려 있다는 이유로 그냥 돌아가 이전 도면의 격실로 계산한다(예: DXF 37실 → S5 94실로 바꿔도 "현재 격실 37개"). 이 결과로 만든 설계 데이터는 "unknown deck" 검사 실패가 난다.
- 고침: 패널이 열려 있어도, BOX 세션이나 모델 개정이 CAL을 연 때와 다르면 다시 연다. 같은 도면이면 지금처럼 그대로 둔다(다시 계산하지 않음). CAL 안에서 조건을 바꾼 것(commit)은 BOX가 개정을 맞춰 두므로 다시 계산하지 않는다.

```diff
 async function openCalEnhance(){
- if(calEnhancePanel&&!calEnhancePanel.hidden)return;
+ if(calEnhancePanel&&!calEnhancePanel.hidden&&calEnhanceSession===boxProjectSession&&calEnhanceRevision===modelRevision)return;
```

- 시험: BOX 자신의 CAL 단추로 S5(94실) → 패널을 연 채 H5 예제 → CAL 단추 → "현재 격실 7개". 같은 도면에서 다시 누르면 패널을 그대로 둔다. 원본에서는 "현재 격실 94개"로 실패, 사본에서는 통과.
- HVAC Grid 쪽 보호(`app/bridge.js` openCal의 도면 지문 비교)는 그대로 둔다. 원본이 고쳐지기 전 사본으로 돌아가도 안전하다.

### M. 실내 여름 설계 조건 기본값 — ISO 7547:2022 4.2 b) (2026-10-21)

- 증상: 설계 조건 기본값이 27 °C / 50 %이고 "ISO 7547 4.2"로 표시된다. 27/50은 2002판 값이고 2022판(BOX가 인용하는 판) 4.2 b)는 **25 °C / 55 %**다. BOX의 S5 예제 생성기는 이미 25/55를 쓴다. 실별 값을 넣지 않은 거주구 실(조타실·제어실·용도 미지정 포함)이 이 기본값을 받는다.
- 고침: CAL 프레임(`CAL_ENHANCE_FRAME_BASE64`)의 설계 조건 필드 두 값. 저장된 프로젝트의 설계 조건은 그대로 우선한다.

```diff
-    { key: "indoorCoolTemp", label: "실내 설계온도 · 여름", unit: "℃", value: 27, ...
+    { key: "indoorCoolTemp", label: "실내 설계온도 · 여름", unit: "℃", value: 25, ...
-    { key: "indoorCoolRh", label: "실내 설계 상대습도 · 여름", unit: "%", value: 50, ...
+    { key: "indoorCoolRh", label: "실내 설계 상대습도 · 여름", unit: "%", value: 55, ...
```

- 같이 고칠 것(원본): 습공기 함수 주석(`26 °C/50 %`)과 `ISO_DESIGN_BASIS` 표시는 값이 맞으면 그대로 둘 수 있다.
- 시험: vendor E2E가 사본의 CAL 프레임을 풀어 25 / 55를 확인.
- 보완(2026-10-21): BOX 자체 시험(`CAD_APP.selfTest`)의 "용도 미지정 격실 = 27 ℃/50 %" 기대값을 25 ℃/55 %로 — M 뒤 이 한 항목이 실패하고 있었음(125/126). 이제 vendor E2E가 BOX 자체 시험(126개)과 CAL 단위 시험(110개)을 함께 돌린다.

### N. 난방 급기 온도 상한 — ISO 7547:2022 6.3 (2026-10-21)

- 증상: AHU 난방 계산의 급기 상한이 실온 + 23 °C(`limitRise = 23`), 문구는 "적용 판본 확인 필요". 6.3은 **22 K**.
- 고침: 상한과 표시 문구 3곳(경고 `SUPPLY_LIMIT`, 리히터 시트 머리말, 설명 문단).

```diff
-    const limitRise = 23; // ISO 7547 supply heating delta; ...
+    const limitRise = 22; // ISO 7547 supply heating delta; ...
-"SUPPLY_LIMIT":"말단 실제 급기온도 > 실온 +23°C"
+"SUPPLY_LIMIT":"말단 실제 급기온도 > 실온 +22°C"
-['겨울 상한 실온+23°C; ...
+['겨울 상한 실온+22°C; ...
-급기 상한은 실온+23°C(ISO 7547 §6.3 기준, 적용 판본 확인 필요).
+급기 상한은 실온+22°C(ISO 7547:2022 §6.3).
```

- 시험: vendor E2E가 22 K와 23 K 문구가 남지 않았음을 확인.

### J·O~U. ISO 7547:2022 계산 방식 (2026-10-21, 사용자 지시)

검토(`docs/ISO7547_CHECK.md`)에서 권고로 남겼던 계산 방식을 사본에 반영했다. 공통 원칙: **이전에 저장한 프로젝트의 결과는 그대로**(새 설정이 없는 프로젝트는 이전 방식으로 열림 — BOX가 일사 정책에 쓰던 방식과 같음), 새 프로젝트는 ISO 방식이 기본. BOX 예제 S5·H5는 각자 명시한 정책을 유지(J). 화면 계산과 CAL 통합 XLSX 수식이 같은 값을 내도록 둘 다 고쳤다.

| # | 조항 | 고침 (CAL 프레임) |
|---|---|---|
| J | 5.3 식 (3)·모서리 선실 | 일사 방식 `roof-plus-max-wall`(노출 상부 갑판 전체 + 가장 큰 외벽 방향, 창 포함) 추가·새 프로젝트 기본. `roomSolarMode`·`resolveRoomSolar`·격실 팝업·검증·XLSX(유효 정책 I29, 선택 방향 I34, 면별 선택 X열, 설명) |
| O | 5.2.2 표 1 | 용도별 실 온도 기본값(`roomDesignConditions`)을 프로젝트 실내 조건 + 표 1 ΔT로: 보일러실 +28/−17, 기관실류 +18/−17, 세탁실 +11/−17, 공용 위생실 +6/0, 개인 위생실 +2/0, 탈의실·복도·계단·창고·로커·트렁크·팬룸·기계실 +2/−5 K. 실별 입력값이 있으면 그 값 |
| P | 5.2.1 그림 1·2, 5.3 | 창 전도 면적 = 수량 × (W+200)(H+200) mm(벽 면적 한도), 벽은 그만큼 차감, 창 일사는 유리 면적. `resolveWindowFace`(조각별 `frameAreaM2`), 부하 계산, `resolveRoomSolar`, XLSX(면별 Y열 "전도 창 면적", E35 합계, I41 배율, 수선 모드 포함)와 격실 시트 배치표(`mapRoomExcelCells`). BOX S5 부하 기준값 갱신(난방 +791.6 W = 벽 −249.1 W, 창 +968.7 W(K 3.5/0.9) × 1.1 — 손계산과 일치) |
| Q | 5.3 Gs | 창 일사 `auto-clear`(투명·차양 없음 350 W/㎡) 추가 — 240(내부 차양) 옆에. 화면·검증·XLSX |
| R | 표 1 #4·표 2 #2 | TANK 경계 35/−20 °C·KC 14(맨 철판 K ≈ 7.9) → 38/5 °C·K 0.8; NON_AC 프리셋 32/10 → 38/5 °C. 가열 탱크(#1 43 K, K 0.6)는 USER 경계로 |
| S | 5.4 표 4 | 격실 활동도: 경작업 85/150 W/인(조리실 등) — 격실 팝업 "활동도", 부하 계산, 격실 시트(설계조건 연결 대신 그 실 값) |
| T | 4.4 외기 잠열 | 새 프로젝트 기본 = 습도 기반(고정 7.5 W/CMH는 약 37 % 작음). 이 설정이 없는 저장 프로젝트는 고정계수로 열림. CAL 단위 시험의 "고정계수" 항목은 고정계수를 명시 |
| U | 5.5·D.3.3 | 설계 조건 "주광 실의 조명 부하": 창이 있는 실·조타실은 조명 0(새 프로젝트 기본), 이전 프로젝트는 "모든 실 포함". 격실 시트 조명 수식에 같은 조건. 그늘진 노출 갑판(표 2 #1 K 0.9, 일사 없음)은 면 경계 USER(35/−20 °C, K Type K7-SHIP_SIDE_EXTERNAL_BULKHEAD)로 지정 — 별도 코드 없음 |

시험:
- BOX 자체 시험 126/126, CAL 단위 시험 110/110(vendor E2E가 매번 실행), 각 패치의 코드 확인(vendor E2E)
- **XLSX 수식 검증**: T3(J·P·S·U 적용, 수선 꺼짐) 통합 계산서 18,399개 수식, H5(수선 켜짐, 해수 K 15) 1,552개 수식을 Microsoft Excel에서 전부 다시 계산 — 앱이 쓴 값과 차이 0개. 이 검증에서 P의 배치표 누락(Y열·I41 "Unmapped room reference")과 S의 설계조건 연결(경작업 실이 70/50 W로 되돌아감)을 찾아 고침
- T3 결과(v2.6): 현열 81.8 → 84.5 kW, 난방 52.6 → 54.8 kW, 급기 25,600 → 26,350 CMH(조타실 +0.8 kW·선장실 +0.25 kW 지붕 일사, 조리실 잠열 150 → 450 W). S5: 급기 11,680 → 11,750 CMH(P)

### V. KU 사용자 K — ISO에 추가 · LY에 추가 · 새 K 표 (2026-10-21, 사용자 지시)

이제까지 KU는 경계 종류별로 사용자 K를 배정하고, **배정하지 않은 경계는 KC 구조 계산값(LY)** 으로 계산했다. 이제 KU 창의 "경계별 사용자 K 배정" 위에서 사용자 K를 어디에 적용할지 고른다.

| 선택 | 배정한 경계 | 배정하지 않은 경계 | K Type 표기 |
|---|---|---|---|
| ISO에 추가 | 사용자 K | ISO 7547 기준 K (`K_STRUCTURE_DEFAULTS[*].standardK`) | 사용자 번호 / `K7-*` |
| LY에 추가 | 사용자 K | KC 구조 계산 K (이제까지와 같음) | 사용자 번호 / KC 번호 |
| 새 K 표 | 사용자 K | 프로젝트 기본 K (외부·내부) — 모든 경계에 배정 권장 | 사용자 번호 / `PRJ-EXT`·`PRJ-INT` |

- 고르지 않으면 "이 배정으로 부하 계산"이 적용되지 않고 고르라고 알린다. 선택은 `userKAssignments._base`에 두어, 배정이 지나는 저장·복원·호스트 전달·변경 감지 경로를 그대로 탄다. 선택이 없는 저장 프로젝트(이미 KU 적용 중 포함)는 이제까지처럼 KC로 계산한다.
- 배정 표의 빈 칸 이름(— ISO 7547 기준 K — 등), 적용 K 열의 회색 값, 모드 설명(XLSX "계산 기준")도 고른 기준을 따른다.
- 시험(`test/e2e/k-change.e2e.cjs`): 고르기 전 적용 안 됨, 아무 경계도 배정하지 않은 KU가 ISO·LY·프로젝트 K와 부하 합계까지 같음(T3 153,456 / 152,188 / 148,342 W — W 뒤 LY는 144,954 W), 프로젝트 JSON에 선택 저장. BOX 자체 시험·CAL 단위 시험은 vendor E2E.
- 스크립트: 세션 작업 폴더의 `boxpatch/p6-ku-base.cjs`, `p6b-ku-base-tdz.cjs`(정규화 함수가 목록 선언보다 먼저 불릴 수 있어 목록을 그 자리에 씀).

### W. LY 적용 구조 K — 경계 종류별 단열 두께 (2026-10-22, 사용자 지시)

- 증상: LY 적용(C✓, K 방식 `calculated`)이 경계 종류마다 KC 기본 구조 3·4(외부, 단열 50 mm)나 9·10(내부, 단열 25 mm)을 골라 썼다. 경계 종류에 적힌 단열 두께(`K_STRUCTURE_DEFAULTS.insulationMm` — 조타실 지붕 100, 일사 갑판 75, 그 밖 50 mm)는 KD 표에만 쓰이고 계산에는 쓰이지 않았다. 그래서 KD 표의 "계산 K"와 실제 적용 K가 달랐고, 내부 경계는 보일러실·기관실 인접도 일반 경계와 같은 K였다.

| 경계 | ISO 표 2 | 이전 LY | W 뒤 LY (= KD 표) |
|---|---|---|---|
| 조타실 지붕 | 최대 0.5 (부속서 D.3.1) | 0.750 | **0.455** |
| 일사 노출 갑판 | 0.6 | 0.750 | 0.567 |
| 선측·외부 격벽 | 0.9 | 0.748 | 0.748 |
| 보일러실·기관실·비공조·일반 내부·방음 복도 | 0.7 · 0.8 · 0.9 | 0.985 / 0.981 | 0.691 / 0.690 |
| 기관제어실 바닥 (25 mm) | 1.2 | 0.985 | 0.985 |
| 비방음 복도 (단열 없음, μ 1.2) | 2.5 | 1.530 / 1.518 | 1.530 / 1.518 |

(값은 갑판·천장 / 벽. 식은 ISO 7547:2022 5.2.4 식 (2), 원문 대조: α 80 / 8, 철판 6 mm λ 50, 단열 λ 0.04, 공기층 200 mm R 0.47(표 3), Panel 25 mm λ 1.233 / 1.734, μ 1.45(단열 없으면 1.2).)

- 고침 (CAL 프레임):
  - `structureLayerK(structure, insulationMm, kind)` 하나로 KD 표(`correctionBreakdown`)와 LY 적용(`calculatedStructureK`)이 같은 계산을 한다. 경계 종류의 단열 두께와 면의 Panel(갑판·천장은 Ceiling, 벽은 Wall)을 쓴다.
  - K Type `LY-<경계 종류>-C`(갑판·천장)·`-W`(벽) 20개를 K Type 목록에 넣었다. 면별 K Type 표기, 통합 계산서 KC DATA 시트(VLOOKUP), KC 표(LY · 구조 레이어 K값)에 나온다. KC 1~20은 그대로 남아 면별 K Type·KU에 쓰인다.
  - KU "LY에 추가"와 기준을 고르지 않은 이전 KU 프로젝트의 미배정 경계도 같은 LY K를 쓴다.
  - 문구: "KC 구조 계산 K" → "LY 구조 계산 K"(격실 부하 팝업·통합 계산서·KU 창·도움말·상태 줄).
- 영향: **LY 적용으로 저장한 프로젝트는 다시 열면 부하가 바뀐다.** 이전 방식을 남기는 설정은 두지 않았다. 이전 값은 KD 표와 어긋난 결함이기 때문이다(N과 같은 처리). T3: LY 냉방 98,749 → 95,747 W, 난방 53,439 → 49,207 W. ISO → LY 변경 목록은 69 / 79실, 냉방 −2.9 %, 난방 −10.2 %, 급기 26,350 → 25,750 CMH.
- 시험:
  - vendor E2E: 정적 확인. H5의 모든 면 K를 따로 계산한 값과 비교(`test/e2e/ly-k.cjs`).
  - k-change E2E: T3의 LY 면 653개, 경계 종류 9가지를 비교. KU "LY에 추가" 합계도 LY와 같음.
  - BOX 자체 시험 126/126, CAL 단위 시험 110/110.
  - T3 LY 통합 계산서 수식 18,399개를 Microsoft Excel에서 다시 계산해 앱 값과 차이 0개. 면 K Type 1,346칸이 모두 KC DATA 시트의 행을 찾음.
- 원본에 옮길 것: 위 함수 두 개(`structureLayerK`·`lyKTypeCode`)와 `calculatedStructureK`·`kTypeCode`·`kTypeDefinitions`·`kcCalculationDataRows`·KD `correctionBreakdown`, 문구 9곳. `simpleKCaseFor`는 이제 쓰이지 않는다(원본에서 지워도 됨).

### N2. 통합 계산서 겨울 최소 풍량 수식 — 22 K (2026-10-22, 검토 B8)

- 증상: N이 화면 계산(`limitRise = 22`)과 문구는 고쳤지만, CAL 통합 XLSX '격실 리히터' 시트의 겨울 최소 풍량 수식은 `D/(0.000335*23)`로 남아 있었다. 화면은 22 K, XLSX는 23 K로 겨울 최소 풍량이 약 4.5 % 작게 나왔다.
- 고침 (CAL 프레임, 한 곳):

```diff
-      r.summerMin??'',r.valid?f(`D${row}/(0.000335*23)`,r.winterMin):'',r.minimumOaCmh,...
+      r.summerMin??'',r.valid?f(`D${row}/(0.000335*22)`,r.winterMin):'',r.minimumOaCmh,...
```

- 시험: `test/review-2026-10-22.test.cjs`(프레임에 `*23`이 남지 않음), vendor E2E. 수식이 화면 계산(`netKw / (coefficient * limitRise)`)과 같은 식이 되었으므로 저장값과 재계산값이 같다. **Excel 재계산은 하지 않았다**(다음 Excel 검증 때 '격실 리히터' K열 확인).

### O2. 표 1 온도는 급기 없는 실에만 — ISO 7547:2022 5.2.2 (2026-10-22, 검토 O)

- 증상: O가 실 이름만 보고 세탁실·위생실·탈의실·복도·계단실의 **그 실 자체 설계온도**를 프로젝트 실내 조건 + 표 1 ΔT로 바꿨다. 원문 5.2.2는 표 1을 "공조 실과 비공조 실 사이" 온도차로 정한다(원문 확인, p. 5). 급기(SUP)가 있는 복도·세탁실은 공조 실이므로 실내 조건(25 °C/55 %)을 받아야 하는데 27 °C·36 °C 등으로 계산되어 그 실 자체 냉방 부하가 줄었다.
- 고침 (CAL 프레임): `roomDesignConditions(roomName, supplied = false)` — 급기가 있으면 세탁실·샤워실·화장실·욕실·공중·탈의실·복도·계단실은 프로젝트 실내 조건. 호출 두 곳(격실 목록 생성, `calEnhanceRooms`)이 실의 SUP로 `supplied`를 넘긴다. 실별 입력 온도가 있으면 여전히 그 값이 우선한다.
- 그대로 둔 것: 보일러실·기관실류·창고·로커·트렁크·팬룸·기계실은 급기가 있어도 표 1 그대로 — 그 급기는 환기이지 공조가 아니다.
- 영향: 실별 온도를 저장하지 않은 프로젝트에서 급기 있는 위 실들의 냉방·난방 부하가 커진다(실내 조건 기준). T3·S5 예제는 실별 온도를 갖고 있어(T3: 급기 있는 복도·계단실·세탁실 25 °C, 급기 없는 화장실 26·31 °C) 수치가 바뀌지 않았다. 이전 방식을 남기는 설정은 두지 않았다(N·W와 같은 처리 — 원문과 어긋난 결함).
- 시험: `test/review-2026-10-22.test.cjs`가 프레임의 함수를 꺼내 실행(급기 있는 복도·세탁실·탈의실·화장실·계단실 = 25 °C, 급기 없는 복도 27/16 °C, 보일러실은 급기가 있어도 53 °C), vendor E2E.
- 스크립트: 세션 작업 폴더의 `boxpatch-x-n2-o2.cjs`(앵커가 정확히 한 번 맞을 때만 치환).

### D9. PHG D — 다른 계통 덕트를 아는 AUTO, 급기 주관 띠 (2026-10-23, 사용자 지시)

- 배경: AUTO가 계획(Deck × 계통)마다 따로 돌아 다른 계통 덕트를 몰랐다. N3(seed 20261023) 세 Deck에서 평면 겹침 50곳(58.9 m), 교차 90곳 중 덕트 층 400 mm 초과 25곳, 간섭의 69 %가 복도(검토 보고서 2026-10-23). PHG D 엔진에는 다계통·교차 분류 기능이 있으나 HVAC Grid가 쓰는 래퍼가 1계통·`crossingPolicy:'FORBIDDEN'`으로 고정해 쓸 수 없었다. 앞 계통 덕트를 금지 영역으로 주면 교차가 전부 막혀(사용자 규칙 "덕트 층에 들어가면 교차 가능"과 반대) 완화 루프가 영역을 다 푼다.
- 고침(설정이 없으면 지금과 같다):
  - `settings.phgdForeignDucts` [{ id, systemId, points, widthMm, heightMm, diameterMm }](앱 좌표) + `settings.phgdForeignCrossing` { layerMm, gapMm(50), parallelGapMm, insulationMm, ownHeightMm, mode 'hard'|'soft', crossingCost }. 경로 탐색의 한 걸음마다: 직각 교차는 두 높이 + 이격 ≤ 덕트 층이면 허용(교차 비용 2,500 mm 상당), 넘으면 막음; 나란히 달려 두 덕트 외곽(폭의 반 + 보온·설치 여유)이 겹치면 막음(평면 겹침). `soft`는 둘 다 큰 비용. 경로의 높이는 그 경로가 맡는 RU 풍량으로 AUTO 크기 계산(`phgdPlanSection`, 높이 상한 `sizing[type].maxHeightMm` 반영)에서 얻는다.
  - 후보 점수(`weightedRouteCost`)에 다른 계통 교차·충돌을 더하고, hard에서 규칙을 어긴 주관 스파인 후보는 버린다.
  - `settings.phgdRouteZones` [{ id, zoneType 'PREFERRED'|'RESTRICTED', polygon }]: 이번 계산의 경로 구역(PREFERRED가 있으면 엔진의 복도 선호를 켬 — 띠 안 0.75, 밖 1 + 이탈 0.8). `settings.phgdMainCorridors` [{ name, polygon }]: 주관이 따를 복도를 실 이름으로 찾는 대신 호스트가 줌(주관 스파인 후보가 그 안에 생김).
- 적용: `node tools/patch-phgd-d9.cjs`(모듈 `tools/phgd-d9.cjs`, 원본의 `PHG_D_Build/foreign-ducts.cjs`와 같은 파일; 앵커 13곳이 정확히 한 번씩 맞아야 씀).
- 시험: `test/e2e/phgd-d9.e2e.cjs`(직선·옆으로 비킴·층 안 교차·층 초과 막힘·soft·띠), N3 E2E, PHG 원본 `node tests/run.cjs --quick`.
- HVAC Grid 쪽: `lib/duct-layer.cjs`(덕트 층·띠·순서), `app/bridge.js` `routeSettings`·`auto`(hard → soft → 다른 계통 빼기 순으로 완화, 금지 영역보다 먼저), `app/shell.js` `runAll`(Deck별 순서 · 앞서 만든 덕트망 전달), `lib/clash.cjs`(전 계통 간섭 검사).
- 실 안 급기 주관은 HVAC Grid가 그린다(`lib/duct-layer.cjs` `bandMain`: 띠마다 첫 RU~마지막 RU 선, 두 띠를 잇는 가로지름 덕트 하나 — 제한 구역·계단을 피한 Root에 가장 가까운 자리, Root는 바로 또는 복도 중심선으로). PHG D에는 주관 덕트로 넣고 `routingMode:'USER_MAIN'`으로 가지만 맡긴다(기존 기능). D9의 `phgdRouteZones`·`phgdMainCorridors`는 N3에서 쓰지 않는다: PHG D 주관 스파인은 한 줄뿐이라 양쪽 띠를 못 맡고(반대쪽 가지가 1.6배를 넘어 후보 탈락), PREFERRED 구역은 엔진의 복도 가중치를 켜 A* 탐색이 제한시간(120 s)을 넘었다. 다른 호스트용으로 남겨 두고 e2e로 시험한다.

## 원본에 권고만 하는 것 (사본은 그대로)

| # | 항목 | 지금 | 권고 | 사본에 안 고친 이유 |
|---|---|---|---|---|
| C | 표 창 글자 크기 | 10 px 고정(`!important`), 열 너비도 10 px 글자에 맞춰 고정 | 12 px, 열은 내용 폭(table-layout auto) | 글자만 키우면 고정 열에서 잘린다. 열 너비 계산까지 바꿔야 해 범위가 넓다. HVAC Grid는 `app/popup.css`로 해결 |
| D | 표 창 단추 RST · FIT · ⛶ | 영어·기호. 내보내기 검사가 RST·↻ 글자를 읽음 | 검사는 data 속성으로 하고 이름은 "새로 고침 · 맞춤 · 전체 화면" | 글자를 바꾸면 내보내기 검사가 깨진다. HVAC Grid는 글자 위에 덧씀 |
| E | CAL 패널의 A6 | 눌러도 창이 열리지 않음 | CAL 안 A6는 BOX 본화면 A6로 넘기거나 없앰 | 원인이 CAL 안 도면 선택과 얽혀 있다. HVAC Grid는 ①의 접한 면적만 씀 |
| F | 리히터 표 소수 자릿수 | 1023.1026 · 35.7254 | 표시 자릿수 통일(풍량 0, 온도 1, kW 2) | 표시 값과 XLSX 내보내기 값이 같은 배열이라 표시만 바꾸면 어긋난다 |
| G | 그리기 도구 툴팁 | Trim · Extend · Split … 영어 | 한국어(TR · 자르기 …) | HVAC Grid가 한국어 툴팁을 넣는다(`app/bridge.js` tips) |
| H | ISO 적용 · LY 적용 결과 | CAL 패널 상태 줄에만 | 알림(토스트)으로도 | HVAC Grid가 상태 줄에 옮겨 보여 준다 |
| I | CAL 격실 리스트(RL) 진입 | CAL 패널 안 RL 단추에서만 | BOX 본화면 격실 목록에서 "계통·부하 입력" 칸으로 이어짐 | HVAC Grid는 ② 리본 "격실 입력"으로 연다 |
| K | 조리실 잠열 (검토 L9) | 잠열 = 인원뿐 | 조리 수분(조리기구별 잠열 W) 입력 칸 | BOX에 입력 칸이 없음. 조리실 급기는 배기 규칙(50회/h)이 정하므로 풍량 영향은 작음 |
| L | PHG D 어두운 화면 | 없음 | 셸 테마를 따르는 어두운 테마 | PHG D 편집기는 밝은 채로 열림(HVAC Grid 화면은 어두운 테마 적용) |

J·O~U는 2026-10-21 사본에 반영 — 위 "J·O~U" 절.
