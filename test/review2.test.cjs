'use strict';
// regressions for the second review (docs/REVIEW.md, round 2)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const SO = require('../lib/solas.cjs'), K = require('../lib/contract.cjs'), PL = require('../lib/phg-plan.cjs'), PJ = require('../lib/project.cjs');
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8'));
const R = (id, deckId, name, x0, y0, x1, y1) => ({ id, no: id, name, deckId, areaM2: (x1 - x0) * (y1 - y0) / 1e6, polygon: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [], systems: {} });
// app coordinates are y down
const app = pts => pts.map(([x, y]) => ({ x, y: -y }));
const two = { decks: [{ id: 'D', elevationMm: 0 }], rooms: [R('a', 'D', '기관실', 0, 0, 4000, 4000), R('b', 'D', '선원침실', 4000, 0, 8000, 4000)], systems: [] };
const net = ducts => ({ k: { deckId: 'D', systemId: 'S', kind: 'supply', ducts: ducts.map((p, i) => ({ displayName: 'M' + i, widthMm: 400, heightMm: 300, flowCmh: 1000, points: app(p) })) } });

test('R2-01: duct records split on a wall still cross it (once per node)', () => {
 const b = SO.boundaries(two);
 // PHG D splits the main at a reducer that lies on the wall: two records meet at (4000, 2000)
 const split = SO.penetrations(two, b, net([[[6000, 2000], [4000, 2000]], [[4000, 2000], [2000, 2000]]]));
 assert.equal(split.length, 1); assert.equal(split[0].x, 4000); assert.equal(split[0].y, 2000); assert.equal(split[0].grade, 'A-60');
 // a tee on the wall: the main goes on in b, the branch into a - one crossing
 const tee = SO.penetrations(two, b, net([[[6000, 2000], [4000, 2000]], [[4000, 2000], [6000, 3000]], [[4000, 2000], [2000, 2000]]]));
 assert.equal(tee.length, 1);
 // both records stay in b (touching the wall): none
 assert.equal(SO.penetrations(two, b, net([[[6000, 2000], [4000, 2000]], [[4000, 2000], [6000, 3000]]])).length, 0);
});

test('R2-07: a duct along the wall crosses where it leaves the wall', () => {
 const x = SO.polyCrossings([{ x: 6000, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3000 }, { x: 2000, y: 3000 }], { x: 4000, y: 0 }, { x: 4000, y: 4000 });
 assert.equal(x.length, 1); assert.deepEqual([x[0].x, x[0].y], [4000, 3000]);
});

test('R2-08: no direct bulkhead across a thin room between two rooms', () => {
 const c = { decks: [{ id: 'D', elevationMm: 0 }], rooms: [R('a', 'D', '기관실', 0, 0, 4000, 4000), R('t', 'D', '덕트 트렁크', 4000, 0, 4200, 4000), R('b', 'D', '선원침실', 4200, 0, 8000, 4000)], systems: [] };
 const pairs = SO.boundaries(c).boundaries.filter(x => x.kind === 'bulkhead').map(x => [x.roomA, x.roomB].sort().join());
 assert.ok(!pairs.includes('a,b'), pairs.join(' ')); assert.ok(pairs.includes('a,t')); assert.ok(pairs.includes('b,t'));
});

test('R2-02: stairs by the decks they penetrate, model edge flagged', () => {
 const deck = (id, z) => ({ id, elevationMm: z }), st = d => R('s' + d, d, '계단실', 0, 0, 2000, 3000), cor = d => R('c' + d, d, '통로', 2000, 0, 8000, 3000);
 const c = { decks: [deck('A', 0), deck('B', 3000), deck('C', 6000), deck('D', 9000)], rooms: [st('B'), st('C'), cor('A'), cor('B'), cor('C'), cor('D'), R('xA', 'A', '선원침실', 0, 0, 2000, 3000), R('xD', 'D', '선원침실', 0, 0, 2000, 3000)], systems: [] };
 const b = SO.boundaries(c), wall = d => b.boundaries.find(x => x.kind === 'bulkhead' && [x.roomA, x.roomB].includes('s' + d));
 // B-C: the stair spans two decks inside the model (one deck penetrated): B-0, flagged
 assert.equal(wall('B').grade, 'B-0'); assert.ok(wall('B').check.some(t => /갑판 하나만 관통/.test(t)));
 // a stair on C and D, D the model's top deck (it may go on above): the stricter value, flagged; B-C-D: two decks, A-0
 const top = { ...c, rooms: c.rooms.filter(r => !['xD', 'sB'].includes(r.id)).concat(st('D'), R('xB', 'B', '선원침실', 0, 0, 2000, 3000)) }, bt = SO.boundaries(top).boundaries.find(x => x.kind === 'bulkhead' && [x.roomA, x.roomB].includes('sC'));
 assert.equal(bt.grade, 'A-0'); assert.ok(bt.check.some(t => /모델 끝/.test(t)));
 const three = { ...c, rooms: c.rooms.filter(r => r.id !== 'xD').concat(st('D')) }, b3 = SO.boundaries(three).boundaries.find(x => x.kind === 'bulkhead' && [x.roomA, x.roomB].includes('sB'));
 assert.equal(b3.grade, 'A-0'); assert.deepEqual(b3.check, []);
});

