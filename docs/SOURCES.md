# 통합 대상 원본

기록일 2026-10-18. 해시는 SHA-256 앞 16자리.

## 주 원본

| 구성 | 파일 | 크기 | 수정일 | 해시 | 상태 |
|---|---|---|---|---|---|
| **BOX Cal (최신)** | `C:\Users\HK\OneDrive\CAL_Enhance\04_CAL_Enhance_fixed.html` | 6,953,861 | 2026-10-18 17:07 | `bd942611477ddfe5` | 로컬 git 저장소(원격 없음), 최근 커밋 `32976f8` "Show hull outlines in WebGL while rotating the 3D solid view" — 개발 중 |
| **PHG D** | `C:\Users\HK\Desktop\PHG\DuctConcept_PHG_D.html` | 1,546,910 | 2026-10-18 | `643f328a1f50244a` | GitHub `ceronfs/PHG`(비공개), 커밋 `5587bab` — 개발 중(A 수준 보완 병행). C는 2026-10-18 개발 정지, D만 개발 |
| SOLAS 화재구획 | `C:\Users\HK\Desktop\Program\SOLAS\fire_rating.html` + `SOLAS_격실분류_화재구획등급표.xlsx` | 102,570 | 2026-08-24 | `05b6440e140fd636` | 표 9.1~9.8, 격실 82종. PHG D SOLAS 적용 계획(`PHG/docs/PHG_D_SOLAS_APPLY_PLAN.md`)의 원본 |

## 고정 사본 (HVAC Grid가 실제로 쓰는 파일)

| 사본 | 원본 | 해시 |
|---|---|---|
| `vendor/DuctConcept_PHG_D.html` | PHG D (`ceronfs/PHG` 57ef186) | `643f328a1f50244a` |
| `vendor/BOX_CAL_Enhance.html` | `CAL_Enhance/04_CAL_Enhance_fixed.html` (32976f8) | `bd942611477ddfe5` |

원본 파일은 읽기 전용입니다. 사본 갱신은 의도적으로 하고 `vendor/VERSIONS.json`에 기록합니다.

## 참고 원본 (이전 판)

| 구성 | 파일 | 크기 | 해시 |
|---|---|---|---|
| BOX Cal (BOX 폴더) | `C:\Users\HK\Desktop\BOX\Node Box Cal.html` | 2,816,384 | `aafe56d2d58215c6` |
| BOX Cal Enhance (BOX 폴더) | `C:\Users\HK\Desktop\BOX\Node Box Cal_Enhance.html` | 8,863,735 | `4abb425e56a881f4` |
| BOX Light | `C:\Users\HK\Desktop\BOX\Node box Light.html` | 2,117,553 | `851f5f660fb00fce` |
| BOX Load Cal (final) | `C:\Users\HK\Desktop\BOX\final\NODE box_Load_Cal.html` | 2,097,895 | `c42997da5d3b7e18` |
| BOX 모듈 소스 | `C:\Users\HK\Desktop\BOX\src\` (app, canvas, contracts, core, domain, dxf, geometry, io, store, ui, vendor) | | |

## 이전 통합 시도

| 시도 | 위치 | 방식 | 남긴 것 |
|---|---|---|---|
| Box + PHG 통합 (2026-09-29) | `Program\Platform V2\Box_PHG_Integrated.html` (`ca9b0c29c90b0e90`) | BOX Load Cal + PHG B_W를 iframe으로 결합, 오른쪽 연결 패널, `Box_PHG_Server.js`로 통합 JSON 저장 | 격실 → RU 풍량(현열 W × 3 ÷ ΔT), 환기·배출 RU 배분, 통합 JSON |
| NODE HVAC Studio (2026-10-01) | `Program\Platform V2\HVAC_Studio.html` (`25f6ced1ce5ce3b0`) | 위 방식 개선: 기능 탭, 3단계 작업 순서, 풍량 합계 보존 배분, 통합 임시 저장·복구 | 평가·UI 검토·테스트 7개(`HVAC_Studio_Evaluation.md`, `HVAC_Studio_Test.js`) |
| Independent Platform (2026-10-15) | `Desktop\HVAC_2026-10-15\Independent_Platform\` | — | 파일 미저장(목록만 있음: plan.md, todo.md, Handover, Sync.zip) |
