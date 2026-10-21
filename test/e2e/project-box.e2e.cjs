// End-to-end: a project file carries BOX's own drawing (review 2026-10-21 F05). T3 opened, the project taken as the
// app saves it (BOX's "Save JSON" inside), another drawing in BOX (S5), then the saved project: BOX shows T3 again,
// the design data is T3's and the status line says both opened.
'use strict';
const path = require('path'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs');

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a), H = (f, a) => p.evaluate(f, a);
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  await H(() => HVACGrid.openSample('t3')); await idle();
  const text = await H(() => HVACGrid.projectJson()), d = JSON.parse(text), ids = new Set(d.contract.rooms.map(r => r.id));
  assert.ok(d.box && d.box.json.length > 100000, 'the project carries the BOX drawing');
  assert.equal(d.box.roomIds.length, 79); assert.ok(d.box.roomIds.every(id => ids.has(id)), 'the drawing the design data was made from');
  log('saved', text.length, 'bytes, BOX', d.box.json.length);
  await H(() => { HVACGrid.S.dirty = false; return HVACGrid.openSample('s5'); }); await idle();
  assert.equal((await H(() => HVACGrid.box.roomIds())).length, 94);
  await H(() => { HVACGrid.S.dirty = false; });
  await H(t => HVACGrid.loadProject(JSON.parse(t), 'project-box.json'), text); await idle();
  const back = await H(() => ({ boxRooms: HVACGrid.box.roomIds(), rooms: HVACGrid.S.contract.rooms.length, carried: !!HVACGrid.S.boxFile, status: document.getElementById('status')?.textContent || '' }));
  assert.equal(back.rooms, 79); assert.equal(back.boxRooms.length, 79); assert.ok(back.boxRooms.every(id => ids.has(id)), 'BOX shows T3 again');
  assert.ok(back.carried); assert.match(back.status, /BOX 도면\(①②\)도 열림/);
  log('reopened: BOX', back.boxRooms.length, 'rooms');
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E PROJECT-BOX PASS');
 } catch (e) { console.error('E2E PROJECT-BOX FAIL', e); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
