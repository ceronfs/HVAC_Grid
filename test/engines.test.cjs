// Ver 2.0 engines of V2-3.9 (lib/engines/{fire,airflow,systems,review}), new code, against the 1.x golden values of S5,
// T3 and N3 (D8, D15: the same function - here the same numbers): SOLAS spaces, room airflow and zones, systems, the
// duct engine's plans, risers and ESP, fire boundaries, penetrations and the review. And F-1: one airflow all year.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('path');
const V = require('../lib/io/v1.cjs'), G = require('../tools/v1-golden.cjs');
const F = require('../lib/engines/fire/classify.cjs'), A = require('../lib/engines/airflow/airflow.cjs'), PS = require('../lib/engines/systems/plans.cjs'), RV = require('../lib/engines/review/review.cjs'), AC = require('../lib/engines/review/air.cjs');

const golden = (ship, part) => G.read(path.join(G.FIXTURES, ship), part);
const J = v => JSON.parse(JSON.stringify(v));   // as the golden files hold it (undefined fields dropped)
const modelOf = ship => V.fromV1(golden(ship, 'project')).model;
const air = m => A.airflow({ rooms: m.rooms, decks: m.decks, loads: m.loads, rules: m.rules, assign: m.assign, transfers: m.transfers, conditions: m.conditions.project, classes: F.classes(m.rooms, m.solas) });

for (const ship of ['s5', 't3', 'n3']) test(`engines: ${ship} - the 2.0 engines give the 1.x golden values`, () => {
 const m = modelOf(ship), a = air(m), g = golden(ship, 'airflow');
 assert.deepEqual(a.airflow, g.rooms, 'room airflow'); assert.deepEqual(a.zones, g.zones, 'zones'); assert.deepEqual(a.systems, golden(ship, 'systems').systems, 'systems');
 const plans = PS.plans({ ...m, ...a, classes: F.classes(m.rooms, m.solas) });
 assert.deepEqual(J(plans), golden(ship, 'rus').map(({ dxfBytes, dxfSha, ...p }) => p), 'plans (root, RUs, zones)');
 // every golden network is fresh (AUTO done on these plans)
 const rv = golden(ship, 'review'); assert.equal(rv.stale, 0);
 const results = Object.fromEntries(Object.entries(m.networks).map(([k, n]) => [k, { ...n.result, stale: false }])), nets = Object.fromEntries(Object.entries(m.networks).map(([k, n]) => [k, { ducts: n.ducts }]));
 const r = RV.review({ ...m, ...a }, { plans, results, nets });
 assert.deepEqual(J(r.solas), golden(ship, 'solas'), 'SOLAS boundaries, penetrations, passages, check list');
 const sys = golden(ship, 'systems');
 assert.deepEqual(J(r.risers), sys.risers, 'risers');
 assert.deepEqual(J(r.systems.map(s => ({ system: s.systemKey, systemId: s.systemId, kind: s.kind, unitDeck: s.unitDeckId, fanCmh: s.fanCmh, designCmh: s.designCmh, decks: s.decks.map(d => d.deckId ?? d), complete: s.complete, espPa: s.indexPa, fanPa: s.fanPa, indexDeck: s.indexDeckId, riserLengthM: s.riserLengthM }))), sys.analysis, 'ESP, fan pressure');
 for (const k of ['count', 'checks', 'air', 'done', 'stale', 'total', 'staleNets', 'rootsOutside', 'rootsBadRoom', 'deepDucts', 'trunks', 'deckAlign']) assert.deepEqual(J(r[k]), rv[k], k);
});

test('engines: SOLAS spaces as 1.x for every ship type', () => {
 const SO = require('../lib/solas.cjs');
 for (const ship of ['s5', 't3', 'n3']) { const m = modelOf(ship); for (const type of F.SHIPS) for (const r of m.rooms) { const s = { ...m.solas, ship: type }; assert.deepEqual(F.classify(r, s, s.rooms || {}), SO.classify(r, SO.settingsOf({ solas: s }), s.rooms || {}), `${ship} ${type} ${r.name}`); } }
});

test('engines F-1: one airflow all year - a heating load changes no airflow; a room short of heat is a heating check', () => {
 const m = modelOf('t3'), a0 = air(m);
 const hot = { ...m, loads: Object.fromEntries(Object.entries(m.loads).map(([k, l]) => [k, { ...l, heatingW: l.heatingW * 10 }])) }, a1 = air(hot);
 assert.deepEqual(a1, a0, 'airflow, zones and systems do not move with the heating load');
 assert.ok(Object.values(a0.airflow).every(x => x.basis !== 'heating'), 'no heating basis');
 const checks = AC.airChecks({ ...hot, ...a1 }).filter(x => x.code === 'HEATING_DT');
 assert.ok(checks.length > 0 && checks.every(x => /풍량은 그대로/.test(x.text) && /보조 난방|재열기/.test(x.text)), 'HEATING_DT says: same airflow, supplementary heating or reheater');
 // supply = round up of max(cooling sensible × safety factor × 3 / ΔT, fresh air), nothing else
 const id = Object.keys(m.loads).find(k => a0.airflow[k].basis === 'cooling'), l = m.loads[id], margin = 1 + m.conditions.project.safetyFactorPct / 100;
 assert.equal(a0.airflow[id].supplyCmh, Math.ceil(l.coolingSensibleW * margin * 3 / m.rules.supplyDeltaTK / m.rules.roundCmh - 1e-9) * m.rules.roundCmh);
});

test('engines: the user\'s choices steer the plans - a unit deck, a Root and a moved RU', () => {
 const m = modelOf('t3'), a = air(m), classes = F.classes(m.rooms, m.solas), base = PS.plans({ ...m, ...a, classes });
 const multi = base.find(p => p.decks > 1 && p.isUnitDeck), other = base.find(p => p.systemKey === multi.systemKey && !p.isUnitDeck);
 const moved = PS.plans({ ...m, ...a, classes, unitDecks: { [multi.systemKey]: other.deckId } });
 assert.equal(moved.find(p => p.key === other.key).isUnitDeck, true); assert.equal(moved.find(p => p.key === other.key).unitDeckSource, 'user');
 const ru = base[0].rus[0], room = m.rooms.find(r => r.id === ru.roomId), inner = { x: ru.x + 100, y: ru.y };
 const p2 = PS.plans({ ...m, ...a, classes, roots: { [base[0].key]: { x: base[0].root.x, y: base[0].root.y + 100 } }, ruMoves: { [ru.id]: inner } });
 assert.equal(p2[0].rootSource, 'user'); assert.equal(p2[0].root.y, base[0].root.y + 100);
 const r2 = p2[0].rus.find(u => u.id === ru.id); assert.ok(r2.moved && r2.x === inner.x, room.name);
});
