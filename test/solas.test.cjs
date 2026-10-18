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

test('ratings: stairs by the decks they pass, sprinklers, same use, methods IIC / IIIC', () => {
 const sp = (space, cat, stairDecks) => ({ space, cat, stairDecks });
 // CARG (2) corridor / (4) stair "B-0|A-0^c" (II-2/9.2.3.4): a stair through more than one deck A-0; through one deck B-0, flagged
 const multi = SO.rate('CARG', 'B', sp('통로', 2), sp('계단격실', 4, 3));
 assert.equal(multi.grade, 'A-0'); assert.deepEqual(multi.check, []);
 const single = SO.rate('CARG', 'B', sp('통로', 2), sp('계단격실', 4, 1));
 assert.equal(single.grade, 'B-0'); assert.ok(single.check.some(t => /갑판 하나만 관통/.test(t)));
 // P36M (9.3): "A-15|A-0^d" by sprinklers - none: the larger, both sides: the smaller; never silent
 const cell = SO.lookup('P36M', 'B', 2, 9); assert.equal(cell.raw, 'A-15|A-0^d');
 const noSpr = SO.rate('P36M', 'B', sp('통로', 2), sp('조리실', 9)), spr = SO.rate('P36M', 'B', sp('통로', 2), sp('조리실', 9), { sprinkler: true });
 assert.equal(noSpr.grade, 'A-15'); assert.equal(spr.grade, 'A-0'); assert.ok(noSpr.check.length && spr.check.length);
 // P36M "A-0^a|B-0^e" (corridor / stair) is the stair rule, not the sprinkler rule
 assert.equal(SO.rate('P36M', 'B', sp('통로', 2), sp('계단격실', 4, 2), { sprinkler: true }).grade, 'A-0');
 // (9) galley / (9) galley same use: not required; galley / paint locker (both 9): A-0
 assert.equal(SO.rate('CARG', 'B', sp('조리실', 9), sp('조리실', 9), {}, true).grade, '-');
 assert.equal(SO.rate('CARG', 'B', sp('조리실', 9), sp('페인트 로커', 9), {}, false).grade, 'A-0');
 // (3) accommodation / (3): "C^ab" - IC: C, IIC: no requirement
 assert.equal(SO.rate('CARG', 'B', sp('선실', 3), sp('사무실', 3)).grade, 'C');
 assert.equal(SO.rate('CARG', 'B', sp('선실', 3), sp('사무실', 3), { method: 'IIC' }).grade, '-');
 // P36P note a (same category): only flagged, the grade stays
 const p = SO.rate('P36P', 'B', sp('제어', 1), sp('제어', 1), {}, true); assert.equal(p.grade, 'B-0'); assert.ok(p.check.some(t => /주관청/.test(t)));
 // unclassified -> no grade; an unknown ship type falls back to the cargo ship tables
 assert.equal(SO.rate('CARG', 'B', sp(null, null), sp('통로', 2)).grade, null);
 assert.equal(SO.rate('BOAT', 'B', sp('통로', 2), sp('기관실 — A류', 6)).grade, 'A-60');
});

test('II-2/9.7.3 penetration measures at the area limits', () => {
 const m = (g, a) => SO.measure(g, a).code;
 assert.equal(m('A-60', 0.0199), 'A-200'); assert.equal(m('A-60', 0.02), 'A-200'); assert.equal(m('A-60', 0.0201), 'A-900');
 assert.equal(m('A-0', 0.075), 'A-900'); assert.equal(m('A-0', 0.0751), 'A-FD'); assert.ok(SO.measure('A-0', 0.0751).damper);
 assert.equal(m('B-0', 0.02), 'B-SEAL'); assert.equal(m('B-15', 0.0201), 'B-900');
 assert.equal(m('C', 0.5), 'NONE'); assert.equal(m('*', 0.5), 'STAR'); assert.equal(m(null, 0.5), 'CHECK');
 assert.equal(SO.measure('A-0', 0, false).code, 'A-SIZE');
 // A-0 needs no insulation, A-60 does
 assert.ok(!/단열/.test(SO.measure('A-0', 0.05).text)); assert.match(SO.measure('A-60', 0.05).text, /A-60 단열/);
});

const R = (id, deckId, name, x0, y0, x1, y1, holes = []) => ({ id, no: id, name, deckId, areaM2: (x1 - x0) * (y1 - y0) / 1e6, polygon: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes, systems: {} });

