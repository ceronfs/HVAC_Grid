# vendor 사본 패치와 원본 반영 목록

작성 2026-10-20 · 대상 `vendor/BOX_CAL_Enhance.html` (원본 `C:/Users/HK/OneDrive/CAL_Enhance/04_CAL_Enhance_fixed.html`, CAL_Enhance 32976f8) · 기록 `vendor/VERSIONS.json` · 시험 `test/e2e/vendor.e2e.cjs`

원본은 읽기 전용이다. HVAC Grid를 쓰면서 찾은 BOX 결함 가운데 고치는 범위가 좁고 확실한 두 가지(A·B)만 **사본**에 고쳤다. 원본에는 아래 바뀐 줄을 그대로 옮기면 된다. 사본을 원본의 새 판으로 바꿀 때는 원본에 A·B가 들어갔는지 먼저 확인한다(`npm run test:e2e`의 vendor 시험이 확인).

PHG D(`vendor/DuctConcept_PHG_D.html`)는 고칠 결함이 없었다. HVAC Grid가 PHG D에 하는 일(자동 복구 막대 숨김, 패널 닫기, 한국어 툴팁)은 화면 정리일 뿐이다.

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
