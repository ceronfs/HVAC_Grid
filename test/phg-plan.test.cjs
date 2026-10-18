'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { plan, roomRus, inside, deckDxf } = require('../lib/phg-plan.cjs');
const s5 = require('../samples/s5.contract.json');

test('S5 plan: one PHG D project per deck and system, flows preserved', () => {
 const all = plan(s5), plans = all.filter(p => p.kind === 'supply');
 assert.equal(plans.length, 10);
 // EXH-ROOM serves S2..S5, RET-ROOM S1, S3..S5: one project per deck each
 assert.equal(all.filter(p => p.kind === 'exhaust').length, 4); assert.equal(all.filter(p => p.kind === 'return').length, 4);
 for (const pl of all) {
  const sys = s5.systems.find(s => s.kind === pl.kind && s.id === pl.systemId), field = { supply: 'supplyCmh', exhaust: 'exhaustCmh', return: 'returnCmh' }[pl.kind];
  const deckCmh = sys.roomIds.filter(id => s5.rooms.find(r => r.id === id).deckId === pl.deckId).reduce((t, id) => t + s5.airflow[id][field], 0);
  assert.equal(pl.designCmh, deckCmh, pl.key + ' deck airflow');
  for (const u of pl.rus) {
   const room = s5.rooms.find(r => r.id === u.roomId);
   assert.ok(inside(u, room.polygon), `${u.id} inside room ${room.no}`);
   assert.ok(Math.hypot(u.x - pl.root.x, u.y - pl.root.y) >= 400, `${u.id} clear of the Root`);
  }
  for (let i = 0; i < pl.rus.length; i++) for (let j = i + 1; j < pl.rus.length; j++)
   assert.ok(Math.hypot(pl.rus[i].x - pl.rus[j].x, pl.rus[i].y - pl.rus[j].y) >= 400, `${pl.rus[i].id} / ${pl.rus[j].id} apart`);
 }
 const sources = Object.fromEntries(plans.map(p => [p.key, p.rootSource.split(':')[0]]));
 assert.equal(sources['S1__SUP-ER-01'], 'fan-room');   // 111 공조기계실
 assert.equal(sources['S3__AHU-AC-01'], 'assumed');    // no fan room on S3: corridor end, to be moved
});

test('room RUs: one per 500 CMH, sum kept', () => {
 const room = { polygon: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3000 }, { x: 0, y: 3000 }] };
 const rus = roomRus(room, 1230, { maxRuCmh: 500, gridMm: 100 });
 assert.equal(rus.length, 3);
 assert.equal(rus.reduce((t, u) => t + u.flowCmh, 0), 1230);
 assert.ok(rus.every(u => inside(u, room.polygon)));
});

test('deck DXF: closed room outlines with number and name', () => {
 const dxf = deckDxf(s5, 'S3');
 assert.match(dxf, /AC1015/);
 assert.equal((dxf.match(/\r\nLWPOLYLINE\r\n/g) || []).length, s5.rooms.filter(r => r.deckId === 'S3').length);
 assert.match(dxf, /\r\n선원식당\r\n/);
});

test('a unit location set in HVAC Grid replaces the guessed Root', () => {
 const roots = { 'S3__AHU-AC-01': { x: 11600, y: 4000 } }, pl = plan({ ...s5, roots }).find(p => p.key === 'S3__AHU-AC-01');
 assert.equal(pl.rootSource, 'user');
 assert.deepEqual(pl.root, { x: 11600, y: 4000 });
 assert.ok(pl.rus.every(u => Math.hypot(u.x - 11600, u.y - 4000) >= 400));
});

test('multi-deck systems: one unit deck, the other decks start at the shaft, exhaust RUs clear of supply RUs', () => {
 const all = plan(s5), ret = all.filter(p => p.systemId === 'RET-ROOM');
 assert.equal(ret.filter(p => p.isUnitDeck).length, 1);
 assert.equal(ret.find(p => p.isUnitDeck).deckId, 'S1');            // 111 공조기계실
 assert.equal(ret.find(p => p.isUnitDeck).rootSource, 'fan-room:111');
 assert.ok(ret.filter(p => !p.isUnitDeck).every(p => p.flowMode === 'exhaust'));
 const sup = all.filter(p => p.kind === 'supply').flatMap(p => p.rus);
 for (const u of all.filter(p => p.kind !== 'supply').flatMap(p => p.rus))
  for (const v of sup.filter(v => v.roomId === u.roomId)) assert.ok(Math.hypot(u.x - v.x, u.y - v.y) >= 400, `${u.id} clear of ${v.id}`);
});

test('the user picks the unit deck of a multi-deck system', () => {
 const ret = plan({ ...s5, unitDecks: { 'RET-ROOM': 'S4' } }).filter(p => p.systemId === 'RET-ROOM');
 assert.equal(ret.find(p => p.isUnitDeck).deckId, 'S4');
});
