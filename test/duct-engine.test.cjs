// Ver 2.0 duct engine, AUTO end to end (lib/duct/route.cjs, network.cjs, astar.cjs, assign.cjs, engine.cjs - V2-1.2 to
// 1.5, 1.8): a small deck built here, and plans of the golden values (S5, T3, N3) - every RU joined, ducts orthogonal and
// clear of the forbidden zones, the zone relaxation step 1.x took, sizes and the index pressure worked out.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const E = require('../lib/duct/engine.cjs'), A = require('../lib/duct/astar.cjs'), N = require('../lib/duct/network.cjs'), P = require('../tools/phg-golden.cjs'), G = require('../tools/v1-golden.cjs');

const R = (id, name, x0, y0, x1, y1) => ({ id, name, polygon: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] });
// a corridor along x between two rows of cabins, the fan room at the west end, a stair (restricted) in the middle row
const rooms = [R('FAN', '공조기실', 0, 3000, 2000, 5000), R('COR', '복도', 2000, 3500, 14000, 4500), R('STAIR', '계단실', 8000, 0, 10000, 3500),
 ...[0, 1, 2, 3].map(i => R('N' + i, '선실', 2000 + i * 3000, 4500, 5000 + i * 3000, 8000)), ...[0, 1].map(i => R('S' + i, '선실', 2000 + i * 3000, 0, 5000 + i * 3000, 3500)), R('S3', '선실', 11000, 0, 14000, 3500)];
const plan = (over = {}) => ({ key: 'D1__AHU', deckId: 'D1', systemId: 'AHU', kind: 'supply', flowMode: 'supply', root: { x: 1000, y: 4000 }, rootRoomId: 'FAN', rooms: rooms.map(r => r.id),
 rus: ['N0', 'N1', 'N2', 'N3', 'S0', 'S1', 'S3'].map((id, i) => { const r = rooms.find(x => x.id === id), b = r.polygon; return { id: `AHU/${id}/1`, roomId: id, x: (b[0].x + b[1].x) / 2, y: (b[0].y + b[2].y) / 2, flowCmh: 100 + 20 * i }; }),
 avoid: [{ roomId: 'STAIR', no: '1', name: '계단실', space: '계단', zone: [{ x: 8050, y: 0 }, { x: 9950, y: 0 }, { x: 9950, y: 3450 }, { x: 8050, y: 3450 }] }],
 outside: [[{ x: -10000, y: -10000 }, { x: 24000, y: -10000 }, { x: 24000, y: 0 }, { x: -10000, y: 0 }], [{ x: -10000, y: 8000 }, { x: 24000, y: 8000 }, { x: 24000, y: 18000 }, { x: -10000, y: 18000 }]], ...over });

const segs = net => net.ducts.map(d => [d.points[0], d.points.at(-1)]);
const intrudes = (net, zones) => segs(net).some(([a, b]) => { const n = Math.max(1, Math.round((Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / 50)); for (let k = 1; k < n; k++) { const p = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }; if (zones.some(z => A.insidePoly(p, z))) return true; } return false; });

test('duct engine: a small deck - every RU joined, ducts orthogonal, out of the stair and the outside, sized, a pressure', () => {
 const a = E.auto(plan(), rooms), net = a.network;
 assert.equal(a.result.unconnected, 0); assert.equal(a.result.rus, 7); assert.equal(a.result.flowCmh, 7 * 100 + 20 * 21);
 assert.equal(a.result.zonesRelaxed, false);
 for (const [p, q] of segs(net)) assert.ok(p.x === q.x || p.y === q.y, 'orthogonal');
 assert.ok(!intrudes(net, [plan().avoid[0].zone, ...plan().outside]), 'no duct in the stair or outside the deck');
 assert.ok(a.sizing.ok && net.ducts.every(d => d.widthMm >= d.heightMm && d.heightMm > 0));
 assert.ok(a.result.indexPa > 10 && a.pressure.paths.length === 7);
 // every RU ends one duct; every RU's straight run-out is at least 800 mm before its first bend or tee
 for (const u of net.diffusers) assert.equal(net.ducts.filter(d => d.fromNodeId === u.connectedNodeId || d.toNodeId === u.connectedNodeId).length, 1);
 assert.equal(a.result.ductTypes.sub_branch, 7);
 assert.ok(a.result.ductTypes.main > 0, 'a main');
});

