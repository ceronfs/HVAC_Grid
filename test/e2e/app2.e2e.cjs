// HVAC Grid 2.0 in the browser (app2/, V2-3): one canvas, the modules, one undo, no vendor window. T3 from its 1.x
// design data: ③ a rule edited and undone, ④ AUTO by the 2.0 engine in Web Workers and an RU dragged on the canvas,
// ⑤ the XLSX and the model saved and opened again; and the golden 1.x T3 project opened as it is (its networks kept,
// the review 1.x's).
//   node test/e2e/app2.e2e.cjs
'use strict';
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), G = require('../../tools/v1-golden.cjs');

(async () => {
 const s = await start(), b = await launch(), page = await b.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true }), errors = [];
 page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
 const ev = (fn, arg) => page.evaluate(fn, arg), t0 = Date.now(), times = {};
 try {
  await page.goto(s.url + '/app2/'); await page.waitForFunction(() => window.HG2, null, { timeout: 60000 });
  await page.click(`button[data-act="sample"][data-arg='"t3"']`);
  await page.waitForFunction(() => HG2.model()?.rooms.length === 79 && !HG2.state.busy);
  assert.equal(await ev(() => document.querySelectorAll('iframe').length), 0, 'no vendor window');
  assert.equal(await ev(() => HG2.model().plans.length), 18);

  // ③ ΔT 10 → 8 K: more supply air; undo puts it back, redo again
  const room = await ev(() => Object.entries(HG2.model().airflow).find(([, a]) => a.basis === 'cooling')[0]);
  const sa0 = await ev(id => HG2.model().airflow[id].supplyCmh, room);
  const dT = `input[data-act="rule"][data-arg='"supplyDeltaTK"']`; await page.fill(dT, '8'); await page.dispatchEvent(dT, 'change');
  await page.waitForFunction(id => HG2.model().rules.supplyDeltaTK === 8 && !HG2.state.busy, room);
  const sa1 = await ev(id => HG2.model().airflow[id].supplyCmh, room);
  assert.ok(sa1 > sa0, `${sa1} > ${sa0}`);
  await page.click('#undo'); assert.deepEqual(await ev(id => [HG2.model().rules.supplyDeltaTK, HG2.model().airflow[id].supplyCmh], room), [10, sa0], 'undo: the rule and its recompute together');
  await page.keyboard.press('Control+y'); assert.equal(await ev(id => HG2.model().airflow[id].supplyCmh, room), sa1);
  await page.click('#undo');

  // ④ AUTO: every plan by the 2.0 engine, in workers
  await page.click('.step[data-step="4"]');
  let t = Date.now(); await page.click('button[data-act="auto"]'); await page.waitForFunction(() => HG2.model().review?.done === 18 && !HG2.state.busy, null, { timeout: 120000 }); times.autoS = (Date.now() - t) / 1000;
  assert.ok(await ev(() => Object.values(HG2.model().networks).every(n => n.source === 'engine' && n.result.unconnected === 0)));
  // drag an RU 400 mm along its room on the canvas: the RU stays where it was put and its plan's network is made again
  const target = await ev(() => {
   const m = HG2.model(), cv = HG2.canvas, r = cv.el.getBoundingClientRect(), PL = HG2.L('lib/engines/geometry/plan.cjs');
   for (const p of m.plans.filter(x => x.deckId === HG2.state.deck && x.kind === 'supply')) for (const u of p.rus) {
    const room = m.rooms.find(x => x.id === u.roomId), to = { x: u.x + 400, y: u.y };
    if (!PL.inRoom(to, room) || PL.wallDistance(to, room) < 300) continue;
    const X = x => r.left + (x - cv.view.cx) * cv.view.s + cv.size.w / 2, Y = y => r.top - (y - cv.view.cy) * cv.view.s + cv.size.h / 2;
    return { id: u.id, key: p.key, from: [X(u.x), Y(u.y)], to: [X(to.x), Y(to.y)], at: m.networks[p.key].result.at };
   }
   return null;
  });
  assert.ok(target, 'an RU with room to move');
  await page.mouse.move(...target.from); await page.mouse.down(); await page.mouse.move(target.from[0] + 5, target.from[1], { steps: 2 }); await page.mouse.move(...target.to, { steps: 6 }); await page.mouse.up();
  await page.waitForFunction(k => HG2.model().ruMoves[k.id] && !HG2.state.busy && HG2.model().networks[k.key].result.at !== k.at, target, { timeout: 60000 });
  assert.ok(await ev(k => HG2.model().plans.find(p => p.key === k.key).rus.find(u => u.id === k.id).moved, target), 'the RU moved');
  await page.click('#undo'); assert.equal(await ev(k => HG2.model().ruMoves[k.id], target), undefined, 'undo: the move');

  // ⑤ outputs and the model file
  await page.click('.step[data-step="5"]');
  const dl = async sel => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]); return fs.readFileSync(await d.path()); };
  assert.ok((await dl('button[data-act="xlsx"]')).length > 20000, 'XLSX');
  assert.ok((await dl('button[data-act="html"]')).toString().includes('HVAC Grid 설계 보고서'), 'report');
  const saved = JSON.parse((await dl('button[data-act="save"]')).toString());
  assert.equal(saved.schema, 'hvac-grid/2');
  const count = await ev(() => HG2.model().review.count);
  await ev(m => HG2.open(m, 'T3 저장본'), saved);
  assert.deepEqual(await ev(() => HG2.model().review.count), count, 'saved model opened again');
  assert.deepEqual(await ev(() => HG2.state.status.filter(x => x.state === 'stale').length), 0, 'nothing to recompute after opening the saved model');

  // the golden 1.x T3 project as a 1.x user has it: its PHG D networks kept, the review 1.x's
  const v1 = G.read(path.join(G.FIXTURES, 't3'), 'project'), golden = G.read(path.join(G.FIXTURES, 't3'), 'review');
  t = Date.now(); await ev(p => HG2.open(p, 'T3 1.x'), v1); times.openV1S = (Date.now() - t) / 1000;
  assert.deepEqual(await ev(() => [HG2.model().review.done, Object.values(HG2.model().networks).every(n => n.source === 'v1')]), [18, true]);
  assert.deepEqual(await ev(() => HG2.model().review.count), golden.count, '1.x review');
  assert.deepEqual(errors, []);
  console.log(`E2E APP2 PASS · AUTO ${times.autoS} s · 1.x 열기 ${times.openV1S} s · 전체 ${((Date.now() - t0) / 1000).toFixed(1)} s`);
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E APP2 FAIL', e); process.exit(1); });
