// End-to-end (2026-10-21): K changes in BOX CAL. ISO 적용 and LY 적용 from the ribbon open the change list (lib/k-change.cjs):
// no room design condition moves, loads and airflows of most rooms do; ISO → LY under its own title. KU (patch V): the
// user's K added to ISO, to LY or as a new K table - with no boundary assigned, the loads are those of ISO, LY and the
// project K; KU is not applied before a choice. LY gives each boundary kind its own insulation (vendor patch W).
'use strict';
const assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), LY = require('./ly-k.cjs');

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [], alerts = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { alerts.push(d.message()); d.accept(); });
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a), H = (f, a) => p.evaluate(f, a);
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  await H(() => HVACGrid.openSample('t3')); await idle();
  await H(() => HVACGrid.go('load')); await idle();
  const list = () => H(() => ({ open: document.getElementById('kchg').open, title: document.getElementById('kchgTitle').textContent, body: document.getElementById('kchgBody').textContent, status: document.getElementById('status').textContent }));
  const press = async label => { await p.locator('#ribbon button', { hasText: label }).first().click(); await idle(); const l = await list(); await H(() => document.getElementById('kchg').close()); return l; };
  const mode0 = await H(async () => (await HVACGrid.box.calSnapshot()).kMode);
  // ISO 적용 (from whatever T3 had): the list opens, no design condition moved, loads did
  let iso = await press('ISO 적용'); if (mode0 === 'iso-standard') iso = await press('ISO 적용');   // T3 already on ISO: off, then on again
  log('ISO 적용', mode0, '→', iso.title, '|', iso.status);
  assert.ok(iso.open); assert.match(iso.title, /ISO 적용 변경 사항 .*→ ISO 7547 기준 K/); assert.match(iso.body, /1\. 격실 설계 조건[\s\S]*변경 없음/);
  const changed = +(iso.body.match(/부하·풍량이 바뀐 격실 (\d+) \/ 79/) || [])[1]; assert.ok(changed > 30, 'rooms whose loads moved: ' + changed);
  assert.match(iso.status, /설계 조건 변경 0건 · 부하가 바뀐 격실 \d+\/79/);
  // ISO → LY: a title of its own
  const ly = await press('LY 적용'); log('LY 적용', ly.title, '|', ly.status);
  assert.equal(ly.title, 'ISO → LY 변경 사항'); assert.match(ly.body, /변경 없음/); assert.match(ly.body, /ISO 7547 기준 K \(ISO 적용\) → LY 구조 계산 K \(LY 적용\)/);
  // KU: loads per mode, then KU on each base (no boundary assigned)
  const loads = () => H(() => { const r = HVACGrid.box.doc.querySelector('#calEnhancePanel iframe').contentWindow.CAL_ENHANCE.report(); return { mode: r.kMode, sum: Math.round(r.loads.reduce((t, x) => t + x.coolingW + x.heatingW, 0)) }; });
  const byMode = {};
  byMode.calculated = (await loads()).sum;   // now LY
  // LY K by boundary kind (vendor patch W): the K of every T3 face in the LY mode, worked out on its own
  const lyK = LY.checkLyFaces(LY.boundaryKinds(), await H(() => { const w = HVACGrid.box.doc.querySelector('#calEnhancePanel iframe').contentWindow,
   rooms = w.CAL_ENHANCE.report().rooms, byId = new Map(rooms.map(r => [r.id, r]));
   return w.CAL_ENHANCE_INPUT.faces.summarized.map(f => w.CAD_APP.faceBoundaryCondition(f, id => byId.get(id) || null)).map(c => [String(c.kType), c.kValue]); }), assert);
  log('LY K', lyK.count, 'faces', lyK.types.join(' '));
  for (const kind of ['WHEELHOUSE_ROOF-C', 'WEATHER_DECK_SUN-C', 'SHIP_SIDE_EXTERNAL_BULKHEAD-W', 'NON_AIR_CONDITIONED-W', 'ALLEY_SOUND-W', 'GENERAL_INTERNAL_BOUNDARY-C'])
   assert.ok(lyK.types.includes('LY-' + kind), 'T3 has an LY ' + kind);
  await press('ISO 적용'); byMode['iso-standard'] = (await loads()).sum;
  await press('ISO 적용'); byMode.project = (await loads()).sum;   // ISO off: project K
  log('loads by K mode', JSON.stringify(byMode));
  assert.ok(new Set(Object.values(byMode)).size === 3, 'three K modes, three load totals');
  // the KU window (CAL opens its tables in a window of their own)
  const [pop] = await Promise.all([p.context().waitForEvent('page', { timeout: 30000 }), H(() => HVACGrid.box.doc.querySelector('#calEnhancePanel iframe').contentWindow.document.getElementById('userKBtn').click())]);
  await pop.waitForSelector('[data-ku-base]', { timeout: 30000 });
  const kuState = () => pop.evaluate(() => ({ radios: [...document.querySelectorAll('[data-ku-base]')].map(x => x.dataset.kuBase + (x.checked ? '*' : '')), first: document.querySelector('[data-ku-assign] option')?.textContent }));
  const k0 = await kuState(); log('KU window', JSON.stringify(k0));
  assert.deepEqual(k0.radios, ['iso-standard', 'calculated', 'table']);
  // not applied before a choice
  alerts.length = 0; await pop.click('[data-ku-action="apply-user-mode"]'); await p.waitForTimeout(300);
  assert.ok(alerts.some(a => /먼저 고르세요/.test(a)), alerts.join(' | ')); assert.notEqual((await loads()).mode, 'user');
  for (const [base, mode, fallback] of [['iso-standard', 'iso-standard', 'ISO 7547 기준 K'], ['calculated', 'calculated', 'LY 구조 계산 K'], ['table', 'project', '프로젝트 기본 K']]) {
   await pop.check(`[data-ku-base="${base}"]`); await p.waitForTimeout(300);
   if ((await loads()).mode !== 'user') { await pop.click('[data-ku-action="apply-user-mode"]'); await p.waitForTimeout(500); }
   const l = await loads(), st = await kuState(); log('KU', base, JSON.stringify(l), st.first);
   assert.equal(l.mode, 'user'); assert.equal(l.sum, byMode[mode], `KU on ${base} with nothing assigned = ${mode}`); assert.ok(st.first.includes(fallback), st.first);
  }
  // kept with the project: BOX's JSON carries the choice
  const saved = await H(async () => JSON.parse(await HVACGrid.box.projectJson()));
  const assign = JSON.stringify(saved).match(/"userKAssignments":\{[^}]*\}/g) || []; log('saved', assign.slice(0, 2));
  assert.ok(assign.some(a => a.includes('"_base":"table"')), 'the KU base saved with the project');
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E K-CHANGE PASS');
 } catch (e) { console.error('E2E K-CHANGE FAIL', e); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
