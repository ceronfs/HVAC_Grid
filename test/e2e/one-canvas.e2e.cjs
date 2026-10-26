// End-to-end: one canvas over ① - ⑤ (docs/PLAN.md H5 4, step 3) on T3 - ③ → ① keeps the deck, the view and the room
// (picked in BOX as from its room list), the HVAC Grid layers can be switched on over BOX's own canvas (off at first,
// BOX keeps every click) and follow BOX's pan and zoom, a room picked in BOX is the room of ③, and ① → ③ does not fit
// the deck again when BOX shows only part of it; screenshots for a look.
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a), H = (f, a) => p.evaluate(f, a);
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 const frame = () => p.waitForTimeout(250);
 // BOX's view as a world point under a shell pixel and its scale
 const boxAt = (x, y) => H(([x, y]) => { const m = HVACGrid.box.doc.getElementById('svg').getScreenCTM(), fr = document.getElementById('boxFrame').getBoundingClientRect(); return { k: m.a, x: (x - fr.left - m.e) / m.a, y: (y - fr.top - m.f) / m.a }; }, [x, y]);
 const planAt = (x, y) => H(([x, y]) => { const m = document.getElementById('plan').getScreenCTM(); return { k: m.a, x: (x - m.e) / m.a, y: (y - m.f) / m.a }; }, [x, y]);
 const near = (a, b2, tol = 1) => Math.abs(a.k - b2.k) < 1e-6 * a.k && Math.abs(a.x - b2.x) < tol / a.k && Math.abs(a.y - b2.y) < tol / a.k;
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  await H(() => HVACGrid.openSample('t3')); await idle();
  // ③: deck A DK, a zoom and a room
  await p.click('.step[data-step=air]'); await idle(); await frame();
  await p.locator('#tree .deckh', { hasText: 'A DK' }).click(); await frame();
  const pr = await p.locator('#plan').boundingBox(), at = [pr.x + pr.width * 0.45, pr.y + pr.height * 0.45];
  await p.mouse.move(...at); await p.mouse.wheel(0, -250); await frame();
  await p.locator('#tree .room').nth(3).click();
  await frame();
  const in3 = await H(() => ({ deck: HVACGrid.S.deck, room: HVACGrid.S.room }));
  const view3 = await planAt(...at);
  // ③ → ①: BOX on that deck, at that view (the same world point under the same pixel), the room picked in BOX
  await p.click('.step[data-step=room]'); await idle(); await frame();
  const in1 = await H(() => { const st = HVACGrid.box.win.CAD_APP.st; return { active: st.activeDeck, pick: st.highlightRoom?.id || null, tool: st.tool, svg: !document.getElementById('plan').hidden, over: document.getElementById('plan').classList.contains('over-box'), drawn: document.querySelectorAll('#plan *').length, layers: [...document.querySelectorAll('#legend [data-layer]')].filter(e => e.checked).length }; });
  assert.equal(in1.active, in3.deck, 'BOX shows the deck of ③'); assert.equal(in1.pick, in3.room, 'the room of ③ picked in BOX');
  assert.ok(near(await boxAt(...at), view3), 'BOX at the view of ③ ' + JSON.stringify([await boxAt(...at), view3]));
  assert.ok(in1.over && in1.layers === 0 && in1.drawn < 5, '① opens with no HVAC Grid layer over BOX ' + JSON.stringify(in1));
  await p.screenshot({ path: path.join(OUT, 'one-canvas-1-from-3.png') }); log('③ → ①', JSON.stringify(in1));
  // the layers over BOX: 계통 색 on, drawn on BOX's own view; BOX still takes the click (the plan takes none)
  if (!(await H(() => !!document.querySelector('#legend [data-layer]')))) { await p.click('#legend .lg-tog'); await frame(); }
  await p.locator('#legend [data-layer="sys"]').check(); await p.locator('#legend [data-layer="units"]').check(); await frame();
  const fills = await H(() => [...document.querySelectorAll('#plan polygon.rm')].filter(e => e.getAttribute('fill') !== 'transparent').length);
  assert.ok(fills > 5, 'system colours over BOX ' + fills);
  assert.ok(near(await planAt(...at), await boxAt(...at), 0.6), 'the layers on BOX\'s view');
  assert.equal(await H(([x, y]) => getComputedStyle(document.getElementById('plan')).pointerEvents === 'none' && document.elementFromPoint(x, y)?.id, at), 'boxFrame', 'a click goes to BOX');
  // BOX pans (its own view): the layers follow
  await H(() => { const A = HVACGrid.box.win.CAD_APP; A.st.view.x += 1500; A.st.view.y -= 800; A.render(); }); await frame();
  assert.ok(near(await planAt(...at), await boxAt(...at), 0.6), 'the layers follow BOX\'s pan');
  await p.screenshot({ path: path.join(OUT, 'one-canvas-1-layers.png') });
  // a room picked in BOX (as its room list picks one): the shell's room follows
  const other = await H(r0 => HVACGrid.S.contract.rooms.find(r => r.deckId === HVACGrid.S.deck && r.id !== r0 && r.polygon.length >= 3), in3.room);
  await H(r => { const A = HVACGrid.box.win.CAD_APP; A.st.highlightRoom = { id: r.id, polygon: r.polygon, holes: r.holes || [], listPick: true, label: r.no }; A.render(); }, other); await frame();
  assert.equal(await H(() => HVACGrid.S.room), other.id, 'BOX pick → shell room');
  const view1 = await boxAt(...at);
  // ① → ③: the same room, and BOX's view kept (BOX shows only part of the zoomed deck: no fit)
  await p.click('.step[data-step=air]'); await idle(); await frame();
  const back = await H(() => ({ room: HVACGrid.S.room, deck: HVACGrid.S.deck, sel: document.querySelectorAll('#plan .selline').length }));
  assert.deepEqual([back.room, back.deck, back.sel], [other.id, in3.deck, 1], 'the room picked in BOX selected in ③');
  assert.ok(near(await planAt(...at), view1), '① → ③ at BOX\'s view ' + JSON.stringify([await planAt(...at), view1]));
  // ⑤ → ② and back: the view stays all the way
  await p.click('.step[data-step=review]'); await idle(); await frame();
  assert.ok(near(await planAt(...at), view1), '③ → ⑤ the same view');
  await p.click('.step[data-step=load]'); await idle(); await frame();
  assert.ok(near(await boxAt(...at), view1), '⑤ → ② the same view');
  assert.equal(await H(() => HVACGrid.box.win.CAD_APP.st.highlightRoom?.id), other.id, 'the room still picked in BOX');
  // ② keeps its own layers (off), ① its own (on)
  assert.equal(await H(() => [...document.querySelectorAll('#legend [data-layer]')].filter(e => e.checked).length), 0, '② has its own layers');
  await p.click('.step[data-step=room]'); await idle(); await frame();
  assert.deepEqual(await H(() => [...document.querySelectorAll('#legend [data-layer]')].filter(e => e.checked).map(e => e.dataset.layer)), ['sys', 'units'], '① keeps what was switched');
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E ONE-CANVAS PASS');
 } catch (e) { console.error('E2E ONE-CANVAS FAIL', e); await p.screenshot({ path: path.join(OUT, 'one-canvas-fail.png') }).catch(() => {}); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
