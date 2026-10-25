// V2-0 기준값 (tools/v1-golden.cjs, tools/phg-golden.cjs): the fixtures, where made, are what 1.x's lib makes of the
// saved projects again (derive from project.json), and the helpers that make runs comparable work. Making the fixtures
// needs a browser (npm run golden); without them only the helper tests run.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const G = require('../tools/v1-golden.cjs'), P = require('../tools/phg-golden.cjs'), K = require('../lib/contract.cjs');
const S5 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 's5.contract.json'), 'utf8'));

test('golden: DXF entity counts by type and layer', () => {
 const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', 'ROOM', '10', '0', '0', 'POLYLINE', '8', 'DUCT', '66', '1', '0', 'VERTEX', '8', 'DUCT', '0', 'SEQEND', '0', 'TEXT', '8', 'ROOM', '0', 'ENDSEC', '0', 'EOF'].join('\n');
 assert.deepEqual(G.dxfCounts(dxf), { entities: 5, byType: { LINE: 1, POLYLINE: 1, SEQEND: 1, TEXT: 1, VERTEX: 1 }, byLayer: { DUCT: 1, ROOM: 2 }, bytes: Buffer.byteLength(dxf) });
});

test('golden: a run is made comparable (time stamps, BOX-made deck ids)', () => {
 const id = 'D17929369470750.4211', run = { project: { contract: { decks: [{ id }], rooms: [{ id: id + '_101', deckId: id }] }, projects: { [id + '__AHU']: '{}' }, box: { format: 'BOX JSON' },
  results: { [id + '__AHU']: { auto: true, at: 1792936947075, seconds: 4.9 } }, savedAt: '2026-10-25T00:00:00Z' }, cal: { decks: [{ id }] }, extract: {} };
 const n = G.normalize(run);
 assert.equal(n.project.contract.decks[0].id, 'DECK1'); assert.equal(n.project.contract.rooms[0].id, 'DECK1_101');
 assert.deepEqual(n.project.results, { DECK1__AHU: { auto: true, at: 1, seconds: 0 } });
 assert.equal(n.project.savedAt, '-'); assert.equal(n.project.projects, undefined); assert.equal(n.project.box, undefined);
 assert.equal(n.cal.decks[0].id, 'DECK1'); assert.equal(n.phgProjects, 1);
});

test('golden: PHG D ids numbered in order of first use, time fields zero', () => {
 const a = P.canonical({ nodes: [{ id: 'node-1792936947075-ab12cd', x: 1 }, { id: 'node-1792936947999-ff00aa', parentId: 'node-1792936947075-ab12cd' }], at: 5, name: 'D1__AHU-ACC' });
 assert.deepEqual(a, { nodes: [{ id: '#1', x: 1 }, { id: '#2', parentId: '#1' }], at: 0, name: 'D1__AHU-ACC' });
 const b = P.canonical({ nodes: [{ id: 'node-1800000000000-zz99yy', x: 1 }, { id: 'node-1800000000001-qq11rr', parentId: 'node-1800000000000-zz99yy' }], at: 9, name: 'D1__AHU-ACC' });
 assert.deepEqual(a, b, 'two runs with other ids are the same');
 assert.equal(P.safe('DECK1__AHU/ACC 1'), 'DECK1__AHU_ACC_1');
});

test('golden: derive on a project without networks (S5 contract)', () => {
 const d = G.derive({ contract: K.applyRules(S5), results: {}, geometry: {} });
 assert.deepEqual(Object.keys(d), G.DERIVED);
 assert.equal(d.rooms.rooms.length, S5.rooms.length);
 // F-1: one summer airflow - no room airflow set by heating
 assert.equal(Object.values(d.airflow.rooms).filter(a => a.basis === 'heating').length, 0);
 assert.ok(d.outputs.xlsx && Object.keys(d.outputs.xlsx).length > 5);
 assert.deepEqual(G.derive({ contract: K.applyRules(S5), results: {}, geometry: {} }), d, 'the same twice');
});

for (const ship of ['s5', 't3', 'n3']) {
 const dir = path.join(G.FIXTURES, ship), have = fs.existsSync(path.join(dir, 'project.json'));
 test(`golden ${ship}: 1.x lib makes the same of the saved project`, { skip: !have && 'test/fixtures/v1-golden/' + ship + ' 없음 (npm run golden)' }, () => {
  const d = G.derive(G.read(dir, 'project'));
  for (const k of G.DERIVED) assert.deepEqual(d[k], G.read(dir, k), `${ship} ${k}.json`);
  // F-1 in the reference too
  assert.equal(Object.values(d.airflow.rooms).filter(a => a.basis === 'heating').length, 0, 'F-1');
  assert.equal(d.review.done, d.review.total, 'AUTO done on every plan');
 });
 const pdir = path.join(P.FIXTURES, ship), phave = fs.existsSync(path.join(pdir, 'index.json'));
 test(`phg golden ${ship}: a file for every plan, readable`, { skip: !phave && 'test/fixtures/phg-golden/' + ship + ' 없음 (npm run golden)' }, () => {
  const index = JSON.parse(fs.readFileSync(path.join(pdir, 'index.json'), 'utf8'));
  for (const k of index.order) { const e = P.ungz(path.join(pdir, P.safe(k) + '.json.gz')); assert.ok(e.loaded && e.auto, k); assert.equal(e.auto.result.ducts, index.plans[k].ducts, k); }
  if (have) assert.equal(index.order.length, G.read(dir, 'rus').length, 'every plan of the v1 golden');
 });
}
