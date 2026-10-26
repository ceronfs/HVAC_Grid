// End-to-end: the HVAC Grid shell over the real vendor apps with the S5 example. BOX S5 -> CAL -> contract -> airflow
// rules, a unit location, an exhaust system over several decks (unit deck, undo / redo) -> PHG D send + AUTO -> review
// tabs, SOLAS space assignment -> outputs (project, XLSX, DXF, report) as real downloads. Screenshots: out/e2e/.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), { readWorkbook } = require('../../lib/xlsx-read.cjs'), X = require('../../lib/dxf-in.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e');

(async () => {
 fs.mkdirSync(OUT, { recursive: true });
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 }, acceptDownloads: true }), errors = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); }); p.on('dialog', d => d.accept());
 const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);
 const ribbon = label => p.locator('#ribbon .cmd', { hasText: label }).first();
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 const H = f => p.evaluate(f);
 // saved under a name of the test's own: some Chromium builds give every download the name 'download' (review 2026-10-22 #8)
 const download = async (label, name) => { const [d] = await Promise.all([p.waitForEvent('download'), ribbon(label).click()]); const f = path.join(OUT, name); await d.saveAs(f); return f; };
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && window.HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  log('BOX ready'); await shot('1-room-empty');
  // the native BOX command bar is hidden inside the frame; the shell ribbon runs its commands
  assert.equal(await H(() => getComputedStyle(HVACGrid.box.doc.querySelector('header.top')).display), 'none');
  // ① ② are BOX's screens: the HVAC Grid tree and inspector (design data) are not there
  assert.deepEqual(await H(() => ['left', 'right'].map(id => getComputedStyle(document.getElementById(id)).display)), ['none', 'none']);
  // ② is ribbon-first: CAL calculates out of sight (its panel is never on screen), its tables open in a window dressed
  // like the app (app/popup.css); CAL left on one drawing calculates again for the next (it once kept the old rooms)
  await ribbon('H5 예제').click();
  await p.waitForFunction(() => HVACGrid.box.hasDrawing(), null, { timeout: 180000 }); await p.waitForTimeout(1000);
  await p.click('.step[data-step=load]'); await idle();
  assert.deepEqual(await H(() => [...document.querySelectorAll('#ribbon .cmd')].map(c => c.textContent.trim()).filter(t => /^(CAL 열기|격실 입력|LY|LY 적용|구조 계산|구조 적용)$/.test(t))), ['격실 입력', 'LY', 'LY 적용']);
  const [win] = await Promise.all([p.context().waitForEvent('page'), ribbon('격실 입력').click()]);
  await win.waitForFunction(() => document.getElementById('hvac-grid-popup') && / — HVAC Grid$/.test(document.title), null, { timeout: 60000 });
  assert.equal(await win.title(), '격실 입력 · 포함 7개 — HVAC Grid'); await win.close(); await idle();
  assert.equal(await H(() => getComputedStyle(HVACGrid.box.doc.getElementById('calEnhancePanel')).visibility), 'hidden', 'the CAL panel is never on screen');
  assert.match(await H(() => document.getElementById('status').textContent), /CAL: 격실 7개 계산됨/); log('H5: CAL in the background, 격실 입력 window');
  // H5 has no SUP/EXH/RET: its design data has no system, and the next step says where to put them
  await ribbon('설계 데이터 만들기').click(); await idle();
  assert.equal(await H(() => HVACGrid.S.contract.systems.length), 0); assert.match(await H(() => document.getElementById('nextBtn').textContent), /격실 입력/); log('H5: 0 systems -> 다음: 격실 입력');
  await p.click('.step[data-step=room]'); await idle();
  await ribbon('S5 예제').click(); await p.locator('#dlg[open] button[data-v=ok]').click({ timeout: 5000 });   // over the H5 drawing: the app asks first
  await p.waitForFunction(() => HVACGrid.box.win.CAD_APP.st.decks.length === 5, null, { timeout: 180000 }); await p.waitForTimeout(1000);
  log('S5 loaded'); await shot('1-room-s5');
  await p.click('.step[data-step=load]'); await idle();
  assert.equal(await H(() => HVACGrid.box.calCurrent()), false, 'CAL on H5 is not current for S5');
  assert.match(await H(() => document.getElementById('status').textContent), /CAL: 도면이 바뀜/);
  // ② -> ③ on the same canvas: the plan maps the deck to the very pixels BOX's canvas did, on the deck BOX showed
  const ctmBox = await H(() => { const m = HVACGrid.box.doc.getElementById('svg').getScreenCTM(), fr = document.getElementById('boxFrame').getBoundingClientRect(); return { a: m.a, e: m.e + fr.left, f: m.f + fr.top, deck: HVACGrid.box.win.CAD_APP.st.activeDeck }; });
  await ribbon('설계 데이터 만들기').click(); await idle();
  assert.equal(await H(() => HVACGrid.box.calRooms), 94, 'CAL calculated again on S5');
  const ctmPlan = await H(() => { const m = document.getElementById('plan').getScreenCTM(); return { a: m.a, e: m.e, f: m.f, deck: HVACGrid.S.deck }; });
  assert.equal(ctmPlan.deck, ctmBox.deck, '③ opens on the deck BOX showed');
  assert.ok(Math.abs(ctmPlan.a - ctmBox.a) < 1e-6 && Math.abs(ctmPlan.e - ctmBox.e) < 0.5 && Math.abs(ctmPlan.f - ctmBox.f) < 0.5, `same scale and place ② ${JSON.stringify(ctmBox)} ③ ${JSON.stringify(ctmPlan)}`);
  log('② -> ③ same canvas', ctmPlan.deck, ctmPlan.a.toFixed(4));
  // the ① ② canvas itself is the background - BOX's lines, room labels, grid and origin axes - with the chosen deck alone
  // on it: S5's five decks lie at one place, BOX draws only the active deck's lines while it is the background
  const bg = await H(() => { const w = HVACGrid.box.win, st = w.CAD_APP.st, f = w.shownForRender || (() => true), d = HVACGrid.box.doc;
   return { frame: getComputedStyle(document.getElementById('boxFrame')).visibility, backdrop: d.documentElement.classList.contains('hg-bg'), ownLabels: document.querySelectorAll('#plan .lbl.no').length,
    rooms: document.querySelectorAll('#plan polygon.rm').length, deckRooms: HVACGrid.S.contract.rooms.filter(r => r.deckId === HVACGrid.S.deck).length, ownAxis: document.querySelectorAll('#plan .axis').length,
    grid: getComputedStyle(d.getElementById('gridRect')).display, boxAxis: d.getElementById('axis2d').childElementCount > 0,
    thisDeck: st.entities.filter(e => e.deck === st.activeDeck && f(e)).length, otherDecks: st.entities.filter(e => e.deck !== st.activeDeck && f(e)).length,
    otherShown: st.decks.filter(x => x.id !== st.activeDeck && x.visible !== false).length }; });
  assert.deepEqual([bg.frame, bg.backdrop, bg.rooms, bg.ownLabels, bg.ownAxis, bg.otherDecks], ['visible', true, bg.deckRooms, 0, 0, 0], JSON.stringify(bg));
  assert.ok(bg.grid !== 'none' && bg.boxAxis && bg.thisDeck > 0 && bg.otherShown > 0, 'BOX grid, axes, this deck; other decks still shown in BOX ' + JSON.stringify(bg));
  // the plan's own view: the wheel zooms about the cursor (BOX's canvas follows), a drag pans without selecting a room, a
  // double click fits the deck again
  const pr = await p.locator('#plan').boundingBox(), at = [pr.x + pr.width * 0.45, pr.y + pr.height * 0.5];
  const k0 = await H(() => HVACGrid.S.planShown.k);
  await p.mouse.move(...at); await p.mouse.wheel(0, -300); await p.waitForTimeout(300);
  const z = await H(() => HVACGrid.S.planView); assert.ok(z && z.k > k0 * 1.2, `wheel zooms in ${k0} -> ${z?.k}`);
  const zc = await H(() => { const m = document.getElementById('plan').getScreenCTM(), b = HVACGrid.box.doc.getElementById('svg').getScreenCTM(), fr = document.getElementById('boxFrame').getBoundingClientRect(); return [m.a, m.e, m.f, b.a, b.e + fr.left, b.f + fr.top]; });
  assert.ok(Math.abs(zc[0] - zc[3]) < 1e-6 && Math.abs(zc[1] - zc[4]) < 0.5 && Math.abs(zc[2] - zc[5]) < 0.5, 'BOX canvas follows the zoom ' + JSON.stringify(zc));
  const room0 = await H(() => HVACGrid.S.room);
  await p.mouse.move(...at); await p.mouse.down(); await p.mouse.move(at[0] - 120, at[1] - 60, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300);
  const pan = await H(() => ({ v: HVACGrid.S.planView, room: HVACGrid.S.room }));
  assert.ok(Math.abs(pan.v.minX - z.minX - 120 / z.k) < 1 && pan.v.k === z.k && pan.room === room0, 'drag pans, selects nothing ' + JSON.stringify(pan));
  await p.mouse.dblclick(...at); await p.waitForTimeout(300);
  assert.equal(await H(() => HVACGrid.S.planView), null, 'double click fits the deck');
  log('③ view: wheel zoom, pan, double click fit', (z.k / k0).toFixed(2));
  const c = await H(() => ({ step: HVACGrid.S.step, rooms: HVACGrid.S.contract?.rooms.length, plans: HVACGrid.plans().length, supply: HVACGrid.plans().filter(x => x.kind === 'supply').length }));
  log('contract', JSON.stringify(c));
  assert.equal(c.step, 'air'); assert.equal(c.rooms, 94); assert.equal(c.supply, 10); assert.equal(c.plans, 18);
  assert.deepEqual(await H(() => ['left', 'right'].map(id => getComputedStyle(document.getElementById(id)).display)), ['flex', 'flex'], '③: tree and inspector');
  // the contract made in the shell equals the one tools/box-extract.cjs wrote (same BOX, same example)
  const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'samples', 's5.contract.json'), 'utf8'));
  assert.deepEqual(await H(() => HVACGrid.S.contract.airflow), sample.airflow);
  await shot('3-air');
  // step 3: a unit location for S3 / AHU-AC-01 picked on the plan
  await p.locator('#tree .deckh', { hasText: '3DK' }).click();
  await p.selectOption('#sysSel', 'AHU-AC-01');
  await ribbon('위치 지정').click();
  const box = await p.locator('#plan').boundingBox();   // the middle of the deck strip (the corridor), clear of the legend
  const clickAt = { x: box.x + box.width * 0.36, y: box.y + box.height / 2 };
  const roomUnder = await p.evaluate(q => document.elementFromPoint(q.x, q.y)?.closest('[data-room]')?.dataset.room, clickAt);
  await p.mouse.click(clickAt.x, clickAt.y);
  assert.equal(await H(() => HVACGrid.plans().find(x => x.key === 'S3__AHU-AC-01').rootSource), 'user');
  // the plan is drawn as BOX draws it (y down the screen): the unit lands in the room that was clicked
  assert.ok(roomUnder, 'a room under the click');
  assert.ok(await p.evaluate(id => { const r = HVACGrid.S.contract.rooms.find(x => x.id === id), q = HVACGrid.S.contract.roots['S3__AHU-AC-01']; let c = false; for (let i = 0, j = r.polygon.length - 1; i < r.polygon.length; j = i++) { const a = r.polygon[i], b = r.polygon[j]; if ((a.y > q.y) !== (b.y > q.y) && q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }, roomUnder), 'unit inside the clicked room');
  log('unit location set in', roomUnder);
  await p.fill('#dT', '12'); await ribbon('적용').click();
  const sup12 = await H(() => HVACGrid.S.contract.systems.filter(s => s.kind === 'supply').reduce((t, s) => t + s.designCmh, 0));
  assert.ok(sup12 < 10420, 'dT 12 lowers supply'); log('dT 12 ->', sup12, 'CMH');
  await shot('3-air-root');
  // exhaust: EXH-ROOM serves 4 decks; its unit deck can be chosen, and the shell edit undone / redone
  await p.locator('.seg[data-seg="계통 종류"] button', { hasText: '배기' }).click();
  assert.equal(await H(() => HVACGrid.S.kind), 'exhaust');
  const before = await H(() => HVACGrid.plans().find(x => x.systemId === 'EXH-ROOM' && x.isUnitDeck).deckId);
  await p.selectOption('#unitSel', 'S5'); await idle();
  assert.equal(await H(() => HVACGrid.plans().find(x => x.systemId === 'EXH-ROOM' && x.isUnitDeck).deckId), 'S5');
  await p.click('#plan'); await p.keyboard.press('Control+z'); await idle();
  assert.equal(await H(() => HVACGrid.plans().find(x => x.systemId === 'EXH-ROOM' && x.isUnitDeck).deckId), before, 'undo');
  await p.keyboard.press('Control+y'); await idle();
  assert.equal(await H(() => HVACGrid.plans().find(x => x.systemId === 'EXH-ROOM' && x.isUnitDeck).deckId), 'S5', 'redo');
  log('exhaust unit deck', before, '-> S5, undo / redo ok'); await shot('3-air-exhaust');
  await p.locator('.seg[data-seg="평면 보기"] button', { hasText: '방화' }).click(); await p.waitForTimeout(200);
  assert.ok(await p.locator('#plan line.fb').count() > 0, 'fire boundaries drawn'); await shot('3-air-fire');
  await p.locator('.seg[data-seg="평면 보기"] button', { hasText: '풍량' }).click();
  await p.locator('.seg[data-seg="계통 종류"] button', { hasText: '급기' }).click();
  // step 4: PHG D with the BOX rooms, the user's unit location and the RUs, then AUTO
  // ④ is the shared HVAC Grid plan (PHG D computes in the background)
  await p.click('.step[data-step=duct]'); await idle();
  assert.ok(await p.isVisible('#plan') && !(await p.evaluate(() => getComputedStyle(document.getElementById('phgFrame')).visibility === 'visible')), '④ shows the plan');
  await p.selectOption('#sysSel', 'AHU-AC-01');
  await ribbon('보내기 + AUTO').click(); await idle();
  assert.equal(await H(() => getComputedStyle(HVACGrid.phg.doc.querySelector('header.topbar')).display), 'none');
  // the ducts on the plan; one picked shows its size and flow
  assert.ok(await p.locator('#plan polyline.duct.pick').count() > 0, 'ducts on the shared plan');
  await p.locator('#plan polyline.duct.pick').first().click({ force: true }); await p.waitForTimeout(200);
  assert.match(await p.textContent('#inspTitle'), /^덕트/); await shot('4-duct-picked');
  // stage 2 on the plan: a duct's size by hand (PHG D keeps it and calculates again)
  const di = await H(() => HVACGrid.S.geometry['S3__AHU-AC-01'].ducts.findIndex(d => d.type === 'main')), d0 = await p.evaluate(i => HVACGrid.S.geometry['S3__AHU-AC-01'].ducts[i], di);
  await p.evaluate(([i, w, h]) => HVACGrid.resizeDuct('S3__AHU-AC-01', i, { widthMm: w, heightMm: h }), [di, d0.widthMm + 100, d0.heightMm]); await idle();
  const d1 = await H(() => HVACGrid.S.geometry['S3__AHU-AC-01'].ducts[HVACGrid.S.duct.i]);   // the same duct, picked again after PHG D calculated
  assert.deepEqual([d1.widthMm, d1.heightMm, d1.manualSize], [d0.widthMm + 100, d0.heightMm, true]); assert.ok(await H(() => HVACGrid.result('S3__AHU-AC-01').edited));
  // an RU dragged with the mouse stays where it was dropped; AUTO is the user's to run (2026-10-26): the network says
  // "다시 AUTO" until the banner's button runs it. Ctrl+Z takes the move back with the ducts AUTO made then (the plan
  // shows the network of before, not new ducts under the RU that went back), Ctrl+Y again
  const net = () => H(() => JSON.stringify(HVACGrid.S.geometry['S3__AHU-AC-01']));
  const netResized = await net();
  const ru = await p.$('#plan .ru.drag'), rb = await ru.boundingBox(), ruId = await ru.getAttribute('data-ru');
  await p.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await p.mouse.down(); await p.mouse.move(rb.x + rb.width / 2 + 6, rb.y + rb.height / 2 + 6, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(300); await idle();
  assert.ok(await p.evaluate(id => !!HVACGrid.S.contract.ruMoves?.[id], ruId), 'RU moved');
  assert.ok(await H(() => HVACGrid.result('S3__AHU-AC-01').stale), 'no AUTO by itself: the network is of before the move'); assert.equal(await net(), netResized);
  assert.ok(await p.isVisible('#staleBanner'), '"다시 AUTO" on the canvas');
  await p.locator('#staleBanner button').click(); await idle();
  assert.ok(!(await H(() => HVACGrid.result('S3__AHU-AC-01').stale)), 'AUTO run by the user');
  const netMoved = await net(); assert.notEqual(netMoved, netResized, 'the move made other ducts');
  // the size set by hand is kept by the new AUTO (on the duct of the same name)
  const kept = await p.evaluate(n => HVACGrid.S.geometry['S3__AHU-AC-01'].ducts.find(d => d.displayName === n), d0.displayName);
  assert.deepEqual([kept?.widthMm, kept?.heightMm, kept?.manualSize], [d0.widthMm + 100, d0.heightMm, true], 'manual size kept by AUTO'); assert.match(await H(() => HVACGrid.S.msg), /수동 크기 1개 유지/);
  await p.keyboard.press('Control+z'); await idle();
  assert.ok(await p.evaluate(id => !HVACGrid.S.contract.ruMoves?.[id], ruId), 'Ctrl+Z takes the RU move back (not PHG D)');
  assert.equal(await net(), netResized, 'Ctrl+Z puts the ducts of before back'); assert.ok(!(await H(() => HVACGrid.result('S3__AHU-AC-01').stale)), 'and they are current');
  await p.keyboard.press('Control+y'); await idle();
  assert.ok(await p.evaluate(id => !!HVACGrid.S.contract.ruMoves?.[id], ruId)); assert.equal(await net(), netMoved, 'Ctrl+Y: the moved RU and its ducts');
  await p.keyboard.press('Control+z'); await idle();
  // the duct size by hand is in the history too
  await p.keyboard.press('Control+z'); await idle();
  const d2 = await p.evaluate(i => HVACGrid.S.geometry['S3__AHU-AC-01'].ducts[i], di);
  assert.deepEqual([d2.widthMm, d2.heightMm, !!d2.manualSize], [d0.widthMm, d0.heightMm, !!d0.manualSize], 'Ctrl+Z: the size of before'); log('undo / redo: RU move and duct size with their ducts');
  // PHG D as the detail editor, and back
  await ribbon('PHG D 편집기').click(); await idle();
  assert.ok(await p.evaluate(() => getComputedStyle(document.getElementById('phgFrame')).visibility === 'visible'), 'editor open'); await shot('4-duct-editor');
  // the PHG D editor shows the deck the way round ① - ④ do: PHG D got the drawing as drawn, its app y is BOX y (the deck
  // showed upside down, 2026-10-25); the stored network keeps its y (-BOX y)
  const way = await H(() => { const st = HVACGrid.phg.win.LineDesignLegacy.getState(), r = st.nodes.find(n => n.type === 'root'), pl = HVACGrid.plans().find(x => x.key === 'S3__AHU-AC-01');
   return { phg: [r.x, r.y], plan: [pl.root.x, pl.root.y], stored: [HVACGrid.S.geometry['S3__AHU-AC-01'].root.x, HVACGrid.S.geometry['S3__AHU-AC-01'].root.y], yBox: HVACGrid.phg.yBox() }; });
  assert.deepEqual([way.phg, way.stored, way.yBox], [way.plan, [way.plan[0], -way.plan[1]], true], 'PHG D the way round the plan is ' + JSON.stringify(way));
  await ribbon('평면으로').click(); await idle();
  assert.ok(await p.isVisible('#plan'), 'back on the plan');
  const r = await H(() => HVACGrid.result('S3__AHU-AC-01'));
  log('AUTO', JSON.stringify({ rus: r.rus, flow: r.flowCmh, ducts: r.ducts, len: r.lengthM, pa: r.indexPa }));
  assert.ok(r.auto && r.ducts > 0 && r.unconnected === 0, 'AUTO connected every RU'); assert.equal(r.flowCmh, r.designCmh);
  assert.ok(await H(() => HVACGrid.S.geometry['S3__AHU-AC-01'].ducts.every(d => d.widthMm > 0 || d.diameterMm > 0)), 'duct sizes read back');
  await p.locator('#tree .room', { hasText: '선원침실 01' }).click(); await p.waitForTimeout(300);
  await shot('4-duct');
  // an exhaust deck of EXH-ROOM (its Root runs the PHG D pressure calculation in exhaust mode)
  await H(() => HVACGrid.runAll(['S3__EXH-ROOM'])); await idle();
  assert.equal(await H(() => JSON.parse(HVACGrid.S.projects['S3__EXH-ROOM']).network.nodes.find(n => n.type === 'root').pressureFlowMode), 'exhaust');
  // step 5: the second S3 supply system too, then the review tabs
  await p.click('.step[data-step=review]'); await idle();
  await H(() => HVACGrid.runAll(['S3__AHU-AC-02'])); await idle();
  // 모든 계통 AUTO is one undo entry: Ctrl+Z takes the network it made back
  assert.match(await H(() => HVACGrid.S.undo.at(-1).label), /AUTO \(1개\)/);
  await H(() => HVACGrid.undo()); await idle(); assert.ok(!(await H(() => HVACGrid.result('S3__AHU-AC-02')?.auto)), 'undo AUTO');
  await H(() => HVACGrid.redo()); await idle(); assert.ok(await H(() => HVACGrid.result('S3__AHU-AC-02')?.auto), 'redo AUTO'); log('모든 계통 AUTO undo / redo');
  const rows = await p.locator('#report tbody tr[data-key]').count(), ok = await p.locator('#report td.ok').count();
  log('review rows', rows, 'AUTO done', ok); assert.equal(rows, 18); assert.ok(ok >= 3);
  await shot('5-review');
  await p.locator('#report .tabs button', { hasText: '계통·수직' }).click(); assert.ok(await p.locator('#report table').count() >= 2); await shot('5-review-systems');
  // 계통도: one diagram per system; the AUTO-done S3 supply system shows its network numbers; a deck box opens ④
  await p.locator('#report .tabs button', { hasText: '계통도' }).click();
  const dia = await H(() => ({ n: document.querySelectorAll('#report svg.sysdia').length, systems: HVACGrid.analysis().systems.length, ac1: [...document.querySelectorAll('#report svg.sysdia[data-key="AHU-AC-01"] text')].map(t => t.textContent).join(' | ') }));
  assert.equal(dia.n, dia.systems); assert.match(dia.ac1, /덕트 \d+개 · [\d.]+ m · Deck [\d.]+ Pa/); await shot('5-review-diagram');
  await p.locator('#report svg.sysdia[data-key="AHU-AC-01"] .deckbox').first().dblclick(); await idle();
  assert.deepEqual(await H(() => [HVACGrid.S.step, HVACGrid.S.sys]), ['duct', 'AHU-AC-01']); log('계통도', dia.n, 'systems; deck box -> ④');
  await p.click('.step[data-step=review]'); await idle();
  await p.locator('#report .tabs button', { hasText: '방화 (SOLAS)' }).click();
  const unc = await H(() => HVACGrid.analysis().solas.summary.unclassified.length);
  const first = p.locator('#report select[data-solas]').first(); await first.selectOption('전기설비실'); await idle();
  assert.equal(await H(() => HVACGrid.analysis().solas.summary.unclassified.length), unc - 1, 'SOLAS space assigned');
  await shot('5-review-fire'); log('SOLAS unclassified', unc, '->', unc - 1);
  // outputs as real downloads
  const fProject = await download('프로젝트 저장', 'shell.project.json'), fXlsx = await download('통합 XLSX', 'shell.xlsx'), fDxf = await download('통합 DXF', 'shell.dxf'), fHtml = await download('보고서', 'shell.report.html');
  const saved = JSON.parse(fs.readFileSync(fProject, 'utf8'));
  assert.equal(saved.schema, 'hvac-grid-project/1'); assert.equal(Object.keys(saved.projects).length, 3);
  assert.equal(Object.keys(saved.contract.solas.rooms).length, 1);
  const wb = readWorkbook(fs.readFileSync(fXlsx)); assert.equal(wb['격실'].length, 95); assert.ok(wb['관통 목록'].length > 1);
  assert.equal(X.rooms(fs.readFileSync(fDxf, 'utf8'), { roomLayers: /^ROOM$/ }).length, 94);
  assert.match(fs.readFileSync(fHtml, 'utf8'), /HVAC Grid 설계 보고서/);
  log('downloads', [fProject, fXlsx, fDxf, fHtml].map(f => path.basename(f) + ' ' + fs.statSync(f).size).join(' · '));
  await p.setViewportSize({ width: 1280, height: 800 }); await p.click('.step[data-step=duct]'); await idle(); await p.waitForTimeout(400); await shot('4-duct-1280');
  await p.click('.step[data-step=air]'); await idle(); await H(() => { document.documentElement.dataset.theme = 'dark'; HVACGrid.render(); }); await p.waitForTimeout(200); await shot('3-air-dark');
  // 새로 시작 (header ⟲): asks in the app, then BOX, the design data, the duct networks and the history are gone
  await p.click('#resetBtn'); await p.locator('#dlgBtns button[data-v=ok], #dlgBtns button[data-v=discard]').first().click(); await idle();
  const fresh = await H(() => ({ step: HVACGrid.S.step, contract: HVACGrid.S.contract, results: Object.keys(HVACGrid.S.results).length, undo: HVACGrid.S.undo.length, drawing: HVACGrid.box.hasDrawing(), cal: HVACGrid.box.doc.getElementById('calEnhancePanel')?.hidden ?? true }));
  assert.deepEqual(fresh, { step: 'room', contract: null, results: 0, undo: 0, drawing: false, cal: true }, '새로 시작'); log('새로 시작', JSON.stringify(fresh));
  assert.deepEqual(await H(() => [HVACGrid.box.doc.documentElement.classList.contains('hg-bg'), typeof HVACGrid.box.win.shownForRender]), [false, 'undefined'], '① is BOX again, every shown deck, not a background');
  await ribbon('S5 예제').click(); await p.waitForFunction(() => HVACGrid.box.win.CAD_APP.st.decks.length === 5, null, { timeout: 180000 });
  await p.click('.step[data-step=load]'); await idle(); await ribbon('설계 데이터 만들기').click(); await idle();
  assert.equal(await H(() => HVACGrid.S.contract.rooms.length), 94, 'works again after 새로 시작');
  // a command that applies values opens no window: what CAL says shows on the status line
  await p.click('.step[data-step=load]'); await idle(); await ribbon('ISO 적용').click(); await idle();
  assert.match(await H(() => HVACGrid.S.msg), /^ISO 적용: 계산 조건 반영 완료/); log('ISO 적용 ->', await H(() => HVACGrid.S.msg));
  log('page errors', errors.length, errors.slice(0, 5));
  assert.equal(errors.length, 0, 'no page errors');
  log('E2E PASS');
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
