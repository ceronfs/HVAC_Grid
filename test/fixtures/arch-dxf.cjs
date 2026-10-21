// An architectural deck drawing for the tests (test/dxf-arch.test.cjs, test/e2e/solas-tool.e2e.cjs): 12 x 9 m, walls as two
// lines with jambs at the door openings, doors (leaf + swing), furniture and a stair on their own layers, the room names as
// texts; doors facing each other across the corridor, a cabin with an en-suite WC whose door leaves a 200 mm stub.
'use strict';
const T = 100;   // wall thickness
function drawing() {
 const e = [], line = (x1, y1, x2, y2, layer = 'A-WALL') => e.push('0', 'LINE', '8', layer, '10', x1, '20', y1, '30', 0, '11', x2, '21', y2, '31', 0);
 const text = (x, y, s, layer = 'A-TEXT') => e.push('0', 'TEXT', '8', layer, '10', x, '20', y, '30', 0, '40', 200, '1', s);
 // a wall along x (y..y+t) or along y (x..x+t) from a to b, both faces broken at the openings [from, to], jambs at their sides
 const wall = (dir, at, a, b, open = [], t = T) => {
  const cuts = [[a, a], ...open, [b, b]];
  for (let k = 0; k + 1 < cuts.length; k++) { const s = cuts[k][1], f = cuts[k + 1][0]; if (f <= s) continue;
   if (dir === 'x') { line(s, at, f, at); line(s, at + t, f, at + t); } else { line(at, s, at, f); line(at + t, s, at + t, f); } }
  for (const [s, f] of open) for (const v of [s, f]) dir === 'x' ? line(v, at, v, at + t) : line(at, v, at + t, v);
 };
 // the deck: 12 x 9 m, outer walls
 wall('x', -T, -T, 12000 + T); wall('x', 9000, -T, 12000 + T); wall('y', -T, 0, 9000); wall('y', 12000, 0, 9000);
 // the corridor (y 4100..5600, 1.5 m) between two rows; doors opposite each other at x 1000..1800 (their jambs face across)
 wall('x', 4000, 0, 12000, [[1000, 1800], [9000, 9900]]);
 wall('x', 5600, 0, 12000, [[1000, 1800], [7000, 7800]]);
 // top row: cabin A | cabin B; bottom row: mess | galley
 wall('y', 6000, 5700, 9000); wall('y', 7000, 0, 4000);
 // cabin A's en-suite WC (x 4000..6000, y 5700..7200): its door at 4200..4900 leaves a 200 mm stub, walls 50 mm
 wall('y', 3950, 5700, 7250, [], 50); wall('x', 7200, 3950, 6000, [[4200, 4900]], 50);
 // doors: leaf and swing on A-DOOR (not walls); a bed on A-FURN; a stair drawn on A-STAIR in the mess
 line(1000, 5700, 1000, 6500, 'A-DOOR'); e.push('0', 'ARC', '8', 'A-DOOR', '10', 1000, '20', 5700, '30', 0, '40', 800, '50', 0, '51', 90);
 e.push('0', 'LWPOLYLINE', '8', 'A-FURN', '90', 4, '70', 1, '10', 8000, '20', 7000, '10', 10000, '20', 7000, '10', 10000, '20', 8800, '10', 8000, '20', 8800);
 for (let k = 0; k < 6; k++) line(500, 500 + k * 250, 2000, 500 + k * 250, 'A-STAIR');
 text(1500, 7600, 'CABIN A'); text(8500, 6500, 'CABIN B'); text(4600, 6400, 'WC'); text(5000, 4800, 'CORRIDOR'); text(3000, 2000, 'MESS ROOM'); text(9000, 2000, 'GALLEY');
 // a room tag block (INSERT + ATTRIB) would do as well; the title is outside the deck
 text(0, -1500, 'ACCOMMODATION DECK - GA');
 return ['0', 'SECTION', '2', 'ENTITIES', ...e, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

module.exports = { drawing, T };
