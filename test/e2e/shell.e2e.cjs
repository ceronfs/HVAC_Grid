// End-to-end: the HVAC Grid shell over the real vendor apps. BOX S5 example -> CAL -> contract -> airflow rules and a
// unit location -> PHG D send + AUTO -> review. Screenshots go to out/e2e/ (git ignored).  npm run test:e2e
'use strict';
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e');

(async () => {
 fs.mkdirSync(OUT, { recursive: true });
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);
 const ribbon = label => p.locator('#ribbon .cmd', { hasText: label }).first();
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && window.HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  log('BOX ready'); await shot('1-room-empty');
  // the native BOX command bar is hidden inside the frame; the shell ribbon runs its commands
  assert.equal(await p.evaluate(() => getComputedStyle(HVACGrid.box.doc.querySelector('header.top')).display), 'none');
  await ribbon('S5 예제').click();
  await p.waitForFunction(() => HVACGrid.box.hasDrawing(), null, { timeout: 180000 }); await p.waitForTimeout(1000);
  log('S5 loaded'); await shot('1-room-s5');
  await p.click('.step[data-step=load]'); await idle();
  await ribbon('계약 만들기').click(); await idle();
  const c = await p.evaluate(() => ({ step: HVACGrid.S.step, rooms: HVACGrid.S.contract?.rooms.length, plans: HVACGrid.plans().length, msg: HVACGrid.S.msg }));
  log('contract', JSON.stringify(c));
  assert.equal(c.step, 'air'); assert.equal(c.rooms, 94); assert.equal(c.plans, 10);
  await shot('3-air');
  // step 3: a unit location for S3 / AHU-AC-01 picked on the plan
  await p.locator('#tree .deckh', { hasText: '3DK' }).click();
  await p.selectOption('#sysSel', 'AHU-AC-01');
  await ribbon('위치 지정').click();
  const box = await p.locator('#plan').boundingBox();   // the middle of the deck (the corridor), clear of the legend
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const root = await p.evaluate(() => HVACGrid.plans().find(x => x.key === 'S3__AHU-AC-01').rootSource);
  assert.equal(root, 'user'); log('unit location set');
  await p.fill('#dT', '12'); await ribbon('적용').click();
  const sup12 = await p.evaluate(() => HVACGrid.S.contract.systems.filter(s => s.kind === 'supply').reduce((t, s) => t + s.designCmh, 0));
  assert.ok(sup12 < 10420, 'dT 12 lowers supply'); log('dT 12 ->', sup12, 'CMH');
  await shot('3-air-root');
  // step 4: PHG D with the BOX rooms, the user's unit location and the RUs, then AUTO
  await p.click('.step[data-step=duct]'); await idle();
  assert.equal(await p.evaluate(() => getComputedStyle(HVACGrid.phg.doc.querySelector('header.topbar')).display), 'none');
  await ribbon('보내기 + AUTO').click(); await idle();
  const r = await p.evaluate(() => HVACGrid.S.results['S3__AHU-AC-01']);
  log('AUTO', JSON.stringify(r));
  assert.ok(r.auto && r.ducts > 0 && r.unconnected === 0, 'AUTO connected every RU');
  assert.equal(r.flowCmh, r.designCmh);
  await p.locator('#tree .room', { hasText: '선원침실 01' }).click(); await p.waitForTimeout(300);
  await shot('4-duct');
  // step 5: the second S3 system too, then the review table
  await p.click('.step[data-step=review]'); await idle();
  await p.evaluate(() => HVACGrid.runAll(['S3__AHU-AC-02'])); await idle();
  const rows = await p.locator('#report tbody tr[data-key]').count(), ok = await p.locator('#report td.ok').count();
  log('review rows', rows, 'AUTO done', ok); assert.equal(rows, 10); assert.ok(ok >= 2);
  await shot('5-review');
  // project file round trip keeps the PHG D projects
  const saved = await p.evaluate(() => JSON.parse(HVACGrid.projectJson()));
  assert.equal(saved.schema, 'hvac-grid-project/0'); assert.equal(Object.keys(saved.projects).length, 2);
  fs.writeFileSync(path.join(OUT, 'project.json'), JSON.stringify(saved));
  await p.setViewportSize({ width: 1280, height: 800 }); await p.click('.step[data-step=duct]'); await idle(); await p.waitForTimeout(400); await shot('4-duct-1280');
  log('page errors', errors.length, errors.slice(0, 5));
  assert.equal(errors.length, 0, 'no page errors');
  log('E2E PASS');
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
