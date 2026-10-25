// End-to-end over the single file (tools/make-single.cjs -> HVAC_Grid.html): the file alone, copied into an empty folder
// away from the repository, opened as file:// - no server, no network. T3 시험선 -> ② design data (the same airflow as
// samples/t3.contract.json) and a CAL table window -> ⑤ SOLAS, 모든 계통 AUTO -> project, XLSX and report as downloads ->
// the project opened again -> PHG D editor and its 설계 비교 (a work frame of PHG D's own text) -> the theme kept over a
// reload (localStorage). No page error, no request leaves the page. Screenshots: out/e2e-single/.   npm run test:single
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict'), { pathToFileURL } = require('url');
const { launch } = require('../../tools/browser.cjs'), SINGLE = require('../../tools/make-single.cjs'), { readWorkbook } = require('../../lib/xlsx-read.cjs');
const ROOT = path.join(__dirname, '..', '..'), OUT = path.join(ROOT, 'out', 'e2e-single');

(async () => {
 fs.mkdirSync(OUT, { recursive: true });
 const built = SINGLE.build(path.join(OUT, 'HVAC_Grid.html'));
 // the file alone in a folder of its own: nothing beside it to read
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hvac-grid-single-')), FILE = path.join(dir, 'HVAC_Grid.html');
 fs.copyFileSync(built.out, FILE);
 const b = await launch(), ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true }), p = await ctx.newPage(), errors = [], requests = [], t0 = Date.now();
 const watch = page => { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); }); page.on('dialog', d => d.accept()); };
 watch(p); ctx.on('page', watch);
 // a request to a server (http, https, ws); edge:// pages are the browser's own (its downloads bar)
 ctx.on('request', r => { if (!/^(file|data|blob|about|edge|chrome):/.test(r.url())) requests.push(r.url()); });
 const shot = (n, page = p) => page.screenshot({ path: path.join(OUT, n + '.png') });
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);
 const ribbon = label => p.locator('#ribbon .cmd', { hasText: label }).first();
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 600000 });
 const H = (f, a) => p.evaluate(f, a);
 const download = async (label, name) => { const [d] = await Promise.all([p.waitForEvent('download'), ribbon(label).click()]); const f = path.join(OUT, name); await d.saveAs(f); return f; };
 try {
  log(`${path.basename(FILE)} ${(built.bytes / 1e6).toFixed(1)} MB in ${dir}`);
  await p.goto(pathToFileURL(FILE).href);
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 60000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  // the vendor apps are srcdoc frames of the page's own origin, the shell scripts into them
  assert.deepEqual(await H(() => ({ single: HVACGridBridge.single, protocol: location.protocol, box: HVACGrid.box.frame.hasAttribute('srcdoc'), boxBar: getComputedStyle(HVACGrid.box.doc.querySelector('header.top')).display })),
   { single: true, protocol: 'file:', box: true, boxBar: 'none' });
  log('BOX ready'); await shot('1-room-empty');
  // ① T3 시험선 (its BOX project from the file), ② loads -> design data
  await ribbon('T3 시험선').click();
  await p.waitForFunction(() => HVACGrid.box.hasDrawing() && HVACGrid.box.win.CAD_APP.stack.decks.length === 4, null, { timeout: 180000 }); await p.waitForTimeout(800);
  await shot('1-room-t3'); log('T3 in BOX');
  await p.click('.step[data-step=load]'); await idle();
  // a CAL table opens in its own window, dressed like the app (popup.css and the logo from the file)
  const [win] = await Promise.all([ctx.waitForEvent('page'), ribbon('격실 입력').click()]);
  await win.waitForFunction(() => document.getElementById('hvac-grid-popup') && / — HVAC Grid$/.test(document.title), null, { timeout: 60000 });
  assert.match(await win.evaluate(() => document.querySelector('.hg-logo')?.src || ''), /^data:image\/png;base64,/);
  assert.ok(await win.evaluate(() => document.getElementById('hvac-grid-popup').textContent.length > 1000), 'popup.css inside the window');
  await shot('2-load-rooms', win); await win.close(); await idle();
  await ribbon('설계 데이터 만들기').click(); await idle();
  const c = await H(() => ({ rooms: HVACGrid.S.contract.rooms.length, plans: HVACGrid.plans().length, below: HVACGrid.S.contract.solas?.lowestBelow ?? null }));
  log('contract', JSON.stringify(c)); assert.equal(c.rooms, 79); assert.equal(c.plans, 18);
  const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 't3.contract.json'), 'utf8'));
  assert.deepEqual(await H(() => HVACGrid.S.contract.airflow), sample.airflow, 'same airflow as samples/t3.contract.json');
  await H(() => { HVACGrid.S.deck = 'D2'; HVACGrid.render(); }); await p.waitForTimeout(200); await shot('3-air-D2');
  // ③ T3 시험선 opens the example with its SOLAS settings (samples/t3/T3.solas.json, from the file)
  const answer = () => p.locator('#dlg[open] button[data-v=discard]').click({ timeout: 3000 }).catch(() => {});
  { const opening = H(() => HVACGrid.openSample('t3')); await answer(); await opening; } await idle();
  assert.equal(await H(() => HVACGrid.S.contract.rooms.length), 79);
  const solas = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 't3', 'T3.solas.json'), 'utf8'));
  for (const [k, v] of Object.entries(solas)) assert.deepEqual(await H(k => HVACGrid.S.contract.solas[k], k), v, 'T3 SOLAS setting ' + k);
  // ⑤ every deck and system: AUTO
  await p.click('.step[data-step=review]'); await idle();
  await p.locator('#report .tabs button', { hasText: '방화 (SOLAS)' }).click();
  await p.selectOption('#belowSel', '기관실 — A류'); await idle();
  const ta = Date.now(); await ribbon('모든 계통 AUTO').click(); await idle();
  const a = await H(() => { const a = HVACGrid.analysis(); return { done: a.done, total: a.total, count: a.count, out: a.solas.summary.outsideM, fails: a.checks.filter(k => k.level === 'fail').map(k => k.text), pens: a.solas.summary.penetrations, acc: a.systems.find(s => s.systemKey === 'AHU-ACC') }; });
  log(`AUTO ${a.done}/${a.total} in ${((Date.now() - ta) / 1000).toFixed(0)} s · review ${JSON.stringify(a.count)} · penetrations ${a.pens} · AHU-ACC ESP ${a.acc.indexPa} Pa fan ${a.acc.fanPa} Pa`);
  assert.equal(a.done, 18); assert.equal(a.out, 0); assert.deepEqual(a.fails, []); assert.ok(a.pens > 20); assert.ok(a.acc.complete && a.acc.indexPa > 0 && a.acc.fanPa > a.acc.indexPa);
  await shot('5-review-nets');
  // outputs as downloads (an automated run takes the download path; a person gets the browser's save window)
  const fProject = await download('프로젝트 저장', 't3.project.json'), fXlsx = await download('통합 XLSX', 't3.xlsx'), fHtml = await download('보고서', 't3.report.html');
  const saved = JSON.parse(fs.readFileSync(fProject, 'utf8'));
  assert.equal(saved.schema, 'hvac-grid-project/1'); assert.equal(Object.keys(saved.projects).length, 18);
  const wb = readWorkbook(fs.readFileSync(fXlsx)); assert.equal(wb['격실'].length, 80); assert.ok(wb['관통 목록'].length > 1);
  const report = fs.readFileSync(fHtml, 'utf8'); assert.match(report, /HVAC Grid 설계 보고서/); assert.match(report, /AHU-ACC/);
  log('downloads', [fProject, fXlsx, fHtml].map(f => path.basename(f) + ' ' + fs.statSync(f).size).join(' · '));
  // start over on S5, open the saved project: the same results without running anything
  const opening = H(() => HVACGrid.openSample('s5')); await answer(); await opening;
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#openProjectBtn').then(() => p.click('#fileMenu button[data-a=open]')).then(answer)]); await chooser.setFiles(fProject); await idle();
  await p.waitForFunction(() => HVACGrid.S.contract?.rooms.length === 79, null, { timeout: 30000 });
  const back = await H(() => { const a = HVACGrid.analysis(); return { rooms: HVACGrid.S.contract.rooms.length, done: a.done, below: HVACGrid.S.contract.solas.lowestBelow, pens: a.solas.summary.penetrations }; });
  assert.deepEqual(back, { rooms: 79, done: 18, below: '기관실 — A류', pens: a.pens }); log('project round trip', JSON.stringify(back));
  // ④ the PHG D editor on the smallest network, and PHG D's 설계 비교 (its hidden work frame is PHG D's own text)
  const key = await H(() => Object.entries(HVACGrid.S.results).sort((x, y) => x[1].rus - y[1].rus)[0][0]);
  await p.click('.step[data-step=duct]'); await idle();
  await H(k => { const pl = HVACGrid.plans().find(x => x.key === k); HVACGrid.S.deck = pl.deckId; HVACGrid.S.sys = pl.systemId; HVACGrid.S.kind = pl.kind; HVACGrid.render(); return HVACGrid.go('duct'); }, key); await idle();
  await H(() => HVACGrid.openEditor()); await idle();
  assert.equal(await H(() => HVACGrid.phg.result().ducts), await H(k => HVACGrid.result(k).ducts, key)); await shot('4-duct-editor');
  await H(() => HVACGrid.phg.doc.getElementById('phgdCompareBtn').click());
  const cmp = await p.waitForFunction(() => { const d = HVACGrid.phg.doc.getElementById('phgdCompareDialog'), t = d?.querySelector('.phgd-cmp-status')?.textContent || '';
   return d?.querySelector('.phgd-cmp-result table') ? { rows: d.querySelectorAll('.phgd-cmp-result tbody tr').length } : /못했|초과|없습니다/.test(t) ? { error: t } : null; }, null, { timeout: 200000 }).then(h => h.jsonValue());
  log('설계 비교', key, JSON.stringify(cmp)); assert.ok(cmp.rows > 5, '설계 비교 result: ' + JSON.stringify(cmp));
  await shot('4-duct-compare'); await H(() => HVACGrid.phg.doc.querySelector('#phgdCompareDialog .phgd-cmp-close').click());
  // the theme is kept (localStorage of file://) over a reload; the reloaded page asks nothing of a server
  await H(() => { if (document.documentElement.dataset.theme !== 'dark') document.getElementById('themeBtn').click(); });
  await p.reload(); await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 60000 });
  assert.equal(await H(() => document.documentElement.dataset.theme), 'dark', 'theme kept over a reload'); await shot('1-room-dark');
  await H(() => document.getElementById('themeBtn').click());
  log('page errors', errors.length, errors.slice(0, 5)); assert.equal(errors.length, 0, 'no page errors');
  log('requests off the page', requests.length, requests.slice(0, 5)); assert.equal(requests.length, 0, 'nothing loaded from a server or the internet');
  log('E2E single file PASS');
 } finally { await b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error('E2E single file FAIL', e); process.exit(1); });
