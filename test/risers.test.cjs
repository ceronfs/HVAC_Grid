'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const D = require('../lib/ducts.cjs'), { plan } = require('../lib/phg-plan.cjs'), { systems, fanPa } = require('../lib/risers.cjs');
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8'));

test('duct physics: Colebrook friction against hand values', () => {
 // smooth turbulent limit: Blasius 0.316 Re^-0.25 at Re 1e5 = 0.0178; Colebrook (smooth) gives 0.0180
 assert.ok(Math.abs(D.friction(1e5, 0) - 0.0180) < 0.0003);
 assert.equal(D.friction(1000, 0.001), 64 / 1000);
 // round 300 mm, 1500 CMH: v = 5.89 m/s, Re = 117,200, eps/D = 0.0003 -> f = 0.0197, dp/L = 0.0197 / 0.3 x 20.8 = 1.37 Pa/m
 const pa = D.frictionPaPerM(1500, { diameterMm: 300 });
 assert.ok(pa > 1.3 && pa < 1.45, 'friction ' + pa);
 assert.ok(Math.abs(D.hydraulicM({ widthMm: 400, heightMm: 200 }) - 0.2667) < 0.001);
});

test('riser sizing keeps the velocity and friction limits with the smallest section; too much air is marked', () => {
 for (const q of [80, 400, 930, 2460, 3640, 12000]) {
  const s = D.sizeRect(q), v = D.velocityMps(q, s);
  assert.ok(v <= D.RISER_RULES.maxVelocityMps + 1e-9, `${q}: v ${v}`);
  assert.ok(D.frictionPaPerM(q, s) <= D.RISER_RULES.maxFrictionPaM + 1e-9, `${q}: friction`);
  assert.ok(s.widthMm >= s.heightMm && s.widthMm / s.heightMm <= 4); assert.ok(!s.exceeded);
 }
 assert.ok(D.sizeRect(500000).exceeded);
});

test('S5 systems: risers carry the air beyond them, tees and the worst deck', () => {
 const s5 = load('s5.contract.json'), ps = plan(s5), res = Object.fromEntries(ps.map(p => [p.key, { indexPa: 50 }]));
 const all = systems(s5, ps, res), ret = all.find(s => s.systemKey === 'RET-ROOM');
 assert.equal(ret.unitDeckId, 'S1'); assert.equal(ret.risers.length, 3);
 const first = ret.risers.find(r => r.fromDeckId === 'S1');
 assert.equal(first.toDeckId, 'S3'); assert.deepEqual(first.through, ['S2']);    // passes S2 without serving it
 assert.equal(first.flowCmh, ret.fanCmh - ps.find(p => p.key === 'S1__RET-ROOM').designCmh);
 assert.equal(first.verticalM, 6);
 // air goes on past S3 and S4: their risers carry a branch (to the deck) and a straight-through tee (onwards)
 assert.ok(first.branchPa > 0 && first.straightPa > 0);
 const last = ret.risers.find(r => r.toDeckId === 'S5'); assert.equal(last.branchPa, 0);
 // the top deck: straight-through losses on the way, no branch at the end
 const top = ret.decks.find(d => d.deckId === 'S5'), r3 = ret.risers;
 const expect = r3.reduce((t, r) => t + r.frictionPa + r.elbowPa + r.straightPa, 0) - last.straightPa;
 assert.ok(Math.abs(top.riserPa - expect) < 0.5, `${top.riserPa} vs ${expect}`);
 assert.equal(ret.indexPa, Math.max(...ret.decks.map(d => d.totalPa)));
 // single-deck systems have no risers and their index is the deck index; fan pressure adds the unit and the louver
 const one = all.find(s => s.systemKey === 'SUP-ER-02');
 assert.equal(one.risers.length, 0); assert.equal(one.indexPa, 50); assert.equal(fanPa(one), 50 + D.FAN_RULES.ahuInternalPa + D.FAN_RULES.louverPa);
 // without PHG D results, or with a stale one, the system pressure is unknown
 assert.equal(systems(s5, ps).find(s => s.systemKey === 'RET-ROOM').indexPa, null);
 const stale = { ...res, 'S3__RET-ROOM': { indexPa: 50, stale: true } }, rs = systems(s5, ps, stale).find(s => s.systemKey === 'RET-ROOM');
 assert.equal(rs.indexPa, null); assert.equal(rs.complete, false); assert.ok(rs.stale);
 // fire dampers in a riser add their loss
 const withFd = systems(s5, ps, res, D.RISER_RULES, { [first.id]: 12 }).find(s => s.systemKey === 'RET-ROOM');
 assert.equal(withFd.risers.find(r => r.id === first.id).damperPa, 12);
});

test('T3: the multi-deck supply goes up the trunk, the unit deck is the fan-room deck', () => {
 const t3 = load('t3.contract.json'), ps = plan(t3), acc = systems(t3, ps).find(s => s.systemKey === 'AHU-ACC');
 assert.equal(acc.unitDeckId, 'D1'); assert.deepEqual(acc.risers.map(r => `${r.fromDeckId}-${r.toDeckId}`), ['D1-D2', 'D2-D3']);
 assert.ok(ps.filter(p => p.systemKey === 'AHU-ACC' && !p.isUnitDeck).every(p => p.rootSource.startsWith('shaft-room')));
});
