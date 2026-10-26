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
  // step 4: ④ shows on the plan what took the PHG D editor - AUTO's forbidden zones, the velocity and PHG D's pressure
  // of every duct and RU, a duct's kind changed (PHG D calculates again; AUTO only when the user runs it)
  const key = 'D2__AHU-ACC', ribbon = label => p.locator('#ribbon .cmd', { hasText: label }).first();
  await p.click('.step[data-step=duct]'); await idle();
  await H(k => { const pl = HVACGrid.plans().find(x => x.key === k); Object.assign(HVACGrid.S, { deck: pl.deckId, sys: pl.systemKey, kind: pl.kind, room: null }); HVACGrid.render(); }, key);
  await H(k => HVACGrid.runAll([k]), key); await idle(); await frame();
  assert.equal(await ribbon('놓으면 AUTO').getAttribute('aria-pressed'), 'false', 'AUTO on a drop is off at first');
  const zones = await H(k => { const pl = HVACGrid.plans().find(x => x.key === k); return { want: pl.avoid.filter(z => z.zone?.length > 2).length + pl.outside.length, drawn: document.querySelectorAll('#plan polygon.zone').length, on: document.querySelector('#legend [data-layer="zones"]')?.checked }; }, key);
  assert.ok(zones.on && zones.want > 0 && zones.drawn === zones.want, 'forbidden zones on the plan ' + JSON.stringify(zones));
  await p.locator('.seg[data-seg="덕트 글자"] button', { hasText: '풍속' }).click(); await frame();
  const vel = await H(() => [...document.querySelectorAll('#plan text.dsz')].map(t => t.textContent));
  assert.ok(vel.length > 3 && vel.every(t => / m\/s$/.test(t)), 'velocity on the ducts ' + vel.slice(0, 4));
  await p.locator('.seg[data-seg="덕트 글자"] button', { hasText: '압력' }).click(); await idle();
  await p.waitForFunction(() => document.querySelectorAll('#plan text.ru-pa').length > 0, null, { timeout: 30000 });
  const pa = await H(k => ({ ducts: [...document.querySelectorAll('#plan text.dsz:not(.ru-pa)')].map(t => t.textContent), rus: document.querySelectorAll('#plan text.ru-pa').length, idx: [...document.querySelectorAll('#plan text.ru-pa.idx')].map(t => parseInt(t.textContent)), want: HVACGrid.result(k).rus, indexPa: HVACGrid.result(k).indexPa }), key);
  assert.ok(pa.ducts.length > 3 && pa.ducts.every(t => / Pa$/.test(t)) && pa.rus === pa.want, 'loss from the Root on the ducts, the total at every RU ' + JSON.stringify(pa).slice(0, 300));
  assert.ok(pa.idx.length === 1 && Math.abs(pa.idx[0] - pa.indexPa) <= 1, 'the index RU is the network\'s largest loss ' + JSON.stringify([pa.idx, pa.indexPa]));
  await p.screenshot({ path: path.join(OUT, 'one-canvas-4-pressure.png') });
  // a branch duct picked: its PHG D pressure, its kind changed to 주 덕트 - sized again, no AUTO, on the undo history
  const r0 = await H(k => HVACGrid.result(k), key);
  const bi = await H(k => { const i = HVACGrid.S.geometry[k].ducts.findIndex(d => d.type === 'branch'); HVACGrid.S.duct = { key: k, i }; HVACGrid.render(); return i; }, key);
  const d0 = await H(([k, i]) => HVACGrid.S.geometry[k].ducts[i], [key, bi]);
  await p.waitForFunction(() => /Root에서 끝까지/.test(document.getElementById('insp').textContent), null, { timeout: 30000 });
  await p.selectOption('#ductType', 'main'); await p.click('#ductTypeApply'); await idle();
  const d1 = await H(([k, id]) => HVACGrid.S.geometry[k].ducts.find(d => d.id === id), [key, d0.id]), r1 = await H(k => HVACGrid.result(k), key);
  assert.equal(d1.type, 'main', 'the duct is a main duct now'); assert.ok((d1.widthMm || d1.diameterMm) >= (d0.widthMm || d0.diameterMm), 'sized again by its kind');
  assert.ok(r1.edited && !r1.stale && r1.seconds === r0.seconds && r1.candidate === r0.candidate, 'PHG D calculated again, AUTO did not run');
  await H(() => HVACGrid.undo()); await idle();
  assert.equal(await H(([k, id]) => HVACGrid.S.geometry[k].ducts.find(d => d.id === id)?.type, [key, d0.id]), 'branch', 'undo: the kind of before');
  log('④: zones', zones.drawn, '· velocity', vel.length, '· pressure', pa.ducts.length, 'ducts', pa.rus, 'RUs · kind', d0.displayName, d0.type, '->', d1.displayName, d1.type, `${d0.widthMm}×${d0.heightMm} -> ${d1.widthMm}×${d1.heightMm}`);
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E ONE-CANVAS PASS');
 } catch (e) { console.error('E2E ONE-CANVAS FAIL', e); await p.screenshot({ path: path.join(OUT, 'one-canvas-fail.png') }).catch(() => {}); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
