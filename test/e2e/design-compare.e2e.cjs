// End-to-end: the designer's ducts against AUTO (실도면 검증 ready for a real drawing) - a designer's DXF of a deck read
// from its duct layer (wall lines left out), turned to the plan's way round, drawn on the plan, compared in ⑤ "설계
// 비교" (both shares, the distance changing them), a drawing without duct layer names asking for the layer, and the
// lines kept in the project file. The designer's drawing here: T3's AUTO ducts of a deck with a third of them 300 mm off
// and two runs AUTO has not got.
//   node test/e2e/design-compare.e2e.cjs
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), G = require('../../tools/v1-golden.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });

// a DXF (CAD y up = -BOX y) of LINEs: [layer, x1, y1, x2, y2]
const dxf = lines => ['0', 'SECTION', '2', 'ENTITIES', ...lines.flatMap(([l, x1, y1, x2, y2]) => ['0', 'LINE', '8', l, '10', x1, '20', y1, '11', x2, '21', y2]), '0', 'ENDSEC', '0', 'EOF'].join('\n');

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true }), errors = [];
 p.on('pageerror', e => errors.push(e.message));
 const H = (f, a) => p.evaluate(f, a), idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 const choose = async (name, text) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#ribbon button', { hasText: '설계 덕트 DXF' }).click()]); await fc.setFiles({ name, mimeType: 'application/dxf', buffer: Buffer.from(text) }); };
 try {
  await p.goto(s.url + '/app/'); await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  const project = G.read(path.join(G.FIXTURES, 't3'), 'project');
  await H(d => HVACGrid.loadProject(d, 'T3'), project); await idle();
  await p.click('.step[data-step=review]'); await idle(); await H(() => { HVACGrid.S.deck = 'D1'; HVACGrid.S.legendOpen = true; HVACGrid.render(); }); await idle();
  // the designer's drawing of D1 from AUTO's ducts (geometry y is the CAD y): every third segment 300 mm off, two extra runs
  const segs = await H(() => HVACGrid.plans().filter(p => p.deckId === 'D1').flatMap(p => (HVACGrid.S.geometry[p.key]?.ducts || []).flatMap(d => d.points.slice(1).map((q, i) => [d.points[i].x, d.points[i].y, q.x, q.y]))));
  const lines = segs.map((g, i) => i % 3 ? ['M-DUCT', ...g] : ['M-DUCT', g[0] + 300, g[1] + 300, g[2] + 300, g[3] + 300]);
  lines.push(['M-DUCT', 3000, -2500, 3000, -5500], ['M-DUCT', 16000, -2500, 19000, -2500], ['A-WALL', 0, 0, 20000, 0], ['A-WALL', 0, 0, 0, -16000]);
  await choose('T3_D1_design.dxf', dxf(lines)); await idle();
  const d1 = await H(() => { const d = HVACGrid.S.design.D1; return { n: d.segs.length, layers: d.layers, flip: d.flip, fit: d.fit, tab: HVACGrid.S.tab, err: HVACGrid.S.msgErr }; });
  assert.deepEqual(d1, { n: segs.length + 2, layers: ['M-DUCT'], flip: true, fit: 1, tab: 'design', err: false }, 'the duct layer only, turned to the plan\'s way round');
  const look = () => H(() => ({ dsg: document.querySelectorAll('#plan .dsg').length, miss: document.querySelectorAll('#plan .dsg.miss').length, legend: document.querySelector('#legend .lg-design')?.textContent || '',
   row: [...document.querySelectorAll('#report tr[data-dsgdeck="D1"] td')].map(td => td.textContent) }));
  const a = await look();
  assert.ok(a.dsg === segs.length + 2 && a.miss >= 2 && /설계의 \d+ %/.test(a.legend), `on the plan: ${JSON.stringify({ ...a, row: undefined })}`);
  const share = (row, i) => +row[i].replace(/[^0-9]/g, '');
  const ds = share(a.row, 4), as = share(a.row, 5);
  assert.ok(ds >= 80 && ds < 100 && as >= 95, `500 mm: the 300 mm off within, the extra runs not: designer ${ds} %, AUTO ${as} % (${a.row.join(' | ')})`);
  await p.screenshot({ path: path.join(OUT, 'design-compare.png') });
  // a tighter distance: the runs 300 mm off fall out
  await p.fill('#dsgTol', '200'); await p.press('#dsgTol', 'Enter'); await p.locator('#dsgTol').dispatchEvent('change'); await idle();
  const t = await look(); assert.ok(share(t.row, 4) < ds - 15 && share(t.row, 5) < as - 15, `200 mm: ${t.row.join(' | ')}`);
  await p.fill('#dsgTol', '500'); await p.locator('#dsgTol').dispatchEvent('change'); await idle();
  // a drawing without duct layer names: the layer asked for
  await H(() => { HVACGrid.S.deck = 'D2'; HVACGrid.render(); }); await idle();
  await choose('D2.dxf', dxf([['LINES', 1000, -1000, 9000, -1000], ['LINES', 9000, -1000, 9000, -6000], ['TXT', 0, 0, 1, 1]]));
  await p.waitForSelector('#dlg[open]'); const asked = await p.locator('#dlgBtns button').allTextContents();
  assert.ok(asked[0].startsWith('LINES'), `the layers offered: ${asked}`); await p.locator('#dlgBtns button').first().click(); await idle();
  assert.deepEqual(await H(() => [HVACGrid.S.design.D2?.layers, HVACGrid.S.design.D2?.segs.length]), [['LINES'], 2]);
  // kept in the project file, read back
  const saved = await H(() => JSON.parse(JSON.stringify(HVACGrid.project())));
  assert.deepEqual(Object.keys(saved.design).sort(), ['D1', 'D2']);
  await H(d => HVACGrid.loadProject(d, 'T3 again'), saved); await idle();
  assert.deepEqual(await H(() => [Object.keys(HVACGrid.S.design).sort(), HVACGrid.S.design.D1.segs.length]), [['D1', 'D2'], segs.length + 2]);
  // the plain project of before has none (a file without the designer's ducts stays as it was)
  assert.equal(JSON.parse(JSON.stringify(project)).design, undefined);
  assert.deepEqual(errors, []);
  console.log(`E2E DESIGN-COMPARE PASS (D1: ${segs.length} AUTO segments · 500 mm: designer ${ds} % / AUTO ${as} % · 200 mm: ${share(t.row, 4)} % / ${share(t.row, 5)} %)`);
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E DESIGN-COMPARE FAIL', e); process.exit(1); });
