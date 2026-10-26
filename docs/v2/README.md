# HVAC Grid Ver 2.0 (기획 — 검토 후 진행)

**2026-10-26 보류(D26)**: V2-3까지 하고 멈춤. 1.0를 먼저 완성하고, 다시 시작할 때 2.0은 1.0 기능을 그대로 이어받아 한 캔버스에서 작업하게 한다([DECISIONS.md](DECISIONS.md)).

2026-10-25 사용자 결정: Ver 2.0은 검토한 뒤 진행한다. 같은 날 기획서 검토, D1~D6 권장안으로 결정([DECISIONS.md](DECISIONS.md)) — 착수(V2-0)는 지시 뒤. 이 폴더의 문서는 지금 프로그램(1.0)의 작업 지침이 아니다. 1.0 작업은 [../PLAN.md](../PLAN.md)와 `AGENTS.md`를 따른다.

| 파일 | 내용 |
|---|---|
| [PLAN_V2.md](PLAN_V2.md) | Ver 2.0 기획서(무엇을·왜): 한 모델 · 한 캔버스 · 모듈 여섯, 로드맵 V2-0~V2-6 |
| [PLAN_V2_WORK.md](PLAN_V2_WORK.md) | Ver 2.0 계획서(어떻게·언제): 단계별 작업 번호·산출물·완료 기준, 일정 추정, 게이트 K0~K6, 시험·위험 |
| [DECISIONS.md](DECISIONS.md) | 결정 기록: K0 D1~D6, D7·D8(처음부터 새로, 같은 기능), K1 D9~D14, K2 D15~D19(앞으로 권장안으로 진행), D20, K3 D21~D25 |
| [PLAN_PHG_LIB.md](PLAN_PHG_LIB.md) | V2-1 옛 세부(잘라 오기) — D7로 대체됨, 기록용 |
| [STUDY_CAL.md](STUDY_CAL.md) · [STUDY_PHG.md](STUDY_PHG.md) · [STUDY_SKETCHCAD.md](STUDY_SKETCHCAD.md) | V2-0 조사: 새로 짤 부하·덕트·도면 엔진의 기능 명세 |
| [BASELINE.md](BASELINE.md) | V2-0.6 성능 기준(1.0) |
| [REVIEW_V2-0.md](REVIEW_V2-0.md) | V2-0 검토(게이트 K1) |
| [REVIEW_V2-1.md](REVIEW_V2-1.md) · [V2-1_COMPARE.md](V2-1_COMPARE.md) | V2-1 덕트 엔진 검토(게이트 K2), 계획별 1.0 대비 차이 |
| [REVIEW_V2-3.md](REVIEW_V2-3.md) | V2-3 검토(게이트 K3): 모델 v2·다시 계산 표·실행 취소, 새로 짠 풍량·계획·SOLAS·검토·출력 엔진(1.0 기준값과 같음), 2.0 화면 `app2/` |
| [../../app2/modules/README.md](../../app2/modules/README.md) | 2.0 모듈 약속(D21) |
| HVAC_Grid_Ver2.0_기획서.docx · HVAC_Grid_Ver2.0_계획서.docx | 위 두 문서의 워드판(md를 고치면 다시 만든다) |

**2.0 실행(개발판)**: `npm run start:v2` → http://127.0.0.1:8793/app2/ (1.0 파일·2.0 모델 열기, T3·S5 예제) · 브라우저 없이 `node tools/hvac-run2.cjs <파일> <출력 폴더>`.
