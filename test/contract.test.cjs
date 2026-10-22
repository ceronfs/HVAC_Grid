// node --test test/
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const { buildContract, roomAirflow, validate, applyRules, DEFAULT_RULES } = require('../lib/contract.cjs');
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8'));   // a fresh copy per test
const s5 = load('s5.contract.json');

test('room airflow rules', () => {
 const room = sys => ({ systems: { supply: null, exhaust: null, return: null, ...sys } });
 const ld = (o = {}) => ({ coolingSensibleW: 2804, achAirCmh: 114.5, minFreshAirCmh: 144, complete: true, ...o });
 // supply: ceil10(2804 x 3 / 10) = 850; return = supply when there is no exhaust (per room, before the zone balance)
 assert.deepEqual(roomAirflow(room({ supply: 'AHU', return: 'RET' }), ld(), DEFAULT_RULES), { supplyCmh: 850, exhaustCmh: 0, returnCmh: 850, freshAirCmh: 144, source: 'load', basis: 'cooling' });
 // exhaust: ceil10(ACH x volume)
 assert.equal(roomAirflow(room({ supply: 'AHU', exhaust: 'EXH', return: 'RET' }), ld({ coolingSensibleW: 89 }), DEFAULT_RULES).exhaustCmh, 120);
 // supply is at least the room's fresh air: 89 W -> 27 CMH, fresh air 144 -> 150
 assert.equal(roomAirflow(room({ supply: 'AHU' }), ld({ coolingSensibleW: 89 }), DEFAULT_RULES).supplyCmh, 150);
 // no system -> no air; pending room -> nothing yet
 assert.equal(roomAirflow(room({}), ld(), DEFAULT_RULES).supplyCmh, 0);
 assert.equal(roomAirflow(room({ supply: 'AHU' }), ld({ complete: false }), DEFAULT_RULES).source, 'pending');
 // dT changes the supply
 assert.equal(roomAirflow(room({ supply: 'AHU' }), ld(), { ...DEFAULT_RULES, supplyDeltaTK: 12 }).supplyCmh, 710);
 // the safety factor (BOX coolingSensibleW is before it): ceil10(2804 x 1.1 x 3 / 10) = 930
 assert.equal(roomAirflow(room({ supply: 'AHU' }), ld(), DEFAULT_RULES, 1.1).supplyCmh, 930);
 // the airflow is the summer one all year: a heating load of 7400 W (7400 x 3 / 22 = 1010) does not raise it - winter is
 // the heating capacity on the same airflow (AGENTS.md)
 const h = roomAirflow(room({ supply: 'AHU' }), ld({ heatingW: 7400 }), DEFAULT_RULES);
 assert.equal(h.supplyCmh, 850); assert.equal(h.basis, 'cooling');
 assert.equal(roomAirflow(room({ supply: 'AHU' }), ld({ heatingW: 7400 }), { ...DEFAULT_RULES, heatingSupplyDeltaTK: 22 }).supplyCmh, 850);
 assert.equal(roomAirflow(room({ supply: 'AHU' }), ld({ coolingSensibleW: 89 }), DEFAULT_RULES).basis, 'freshAir');
});

test('supply uses the safety factor of the design conditions', () => {
 const { marginOf } = require('../lib/contract.cjs');
 assert.equal(marginOf(s5), 1.1); assert.equal(marginOf({ conditions: null }), 1);
 // every S5 room: supply = ceil10(max(sensible x 1.1 x 3 / dT, min fresh air)), before make-up air
 for (const r of s5.rooms.filter(x => x.systems.supply)) {
  const l = s5.loads[r.id], want = Math.ceil(Math.max(l.coolingSensibleW * 1.1 * 3 / s5.rules.supplyDeltaTK, l.minFreshAirCmh) / 10 - 1e-9) * 10;
  assert.ok(s5.airflow[r.id].supplyCmh >= want, r.no);
 }
});

