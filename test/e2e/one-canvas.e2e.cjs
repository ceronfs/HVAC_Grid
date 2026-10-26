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
  // 덕트 그리기 (2026-10-26): after ③ the plan's RUs go to PHG D by themselves (no AUTO); the designer draws the ducts on
  // the plan and 덕트 지정·계산 makes PHG D's network of the lines
  const hk = 'D2__EF-SAN';
  await H(k => { const pl = HVACGrid.plans().find(x => x.key === k); Object.assign(HVACGrid.S, { deck: pl.deckId, sys: pl.systemKey, kind: pl.kind, room: null, duct: null, planView: null, legendOpen: false }); HVACGrid.render(); }, hk);
  await idle(); await frame();
  const sent = await H(k => ({ project: !!HVACGrid.S.projects[k], auto: !!HVACGrid.result(k)?.auto, rus: HVACGrid.phg.result().rus, want: HVACGrid.plans().find(x => x.key === k).rus.length, banner: document.getElementById('staleBanner')?.textContent || '' }), hk);
  assert.ok(sent.project && !sent.auto && sent.rus === sent.want && /덕트 그리기/.test(sent.banner), 'RUs in PHG D, no AUTO, the way on said ' + JSON.stringify(sent));
  await ribbon('덕트 그리기').click(); await idle();
  assert.ok(await H(() => !!HVACGrid.S.draw), 'drawing');
  // a run with the mouse: from the fan (snapped), along to an RU's x (ortho, grid), down onto the RU (snapped), the same
  // point again ends it
  const geo = await H(k => { const pl = HVACGrid.plans().find(x => x.key === k), u = pl.rus.find(u => u.x !== pl.root.x && u.y !== pl.root.y), m = document.getElementById('plan').getScreenCTM(), s = p => [m.a * p.x + m.e, m.d * p.y + m.f];
   return { root: pl.root, ru: { x: u.x, y: u.y }, at: [s({ x: pl.root.x + 60, y: pl.root.y - 40 }), s({ x: u.x + 30, y: pl.root.y + 70 }), s({ x: u.x - 50, y: u.y + 40 })] }; }, hk);
  for (const q of geo.at) { await p.mouse.click(...q); await frame(); }
  await p.mouse.click(...geo.at[2]); await frame();
  const run = await H(k => HVACGrid.sketchOf(k).map(l => [l.a.x, l.a.y, l.b.x, l.b.y, l.role]), hk);
  assert.deepEqual(run, [[geo.root.x, geo.root.y, geo.ru.x, geo.root.y, 'main'], [geo.ru.x, geo.root.y, geo.ru.x, geo.ru.y, 'main']], 'snapped to the fan and the RU, square to the grid');
  assert.equal(await H(() => HVACGrid.S.draw.from), null, 'the same point again ended the run');
  await p.screenshot({ path: path.join(OUT, 'one-canvas-4-draw.png') });
  // the rest drawn (a main along the fan's line, a branch chain to the RUs of each x), 분기 for the branches
  await H(([k, first]) => { const pl = HVACGrid.plans().find(x => x.key === k), y = pl.root.y, xs = [...new Set([pl.root.x, ...pl.rus.map(u => u.x)])].sort((a, b) => a - b);
   for (let i = 0; i + 1 < xs.length; i++) if (!(xs[i] === Math.min(pl.root.x, first.x) && xs[i + 1] === Math.max(pl.root.x, first.x) && Math.abs(xs.indexOf(pl.root.x) - xs.indexOf(first.x)) === 1)) HVACGrid.addSegment(k, { x: xs[i], y }, { x: xs[i + 1], y }, 'main');
   const byX = {}; for (const u of pl.rus) (byX[u.x] = byX[u.x] || []).push(u);
   for (const [x, us] of Object.entries(byX)) for (const side of [us.filter(u => u.y < y).sort((a, b) => b.y - a.y), us.filter(u => u.y > y).sort((a, b) => a.y - b.y)]) {
    let prev = { x: +x, y }; for (const u of side) { if (!(u.x === first.x && u.y === first.y)) HVACGrid.addSegment(k, prev, { x: u.x, y: u.y }, 'branch'); prev = { x: u.x, y: u.y }; } } }, [hk, geo.ru]);
  await idle(); await frame();
  const drawn = await H(k => HVACGrid.sketchOf(k).length, hk);
  assert.ok(await p.isVisible('#staleBanner') && /아직 덕트망이 아닙니다/.test(await p.textContent('#staleBanner')), 'lines, not a network yet');
  await ribbon('덕트 지정·계산').click(); await idle();
  const built = await H(k => { const r = HVACGrid.result(k), a = HVACGrid.analysis(), st = HVACGrid.phg.win.LineDesignLegacy.getState(); return { manual: r.manual, auto: !!r.auto, ducts: r.ducts, unconnected: r.unconnected, stale: r.stale, flow: r.flowCmh, design: r.designCmh, types: r.ductTypes, lines: HVACGrid.S.geometry[k].ducts.filter(d => d.line).length, sized: st.ducts.every(d => +d.widthMm > 0 || +d.diameterMm > 0), done: a.results[k] && a.done, status: HVACGrid.LIB.report.sheets(HVACGrid.project(), a).find(s => s.name === 'Deck 덕트망').rows.find(r => r[2] === 'EF-SAN' && /A DK/.test(r[0]))?.includes('직접 작성'), banner: !document.getElementById('staleBanner').hidden }; }, hk);
  assert.ok(built.manual && !built.auto && built.ducts > 10 && built.unconnected === 0 && !built.stale && built.sized && built.flow === built.design, 'a network of the lines, sized, every RU on it ' + JSON.stringify(built));
  assert.ok(built.lines === built.ducts && built.types.main > 0 && built.types.branch > 0, 'one duct per line, of the line\'s kind ' + JSON.stringify(built.types));
  assert.ok(built.status && !built.banner, 'counted as done (직접 작성), nothing left to do on the canvas');
  await p.screenshot({ path: path.join(OUT, 'one-canvas-4-built.png') });
  // undo: the lines again, no network of them; redo: the network
  await H(() => HVACGrid.undo()); await idle();
  assert.deepEqual(await H(k => [HVACGrid.sketchOf(k).length, !!HVACGrid.result(k)?.manual], hk), [drawn, false], 'undo: the lines, not the network');
  await H(() => HVACGrid.redo()); await idle();
  assert.ok(await H(k => HVACGrid.result(k)?.manual && HVACGrid.S.geometry[k].ducts.length > 10, hk), 'redo: the network');
  // AUTO asks before it replaces work drawn by hand; 취소 keeps it
  await H(() => { HVACGrid.S.draw = null; HVACGrid.render(); });
  await ribbon('보내기 + AUTO').click(); await p.waitForSelector('#dlg[open]');
  await p.click('#dlgBtns button[data-v=cancel]'); await idle();
  assert.ok(await H(k => HVACGrid.result(k)?.manual && !HVACGrid.result(k)?.auto, hk), 'AUTO asked, the drawn network kept');
  log('덕트 그리기', drawn, 'lines →', JSON.stringify({ ducts: built.ducts, types: built.types, flow: built.flow }));
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E ONE-CANVAS PASS');
 } catch (e) { console.error('E2E ONE-CANVAS FAIL', e); await p.screenshot({ path: path.join(OUT, 'one-canvas-fail.png') }).catch(() => {}); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
