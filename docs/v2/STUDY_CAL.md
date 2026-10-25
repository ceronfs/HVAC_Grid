# V2-0.3 조사 — CAL ↔ BOX 결합과 부하 계산 기능 명세

작성 2026-10-25 · V2-0.3 · 대상 사본 `vendor/BOX_CAL_Enhance.html` sha256_16 **8892c20e503108f2**(`vendor/VERSIONS.json`) · 방향: **D7(새로 짬, 기능 참조)**·D8(같은 기능, 차이는 기록) · F-2: 이 환경에서는 ISO 7547:2022 원문(`C:\Users\HK\Desktop\Program\DATA\7547.pdf`)을 볼 수 없다 — 이 문서의 조항·값은 모두 **원문 미확인**이다(코드 주석과 `docs/ISO7547_CHECK.md`(2026-10-21, 원문 대조 기록)에서 옮김).

**읽는 법.** CAL 화면은 사본 안에 base64로 들어 있다(`vendor/BOX_CAL_Enhance.html:24217` `CAL_ENHANCE_FRAME_BASE64`). 이 문서의 **`CAL:<줄>`** 은 그 base64를 풀어 낸 글의 줄 번호다(푸는 법은 `test/e2e/ly-k.cjs` `calFrame()`과 같음). 풀린 글의 `/*@SHARED:k*/` 자리에는 호스트의 `/*@S:k*/ … /*@E:k*/` 블록이 들어간다(`vendor/BOX_CAL_Enhance.html:24221` `calEnhanceFrameHtml`). **`BOX:<줄>`** 은 사본 자체의 줄 번호다. 형상 계산(격실·접한 면)은 BOX의 L4 계산 워커에서 돈다(워커 소스도 base64, `BOX:10505` `L4_CALCULATION_WORKER_SOURCE_BASE64`).

## 1. 결론

- **CAL은 형상을 하나도 계산하지 않는다.** 격실 목록과 접한 면 표(A6 "면 행")를 BOX 호스트의 L4 워커가 만들어 넘기고(`calEnhanceGeometry` `BOX:24231`), CAL은 그 위에서 경계 조건·K·부하만 계산한다. 그래서 **부하 계산은 얕게, 형상은 깊게 묶여 있다.**
- 부하 계산부는 BOX의 전역 상태(`st.*`, `DC` 게터)를 읽지만 식은 분명하고 짧다(순수 산술은 약 40 KB, 화면·XLSX와 섞인 전체 약 110 KB `CAL:11633–13330`, AHU `CAL:3758–3987`). **2.0 부하 엔진은 이 문서 3~7장 명세로 새로 짤 수 있다.**
- 깊은 쪽은 **면 행을 만드는 형상 엔진**이다: 격실 경계 변 분할, 판넬 간극(25/50 mm, 격벽 이격 100~500 mm) 무시 접촉, 높이별 수직 패치, 데크 상하 접촉(다각형 불리언, z 허용 10 mm), 곡면 외판(HULL_TOP/HULL_BOTTOM·Hull Link), 흘수선 분할, 면적 보존 검사. 이 부분은 V2-5(도면·격실 엔진)가 `boundaries`로 만들어야 하고, V2-4 동안은 **1.x BOX가 만든 면 행을 모델 `boundaries`로 가져오는 어댑터**로 대신한다. 중간 단계(모델 → BOX JSON → 숨긴 CAL `report()`)는 부하에는 필요 없다.
- 추정: **V2-4 = 13~17 작업일**(계획서 8~15; 부하 XLSX 수식판을 새로 만들면 +2~3). 면 행 형상 엔진은 V2-5에 **+6~9 작업일**로 더해야 한다(K1에서 다시 정함). 9장.

## 2. CAL이 BOX에서 받는 것

흐름: HVAC Grid `Box.openCal()`(`app/bridge.js`)이 BOX의 `calEnhanceBtn`을 누름 → `openCalEnhance()`(`BOX:24262`) → `calEnhanceGeometry()`가 `queueL4Calculations()`(`BOX:11622`, 워커 `rooms`)·`queueL4Faces()`(`BOX:11650`, 워커 `a6`)를 기다려 `{project, rooms, faces:{raw, summarized}}`를 만듦 → CAL 프레임 `CAL_ENHANCE.load(input)`(`CAL:21135`)가 `project`를 자기 BOX 사본에 `restore()`하고 `rooms`·`faces`를 `window.CAL_ENHANCE_INPUT`에 둠. **CAL 프레임은 BOX 앱 전체의 사본**(제목 NODE BOX)이며 `cachedRooms()`(`CAL:5676` → `calEnhanceRooms` `CAL:21102`)·`cachedGeometricFaces()`(`CAL:10129`)가 그 입력을 돌려줄 뿐이다.

