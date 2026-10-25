# N3 시험선 실행 — seed 20261025 · PASS

23 × 14 m · 59실 (D1 19, D2 25, D3 15) · 2026-10-25T00:05:41.815Z

## 단계

외곽선: 선수 테이퍼 · 3층 3 m 짧음 · 복도 꺾임 · 조리실 우현 · 의무실 좌현 (20일 계획 3일째)

- **① DXF → BOX** (2.2 s): `{"decks":3,"rooms":59,"want":59,"missing":[]}`
- **① Deck Z·높이, 하부 외곽선** (6 s): `{"decks":[["MAIN DK",0,2900],["CREW DK",2900,2900],["BRIDGE DK",5800,2900]],"outline":{"done":18,"issues":[]}}`
- **② 격실 입력 붙여넣기** (10.3 s): `{"cells":767,"unmatched":[],"isoClassAuto":[["ENGINE",3],["ALLEY_SOUND",3],["NON_AC",12],["WHEELHOUSE",1]]}`
- **② 설계 조건: 흘수선 미적용** (10.8 s): `{"found":true,"apply":null}`
- **② 설계 데이터** (13.6 s): `{"rooms":59,"systems":["exhaust:EF-BAT","exhaust:EF-CO2","exhaust:EF-GAL","exhaust:EF-HOS","exhaust:EF-LAU","exhaust:EF-PAN","exhaust:EF-SAN","return:RA-1","supply:AHU-1","supply:SF-GAL"],"plans":16,"multi":["AHU-1","EF-SAN","RA-1"],"pending":[],"pendingN":0,"iso":[["ENGINE",3],["ALLEY_SOUND",3],["-",40],["NON_AC",12],["WHEELHOUSE",1]],"supply":14280,"deckZ":[0,2900,5800]}`
- **③ 풍량·구역 수지** (14.1 s): `{"zones":["AHU-1 SA 11370 OA 3800 적합","SF-GAL SA 2910 OA 2910 적합"],"heatingBasis":0,"airChecks":9}`
- **③ 의무실 배기팬 위치 지정** (14.3 s): `{"before":"assumed:corridor-end:202","after":"user","msg":"EF-HOS 팬 위치: 232 린넨창고 (CREW DK)"}`
- **⑤ SOLAS 분류** (14.6 s): `{"unclassified":[],"boundaries":314}`
- **④ 모든 계통 AUTO** (178.2 s): `{"seconds":164,"done":"16/16","count":{"ok":10,"check":5,"fail":1},"penetrations":121,"fireDampers":12,"outsideM":0,"unconnected":0,"relaxed":1,"systems":["AHU-1 11370 CMH ESP 459.8 Pa 팬 1110 Pa","SF-GAL 2910 CMH ESP 130.3 Pa 팬 780 Pa","EF-BAT 270 CMH ESP 46 Pa 팬 196 Pa","EF-CO2 90 CMH ESP 11 Pa 팬 161 Pa","EF-GAL 2700 CMH ESP 120 Pa 팬 270 Pa","EF-HOS 880 CMH ESP 58 Pa 팬 208 Pa","EF-LAU 910 CMH ESP 65 Pa 팬 215 Pa","EF-PAN 550 CMH ESP 191 Pa 팬 341 Pa","EF-SAN 1720 CMH ESP 83.1 Pa 팬 233 Pa","RA-1 7570 CMH ESP 280.5 Pa 팬 431 Pa"]}`
- **Deck id 노출 검사** (183.1 s): `{"leaks":[]}`
- **출력·프로젝트 왕복** (188.1 s): `{"bytes":{"project":3757977,"xlsx":705799,"dxf":230814,"report":460449},"reopened":{"done":16,"total":16,"pens":121,"box":true}}`
- **페이지 오류** (188.1 s): `{"count":0,"first":[]}`

## 프로그램 이상

- 없음

## 설계 확인 사항 (규칙이 잡은 것 — 시험선 배치·입력에 따름)

- check · 풍량 · check TRANSFER_OUTSIDE 308 청소도구실: 배기 150 CMH를 받을 급기 실이 이웃에 없음 — 외기 흡입구 또는 급기 필요
- check · 풍량 · check TRANSFER_OUTSIDE 208 청소도구실: 배기 150 CMH를 받을 급기 실이 이웃에 없음 — 외기 흡입구 또는 급기 필요
- check · 풍량 · check DOOR_GRILLE 230 의무실: 복도에서 전달 공기 530 CMH → 문 통기구 0.074 m² (> 0.05 m², II-2/9.4.2) — 급기 추가 또는 덕트로 보충
- check · 풍량 · check TRANSFER_OUTSIDE 108 청소도구실: 배기 150 CMH를 받을 급기 실이 이웃에 없음 — 외기 흡입구 또는 급기 필요
- fail · 풍량 · fail NEG_PRESSURE 114 조리실: 급기 2910 > 배기 2700 CMH — 부압 미확보 (배기 증가 또는 급기 제한)
- check · 풍량 · check EXHAUST_ISO 115 배식실: 배기 550 CMH < 병원(의무실)·배식실·흡연실 급기 × 1.2 600 CMH (ISO 7547 6.4.1) — 환기 횟수 확인
- check · 풍량 · check ROOM_OA 240 취미실: 실 신기 140 CMH(급기 420 × 구역 신기 33.4 %) < 최소 신기 173 CMH — 급기 530 CMH 이상 또는 AHU-1 신기 비율 42 % 이상
- check · 풍량 · check ROOM_OA 121 선원식당: 실 신기 354 CMH(급기 1060 × 구역 신기 33.4 %) < 최소 신기 749 CMH — 급기 2540 CMH 이상 또는 AHU-1 신기 비율 71 % 이상
- check · 풍량 · check ROOM_OA 122 사관식당: 실 신기 297 CMH(급기 890 × 구역 신기 33.4 %) < 최소 신기 605 CMH — 급기 1990 CMH 이상 또는 AHU-1 신기 비율 68 % 이상
- fail · 검토 · 실 풍량: 부압 미확보 1 · 실 신기 부족 3 · 확인 8 (난방 급기 온도·전달 공기·문 통기구·기관구역)
- check · 검토 · AUTO 완료 16/16 (Deck·계통) · 금지 영역 완화 1계획(실 밖 영역만 해제 1)
- check · 검토 · SOLAS 실 분류: 미분류 0 · 확인 5
- check · 검토 · 방화 경계 확인 사항 14개 (병기 값·같은 범주·모델 가장자리)
- check · 검토 · 제한 구역 통과(II-2/9.7.2): 금지 0 · 확인 2
- check · 검토 · 계통 분리·점검표: 분리 경고 0 · 위반 0 · 확인 4
