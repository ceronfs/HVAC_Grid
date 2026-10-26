// Ver 2.0 model (V2-3.1 to 3.4): schema hvac-grid/2, the recompute table, commands with one undo, and the 1.x project
// read into the model and written back - S5, T3 and N3 of the golden values come back the same.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('path');
const S = require('../lib/model/schema.cjs'), GR = require('../lib/model/graph.cjs'), C = require('../lib/model/commands.cjs'), V = require('../lib/io/v1.cjs'), G = require('../tools/v1-golden.cjs');

const square = (x, y, s = 2000) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
function small() {
 const m = S.empty();
 m.decks = [{ id: 'D1', name: 'UPPER', code: 'D1', z: 0, height: 2800, origin: { x: 0, y: 0 }, rotation: 0, scale: 1, order: 0 }];
 m.rooms = [{ id: 'R1', deckId: 'D1', no: '101', name: '선실', polygon: square(0, 0), holes: [], areaM2: 4, volumeM3: 10, ceilingHeightMm: 2500, isoClass: null }];
 return m;
}

test('schema: an empty model is valid; a file is cleaned, a wrong one refused', () => {
 assert.deepEqual(S.validate(S.empty()), []);
 const { model } = S.clean(JSON.parse(JSON.stringify(small())));
 assert.deepEqual(model.rooms[0].polygon, square(0, 0));
 assert.throws(() => S.clean({ schema: 'hvac-grid/1' }), /2.0 모델이 아닙니다/);
 assert.throws(() => S.clean({ ...small(), rooms: [{ id: 'R1', deckId: 'DX', polygon: square(0, 0) }] }), /deck DX 없음/);
 assert.throws(() => S.clean({ ...small(), rules: { roundCmh: 0 } }), /roundCmh/);
 // a transfer source that is not a room, a unit deck that is not a deck: dropped
 const c = S.clean({ ...small(), transfers: { R1: 'nowhere' }, unitDecks: { AHU: 'D9' } }).model;
 assert.deepEqual([c.transfers, c.unitDecks], [{}, {}]);
});

test('schema F-1: one summer airflow - a winter airflow rule of an old file is dropped with a note, never kept', () => {
 const { model, notes } = S.clean({ ...small(), rules: { supplyDeltaTK: 11, heatingSupplyDeltaTK: 22 } });
 assert.equal(model.rules.supplyDeltaTK, 11); assert.equal('heatingSupplyDeltaTK' in model.rules, false);
 assert.match(notes.join(), /F-1/);
 assert.deepEqual(Object.keys(S.RULES).filter(k => /heat|winter/i.test(k)), []);
 const bad = S.empty(); bad.rules = { ...bad.rules, heatingSupplyDeltaTK: 22 };
 assert.match(S.validate(bad).join(), /heatingSupplyDeltaTK \(알 수 없는 규칙\)/);
});

test('graph: hash is canonical; a change stales its readers, and the producers after them wait', () => {
 assert.equal(GR.hash({ a: 1, b: [1, { c: 2 }] }), GR.hash({ b: [1, { c: 2 }], a: 1 }));
 assert.notEqual(GR.hash({ a: 1 }), GR.hash({ a: 2 })); assert.match(GR.hash('x'), /^[0-9a-f]{16}$/);
 const P = [{ id: 'air', reads: ['rooms', 'loads', 'rules'], writes: ['airflow'] }, { id: 'duct', reads: ['airflow', 'decks'], writes: ['networks'] }, { id: 'load', reads: ['rooms', 'conditions'], writes: ['loads'] }];
 assert.deepEqual(GR.order(P).map(p => p.id), ['load', 'air', 'duct']);
 assert.throws(() => GR.order([{ id: 'a', reads: ['y'], writes: ['x'] }, { id: 'b', reads: ['x'], writes: ['y'] }]), /돌아옴/);
 let m = small();
 assert.deepEqual(GR.status(m, P).map(s => s.state), ['stale', 'waiting', 'waiting']);
 for (const p of GR.order(P)) m = C.apply(m, { label: p.id, ops: [GR.stamp(m, p)] }).model;
 assert.deepEqual(GR.status(m, P).map(s => s.state), ['fresh', 'fresh', 'fresh']);
 m = C.apply(m, { ops: [{ path: ['rules', 'supplyDeltaTK'], value: 9 }] }).model;
 assert.deepEqual(GR.status(m, P).map(s => [s.id, s.state]), [['load', 'fresh'], ['air', 'stale'], ['duct', 'waiting']]);
});