test('boundaries and penetrations on a small layout', () => {
 // two rooms on D1 sharing x = 4000 (with a 200 mm wall gap), a corridor below; D2 above the first room
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
 // the model's edge: D1 floor (lowest deck) is held until "below" is set; with machinery below it is A-60 (Table 9.6 (6)/(6))
 assert.ok(b.boundaries.some(x => x.kind === 'floor' && x.roomB === 'a' && x.grade === null && x.check.length));
 const lb = SO.boundaries({ ...c, solas: { lowestBelow: '기관실 — A류' } }).boundaries.find(x => x.kind === 'floor' && x.roomB === 'b');
 assert.equal(lb.grade, 'A-60');
 // D1 rooms not under D2 have an exposed ceiling (open deck above); D2 has a roof
 assert.ok(b.boundaries.some(x => x.kind === 'ceiling' && x.roomA === 'b'));
 assert.ok(b.boundaries.some(x => x.kind === 'ceiling' && x.roomA === 'd'));
});

test('crossings: a vertex on the wall, touching, along the wall, T-junctions', () => {
 const A = { x: 4000, y: 0 }, B = { x: 4000, y: 6000 };
 // straight through with a vertex exactly on the wall: one crossing
 assert.equal(SO.polyCrossings([{ x: 6000, y: 2000 }, { x: 4000, y: 2000 }, { x: 2000, y: 2000 }], A, B).length, 1);
 // turning on the wall into the other room: one crossing
 assert.equal(SO.polyCrossings([{ x: 6000, y: 2000 }, { x: 4000, y: 2000 }, { x: 4000, y: 3000 }, { x: 2000, y: 3000 }], A, B).length, 1);
 // touching the wall and going back: none; running along it: none
 assert.equal(SO.polyCrossings([{ x: 6000, y: 2000 }, { x: 4000, y: 2000 }, { x: 6000, y: 3000 }], A, B).length, 0);
 assert.equal(SO.polyCrossings([{ x: 4000, y: 1000 }, { x: 4000, y: 5000 }], A, B).length, 0);
 // past the end of the wall: none
 assert.equal(SO.polyCrossings([{ x: 6000, y: 7000 }, { x: 2000, y: 7000 }], A, B).length, 0);
 // T-junction: a duct through the point where two boundaries meet is one penetration, with the stricter grade
 const c = { decks: [{ id: 'D', elevationMm: 0 }], rooms: [R('a', 'D', '기관실', 0, 0, 4000, 4000), R('b', 'D', '선원침실', 4000, 0, 8000, 4000), R('c', 'D', '복도', 0, 4000, 8000, 6000)], systems: [] };
 const b = SO.boundaries(c), pens = SO.penetrations(c, b, { k: { deckId: 'D', systemId: 'S', kind: 'supply', ducts: [{ widthMm: 200, heightMm: 100, flowCmh: 300, points: [{ x: 2000, y: -5000 }, { x: 6000, y: -3000 }] }] } });
 assert.equal(pens.filter(p => p.x === 4000 && p.y === 4000).length, 1); assert.equal(pens.find(p => p.x === 4000).grade, 'A-60');
});

test('rooms with holes: the hole room gets its bulkheads, an empty hole is held', () => {
 const hole = [{ x: 2000, y: 2000 }, { x: 4000, y: 2000 }, { x: 4000, y: 4000 }, { x: 2000, y: 4000 }];
 const c = { decks: [{ id: 'D', elevationMm: 0 }], rooms: [R('cor', 'D', '복도', 0, 0, 6000, 6000, [hole]), R('er', 'D', '기관실 케이싱', 2000, 2000, 4000, 4000)], systems: [] };
 const b = SO.boundaries(c).boundaries.filter(x => x.kind === 'bulkhead');
 assert.equal(b.length, 4); assert.ok(b.every(x => x.grade === 'A-60'));
 const empty = SO.boundaries({ ...c, rooms: [c.rooms[0]] }).boundaries.filter(x => x.kind === 'void');
 assert.equal(empty.length, 4); assert.ok(empty.every(x => x.grade === null && x.check.length));
});

