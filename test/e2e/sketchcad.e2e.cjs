// End-to-end: SketchCAD 2D -> HVAC Grid, the way docs/WORKFLOW_SKETCHCAD.md has a beginner do it, on the N3 drawings:
//  SketchCAD: the DXF through its file input, (PANEL on the wall lines), ROOMAUTO -> rooms, ROOMTABLE "HVAC Grid용 DXF"
//  (a real download) -> lib/dxf-in.cjs reads that DXF -> HVAC Grid ① DXF 열기 (BOX): every room with its number and name.
//  Each room's number, name and area against samples/n3/N3.inputs.json.
//  Cases: D2 with the walls on a layer WALL (a received drawing), D2 as made (walls on ROOM - SketchCAD keeps that layer
//  for its own room outlines, so the walls go to PANEL first, WORKFLOW 1-3), D1 (R12, code page ANSI_949) with WALL.
// SketchCAD is not part of this repository: SKETCHCAD_HTML, else ../SketchCAD/SketchCAD.html next to this folder
// (github.com/ceronfs/SketchCAD). Without it the test says so and passes.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), X = require('../../lib/dxf-in.cjs');
const ROOT = path.join(__dirname, '..', '..'), OUT = path.join(ROOT, 'out', 'e2e-sketchcad'), N3 = path.join(ROOT, 'samples', 'n3');
const HTML = process.env.SKETCHCAD_HTML || path.join(ROOT, '..', 'SketchCAD', 'SketchCAD.html');
if (!fs.existsSync(HTML)) { console.log('E2E SKETCHCAD 건너뜀 — SketchCAD.html 없음:', HTML, '(SKETCHCAD_HTML로 경로 지정)'); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });
const inp = JSON.parse(fs.readFileSync(path.join(N3, 'N3.inputs.json'), 'utf8'));
const area = pts => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2e6;
// a drawing as it comes from a shipyard: the walls on WALL (the bytes kept: D1 is EUC-KR)
const withWallLayer = file => { const f = path.join(OUT, 'received_' + path.basename(file));
 fs.writeFileSync(f, fs.readFileSync(file, 'latin1').replace(/(\r?\n\s*8\r?\n)ROOM(\r?\n)/g, '$1WALL$2'), 'latin1'); return f; };
const CASES = [
 { name: 'D2 벽 WALL', deck: 'D2', file: () => withWallLayer(path.join(N3, 'N3_D2.dxf')) },
 { name: 'D2 벽 ROOM → 패널 지정', deck: 'D2', file: () => path.join(N3, 'N3_D2.dxf'), panel: true },
 { name: 'D1 R12 EUC-KR 벽 WALL', deck: 'D1', file: () => withWallLayer(path.join(N3, 'N3_D1.dxf')) },
];
// numbers, names and areas against the inputs of that deck
const check = (where, got, deck) => {
 const want = inp.rooms.filter(r => r.deck === deck);
 assert.equal(got.length, want.length, `${where}: ${got.length} rooms, want ${want.length}`);
 for (const w of want) {
  const g = got.find(x => x.no === w.no);
  assert.ok(g, `${where}: room ${w.no} ${w.name} missing`);
  assert.equal(g.name, w.name, `${where}: room ${w.no} name`);
  if (g.areaM2 != null) assert.ok(Math.abs(g.areaM2 - area(w.points)) < 0.01, `${where}: room ${w.no} area ${g.areaM2} vs ${area(w.points)}`);
 }
};

(async () => {
 const s = await start(), b = await launch(), ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true }), errors = [], t0 = Date.now();
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);
 try {
  // HVAC Grid, open once: each case's DXF is one more BOX deck
  const g = await ctx.newPage();
  g.on('pageerror', e => errors.push('HVAC Grid: ' + e.message)); g.on('dialog', d => d.accept());
  await g.goto(s.url + '/app/');
  await g.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 });
  await g.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
  await g.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });

  for (const [i, c] of CASES.entries()) {
   const src = c.file(), tag = 'case' + (i + 1);
   // SketchCAD: no save picker, so "HVAC Grid용 DXF" is a download
   const p = await ctx.newPage();
   p.on('pageerror', e => errors.push('SketchCAD: ' + e.message));
   await p.addInitScript(() => { window.showSaveFilePicker = undefined; });
   await p.goto('file:///' + path.resolve(HTML).replace(/\\/g, '/'));
   await p.waitForFunction(() => window.CAD && CAD.doc, null, { timeout: 30000 });
   await p.setInputFiles('#fDxf', src);
   await p.waitForFunction(() => CAD.doc.ents.length > 0, null, { timeout: 60000 });
   const asIs = await p.evaluate(() => CAD.findRoomsByText().length);
   if (c.panel) {
    // ② 경계 지정: the wall lines selected, PANEL, Enter
    await p.evaluate(() => { CAD.sel.clear(); for (const e of CAD.doc.ents) if (e.layer === 'ROOM' && e.type !== 'text') CAD.sel.add(e.id); });
    await p.mouse.move(800, 450); await p.keyboard.type('PANEL'); await p.keyboard.press('Enter');
    await p.waitForFunction(() => !CAD.doc.ents.some(e => e.layer === 'ROOM' && e.type !== 'text'), null, { timeout: 10000 });
   }
   // ③ 실 자동 찾기 -> 실 만들기
   await p.evaluate(() => CAD.zoomExtents());
   await p.evaluate(() => CAD.run('ROOMAUTO'));
   await p.locator('[data-m=ok]').first().click();
   const rooms = await p.evaluate(() => CAD.roomData());
   check(`${c.name} SketchCAD`, rooms, c.deck);
   // 면적표 -> HVAC Grid용 DXF
   await p.evaluate(() => CAD.run('ROOMTABLE'));
   const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.locator('[data-rt=dxf]').click()]);
   const dxf = path.join(OUT, tag, dl.suggestedFilename()); fs.mkdirSync(path.dirname(dxf), { recursive: true }); await dl.saveAs(dxf);
   await p.screenshot({ path: path.join(OUT, tag + '-sketchcad.png') }); await p.close();
   // HVAC Grid's own reader
   const read = X.bestRooms(fs.readFileSync(dxf, 'utf8'));
   check(`${c.name} dxf-in`, read.rooms, c.deck);
   // HVAC Grid ① DXF 열기 (BOX)
   await g.evaluate(([bytes, name]) => HVACGrid.box.setFile('dxfFile', new File([new Uint8Array(bytes)], name, { type: 'application/dxf' })), [[...fs.readFileSync(dxf)], path.basename(dxf)]);
   await g.waitForFunction(n => HVACGrid.box.win.CAD_APP.stack.decks.length === n, i + 1, { timeout: 120000 });
   // BOX names the deck after the file (r.deck); its id is r.deckId
   await g.waitForFunction(n => { const A = HVACGrid.box.win.CAD_APP, id = A.stack.decks[n].id; return A.rooms().some(r => r.deckId === id); }, i, { timeout: 60000 }).catch(() => {});
   const box = await g.evaluate(n => { const A = HVACGrid.box.win.CAD_APP, id = A.stack.decks[n].id; return A.rooms().filter(r => r.deckId === id).map(r => ({ no: r.no, name: r.name })); }, i);
   check(`${c.name} BOX`, box, c.deck);
   await g.screenshot({ path: path.join(OUT, tag + '-box.png') });
   log(c.name, { asIs, sketchcad: rooms.length, dxfIn: `${read.rooms.length} (${read.how})`, box: box.length });
  }
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E SKETCHCAD PASS');
 } catch (e) { console.error('E2E SKETCHCAD FAIL', e); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
