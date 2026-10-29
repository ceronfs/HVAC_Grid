// End-to-end: ⑤ 검토·출력 on the one canvas - the plan stays (fire boundaries, penetrations, every duct of the deck) and
// the review's tables are a dock under it; a penetration row shows its place on this plan (no jump to ③); the dock
// folds to its tab bar and its height follows the drag handle; ③ and back keep the deck.
//   node test/e2e/review-dock.e2e.cjs
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), G = require('../../tools/v1-golden.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const H = (f, a) => p.evaluate(f, a), idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 const st = () => H(() => { const r = id => document.getElementById(id).getBoundingClientRect();
  return { plan: !document.getElementById('plan').hidden, report: !document.getElementById('report').hidden, planBottom: Math.round(r('plan').bottom), dockTop: Math.round(r('report').top), dockH: Math.round(r('report').height),
   fb: document.querySelectorAll('#plan .fb').length, pens: document.querySelectorAll('#plan .pen').length, ducts: document.querySelectorAll('#plan .duct').length, deck: HVACGrid.S.deck, step: HVACGrid.S.step }; });
 try {
  await p.goto(s.url + '/app/'); await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  // the golden T3 project: design data, every network and its results
  await H(d => HVACGrid.loadProject(d, 'T3'), G.read(path.join(G.FIXTURES, 't3'), 'project')); await idle();
  await p.click('.step[data-step=review]'); await idle();
  const a = await st();
  assert.ok(a.plan && a.report, '⑤: the plan and the tables');
  assert.ok(a.fb > 10 && a.pens > 10 && a.ducts > 50, `the fire layer and the ducts on the plan ${JSON.stringify(a)}`);
  assert.ok(Math.abs(a.planBottom - a.dockTop) <= 2 && a.dockH > 200, `the plan ends where the dock begins ${JSON.stringify(a)}`);
  await p.screenshot({ path: path.join(OUT, 'review-dock.png') });
  // a penetration row: its place on this plan
  await p.locator('#report .tabs button', { hasText: '방화 (SOLAS)' }).click(); await idle();
  await p.locator('#report tbody tr[data-key^="pen:"]').first().click();
  const f = await H(() => ({ step: HVACGrid.S.step, focus: !!HVACGrid.S.focus, ring: document.querySelectorAll('#plan .focus').length }));
  assert.deepEqual(f, { step: 'review', focus: true, ring: 1 });
  // fold and unfold; drag the handle up
  await p.click('#dockTog'); await idle(); const folded = await st(); assert.ok(folded.dockH < 60 && folded.planBottom > a.planBottom + 200, 'folded to the tab bar');
  await p.click('#dockTog'); await idle();
  const hd = await p.locator('#dockHandle').boundingBox(); await p.mouse.move(hd.x + hd.width / 2, hd.y + 4); await p.mouse.down(); await p.mouse.move(hd.x + hd.width / 2, hd.y - 150, { steps: 5 }); await p.mouse.up(); await idle();
  const dragged = await st(); assert.ok(dragged.dockH > a.dockH + 100, `dragged up ${a.dockH} → ${dragged.dockH}`);
  // ③ and back: the same deck, the dock as it was
  await H(() => { HVACGrid.S.deck = 'D2'; HVACGrid.render(); });
  await p.click('.step[data-step=air]'); await idle(); const air = await st(); assert.equal(air.report, false); assert.equal(air.deck, 'D2');
  await p.click('.step[data-step=review]'); await idle(); const back = await st(); assert.equal(back.deck, 'D2'); assert.ok(Math.abs(back.dockH - dragged.dockH) <= 2);
  assert.deepEqual(errors, []);
  console.log('E2E REVIEW-DOCK PASS');
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E REVIEW-DOCK FAIL', e); process.exit(1); });
