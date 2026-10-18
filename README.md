# HVAC Grid

**BOX Cal**(격실·부하·장비·신기 계산)과 **PHG**(RU 배치·AUTO 덕트 라우팅·덕트 계산)를 묶어
선박 HVAC 설계를 한 흐름으로 처리하는 플랫폼 프로젝트입니다.

```
Deck · 격실 ─▶ 부하 계산 ─▶ 격실별 풍량(급기·환기·배출) ─▶ RU 배치 ─▶ 덕트 라우팅 ─▶ 덕트 계산·검토 ─▶ 출력
   (BOX Cal)        (BOX Cal)             (공통)                     (PHG D)      (PHG D)          (PHG D · SOLAS)      (공통)
```

상태: **H0 완료 (2026-10-18)** — 데이터 계약 v0, BOX → 계약 추출, S5 샘플(5 Deck · 94실 · 급기 10계통 10,420 CMH), 테스트 4개.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/SOURCES.md](docs/SOURCES.md) | 통합 대상 원본(경로·크기·해시·상태)과 이전 통합 시도 |
| [docs/PLAN.md](docs/PLAN.md) | 목표, 이전 시도에서 배운 점, 통합 방식 선택지, 데이터 계약 초안, 단계 계획, 결정 필요 사항 |
| [docs/CONTRACT.md](docs/CONTRACT.md) | 데이터 계약 v0: 구조, BOX → 계약 · 계약 → PHG D 대응, 풍량 규칙, 검증 |

## 실행

```
npm test                    # 계약 테스트
npm run extract:s5          # BOX CAL(최신) S5 예제 → samples/s5.contract.json (Playwright: PHG 도구 사용)
node tools/box-extract.cjs <BOX 프로젝트.json> <출력.json>
```

`probe/`는 BOX 구조 확인에 쓴 조사 스크립트입니다.

## 원칙

- 원본 앱(BOX Cal, PHG D)은 각 저장소에서 계속 개발되며, 이 프로젝트는 **확정된 버전(해시)** 을 기록해 사용합니다.
- 개발·검증은 localhost HTTP, 배포물은 가능하면 단일 HTML(`file://`)로 유지합니다(BOX 실행 원칙과 같음).
- 한국어 화면, 자동 테스트와 단계별 캡처로 검증합니다.
- 계산 결과는 설계 보조이며 최종 판단은 설계자·주관청·선급에 따릅니다.