test('small shafts make deck boundaries; risers outside a trunk are flagged', () => {
 const c = { decks: [{ id: 'A', elevationMm: 0 }, { id: 'B', elevationMm: 3000 }], rooms: [R('t1', 'A', '덕트 트렁크', 0, 0, 700, 700), R('t2', 'B', '덕트 트렁크', 0, 0, 700, 700), R('m', 'A', '선원식당', 700, 0, 4000, 3000), R('n', 'B', '선원침실', 700, 0, 4000, 3000)], systems: [] };
 const b = SO.boundaries(c);
 assert.ok(b.boundaries.some(x => x.kind === 'deck' && x.roomA === 't1' && x.roomB === 't2'), '0.49 m² trunk');
 const riser = (x, y) => ({ id: 'S:A-B', systemId: 'S', kind: 'supply', fromDeckId: 'A', toDeckId: 'B', from: { x, y }, to: { x, y }, widthMm: 300, heightMm: 200, flowCmh: 1000 });
 const inTrunk = SO.penetrations(c, b, {}, [riser(350, 350)]), inMess = SO.penetrations(c, b, {}, [riser(2000, 1500)]);
 assert.equal(inTrunk[0].note, null); assert.match(inMess[0].note, /샤프트/);
});

test('restricted spaces passed, separation warnings, check lists', () => {
 const t3 = require('../samples/t3.contract.json'), PL = require('../lib/phg-plan.cjs'), b = SO.boundaries(t3), plans = PL.plan(t3);
 // a supply duct of AHU-ACC drawn straight through the casing on D1
 const p = plans.find(x => x.key === 'D1__AHU-ACC'), geom = { [p.key]: { ducts: [{ points: [{ x: 500, y: -8000 }, { x: 500, y: -1000 }] }] } };
 const pass = SO.passages(t3, plans, geom, b.classes);
 assert.ok(pass.some(x => x.level === 'fail' && x.space === '기관실 — A류'), 'casing passed');
 // a galley system that also serves a toilet: separation warning; galley + its pantry: none
 const sys = (rooms) => ({ ...t3, systems: [{ id: 'X', kind: 'exhaust', deckIds: ['D1'], roomIds: rooms }] });
 const id = no => t3.rooms.find(r => r.no === no).id;
 assert.equal(SO.systemWarnings(sys([id('114'), id('122')]), b).length, 0);
 assert.equal(SO.systemWarnings(sys([id('114'), id('106')]), b).length, 1);
 // check lists: galley exhaust 9.7.5, battery and CO2 rooms on their own systems, II-2/5.2 for all
 const list = SO.checklist(t3, b, []);
 assert.ok(list.some(x => x.rule === 'II-2/9.7.5')); assert.ok(list.some(x => x.rule === 'II-2/5.2.1'));
 assert.ok(!list.some(x => x.level === 'fail'), 'T3 v2: battery and CO2 rooms on their own exhaust');
});

test('S5 and T3: classification and boundary sizes', () => {
 for (const [f, maxUnclassified] of [['s5', 3], ['t3', 0]]) {
  const c = require(`../samples/${f}.contract.json`), b = SO.boundaries(c), s = SO.summary(b, []);
  assert.ok(s.unclassified.length <= maxUnclassified, `${f}: unclassified ${s.unclassified.length}`);
  assert.ok(b.boundaries.every(x => x.areaM2 != null ? x.areaM2 > 0 : x.lengthMm >= 100), f + ' boundary sizes');
 }
 // control stations: navigation / radio equipment rooms (II-2/3.18); duct trunks with the ventilation spaces
 assert.equal(SO.matchName('항해장비실'), '항해·통신 장비실 (제어장소)'); assert.equal(SO.matchName('GMDSS실'), '항해·통신 장비실 (제어장소)');
 assert.equal(SO.matchName('덕트 트렁크'), '덕트 트렁크'); assert.equal(SO.matchName('승강기 트렁크'), '승강기 트렁크'); assert.equal(SO.matchName('비상탈출트렁크'), '비상탈출트렁크');
 // stores of exactly 4 m² are high-risk (>= 4 m²)
 assert.equal(SO.classify({ id: 'x', name: '창고', areaM2: 4 }).space, '로커·창고 — 4㎡ 초과');
 // T3: the casing is A-60 to the corridor on every deck; the stairs span all four decks (A-0 to the corridor, no check)
 const t3 = require('../samples/t3.contract.json'), b = SO.boundaries(t3);
 for (const d of ['D1', 'D2', 'D3']) assert.ok(b.boundaries.some(x => x.deckId === d && x.kind === 'bulkhead' && [x.aSpace, x.bSpace].includes('기관실 — A류') && [x.aSpace, x.bSpace].includes('통로') && x.grade === 'A-60'), d + ' casing / corridor A-60');
 assert.ok(Object.values(b.stairDecks).every(n => n === 4));
 assert.ok(b.boundaries.filter(x => x.kind === 'bulkhead' && [x.aSpace, x.bSpace].includes('계단격실') && [x.aSpace, x.bSpace].includes('통로')).every(x => x.grade === 'A-0'));
});