test('graph: a keyed producer (one result per plan) - a change on one deck leaves the other deck fresh', () => {
 const p = { id: 'net', reads: ['rooms'], writes: ['networks'], keys: m => m.decks.map(d => d.id), input: (m, key) => m.rooms.filter(r => r.deckId === key) };
 let m = small(); m.decks.push({ ...m.decks[0], id: 'D2', order: 1 }); m.rooms.push({ ...m.rooms[0], id: 'R2', deckId: 'D2' });
 for (const k of ['D1', 'D2']) m = C.apply(m, { ops: [GR.stamp(m, p, k)] }).model;
 m = C.apply(m, { ops: [{ path: ['rooms', 1, 'name'], value: '사무실' }] }).model;
 assert.deepEqual(GR.status(m, [p]).map(s => [s.result, s.state]), [['net:D1', 'fresh'], ['net:D2', 'stale']]);
});

test('commands: structural sharing, undo and redo, a module writes only its parts', () => {
 const m0 = small(), h = C.createHistory();
 const m1 = h.run(m0, { label: '규칙', ops: [{ path: ['rules', 'supplyDeltaTK'], value: 8 }, { path: ['transfers', 'R1'], value: 'own-inlet' }] });
 assert.equal(m1.rooms, m0.rooms, 'untouched parts are the same objects'); assert.notEqual(m1.rules, m0.rules); assert.equal(m0.rules.supplyDeltaTK, 10);
 assert.deepEqual(h.labels(), { undo: '규칙', redo: null });
 const m2 = h.undo(m1); assert.deepEqual(m2.rules, m0.rules); assert.deepEqual(m2.transfers, {}); assert.equal('R1' in m2.transfers, false);
 assert.deepEqual(h.redo(m2).transfers, { R1: 'own-inlet' });
 assert.throws(() => C.apply(m0, { label: '덕트', ops: [{ path: ['rooms', 0, 'name'], value: 'x' }] }, { writes: ['networks'] }), /rooms에 쓸 수 없음/);
 assert.throws(() => C.apply(m0, { ops: [{ path: ['rooms', 5], value: {} }] }), /배열 끝 밖/);
 assert.ok(C.apply(m0, { ops: [{ path: ['results', 'x'], value: { inputHash: 'a', at: null } }] }, { writes: ['networks'] }).model.results.x, 'results goes with any module');
});

for (const ship of ['s5', 't3', 'n3']) test(`v1: ${ship} 1.x project → hvac-grid/2 → saved → read → 1.x project is the same, and so is what 1.x works out from it`, () => {
 const p = G.read(path.join(G.FIXTURES, ship), 'project'), { model, notes } = V.fromV1(p);
 assert.deepEqual(notes, []);
 assert.equal(model.schema, 'hvac-grid/2'); assert.equal(model.rooms.length, p.contract.rooms.length);
 assert.ok(model.rooms.every(r => !('systems' in r)), 'room system names live in assign');
 const key = Object.keys(p.geometry)[0];
 assert.equal(model.networks[key].root.y, -p.geometry[key].root.y, 'duct geometry in BOX y');
 const saved = S.clean(JSON.parse(JSON.stringify(model))).model;
 assert.deepEqual(saved, model, 'save and read again');
 const back = V.toV1(saved);
 for (const k of ['contract', 'results', 'geometry']) assert.deepEqual(back[k], p[k], k);
 const d = G.derive(back);
 for (const k of ['airflow', 'systems', 'solas', 'review']) assert.deepEqual(d[k], G.read(path.join(G.FIXTURES, ship), k), k);
});

test('v1: an old file - the winter airflow rule, the PHG D projects and the BOX drawing are not taken', () => {
 const p = G.read(path.join(G.FIXTURES, 't3'), 'project');
 const old = { ...p, projects: { 'D1__AHU-ACC': '{}' }, box: { format: 'BOX JSON', json: '{}' }, contract: { ...p.contract, rules: { ...p.contract.rules, heatingSupplyDeltaTK: 22 } } };
 const { model, notes } = V.fromV1(old);
 assert.equal(notes.length, 3); assert.match(notes.join('\n'), /PHG D 프로젝트 1개/); assert.match(notes.join('\n'), /F-1/);
 assert.equal('heatingSupplyDeltaTK' in model.rules, false); assert.equal('heatingSupplyDeltaTK' in V.toV1(model).contract.rules, false);
 assert.throws(() => V.fromV1({ schema: 'x' }), /1.x 파일이 아닙니다/);
});
