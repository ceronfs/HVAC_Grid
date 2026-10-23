// Duct layer, cabin supply RUs at the ship's side, the supply main band, routing order and the all-system clash check
// (lib/duct-layer.cjs, lib/clash.cjs - user 2026-10-23)
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const DL = require('../lib/duct-layer.cjs'), CL = require('../lib/clash.cjs'), K = require('../lib/contract.cjs'), PL = require('../lib/phg-plan.cjs'), PJ = require('../lib/project.cjs');

// a deck 26 x 14 m like N3 CREW DK: a corridor along x at y -6000..-8000, cabins on both sides at the ship's side
const room = (id, no, name, x0, y0, x1, y1, systems = {}) => ({ id, no, name, deckId: 'D', isoClass: name === '복도' ? 'ALLEY_SOUND' : 'CABIN', holes: [], polygon: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], systems: { supply: null, exhaust: null, return: null, ...systems } });
function deck() {
 const rooms = [room('c', '202', '복도', 0, -8000, 26000, -6000, { supply: 'AHU' })];
 for (let i = 0; i < 4; i++) rooms.push(room('n' + i, '24' + i, '선원침실', 12000 + i * 3000, -6000, 15000 + i * 3000, 0, { supply: 'AHU', return: 'RA' }), room('s' + i, '21' + i, '선원침실', 12000 + i * 3000, -14000, 15000 + i * 3000, -8000, { supply: 'AHU', return: 'RA' }));
 rooms.push(room('f', '206', '공조기실', 0, -6000, 3000, 0));
 return rooms;
}

test('duct layer: deck height − duct bottom − reserve, set per project, checked', () => {
 const c = { decks: [{ id: 'D', heightMm: 2900 }, { id: 'E' }], ductLayer: null };
 assert.equal(DL.layerOf(c, 'D').layerMm, 400);
 assert.equal(DL.layerOf({ ...c, ductLayer: { bottomMm: 2150 } }, 'D').layerMm, 450);
 assert.deepEqual([DL.layerOf(c, 'E').layerMm, DL.layerOf(c, 'E').source], [400, 'fallback']);
 assert.deepEqual(DL.validate({ bottomMm: 2200, supplyMain: 'band' }), []);
 assert.deepEqual(DL.validate({ bottomMm: 'x', supplyMain: 'roof' }), ['ductLayer.bottomMm (1000–5000)', 'ductLayer.supplyMain']);
 assert.deepEqual(DL.validate([]), ['ductLayer']);
});

test('cabin supply RU 1,000 mm from the ship side; the band in the rooms; the corridor estimate', () => {
 const rooms = deck(), cor = DL.corridorOf(rooms);
 assert.deepEqual([cor.axis, cor.lo, cor.hi, cor.widthMm], ['x', -8000, -6000, 2000]);
 const north = rooms.find(r => r.id === 'n1'), south = rooms.find(r => r.id === 's1');
 assert.deepEqual(DL.sideRus(north, [{ x: 0, y: 0 }], rooms, { corridor: cor }), [{ x: 16500, y: -1000 }]);
 assert.deepEqual(DL.sideRus(south, [{ x: 0, y: 0 }, { x: 0, y: 0 }], rooms, { corridor: cor }), [{ x: 15750, y: -13000 }, { x: 17250, y: -13000 }]);
 assert.equal(DL.sideRus(rooms.find(r => r.id === 'c'), [{ x: 0, y: 0 }], rooms, { corridor: cor }), null, 'the corridor is not at the side');
 assert.equal(DL.sideRus(north, [{ x: 0, y: 0 }], rooms, { corridor: cor, layer: { ...DL.DEFAULTS, ruFromSideMm: 0 } }), null, 'off');
 const b = DL.bands(rooms, DL.DEFAULTS, cor);
 assert.deepEqual(b.map(x => [x.side, x.centre, x.from, x.to]), [[1, -2400, 0, 3000], [1, -2400, 12000, 24000], [-1, -11600, 12000, 24000]], 'only where rooms reach the side (none over the open part)');
 assert.equal(DL.mainWidth(3360, DL.DEFAULTS), 500);
});

