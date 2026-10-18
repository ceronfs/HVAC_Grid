'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const D = require('../lib/ducts.cjs'), { plan } = require('../lib/phg-plan.cjs'), { systems } = require('../lib/risers.cjs');
const s5 = require('../samples/s5.contract.json');

test('duct physics: Colebrook friction against hand values', () => {
 // smooth turbulent limit: Blasius 0.316 Re^-0.25 at Re 1e5 = 0.0178; Colebrook (smooth) gives 0.0180
 assert.ok(Math.abs(D.friction(1e5, 0) - 0.0180) < 0.0003);
 assert.equal(D.friction(1000, 0.001), 64 / 1000);
 // round 300 mm, 1500 CMH: v = 5.89 m/s, Re = 1.2 x 5.89 x 0.3 / 1.81e-5 = 117,200, eps/D = 0.0003 -> f = 0.0197,
 // dp/L = f / D x rho v^2 / 2 = 0.0197 / 0.3 x 20.8 = 1.37 Pa/m (ASHRAE friction chart reads about 1.4 Pa/m)
 const pa = D.frictionPaPerM(1500, { diameterMm: 300 });
 assert.ok(pa > 1.3 && pa < 1.45, 'friction ' + pa);
 // rectangular by hydraulic diameter: 400 x 200 -> Dh = 267 mm
 assert.ok(Math.abs(D.hydraulicM({ widthMm: 400, heightMm: 200 }) - 0.2667) < 0.001);
});

test('riser sizing keeps the velocity and friction limits with the smallest section', () => {
 for (const q of [80, 400, 930, 2460, 3640, 12000]) {
  const s = D.sizeRect(q), v = D.velocityMps(q, s);
  assert.ok(v <= D.RISER_RULES.maxVelocityMps + 1e-9, `${q}: v ${v}`);
  assert.ok(D.frictionPaPerM(q, s) <= D.RISER_RULES.maxFrictionPaM + 1e-9, `${q}: friction`);
  assert.ok(s.widthMm >= s.heightMm && s.widthMm / s.heightMm <= 4);
 }
});

test('S5 systems: risers carry the air beyond them, the index is the worst deck', () => {
 const ps = plan(s5), res = Object.fromEntries(ps.map(p => [p.key, { indexPa: 50 }]));
 const all = systems(s5, ps, res), ret = all.find(s => s.systemKey === 'RET-ROOM');
 assert.equal(ret.unitDeckId, 'S1'); assert.equal(ret.fanCmh, 5960); assert.equal(ret.risers.length, 3);
 const first = ret.risers.find(r => r.fromDeckId === 'S1');
 assert.equal(first.toDeckId, 'S3'); assert.deepEqual(first.through, ['S2']);    // passes S2 without serving it
 assert.equal(first.flowCmh, 5960 - ps.find(p => p.key === 'S1__RET-ROOM').designCmh);
 assert.equal(first.verticalM, 6);
 // the top deck is reached through all three risers
 const top = ret.decks.find(d => d.deckId === 'S5');
 assert.equal(top.risers.length, 3);
 assert.ok(Math.abs(top.riserPa - ret.risers.reduce((t, r) => t + r.totalPa, 0)) < 0.2);
 assert.equal(ret.indexDeckId, 'S5'); assert.equal(ret.indexPa, top.totalPa);
 // single-deck systems have no risers and their index is the deck index
 const one = all.find(s => s.systemKey === 'SUP-ER-02');
 assert.equal(one.risers.length, 0); assert.equal(one.indexPa, 50);
 // without PHG D results the index is unknown
 assert.equal(systems(s5, ps).find(s => s.systemKey === 'RET-ROOM').indexPa, null);
});
