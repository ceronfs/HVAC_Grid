'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { plan, roomRus, inside, deckDxf } = require('../lib/phg-plan.cjs');
const s5 = require('../samples/s5.contract.json');

test('S5 plan: one PHG D project per deck and supply system, flows preserved', () => {
 const plans = plan(s5);
 assert.equal(plans.length, 10);
 for (const pl of plans) {
  const sys = s5.systems.find(s => s.kind === 'supply' && s.id === pl.systemId);
  assert.equal(pl.designCmh, sys.designCmh, pl.key + ' total airflow');
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
