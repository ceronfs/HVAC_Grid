'use strict';
// ISO 7547:2022 checks on the airflow (docs/ISO7547_CHECK.md)
const test = require('node:test'), assert = require('node:assert/strict');
const K = require('../lib/contract.cjs'), PJ = require('../lib/project.cjs');

// BOX-style input rooms, 2.8 m high
const R = (id, name, x0, y0, x1, y1, sys, l = {}) => ({ id, no: id, name, deckId: 'D', isoClass: l.iso || 'AC', polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor: (x1 - x0) * (y1 - y0) / 1e6,
 volume: (x1 - x0) * (y1 - y0) * 2.8 / 1e6, sup: sys.s, exh: sys.e, ret: sys.r, coolingSensibleW: l.w || 0, heatingW: l.h || 0, minimumFreshAirCmh: l.oa || 0, ventilationAirCmh: l.ach || 0, calculationComplete: true });
const make = (rooms, rules = {}) => K.buildContract({ source: {}, decks: [{ id: 'D', z: 0 }], rooms }, rules);
const codes = c => PJ.airChecks(c).map(x => x.code);

test('one airflow all year, the summer one; winter is the heating capacity on it (AGENTS.md)', () => {
 const c = make([R('cab', 'CABIN', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 600, h: 2200, oa: 28.8 }), R('wh', '조타실', 4000, 0, 8000, 4000, { s: 'AHU', r: 'RA' }, { w: 600, h: 2200, iso: 'WHEELHOUSE' })]);
 assert.equal(c.airflow.cab.supplyCmh, 180); assert.equal(c.airflow.cab.basis, 'cooling');   // 600 x 3 / 10; never 2200 x 3 / 22 = 300
 assert.equal(c.airflow.wh.supplyCmh, 180);
 // heating 2200 W on 180 CMH = 37 K above the room (> 22 K, 6.3): a check for supplementary heating, not more air
 const dt = PJ.airChecks(c).filter(x => x.code === 'HEATING_DT');
 assert.deepEqual(dt.map(x => x.roomId), ['cab']); assert.match(dt[0].text, /풍량은 그대로, 보조 난방/);   // the wheelhouse is heated separately (D.3.1)
 // a winter airflow rule in a file is not applied
 const old = make([R('cab', 'CABIN', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 600, h: 2200 })], { heatingSupplyDeltaTK: 22 });
 assert.equal(old.airflow.cab.supplyCmh, 180); assert.equal('heatingSupplyDeltaTK' in old.rules, false);
 assert.match(PJ.read({ ...c, rules: { ...c.rules, heatingSupplyDeltaTK: 22 } }).notes.join(' '), /겨울 풍량 규칙.*쓰지 않음/);
});

test('6.3: cooling supply dT over 15 K is flagged', () => {
 const rooms = [R('cab', 'CABIN', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 600 })];
 assert.ok(!codes(make(rooms)).includes('SUPPLY_DT'));
 assert.ok(codes(make(rooms, { supplyDeltaTK: 16 })).includes('SUPPLY_DT'));
});

test('6.4.1 exhaust by room type', () => {
 const cab = R('cab', 'CABIN', 0, 0, 6000, 4000, { s: 'AHU', r: 'RA' }, { w: 2000 });
 const at = (name, ach, sys = { e: 'EF' }, l = {}) => PJ.airChecks(make([cab, R('x', name, 6000, 0, 8000, 2000, sys, { ach, ...l })])).filter(x => x.code === 'EXHAUST_ISO' && x.roomId === 'x');
 // private toilet 11.2 m3: max(72 CMH, 10 ACH = 112) - 120 passes, 70 does not
 assert.equal(at('CABIN 5 화장실', 120).length, 0); assert.equal(at('CABIN 5 화장실', 70).length, 1);
 // public toilet, laundry, drying room: 15 ACH = 168; changing room, cleaning locker 10 ACH = 112
 assert.equal(at('공용화장실', 120).length, 1); assert.equal(at('공용화장실', 170).length, 0);
 assert.equal(at('건조실', 120).length, 1); assert.equal(at('세탁실', 170).length, 0);
 assert.equal(at('탈의실', 120).length, 0); assert.equal(at('청소도구실', 100).length, 1);
 // pantry, hospital: 20 % more than the supply
 // (supply 100 CMH from the fresh air -> 120 CMH needed)
 assert.equal(at('배식실', 110, { s: 'AHU', e: 'EF' }, { oa: 100 }).length, 1); assert.equal(at('배식실', 120, { s: 'AHU', e: 'EF' }, { oa: 100 }).length, 0);
});

test('6.4.2: hospital, sanitary, laundry and pantry exhaust on separate systems', () => {
 const cab = R('cab', 'CABIN', 0, 0, 6000, 4000, { s: 'AHU', r: 'RA' }, { w: 2000 });
 const c = make([cab, R('wc', '공용화장실', 6000, 0, 8000, 2000, { e: 'EF-SAN' }, { ach: 200 }), R('p', '배식실', 6000, 2000, 8000, 4000, { e: 'EF-SAN' }, { ach: 200 })]);
 assert.ok(PJ.airChecks(c).some(x => x.code === 'EXHAUST_GROUPS' && x.systemId === 'EF-SAN'));
 const ok = make([cab, R('wc', '공용화장실', 6000, 0, 8000, 2000, { e: 'EF-SAN' }, { ach: 200 }), R('p', '배식실', 6000, 2000, 8000, 4000, { e: 'EF-PAN' }, { ach: 200 })]);
 assert.ok(!codes(ok).includes('EXHAUST_GROUPS'));
 // the hospital's own toilet may share its exhaust (6.4.2 NOTE)
 assert.ok(!codes(make([cab, R('h', '병실', 6000, 0, 8000, 2000, { e: 'EF-HOS' }, { ach: 200 }), R('hw', '병실 화장실', 6000, 2000, 8000, 4000, { e: 'EF-HOS' }, { ach: 200 })])).includes('EXHAUST_GROUPS'));
});
