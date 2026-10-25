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
 // DXF 2007 (UTF-8 text) with the subclass markers CAD readers require on every entity
 assert.match(dxf, /AC1021/); const pairs = dxf.split(/\r\n/);
 for (const [i, v] of pairs.entries()) if (i % 2 === 1 && pairs[i - 1] === '0' && (v === 'LWPOLYLINE' || v === 'TEXT')) assert.deepEqual([pairs[i + 3], pairs[i + 4]], ['100', 'AcDbEntity'], v);
 assert.equal((dxf.match(/\r\nLWPOLYLINE\r\n/g) || []).length, s5.rooms.filter(r => r.deckId === 'S3').length);
 assert.match(dxf, /\r\n선원식당\r\n/);
});

// the drawing PHG D gets (cad): y the way round the drawing had it (DXF y = -BOX y), so PHG D, which draws DXF y up,
// shows the deck as ① - ④ do (it showed upside down, 2026-10-25); the room labels stay inside their rooms
test('deck DXF for PHG D: the drawing the way round it was drawn', () => {
 const X = require('../lib/dxf-in.cjs'), box = X.rooms(deckDxf(s5, 'S3')), cad = X.rooms(deckDxf(s5, 'S3', { cad: true }));
 assert.equal(cad.length, box.length);
 for (const r of cad) {
  const b = box.find(x => x.no === r.no), ys = q => q.polygon.map(p => p.y), neg = v => 0 - v;
  assert.ok(b, r.no); assert.equal(Math.max(...ys(r)) + 0, neg(Math.min(...ys(b))) + 0, r.no + ' top'); assert.equal(Math.min(...ys(r)) + 0, neg(Math.max(...ys(b))) + 0, r.no + ' bottom');
  assert.equal(r.name, b.name, r.no + ' label read inside its room');
 }
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

test('review 1 fixes: GALLEY is not a corridor, exhaust far from supply, L-shaped rooms, forbidden zones, one-line DXF text', () => {
 const fs = require('fs'), path = require('path'), X = require('../lib/dxf-in.cjs'), { buildContract } = require('../lib/contract.cjs');
 const R = (id, name, poly, sys, l = {}) => ({ id, no: id, name, deckId: 'D', polygon: poly, floor: 20, volume: 56, sup: sys.s, exh: sys.e, ret: sys.r, coolingSensibleW: l.w || 0, ventilationAirCmh: l.ach || 0, calculationComplete: true });
 const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
 const c = buildContract({ source: {}, decks: [{ id: 'D', z: 0 }], rooms: [
  R('g', 'GALLEY', rect(0, 0, 5000, 4000), { s: 'S', e: 'E' }, { w: 5000, ach: 2000 }),
  R('L', 'CABIN\nA', [[5000, 0], [11000, 0], [11000, 6000], [8000, 6000], [8000, 3000], [5000, 3000]], { s: 'S' }, { w: 6000 }),
  R('c', 'CASING', rect(0, 4000, 5000, 8000), {})] });
 const ps = plan(c), sup = ps.find(p => p.kind === 'supply'), exh = ps.find(p => p.kind === 'exhaust');
 // no corridor on this deck: the Root is the deck corner, not "the end of the corridor GALLEY"
 assert.ok(!sup.rootSource.includes('corridor'), sup.rootSource);
 // galley exhaust RUs: as far as the room allows from the galley supply RUs
 const gs = sup.rus.filter(u => u.roomId === 'g'), ge = exh.rus.filter(u => u.roomId === 'g');
 for (const e of ge) assert.ok(Math.min(...gs.map(s => Math.hypot(s.x - e.x, s.y - e.y))) >= 1000, 'exhaust 1 m+ from supply');
 // L-shaped cabin (1800 CMH, 4 RUs): all inside, spread (no two closer than 1 m)
 const lr = sup.rus.filter(u => u.roomId === 'L'); assert.equal(lr.length, 4);
 const room = c.rooms.find(r => r.id === 'L'); assert.ok(lr.every(u => inside(u, room.polygon)));
 for (let i = 0; i < lr.length; i++) for (let j = i + 1; j < lr.length; j++) assert.ok(Math.hypot(lr[i].x - lr[j].x, lr[i].y - lr[j].y) >= 1000);
 // the casing (category A machinery) is a forbidden zone for the supply AUTO
 assert.deepEqual(sup.avoid.map(z => z.roomId), ['c']); assert.ok(sup.avoid[0].zone.length === 4);
 // a name with a line break stays one DXF text: every room reads back
 assert.equal(X.rooms(sup.dxf).length, 3); assert.ok(X.rooms(sup.dxf).some(r => r.name === 'CABIN A'));
});
