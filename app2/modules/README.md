# HVAC Grid 2.0 모듈 약속 (V2-3.6)

화면은 **캔버스 하나 + 모듈**이다(`docs/v2/PLAN_V2.md` 5.1). 캔버스(`app2/canvas.js`)는 보기·그리기·고르기만 하고 설계 내용을 모른다. 설계 내용은 모두 모듈이 가져온다.

## 모양

모듈 파일 하나가 객체 하나를 낸다(브라우저: `HG2Modules`에 더함, Node: `module.exports`). 모듈은 **순수**하다 — DOM을 만지지 않고, 그림은 `g`로 그리고, 패널은 HTML 문자열로 내고, 바꿀 것은 명령으로 돌려준다. 그래서 Node에서 시험한다(`test/modules.test.cjs`).

```js
{
  id: 'ducts', step: 4, title: 'RU·덕트',
  reads:  ['plans', 'networks', …],          // 모델에서 읽는 부분 (lib/model/schema.cjs PARTS)
  writes: ['ruMoves', 'ductEdits'],          // 명령으로 쓰는 부분 — 밖에 쓰면 lib/model/commands.cjs apply가 거부
  layers: [{ id, title, z, draw(g, ctx), hit(ctx, pt, tolMm) → { kind, id, …, draggable } }],
  ribbon(ctx)    → HTML   리본 (data-act 요소)
  tree(ctx)      → HTML   왼쪽 트리 (없으면 공용 데크·격실 트리)
  inspector(ctx) → HTML   오른쪽 속성
  act(ctx, name, arg, value) → 결과     data-act 요소, 고르기, 끌기가 부름
  pick(ctx, hit, pt) → 결과              캔버스를 눌렀을 때 (지금 단계 모듈만)
  drag(ctx, hit, pt, phase) → 결과       끌기 (phase: start · move · end)
  checks(ctx) → [{ level, text }]        상태줄·⑤ 검토에 모임
}
```

결과: `{ cmd: { label, ops }, run: 'light' | 'auto' | 'none', select, state, say, download: { name, data, type }, file: 'open' | 'save' }`

- `cmd` — 모델을 바꾸는 명령(경로 연산). 셸이 실행 취소 기록에 넣고, 그 묶음에 다시 계산도 넣는다(되돌리면 함께 되돌아감).
- `run` — `light`: 덕트망 빼고 다시 계산(③ 편집), `auto`: 덕트망까지(④ AUTO, 워커), `none`.
- `state` — 이 모듈의 화면 상태(`ctx.state`에 합침: 고른 종류·계통, 위치 지정 중 등). 모델이 아님.

ctx: `{ model, L (lib 모듈), ui (app2/ui.js), step, deck, filter, sel, state, kinds, deckAlpha(deckId), status (다시 계산 표 상태) }`

## 규칙

- **모듈은 모듈을 부르지 않는다.** 모델로만 이어진다(`reads`·`writes`). 다른 모듈 파일을 읽거나 `HG2Modules`를 보지 않는다(시험이 소스를 확인).
- **쓰기는 명령으로만, `writes` 안에서만.** 셸이 `apply(…, { writes })`로 실행한다.
- **다른 모듈의 층도 켤 수 있다.** 층은 모든 단계에서 그려지고(켜기·끄기), 지금 단계 모듈의 층만 고를 수 있다.
- **엔진은 lib에.** 모듈은 `ctx.L`의 엔진·모델 함수를 부를 수 있다(계산은 lib, 화면은 모듈).
- F-1: 풍량 모듈은 급기 ΔT(여름) 하나만 둔다. 겨울 풍량 입력·규칙은 없다.
