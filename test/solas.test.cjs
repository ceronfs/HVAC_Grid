'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const SO = require('../lib/solas.cjs'), { extract } = require('../tools/solas-extract.cjs'), { readWorkbook } = require('../lib/xlsx-read.cjs');
const V = f => path.join(__dirname, '..', 'vendor', f);

test('SOLAS data: lib/solas-data.json is exactly what the tool holds (830 cells, 82 spaces)', () => {
 const fresh = extract(fs.readFileSync(V('SOLAS_fire_rating.html'), 'utf8'));
 assert.deepEqual(fresh, SO.DATA);
 let cells = 0; for (const t of Object.values(SO.DATA.tables)) for (const r of t) for (const c of r) if (c !== null) cells++;
 assert.equal(cells, 830); assert.equal(SO.DATA.spaces.length, 82);
 assert.deepEqual(Object.keys(SO.DATA.ships), ['P36P', 'P36M', 'CARG', 'TANK']);
});

test('SOLAS data equals the workbook Tables 9.1-9.8 and the space sheet (every cell)', () => {
 const wb = readWorkbook(fs.readFileSync(V('SOLAS_fire_rating_tables.xlsx')));
 // workbook "B-0 / A-0 (c)" (and an en dash for "no requirement"), "A-0 (a) / B-0 (e)", "C (a)(b)" -> tool "B-0|A-0^c", "A-0^a|B-0^e", "C^ab"
 const norm = v => v == null ? null : String(v).trim() === '–' ? '-' : String(v).split(/\s*\/\s*/).map(p => { const m = p.trim().match(/^([^\s(]+)\s*(.*)$/), sup = (m[2].match(/[a-z]/g) || []).join(''); return m[1] + (sup ? '^' + sup : ''); }).join('|');
 let compared = 0;
 for (const [name, t] of Object.entries(SO.DATA.tables)) {
  const rows = wb['T' + name.slice(1, 2) + '.' + name.slice(2)], start = rows.findIndex(r => r[0] === '(1)');
  assert.ok(start > 0, name + ' header');
  t.forEach((row, i) => row.forEach((cell, j) => { const w = norm(rows[start + i][j + 2]); assert.equal(w, cell, `${name} (${i + 1},${j + 1})`); if (cell !== null) compared++; }));
 }
 assert.equal(compared, 830);
 const sp = wb['01_격실분류'], s0 = sp.findIndex(r => r[0] === '격실명 (국문)') + 1, dash = v => v === '—' || v == null ? null : v;
 const rows = sp.slice(s0).filter(r => r[0]);
 assert.equal(rows.length, 82);
 rows.forEach((r, i) => assert.deepEqual([r[0], r[1], dash(r[2]), dash(r[3]), dash(r[4]), dash(r[5])], SO.DATA.spaces[i], 'space ' + r[0]));
});

test('table lookup: bulkheads symmetric, decks below/above', () => {
 assert.equal(SO.lookup('CARG', 'B', 1, 6).raw, 'A-60'); assert.equal(SO.lookup('CARG', 'B', 6, 1).raw, 'A-60');
 assert.equal(SO.lookup('CARG', 'D', 3, 1).raw, 'A-60');   // T9.6 accommodation below a control station
 assert.equal(SO.lookup('CARG', 'D', 1, 3).raw, 'A-0');
 assert.equal(SO.lookup('CARG', 'B', 0, 3), null); assert.equal(SO.lookup('CARG', 'B', 12, 3), null);
});

test('room names to spaces: the word that ends the name wins', () => {
 const k = n => SO.matchName(n);
 assert.equal(k('선교화장실'), '화장실·샤워실·욕실'); assert.equal(k('선원식당'), '식당'); assert.equal(k('사관식당'), '식당');
 assert.equal(k('GALLEY'), '조리실'); assert.equal(k('ALLEY'), '통로'); assert.equal(k('GALLEY STORE'), '@store');
 assert.equal(k('비상발전기실'), '비상발전기실'); assert.equal(k('발전기실'), '기관실 — A류'); assert.equal(k('EMERGENCY GENERATOR ROOM'), '비상발전기실');
 assert.equal(k('냉동기계실'), '냉동기계실'); assert.equal(k('공조기실'), '환기·공조 기계실'); assert.equal(k('기관장실'), '선실 — 비제한 가구');
 assert.equal(k('CABIN TOILET'), '화장실·샤워실·욕실'); assert.equal(k('PAINT STORE'), '페인트 로커'); assert.equal(k('ENGINE CASING'), '기관실 — A류');
 assert.equal(k('예비실'), null);
 // area-dependent spaces and categories by ship type
 const room = (name, areaM2, isoClass) => ({ id: 'x', name, areaM2, isoClass });
 assert.equal(SO.classify(room('창고', 3)).space, '로커·소창고 — 4㎡ 미만'); assert.equal(SO.classify(room('창고', 6)).space, '로커·창고 — 4㎡ 초과');
 assert.equal(SO.classify(room('회의실', 60)).space, '공공장소 — 50㎡ 이상 · 비제한');
 assert.equal(SO.classify(room('선원침실', 10)).cat, 3);                                   // cargo ship: accommodation (3)
 assert.equal(SO.classify(room('선원침실', 10), { ship: 'P36P' }).cat, 7);                 // passenger > 36: cabin other than restricted (7)
 assert.equal(SO.classify(room('알 수 없음', 10, 'ENGINE')).space, '기관실 — A류');         // BOX ISO class when the name does not tell
 assert.equal(SO.classify(room('예비실', 10)).source, 'unclassified');
 assert.equal(SO.classify(room('예비실', 10), {}, { x: { space: '사무실' } }).cat, 3);       // the user's choice
});

test('ratings: strict alternative with a check, same use, methods IIC / IIIC', () => {
 const sp = (space, cat) => ({ space, cat });
 // CARG (2) corridor / (4) stair: "B-0|A-0^c" -> the stricter A-0, flagged
 const r = SO.rate('CARG', 'B', sp('통로', 2), sp('계단격실', 4));
 assert.equal(r.grade, 'A-0'); assert.ok(r.check.some(t => /갑판까지 연장/.test(t)));
 // (9) galley / (9) galley same use: not required; galley / paint locker (both 9): A-0
 assert.equal(SO.rate('CARG', 'B', sp('조리실', 9), sp('조리실', 9), {}, true).grade, '-');
 assert.equal(SO.rate('CARG', 'B', sp('조리실', 9), sp('페인트 로커', 9), {}, false).grade, 'A-0');
 // (3) accommodation / (3): "C^ab" - IC: C, IIC: no requirement
 assert.equal(SO.rate('CARG', 'B', sp('선실', 3), sp('사무실', 3)).grade, 'C');
 assert.equal(SO.rate('CARG', 'B', sp('선실', 3), sp('사무실', 3), { method: 'IIC' }).grade, '-');
 // unclassified -> no grade
 assert.equal(SO.rate('CARG', 'B', sp(null, null), sp('통로', 2)).grade, null);
});

test('II-2/9.7.3 penetration measures at the area limits', () => {
 const m = (g, a) => SO.measure(g, a).code;
 assert.equal(m('A-60', 0.0199), 'A-200'); assert.equal(m('A-60', 0.02), 'A-200'); assert.equal(m('A-60', 0.0201), 'A-900');
 assert.equal(m('A-0', 0.075), 'A-900'); assert.equal(m('A-0', 0.0751), 'A-FD'); assert.ok(SO.measure('A-0', 0.0751).damper);
 assert.equal(m('B-0', 0.02), 'B-SEAL'); assert.equal(m('B-15', 0.0201), 'B-900');
 assert.equal(m('C', 0.5), 'NONE'); assert.equal(m('*', 0.5), 'STAR'); assert.equal(m(null, 0.5), 'CHECK');
 assert.equal(SO.measure('A-0', 0, false).code, 'A-SIZE');
});

test('boundaries and penetrations on a small layout', () => {
 // two rooms on D1 sharing x = 4000 (with a 200 mm wall gap), a corridor below; D2 above the first room
 const R = (id, deckId, name, x0, y0, x1, y1) => ({ id, no: id, name, deckId, areaM2: (x1 - x0) * (y1 - y0) / 1e6, polygon: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [], systems: {} });
 const c = { decks: [{ id: 'D1', elevationMm: 0 }, { id: 'D2', elevationMm: 3000 }], rooms: [R('a', 'D1', '기관실', 0, 2000, 4000, 6000), R('b', 'D1', '선원침실', 4200, 2000, 8000, 6000), R('c', 'D1', '복도', 0, 0, 8000, 2000), R('d', 'D2', '사무실', 0, 2000, 4000, 6000)], systems: [] };
 const b = SO.boundaries(c), ab = b.boundaries.find(x => x.kind === 'bulkhead' && [x.roomA, x.roomB].sort().join() === 'a,b');
 assert.ok(ab, 'a|b across the 200 mm wall'); assert.equal(ab.grade, 'A-60'); assert.equal(ab.lengthMm, 4000);
 assert.ok(b.boundaries.some(x => x.kind === 'outer' && x.roomA === 'a'), 'outer walls of a');
 const deck = b.boundaries.find(x => x.kind === 'deck'); assert.equal(deck.roomA, 'a'); assert.equal(deck.roomB, 'd'); assert.equal(deck.grade, 'A-60'); assert.equal(deck.areaM2, 16);
 // a 400 x 300 duct from b into a crosses the A-60 bulkhead (> 0.075 m²): sleeve + fire damper; app coordinates are y down
 const ducts = { k: { deckId: 'D1', systemId: 'S', kind: 'supply', ducts: [{ displayName: 'M1', widthMm: 400, heightMm: 300, flowCmh: 2000, points: [{ x: 6000, y: -4000 }, { x: 2000, y: -4000 }] }] } };
 const pens = SO.penetrations(c, b, ducts);
 assert.equal(pens.length, 1); assert.equal(pens[0].grade, 'A-60'); assert.equal(pens[0].code, 'A-FD'); assert.equal(pens[0].x, 4100); assert.equal(pens[0].y, 4000);
 // a riser from D1 (room a) to D2 (room d) crosses the deck between them
 const rp = SO.penetrations(c, b, {}, [{ id: 'S:D1-D2', systemId: 'S', kind: 'supply', fromDeckId: 'D1', toDeckId: 'D2', from: { x: 2000, y: 4000 }, to: { x: 2000, y: 4000 }, widthMm: 200, heightMm: 100, flowCmh: 500 }]);
 assert.equal(rp.length, 1); assert.equal(rp[0].boundaryKind, 'deck'); assert.equal(rp[0].grade, 'A-60'); assert.equal(rp[0].code, 'A-200');
});

test('S5 and T3: rooms mostly classified, boundary counts stable', () => {
 for (const [f, maxUnclassified] of [['s5', 4], ['t3', 3]]) {
  const c = require(`../samples/${f}.contract.json`), b = SO.boundaries(c), s = SO.summary(b, []);
  assert.ok(s.unclassified.length <= maxUnclassified, `${f}: unclassified ${s.unclassified.length}`);
  assert.ok(b.boundaries.every(x => x.kind === 'deck' ? x.areaM2 > 0 : x.lengthMm >= 100), f + ' boundary sizes');
 }
 // T3: the engine casing is A-60 to the accommodation corridor on every deck
 const t3 = require('../samples/t3.contract.json'), b = SO.boundaries(t3);
 for (const d of ['D1', 'D2', 'D3']) assert.ok(b.boundaries.some(x => x.deckId === d && x.kind === 'bulkhead' && [x.aSpace, x.bSpace].includes('기관실 — A류') && [x.aSpace, x.bSpace].includes('통로') && x.grade === 'A-60'), d + ' casing / corridor A-60');
});
