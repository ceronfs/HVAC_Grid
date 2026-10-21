// End-to-end: the standalone SOLAS 방화 등급 표기 (tools/make-solas-tool.cjs) opened as a file (file://, no server, no
// network): the T3 example, a room's space chosen by hand, a wall's rating set by clicking it, the ship type, the DXF
// it saves, a deck DXF opened from disk; no request leaves the page.
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict'), { pathToFileURL } = require('url');
const { launch } = require('../../tools/browser.cjs'), T = require('../../tools/make-solas-tool.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });
const FILE = path.join(OUT, 'SOLAS_방화등급표기.html');

(async () => {
 T.build(FILE);
 const b = await launch(), ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 1000 } }), p = await ctx.newPage(), errors = [], requests = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 p.on('request', r => { if (!/^(file|data|blob|about):/.test(r.url())) requests.push(r.url()); });
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a), H = (f, a) => p.evaluate(f, a);
 const view = () => H(() => { const svg = document.querySelector('#drawing svg');
  return { deck: svg?.dataset.deck, labels: svg ? svg.querySelectorAll('text[font-weight="700"]').length : 0, rows: document.querySelectorAll('#view tbody tr[data-room]').length, status: document.getElementById('status').textContent }; });
 try {
  await p.goto(pathToFileURL(FILE).href);
  await p.click('#sampleBtn');
  const v1 = await view(); log('T3', JSON.stringify(v1));
  assert.equal(await H(() => SOLAS_TOOL.S.decks.length), 4);
  assert.deepEqual(await H(() => SOLAS_TOOL.S.decks.map(d => d.rooms.length)), [20, 27, 22, 10], 'every room of T3 read from its DXF');
  assert.ok(v1.labels > 10 && v1.rows === 20, 'UPPER DK drawn with its ratings, its rooms in the table');
  // the same ratings as HVAC Grid's own fire-rating plan of T3 (the tool reads the DXFs, HVAC Grid the BOX rooms)
  const grades = await H(() => SOLAS_TOOL.analysis().m.grades); assert.ok(['A-60', 'A-0', 'B-0'].every(g => grades.includes(g)), grades.join(' '));
  // a room's space by hand: 112 탈의실 as a store -> its category changes
  const before = await H(() => { const a = SOLAS_TOOL.analysis(), r = a.c.rooms.find(x => x.no === '112'); return { id: r.id, cat: a.b.classes[r.id].cat }; });
  await p.selectOption(`select[data-space="${before.id}"]`, '로커·창고 — 4㎡ 초과');
  const after = await H(id => SOLAS_TOOL.analysis().b.classes[id], before.id); assert.notEqual(after.cat, before.cat); assert.equal(after.source, 'user');
  // a wall's rating by clicking it: the first labelled run set to A-60
  const run = await H(() => { const w = SOLAS_TOOL.analysis().m.decks[0].walls.findIndex(x => x.label && x.grade !== 'A-60'); return w; });
  await p.locator(`#drawing svg line[data-run="${run}"]`).click({ force: true });
  await p.locator('#menu button[data-grade="A-60"]').click();
  const set = await H(() => Object.values(SOLAS_TOOL.S.bounds)); assert.ok(set.length >= 1 && set.every(g => g === 'A-60'));
  // the ship type: a tanker
  await p.selectOption('#ship', 'TANK'); assert.equal(await H(() => SOLAS_TOOL.analysis().m.ship), 'TANK');
  // another deck
  await p.locator('#tabs button', { hasText: 'A DK' }).click(); const v2 = await view(); assert.equal(v2.rows, 27);
  await p.screenshot({ path: path.join(OUT, 'solas-tool.png') });
  // the DXF
  const dl = p.waitForEvent('download'); await p.click('#dxfBtn'); const d = await dl, f = path.join(OUT, 'solas-tool.dxf'); await d.saveAs(f);
  const dxf = fs.readFileSync(f, 'utf8'); assert.match(dxf, /AC1009/); assert.match(dxf, /FIRE_TEXT_A60/); log('DXF', d.suggestedFilename(), dxf.length);
  // a deck DXF opened from disk (the file input)
  await p.click('#clearBtn'); await p.setInputFiles('#fileIn', path.join(__dirname, '..', '..', 'samples', 't3', 'T3_D2.dxf'));
  await p.waitForFunction(() => SOLAS_TOOL.S.decks.length === 1); assert.equal(await H(() => SOLAS_TOOL.S.decks[0].rooms.length), 27);
  // (review 2026-10-21) broken files beside a good one: each named in the status in Korean, no empty deck, the good one opens
  const reset = () => H(() => { Object.assign(SOLAS_TOOL.S, { decks: [], user: {}, bounds: {}, cur: null }); SOLAS_TOOL.render(); });
  await reset();
  await p.setInputFiles('#fileIn', [{ name: 'empty.dxf', mimeType: 'application/dxf', buffer: Buffer.alloc(0) }, { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{ not json') },
   { name: 'box.dxf', mimeType: 'application/dxf', buffer: Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n') },
   { name: 'T3_D4.dxf', mimeType: 'application/dxf', buffer: fs.readFileSync(path.join(__dirname, '..', '..', 'samples', 't3', 'T3_D4.dxf')) }]);
  await p.waitForFunction(() => SOLAS_TOOL.S.decks.length === 1);
  const st = await H(() => ({ t: document.getElementById('status').textContent, c: document.getElementById('status').className, decks: SOLAS_TOOL.S.decks.map(d => d.rooms.length) })); log('broken files', JSON.stringify(st));
  assert.deepEqual(st.decks, [10]); assert.equal(st.c, 'err');
  for (const s of ['empty.dxf: DXF 파일이 아닙니다', 'bad.json: JSON 형식이 아닙니다', 'box.dxf: 실을 찾지 못했습니다', 'T3_D4.dxf: 실 10개']) assert.ok(st.t.includes(s), s);
  // (review) every deck in one drawing (T3_ALL.dxf, decks 25 m apart, the bridge 8 m further): split into 4 decks put over
  // each other by their stairs, trunks and casings -> the same boundaries and deck ratings as the four deck files
  const kinds = () => H(() => { const a = SOLAS_TOOL.analysis(), k = {}; for (const x of a.b.boundaries) k[x.kind] = (k[x.kind] || 0) + 1;
   return { k, deck: a.b.boundaries.filter(x => x.kind === 'deck').map(x => x.grade).sort().join(' '), labels: a.m.decks.map(d => d.walls.filter(w => w.label).length).join() }; });
  await reset(); await p.setInputFiles('#fileIn', ['T3_D1.dxf', 'T3_D2.dxf', 'T3_D3.dxf', 'T3_D4.dxf'].map(f => path.join(__dirname, '..', '..', 'samples', 't3', f)));
  await p.waitForFunction(() => SOLAS_TOOL.S.decks.length === 4); const four = await kinds();
  await reset(); await p.setInputFiles('#fileIn', path.join(__dirname, '..', '..', 'samples', 't3', 'T3_ALL.dxf')); await p.waitForFunction(() => SOLAS_TOOL.S.decks.length === 1);
  assert.equal(await H(() => document.getElementById('status').className), 'warn'); assert.equal((await kinds()).k.deck, undefined, 'one deck: no deck boundary yet');
  await p.click('button[data-dsplit]'); await p.waitForFunction(() => SOLAS_TOOL.S.decks.length === 4);
  const split = await kinds(); log('T3_ALL split', JSON.stringify(split.k), await H(() => SOLAS_TOOL.S.decks.map(d => d.dx).join()));
  assert.deepEqual(split, four);
  // (review) a deck taken out takes its rooms' spaces and its walls' ratings with it
  await p.click('#sampleBtn');
  await H(() => { const S = SOLAS_TOOL.S, a = SOLAS_TOOL.analysis(); S.user[S.decks[1].rooms[0].id] = S.user[S.decks[0].rooms[0].id] = '로커·창고 — 4㎡ 초과';
   for (const id of a.m.decks[1].walls.find(x => x.label).ids) S.bounds[id] = 'A-60'; SOLAS_TOOL.render(); });
  await p.click(`button[data-ddel="${await H(() => SOLAS_TOOL.S.decks[1].id)}"]`);
  assert.deepEqual(await H(() => [SOLAS_TOOL.S.decks.length, Object.keys(SOLAS_TOOL.S.user).length, Object.keys(SOLAS_TOOL.S.bounds).length]), [3, 1, 0]);
  // (2026-10-21) the T3 example classified as HVAC Grid classifies T3: every room's SOLAS space and category the same (the
  // stores and the drying room by their floor area - the tool had passed none, so all were "under 4 m²")
  const SO = require('../../lib/solas.cjs'), c3 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'samples', 't3.contract.json'), 'utf8')), g3 = SO.boundaries(c3).classes;
  const grid = Object.fromEntries(c3.rooms.map(r => [r.no, `${g3[r.id].space}|${g3[r.id].cat}`]));
  await reset(); await p.click('#sampleBtn');
  const tool = await H(() => { const a = SOLAS_TOOL.analysis(); return Object.fromEntries(a.c.rooms.map(r => [r.no, `${a.b.classes[r.id].space}|${a.b.classes[r.id].cat}`])); });
  const differ = Object.keys(grid).filter(no => grid[no] !== tool[no]).map(no => `${no}: ${tool[no]} ≠ ${grid[no]}`); log('T3 spaces vs HVAC Grid', differ.length, differ.slice(0, 3));
  assert.deepEqual(differ, []);
  // (2026-10-21) an architectural drawing (double-line walls, door gaps, door swings, furniture): the rooms from their names
  const { drawing } = require('../fixtures/arch-dxf.cjs');
  await reset(); await p.setInputFiles('#fileIn', { name: 'arch.dxf', mimeType: 'application/dxf', buffer: Buffer.from(drawing()) }); await p.waitForFunction(() => SOLAS_TOOL.S.decks.length === 1);
  const arch = await H(() => { const a = SOLAS_TOOL.analysis(); return { status: document.getElementById('status').textContent, rooms: a.c.rooms.map(r => `${r.name}|${a.b.classes[r.id].space}`).sort(), bulkheads: a.b.boundaries.filter(x => x.kind === 'bulkhead').length, labels: a.m.decks[0].walls.filter(w => w.label).length }; });
  log('architectural drawing', JSON.stringify(arch));
  assert.match(arch.status, /arch\.dxf: 실 6개 \(건축식 도면/); assert.equal(arch.rooms.length, 6);
  assert.ok(arch.rooms.includes('GALLEY|조리실') && arch.rooms.includes('CORRIDOR|통로') && arch.rooms.includes('WC|화장실·샤워실·욕실'), arch.rooms.join(', '));
  assert.ok(arch.bulkheads >= 7 && arch.labels >= 4, 'walls between the rooms found across the wall thickness');
  // (review) the legend shows no penetration symbols: the tool has no penetrations
  assert.ok(!(await H(() => document.querySelector('.fp-legend').textContent)).includes('방화댐퍼'));
  log('requests out of the file', requests.length, requests.slice(0, 3)); assert.equal(requests.length, 0);
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E SOLAS-TOOL PASS');
 } catch (e) { console.error('E2E SOLAS-TOOL FAIL', e); process.exitCode = 1; }
 finally { await b.close(); }
})();
