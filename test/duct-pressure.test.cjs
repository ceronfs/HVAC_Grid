// Ver 2.0 duct engine, pressure (lib/duct/pressure.cjs, V2-1.6): the final networks of the PHG D golden values (S5, T3,
// N3: sized ducts, nodes, RUs) through the new engine - every RU path, every duct's friction, elbow and junction
// coefficient, and the index pressure 1.0 takes (indexPa) - and the rules on small networks.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const X = require('../lib/duct/pressure.cjs'), P = require('../tools/phg-golden.cjs');

test('duct pressure: every path of the PHG D golden values', { skip: !fs.existsSync(path.join(P.FIXTURES, 's5', 'index.json')) && 'phg-golden 없음' }, () => {
 let plans = 0, paths = 0, ducts = 0;
 for (const ship of ['s5', 't3', 'n3']) {
  const dir = path.join(P.FIXTURES, ship), index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  for (const k of index.order) {
   const a = P.ungz(path.join(dir, P.safe(k) + '.json.gz')).auto, got = X.pressure({ nodes: a.nodes, ducts: a.ducts, diffusers: a.diffusers });
   assert.equal(got.indexPa, a.result.indexPa, `${ship} ${k} index Pa`);
   for (const w of a.pressure.paths) {
    const g = got.paths.find(p => p.diffuserId === w.diffuserId), at = `${ship} ${k} ${w.diffuserId}`;
    assert.ok(g, at); assert.deepEqual(g.pathDuctIds, w.pathDuctIds, at);
    for (const f of ['totalPressureLossPa', 'ductFrictionLossPa', 'elbowLossPa', 'branchLossPa', 'ruPressureLossPa']) assert.ok(Math.abs(g[f] - w[f]) <= 0.051, `${at} ${f} ${g[f]} ≠ ${w[f]}`);
    for (const wd of w.details) {
     const gd = g.details.find(d => d.ductId === wd.ductId);
     for (const f of ['frictionLossPa', 'bendLossPa', 'branchLossPa']) assert.ok(Math.abs(gd[f] - wd[f]) <= 0.011, `${at} ${wd.ductId} ${f}`);
     for (const f of ['elbowCoefficientSum', 'branchCoefficient', 'frictionFactor']) assert.ok(Math.abs(gd[f] - wd[f]) <= 1.1e-4, `${at} ${wd.ductId} ${f} ${gd[f]} ≠ ${wd[f]}`);
     ducts++;
    }
    paths++;
   }
   plans++;
  }
 }
 assert.ok(plans === 52 && paths > 400, `${plans} plans, ${paths} paths, ${ducts} path ducts`);
});

// root → 4 m main east → tee: 3 m straight on east, 2 m branch north → RUs
const D = (id, type, from, to, pts, w, h, q) => ({ id, type, fromNodeId: from, toNodeId: to, points: pts.map(([x, y]) => ({ x, y })), shape: 'rect', widthMm: w, heightMm: h, diameterMm: 0, flowCmh: q });
const tee = mode => ({
 nodes: [{ id: 'R', type: 'root', pressureFlowMode: mode }, { id: 'T', type: 'junction' }, { id: 'A', type: 'diffuser' }, { id: 'B', type: 'diffuser' }],
 ducts: [D('m', 'main', 'R', 'T', [[0, 0], [4000, 0]], 300, 200, 1500), D('s', 'main', 'T', 'A', [[4000, 0], [7000, 0]], 250, 200, 1000), D('b', 'branch', 'T', 'B', [[4000, 0], [4000, 2000]], 200, 150, 500)],
 diffusers: [{ id: 'uA', connectedNodeId: 'A', flowCmh: 1000 }, { id: 'uB', connectedNodeId: 'B', flowCmh: 500 }] });

