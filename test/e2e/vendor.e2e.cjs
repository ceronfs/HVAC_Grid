// End-to-end: the patches in the vendor copy of BOX (vendor/VERSIONS.json "patches", docs/VENDOR_PATCHES.md), on BOX's own
// controls - not through the shell, which has its own guards for both.
//   A  a DXF room text with a letter (211T) is the room's number, not part of its name
//   B  CAL left open on one drawing loads again when BOX's CAL button is pressed on the next
'use strict';
const path = require('path'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs');

// two rooms drawn with LINEs only, numbered by TEXT: 211T (a cabin toilet) and 212
const dxf = () => {
 const L = (x1, y1, x2, y2) => ['0', 'LINE', '8', 'ROOM', '10', x1, '20', y1, '30', 0, '11', x2, '21', y2, '31', 0];
 const T = (x, y, s) => ['0', 'TEXT', '8', 'ROOM_NO', '10', x, '20', y, '30', 0, '40', 180, '1', s];
 return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1021', '9', '$INSUNITS', '70', 4, '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
  ...L(0, 0, 6000, 0), ...L(6000, 0, 6000, 3000), ...L(6000, 3000, 0, 3000), ...L(0, 3000, 0, 0), ...L(2000, 0, 2000, 3000),
  ...T(300, 2500, '211T'), ...T(300, 2100, '선원침실 화장실'), ...T(2300, 2500, '212'), ...T(2300, 2100, '선원침실'),
  '0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n';
};

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a), H = (f, a) => p.evaluate(f, a);
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });

  // A
  await H(t => HVACGrid.box.setFile('dxfFile', new File([t], 'patch-a.dxf', { type: 'application/dxf' })), dxf());
  await p.waitForFunction(() => HVACGrid.box.hasDrawing(), null, { timeout: 60000 }); await p.waitForTimeout(1500);
  const rooms = await H(() => HVACGrid.box.win.CAD_APP.rooms().map(r => [r.no, r.name]).sort());
  assert.deepEqual(rooms, [['211T', '선원침실 화장실'], ['212', '선원침실']], 'patch A: 211T is a room number');
  log('A rooms', JSON.stringify(rooms));

  // B: BOX's own CAL button, its panel left open (the shell keeps it out of sight; BOX still has it open)
  const calButton = async () => { await H(() => HVACGrid.box.click('calEnhanceBtn')); await p.waitForTimeout(300); await p.waitForFunction(() => HVACGrid.box.calIdle(), null, { timeout: 180000 }); return H(() => HVACGrid.box.calStatus()); };
  await H(() => HVACGrid.box.click('s5ExampleBtn')); await p.waitForFunction(() => HVACGrid.box.win.CAD_APP.st.decks.length === 5, null, { timeout: 180000 }); await p.waitForTimeout(800);
  assert.match(await calButton(), /^현재 격실 94개/); log('B CAL on S5');
  assert.equal(await H(() => HVACGrid.box.doc.getElementById('calEnhancePanel').hidden), false, 'the panel stays open');
  await H(() => HVACGrid.box.click('h5ExampleBtn')); await p.waitForFunction(() => HVACGrid.box.win.CAD_APP.st.decks.length !== 5, null, { timeout: 180000 }); await p.waitForTimeout(800);
  assert.match(await calButton(), /^현재 격실 7개/, 'patch B: CAL loads the new drawing'); log('B CAL again on H5');
  // an unchanged drawing keeps the open panel (no reload)
  await H(() => { HVACGrid.box.doc.querySelector('#calEnhancePanel [role=status]').dataset.mark = '1'; });
  await calButton();
  assert.equal(await H(() => HVACGrid.box.doc.querySelector('#calEnhancePanel [role=status]').dataset.mark), '1', 'same drawing: kept');

  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E VENDOR PASS');
 } catch (e) { console.error('E2E VENDOR FAIL', e); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
