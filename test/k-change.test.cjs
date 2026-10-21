'use strict';
// lib/k-change.cjs: a K change in BOX CAL compared room by room (the list shown after ISO 적용 / LY 적용)
const test = require('node:test'), assert = require('node:assert/strict');
const KCH = require('../lib/k-change.cjs');

const room = (id, over = {}) => ({ id, no: id, name: '선실 ' + id, deck: 'A DK', deckId: 'A', polygon: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], floor: 12, volume: 30, sup: 'AHU-1', exh: null, ret: 'AHU-1',
 coolTemp: 25, coolingRh: 55, heatTemp: 21, heatingRh: 30, people: 1, activity: 'seated', lighting: 'normal', equipW: 100, minimumFreshAir: null, loadIncluded: true, windowType: 'double', windowArea: 1, windowK: 3.2,
 coolingTransmissionW: 300, heatingTransmissionW: 500, solarTransmissionW: 200, coolingSensibleW: 1500, coolingLatentW: 200, coolingW: 1700, heatingW: 900, minimumFreshAirCmh: 30, minimumAch: 0, ventilationAirCmh: 0, calculationComplete: true, ...over });
const snap = (kMode, rooms, conditions = { indoorCoolTemp: 25, externalK: 0.7 }) => ({ kMode, conditions, decks: [{ id: 'A', name: 'A DK', z: 0 }], rooms });

test('a K change: loads move, design conditions do not - the list says so', () => {
 const d = KCH.diff(snap('iso-standard', [room('1'), room('2')]), snap('calculated', [room('1', { coolingTransmissionW: 360, coolingSensibleW: 1560, coolingW: 1760, heatingW: 960 }), room('2')]), {});
 assert.equal(d.fromName, 'ISO 7547 기준 K (ISO 적용)'); assert.equal(d.toName, 'LY 구조 계산 K (LY 적용)');
 assert.deepEqual(d.inputs, []); assert.deepEqual(d.conditions, []);
 assert.equal(d.rooms.length, 1); assert.deepEqual(d.rooms[0].loads.coolingW, [1700, 1760]);
 assert.deepEqual(d.totals.coolingW, [3400, 3460]);
 const html = KCH.toHtml(d); assert.match(html, /변경 없음/); assert.match(html, /부하·풍량이 바뀐 격실 1 \/ 2/);
});

test('a design condition that moves with the K change is listed first, with a warning', () => {
 const d = KCH.diff(snap('project', [room('1')]), snap('iso-standard', [room('1', { coolTemp: 27, people: 2 })], { indoorCoolTemp: 27, externalK: 0.7 }), {});
 assert.deepEqual(d.inputs.map(x => [x.name, x.from, x.to]), [['냉방 실내 온도', 25, 27], ['재실 인원', 1, 2]]);
 assert.deepEqual(d.conditions.map(x => [x.name, x.from, x.to]), [['실내 냉방 온도', 25, 27]]);
 const html = KCH.toHtml(d); assert.match(html, /설계 조건이 바뀌었습니다/); assert.match(html, /냉방 실내 온도/);
});

test('the supply airflow is the contract\'s (rules), and markup in a room name is text', () => {
 const big = room('1', { coolingSensibleW: 3000, coolingW: 3200 }), d = KCH.diff(snap('project', [room('1', { name: '<img src=x onerror=alert(1)>' })]), snap('iso-standard', [big]), {});
 assert.ok(d.rooms[0].supplyCmh[1] > d.rooms[0].supplyCmh[0], JSON.stringify(d.rooms[0].supplyCmh));
 assert.ok(!KCH.toHtml(d).includes('<img'));
});
