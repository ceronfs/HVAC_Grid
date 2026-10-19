'use strict';
// regressions for the third review (docs/REVIEW.md, round 3)
const test = require('node:test'), assert = require('node:assert/strict');
const K = require('../lib/contract.cjs');

// BOX-style input rooms (polygons as [x, y] arrays; the contract stores {x, y})
const R = (id, name, x0, y0, x1, y1, sys, l) => ({ id, no: id, name, deckId: 'D', polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor: (x1 - x0) * (y1 - y0) / 1e6, volume: (x1 - x0) * (y1 - y0) * 2.8 / 1e6,
 sup: sys.s, exh: sys.e, ret: sys.r, coolingSensibleW: l.w || 0, minimumFreshAirCmh: l.oa || 0, ventilationAirCmh: l.ach || 0, calculationComplete: true });
const make = (rooms, rules = {}, extra = {}) => { const c = K.buildContract({ source: {}, decks: [{ id: 'D', z: 0 }], rooms }, rules); return Object.keys(extra).length ? K.applyRules({ ...c, ...extra }) : c; };

test('R3-01: a room wrapped on 40 % of its perimeter by a cabin takes its air from the cabin', () => {
 // 2 x 2 m "WC" (no name link), the cabin wraps two sides (4 m of 8 m), the corridor shares 2 m
 const rooms = [R('cab', 'CABIN 5', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 1500 }), R('wc', 'WC', 2000, 2000, 4000, 4000, { e: 'EF' }, { ach: 100 }),
  R('cor', 'CORRIDOR', 0, 4000, 8000, 6000, { s: 'AHU', r: 'RA' }, { w: 600 })];
 // the cabin polygon is the L around the WC
 rooms[0].polygon = [[0, 0], [4000, 0], [4000, 2000], [2000, 2000], [2000, 4000], [0, 4000]];
 assert.equal(make(rooms).airflow.wc.transferFrom, 'cab');
});

test('R3-04: a zone supplied mostly as make-up air still balances', () => {
 // a corridor that only feeds two public toilets: its supply is the make-up
 const rooms = [R('cor', '복도', 0, 4000, 10000, 6000, { s: 'AHU', r: 'RA' }, { w: 100 }), R('wc1', '공용화장실', 0, 0, 3000, 4000, { e: 'EF' }, { ach: 700 }), R('wc2', '샤워실', 3000, 0, 6000, 4000, { e: 'EF' }, { ach: 700 })];
 const c = make(rooms), z = c.zones.find(x => x.supplySystemId === 'AHU');
 assert.ok(z.ok, JSON.stringify(z)); assert.ok(z.saCmh >= z.oaNeedCmh);
});

test('R3-08: a room the user set as a stair never gives transfer air', () => {
 const rooms = [R('st', '홀', 0, 0, 3000, 4000, { s: 'AHU' }, { w: 3000 }), R('wc', '화장실', 3000, 0, 5000, 4000, { e: 'EF' }, { ach: 100 }), R('cor', '복도', 5000, 0, 9000, 1500, { s: 'AHU', r: 'RA' }, { w: 600 })];
 assert.equal(make(rooms).airflow.wc.transferFrom, 'st');   // by name a lobby: the longest wall
 const set = make(rooms, {}, { solas: { rooms: { st: { space: '계단격실' } } } });
 assert.equal(set.airflow.wc.transferFrom, 'cor');
});

test('R3-ENG-03: pressurization on the exhaust or on the supply', () => {
 const rooms = [R('cab', '선원침실', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 6000, oa: 30 }), R('wc', '선원침실 화장실', 4000, 0, 6000, 2000, { e: 'EF' }, { ach: 60 })];
 const ex = make(rooms, { minOaPct: 0 }).zones[0], sup = make(rooms, { pressurizationBasis: 'supply', pressurizationPct: 5, minOaPct: 0 }).zones[0];
 assert.equal(make(rooms).zones[0].oaNeedCmh, Math.ceil(make(rooms).zones[0].saCmh * 0.25));   // the owner's 25 % share is a floor
 assert.equal(ex.oaNeedCmh, Math.ceil(ex.eaCmh * 1.05));
 assert.equal(sup.oaNeedCmh, Math.ceil(sup.eaCmh + sup.saCmh * 0.05));
 assert.deepEqual(K.validate({ ...make(rooms), rules: { ...make(rooms).rules, pressurizationBasis: 'x' } }), ['rules.pressurizationBasis']);
});

test('R3-03: a duct through a space the model leaves out is a check, beyond the deck outline a fail', () => {
 const SO = require('../lib/solas.cjs'), Q = (id, x0, y0, x1, y1) => ({ id, no: id, name: '선원침실', deckId: 'D', areaM2: (x1 - x0) * (y1 - y0) / 1e6, polygon: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [], systems: {} });
 // four rooms round an empty 3 x 3 m square (a pipe duct or a lobby not drawn)
 const c = { decks: [{ id: 'D', elevationMm: 0 }], rooms: [Q('w', 0, 0, 3000, 9000), Q('e', 6000, 0, 9000, 9000), Q('s', 3000, 0, 6000, 3000), Q('n', 3000, 6000, 6000, 9000)], systems: [] };
 const b = SO.boundaries(c), plan = { key: 'D__S', deckId: 'D', systemId: 'S', kind: 'supply', rus: [], rootRoomId: null };
 const run = pts => SO.passages(c, [plan], { D__S: { ducts: [{ points: pts.map(([x, y]) => ({ x, y: -y })) }] } }, b.classes);
 const inner = run([[3500, 4500], [5500, 4500]]); assert.equal(inner.length, 1); assert.equal(inner[0].level, 'check'); assert.ok(inner[0].unmodelled);
 const outer = run([[1000, 10500], [8000, 10500]]); assert.equal(outer.length, 1); assert.equal(outer[0].level, 'fail'); assert.ok(outer[0].outside);
 const sum = SO.summary(b, [], inner.concat(outer)); assert.ok(sum.outsideM > 6 && sum.unmodelledM > 1); assert.equal(sum.passagesCheck, 0);
});

test('R3-07: duct geometry in a project file is capped', () => {
 const PJ = require('../lib/project.cjs'), PL = require('../lib/phg-plan.cjs'), c = require('../samples/t3.contract.json'), key = PL.plan(c)[0].key;
 const ducts = Array.from({ length: 6000 }, (_, i) => ({ points: Array.from({ length: 600 }, (_, j) => ({ x: i, y: j })) }));
 const r = PJ.read({ schema: PJ.SCHEMA, contract: c, projects: {}, results: {}, geometry: { [key]: { ducts } } });
 const g = r.project.geometry[key]; assert.equal(g.ducts.length, 5000); assert.equal(g.ducts[0].points.length, 500); assert.ok(r.notes.some(n => /한도/.test(n)));
});