test('plans: cabin supply RUs at the side, the supply main into the rooms when the corridor is full, the routing order', () => {
 const rooms = deck(), loads = Object.fromEntries(rooms.map(r => [r.id, {}])), airflow = Object.fromEntries(rooms.map(r => [r.id, { supplyCmh: r.isoClass === 'CABIN' ? 400 : 0, exhaustCmh: 0, returnCmh: r.isoClass === 'CABIN' ? 380 : 0 }]));
 const c = { schema: K.SCHEMA, units: 'mm', rules: { supplyDeltaTK: 10 }, decks: [{ id: 'D', name: 'D', elevationMm: 0, heightMm: 2900 }], rooms, loads, airflow, solas: { rooms: Object.fromEntries(rooms.filter(r => r.isoClass === 'CABIN').map(r => [r.id, { space: '선실 — 비제한 가구' }])) },
  systems: [{ id: 'AHU', kind: 'supply', roomIds: rooms.filter(r => r.systems.supply).map(r => r.id), deckIds: ['D'] }, { id: 'RA', kind: 'return', roomIds: rooms.filter(r => r.systems.return).map(r => r.id), deckIds: ['D'] }] };
 const ps = PL.plan(c), sup = ps.find(p => p.kind === 'supply'), ra = ps.find(p => p.kind === 'return');
 const cab = sup.rus.filter(u => u.roomId !== 'c');
 assert.ok(cab.length === 8 && cab.every(u => u.side && (u.y === -1000 || u.y === -13000)), 'cabin supply RUs on the side lines');
 assert.ok(ra.rus.every(u => !u.side), 'return RUs as before');
 // 3,200 CMH supply 500 + 100 and 3,040 CMH return 450 + 100 in a 2 m corridor: 58 % -> corridor; with fill 0.5 -> band
 assert.equal(sup.route.supplyMain.mode, 'corridor');
 const band = PL.plan({ ...c, ductLayer: { corridorFill: 0.5 } }).find(p => p.kind === 'supply');
 assert.deepEqual([band.route.supplyMain.mode, band.route.supplyMain.bands.length], ['band', 3]);
 assert.equal(PL.plan({ ...c, ductLayer: { supplyMain: 'band' } }).find(p => p.kind === 'supply').route.supplyMain.mode, 'band');
 assert.notEqual(PJ.planSig(band), PJ.planSig(sup), 'the band is part of the plan signature');
 assert.deepEqual(DL.routeOrder([ra, sup]).map(p => p.kind), ['supply', 'return']);
 // the main drawn in the rooms: both band lines joined by one cross duct, every piece inside the rooms
 const forced = PL.plan({ ...c, ductLayer: { supplyMain: 'band' } }).find(p => p.kind === 'supply'), tree = forced.route.supplyMain.main;
 assert.ok(tree && !tree.error && tree.segments.length >= 4, JSON.stringify(tree));
 const GE = require('../lib/geom.cjs');
 for (const [a, b] of tree.segments) for (const t of [0.25, 0.5, 0.75]) assert.ok(rooms.some(r => GE.inRoom({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, r)), 'inside rooms');
 assert.ok(tree.segments.some(([a, b]) => a.x === tree.crossAt && b.x === tree.crossAt && Math.min(a.y, b.y) <= -11600 + 1 && Math.max(a.y, b.y) >= -7000), 'the cross duct reaches the south band');
 assert.deepEqual(K.validate({ ...c, ductLayer: { reserveMm: -1 } }).filter(m => m.startsWith('ductLayer')), ['ductLayer.reserveMm (0–2000)']);
});

test('clash: plan overlaps, crossings against the duct layer, corridor sections', () => {
 const rooms = deck(), c = { decks: [{ id: 'D', name: 'D', heightMm: 2900 }], rooms };
 const plans = [{ key: 'D__A', deckId: 'D', systemId: 'A', kind: 'supply' }, { key: 'D__B', deckId: 'D', systemId: 'B', kind: 'return' }, { key: 'D__C', deckId: 'D', systemId: 'C', kind: 'exhaust' }];
 // app coordinates (y down): A along the corridor at y 7000, B beside it 150 mm off (overlap), C across both
 const duct = (w, h, pts) => ({ widthMm: w, heightMm: h, points: pts.map(([x, y]) => ({ x, y })) });
 const geometry = { 'D__A': { ducts: [duct(300, 200, [[1000, 7000], [9000, 7000]])] }, 'D__B': { ducts: [duct(200, 200, [[2000, 7150], [6000, 7150]])] }, 'D__C': { ducts: [duct(150, 150, [[8000, 5000], [8000, 9000]]), duct(250, 250, [[4000, 5000], [4000, 9000]])] } };
 const r = CL.check(c, plans, geometry), d = r.decks[0];
 assert.equal(d.overlaps.length, 1); assert.equal(d.overlaps[0].lengthMm, 4000); assert.equal(d.overlaps[0].needMm, 300);
 assert.deepEqual(d.crossings.map(x => [x.stackMm, x.over]).sort(), [[400, false], [500, true], [500, true]]);
 assert.deepEqual([r.total.overlaps, r.total.crossings, r.total.over, r.total.maxStackMm], [1, 3, 2, 500]);
 assert.equal(d.corridor[0].worst.sumMm, 600);
 assert.deepEqual(CL.deepDucts({ ...c, ductLayer: { bottomMm: 2500 } }, plans, geometry).map(x => x.size), ['300×200', '200×200', '150×150', '250×250']);
});
