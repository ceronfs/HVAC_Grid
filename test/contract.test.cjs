// node --test test/
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { buildContract, roomAirflow, validate, DEFAULT_RULES } = require('../lib/contract.cjs');
const s5 = require('../samples/s5.contract.json');

test('airflow rules v0', () => {
 const room = sys => ({ systems: { supply: null, exhaust: null, return: null, ...sys } });
 const load = (o = {}) => ({ coolingSensibleW: 2804, achAirCmh: 114.5, minFreshAirCmh: 144, complete: true, ...o });
 // supply: ceil10(2804 x 3 / 10) = 850; return = supply when there is no exhaust
 assert.deepEqual(roomAirflow(room({ supply: 'AHU', return: 'RET' }), load(), DEFAULT_RULES), { supplyCmh: 850, exhaustCmh: 0, returnCmh: 850, freshAirCmh: 144, source: 'load' });
 // exhaust: ceil10(ACH x volume); return never negative
 assert.deepEqual(roomAirflow(room({ supply: 'AHU', exhaust: 'EXH', return: 'RET' }), load({ coolingSensibleW: 89 }), DEFAULT_RULES).exhaustCmh, 120);
 assert.equal(roomAirflow(room({ supply: 'AHU', exhaust: 'EXH', return: 'RET' }), load({ coolingSensibleW: 89 }), DEFAULT_RULES).returnCmh, 0);
 // no system -> no air; pending room -> nothing yet
 assert.equal(roomAirflow(room({}), load(), DEFAULT_RULES).supplyCmh, 0);
 assert.equal(roomAirflow(room({ supply: 'AHU' }), load({ complete: false }), DEFAULT_RULES).source, 'pending');
 // dT changes the supply
 assert.equal(roomAirflow(room({ supply: 'AHU' }), load(), { ...DEFAULT_RULES, supplyDeltaTK: 12 }).supplyCmh, 710);
});

test('S5 sample contract (BOX CAL Enhance built-in example)', () => {
 assert.deepEqual(validate(s5), []);
 assert.equal(s5.schema, 'hvac-grid/0');
 assert.equal(s5.decks.length, 5);
 assert.equal(s5.rooms.length, 94);
 const supply = s5.systems.filter(s => s.kind === 'supply');
 assert.equal(supply.length, 10);
 assert.ok(supply.every(s => s.deckIds.length === 1), 'each S5 supply system serves one deck');
 assert.equal(supply.reduce((t, s) => t + s.designCmh, 0), 10420);
 const wheelhouse = s5.rooms.find(r => r.no === '501');
 assert.equal(wheelhouse.isoClass, 'WHEELHOUSE');
 assert.equal(s5.airflow[wheelhouse.id].supplyCmh, 850);
});

test('validate catches broken references', () => {
 const c = JSON.parse(JSON.stringify(s5));
 c.rooms[0].deckId = 'NOPE'; c.rooms[1].polygon = [{ x: 0, y: 0 }];
 const problems = validate(c);
 assert.ok(problems.some(p => p.includes('unknown deck')));
 assert.ok(problems.some(p => p.includes('polygon')));
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
 const { applyRules } = require('../lib/contract.cjs'), s5 = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../samples/s5.contract.json'), 'utf8'));   // a fresh copy: other tests change the shared one
 const c = applyRules(s5, { supplyDeltaTK: 12 });
 assert.equal(c.rules.supplyDeltaTK, 12);
 const sup = k => k.systems.filter(x => x.kind === 'supply').reduce((t, x) => t + x.designCmh, 0);
 assert.ok(sup(c) < sup(s5));
 for (const s of c.systems.filter(x => x.kind === 'supply')) assert.equal(s.designCmh, s.roomIds.reduce((t, id) => t + c.airflow[id].supplyCmh, 0));
 assert.deepEqual(c.loads, s5.loads);
 assert.equal(s5.rules.supplyDeltaTK, 10);
});
