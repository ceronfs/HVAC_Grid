// End-to-end: the plan's layers - each step starts with its own set, a box in the legend turns a layer on or off for
// that step alone (kept on the next visit), and the deck filter draws the decks above and below faint under this one.
//   node test/e2e/layers.e2e.cjs
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), G = require('../../tools/v1-golden.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const H = (f, a) => p.evaluate(f, a), idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 const n = () => H(() => Object.fromEntries(['fb', 'pen', 'duct', 'xfer', 'ru', 'ghost', 'dsz'].map(c => [c, document.querySelectorAll(`#plan .${c}`).length])));
 const tick = async (id, on) => { await p.locator(`#legend [data-layer=${id}]`).setChecked(on); await idle(); };
 try {
  await p.goto(s.url + '/app/'); await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  await H(d => HVACGrid.loadProject(d, 'T3'), G.read(path.join(G.FIXTURES, 't3'), 'project')); await idle();
  // ③ 풍량: system colours, ducts, no fire layer; the fire boundaries on by the box
  await p.click('.step[data-step=air]'); await idle(); await H(() => { HVACGrid.S.legendOpen = true; HVACGrid.render(); }); await idle();
  const a0 = await n(); assert.ok(a0.duct > 0 && a0.fb === 0 && a0.pen === 0, `③ defaults ${JSON.stringify(a0)}`);
  await tick('fire', true); const a1 = await n(); assert.ok(a1.fb > 10, `③ + fire ${JSON.stringify(a1)}`);
  await tick('rus', true); assert.ok(await p.locator('#plan .ru').count() > 0 && await p.locator('#plan .ru.drag').count() === 0, 'RUs on ③, not draggable there');
  // ⑤: its own set (fire, penetrations, every duct); ducts off there leaves ③ as it was
  await p.click('.step[data-step=review]'); await idle(); const r0 = await n(); assert.ok(r0.fb > 10 && r0.pen > 10 && r0.duct > 50 && r0.ru === 0, `⑤ defaults ${JSON.stringify(r0)}`);
  await tick('ducts', false); assert.equal((await n()).duct, 0, '⑤ ducts off');
  await p.click('.step[data-step=air]'); await idle(); const a2 = await n(); assert.ok(a2.fb > 10 && a2.duct > 0 && a2.ru > 0, `③ kept its own boxes ${JSON.stringify(a2)}`);
  await tick('fire', false); await tick('rus', false);
  await p.click('.step[data-step=review]'); await idle(); assert.equal((await n()).duct, 0, '⑤ kept ducts off'); await tick('ducts', true);
  // the deck filter: the decks above and below as outlines
  await p.selectOption('#deckFilter', 'near'); await idle(); const g = await n(); assert.ok(g.ghost > 10, `near decks ${JSON.stringify(g)}`);
  await p.screenshot({ path: path.join(OUT, 'layers-near.png') });
  await p.selectOption('#deckFilter', 'deck'); await idle(); assert.equal((await n()).ghost, 0);
  // ④: RUs draggable, main duct sizes
  await p.click('.step[data-step=duct]'); await idle(); const d = await n(); assert.ok(d.ru > 0 && d.duct > 0, `④ defaults ${JSON.stringify(d)}`);
  assert.ok(await p.locator('#plan .ru.drag').count() > 0, '④ RUs draggable');
  assert.deepEqual(errors, []);
  console.log('E2E LAYERS PASS');
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E LAYERS FAIL', e); process.exit(1); });