| 항목 | BOX 함수/필드 | 뜻 | 2.0 모델에서의 자리 |
|---|---|---|---|
| 격실 | `rooms()` `BOX:16166`(워커 `rooms`), 레코드 `BOX:16360–16400` | `id, no, name, deck(이름), deckId, x/y(내부 점), z(데크 z), height(데크 층고, 기본 2800), ceilingHeight(0=데크 층고), floor(㎡, 구멍 뺀 순면적), volume(㎥, 외판 고려 측정 `createRoomVolumeMeasurer`, 아니면 floor×높이), polygon·holes(mm), boundaryEntityIds, topologyFaceId, loadIncluded` | `rooms[]`(`polygon, holes, areaM2, volumeM3, deckId, isoClass`) + `z·height`는 `decks[]`에서. `ceilingHeightMm`, `loadIncluded`가 더 필요 |
| 격실 설계 입력 | BOX 엔티티(격실 폐합선) 필드나 `st.roomOverrides`에 저장, 목록 `CAL_ENHANCE_ROOM_FIELDS` `CAL:21093`; CAL이 `CAL_ENHANCE_METADATA`(`CAL:21056`)로 합침 | 4장 격실 필드 | `conditions.rooms[roomId]` |
| 용도 기본 조건 | `roomDesignConditions(name, supplied)` `CAL:7327`, `inferIsoClass(name)` `CAL:7357` | 이름 → 냉난방 실온·습도, ISO 구분 | 엔진 규칙(`lib/engines/load/rooms.cjs`), 결과는 `rooms[].isoClass` |
| 6면 | `sixFaces()` `BOX:19049` | 격실마다 방향 6개: `상 z+`, `하 z-`, `좌현 y-`, `우현 y+`, `선수 x+`, `선미 x-`(선박 좌표: 선수 +X, 좌현 +Y; 화면은 Y 반전) | `boundaries[].side`(PLAN_V2 6장에 없음 — 더해야 함) |
| 수직면(벽) | `verticalFaceRows()` `BOX:18772`, `roomBoundarySegments()` `BOX:18478`, `buildSplitRoomBoundaryCache` `BOX:18569`, `collinearOverlapInterval` `BOX:18739`, `wallPanelAnalysis` `BOX:11376` | 격실 변마다 다른 격실 변과 겹치는 구간(공선, 간극 ≤ `PANEL_GAP_MAX` = 격벽 이격 최대 + 55 mm `BOX:18736`)을 높이 구간(z0~z1)으로 잘라 패치; 가장 가까운 상대가 접촉, 같은 거리 둘 이상이면 "미확정(접촉 모호)", 없으면 "외기". 면적 = 길이×높이(데크-데크, 5.2.5 강재-강재 기준 `CAL:7640`), 곡면이면 외판 측정 | `boundaries[]`(bulkhead/outer) |
| 상하 접촉 | `NODE_BOX_HORIZONTAL_CONTACTS` `BOX:9387` | 천장 = 위 데크 격실 바닥과의 다각형 교집합(z 차 ≤ 10 mm), 나머지는 "외기"; 면적 합 = 단면적이 아니면 `CONTACT_AREA_CONSERVATION` 오류 | `boundaries[]`(deck/floor/ceiling) |
| 접한 면적 A6 | `summarizeFaces()`→`summarizeDirectionalFaces` `BOX:18970`, `NODE_BOX_ADJACENCY.fromFaceRows` `BOX:9292` | 같은 (격실, 방향, 상대) 면을 합쳐 한 행. **면 행** = `[0 데크 이름, 1 격실 이름, 2 방향, 3 상대 이름/'외기', 4 면적 ㎡, 5 치수[dx,dy,h] mm, 6 상대 id|null, 7 상대 deckId, 8 격실 id, 9 방법 글, 10 모양(벽 a·b·z·height 또는 면 rows), 11 surfaceId, 12 surfaceGroupId, 13 메타{waterline, zMm, …}, 14 접촉 id 'C:…'(안정 id)]`. **같은 경계가 양쪽 격실에 한 행씩** 있다 | `boundaries[]` 한 줄 = 한 격실의 한 면(양쪽 격실이 각자 소유). 안정 id·면 키 필요(창·면 재정의가 이 키에 붙음) |
| 면 경계 BC | `faceBoundaryCondition()` `CAL:12605`, 종류 `FACE_BOUNDARY_TYPES` `CAL:12151`, 재정의 `st.faceBoundaryOverrides[faceBoundaryKey]` `CAL:12161` | `ADJACENT`(인접 격실), `OUTDOOR`(외기), `SEA`(해수), `TANK`, `GROUND`(지면), `NON_AC`(비공조), `USER`(사용자 온도), `UNKNOWN`(참조 오류). 상대 id 있으면 ADJACENT, 없으면 OUTDOOR, 흘수선 아래 외판은 SEA | `boundaries[].type` + `conditions.k.faceOverrides` |
| 데크 쌓임 | `st.decks[] {id, name, z, height, offsetX, offsetY, rotation, scale, unitConfirmed…}`, `deckStackIssues()` `BOX:19102`, `DECK_STACK_TOL` = `GEOMETRY_PROFILE.deckStack.toleranceMm` = **10 mm** `BOX:7514` | 아래 z + 층고 = 위 z(±10 mm)가 아니면 천장·바닥이 서로 못 만나 양쪽 다 "외기"로 계산 → 경고(차단은 아님). D4 그대로 | `decks[] {z, height}`; 검사는 엔진 |
| 외판 | `hasHullRole`·`isHullOutline` `BOX:16844`, `createRoomHullLevelResolver` `BOX:18091`, `NODE_BOX_ROOM_HULL_LEVELS` `BOX:9343`, `createHullSurfaceMeasurer` `BOX:17935`, `createRoomHorizontalSectionProjector` `BOX:18102`, Hull Link `isHullLink` | 데크마다 하부·상부 외판 윤곽(역할 `HULL_BOTTOM`/`HULL_TOP`)을 이어 선체 곡면 단면을 만들고, 외벽 면적·체적·상하 접촉 단면을 그 곡면으로 잼. Hull Link = 상하 윤곽 대응점 참조선 | `geometry[deck].lines[purpose:'HULL']` + **역할(TOP/BOTTOM)·Hull Link** 필요(6장에 없음) |
| 흘수선 | `NODE_BOX_WATERLINE` `BOX:7070`, `cachedFaces()` `BOX:7404`(`waterlineApplyFaces`) | `waterlineEnabled`·`waterlineZMm`(도면 Z=0 기준 절대 mm)로 외기 외판을 수중 `SEA`/수상 `OUTDOOR`로 나눔(surfaceId 꼬리 `:WL:SEA`). 켜고 Z가 없으면 **모든 격실 계산 차단** | `conditions.project.waterline` |
| 면적 보존 | `surfaceAreaConservationReport()` `CAL:11001` | 6면 면적 합이 형상과 맞지 않으면(차단 이슈) 그 격실 미완료 | 엔진 검사(형상 엔진 쪽) |
| 단위 확정 | `normalizeDeckMetadata(d).unitConfirmed` `CAL:4878` | DXF 단위 미확정 데크 격실은 미완료 | 2.0은 mm 고정 — 가져올 때 확정 |
| CAL이 부르는 BOX | `window.parent.CAL_ENHANCE_HOST.commit(change)` `BOX:24246`(CAL `changed()` `CAL:21148`), `CAL_ENHANCE_HOST.examples.{h5,s5}` `CAL:20386` | CAL에서 바꾼 설정·격실 입력(`calEnhanceCapture` `CAL:21130`: `values`, `roomOverrides`, `entityData`)을 BOX 상태에 되써 넣고 형상을 다시 계산해 `updateGeometry()` | 2.0에는 없음(한 모델) |
| BOX가 부르는 CAL | `CAL_ENHANCE.{load, updateGeometry, capture, changed, showRoomLoads, unitSelfTest, ahu, report}` `CAL:21135–21153` | | — |
| HVAC Grid가 부르는 것 | `Box.openCal`, `watchCalCommits`(commit 감쌈), `cal(code)`(CAL 버튼 클릭: `CAL_IDS`), `calSnapshot()`·`extract()`(`report()` + `CAD_APP.stack.decks`), `drawingSig()`, `projectJson()` — `app/bridge.js:163–302` | | 2.0에서 모두 없어짐 |

