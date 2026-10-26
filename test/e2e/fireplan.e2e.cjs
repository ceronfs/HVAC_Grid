// End-to-end: ⑤ 방화 등급도 (fire-rating plan) in the app - T3 opened, the tab shows the deck with its ratings written on
// the walls and the rooms' categories, other decks by the buttons, C ratings on request; a screenshot for a look.
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a), H = (f, a) => p.evaluate(f, a);
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 const view = () => H(() => { const svg = document.querySelector('#report svg.fireplan');
  return svg ? { deck: svg.dataset.deck, labels: svg.querySelectorAll('text[font-weight="700"]').length, cats: [...svg.querySelectorAll('text')].filter(t => /^\(\d+\) /.test(t.textContent)).length,
   legend: !!document.querySelector('#report .fp-cats'), pressed: document.querySelector('#report [data-fpdeck][aria-pressed="true"]')?.dataset.fpdeck } : null; });
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  await H(() => HVACGrid.openSample('t3')); await idle();
  await p.click('.step[data-step=review]'); await idle();
  await p.locator('#report .tabs button', { hasText: '방화 등급도' }).click(); await idle();
  const v1 = await view(); log('tab', JSON.stringify(v1));
  assert.ok(v1 && v1.labels > 5 && v1.cats > 5 && v1.legend, 'ratings on the walls, categories in the rooms, the legend');
  // another deck
  await p.locator('#report [data-fpdeck="D2"]').click(); await idle();
  const v2 = await view(); assert.equal(v2.deck, 'D2'); assert.equal(v2.pressed, 'D2');
  await p.screenshot({ path: path.join(OUT, 'fireplan-D2.png') });
  // C ratings written too
  await p.locator('#fpShowC').check(); await idle();
  const v3 = await view(); assert.ok(v3.labels > v2.labels, `C labels: ${v2.labels} -> ${v3.labels}`); log('C on', v2.labels, '->', v3.labels);
  await p.locator('#fpShowC').uncheck(); await idle();
  // one canvas (docs/PLAN.md H5): ⑤ on the plan of ③ ④ - BOX's canvas under it, the fire layer (the 방화 등급도's own
  // layout: ratings along the walls) on it, the tables in the dock under the canvas
  const rect = id => H(i => { const r = document.getElementById(i).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; }, id);
  const five = await H(() => ({ plan: !document.getElementById('plan').hidden, dock: !document.getElementById('dock').hidden, box: getComputedStyle(document.getElementById('boxFrame')).visibility, fb: document.querySelectorAll('#plan line.fb').length, labels: document.querySelectorAll('#plan text.fpl').length, deck: HVACGrid.S.deck }));
  const pr = await rect('plan'), dr = await rect('dock');
  assert.deepEqual([five.plan, five.dock, five.box], [true, true, 'visible'], JSON.stringify(five));
  assert.ok(five.fb > 5 && five.labels > 5, 'fire layer on the plan ' + JSON.stringify(five));
  assert.ok(Math.abs(pr.bottom - dr.top) < 2 && dr.height > 150 && pr.height > 300, `plan above the dock ${JSON.stringify([pr, dr])}`);
  // the view and the room stay from ③ to ⑤ (one canvas): a zoom and a room in ③, then ⑤
  await p.click('.step[data-step=air]'); await idle();
  const ar = await rect('plan'); await p.mouse.move(ar.left + (ar.right - ar.left) * 0.45, ar.top + ar.height * 0.45); await p.mouse.wheel(0, -200); await p.waitForTimeout(300);
  await p.locator('#tree .room').nth(2).click(); await p.waitForTimeout(200);
  const in3 = await H(() => ({ v: HVACGrid.S.planShown, room: HVACGrid.S.room, deck: HVACGrid.S.deck }));
  await p.click('.step[data-step=review]'); await idle(); await p.waitForTimeout(200);
  const in5 = await H(() => ({ v: HVACGrid.S.planShown, room: HVACGrid.S.room, deck: HVACGrid.S.deck }));
  assert.deepEqual([in5.deck, in5.room, in5.v.k, Math.round(in5.v.minX), Math.round(in5.v.minY)], [in3.deck, in3.room, in3.v.k, Math.round(in3.v.minX), Math.round(in3.v.minY)], 'view, deck and room kept ③ → ⑤');
  log('③ → ⑤ view kept', JSON.stringify(in5.v));
  // a penetration row of another deck: that deck, the place ringed on the part of the canvas on screen
  await p.locator('#report .tabs button', { hasText: '방화 (SOLAS)' }).click(); await idle();
  const pen = await H(() => { const p = HVACGrid.analysis().solas.penetrations.find(x => x.deckId !== HVACGrid.S.deck); return p && { no: p.no, deckId: p.deckId }; });
  assert.ok(pen, 'a penetration on another deck');
  await p.locator(`#report tr[data-key="pen:${pen.no}"]`).click(); await p.waitForTimeout(300);
  const ring = await H(() => { const c = document.querySelector('#plan .focus'), r = c?.getBoundingClientRect(); return { deck: HVACGrid.S.deck, step: HVACGrid.S.step, at: r && { x: r.left + r.width / 2, y: r.top + r.height / 2 } }; });
  const pr2 = await rect('plan'), lw = (await rect('left')).right, rw = (await rect('right')).left;
  assert.equal(ring.step, 'review'); assert.equal(ring.deck, pen.deckId);
  assert.ok(ring.at && ring.at.x > lw && ring.at.x < rw && ring.at.y > pr2.top && ring.at.y < pr2.bottom, `ring on screen ${JSON.stringify([ring, pr2, lw, rw])}`);
  await p.screenshot({ path: path.join(OUT, 'one-canvas-5-pen.png') }); log('penetration row', pen.no, '->', pen.deckId);
  // a row of 검토 that points at a room: the room selected on its deck
  await p.locator('#report .tabs button', { hasText: '검토' }).click(); await idle();
  const want = await H(() => [...document.querySelectorAll('#report tr.go')].length);
  assert.ok(want > 0, 'rows of 검토 with a place');
  await p.locator('#report tr.go').first().click(); await p.waitForTimeout(300);
  assert.ok(await H(() => !!HVACGrid.S.focus && HVACGrid.S.step === 'review'), 'a 검토 row shows its place');
  // the dock folds to its tabs (the plan takes the canvas) and opens again; its top edge drags it higher
  const h0 = (await rect('plan')).height;
  await p.click('#dockFold'); await p.waitForTimeout(200);
  const folded = { plan: (await rect('plan')).height, dock: (await rect('dock')).height };
  assert.ok(folded.plan > h0 + 100 && folded.dock < 80, `folded ${JSON.stringify({ h0, ...folded })}`);
  await p.click('#dockFold'); await p.waitForTimeout(200);
  const g = await rect('dockGrip'), d0 = (await rect('dock')).height;
  await p.mouse.move((g.left + g.right) / 2, g.top + 4); await p.mouse.down(); await p.mouse.move((g.left + g.right) / 2, g.top - 96, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(200);
  const d1 = (await rect('dock')).height; assert.ok(Math.abs(d1 - d0 - 100) < 12, `dock dragged ${d0} -> ${d1}`);
  assert.ok(Math.abs((await rect('plan')).bottom - (await rect('dock')).top) < 2, 'plan above the dock after the drag');
  log('dock fold, open, drag', d0, '->', d1);
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E FIREPLAN PASS');
 } catch (e) { console.error('E2E FIREPLAN FAIL', e); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