test('duct pressure: friction by Darcy-Weisbach with Haaland, 10 Pa at the RU, the index path the largest', () => {
 const r = X.pressure(tee('supply')), m = r.paths[0].details[0];
 // 1500 CMH in 300 × 200: 6.94 m/s, Dh 0.24 m
 const v = 1500 / 3600 / 0.06, re = v * 0.24 * 1.2 / 1.81e-5, f = 1 / (-1.8 * Math.log10((0.09 / 1000 / 0.24 / 3.7) ** 1.11 + 6.9 / re)) ** 2;
 assert.ok(Math.abs(m.frictionLossPa - f * 4 / 0.24 * 0.6 * v * v) < 0.01);
 assert.equal(r.paths.length, 2); assert.ok(r.paths.every(p => p.ruPressureLossPa === 10));
 assert.equal(r.indexPa, Math.round(Math.max(...r.paths.map(p => p.totalPressureLossPa))));
});

test('duct pressure: supply tee - SR5-13 straight (Cs on Pvs) and branch (Cb on Pvb), never below 0', () => {
 const r = X.pressure(tee('supply')), s = r.paths.find(p => p.diffuserId === 'uA').details[1], b = r.paths.find(p => p.diffuserId === 'uB').details[1];
 assert.equal(s.branchAngleDeg, 0); assert.match(s.fittingBasis, /SR5-13 Cs/); assert.equal(b.branchAngleDeg, 90); assert.match(b.fittingBasis, /SR5-13 Cb/);
 assert.ok(s.branchCoefficient >= 0 && b.branchCoefficient >= 0);
 assert.ok(Math.abs(b.branchAreaRatio - 0.5) < 1e-9 && Math.abs(b.branchFlowRatio - 1 / 3) < 1e-4);
});

test('duct pressure: exhaust tee - ER5-3 from the nearest geometry row, negative K kept', () => {
 const r = X.pressure(tee('exhaust')), s = r.paths.find(p => p.diffuserId === 'uA').details[1], b = r.paths.find(p => p.diffuserId === 'uB').details[1];
 assert.match(s.fittingBasis, /ER5-3 Cc,s/); assert.match(b.fittingBasis, /ER5-3 Cc,b/);
 // straight inlet 0.05 m², branch 0.03, common 0.06: Ab/As 0.6, Ab/Ac 0.5 → the row (0.67, 0.5); Qb/Qs 0.5 → main 0.12
 assert.ok(Math.abs(s.branchCoefficient - 0.12) < 1e-9);
 assert.ok(Math.abs(b.branchCoefficient - X.lin([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], X.tables.ER5_3[2].branch, 1 / 3)) < 1e-4);
});

test('duct pressure: a turn of 15° or more at a two-duct node is an elbow on the downstream duct (CR3-1 to 200 mm, CR3-3 wider)', () => {
 const n = { nodes: [{ id: 'R', type: 'root' }, { id: 'K', type: 'junction' }, { id: 'A', type: 'diffuser' }],
  ducts: [D('a', 'main', 'R', 'K', [[0, 0], [3000, 0]], 300, 200, 900), D('c', 'branch', 'K', 'A', [[3000, 0], [3000, 2000]], 200, 200, 900)], diffusers: [{ id: 'u', connectedNodeId: 'A', flowCmh: 900 }] };
 const d = X.pressure(n).paths[0].details[1];
 assert.equal(d.bendCount, 1); assert.match(d.fittingBasis, /CR3-1/);
 // W 200: r = 100 + 100, r/W 1, H/W 1 → Co90 0.21 × KRe
 assert.ok(d.elbowCoefficientSum > 0.21 && d.elbowCoefficientSum < 0.21 * 2);
 const w = X.elbowK(X.section({ shape: 'rect', widthMm: 300, heightMm: 200, flowCmh: 900 }, X.DEFAULTS), 90, X.DEFAULTS);
 assert.match(w.basis, /CR3-3/); assert.ok(Math.abs(w.k - 0.0922) < 1e-4);
 n.ducts[1].points = [{ x: 3000, y: 0 }, { x: 5000, y: 300 }];   // 8.5°: no elbow
 assert.equal(X.pressure(n).paths[0].details[1].bendCount, 0);
});