test('R2-ENG-01: ducts outside every room fail, with their length', () => {
 const t3 = load('t3.contract.json'), b = SO.boundaries(t3), plans = PL.plan(t3), p = plans.find(x => x.key === 'D1__AHU-ACC');
 const pass = SO.passages(t3, plans, { [p.key]: { ducts: [{ points: app([[19000, 2000], [24000, 2000], [24000, 6000], [19000, 6000]]) }] } }, b.classes);
 const out = pass.find(x => x.outside); assert.ok(out); assert.equal(out.level, 'fail'); assert.ok(out.lengthM >= 11 && out.lengthM <= 12, String(out.lengthM));   // 4 + 4 + 4 m less 300 mm at each wall
 const sum = SO.summary(b, [], pass); assert.equal(sum.outsideM, out.lengthM); assert.equal(sum.passagesFail, pass.filter(x => x.level === 'fail' && !x.outside).length);
 // the plan sends the outside of the deck to PHG D as forbidden zones (a 10 m frame at least)
 assert.ok(p.outside.length >= 4);
 // a 200 mm wall gap between two rooms is not outside (only the frame round them); a 2 m notch is
 const room = (x0, x1, y1 = 4000) => ({ polygon: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] });
 assert.equal(PL.outsideOf([room(0, 4000), room(4200, 8000)]).length, 4);
 assert.ok(PL.outsideOf([room(0, 4000), room(4000, 6000, 2000), room(6000, 10000)]).length > 4);
});

test('R2-ENG-02: transfer air - en-suite rooms, user choice, stairs and restricted rooms never give air', () => {
 const R2 = (id, name, x0, y0, x1, y1, sys, l) => ({ id, no: id, name, deckId: 'D', polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor: (x1 - x0) * (y1 - y0) / 1e6, volume: (x1 - x0) * (y1 - y0) * 2.8 / 1e6,
  sup: sys.s, exh: sys.e, ret: sys.r, coolingSensibleW: l.w || 0, minimumFreshAirCmh: l.oa || 0, ventilationAirCmh: l.ach || 0, calculationComplete: true });
 const make = (rooms, transfers) => { const c = K.buildContract({ source: {}, decks: [{ id: 'D', z: 0 }], rooms }); return transfers ? K.applyRules({ ...c, transfers }) : c; };
 // the toilet shares 2000 mm with the corridor and 2000 mm with the cabin, but it is named after the cabin: the cabin
 const rooms = [R2('cab', '선원침실', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 1500 }), R2('wc', '선원침실 화장실', 4000, 2000, 6000, 4000, { e: 'EF' }, { ach: 100 }),
  R2('cor', '복도', 0, 4000, 10000, 6000, { s: 'AHU', r: 'RA' }, { w: 600 }), R2('st', '계단실', 6000, 0, 8000, 4000, { s: 'AHU' }, { w: 900 })];
 assert.equal(make(rooms).airflow.wc.transferFrom, 'cab');
 // a public toilet beside the stair and the corridor: never the stair
 const pub = rooms.map(r => r.id === 'wc' ? { ...r, name: '공용화장실' } : r), a = make(pub).airflow;
 assert.equal(a.wc.transferFrom, 'cor');
 // the user's choice wins, and is marked
 const u = make(pub, { wc: 'own-inlet' }).airflow.wc; assert.equal(u.transferFrom, 'own-inlet'); assert.equal(u.transferSet, true);
 assert.deepEqual(K.validate(make(pub, { wc: 'nope' })), ['transfers']);
});

test('R2-04 / R2-09: read recomputes derived values; coordinates are bounded', () => {
 const c = load('t3.contract.json'), wrong = JSON.parse(JSON.stringify(c)); wrong.airflow[c.rooms[0].id].supplyCmh = 99999;
 const r = PJ.read(wrong); assert.equal(r.project.contract.airflow[c.rooms[0].id].supplyCmh, c.airflow[c.rooms[0].id].supplyCmh); assert.ok(r.notes.some(n => /다시 계산/.test(n)));
 const far = JSON.parse(JSON.stringify(c)); far.rooms[0].polygon[0].x = 5e6; assert.ok(K.validate(far).some(p => /polygon/.test(p)));
});

test('R2-06: RUs of different plans in one room never share a point', () => {
 for (const f of ['s5.contract.json', 't3.contract.json']) {
  const by = {}; for (const p of PL.plan(load(f))) for (const u of p.rus) (by[u.roomId] = by[u.roomId] || []).push(u);
  for (const us of Object.values(by)) for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) assert.ok(Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y) >= 400, `${f} ${us[i].id} ${us[j].id}`);
 }
});