## 3. 부하 계산 기능 명세

주 함수 `calculatedRoomLoads(records, faces, modeOverride)` `CAL:12969`. 입력: 격실(4장 필드 포함), 면 행(요약), 설계 조건 `DC`, K 설정, 면 재정의. 격실마다 아래를 더하고, 면은 그 격실(`face[8]`)의 것만 쓴다. **제외 격실(`loadIncluded=false`)은 결과에서만 빠지고 인접 경계 조회에는 남는다.** 상수: ρ 1.2 kg/m³, cp 1005 J/kgK(`CAL:4073`), 계수 0.000335 kW/(CMH·K)(`CAL:3760`).

| # | 성분 | 입력 | 식 | 상수·기본값 | ISO 7547 (원문 미확인) |
|---|---|---|---|---|---|
| 1 | 관류(면) | 면 면적 A, K(5장), 인접 냉난방 온도(경계 해석), 실 `coolTemp`·`heatTemp` | 냉방 Σ A·K·max(0, T인접,냉 − T실,냉); 난방 Σ A·K·max(0, T실,난 − T인접,난) (`transmissionLoadW` `CAL:11804`, 음수는 0) | 무효 면(UNKNOWN, 끊긴 참조, 없는 K Type, USER 온도 없음, 해수 K 미지정)은 0 W로 두고 격실 **미완료** | 5.2.1 식 (1) |
| 2 | 경계 온도 | 경계 종류 | ADJACENT = **상대 격실의 설계 실온**(냉·난); OUTDOOR = 외기 35/−20; SEA 32/5; TANK 38/5; GROUND 20/5; NON_AC 38/5(`BOUNDARY_PRESET_DEFAULTS` `CAL:4124`, 프로젝트 `boundaryPresets`가 우선); USER = 면에 적은 온도 | 해수 32/5는 관례 | TANK·NON_AC: 표 1 #4(13/17 K); 해수 값은 표준 값 아님 |
| 3 | 창 | `windowWidthMm × windowHeightMm × windowCount`, `windowK`(기본 복층 3.5, 삼중 2.5), 소유 외벽(`windowFaceKey`·서명, 없으면 가장 큰 외벽 — 경고), `windowBottomZMm`(흘수선을 가로지르면 필수) | 전도 면적 = (W+200)(H+200) mm × 개수, 그만큼 벽 관류에서 빼고 창 K로 다시 더함; 일사는 유리 면적 W×H에만(`resolveWindowFace` `CAL:12873`) | 수중 창은 K 검토 확인 전 0 | 5.2.1 그림 1·2(+200 mm); 표 2 창 6.5/3.5/2.5 |
| 4 | 구조체 일사 | 외기(OUTDOOR) 면만, 방향별 ΔTr(`solarUpliftK` `CAL:11750`) | 후보 = (면적 − 창 전도 면적)·K·ΔTr; 창 후보 = 유리 면적 × Gs. 방향별 합(외벽)과 상부(상) 합 중 선택(`resolveRoomSolar` `CAL:11654`) | ΔTr 상 16, 좌·우현 12, 선수·선미 12 K(밝은색; 어두운색 32/29); Gs `auto-clear` 350, `auto-double-interior-shade` 240, `manual` 입력값 | 5.3(ΔTr, Gs), 5.3 식 (3) |
| 5 | 일사 면 선택 `solarFaceMode` | 프로젝트(`DC.solarFaceMode`) 또는 격실별 | `roof-plus-max-wall`: 상부 전체 + 합이 가장 큰 외벽 방향 하나(새 프로젝트 기본, 패치 J); `max-wall-or-roof`: 둘 중 큰 쪽 하나(동률은 벽); `legacy-all`: 모든 외기면 | 저장값이 없던 옛 프로젝트 = `legacy-all`(`normalizeStoredSolarDesignConditions` `CAL:4143`) | 5.3(모서리 선실 최대 면) |
| 6 | 인체 | `people`, `activity` | 현열 = 인원 × 현열/인, 잠열 = 인원 × 잠열/인(`activityHeat` `CAL:11636`) | 정좌 = 프로젝트 70/50 W; `light` 85/150 W(고정) | 5.4 표 4 |
| 7 | 조명 | `lighting` W/㎡, floor | floor × lighting; `daylightLighting='ignore'`이면 창이 있는 실·조타실(WHEELHOUSE)은 0 | 새 프로젝트 `ignore`, 옛 프로젝트 `include` | 5.5, D.3.3 |
| 8 | 기기 | `equipW`, `equipLatentW` | 현열·잠열 그대로 | — | 5.5(장비 값은 실 입력) |
| 9 | 최소 신기 | `minimumFreshAir`(CMH), people | `minimumFreshAirCmh = max(minimumFreshAir, people × freshAirCmhPerPerson)` | 28.8 CMH/인 | 4.4(0.008 m³/s·인) |
| 10 | 환기량(ACH) | volume, `minimumAch` | `ventilationAirCmh = volume × minimumAch` — **배기 검토용, 외기 부하 아님** | — | 6.4.1(배기 회수) |
| 11 | 신기 부하(참고) | 최소 신기, 실온·습도 | 현열 = ρ·cp·CMH·(T외 − T실)/3600; 잠열 = CMH × 계수; 난방 = ρ·cp·CMH·(T실 − T외)/3600. **격실 합계에 넣지 않음**(AHU 코일·계통 OA로 감) | — | — |
| 12 | 잠열 계수 | `latentModel` | `fixed`: `ventLatentWPerCmh`(7.5); `humidity`: ρ·ΔW·h_fg/3600, ΔW = W(외기 35 °C/70 %) − W(실 냉방), Magnus 포화압 610.94·exp(17.625t/(t+243.04)), W = 0.621945·pw/(101325 − pw), h_fg 2 501 000 J/kg(`CAL:11764–11792`) | 새 프로젝트 `humidity`, 옛 프로젝트 `fixed` | 표준 값 아님(7.5는 관례) |
| 13 | 합계·안전율 | `safetyFactorPct` | `coolingSensibleW` = 관류 + 구조체 일사 + 창 관류 + 창 일사 + 인체 현열 + 조명 + 기기 (**안전율 전**); `coolingLatentW` = 인체 잠열 + 기기 잠열(안전율 전); `coolingW` = (현열 + 잠열)·(1 + SF); `heatingW` = (면 관류 + 창 관류)·(1 + SF) — 신기·인체·조명 없음(`calculateThermalLoadComponents` `CAL:11810`) | SF 10 % | 표준 값 아님(관례) |
| 14 | 완료 판정 | — | `calculationComplete` = 흘수선 설정 유효 ∧ 창 연결 유효 ∧ 창 용량 문제 없음 ∧ 수중 창 K 확인 ∧ 무효 면 0 ∧ 데크 단위 확정 ∧ 면적 보존 통과 ∧ 수동 외벽 오류 없음. 아니면 `coolingW = heatingW = 0`, 값은 `partialCoolingW`·`partialHeatingW`에, 사유는 `calculationStatus`("완료 · 흘수선 미검증", "미완료 · 경계 오류 n개" …) | — | — |
| 15 | 계통 신기 | 계통(SUP)별 격실 | `systemFreshAirResult` `CAL:13248`: 최소 = Σ 최소 신기, 배기 보충 = Σ(EXH 실 환기량) × 1.05, 확정 = 사용자 확정값 또는 max(최소, 건조 사양 `systemCmh`); OA 냉방 = 확정 CMH × (T외 − 가장 낮은 실온) 현열 + 잠열(가장 건조한 실 기준), × (1 + SF); OA 난방 = 확정 CMH × (가장 높은 실온 − T외) × (1 + SF) | 가압 5 % 관례 | 6.5(양압) |
| 16 | AHU 난방·냉각 코일 | 7장 | `BOX_AHU_HEATING.calculate(loads, config, DC, systemFreshAir)` `CAL:3759` | 7장 | 6.3 |
| 17 | 배기 검토 | 이름, volume, EXH | `isoExhaustCheck` `CAL:7367`: 개인 위생실 max(72 CMH, 10회/h), 공용 위생실·세탁·건조·다림 15회/h, 탈의·세면·청소구 10회/h, 병원·배식·흡연 ≥ 급기 × 1.2, 식당·휴게 = 급기 (글로만) | — | 6.4.1 |

