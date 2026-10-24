# N3 시험선 실행 — seed 20261024 · PASS

22 × 14 m · 59실 (D1 19, D2 25, D3 15) · 2026-10-24T00:05:48.593Z

## 단계

외곽선: 선수 모따기 · 3층 3 m 짧음 · 복도 한쪽 치우침 · 조리실 좌현 · 의무실 우현 (20일 계획 2일째)

- **① DXF → BOX** (3.6 s): `{"decks":3,"rooms":59,"want":59,"missing":[]}`
- **① Deck Z·높이, 하부 외곽선** (9.7 s): `{"decks":[["MAIN DK",0,2900],["CREW DK",2900,2900],["BRIDGE DK",5800,2900]],"outline":{"done":18,"issues":[]}}`
- **② 격실 입력 붙여넣기** (15.4 s): `{"cells":767,"unmatched":[],"isoClassAuto":[["ENGINE",3],["ALLEY_SOUND",3],["NON_AC",12],["WHEELHOUSE",1]]}`
- **② 설계 조건: 흘수선 미적용** (16.4 s): `{"found":true,"apply":null}`
- **② 설계 데이터** (19.8 s): `{"rooms":59,"systems":["exhaust:EF-BAT","exhaust:EF-CO2","exhaust:EF-GAL","exhaust:EF-HOS","exhaust:EF-LAU","exhaust:EF-PAN","exhaust:EF-SAN","return:RA-1","supply:AHU-1","supply:SF-GAL"],"plans":16,"multi":["AHU-1","EF-SAN","RA-1"],"pending":[],"pendingN":0,"iso":[["ENGINE",3],["ALLEY_SOUND",3],["-",40],["NON_AC",12],["WHEELHOUSE",1]],"supply":14520,"deckZ":[0,2900,5800]}`
- **③ 풍량·구역 수지** (20.4 s): `{"zones":["AHU-1 SA 11550 OA 4430 적합","SF-GAL SA 2970 OA 2970 적합"],"heatingBasis":0,"airChecks":8}`
- **③ 의무실 배기팬 위치 지정** (20.6 s): `{"before":"assumed:corridor-end:202","after":"user","msg":"EF-HOS 팬 위치: 232 린넨창고 (CREW DK)"}`
- **⑤ SOLAS 분류** (21.2 s): `{"unclassified":[],"boundaries":307}`
- **④ 모든 계통 AUTO** (275 s): `{"seconds":254,"done":"16/16","count":{"ok":12,"check":4,"fail":0},"penetrations":132,"fireDampers":10,"outsideM":0,"unconnected":0,"relaxed":0,"systems":["AHU-1 11550 CMH ESP 305.3 Pa 팬 955 Pa","SF-GAL 2970 CMH ESP 111.1 Pa 팬 761 Pa","EF-BAT 300 CMH ESP 31 Pa 팬 181 Pa","EF-CO2 90 CMH ESP 11 Pa 팬 161 Pa","EF-GAL 3780 CMH ESP 100 Pa 팬 250 Pa","EF-HOS 570 CMH ESP 60 Pa 팬 210 Pa","EF-LAU 830 CMH ESP 97 Pa 팬 247 Pa","EF-PAN 770 CMH ESP 148 Pa 팬 298 Pa","EF-SAN 1740 CMH ESP 91.3 Pa 팬 241 Pa","RA-1 7120 CMH ESP 299.8 Pa 팬 450 Pa"]}`
- **Deck id 노출 검사** (281 s): `{"leaks":[]}`
- **출력·프로젝트 왕복** (286.1 s): `{"bytes":{"project":3677941,"xlsx":716458,"dxf":236036,"report":463246},"reopened":{"done":16,"total":16,"pens":132,"box":true}}`
- **페이지 오류** (286.1 s): `{"count":0,"first":[]}`

## 프로그램 이상

- 없음

## 설계 확인 사항 (규칙이 잡은 것 — 시험선 배치·입력에 따름)

- check · 풍량 · check TRANSFER_OUTSIDE 308 청소도구실: 배기 170 CMH를 받을 급기 실이 이웃에 없음 — 외기 흡입구 또는 급기 필요
- check · 풍량 · check TRANSFER_OUTSIDE 208 청소도구실: 배기 170 CMH를 받을 급기 실이 이웃에 없음 — 외기 흡입구 또는 급기 필요
- check · 풍량 · check TRANSFER_OUTSIDE 108 청소도구실: 배기 170 CMH를 받을 급기 실이 이웃에 없음 — 외기 흡입구 또는 급기 필요
- check · 풍량 · check DOOR_GRILLE 114 조리실: 복도에서 전달 공기 810 CMH → 문 통기구 0.113 m² (> 0.05 m², II-2/9.4.2) — 급기 추가 또는 덕트로 보충
- check · 풍량 · check ROOM_OA 240 취미실: 실 신기 200 CMH(급기 520 × 구역 신기 38.4 %) < 최소 신기 259 CMH — 급기 690 CMH 이상 또는 AHU-1 신기 비율 50 % 이상
- check · 풍량 · check ROOM_OA 121 선원식당: 실 신기 330 CMH(급기 860 × 구역 신기 38.4 %) < 최소 신기 547 CMH — 급기 1510 CMH 이상 또는 AHU-1 신기 비율 64 % 이상
- check · 풍량 · check ROOM_OA 122 사관식당: 실 신기 280 CMH(급기 730 × 구역 신기 38.4 %) < 최소 신기 432 CMH — 급기 1170 CMH 이상 또는 AHU-1 신기 비율 60 % 이상
- check · 풍량 · check TRANSFER_A 114 조리실: 102 복도에서 전달 공기 810 CMH가 A-0 경계를 지남 — 방화댐퍼 붙은 전달 덕트 또는 출처 변경
- check · 검토 · 실 풍량: 부압 미확보 0 · 실 신기 부족 3 · 확인 8 (난방 급기 온도·전달 공기·문 통기구·기관구역)
- check · 검토 · SOLAS 실 분류: 미분류 0 · 확인 5
- check · 검토 · 방화 경계 확인 사항 12개 (병기 값·같은 범주·모델 가장자리)
- check · 검토 · 계통 분리·점검표: 분리 경고 0 · 위반 0 · 확인 4
