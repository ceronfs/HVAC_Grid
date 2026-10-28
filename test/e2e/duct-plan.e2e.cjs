// End-to-end: ④ on the plan with less of the PHG D editor - the rooms AUTO keeps out of (forbidden zones) and the
// velocity along the ducts as layers, a duct's type changed from the plan (PHG D calculates again, undo puts it back),
// and the editor opening on the part of the deck the plan shows.
//   node test/e2e/duct-plan.e2e.cjs
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), G = require('../../tools/v1-golden.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const H = (f, a) => p.evaluate(f, a), idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 try {
  await p.goto(s.url + '/app/'); await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await H(d => HVACGrid.loadProject(d, 'T3'), G.read(path.join(G.FIXTURES, 't3'), 'project')); await idle();
  // a plan with rooms to keep out of
  const key = await H(() => { const pl = HVACGrid.plans().find(p => p.avoid?.length && HVACGrid.S.geometry[p.key]?.ducts?.some(d => d.type === 'branch')); const S = HVACGrid.S; S.deck = pl.deckId; S.kind = pl.kind; S.sys = pl.systemKey; return pl.key; });
  await p.click('.step[data-step=duct]'); await idle(); await H(() => { HVACGrid.S.legendOpen = true; HVACGrid.render(); }); await idle();
  assert.equal(await H(() => HVACGrid.plans().find(p => p.key === HVACGrid.S.duct?.key || p.systemKey === HVACGrid.S.sys && p.deckId === HVACGrid.S.deck)?.key), key);
  const z = await H(() => ({ zones: document.querySelectorAll('#plan .zone').length, vel: document.querySelectorAll('#plan .dvel').length }));
  assert.ok(z.zones > 0 && z.vel === 0, `forbidden zones on by default, velocity off ${JSON.stringify(z)}`);
  await p.locator('#legend [data-layer=vel]').setChecked(true); await idle();
  const v = await H(() => [...document.querySelectorAll('#plan .dvel')].map(e => e.textContent));
  assert.ok(v.length > 3 && v.every(t => /^\d+\.\d m\/s$/.test(t)), `velocity on the ducts ${v.slice(0, 5)}`);
  await p.screenshot({ path: path.join(OUT, 'duct-plan.png') });
  // a duct's type from the plan: PHG D needs the network open - AUTO first
  await H(k => HVACGrid.runAll([k]), key); await idle();
  const i = await H(k => { const ds = HVACGrid.S.geometry[k].ducts, i = ds.findIndex(d => d.type === 'branch'); HVACGrid.S.duct = { key: k, i }; HVACGrid.S.room = null; HVACGrid.render(); return i; }, key);
  const before = await H(k => ({ ...HVACGrid.S.geometry[k].ducts[HVACGrid.S.duct.i], undo: HVACGrid.S.undo.length }), key);
  await p.selectOption('#ductType', 'main'); await p.click('#ductTypeApply'); await idle();
  const after = await H(k => ({ ...HVACGrid.S.geometry[k].ducts[HVACGrid.S.duct.i], undo: HVACGrid.S.undo.length, label: HVACGrid.S.undo.at(-1)?.label, edited: HVACGrid.result(k).edited }), key);
  assert.equal(before.type, 'branch'); assert.equal(after.type, 'main', 'the type changed'); assert.equal(after.id, before.id, 'the same duct (PHG D names it by its type)');
  assert.ok(after.undo === before.undo + 1 && /종류/.test(after.label) && after.edited, JSON.stringify(after));
  await H(() => HVACGrid.undo()); await idle();
  assert.equal(await H(([k, n]) => HVACGrid.S.geometry[k].ducts.find(d => d.id === n)?.type, [key, before.id]), 'branch', 'undo puts the type back');
  // the editor on the plan's view: zoomed in on the plan, the same middle and width in PHG D
  await p.locator('#plan').hover(); await p.mouse.wheel(0, -360); await idle();
  const pv = await H(() => { const v = HVACGrid.S.planShown, rc = document.getElementById('plan').getBoundingClientRect(); return { cx: v.minX + rc.width / v.k / 2, w: rc.width / v.k, h: rc.height / v.k }; });
  await H(() => HVACGrid.openEditor()); await idle();
  const ev = await H(() => { const v = HVACGrid.phg.win.LineDesignLegacy.getState().view; return { cx: v.x + v.w / 2, w: v.w, h: v.h }; });
  assert.ok(Math.abs(ev.cx - pv.cx) < pv.w * 0.02 && (Math.abs(ev.w - pv.w) < pv.w * 0.02 || Math.abs(ev.h - pv.h) < pv.h * 0.02), `PHG D shows the plan's part ${JSON.stringify({ pv, ev })}`);
  await H(() => HVACGrid.closeEditor()); await idle();
  assert.deepEqual(errors, []);
  console.log('E2E DUCT-PLAN PASS');
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E DUCT-PLAN FAIL', e); process.exit(1); });
