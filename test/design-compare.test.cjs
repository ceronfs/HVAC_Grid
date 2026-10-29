// The designer's ducts against AUTO (lib/design-compare.cjs): duct layers found first, lines and polylines read from
// the layers picked, the drawing turned to the plan's way round, and the two shares within the distance.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const DC = require('../lib/design-compare.cjs');

// a DXF of LINEs and an LWPOLYLINE on given layers
function dxf(ents) {
 const L = ['0', 'SECTION', '2', 'ENTITIES'];
 for (const e of ents) {
  if (e.type === 'LINE') L.push('0', 'LINE', '8', e.layer, '10', e.a[0], '20', e.a[1], '11', e.b[0], '21', e.b[1]);
  else { L.push('0', 'LWPOLYLINE', '8', e.layer, '90', e.pts.length, '70', e.closed ? 1 : 0); for (const p of e.pts) L.push('10', p[0], '20', p[1]); }
 }
 L.push('0', 'ENDSEC', '0', 'EOF'); return L.join('\n');
}
const text = dxf([
 { type: 'LINE', layer: 'WALL', a: [0, 0], b: [10000, 0] }, { type: 'LINE', layer: 'WALL', a: [0, 0], b: [0, -8000] }, { type: 'LINE', layer: 'WALL', a: [10000, 0], b: [10000, -8000] },
 { type: 'LINE', layer: 'M-DUCT', a: [1000, -2000], b: [9000, -2000] },
 { type: 'LWPOLYLINE', layer: 'M-DUCT', pts: [[5000, -2000], [5000, -6000], [8000, -6000]] }]);
const rooms = [{ polygon: [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 8000 }, { x: 0, y: 8000 }] }];   // BOX y: down

test('the duct layer first, lines and polylines read from the layers picked', () => {
 const ls = DC.layers(text);
 assert.deepEqual(ls.map(l => [l.name, l.count, l.duct]), [['M-DUCT', 2, true], ['WALL', 3, false]]);
 const segs = DC.segments(text, ['M-DUCT']);
 assert.equal(segs.length, 3); assert.equal(segs.reduce((t, s) => t + Math.hypot(s[2] - s[0], s[3] - s[1]), 0), 8000 + 4000 + 3000);
});

test('the drawing turned to the plan\'s way round when that sits on the rooms', () => {
 const p = DC.place(DC.segments(text, ['M-DUCT']), rooms);
 assert.equal(p.flip, true); assert.equal(p.fit, 1); assert.deepEqual(p.segs[0], [1000, 2000, 9000, 2000]);
 assert.equal(DC.place(DC.segments(text, ['M-DUCT']).map(s => [s[0], -s[1], s[2], -s[3]]), rooms).flip, false, 'a drawing already in BOX y stays');
});

test('both shares within the distance, a far run left out', () => {
 const design = DC.place(DC.segments(text, ['M-DUCT']), rooms).segs;
 // AUTO: the main 300 mm off the designer's, the branch the same, and a run the designer has not got
 const auto = [[1000, 2300, 9000, 2300], [5000, 2000, 5000, 6000], [5000, 6000, 8000, 6000], [1000, 7000, 4000, 7000]];
 const r = DC.compare(design, auto, { tolMm: 500 });
 assert.equal(r.designM, 15); assert.equal(r.autoM, 18);
 assert.equal(r.designShare, 1, 'all of the designer\'s within 500 mm');
 assert.ok(Math.abs(r.autoShare - 15 / 18) < 0.01, `AUTO's extra 3 m not in the drawing: ${r.autoShare}`);
 const tight = DC.compare(design, auto, { tolMm: 200 });
 // 200 mm: the main 300 mm off is out, but for the 400 mm where AUTO's branch crosses it
 assert.ok(Math.abs(tight.designShare - 7.4 / 15) < 0.01, `200 mm: ${tight.designShare}`);
 assert.ok(tight.designSegShare[0] < 0.06 && tight.designSegShare[1] === 1 && tight.designSegShare[2] === 1, JSON.stringify(tight.designSegShare));
});

test('AUTO segments of a deck in the design data\'s coordinates', () => {
 const g = { 'D1__S': { ducts: [{ points: [{ x: 0, y: -1000 }, { x: 0, y: -3000 }, { x: 2000, y: -3000 }] }] }, 'D2__S': { ducts: [{ points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }] } };
 assert.deepEqual(DC.autoSegments(g, [{ key: 'D1__S', deckId: 'D1' }, { key: 'D2__S', deckId: 'D2' }], 'D1'), [[0, 1000, 0, 3000], [0, 3000, 2000, 3000]]);
});
