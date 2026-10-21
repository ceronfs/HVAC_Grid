'use strict';
// logic review 2026-10-21 P3 items (docs/REVIEW_2026-10-21_LOGIC.md L-06..L-19) and the fire-damper allowance (external A05)
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const K = require('../lib/contract.cjs'), PJ = require('../lib/project.cjs'), PL = require('../lib/phg-plan.cjs'), RS = require('../lib/risers.cjs'), D = require('../lib/ducts.cjs');

const R = (id, name, x0, y0, x1, y1, sys, l = {}) => ({ id, no: id, name, deckId: 'D', isoClass: l.iso || 'AC', polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor: (x1 - x0) * (y1 - y0) / 1e6,
 volume: (x1 - x0) * (y1 - y0) * 2.8 / 1e6, sup: sys.s, exh: sys.e, ret: sys.r, coolingSensibleW: l.w || 0, minimumFreshAirCmh: l.oa || 0, ventilationAirCmh: l.achAir || 0, calculationComplete: true });
const make = (rooms, rules = {}, extra = {}) => { const c = K.buildContract({ source: {}, decks: [{ id: 'D', z: 0 }], rooms }, rules); return Object.keys(extra).length ? K.applyRules({ ...c, ...extra }) : c; };
const codes = (c, code) => PJ.airChecks(c).filter(x => x.code === code);
const cab = () => R('cab', '선실', 0, 0, 6000, 4000, { s: 'AHU', r: 'RA' }, { w: 2000 });

test('L-06: only the hospital\'s own sanitary rooms may share its exhaust', () => {
 const hosp = R('h', '병실', 6000, 0, 8000, 2000, { e: 'EF-HOS' }, { achAir: 200 });
 assert.equal(codes(make([cab(), hosp, R('hw', '병실 화장실', 6000, 2000, 8000, 4000, { e: 'EF-HOS' }, { achAir: 200 })]), 'EXHAUST_GROUPS').length, 0);
 assert.equal(codes(make([cab(), hosp, R('wc', '공용화장실', 6000, 2000, 8000, 4000, { e: 'EF-HOS' }, { achAir: 200 })]), 'EXHAUST_GROUPS').length, 1);
});

test('L-07: no owner floor (minOaPct null or 0) - no OA_SHARE check', () => {
 const rooms = [R('big', '선실', 0, 0, 9000, 6000, { s: 'AHU', r: 'RA' }, { w: 6000, oa: 30 }), R('wc', '선실 화장실', 9000, 0, 11000, 2000, { e: 'EF' }, { achAir: 80 })];
 for (const v of [null, 0]) assert.equal(codes(make(rooms, { minOaPct: v }), 'OA_SHARE').length, 0);
});

test('L-08: a public sanitary room on a passenger ship needs 144 CMH at least', () => {
 const rooms = [cab(), R('wc', '공용화장실', 6000, 0, 7500, 1000, { e: 'EF' }, { achAir: 100 })];   // 4.2 m³: 15 ACH = 63
 assert.equal(codes(make(rooms), 'EXHAUST_ISO').length, 0);
 assert.match(codes(make(rooms, {}, { solas: { ship: 'P36P' } }), 'EXHAUST_ISO')[0].text, /여객선 공용 위생실 max\(144 CMH, 15회\/h\) 144/);
});

test('L-09: a room with a return grille exhausting more than it is supplied is a check', () => {
 const c = make([cab(), R('dry', '건조실', 6000, 0, 8000, 4000, { s: 'AHU', e: 'EF', r: 'RA' }, { w: 200, achAir: 300 })]);
 assert.match(codes(c, 'EXHAUST_OVER_SUPPLY')[0].text, /부족한 \d+ CMH/);
});

test('L-11: an all-fresh-air zone over-pressured is a relief check, unless it serves a machinery space', () => {
 const rooms = iso => [R('a', '창고', 0, 0, 6000, 4000, { s: 'SF' }, { w: 3000, iso })];
 assert.equal(codes(make(rooms('AC')), 'RELIEF').length, 1);
 assert.equal(codes(make(rooms('ENGINE')), 'RELIEF').length, 0);
});

test('L-13: a sanitary room is named so at the end; L-15: a supply set by make-up says so', () => {
 const c = make([cab(), R('x', '선실(화장실 포함)', 6000, 0, 9000, 4000, { s: 'AHU', r: 'RA' }, { w: 900 }), R('wc', '공용화장실', 0, 4000, 2000, 6000, { e: 'EF' }, { achAir: 900 })]);
 assert.ok(!codes(c, 'EXHAUST_ISO').some(x => x.roomId === 'x'));
 const giver = c.airflow[c.airflow.wc.transferFrom]; assert.equal(giver.basis, 'makeup'); assert.ok(giver.makeupCmh > 0);
});

test('L-17: a supplied dry provision store gets the Annex E note; L-18: heating dT above 22 K is refused', () => {
 const c = make([cab(), R('st', '건식식품창고', 6000, 0, 8000, 3000, { s: 'AHU' }, { w: 90 })]);
 assert.equal(codes(c, 'ANNEX_E')[0].level, 'info');
 assert.deepEqual(K.validate({ ...c, rules: { ...c.rules, heatingSupplyDeltaTK: 25 } }), ['rules.heatingSupplyDeltaTK']);
});

test('L-19: a galley supplied as much as it exhausts is not below its neighbours', () => {
 const at = achAir => codes(make([cab(), R('g', '조리실', 6000, 0, 10000, 4000, { s: 'SF', e: 'EF' }, { w: 3000, achAir })]), 'NEG_MARGIN').length;
 assert.equal(at(900), 1); assert.equal(at(1000), 0);   // supply 900 CMH: 900 = supply, 1000 > 900 x 1.05
});

test('A05: fire dampers in a deck network add to that deck\'s pressure, shown on their own', () => {
 const c = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 't3.contract.json'), 'utf8')), plans = PL.plan(c);
 const results = Object.fromEntries(plans.map(p => [p.key, { auto: true, indexPa: 100 }]));
 const k = plans.find(p => p.systemId === 'AHU-BRG').key, sys = RS.systems(c, plans, results, D.RISER_RULES, {}, { [k]: 12.3 });
 const deck = sys.flatMap(s => s.decks).find(d => d.key === k);
 assert.equal(deck.damperPa, 12.3); assert.equal(deck.deckIndexPa, 100); assert.equal(deck.totalPa, 112.3 + deck.riserPa);
});
