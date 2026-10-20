// Rooms from a drawing of plain LINEs (walls drawn once, T-junctions, no polylines): lib/dxf-in.cjs faces / rooms,
// and the T3 test drawings, which are drawn that way
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const X = require('../lib/dxf-in.cjs');

const dxf = (lines, texts) => ['0', 'SECTION', '2', 'ENTITIES',
 ...lines.flatMap(([x1, y1, x2, y2, layer = 'ROOM']) => ['0', 'LINE', '8', layer, '10', x1, '20', y1, '11', x2, '21', y2]),
 ...texts.flatMap(([x, y, s, layer]) => ['0', 'TEXT', '8', layer, '10', x, '20', y, '40', 180, '1', s]),
 '0', 'ENDSEC', '0', 'EOF'].join('\n');

test('LINE drawing: T-junctions, an L-shaped room, overlapping lines and a loose line', () => {
 // 10 x 6 m: A on the left, small C in the middle top, L-shaped B around C on the right
 const text = dxf([
  [0, 0, 6000, 0, 'DECK_OUTLINE'], [4000, 0, 10000, 0, 'DECK_OUTLINE'],   // the bottom in two overlapping pieces
  [10000, 0, 10000, 6000, 'DECK_OUTLINE'], [10000, 6000, 0, 6000, 'DECK_OUTLINE'], [0, 6000, 0, 0, 'DECK_OUTLINE'],
  [4000, 0, 4000, 6000],                                                 // meets top and bottom in a T
  [4000, 3000, 7000, 3000], [7000, 3000, 7000, 6000],                    // C's walls: T on A|B and on the top
  [8000, 1000, 9000, 1000]], [                                           // a loose line inside B: no room
  [500, 5000, '101', 'ROOM_NO'], [500, 4600, 'A ROOM', 'ROOM_NAME'],
  [8000, 5000, '102', 'ROOM_NO'], [8000, 4600, 'B ROOM', 'ROOM_NAME'],
  [4500, 5000, '103', 'ROOM_NO'], [4500, 4600, 'C', 'ROOM_NAME']]);
 const rs = X.rooms(text).sort((a, b) => a.no.localeCompare(b.no));
 assert.deepEqual(rs.map(r => [r.no, r.name, Math.round(r.areaM2 * 100) / 100]), [['101', 'A ROOM', 24], ['102', 'B ROOM', 27], ['103', 'C', 9]]);
 assert.equal(rs[1].polygon.length, 6, 'B is an L: 6 corners, none in the middle of a wall');
});

test('closed polylines still win over loose lines', () => {
 const text = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'ROOM', '90', 4, '70', 1, '10', 0, '20', 0, '10', 2000, '20', 0, '10', 2000, '20', 2000, '10', 0, '20', 2000,
  '0', 'LINE', '8', 'ROOM', '10', 0, '20', 1000, '11', 2000, '21', 1000, '0', 'TEXT', '8', 'ROOM_NO', '10', 500, '20', 500, '40', 180, '1', '201', '0', 'ENDSEC', '0', 'EOF'].join('\n');
 const rs = X.rooms(text); assert.equal(rs.length, 1); assert.equal(rs[0].areaM2, 4);
});

test('T3 drawings are LINEs only, and every room reads back with its number', () => {
 const dir = path.join(__dirname, '..', 'samples', 't3'), C = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 't3.contract.json'), 'utf8'));
 for (const f of ['T3_D1', 'T3_D2', 'T3_D3', 'T3_D4', 'T3_ALL']) {
  const text = fs.readFileSync(path.join(dir, f + '.dxf'), 'utf8'), types = new Set(X.entities(text).map(e => e.type));
  assert.deepEqual([...types].sort(), ['LINE', 'TEXT'], f + ': no polylines, no boxes');
  if (f === 'T3_ALL') { assert.equal(X.rooms(text).filter(r => r.no).length, 79); continue; }
  const cmp = X.compare(X.rooms(text), C, f.slice(3)); assert.ok(cmp.ok, f + ' ' + JSON.stringify(cmp).slice(0, 200));
 }
});

test('T3 BOX project (① T3 시험선) is LINEs and TEXT too; the room data hangs on the room ids BOX gives', () => {
 const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 't3', 'T3.box.json'), 'utf8'));
 assert.deepEqual([...new Set(j.source.entities.map(e => e.type))].sort(), ['LINE', 'TEXT'], 'no RECT, no POLY');
 const ids = new Set(j.source.entities.filter(e => e.type === 'TEXT').map(e => e.id)), ov = j.overrides.roomOverrides;
 assert.equal(ov.length, 79); assert.ok(ov.every(([id, d]) => ids.has(id) && d.roomNo && 'sup' in d), 'every room: a number TEXT id and its data');
});