**부하에 넣지 않는 것:** 팬·덕트 발열(코일에서만 `fanRise`), 가구 체적(6.1), 시간별 일사(ASHRAE 아님).

## 4. 설계 조건 · 격실 입력 필드

### 4.1 프로젝트 설계 조건 `st.designConditions` (`DESIGN_CONDITION_FIELDS` `CAL:4075`, 조항 표시 `ISO_DESIGN_BASIS` `CAL:4114`)

| 키 | 뜻 | 새 프로젝트 기본 | 조항(원문 미확인) |
|---|---|---|---|
| `waterlineEnabled` · `waterlineZMm` | 흘수선 자동 경계 on/off, 절대 Z mm(null = 미지정 ≠ 0) | on · null(옛 파일 off) | — |
| `waterlineSeaKType` · `waterlineSeaDirectK` | 해수 외판 K Type(`''`/`'14'`/`'15'`) · 직접 K | '' · null | — |
| `solarFaceMode` | 일사 면 선택(3장 #5) | `roof-plus-max-wall` | 5.3 |
| `externalCoolTemp` · `externalRh` | 여름 외기 | 35 °C · 70 % | 4.2 a) |
| `externalHeatTemp` | 겨울 외기 | −20 °C | 4.3 |
| `indoorCoolTemp` · `indoorCoolRh` | 여름 실내 | 25 °C · 55 %(패치 M) | 4.2 b) |
| `indoorHeatTemp` | 겨울 실내 | 22 °C | 4.3 |
| `externalK` · `internalK` | 프로젝트 기본 K 외기면·내부면 | 0.7 · 0.9 | 표준 값 아님 |
| `peopleSensibleW` · `peopleLatentW` | 인체 현열·잠열(정좌) | 70 · 50 W | 5.4 표 4 |
| `daylightLighting` | 주광 실 조명 | `ignore`(옛 `include`) | 5.5, D.3.3 |
| `latentModel` · `ventLatentWPerCmh` | 신기 잠열 방식 · 고정계수 | `humidity`(옛 `fixed`) · 7.5 | 관례 |
| `freshAirCmhPerPerson` | 인당 최소 신기 | 28.8 CMH | 4.4 |
| `safetyFactorPct` | 안전율 | 10 % | 관례 |
| `solarUpliftTopK` · `SideK` · `EndK` | 일사 상당 온도차 | 16 · 12 · 12 K | 5.3 |
| `boundaryPresets.{OUTDOOR,SEA,TANK,GROUND,NON_AC}` | 경계 온도 냉/난 | 35/−20, 32/5, 38/5, 20/5, 38/5 | TANK·NON_AC 표 1 #4 |
| `solarPolicySource` | 일사 방식 출처 표시 | `new-project` | — |

**주의(차이 기록용):** 저장된 프로젝트는 자기 값을 쓴다. S5 기준값(`test/fixtures/v1-golden/s5/cal.json`)은 `max-wall-or-roof`·`fixed`·`include`, 프리셋 TANK 35/−20·NON_AC 32/10이고, `samples/t3.contract.json`도 TANK 35/−20·NON_AC 32/10이다. 새 엔진은 기본값이 아니라 프로젝트 값을 읽어야 같은 기능이다.

### 4.2 그 밖의 프로젝트 설정 (`CAL_ENHANCE_FIELDS` `CAL:21092`)

`kValueMode`(`project`/`iso-standard`/`calculated`/`user`), `iso7547K`(옛 불리언), `userKData`(KU 케이스 목록), `userKAssignments`(경계 종류 → KU 코드, `_base`), `faceBoundaryOverrides`(면 키 → `{type, targetRoomId, label, coolingTemp, heatingTemp, kType, directK}` `CAL:12173`), `systemFreshAir`(SUP → `{systemCmh, finalSet, finalCmh}`), `ahuHeatingConfig`(`systems[ahu]`·`rooms[id].ahu`, 7장), `areaConservationSettings`, `reviewState`, `calculationMetadata`.

### 4.3 격실 필드 (`calEnhanceRooms` `CAL:21102`, `CAL_ENHANCE_METADATA` `CAL:21056`; `calSnapshot` keep 목록 `app/bridge.js:288`)

