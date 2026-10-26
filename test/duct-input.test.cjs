// Ver 2.0 duct engine, route input (lib/duct/input.cjs, V2-1.1): for every plan of S5, T3 and N3 the same forbidden
// zones, RUs, airflow, run-out, routing area, grid and corridors as PHG D's route input in the golden values (the
// corridors from the contract's rooms, not from the drawing's text - the same area), and the zone relaxation steps.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const I = require('../lib/duct/input.cjs'), P = require('../tools/phg-golden.cjs'), G = require('../tools/v1-golden.cjs');
const area = pts => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p.x * q.y - q.x * p.y; }, 0)) / 2e6;

test('duct input: every plan as PHG D took it', { skip: !fs.existsSync(path.join(P.FIXTURES, 's5', 'index.json')) && 'phg-golden 없음' }, () => {
 let n = 0;
 for (const ship of ['s5', 't3', 'n3']) {
  const dir = path.join(P.FIXTURES, ship), index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), rooms = G.read(path.join(G.FIXTURES, ship), 'project').contract.rooms;
  for (const k of index.order) {
   const e = P.ungz(path.join(dir, P.safe(k) + '.json.gz')), want = e.auto.workers.find(m => m.worker === 'aroute-routing' && m.dir === 'in').data.input, got = I.routeInput(e.plan, rooms), at = `${ship} ${k}`;
   assert.equal(got.forbidden.length, want.routingZones.filter(z => z.zoneType === 'FORBIDDEN').length, at + ' zones');
   assert.deepEqual(got.terminals.map(t => t.flowCmh), want.nodes.filter(x => x.type === 'TERMINAL').map(x => want.routingSettings.ductEnvelope.flows[x.id]), at + ' RUs');
   assert.deepEqual([got.area.maxX - got.area.minX, got.area.maxY - got.area.minY, got.grid], [want.canvas.width, want.canvas.height, want.canvas.routingGrid], at + ' area');
   const wc = want.routingSettings.corridorMain?.corridors || [];
   assert.deepEqual(got.corridors.map(c => area(c.polygon).toFixed(2)), wc.map(c => area(c.polygon).toFixed(2)), at + ' corridors');
   assert.ok(got.terminals.every(t => t.leadMm === 800));
   n++;
  }
 }
 assert.equal(n, 52);
});

test('duct input: the zone relaxation steps (all, outside dropped, rooms dropped, none)', () => {
 const plan = { key: 'D1__S', root: { x: 0, y: 0 }, rus: [{ id: 'u', x: 1000, y: 0, flowCmh: 100 }], avoid: [{ zone: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }], outside: [[{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }]] };
 const steps = I.relaxSteps(I.routeInput(plan));
 assert.deepEqual(steps.map(s => [s.zonesRelaxed, s.input.forbidden.map(z => z.kind)]), [[false, ['room', 'outside']], ['outside', ['room']], ['rooms', ['outside']], ['all', []]]);
 assert.deepEqual(I.relaxSteps(I.routeInput({ ...plan, outside: [] })).map(s => s.zonesRelaxed), [false, 'all']);
 assert.deepEqual(I.relaxSteps(I.routeInput({ ...plan, avoid: [], outside: [] })).map(s => s.zonesRelaxed), [false]);
});

test('duct input: corridors by name or ISO class; a large area gets a coarser grid', () => {
 assert.ok(I.isCorridor({ name: '복도' }) && I.isCorridor({ name: 'X', isoClass: 'ALLEY_SOUND' }) && !I.isCorridor({ name: '선실' }));
 const far = I.routeInput({ root: { x: 0, y: 0 }, rus: [{ id: 'u', x: 300000, y: 200000, flowCmh: 100 }] });
 assert.ok(far.grid > 200 && ((far.area.maxX - far.area.minX) / far.grid) * ((far.area.maxY - far.area.minY) / far.grid) <= I.RULES.maxCells);
});
