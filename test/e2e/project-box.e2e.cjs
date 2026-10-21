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
  // the examples one after the other: S5 (94 rooms) then T3 (79) - the design data is T3's, not made from S5's drawing
  // while BOX replaces it (an "at least 79 rooms" wait passed at once over S5)
  for (const [name, n] of [['s5', 94], ['t3', 79]]) {
   await H(x => { HVACGrid.S.dirty = false; return HVACGrid.openSample(x); }, name); await idle();
   const got = await H(() => ({ rooms: HVACGrid.S.contract.rooms.length, decks: HVACGrid.S.contract.decks.length, box: HVACGrid.box.roomIds().length }));
   assert.deepEqual(got, { rooms: n, decks: name === 's5' ? 5 : 4, box: n }, name);
  }
  log('examples S5 then T3');
  // (review 2026-10-21 G-2) a project file that is not JSON: its name and the reason in Korean; a BOM is no reason
  const bad = await H(() => { try { HVACGrid.parseJson('{ not json', 'broken.json'); return null; } catch (e) { return e.message; } });
  assert.match(bad, /^broken\.json: JSON 형식이 아닙니다/); assert.deepEqual(await H(() => HVACGrid.parseJson('﻿{"a":1}', 'bom.json')), { a: 1 });
  // (G-3) made again from BOX with a SOLAS choice whose room and one whose wall are not in the drawing: said on the status
  // line and on the 검토 tab, the choices kept
  await H(() => { const s = HVACGrid.S.contract.solas || (HVACGrid.S.contract.solas = {}); s.rooms = { ...(s.rooms || {}), GONE_ROOM: { space: '로커·창고 — 4㎡ 초과' } }; s.bounds = { ...(s.bounds || {}), 'B:x|y|1,2': { grade: 'A-0' } }; });
  await H(() => HVACGrid.extractContract()); await idle();
  const g3 = await H(() => ({ status: document.getElementById('status')?.textContent || '', check: HVACGrid.analysis().checks.find(k => k.id === 'solasStale')?.text || '', kept: !!HVACGrid.S.contract.solas.bounds['B:x|y|1,2'] }));
  log('G-3', g3.status.slice(-80)); assert.match(g3.status, /SOLAS 지정 2건이 새 도면과 맞지 않음\(실 1 · 경계 1\)/); assert.match(g3.check, /실 분류 1 · 벽·갑판 등급 1/); assert.ok(g3.kept);
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E PROJECT-BOX PASS');
 } catch (e) { console.error('E2E PROJECT-BOX FAIL', e); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
