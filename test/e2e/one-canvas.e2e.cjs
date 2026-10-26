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
  await ribbon('HVAC Grid 평면').click(); await idle();   // ④ opens on PHG D's canvas; these are the HVAC Grid plan's
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
  // ④ on PHG D's own canvas (2026-10-27: "캔버스만 가져오고 기능은 PHG D 그대로"): the same deck and view as ③ ⑤, the
  // HVAC Grid layers over it, every click PHG D's; a network made with PHG D's own commands is read back as 직접 작성
  const phgAt = (x, y) => H(([x, y]) => { const m = HVACGrid.phg.doc.getElementById('svg').getScreenCTM(), fr = document.getElementById('phgFrame').getBoundingClientRect(); return { k: m.a, x: (x - fr.left - m.e) / m.a, y: (y - fr.top - m.f) / m.a }; }, [x, y]);
  await ribbon('PHG D 캔버스').click(); await idle();
  await p.click('.step[data-step=air]'); await idle(); await frame();
  const ar3 = await p.locator('#plan').boundingBox(), at3 = [ar3.x + ar3.width * 0.5, ar3.y + ar3.height * 0.5];
  await p.mouse.move(...at3); await p.mouse.wheel(0, 150); await frame();
  const v3 = await planAt(...at3);
  await p.click('.step[data-step=duct]'); await idle(); await frame();
  const canvas = await H(() => ({ phg: getComputedStyle(document.getElementById('phgFrame')).visibility, plan: document.getElementById('main').classList.contains('plan-view'), key: HVACGrid.S.active }));
  assert.deepEqual([canvas.phg, canvas.plan], ['visible', true], '④ on PHG D\'s canvas, full width');
  assert.ok(near(await phgAt(...at3), v3), '③ → ④: PHG D at the view of ③ ' + JSON.stringify([await phgAt(...at3), v3]));
  if (!(await H(() => !!document.querySelector('#legend [data-layer]')))) { await p.click('#legend .lg-tog'); await frame(); }
  assert.equal(await H(() => [...document.querySelectorAll('#legend [data-layer]')].filter(e => e.checked).length), 0, 'no layer over PHG D at first');
  await p.locator('#legend [data-layer="sys"]').check(); await p.locator('#legend [data-layer="ducts"]').check(); await frame();
  assert.ok(near(await planAt(...at3), await phgAt(...at3), 0.6), 'the layers on PHG D\'s view');
  assert.equal(await H(([x, y]) => document.elementFromPoint(x, y)?.id, at3), 'phgFrame', 'a click goes to PHG D');
  await H(() => { const w = HVACGrid.phg.win, v = w.LineDesignLegacy.getState().view, svg = HVACGrid.phg.doc.getElementById('svg'); v.x += 1200; v.y -= 600; svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); w.LineDesignLegacy.renderEverything(); }); await frame();
  assert.ok(near(await planAt(...at3), await phgAt(...at3), 0.6), 'the layers follow PHG D\'s pan');
  await p.screenshot({ path: path.join(OUT, 'one-canvas-4-phg.png') });
  // another system of the deck: sent to PHG D with its RUs (no AUTO), shown at the same view
  const before = await phgAt(...at3);
  await p.selectOption('#sysSel', 'EF-SAN'); await idle(); await frame();
  const ef = await H(() => ({ active: HVACGrid.S.active, auto: !!HVACGrid.result(HVACGrid.S.active)?.auto, rus: HVACGrid.phg.result().rus, want: HVACGrid.plans().find(x => x.key === HVACGrid.S.active).rus.length, ducts: HVACGrid.phg.result().ducts }));
  assert.ok(ef.active === 'D2__EF-SAN' && !ef.auto && ef.rus === ef.want && ef.ducts === 0, 'RUs in PHG D, no AUTO ' + JSON.stringify(ef));
  assert.ok(near(await phgAt(...at3), before), 'another system of the deck at the same view');
  // drawn with PHG D's own commands (lines, 덕트 지정, 계산) as a designer would in PHG D
  const made = await H(async () => {
   const P = HVACGrid.phg, w = P.win, L = w.LineDesignLegacy, st = L.getState(), pl = HVACGrid.plans().find(x => x.key === HVACGrid.S.active), y = pl.root.y, ids = [];
   const seg = (a, b) => { if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return; const id = 'e2e-' + (ids.length + 1); st.entities.push({ type: 'LINE', layer: 'DUCT_SKETCH', x1: a.x, y1: a.y, x2: b.x, y2: b.y, id }); ids.push(id); };
   const xs = [...new Set([pl.root.x, ...pl.rus.map(u => u.x)])].sort((a, b) => a - b); for (let i = 0; i + 1 < xs.length; i++) seg({ x: xs[i], y }, { x: xs[i + 1], y });
   const byX = {}; for (const u of pl.rus) (byX[u.x] = byX[u.x] || []).push(u);
   for (const [x, us] of Object.entries(byX)) for (const side of [us.filter(u => u.y < y).sort((a, b) => b.y - a.y), us.filter(u => u.y > y).sort((a, b) => a.y - b.y)]) { let prev = { x: +x, y }; for (const u of side) { seg(prev, u); prev = { x: u.x, y: u.y }; } }
   st.selectedEntityIds.clear(); ids.forEach(i => st.selectedEntityIds.add(i)); L.renderEverything();
   P.click('makeDuctBtn'); for (let i = 0; i < 100 && !(st.ducts.length || P.doc.getElementById('phgb-conversion')?.open); i++) await new Promise(r => setTimeout(r, 100));
   const conv = P.doc.getElementById('phgb-conversion'); if (conv?.open) { P.doc.getElementById('phgb-conversion-apply').click(); for (let i = 0; i < 100 && (conv.open || !st.ducts.length); i++) await new Promise(r => setTimeout(r, 100)); }
   await w.LineDesignV2.calculateTypedNetwork(''); L.renderEverything();
   return { lines: ids.length, ducts: st.ducts.length, unconnected: st.diffusers.filter(d => !d.connectedDuctId).length };
  });
  assert.ok(made.ducts > 10 && made.unconnected === 0, 'a network drawn in PHG D ' + JSON.stringify(made));
  const v4 = await phgAt(...at3);
  // ④ → ⑤: read back as 직접 작성 (done), ⑤ at PHG D's view
  await p.click('.step[data-step=review]'); await idle(); await frame();
  const hand = await H(() => { const r = HVACGrid.result('D2__EF-SAN'), a = HVACGrid.analysis(); return { manual: r.manual, auto: !!r.auto, ducts: r.ducts, edited: r.edited, stale: r.stale, status: HVACGrid.LIB.report.sheets(HVACGrid.project(), a).find(s => s.name === 'Deck 덕트망').rows.some(x => x[2] === 'EF-SAN' && /A DK/.test(x[0]) && x.includes('직접 작성')), geometry: HVACGrid.S.geometry['D2__EF-SAN'].ducts.length }; });
  assert.ok(hand.manual && !hand.auto && hand.ducts === made.ducts && hand.geometry === made.ducts && !hand.stale && hand.status, 'read back as 직접 작성 ' + JSON.stringify(hand));
  assert.ok(near(await planAt(...at3), v4), '④ → ⑤ at PHG D\'s view');
  // AUTO asks before it replaces a network made by hand; 취소 keeps it
  await p.click('.step[data-step=duct]'); await idle();
  await ribbon('보내기 + AUTO').click(); await p.waitForSelector('#dlg[open]');
  await p.click('#dlgBtns button[data-v=cancel]'); await idle();
  assert.ok(await H(() => HVACGrid.result('D2__EF-SAN')?.manual && !HVACGrid.result('D2__EF-SAN')?.auto), 'AUTO asked, the network made by hand kept');
  log('④ PHG D canvas: view kept ③ → ④ → ⑤, layers over it, a network drawn in PHG D', JSON.stringify(made), '→ 직접 작성');
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E ONE-CANVAS PASS');
 } catch (e) { console.error('E2E ONE-CANVAS FAIL', e); await p.screenshot({ path: path.join(OUT, 'one-canvas-fail.png') }).catch(() => {}); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