test('S5 sample contract (BOX CAL Enhance built-in example)', () => {
 assert.deepEqual(validate(s5), []);
 assert.equal(s5.schema, 'hvac-grid/0'); assert.equal(s5.coordinates, 'ship');
 assert.equal(s5.decks.length, 5); assert.equal(s5.rooms.length, 94);
 const supply = s5.systems.filter(s => s.kind === 'supply');
 assert.equal(supply.length, 10);
 assert.ok(supply.every(s => s.deckIds.length === 1), 'each S5 supply system serves one deck');
 // 11,420 CMH from the loads with BOX's 10 % safety factor (10,420 before it, as in H1; window conduction on glazing +
 // 200 mm, BOX patch P) + make-up supply for the transfer air. The airflow is the summer one (AGENTS.md F-1): the
 // winter airflow of 2026-10-21 (11,610) is gone - the 24 small rooms that heat more than they cool keep their summer airflow
 assert.equal(s5.rooms.reduce((t, r) => t + s5.airflow[r.id].supplyCmh - (s5.airflow[r.id].makeupCmh || 0), 0), 11420);
 assert.equal(s5.rooms.filter(r => s5.airflow[r.id].basis === 'heating').length, 0);
 assert.equal(s5.rooms.filter(r => s5.airflow[r.id].basis === 'makeup').length, 5);
 assert.equal(supply.reduce((t, s) => t + s.designCmh, 0), 11580);   // round 2: no transfer air from the bridge wing, archive, refrigerator; round 3: make-up covers the 5 % pressurization
 const wheelhouse = s5.rooms.find(r => r.no === '501');
 assert.equal(wheelhouse.isoClass, 'WHEELHOUSE'); assert.equal(s5.airflow[wheelhouse.id].supplyCmh, 930);
 // deck ids of a system in elevation order
 assert.deepEqual(s5.systems.find(s => s.id === 'RET-ROOM').deckIds, ['S1', 'S3', 'S4', 'S5']);
});

