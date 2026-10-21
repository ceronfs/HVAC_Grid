// Rooms from an architectural drawing (lib/dxf-in.cjs roomsByText / bestRooms): walls as two lines with jambs at the door
// openings, doors (leaf + swing) and furniture on their own layers, the room names as texts - no closed outline, no
// closed face of lines. The cases that went wrong on the way: jambs facing each other across a corridor (cut it), a
// threshold through a partition (cut a cabin's lobby off), the short wall stub beside an en-suite door (left it open).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs');
const X = require('../lib/dxf-in.cjs');

const { drawing } = require('./fixtures/arch-dxf.cjs');

test('an architectural drawing: the rooms are read from their texts, each on its own', () => {
 const dxf = drawing();
 assert.ok(X.rooms(dxf).filter(r => r.name).length <= 1, 'no outline; the faces of the lines are the walls (one holds a text by chance)');
 const best = X.bestRooms(dxf); assert.equal(best.how, 'text');
 const by = Object.fromEntries(best.rooms.map(r => [r.name, r]));
 assert.deepEqual(Object.keys(by).sort(), ['CABIN A', 'CABIN B', 'CORRIDOR', 'GALLEY', 'MESS ROOM', 'WC']);
 for (const r of best.rooms) assert.equal(r.names, 1, r.name + ': one name in its area');
 // areas inside the wall faces (within a grid cell of 50 mm round)
 const near = (name, m2, tol) => assert.ok(Math.abs(by[name].areaM2 - m2) < tol, `${name} ${by[name].areaM2.toFixed(2)} ≈ ${m2}`);
 near('CORRIDOR', 12 * 1.5, 0.8);           // not cut where the doors face each other
 near('WC', 2.0 * 1.45 - 0.1, 0.4);          // its door closed beside the 200 mm stub
 near('CABIN A', 6 * 3.3 - 2.05 * 1.55, 0.8);   // with its lobby, without the WC
 near('CABIN B', 5.9 * 3.3, 0.8);            // the bed does not cut it
 near('MESS ROOM', 7 * 4, 0.8);              // nor does the stair
 near('GALLEY', 4.9 * 4, 0.8);
});

test('door thresholds: wall ends facing along one line, not jamb to jamb, not through a wall', () => {
 const segs = [{ x1: 0, y1: 0, x2: 1000, y2: 0 }, { x1: 1900, y1: 0, x2: 3000, y2: 0 },   // a door 900 wide
  { x1: 4000, y1: 0, x2: 4000, y2: 100 }, { x1: 4000, y1: 1700, x2: 4000, y2: 1800 },    // two jambs across a corridor
  { x1: 5000, y1: 0, x2: 6000, y2: 0 }, { x1: 6500, y1: -500, x2: 6500, y2: 500 }, { x1: 7000, y1: 0, x2: 8000, y2: 0 }];   // a wall between
 const t = X.thresholds(segs).map(s => [s.x1, s.y1, s.x2, s.y2].map(Math.round).join(','));
 assert.ok(t.includes('1000,0,1900,0') || t.includes('1900,0,1000,0'), t.join(' '));
 assert.ok(!t.some(s => /^4000,/.test(s)), 'jamb to jamb: ' + t.join(' '));
 assert.ok(!t.some(s => /^(6000,0,7000,0|7000,0,6000,0)$/.test(s)), 'through the wall at x 6500: ' + t.join(' '));
});

test('room tag blocks (ATTRIB) name rooms', () => {
 const dxf = drawing().replace('0\nENDSEC', ['0', 'INSERT', '8', 'A-ANNO', '2', 'TAG', '10', 3000, '20', 3000,
  '0', 'ATTRIB', '8', 'A-ANNO', '10', 3000, '20', 3200, '40', 200, '1', '121', '2', 'NO', '0', 'SEQEND', '0', 'ENDSEC'].join('\n'));
 const mess = X.bestRooms(dxf).rooms.find(r => r.name === 'MESS ROOM'); assert.equal(mess.no, '121');
});

test('a drawing with outlines keeps its exact reading', () => {
 for (const f of ['T3_D1', 'T3_D2']) { const b = X.bestRooms(fs.readFileSync(require('path').join(__dirname, '..', 'samples', 't3', f + '.dxf'), 'utf8')); assert.equal(b.how, 'outline', f); }
});

test('a big drawing reads in seconds (grid traced per area, line pairs from a grid)', () => {
 // 30 x 30 cabins of 3 x 4 m with double walls and a door each: 900 rooms
 const e = [], line = (x1, y1, x2, y2) => e.push('0', 'LINE', '8', 'A-WALL', '10', x1, '20', y1, '11', x2, '21', y2);
 for (let i = 0; i <= 30; i++) { line(i * 3000, 0, i * 3000, 120000); line(i * 3000 + 80, 0, i * 3000 + 80, 120000); }
 for (let j = 0; j <= 30; j++) for (let i = 0; i < 30; i++) { const x = i * 3000 + 80; line(x, j * 4000, x + 400, j * 4000); line(x + 1300, j * 4000, x + 2920, j * 4000); line(x, j * 4000 + 80, x + 400, j * 4000 + 80); line(x + 1300, j * 4000 + 80, x + 2920, j * 4000 + 80); }
 for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) e.push('0', 'TEXT', '8', 'A-TEXT', '10', i * 3000 + 1000, '20', j * 4000 + 2000, '40', 200, '1', `CABIN ${i}-${j}`);
 const t0 = Date.now(), rs = X.roomsByText(['0', 'SECTION', '2', 'ENTITIES', ...e, '0', 'ENDSEC', '0', 'EOF'].join('\n')), ms = Date.now() - t0;
 assert.ok(rs.length >= 870, 'rooms ' + rs.length);   // the bottom row's doors open to the outside
 assert.ok(ms < 8000, ms + ' ms');
});
