// End-to-end: one undo across HVAC Grid, BOX and PHG D - Ctrl+Z takes back the newest edit whichever app made it, on that
// app's screen (an edit in BOX from ③: back to ①), Ctrl+Y does it again; PHG D editor edits are its own entries while it
// is open, then one HVAC Grid entry once read back.
//   node test/e2e/undo-all.e2e.cjs
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), G = require('../../tools/v1-golden.cjs');

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const H = (f, a) => p.evaluate(f, a), idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 const poll = () => p.waitForTimeout(700);   // the timeline sees BOX's and PHG D's own edits within half a second
 const key = async k => { await p.locator('#status').click({ position: { x: 5, y: 5 } }).catch(() => {}); await p.keyboard.press(k); await idle(); };
 const dT = () => H(() => HVACGrid.S.contract.rules.supplyDeltaTK), ents = () => H(() => HVACGrid.box.win.CAD_APP.st.entities.length);
 try {
  await p.goto(s.url + '/app/'); await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  await H(async t => { const w = HVACGrid.box.win, ask = w.confirm; w.confirm = () => true; try { HVACGrid.box.setFile('jsonFile', new File([t], 'T3.box.json', { type: 'application/json' })); } finally { w.confirm = ask; } }, fs.readFileSync(path.join(__dirname, '..', '..', 'samples', 't3', 'T3.box.json'), 'utf8'));
  await p.waitForFunction(() => { try { return HVACGrid.box.win.CAD_APP.rooms().length === 79; } catch { return false; } }, null, { timeout: 180000 });
  await H(d => HVACGrid.loadProject(d, 'T3'), G.read(path.join(G.FIXTURES, 't3'), 'project')); await idle();
  // ③: an HVAC Grid edit (ΔT 10 → 11)
  await p.click('.step[data-step=air]'); await idle(); const t0 = await dT();
  await H(v => { document.getElementById('dT').value = v; }, t0 + 1); await p.locator('#ribbon button:has(span:text-is("적용"))').first().click(); await idle();
  assert.equal(await dT(), t0 + 1);
  // ①: a BOX edit (a line deleted with BOX's own command)
  await p.click('.step[data-step=room]'); await idle(); const n0 = await ents();
  await H(() => { const A = HVACGrid.box.win.CAD_APP, e = A.st.entities.find(x => x.deck === A.st.activeDeck && x.type === 'LINE') || A.st.entities[0]; A.st.selected.clear(); A.st.selected.add(e.id); HVACGrid.box.click('deleteBtn'); });
  await poll(); assert.equal(await ents(), n0 - 1);
  assert.match(await H(() => document.getElementById('undoBtn').title), /BOX/, 'the button names BOX\'s edit');
  // back in ③: Ctrl+Z takes back BOX's edit, on BOX's screen; then HVAC Grid's, on the plan
  await p.click('.step[data-step=air]'); await idle();
  await key('Control+z'); assert.deepEqual([await H(() => HVACGrid.S.step), await ents(), await dT()], ['room', n0, t0 + 1], 'BOX\'s edit back, in ①');
  await key('Control+z'); assert.deepEqual([await H(() => HVACGrid.S.step), await dT()], ['air', t0], 'HVAC Grid\'s edit back, in ③');
  await key('Control+y'); assert.equal(await dT(), t0 + 1, 'redo HVAC Grid');
  await key('Control+y'); assert.deepEqual([await H(() => HVACGrid.S.step), await ents()], ['room', n0 - 1], 'redo BOX, in ①');
  // a new edit after an undo clears what could be done again
  await key('Control+z'); await p.click('.step[data-step=air]'); await idle();
  await H(v => { document.getElementById('dT').value = v; }, t0 + 2); await p.locator('#ribbon button:has(span:text-is("적용"))').first().click(); await idle();
  assert.equal(await H(() => document.getElementById('redoBtn').disabled), true, 'nothing to redo after a new edit');
  // ④ PHG D editor: its own edit is an entry while it is open (Ctrl+Z inside the editor's frame too)
  const k = await H(() => { const pl = HVACGrid.plans().find(p => p.kind === 'supply' && HVACGrid.S.geometry[p.key]?.ducts?.some(d => d.type === 'branch')); const S = HVACGrid.S; S.deck = pl.deckId; S.kind = pl.kind; S.sys = pl.systemKey; return pl.key; });
  await p.click('.step[data-step=duct]'); await idle(); await H(x => HVACGrid.runAll([x]), k); await idle();
  await H(() => HVACGrid.openEditor()); await idle();
  const id = await H(() => { const st = HVACGrid.phg.win.LineDesignLegacy.getState(), d = st.ducts.find(x => x.type === 'branch'); st.selectedDuctIds.clear(); st.selectedDuctIds.add(d.id); HVACGrid.phg.click('assignMainLineBtn'); st.selectedDuctIds.clear(); return d.id; });
  const type = () => H(i => HVACGrid.phg.win.LineDesignLegacy.getState().ducts.find(d => d.id === i)?.type, id);
  await poll(); assert.equal(await type(), 'main'); assert.match(await H(() => document.getElementById('undoBtn').title), /PHG D/);
  await p.locator('#phgFrame').click({ position: { x: 700, y: 400 } }).catch(() => {}); await p.keyboard.press('Control+z'); await idle();
  assert.equal(await type(), 'branch', 'Ctrl+Z in the editor takes back PHG D\'s edit');
  await key('Control+y'); assert.equal(await type(), 'main', 'and Ctrl+Y does it again');
  // read back: one HVAC Grid entry for the editor's work; Ctrl+Z puts the network back as it was
  await H(() => HVACGrid.closeEditor()); await idle();
  const rb = await H(([x, i]) => ({ label: HVACGrid.S.undo.at(-1)?.label, phg: (HVACGrid.S.tl || []).filter(e => e.app === 'phg').length, type: HVACGrid.S.geometry[x].ducts.find(d => d.id === i)?.type }), [k, id]);
  assert.ok(/PHG D 편집/.test(rb.label) && rb.phg === 0 && rb.type === 'main', JSON.stringify(rb));
  await key('Control+z'); assert.equal(await H(([x, i]) => HVACGrid.S.geometry[x].ducts.find(d => d.id === i)?.type, [k, id]), 'branch', 'the editor\'s work taken back as one');
  assert.deepEqual(errors, []);
  console.log('E2E UNDO-ALL PASS');
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E UNDO-ALL FAIL', e); process.exit(1); });