| 필드 | 뜻 | 없을 때 |
|---|---|---|
| `roomNo` · `roomName` | 번호·이름(DXF 문자보다 우선) | DXF 문자 |
| `coolTemp` · `coolingRh` · `heatTemp` · `heatingRh` | 실 설계 조건 | `roomDesignConditions(이름, SUP 있음)`(4.4) |
| `sup` · `exh` · `ret` | 급기·배기·환기 계통 이름 | '' |
| `people` · `activity` | 인원 · `''`/`'light'` | 0 · 정좌 |
| `lighting` | W/㎡ | 0 |
| `equipW` · `equipLatentW` | 기기 현열·잠열 W | 0 |
| `minimumFreshAir` · `minimumAch` | 실 최소 신기 CMH · 최소 환기 회수 | 0 |
| `loadIncluded` | 부하 계산 포함(Y/N) | 포함 |
| `ceilingHeight` | 유효 천장고 mm — **체적·ACH에만**, 면적은 데크-데크 | 0(데크 층고) |
| `isoClass` | `CONTROL`·`BOILER`·`ENGINE`·`WHEELHOUSE`·`ALLEY_SOUND`·`ALLEY_NON_SOUND`·`NON_AC`·'' | `inferIsoClass(이름)`(`isoClassAuto` 표시) |
| 창 `windowApplied, windowWidthMm, windowHeightMm, windowCount, windowType('복층'/'삼중'), windowK, windowSolarMode, windowSolarWm2, windowBottomZMm, windowFaceKey, windowFaceSignature, windowFaceNo, windowBindingState, windowKReviewSource, windowArea(옛)` | 3장 #3 | 옛 `windowArea`만 있으면 폭 = 면적 × 1000, 높이 1000 |
| `solarFaceMode` · `solarInputSource` · `solarDesignReview` | 격실별 일사 방식·출처·조타실 검토 | 프로젝트 값 |

### 4.4 용도 기본 조건 `roomDesignConditions` (`CAL:7327`, 이름 정규식; 실 입력이 우선)