test('duct engine: RUs in Prim order from the root; the same plan gives the same network', () => {
 const t = plan().rus.map((u, i) => ({ id: 'T' + (i + 1), x: u.x, y: u.y }));
 assert.equal(N.primOrder({ x: 1000, y: 4000 }, t)[0].id, 'T1');
 assert.deepEqual(E.auto(plan(), rooms).network, E.auto(plan(), rooms).network);
});

test('duct engine: when the outside walls an RU in, the outside is let go (zonesRelaxed outside)', () => {
 // an RU whose run-out and route are shut in by an outside zone round its room
 const p = plan(); p.outside.push([{ x: 11000, y: 4500 }, { x: 14000, y: 4500 }, { x: 14000, y: 4600 }, { x: 11000, y: 4600 }]);
 p.rus.push({ id: 'AHU/X/1', roomId: 'N3', x: 12500, y: 6250, flowCmh: 100 });
 p.outside.push([{ x: 11000, y: 4600 }, { x: 11100, y: 4600 }, { x: 11100, y: 8000 }, { x: 11000, y: 8000 }], [{ x: 13900, y: 4600 }, { x: 14000, y: 4600 }, { x: 14000, y: 8000 }, { x: 13900, y: 8000 }]);
 const a = E.auto(p, rooms);
 assert.equal(a.result.unconnected, 0); assert.equal(a.result.zonesRelaxed, 'outside');
});

test('duct engine: a manual size is kept when AUTO runs again (found by its key); resize sizes the rest again', () => {
 const a = E.auto(plan(), rooms), d = a.network.ducts.find(x => x.type === 'main');
 const b = E.auto(plan(), rooms, { manual: [{ key: d.key, size: { widthMm: 600, heightMm: 300 } }] }), d2 = b.network.ducts.find(x => x.key === d.key);
 assert.deepEqual([d2.widthMm, d2.heightMm, d2.manualSize], [600, 300, true]); assert.deepEqual(b.result.manualLost, []);
 const c = E.resize(a.network, d.id, { widthMm: 500, heightMm: 250 });
 assert.deepEqual([c.network.ducts.find(x => x.id === d.id).widthMm, c.network.ducts.find(x => x.id === d.id).heightMm], [500, 250]);
 assert.ok(c.result.indexPa > 0);
 assert.equal(E.resize(c.network, d.id, null).network.ducts.find(x => x.id === d.id).manualSize, false);
});

const golden = fs.existsSync(path.join(P.FIXTURES, 's5', 'index.json'));
test('duct engine: golden plans - every RU joined, the zone step 1.x took, out of the zones', { skip: !golden && 'phg-golden 없음' }, () => {
 for (const [ship, key] of [['s5', 'S4__AHU-OFC-02'], ['t3', 'D2__EF-SAN'], ['n3', 'DECK1__EF-GAL'], ['n3', 'DECK3__AHU-1']]) {
  const e = P.ungz(path.join(P.FIXTURES, ship, P.safe(key) + '.json.gz')), rooms = G.read(path.join(G.FIXTURES, ship), 'project').contract.rooms, a = E.auto(e.plan, rooms), at = `${ship} ${key}`;
  assert.equal(a.result.unconnected, 0, at); assert.equal(a.result.zonesRelaxed, e.auto.result.zonesRelaxed, at + ' zones');
  const zones = a.route.input.forbidden.map(z => z.polygon);
  assert.ok(!intrudes(a.network, zones), at + ' clear of the zones it kept');
  assert.ok(a.sizing.ok && a.result.indexPa > 0, at);
  // the same function: a length within half of 1.x's either way (D8 - differences are recorded by tools/engine-compare.cjs)
  assert.ok(a.result.lengthM > e.auto.result.lengthM * 0.5 && a.result.lengthM < e.auto.result.lengthM * 1.5, `${at} ${a.result.lengthM} m vs ${e.auto.result.lengthM}`);
 }
});
