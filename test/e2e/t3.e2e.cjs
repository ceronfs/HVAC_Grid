// End-to-end over the T3 test ship (samples/t3): the BOX project made by tools/make-test-ship.cjs opens in BOX, BOX
// computes the loads, the shell makes the contract, the duct trunks get their SOLAS space in the review tab, every deck
// and system (supply / exhaust / return, 15 PHG D projects) runs AUTO, the project is saved and opened again, and the
// test drawings (T3_D*.dxf) import into PHG D and BOX. Screenshots: out/e2e-t3/.   npm run test:e2e
'use strict';
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs');
const ROOT = path.join(__dirname, '..', '..'), OUT = path.join(ROOT, 'out', 'e2e-t3');

(async () => {
 fs.mkdirSync(OUT, { recursive: true });
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 }, acceptDownloads: true }), errors = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); }); p.on('dialog', d => d.accept());
 const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);
 const ribbon = label => p.locator('#ribbon .cmd', { hasText: label }).first();
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 600000 });
 const H = (f, a) => p.evaluate(f, a);
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  // ① the test ship's BOX project, ② BOX CAL loads -> contract
  await ribbon('T3 시험선').click();
  await p.waitForFunction(() => HVACGrid.box.hasDrawing() && HVACGrid.box.win.CAD_APP.stack.decks.length === 4, null, { timeout: 180000 }); await p.waitForTimeout(800);
  await shot('1-room-t3'); log('T3 in BOX');
  await p.click('.step[data-step=load]'); await idle(); await ribbon('계약 만들기').click(); await idle();
  const c = await H(() => ({ rooms: HVACGrid.S.contract.rooms.length, plans: HVACGrid.plans().length, multi: [...new Set(HVACGrid.plans().filter(x => x.decks > 1).map(x => x.systemId))].sort() }));
  log('contract', JSON.stringify(c));
  assert.equal(c.rooms, 73); assert.equal(c.plans, 15); assert.deepEqual(c.multi, ['AHU-ACC', 'EF-SAN', 'RA-ACC']);
  const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 't3.contract.json'), 'utf8'));
  assert.deepEqual(await H(() => HVACGrid.S.contract.airflow), sample.airflow, 'same airflow as samples/t3.contract.json');
  await H(() => { HVACGrid.S.deck = 'D2'; HVACGrid.render(); }); await p.waitForTimeout(200); await shot('3-air-D2');
  // ⑤ 방화: the three duct trunks are not in the SOLAS dictionary - assign them in the review tab
  await p.click('.step[data-step=review]'); await idle();
  await p.locator('#report .tabs button', { hasText: '방화' }).click();
  for (let i = 0; i < 3; i++) { await p.locator('#report select[data-solas]').first().selectOption('환기·공조 기계실'); await idle(); }
  assert.equal(await H(() => HVACGrid.analysis().solas.summary.unclassified.length), 0, 'all rooms classified');
  // every deck and system: AUTO
  const ta = Date.now(); await ribbon('모든 계통 AUTO').click(); await idle();
  const a = await H(() => { const a = HVACGrid.analysis(); return { done: a.done, total: a.total, bad: a.checks.filter(k => !k.ok).map(k => k.text), pens: a.solas.summary.penetrations, fd: a.solas.summary.fireDampers, acc: a.systems.find(s => s.systemKey === 'AHU-ACC') }; });
  log(`AUTO ${a.done}/${a.total} in ${((Date.now() - ta) / 1000).toFixed(0)} s · penetrations ${a.pens} · fire dampers ${a.fd} · AHU-ACC index ${a.acc.indexPa} Pa (${a.acc.indexDeckId})`);
  assert.equal(a.done, 15); assert.deepEqual(a.bad, []); assert.ok(a.pens > 50); assert.ok(a.fd > 0); assert.ok(a.acc.complete && a.acc.indexPa > 0);
  await shot('5-review-nets');
  await p.locator('#report .tabs button', { hasText: '계통' }).click(); await shot('5-review-systems');
  await p.locator('#report .tabs button', { hasText: '방화' }).click(); await shot('5-review-fire');
  await p.click('.step[data-step=air]'); await idle(); await p.locator('.seg[data-seg="평면 보기"] button', { hasText: '방화' }).click(); await H(() => { HVACGrid.S.deck = 'D1'; HVACGrid.render(); }); await p.waitForTimeout(200); await shot('3-air-fire-D1');
  await p.locator('.seg[data-seg="평면 보기"] button', { hasText: '풍량' }).click(); await H(() => { HVACGrid.S.deck = 'D2'; HVACGrid.render(); }); await p.waitForTimeout(200); await shot('3-air-ducts-D2');
  // save, start over, open the saved project: the same results without running anything
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#saveProjectBtn')]); const file = path.join(OUT, 't3.project.json'); await d.saveAs(file);
  await H(() => HVACGrid.openSample('s5'));
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#openProjectBtn')]); await chooser.setFiles(file); await idle();
  const back = await H(() => { const a = HVACGrid.analysis(); return { rooms: HVACGrid.S.contract.rooms.length, done: a.done, solas: Object.keys(HVACGrid.S.contract.solas.rooms).length, pens: a.solas.summary.penetrations }; });
  assert.deepEqual(back, { rooms: 73, done: 15, solas: 3, pens: a.pens }); log('project round trip', JSON.stringify(back));
  // the saved PHG D project opens in PHG D as it was
  await p.click('.step[data-step=duct]'); await idle();
  await H(() => { HVACGrid.S.deck = 'D3'; HVACGrid.S.sys = 'AHU-ACC'; HVACGrid.S.kind = 'supply'; HVACGrid.render(); return HVACGrid.go('duct'); }); await idle();
  const reopened = await H(() => HVACGrid.phg.result()); assert.equal(reopened.ducts, (await H(() => HVACGrid.result('D3__AHU-ACC'))).ducts); await shot('4-duct-D3');
  // the test drawings import into PHG D (rooms found by its own room finder) and BOX
  const dxf = fs.readFileSync(path.join(ROOT, 'samples', 't3', 'T3_D2.dxf'), 'utf8');
  const phgRooms = await H(async text => {
   const P = HVACGrid.phg; P.open(P.blank, 'T3_D2'); P.setFile('fileInput', new File([text], 'T3_D2.dxf', { type: 'application/dxf' }));
   const dlg = await HVACGridBridge.until(() => { const x = P.doc.getElementById('dxfImportOptionsDialog'); return x?.open && x; }, 30000); dlg.querySelector('button[type=submit]').click();
   await HVACGridBridge.until(() => !dlg.open && P.win.LineDesignLegacy.getState().entities.length > 0, 60000);
   const st = P.win.LineDesignLegacy.getState(), idx = P.win.PHGDRooms.index(st.entities);
   const at = (x, y) => { const r = idx.roomAt({ x, y: -y }); return r ? idx.namesOf(r).join(' ') : null; };
   return { entities: st.entities.length, cabin: at(5500, 2500), wc: at(4800, 6000), corridor: at(12000, 8000) };
  }, dxf);
  log('PHG D import T3_D2.dxf', JSON.stringify(phgRooms));
  assert.ok(phgRooms.entities >= 26); assert.match(phgRooms.cabin, /211/); assert.match(phgRooms.wc, /211T/); assert.match(phgRooms.corridor, /202/);
  await shot('4-duct-dxf-import');
  await p.click('.step[data-step=room]'); await idle();
  const boxEnt = await H(async text => { const X = HVACGrid.box; X.setFile('dxfFile', new File([text], 'T3_D2.dxf', { type: 'application/dxf' }));
   await HVACGridBridge.until(() => X.win.CAD_APP.st.entities.some(e => /T3_D2/.test(e.deckId || e.deck || '') || e.layer === 'ROOM_NO'), 60000).catch(() => null);
   return { entities: X.win.CAD_APP.st.entities.length, texts: X.win.CAD_APP.st.entities.filter(e => /TEXT/.test(e.type) || e.text).length }; }, dxf);
  log('BOX import T3_D2.dxf', JSON.stringify(boxEnt)); assert.ok(boxEnt.entities > 26);
  await shot('1-room-dxf-import');
  log('page errors', errors.length, errors.slice(0, 5));
  assert.equal(errors.length, 0, 'no page errors');
  log('E2E T3 PASS');
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E T3 FAIL', e); process.exit(1); });
