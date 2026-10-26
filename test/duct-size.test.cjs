// Ver 2.0 duct engine, sizing (lib/duct/size.cjs, V2-1.5): against every sizing PHG D did for S5, T3 and N3
// (test/fixtures/phg-golden: the preview's sizing worker and the final calculation - the same input, the same answer
// wanted, docs/v2/STUDY_PHG.md 7), and the rules the golden values do not reach (manual, round, branch cap, bad graphs).
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const S = require('../lib/duct/size.cjs'), P = require('../tools/phg-golden.cjs');

test('duct size: every sizing of the PHG D golden values, duct for duct', { skip: !fs.existsSync(path.join(P.FIXTURES, 's5', 'index.json')) && 'phg-golden 없음' }, () => {
 let calls = 0, ducts = 0;
 for (const ship of ['s5', 't3', 'n3']) {
  const dir = path.join(P.FIXTURES, ship), index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  for (const k of index.order) {
   const w = P.ungz(path.join(dir, P.safe(k) + '.json.gz')).auto.workers;
   for (const name of ['dline-native-sizing', 'blob:']) {
    const outs = w.filter(m => m.worker === name && m.dir === 'out' && m.data.result);
    for (const m of w.filter(m => m.worker === name && m.dir === 'in')) {
     const r = S.size(m.data.input), ids = JSON.stringify(r.ductUpdates.map(u => u.id).sort());
     // the messages were sorted (tools/phg-golden.cjs): the answer is the one for the same ducts
     const want = outs.find(o => JSON.stringify(o.data.result.ductUpdates.map(u => u.id).sort()) === ids)?.data.result;
     assert.ok(want, `${ship} ${k} ${name}: an answer for these ducts`);
     assert.equal(r.ok, want.ok); assert.equal(r.totalFlowCmh, want.totalFlowCmh, `${ship} ${k} total flow`);
     const by = new Map(want.ductUpdates.map(u => [u.id, u]));
     for (const u of r.ductUpdates) {
      const x = by.get(u.id), at = `${ship} ${k} ${name} ${u.id}`;
      assert.deepEqual([u.flowCmh, u.shape, u.widthMm, u.heightMm, u.diameterMm, u.targetVelocityMps, u.sizeVelocityExceeded], [x.flowCmh, x.shape, x.widthMm, x.heightMm, x.diameterMm, x.targetVelocityMps, !!x.sizeVelocityExceeded], at);
      assert.ok(Math.abs(u.actualVelocityMps - x.actualVelocityMps) < 1e-9, at + ' velocity');
      ducts++;
     }
     calls++;
    }
   }
  }
 }
 assert.ok(calls >= 100 && ducts > 2000, `${calls} sizings, ${ducts} ducts`);
});

// root - main - junction J - branch - RU A, J - main - K - sub_branch - RU B / RU C
const net = (over = {}) => ({
 nodes: [{ id: 'R', type: 'root' }, { id: 'J', type: 'junction' }, { id: 'K', type: 'junction' }, { id: 'A', type: 'diffuser' }, { id: 'B', type: 'diffuser' }, { id: 'C', type: 'diffuser' }],
 ducts: [{ id: 'd1', type: 'main', fromNodeId: 'R', toNodeId: 'J' }, { id: 'd2', type: 'branch', fromNodeId: 'J', toNodeId: 'A' }, { id: 'd3', type: 'main', fromNodeId: 'J', toNodeId: 'K' },
  { id: 'd4', type: 'sub_branch', fromNodeId: 'K', toNodeId: 'B' }, { id: 'd5', type: 'sub_branch', fromNodeId: 'C', toNodeId: 'K' }],
 diffusers: [{ id: 'uA', connectedNodeId: 'A', flowCmh: 2900 }, { id: 'uB', connectedNodeId: 'B', flowCmh: 60 }, { id: 'uC', connectedNodeId: 'C', flowCmh: 40 }],
 settings: {}, ...over });
const by = r => Object.fromEntries(r.ductUpdates.map(u => [u.id, u]));

test('duct size: flows add up from the RUs (either end of a duct may face the root)', () => {
 const r = S.size(net()), u = by(r);
 assert.equal(r.ok, true); assert.equal(r.totalFlowCmh, 3000);
 assert.deepEqual(['d1', 'd2', 'd3', 'd4', 'd5'].map(k => u[k].flowCmh), [3000, 2900, 100, 60, 40]);
 assert.deepEqual(r.rootFlows, [{ rootId: 'R', rootName: 'R', flowCmh: 3000 }]);
});