// a deck with an L-shaped cabin around its toilet, a corridor, a public toilet next to the cabin and a CO2 room
function small(extra = {}) {
 const R = (id, name, x0, y0, x1, y1, sys, l, poly) => ({ id, no: id, name, deckId: 'D', polygon: poly || [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor: (x1 - x0) * (y1 - y0) / 1e6, volume: (x1 - x0) * (y1 - y0) * 2.8 / 1e6,
  sup: sys.s, exh: sys.e, ret: sys.r, coolingSensibleW: l.w || 0, minimumFreshAirCmh: l.oa || 0, ventilationAirCmh: l.ach || 0, calculationComplete: true });
 return buildContract({ source: {}, decks: [{ id: 'D', z: 0 }], rooms: [
  R('cab', '선원침실', 0, 0, 4000, 6000, { s: 'AHU', r: 'RA' }, { w: 1000, oa: 30 }, [[0, 0], [4000, 0], [4000, 6000], [2000, 6000], [2000, 4000], [0, 4000]]),
  R('wc1', '선원침실 화장실', 0, 4000, 2000, 6000, { e: 'EF' }, { ach: 140 }),
  R('cor', '복도', 0, 6000, 10000, 8000, { s: 'AHU', r: 'RA' }, { w: 300 }),
  R('wc2', '공용화장실', 4000, 0, 6000, 6000, { e: 'EF' }, { ach: 400 }),
  R('co2', 'CO2실', 6000, 0, 8000, 6000, { e: 'EF-CO2' }, { ach: 200 })] }, extra);
}

test('zone balance: transfer air, make-up supply, fresh air, return', () => {
 const c = small(), a = c.airflow, z = c.zones.find(x => x.supplySystemId === 'AHU');
 // the cabin toilet takes its air from the cabin (longest shared wall), the public toilet from the corridor
 assert.equal(a.wc1.transferFrom, 'cab'); assert.equal(a.wc1.transferInCmh, 140);
 assert.equal(a.wc2.transferFrom, 'cab');   // 6000 mm shared with the cabin vs 2000 with the corridor
 // CO2 room: gas tight, its own inlet
 assert.equal(a.co2.transferFrom, 'own-inlet');
 // the cabin gives 140 + 400: its supply is raised to cover it and the 5 % pressurization share (make-up), 567 -> 570
 assert.equal(a.cab.transferOutCmh, 540); assert.equal(a.cab.supplyCmh, 570); assert.equal(a.cab.makeupCmh, 570 - 300);
 // zone: exhaust = transfer given away 540, fresh air >= 540 x 1.05 = 567, return = supply - fresh air
 assert.equal(z.eaCmh, 540); assert.equal(z.oaNeedCmh, 567); assert.ok(z.ok);
 assert.equal(z.raCmh, z.saCmh - z.oaCmh); assert.ok(z.oaCmh >= 567);
 assert.equal(c.systems.find(s => s.id === 'RA').designCmh, z.raCmh);
 // the cabin has almost nothing left to return (its supply goes to the toilets): the corridor returns
 assert.ok(a.cab.returnCmh <= 30); assert.ok(a.cor.returnCmh > 0);   // the cabin keeps only the 30 CMH make-up margin
 // without make-up the zone cannot cover the exhaust: the zone fails
 const n = small({ transferMakeup: false }), zn = n.zones.find(x => x.supplySystemId === 'AHU');
 assert.equal(zn.ok, false); assert.equal(zn.raCmh, 0);
 // v0 per-room rule still available
 const v0 = applyRules(small(), { airBalance: 'room' });
 assert.equal(v0.zones.length, 0); assert.equal(v0.airflow.cor.returnCmh, v0.airflow.cor.supplyCmh);
});

test('S5 and T3 zones: every zone balanced, totals equal the systems', () => {
 for (const f of ['s5.contract.json', 't3.contract.json']) {
  const c = load(f);
  assert.ok(c.zones.length > 0 && c.zones.every(z => z.ok), f + ' zones');
  for (const z of c.zones) { assert.equal(z.saCmh, c.systems.find(s => s.kind === 'supply' && s.id === z.supplySystemId).designCmh); assert.equal(z.oaCmh + z.raCmh, z.saCmh); }
  const ra = c.systems.filter(s => s.kind === 'return').reduce((t, s) => t + s.designCmh, 0);
  assert.equal(ra, c.zones.reduce((t, z) => t + z.raCmh, 0), f + ' return = zone returns');
 }
});

test('validate catches broken references and wrong shapes', () => {
 const c = load('s5.contract.json');
 c.rooms[0].deckId = 'NOPE'; c.rooms[1].polygon = [{ x: 0, y: 0 }];
 const problems = validate(c);
 assert.ok(problems.some(p => p.includes('unknown deck'))); assert.ok(problems.some(p => p.includes('polygon')));
 // any parsed JSON: no throw, a list of problems
 for (const bad of [null, [], 'x', { schema: 'hvac-grid/0' }, { ...load('s5.contract.json'), rooms: 'x' }, { ...load('s5.contract.json'), solas: { ship: 'BOAT' } }, { ...load('s5.contract.json'), roots: { a: { x: 'q' } } }])
  assert.ok(validate(bad).length > 0, JSON.stringify(bad)?.slice(0, 40));
});

test('buildContract keeps system totals equal to room airflow', () => {
 const raw = { source: {}, decks: [{ id: 'D1', name: 'D1', z: 0, height: 3000 }], rooms: [
  { id: 'a', no: '1', name: 'A', deckId: 'D1', polygon: [[0, 0], [1000, 0], [1000, 1000]], floor: 1, volume: 3, sup: 'S1', coolingSensibleW: 100, calculationComplete: true },
  { id: 'b', no: '2', name: 'B', deckId: 'D1', polygon: [[0, 0], [1000, 0], [1000, 1000]], floor: 1, volume: 3, sup: 'S1', coolingSensibleW: 200, calculationComplete: true }] };
 const c = buildContract(raw);
 assert.equal(c.systems[0].designCmh, c.airflow.a.supplyCmh + c.airflow.b.supplyCmh);
 assert.equal(c.airflow.a.supplyCmh, 30); assert.equal(c.airflow.b.supplyCmh, 60);
});

test('applyRules: a larger supply dT lowers supply airflow and system totals, loads untouched', () => {
 const s = load('s5.contract.json'), c = applyRules(s, { supplyDeltaTK: 12 });
 assert.equal(c.rules.supplyDeltaTK, 12);
 const sup = k => k.systems.filter(x => x.kind === 'supply').reduce((t, x) => t + x.designCmh, 0);
 assert.ok(sup(c) < sup(s));
 for (const x of c.systems.filter(x => x.kind === 'supply')) assert.equal(x.designCmh, x.roomIds.reduce((t, id) => t + c.airflow[id].supplyCmh, 0));
 assert.deepEqual(c.loads, s.loads); assert.equal(s.rules.supplyDeltaTK, 10);
});
