'use strict';
// regressions for the logic review of 2026-10-21 (docs/REVIEW_2026-10-21_LOGIC.md, L-01..L-05)
const test = require('node:test'), assert = require('node:assert/strict');
const K = require('../lib/contract.cjs'), PJ = require('../lib/project.cjs'), SO = require('../lib/solas.cjs');

const R = (id, name, x0, y0, x1, y1, sys, l = {}) => ({ id, no: id, name, deckId: 'D', isoClass: l.iso || 'AC', polygon: l.poly || [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
 floor: (x1 - x0) * (y1 - y0) / 1e6, volume: (x1 - x0) * (y1 - y0) * 2.8 / 1e6, ceilingHeight: l.ceil || 0, sup: sys.s, exh: sys.e, ret: sys.r,
 coolingSensibleW: l.w || 0, heatingW: l.h || 0, minimumFreshAirCmh: l.oa || 0, minimumAch: l.ach || 0, ventilationAirCmh: l.achAir || 0, calculationComplete: true });
const make = (rooms, rules = {}) => K.buildContract({ source: {}, decks: [{ id: 'D', z: 0 }], rooms }, rules);
const checks = (c, code) => PJ.airChecks(c).filter(x => x.code === code);

test('L-01: an ENGINEER is a cabin, not the engine room', () => {
 const c = make([R('ce', 'CHIEF ENGINEER', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 900 }), R('wc', 'CHIEF ENGINEER W.C.', 4000, 0, 6000, 2000, { e: 'EF' }, { achAir: 120 }),
  R('er', 'ENGINE ROOM', 0, 4000, 6000, 8000, { s: 'SF' }, { w: 900, iso: 'ENGINE' })]);
 assert.equal(c.airflow.wc.transferFrom, 'ce');                                  // the cabin gives its toilet the air
 assert.deepEqual(checks(c, 'MACHINERY_RULE').map(x => x.roomId), ['er']);
 assert.equal(SO.matchName('CHIEF ENGINEER'), '선실 — 비제한 가구'); assert.equal(SO.matchName('2ND ENGINEER'), '선실 — 비제한 가구');
 assert.equal(SO.matchName('ENGINE ROOM'), '기관실 — A류'); assert.equal(SO.matchName('ENGINE CASING'), '기관실 — A류');
 assert.equal(SO.matchName('MATERIAL STORE'), '@store');                         // MATE only as a word
});

test('L-02: the ISO exhaust check uses the volume the exhaust was taken over', () => {
 // 4 m² toilet, no BOX ceiling height, rules.defaultCeilingMm 2200: 10 ACH x 8.8 m³ = 88 -> 90 CMH; need max(72, 88)
 const rooms = [R('cab', '선실', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 900, poly: [[0, 0], [4000, 0], [4000, 4000], [2000, 4000], [2000, 2000], [0, 2000]] }),
  R('wc', '선실 화장실', 0, 2000, 2000, 4000, { e: 'EF' }, { ach: 10, achAir: 112 })];
 const c = make(rooms, { defaultCeilingMm: 2200 });
 assert.equal(c.airflow.wc.exhaustCmh, 90); assert.equal(K.achVolumeM3(c.rooms[1], c.rules), 8.8);
 assert.equal(checks(c, 'EXHAUST_ISO').length, 0);
});

test('L-03: no pressure fail for a room that gives transfer air; a check only for rooms 6.5 does not name', () => {
 // a corridor with its own exhaust grille feeding a public toilet: its make-up supply is over its exhaust on purpose
 const c = make([R('cor', '복도', 0, 0, 8000, 2000, { s: 'AHU', e: 'EF' }, { w: 900, achAir: 150 }), R('wc', '공용화장실', 0, 2000, 2000, 4000, { e: 'EF' }, { achAir: 170 }),
  R('cab', '선실', 2000, 2000, 8000, 6000, { s: 'AHU', r: 'RA' }, { w: 600 })]);
 assert.ok(c.airflow.cor.transferOutCmh > 0); assert.equal(checks(c, 'NEG_PRESSURE').length, 0);
 // laundry supplied over its exhaust: a check; a galley: a fail
 const at = name => checks(make([R('x', name, 0, 0, 4000, 5000, { s: 'AHU', e: 'EF' }, { w: 3000, achAir: 840 })]), 'NEG_PRESSURE')[0]?.level;
 assert.equal(at('세탁실'), 'check'); assert.equal(at('조리실'), 'fail'); assert.equal(at('배식실'), 'fail'); assert.equal(at('공용화장실'), 'fail');
});

test('L-04: a sanitary room is private only when it belongs to a room', () => {
 const cab = R('cab', '선원침실 01', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 1500, poly: [[0, 0], [4000, 0], [4000, 4000], [2000, 4000], [2000, 2000], [0, 2000]] });
 const cor = R('cor', '복도', 0, 4000, 8000, 6000, { s: 'AHU', r: 'RA' }, { w: 900 });
 // 4 m² x 2.8 = 11.2 m³ at 120 CMH (10.7 ACH): enough for an en-suite toilet (max(72, 112)), not for a common one (168)
 const c = make([cab, cor, R('wc', '선원침실 01 화장실', 0, 2000, 2000, 4000, { e: 'EF' }, { achAir: 120 }), R('pub', '샤워실', 4000, 2000, 6000, 4000, { e: 'EF' }, { achAir: 120 })]);
 assert.equal(c.airflow.wc.transferEnsuite, true); assert.ok(!c.airflow.pub.transferEnsuite);
 assert.deepEqual(checks(c, 'EXHAUST_ISO').map(x => x.roomId), ['pub']);
 assert.match(checks(c, 'EXHAUST_ISO')[0].text, /공용 위생실 15회\/h 168 CMH/);
});

test('L-05: the room fresh-air suggestion holds when followed; rounding is not a shortage', () => {
 // a mess (10 persons, 288 CMH) with little load in a recirculating zone on the 25 % floor (a big hall without people
 // sets the supply), cabins at 110 CMH
 const rooms = [R('mess', '선원식당', 0, 0, 6000, 4000, { s: 'AHU', r: 'RA' }, { w: 300, oa: 288 }), R('hall', '홀', 0, 4000, 18000, 8000, { s: 'AHU', r: 'RA' }, { w: 15000 }),
  ...[0, 1, 2].map(i => R('c' + i, '선실 ' + i, 6000 + 4000 * i, 0, 10000 + 4000 * i, 4000, { s: 'AHU', r: 'RA' }, { w: 366, oa: 28.8 }))];
 const c = make(rooms), x = checks(c, 'ROOM_OA').find(y => y.roomId === 'mess');
 assert.equal(c.zones[0].oaPct, 25); assert.equal(c.airflow.c0.supplyCmh, 110);
 const s = +x.text.match(/급기 (\d+) CMH 이상/)[1];
 // follow it: the mess at that supply (as the cooling rule would give) gets its fresh air from the zone balance
 rooms[0].coolingSensibleW = s * 10 / 3 / 1.0;
 const c2 = make(rooms), z = c2.zones[0];
 assert.equal(c2.airflow.mess.supplyCmh, s); assert.ok(s * z.oaCmh / z.saCmh >= 288, `${s} x ${z.oaPct} %`);
 assert.ok(!checks(c2, 'ROOM_OA').some(y => y.roomId === 'mess'));
 // a cabin 1.3 CMH short at a 25 % share (110 x 25 % = 27.5 < 28.8) is within one 10 CMH step: no check
 assert.ok(!checks(c, 'ROOM_OA').some(y => /^c/.test(y.roomId)));
});
