# V2-0.6 성능 기준 (1.0)

작성 2026-10-26 · 도구 `tools/v2-baseline.cjs`(`npm run baseline`) · 원 자료 `out/v2-baseline/<기계>.json`(저장소에 넣지 않음) · 대상 HVAC Grid `v2` `c797f4c`(1.0 코드는 main `a8e601b`와 같음) · SketchCAD ceronfs/SketchCAD main `3df0ba8`(측정 판; 최신 `8285aef`는 로고 크기 CSS만 달라 측정값에 영향 없음)

Ver 2.0 목표(PLAN_V2.md G6·G7·G9)를 잴 때 비교할 1.0 값이다. **같은 기계에서 잰 값끼리만 비교한다.** 아래 두 기계의 값은 서로 비교하지 않는다.

## 1. 측정한 기계

| | 클라우드 (이 측정) | 사용자 PC (2026-10-25, 사용자 측정) |
|---|---|---|
| CPU · 코어 | Intel Xeon @ 2.10 GHz · 4 | (기록 없음 — 다음 측정 때 `npm run baseline`이 함께 적음) |
| 메모리 | 15.7 GB | |
| OS | Linux 6.18 x64 | Windows |
| 브라우저 | Chromium 153.0.8010.12(Playwright, 머리 없음) | Edge |
| Node | v22.22.0 | |

## 2. 결과

| 항목 | 클라우드 (2026-10-26) | 사용자 PC (2026-10-25) | 2.0 목표 |
|---|---|---|---|
| T3 전체 AUTO (18계통) | **152.5 s** (18/18, 계통 합 145.6 s, 가장 긴 계통 D4 RA-BRG 27.2 s) | 59 s (18/18) | 같은 기계에서 절반 이하(G6) |
| N3 전체 AUTO (16계통) | **228.8 s** (16/16, 계통 합 223.0 s, 가장 긴 계통 98 s) | 91 s (16/16) | 같은 기계에서 절반 이하 |
| 한 파일판 `HVAC_Grid.html` | **9.49 MB** (9 489 632 B) | 9.5 MB | 더 작게(G9) |
| 독립망 복사본 | 133.0 MB, 그중 Linux `node` 실행 파일 123.4 MB → **HVAC Grid 파일만 9.6 MB** | 102 MB (Windows `node.exe` 포함) | — |

AUTO 시간은 `HVACGrid.runAll()`(리본 "모든 계통 AUTO"와 같은 길) 시작부터 끝까지다. 도면 열기·부하·설계 데이터는 넣지 않았다. 클라우드가 사용자 PC보다 약 2.5배 느리다.

### 큰 도면 (합성: N3 D2 + 실 안 가구 선, 레이어 FURNITURE — [REVIEW_2026-10-25_BIG_DXF.md](../REVIEW_2026-10-25_BIG_DXF.md)과 같은 방식)

단계마다 300 s 한도(`BIG_LIMIT_S`). 메모리는 그 페이지의 JS 힙(CDP `JSHeapUsedSize`). SketchCAD에는 벽을 WALL 레이어로 바꾼 같은 도면을 넣었다(받은 도면 모양, `test/e2e/sketchcad.e2e.cjs`와 같음).

| 도면 | 가구 선 | 1.0 ① BOX DXF 열기 | SketchCAD 열기(16 MB 넘으면 "계산용으로 열기") | SketchCAD 실 자동 찾기 | SketchCAD 힙 |
|---|---|---|---|---|---|
| 3 MB (시험) | 29 747 | 데크 30.6 s, 실 목록 한도(120 s) 안에 안 나옴 · 힙 1.7 GB | 0.8 s (객체 29 846) | 0.5 s · **29실** | 30 MB |
| 20 MB | 198 968 | **300 s 안에 데크 없음** | 2.0 s (객체 99) | 0.3 s · 29실 | 225 MB |
| 100 MB | 995 290 | 300 s 안에 데크 없음 | 6.1 s (객체 99) | 0.3 s · 29실 | 991 MB |
| 200 MB | 1 990 690 | 300 s 안에 데크 없음 | 18.9 s (객체 99) | 0.5 s · 29실 | **2.24 GB** |

- BOX: 16 MiB가 넘는 파일은 BOX가 "대용량 엔진"으로 보내는데, 이 엔진은 데크·격실을 만들지 않는다(BIG_DXF 검토 #2). 그래서 20 MB부터 데크가 생기지 않는다. 1.0 셸의 ① DXF 열기 단추는 16 MiB부터 열지 않고, 2 MB부터 SketchCAD를 안내한다. 이 측정은 단추를 거치지 않고 BOX에 바로 넣었다. 그 경우 20 MB 이상은 1.0에서 열 수 없다. 이때 잰 BOX 힙(7~8 MB)은 셸 페이지 값이라 BOX 대용량 엔진의 메모리가 아니다.
- SketchCAD "계산용으로 열기"는 남길 레이어(벽·실 문자)만 객체로 만든다. 그래서 객체가 99개뿐이고 실 찾기는 크기와 관계없이 1초 아래다. 열기 시간과 힙은 파일 크기에 비례한다: 200 MB에서 18.9 s, 2.24 GB.
- 2.0 목표(G7): 200 MB 일반배치도를 데크로 지정해 ①까지. 비교 기준은 위 SketchCAD 줄이다.

## 3. 다시 재는 법

```
HVAC_GRID_BROWSER_PATH=<Chromium 경로, Windows는 비워 두면 Edge>  SKETCHCAD_HTML=<SketchCAD.html>  BIG_LIMIT_S=300  npm run baseline
node tools/v2-baseline.cjs auto            # T3·N3 AUTO만
node tools/v2-baseline.cjs big --sizes=20,100,200
node tools/v2-baseline.cjs size
```

- 다른 작업이 CPU를 쓰지 않을 때 잰다. V2-0의 기준값 실행 중 AUTO 시간은 T3 146~173 s, N3 223~259 s로 흔들렸다(다른 작업과 CPU를 나눠 씀).
- 사용자 PC 값은 PC에서 `npm run baseline`을 돌려 이 표의 오른쪽 열을 같은 방식으로 채운다. 그러면 기계 사양도 함께 남는다.