test('duct size: rectangular - W ≥ H, W/H ≤ 3, 50 mm steps, at most the target velocity, main at least 200 mm high', () => {
 const u = by(S.size(net()));
 for (const d of Object.values(u)) { assert.ok(d.widthMm >= d.heightMm && d.widthMm / d.heightMm <= 3 && d.widthMm % 50 === 0 && d.heightMm % 50 === 0, JSON.stringify(d)); assert.ok(d.actualVelocityMps <= d.targetVelocityMps + 1e-9); }
 assert.ok(u.d3.heightMm >= 200, 'a small main still 200 high'); assert.equal(u.d1.targetVelocityMps, 10); assert.equal(u.d4.targetVelocityMps, 8);
 assert.deepEqual([u.d1.widthMm, u.d1.heightMm], [350, 250]);   // 3000 CMH at 10 m/s: 9.52 m/s, the closest to 10
});

test('duct size: a branch no higher than the main above it', () => {
 const u = by(S.size(net()));
 // 2900 CMH at 8 m/s would be 350 × 300 on its own; the main above is 250 high
 const capped = S.rectSize(2900, { velocityMps: 8, minHeightMm: 100, maxHeightMm: 0 }, 250);
 assert.deepEqual([u.d2.widthMm, u.d2.heightMm], [capped.widthMm, capped.heightMm]); assert.deepEqual([capped.widthMm, capped.heightMm], [550, 200]);   // 7.32 m/s, closer to 8 than 450 × 250
 assert.ok(u.d2.heightMm <= u.d1.heightMm);
 assert.deepEqual([S.rectSize(2900, { velocityMps: 8, minHeightMm: 100, maxHeightMm: 0 }).widthMm, S.rectSize(2900, { velocityMps: 8, minHeightMm: 100, maxHeightMm: 0 }).heightMm], [350, 300]);
});

test('duct size: a manual section is kept, its velocity flagged over 110 % of the target', () => {
 const n = net(); n.ducts[0] = { ...n.ducts[0], manualSize: true, shape: 'rect', widthMm: 300, heightMm: 200 };
 const r = S.size(n), u = by(r);
 assert.deepEqual([u.d1.widthMm, u.d1.heightMm], [300, 200]); assert.ok(u.d1.actualVelocityMps > 13);
 assert.ok(r.messages.some(m => m.code === 'MANUAL_VELOCITY' && m.ids[0] === 'd1'));
 assert.equal(u.d1.sizeVelocityExceeded, true);
});

test('duct size: round sub-branches from the diameter list, rectangular when none is enough', () => {
 const r = S.size(net({ settings: { sizing: { sub_branch: { shape: 'round', velocityMps: 4 } }, roundDiametersMm: [100, 125, 160] } })), u = by(r);
 assert.deepEqual([u.d4.shape, u.d4.diameterMm], ['round', 100]);   // 60 CMH in Ø100: 2.1 m/s ≤ 4
 assert.equal(u.d1.shape, 'rect', 'mains stay rectangular');
 assert.deepEqual(S.roundSize(60, { velocityMps: 4, maxHeightMm: 0 }, [100, 125]), { shape: 'round', widthMm: 0, heightMm: 0, diameterMm: 100, exceeded: false });
 assert.equal(S.roundSize(900, { velocityMps: 4, maxHeightMm: 0 }, [100, 125]), null);
});

test('duct size: a graph that cannot be sized says why and sizes nothing', () => {
 const loop = net(); loop.ducts.push({ id: 'd6', type: 'branch', fromNodeId: 'A', toNodeId: 'K' });
 const codes = n => S.size(n).messages.filter(m => m.type === 'error').map(m => m.code);
 assert.ok(codes(loop).includes('LOOP') || codes(loop).includes('RU_DEGREE'));
 assert.deepEqual(codes(net({ nodes: net().nodes.filter(n => n.id !== 'R') })).slice(0, 1), ['NO_ROOT']);
 const open = net(); open.ducts[1] = { ...open.ducts[1], toNodeId: 'X' }; assert.ok(codes(open).includes('OPEN_DUCT'));
 const zero = net(); zero.diffusers[1] = { ...zero.diffusers[1], flowCmh: 0 }; assert.ok(codes(zero).includes('RU_FLOW'));
 assert.equal(S.size(loop).ductUpdates.length, 0);
});
