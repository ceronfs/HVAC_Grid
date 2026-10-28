// End-to-end: ① ② with the HVAC Grid layers over BOX's drawing - off until asked, then over the deck BOX shows,
// following BOX's pan, zoom and deck, taking no clicks; ③ → ① keeps the view; the room picked passes both ways.
//   node test/e2e/box-layers.e2e.cjs
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), G = require('../../tools/v1-golden.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const H = (f, a) => p.evaluate(f, a), idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
 // a corner of a room of the deck shown: its screen place on the HVAC Grid plan and on BOX's canvas
 const both = () => H(() => { const S = HVACGrid.S, r = S.contract.rooms.find(x => x.deckId === S.deck), q = r.polygon[0], svg = document.getElementById('plan'), m = svg.getScreenCTM();
  const bd = HVACGrid.box.doc, bm = bd.getElementById('svg').getScreenCTM(), fr = document.getElementById('boxFrame').getBoundingClientRect();
  return { deck: S.deck, plan: [m.a * q.x + m.e, m.d * -q.y + m.f], box: [fr.left + bm.a * q.x + bm.e, fr.top + bm.d * -q.y + bm.f] }; });
 const near = (u, msg) => assert.ok(Math.hypot(u.plan[0] - u.box[0], u.plan[1] - u.box[1]) < 1.5, `${msg} ${JSON.stringify(u)}`);
 try {
  await p.goto(s.url + '/app/'); await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  // T3's BOX drawing, then the golden T3 project (its design data was made from that drawing)
  await H(async t => { const w = HVACGrid.box.win, ask = w.confirm; w.confirm = () => true; try { HVACGrid.box.setFile('jsonFile', new File([t], 'T3.box.json', { type: 'application/json' })); } finally { w.confirm = ask; } }, fs.readFileSync(path.join(__dirname, '..', '..', 'samples', 't3', 'T3.box.json'), 'utf8'));
  await p.waitForFunction(() => { try { return HVACGrid.box.win.CAD_APP.rooms().length === 79; } catch { return false; } }, null, { timeout: 180000 });
  await H(d => HVACGrid.loadProject(d, 'T3'), G.read(path.join(G.FIXTURES, 't3'), 'project')); await idle();
  assert.ok(await H(() => HVACGrid.box.hasDrawing()), 'the project brought its BOX drawing');
  // ③: a room picked, a view of the user's own (wheel zoom)
  await p.click('.step[data-step=air]'); await idle();
  const room = await H(() => { const S = HVACGrid.S, r = S.contract.rooms.filter(x => x.deckId === S.deck)[3]; S.room = r.id; HVACGrid.render(); return r.id; });
  const pr = await p.locator('#plan').boundingBox(); await p.mouse.move(pr.x + pr.width / 2, pr.y + pr.height / 2); await p.mouse.wheel(0, -240); await idle(); await frame();
  const v3 = await H(() => ({ ...HVACGrid.S.planShown, own: !!HVACGrid.S.planView }));
  assert.ok(v3.own, 'the plan has a view of its own');
  // ①: the same view on BOX's canvas, BOX highlights the room; no layers until asked
  await p.click('.step[data-step=room]'); await idle(); await frame();
  const b1 = await H(() => { const A = HVACGrid.box.win.CAD_APP, bd = HVACGrid.box.doc, m = bd.getElementById('svg').getScreenCTM(), fr = document.getElementById('boxFrame').getBoundingClientRect(), rc = fr;
   return { deck: A.st.activeDeck, hl: String(A.st.highlightRoom?.id), k: m.a, x: (rc.left - fr.left - m.e) / m.a, y: (rc.top - fr.top - m.f) / m.a, plan: !document.getElementById('plan').hasAttribute('hidden') }; });
  assert.equal(b1.deck, v3.deck); assert.equal(b1.hl, room, 'BOX highlights the room picked in ③');
  assert.ok(Math.abs(b1.k - v3.k) / v3.k < 1e-3 && Math.abs(b1.x - v3.minX) * v3.k < 1.5 && Math.abs(b1.y - v3.minY) * v3.k < 1.5, `③ → ①: the same view ${JSON.stringify({ b1, v3 })}`);
  assert.equal(b1.plan, false, 'no HVAC Grid layers in ① until asked');
  // the layers on: over the deck BOX shows, taking no clicks, BOX's room fills aside
  await p.locator('#ribbon button', { hasText: 'HVAC Grid 층' }).click(); await idle(); await frame();
  const o = await H(() => { const svg = document.getElementById('plan'); return { shown: !svg.hasAttribute('hidden'), over: svg.classList.contains('over-box'), rooms: svg.querySelectorAll('.rm').length, pe: getComputedStyle(svg.querySelector('.rm')).pointerEvents, ov: HVACGrid.box.doc.documentElement.classList.contains('hg-ov'), legend: !!document.querySelector('#legend [data-layer=air]:checked') }; });
  assert.deepEqual(o, { ...o, shown: true, over: true, pe: 'none', ov: true, legend: true }); assert.ok(o.rooms > 5);
  near(await both(), 'the layers on BOX\'s view');
  await p.screenshot({ path: path.join(OUT, 'box-layers.png') });
  // BOX pans and zooms, then shows another deck: the layers follow
  await H(() => { const A = HVACGrid.box.win.CAD_APP; A.st.view.x += A.st.view.w * 0.1; A.st.view.w *= 0.8; A.st.view.h *= 0.8; A.render(); }); await frame(); near(await both(), 'after BOX\'s pan and zoom');
  const other = await H(() => { const A = HVACGrid.box.win.CAD_APP, d = HVACGrid.S.contract.decks.find(x => x.id !== A.st.activeDeck && HVACGrid.S.contract.rooms.some(r => r.deckId === x.id)); A.st.activeDeck = d.id; A.render(); return d.id; }); await frame();
  const f = await both(); assert.equal(f.deck, other, 'the deck BOX shows'); near(f, 'on the other deck');
  // a room picked in BOX (its room list) is the room picked in ③
  const pick = await H(() => { const A = HVACGrid.box.win.CAD_APP, r = A.rooms().find(x => x.deckId === A.st.activeDeck && HVACGrid.S.contract.rooms.some(c => c.id === String(x.id))); A.st.highlightRoom = { id: r.id, polygon: r.polygon, listPick: true }; A.render(); return String(r.id); });
  await p.click('.step[data-step=air]'); await idle(); assert.deepEqual(await H(() => [HVACGrid.S.deck, HVACGrid.S.room]), [other, pick]);
  // the button off: BOX alone again
  await p.click('.step[data-step=load]'); await idle(); await p.locator('#ribbon button', { hasText: 'HVAC Grid 층' }).click(); await idle();
  assert.deepEqual(await H(() => [document.getElementById('plan').hasAttribute('hidden'), HVACGrid.box.doc.documentElement.classList.contains('hg-ov')]), [true, false]);
  assert.deepEqual(errors, []);
  console.log('E2E BOX-LAYERS PASS');
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E BOX-LAYERS FAIL', e); process.exit(1); });