냉동고 −20/80 % 고정, 냉장고 4/75 %; 보일러실 실내 +28/−17 K, 기관실류 +18/−17 K(표 1 #2·#3); 전자·전기·배터리실 24/18; 주방·배식실 28/18; **SUP가 있는** 세탁·위생·탈의·복도·계단 = 프로젝트 실내(패치 O2); SUP 없는 세탁 +11/−17, 공용 위생 +6/0, 개인 위생 +2/0, 탈의 +2/−5, 복도·계단 +2/−5, 창고·트렁크·팬룸·기계실 +2/−5 K(표 1 #5~#8); 의무실 24/22; 거주구·조타실·제어실·이름 없음 = 프로젝트 실내(난방 습도 40 %). 조항: 5.2.2 표 1(원문 미확인). `inferIsoClass`(`CAL:7357`): 이름으로 CONTROL/BOILER/ENGINE/WHEELHOUSE/ALLEY_SOUND/NON_AC(ALLEY_NON_SOUND는 자동으로 안 나옴).

## 5. K 표 · 모드 (ISO 적용 · LY 적용 · KU)

K 결정 순서(`faceBoundaryCondition` `CAL:12605`): **면 직접 K** → **면 K Type**(`kTypeDefinitions` `CAL:12295`) → (해수) 프로젝트 해수 직접 K → 해수 K Type → (해수, 흘수선 모델 꺼짐) KC 14 → (TANK) 0.8 → **모드 K** `boundaryKValue` `CAL:12259`.

경계 종류 `boundaryKCategory(face, external, 내 실, 상대 실)` `CAL:11925`: 외기 + 조타실 + 상 → `WHEELHOUSE_ROOF`; 외기 상 → `WEATHER_DECK_SUN`; 외기 벽·하 → `SHIP_SIDE_EXTERNAL_BULKHEAD`; 내부: 제어실↔기관실 → 제어실 쪽 바닥이면 `CONTROL_ROOM_FLOOR` 아니면 `CONTROL_ROOM_WALL_CEILING`; 보일러 → `BOILER_ROOM`; 기관·비공조 → `NON_AIR_CONDITIONED`; 비방음 복도 → `ALLEY_NON_SOUND`; 방음 복도 → `ALLEY_SOUND`; 나머지 `GENERAL_INTERNAL_BOUNDARY`. **"외기" = OUTDOOR만**(SEA·TANK·GROUND·NON_AC는 K는 모드로 정하되 일사·외기 면적 집계에서 빠짐).

| 종류 (`K_STRUCTURE_DEFAULTS` `CAL:11834`) | ISO K(K7) | 외기 | 판넬 | LY 단열 mm | 조항(원문 미확인) |
|---|---|---|---|---|---|
| WHEELHOUSE_ROOF 조타실 지붕 | 0.5 | ○ | 천장 | 100 | D.3.1(≤ 0.5) |
| WEATHER_DECK_SUN 일사 노출 갑판 | 0.6 | ○ | 천장 | 75 | 표 2 #4 |
| BOILER_ROOM 보일러실 인접 | 0.7 | | 양쪽 | 50 | 표 2 #3 |
| NON_AIR_CONDITIONED 기관실·화물창·비공조 | 0.8 | | 양쪽 | 50 | 표 2 #2 |
| SHIP_SIDE_EXTERNAL_BULKHEAD 비일사 갑판·선측·외부 격벽 | 0.9 | ○ | 양쪽 | 50 | 표 2 #1 |
| ALLEY_SOUND 방음 복도 | 0.9 | | 벽 | 50 | 표 2 #8 |
| CONTROL_ROOM_WALL_CEILING 제어실 벽·천장 | 0.8 | | 양쪽 | 50 | 표 2 #9 |
| GENERAL_INTERNAL_BOUNDARY 일반 내부 | 0.9 | | 양쪽 | 50 | "P"(프로젝트 가정) |
| CONTROL_ROOM_FLOOR 제어실 바닥 | 1.2 | | 천장 | 25 | 표 2 #10 |
| ALLEY_NON_SOUND 비방음 복도 | 2.5 | | 벽 | 0 | 표 2 #7 |
| 창 단판·복층·삼중 | 6.5 · 3.5 · 2.5 | | | | 표 2 #5·#6·#11 |

| 모드 (`K_VALUE_MODES` `CAL:12214`) | HVAC Grid 명령 | K |
|---|---|---|
| `project` | (끄면) | 외기면 `externalK` 0.7, 내부면 `internalK` 0.9 |
| `iso-standard` | **K7 ISO 적용**(켜기/끄기 `CAL:20295`) | 위 표 ISO K; 없으면 프로젝트 K |
| `calculated` | **C✓ LY 적용**(`CAL:20318`, 패치 W) | `structureLayerK` `CAL:11960`: R = 1/αo(외기 80, 내부 8) + 1/αi(8) + (강판 6 mm/λ50 + 단열 t/0.04 + 공기층 0.47 + 판넬 25 mm/λ(벽 1.233, 천장 1.734)) ÷ μ(단열 있으면 1.45, 없으면 1.2); K = 1/R (`K_STRUCTURE_ASSUMPTIONS` `CAL:11861`) — 5.2.4 식 (2), 표 3 공기층(원문 미확인). 예: 조타실 지붕 0.455, 노출 갑판 0.567, 내부 0.69(`vendor/VERSIONS.json` 패치 W) |
| `user` | **KU 사용자 K**(`CAL:14171`) | 종류마다 배정된 KU 케이스(`calculateUserKCase` `CAL:12045`, 층 저항 합) → 없으면 `_base`: `iso-standard`(ISO에 추가) / `calculated`(LY에 추가, 기본) / `table`(새 K 표 = 프로젝트 K) (패치 V) |

KC 케이스 1~20(`KC_SIMPLE_CASES` `CAL:11877`, `calculateSimpleKCase` `CAL:11900`)은 면 K Type·KU·해수(14·15)에 쓰인다. 자체 시험 골든 `SELF_TEST_K_GOLDEN` `CAL:20404`(20개, 소수 4자리)으로 새 엔진 K를 그대로 맞출 수 있다. `lib/k-change.cjs`는 K 변경 전후 `calSnapshot` 두 장을 비교하는 HVAC Grid 쪽 도구(설계 조건이 움직이면 먼저 경고, 격실별 관류·일사·냉난방·급기 변화) — 2.0에서는 엔진을 두 모드로 두 번 돌린 결과를 같은 `diff()`에 넣으면 된다.

## 6. 출력(report 필드)과 1.x 계약으로 가는 길

`CAL_ENHANCE.report()` `CAL:21152` = `{ rooms: cachedRooms(), loads: calculatedRoomLoads(), conditions: st.designConditions 사본, kMode: st.kValueMode }`. `loads[]`는 격실 레코드 전체에 아래를 더한 것(`CAL:13123–13196`):

- 집계: `external`·`outdoor`(외기 면적), `internal`(인접 격실 면적), `otherBoundary`, `invalidBoundaryArea/Count/Keys`, `faceCount`, `solarFaceInputs`, `externalWallFaces`
- 관류·일사: `coolingTransmissionW`, `heatingTransmissionW`(창 전도 면적 뺀 뒤), `solarTransmissionW`, `solarRoofW`, `solarWallW`, `solarSelectedKind/Direction/FaceNos`, `solarFaces`, `solarSelectionBasis`, `solarDesignWarning`
- 창: `windowArea`(적용), `requestedWindowArea`, `windowUnappliedArea`, `windowConductionArea`, `deductedWindowArea`, `windowK`, `windowFaceNo`, `windowSegments`, `windowSeaArea`, `windowOutdoorArea`, `windowCoolingTransmissionW`, `windowHeatingTransmissionW`, `windowSolarW`, `windowBinding*`
- 내부: `peopleSensibleW`, `peopleLatentW`, `lightingW`, `lightingDaylight`, `equipLatentW`
- 공기: `minimumFreshAirCmh`(= `ventilationCmh`), `ventilationAirCmh`(ACH), `ventilationCoolingSensibleW`, `ventilationCoolingLatentW`, `ventLatentCoefficient`, `ventilationHeatingW`
- 결과: `coolingSensibleW`, `coolingLatentW`, `coolingW`, `coolingKjH`, `heatingW`, `partialCoolingW`, `partialHeatingW`, `calculationComplete`, `calculationStatus`, `waterlineVerified`, `waterlineWarnings`, `areaConservationIssues`, `manualCorrectionIssues`

1.x 경로: `Box.extract()`(`app/bridge.js:294`)가 `{decks: CAD_APP.stack.decks, conditions, rooms: loads에서 23개 필드}` → `extractContract()`(`app/shell.js:150`) → `buildContract(raw, rules)`(`lib/contract.cjs`) → `loads[id] = {coolingSensibleW, coolingLatentW, coolingW, heatingW, minFreshAirCmh ← minimumFreshAirCmh, minAch ← minimumAch, achAirCmh ← ventilationAirCmh, complete, status}` → `roomAirflow`. 즉 **HVAC Grid가 실제로 쓰는 부하 출력은 8개**다. 2.0 `loads[roomId]`(PLAN_V2 6장)는 이 8개 + 추적용 성분(관류·일사·창·인체·조명·기기, 면별 K·ΔT)을 담으면 된다.

CAL 내보내기(새 엔진 범위 질문, 9장): R↑ 격실 시트, A↑ 접촉면 시트, I↑ 격실 부하 시트(수식판, T3 LY 18 399 수식), N↑ 비ISO 부하 시트, Σ↑ 계통 요약, LX 부하 시트, RH 'AHU 히터'·'격실 리히터'·'격실 부하 정리'(`CAL:3866–3927`).

## 7. 강제 항목 F-1 관련 — 새 엔진이 하지 말아야 할 것

BOX 쪽 구현(`BOX_AHU_HEATING.calculate` `CAL:3759`): 격실 풍량 = **올림10(냉방 현열 × (1 + SF) ÷ (0.000335 × (실 냉방 온도 − AHU 냉방 급기 온도)))** = 여름 최소의 올림(`flow`); 겨울은 같은 풍량으로 필요 급기 온도 = 실온 + 난방 kW ÷ (0.000335 × 풍량), 재열 = 0.000335 × 풍량 × (필요 − AHU 입구 온도)⁺, 주 히터 = 0.000335 × Σ풍량 × (급기 − 혼합) (혼합 = OA비 × 외기 + (1 − OA비) × 환기). `winterMin = 난방 kW ÷ (0.000335 × 22)`는 **검사값**으로만 쓰여 `WINTER_FLOW` 경고("풍량은 여름 기준 유지, 보조 난방 용량 검토", `CAL:3856`)를 낸다. 냉각 코일 = Σ격실 coolingW + OA 현열 + OA 잠열 + 팬. 경고: `COOL_SUPPLY_ISO`(냉방 급기 > 15 K, 6.3), `COOL_SUPPLY_LIMIT`(> 10 K 관례), `OVERHEAT`, `SUPPLY_LIMIT`(실제 급기 > 실온 + 22 K), `SUMMER_FLOW`, `MIN_AIRFLOW`(배기만 있고 환기 없는 실 제외), `MIN_OA`, `OA_*`, `AHU_COOLING_REQUIRED`. HVAC Grid 쪽: `lib/contract.cjs` `roomAirflow`(급기 = 올림10(max(냉방 현열 × 안전율 × 3 ÷ ΔT, 최소 신기))), `lib/project.cjs:176` `HEATING_DT`(난방 W × 3 ÷ 급기 > 22 K + 0.5 → 확인 사항, 별도 난방 실 `SEPARATE_HEATING` 제외), `lib/report.cjs:63` '겨울 난방 용량'.

새 엔진 규칙:

1. 격실 풍량 함수는 **하나**(여름 조건)이고 난방 W를 입력으로 받지 않는다. `max(…, 난방 W × 3 ÷ 22)` 같은 하한, `basis: 'heating'`, 겨울 풍량 필드·규칙(`heatingSupplyDeltaTK`)을 두지 않는다. 1.x 파일의 `rules.heatingSupplyDeltaTK`는 가져올 때 버린다.
2. 겨울은 **같은 풍량**에 AHU 히터·격실 재열기 용량과 계통 난방 용량(kW)을 낸다.
3. 22 K 초과(`HEATING_DT`·`WINTER_FLOW`)는 **"보조 난방·재열기 용량 확인"** 문구로만 낸다. "풍량을 늘리라"고 바꾸지 않는다. '격실 리히터' 시트의 `D/(0.000335*22)` 열(패치 N2)을 2.0이 만든다면 같은 뜻(검사값)으로만 둔다.
4. 시험 유지: `test/iso7547.test.cjs` "one airflow all year", `test/contract.test.cjs`, CAL 자체 시험 "AHU 격실 풍량"(`CAL:21012`: 500 W, 냉방 급기 16 °C → 170 CMH, 2 kW 난방에도 170 그대로 + `WINTER_FLOW`, 재열 2 kW)을 새 엔진 시험으로 옮긴다.

**결정이 필요한 차이(F-1과 충돌하지 않음, 사용자에게 물음):** 1.x에는 "여름 풍량"이 둘이다 — BOX AHU는 ΔT = 실 냉방 온도 − AHU 냉방 급기 온도(계통별, 안전율 곱, 최소 신기는 `MIN_OA` 경고만), HVAC Grid는 ΔT = `rules.supplyDeltaTK`(10 K) × 3 계수에 최소 신기를 max로 넣는다. 2.0이 AHU 난방 계산에 어느 풍량을 쓸지(권장: HVAC Grid 계약 풍량 하나) K1에서 정한다.

## 8. 시험

| 시험 | 위치 | 내용 | 2.0에서 |
|---|---|---|---|
| CAL 단위 자체 시험 | `selfTest()`/`runSelfTest()` `CAL:20409–21055`, `CAL_ENHANCE.unitSelfTest()` | 기록상 110건(`vendor/VERSIONS.json`). 묶음: K(KC 1~20 골든 + KU 식), 습공기(포화압 0 °C 611 Pa, 35 °C 5618 Pa, W(35/70) 0.025111, W(26/50) 0.010471, 습도 기반 12.21 W/CMH), 기하, 면적 보존, Deck Scale, TEXT, XLSX, SPLINE, JSON, POPUP, LINE 편집, DXF, ISO 구분(이름 추정), 6.4.1 배기, 부하(기기 잠열 → 495 W), AHU(7장) | 부하·K·습공기·AHU·ISO 구분·6.4.1 묶음을 `test/load.test.cjs`로 옮김(같은 입력·기대값). 기하·XLSX·화면 묶음은 V2-5/출력 |
| BOX 호스트 자체 시험 | `calSelfTest()` `BOX:24289`(`CAD_APP.selfTest`) | H5 예제: 용도 미지정 격실 25/55/22, 흘수선 Z 없으면 차단, Z 10800·해수 K 15로 7실 완료; S5: 94실 완료, AHU 냉각 코일 3건, **S5 LOAD 기준**(일사 0일 때 floor 480, external 792, internal 3147, coolingTransmissionW 9012.201, heatingTransmissionW 29252.646, coolingW 30988.067, heatingW 35079.973 `BOX:24328–24334`) + CAL 단위 시험. 호출부 18건(12 + 반복 7) + 단위 시험 | S5 LOAD 기준 7값은 새 엔진 + 1.x 면 행으로 바로 맞춰 볼 수 있는 가장 좋은 첫 시험 |
| K 변경 | `lib/k-change.cjs`, `test/k-change.test.cjs`, `test/e2e/k-change.e2e.cjs`, `test/e2e/ly-k.cjs`(LY K 독립 계산) | K7·C✓·KU 전후 비교 | 엔진을 모드별로 두 번 → 같은 `diff()` |
| F-1 | `test/iso7547.test.cjs`, `test/contract.test.cjs`, CAL "AHU 격실 풍량" | 7장 4 | 그대로 유지 |
| 기준값 | `test/fixtures/v1-golden/s5/{cal,loads,box-extract}.json`(T3·N3는 아직 없음), `test/v1-golden.test.cjs`, `tools/v1-golden.cjs` | `cal.json` = `calSnapshot`(K 모드, 조건, 데크, 94실 입력·관류·일사·부하); `loads.json` = 계약 `loads` 8필드 | 비교 방법 아래 |

**기준값 비교 방법(D8).** (1) 같은 입력을 쓴다: 1.x 면 행 + `cal.json`의 격실 입력·조건·K 모드로 새 엔진을 돌린다. (2) 격실마다 `coolingTransmissionW`·`heatingTransmissionW`·`solarTransmissionW`·`coolingSensibleW`·`coolingLatentW`·`coolingW`·`heatingW`·`minimumFreshAirCmh`·`ventilationAirCmh`를 W 반올림(1 W)으로 비교하고, 다르면 성분별로 갈라 원인을 `docs/v2/LOAD_DIFF.md`(제안)에 적는다. (3) S5 LOAD 기준 7합계. (4) 형상 엔진(V2-5)이 생긴 뒤에는 **면 행 단위**(격실·방향·상대·면적)로 먼저 비교한다 — 부하 차이 대부분은 면적 차이에서 나온다.

**빈 곳:** 지금 기준값에는 **면 행(A6)과 면별 K·ΔT가 없다**(`cal.json`은 격실 합계만). 위 (1)·(4)를 하려면 `tools/v1-golden.cjs`가 `CAL_ENHANCE_INPUT.faces.summarized`(흘수선 적용 후)와 `roomLoadInputTrace`(`CAL:13200`), `CAL_ENHANCE.ahu(config)` 결과를 함께 저장해야 한다(V2-0 작업 0.1 보강 제안 — 이 조사에서는 고치지 않음).

## 9. 2.0 새 엔진 작업 목록 제안 (V2-4, 계획서 4.1~4.5를 대체)

| 번호 | 작업 | 산출물 | 작업일 |
|---|---|---|---|
| 4.0 | 기준값 보강: S5·T3 면 행(요약, 흘수선 적용), 면별 경계 종류·K·ΔT, AHU 결과를 v1-golden에 추가(0.1 연장) | `tools/v1-golden.cjs`, `test/fixtures/v1-golden/*/faces.json` | 1 |
| 4.1 | 모델 입력 정의 + 1.x 가져오기: `boundaries[]`에 `side`(6방향)·`type`·`areaM2`(소유 격실 기준)·`zRange`·안정 키·상대 격실·방법; `conditions.project/rooms/k`(4장); BOX 면 행 → `boundaries` 어댑터(V2-5 전까지 ①은 BOX이므로 브라우저에서 읽음) | `lib/engines/load/input.cjs`, `lib/io/v1.cjs` 일부, 스키마 문서 | 2 |
| 4.2 | 경계 조건 해석: 8종, 프리셋, 면 재정의(`faceBoundaryOverrides`), 흘수선 SEA·해수 K 확인, 용도 기본 조건(표 1), `isoClass` 추정, 데크 쌓임 경고 | `lib/engines/load/boundary.cjs`, `rooms.cjs` | 1.5 |
| 4.3 | K: 모드 4종(+KU `_base`), 경계 종류 분류, LY 층 계산(식 (2)), KC 1~20, 면 K Type·직접 K. 값마다 조항 번호(F-2, 원문 확인 전 "원문 미확인") | `lib/engines/load/k.cjs` | 1.5 |
| 4.4 | 격실 부하: 관류, 창(+200 mm, 소유 외벽, 수중 창), 일사 3방식, 인체(활동), 조명(주광), 기기, 신기·ACH, 잠열(습공기 2방식), 안전율, 완료 판정·사유 | `lib/engines/load/room.cjs` | 2.5 |
| 4.5 | 계통: 계통 신기(OA), AHU 난방(주 히터·재열)·냉각 코일 — F-1(7장), 경고 코드 같게 | `lib/engines/load/ahu.cjs` | 1.5 |
| 4.6 | ② `load` 모듈: 부하 색 층(W/㎡), 외기 면 표시, 조건·K 패널, 격실 입력·부하표, K 변경 비교 | `app/modules/load/` | 2.5 |
| 4.7 | 시험: CAL 단위 시험 이식(K 20, 습공기, AHU, ISO 구분, 6.4.1, 부하), S5 LOAD 기준 7합계, 기준값 격실 비교·차이 기록, `k-change`, F-1 시험 | `test/load.test.cjs`, `docs/v2/LOAD_DIFF.md` | 2 |
| 소계 | | | **14.5 (13~17)** |
| 4.8 (선택) | 부하 XLSX 수식판(I↑·RH 시트) 새로 만들기 — 1.x 보고서(`lib/report.cjs`)로 충분한지 사용자 확인 | `lib/report-load.cjs` | +2~3 |
| (V2-5) | 면 행 형상 엔진: 경계 변 분할, 판넬 간극 접촉, 높이 패치, 상하 접촉 불리언, 곡면 외판(HULL_TOP/BOTTOM, Hull Link), 흘수선 분할, 면적 보존 — 4.0의 면 행과 비교 | `lib/engines/geometry/faces.cjs` | **V2-5에 +6~9** |

**위험과 대응**

| 위험 | 대응 |
|---|---|
| 형상 차이가 부하 차이를 덮음(면적 몇 %가 관류 몇 %) | 4.0 면 행 기준값; V2-5는 면 행 단위로 먼저 비교 |
| 옛 프로젝트 설정(legacy-all, fixed, include, 프리셋 35/−20)과 새 기본값이 섞임 | 엔진은 프로젝트 값만 읽고, "저장값 없음 → 옛 기본" 규칙(`normalizeStoredSolarDesignConditions`)을 가져오기 어댑터에 둠 |
| 창 소유 외벽이 BOX 면 키·서명(`windowFaceKey`/`Signature`)에 묶임 → 2.0 형상에서는 키가 달라짐 | 가져올 때 방향·면적으로 다시 연결, 못 하면 "외벽 재선택 필요"로 미완료 처리(CAL과 같은 동작) |
| 계산 차단 조건(흘수선 Z 미지정, 면적 보존, 단위 미확정)이 2.0에서 빠지면 미완료 실이 0 W 대신 값으로 나감 | 4.4 완료 판정을 그대로 명세; 단위 확정은 가져오기에서 |
| "여름 풍량" 둘(7장) | K1에서 사용자 결정 |
| F-2: 조항 값이 원문 미확인 | 4.3·4.4 착수 전 원문 대조(사용자 PC) 한 번, 결과를 이 문서와 코드 주석에 반영 |
| 기준값이 S5뿐 | T3·N3 기준값(0.1 진행 중) 뒤에 4.7 |

## 10. 확인하지 못한 것

- **ISO 7547:2022 원문**(F-2). 3~5장·7장의 조항 번호와 값은 코드 주석·`docs/ISO7547_CHECK.md`에서 옮긴 것으로 모두 원문 미확인이다.
- 브라우저를 돌리지 않았다: 자체 시험 개수(호스트 18 + CAL 110, 기록의 126/126과 2건 차이)와 통과 여부는 코드 읽기와 `vendor/VERSIONS.json` 기록뿐이다.
- 깊이 읽지 않은 것: `surfaceAreaConservationReport`의 판정 규칙, 외판 곡면 측정·체적 측정 수학(`createHullSurfaceMeasurer`, `createRoomVolumeMeasurer`), `wallPanelAnalysis` 판넬 짝 규칙, 수동 외벽·수동 3D 면(`manual3dFaces`, `manualCorrectionIssues`), `roomLoadInputTrace`, XLSX 수식판, L4 워커 소스가 호스트 공유 블록과 같은지(같다고 가정).
- 기준값은 S5만 있다(T3·N3 진행 중). 면 행 기준값은 없다(8장).
- 참고(사본 표시 문구): CAL 설계 조건 "ISO 7547:2022 기본값 적용" 확인 창이 아직 "여름 27℃/50%"라고 쓴다(`CAL:14256`), 실제로 넣는 값은 25 °C/55 %(`applyIsoDesignDefaults`). 계산에는 영향 없음 — 원본 수정 여부는 사용자 판단.
