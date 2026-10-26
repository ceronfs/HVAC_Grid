// Ver 2.0 recompute (lib/model/run.cjs, lib/engines/producers.cjs - V2-3.2, 3.9): a 1.0 project opened in 2.0 works
// out the same review as 1.0 with the networks it brought; a change marks only what reads it (one deck's networks, not
// the others'); the change and its recompute undo together; the 2.0 duct engine makes every network again, in worker
// threads too.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('path');
const V = require('../lib/io/v1.cjs'), G = require('../tools/v1-golden.cjs'), RUN = require('../lib/model/run.cjs'), C = require('../lib/model/commands.cjs'), S = require('../lib/model/schema.cjs');

const J = v => JSON.parse(JSON.stringify(v));
async function open(ship) { let m = V.fromV1(G.read(path.join(G.FIXTURES, ship), 'project')).model; m = await RUN.recompute(m, { upTo: 'plans' }); m = RUN.adoptV1(m); return RUN.recompute(m); }

for (const ship of ['s5', 't3', 'n3']) test(`run: ${ship} opened in 2.0 - every 1.0 network fits its plan, the review is 1.0's`, async () => {
 const m = await open(ship), g = G.read(path.join(G.FIXTURES, ship), 'review');
 assert.deepEqual(RUN.state(m).filter(s => s.state !== 'fresh'), [], 'everything up to date');
 for (const k of ['count', 'checks', 'air', 'done', 'stale', 'total']) assert.deepEqual(J(m.review[k]), g[k], k);
 assert.deepEqual(S.clean(J(m)).model.review.count, m.review.count, 'saved and read again');
});

test('run: a change stales only its readers - one room on one deck, the other decks\' networks stay', async () => {
 let m = await open('t3');
 const room = m.rooms.find(r => r.deckId === 'D4' && m.assign[r.id]?.supply && m.loads[r.id].complete);
 const h = C.createHistory();
 m = h.run(m, { label: '부하', ops: [{ path: ['loads', room.id, 'coolingSensibleW'], value: m.loads[room.id].coolingSensibleW * 2 }] });
 const before = RUN.state(m);
 assert.deepEqual(before.filter(s => s.state === 'stale').map(s => s.id), ['airflow']);
 const ran = []; m = await RUN.recompute(m, { history: h, onStep: s => ran.push(s.id + ':' + s.count) });
 // the plans of the system serving that room on D4 moved (more air): only those networks were made again
 const touched = ran.find(x => x.startsWith('networks:')), n = +touched.split(':')[1];
 assert.ok(n >= 1 && n < m.plans.length, ran.join(' '));
 assert.ok(m.plans.filter(p => p.deckId !== 'D4').every(p => m.networks[p.key].source === 'v1'), 'other decks keep the 1.0 networks');
 assert.equal(m.networks[m.plans.find(p => p.deckId === 'D4' && p.rus.some(u => u.roomId === room.id)).key].source, 'engine');
 assert.deepEqual(RUN.state(m).filter(s => s.state !== 'fresh'), []);
 // undo: the recompute steps first, then the change - back to the 1.0 networks and the load as it was
 while (h.canUndo) m = h.undo(m);
 assert.equal(m.loads[room.id].coolingSensibleW * 2, (await open('t3')).loads[room.id].coolingSensibleW * 2);
 assert.ok(Object.values(m.networks).every(x => x.source === 'v1'));
});

test('run: the 2.0 duct engine makes every network of S5 again, in worker threads as in one', async () => {
 const m0 = await open('s5'), drop = m => ({ ...m, results: Object.fromEntries(Object.entries(m.results).filter(([k]) => !k.startsWith('networks:'))) });
 const one = await RUN.recompute(drop(m0));
 const { createPool } = require('../lib/duct/pool.cjs'), pool = createPool({ threads: 2 });
 let two; try { two = await RUN.recompute(drop(m0), { pool }); } finally { await pool.close(); }
 assert.equal(one.review.done, one.review.total); assert.ok(Object.values(one.networks).every(n => n.source === 'engine' && n.result.unconnected === 0));
 const strip = m => Object.fromEntries(Object.entries(m.networks).map(([k, n]) => [k, { ...n, result: { ...n.result, at: null, seconds: 0 } }]));
 assert.deepEqual(strip(two), strip(one));
 assert.deepEqual(two.review.systems.map(s => s.indexPa), one.review.systems.map(s => s.indexPa));
});

test('run: tools/hvac-run2.cjs - S5 design data to every output with 2.0 code only', async () => {
 const H = require('../tools/hvac-run2.cjs'), os = require('os'), fs = require('fs'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'hg2-'));
 try {
  const r = await H.run(path.join(__dirname, '..', 'samples', 's5.contract.json'), out, { threads: 2, log: () => {} }), { summary } = H.writeOutputs(r.model, out);
  assert.deepEqual([summary.autoDone, summary.plans, summary.unconnected], [18, 18, 0]);
  for (const f of ['model.hg2.json', 'report.xlsx', 'report.html', 'integrated.dxf', 'fire-plan.dxf']) assert.ok(fs.statSync(path.join(out, f)).size > 1000, f);
  // the model file opens again with nothing to recompute
  const again = S.clean(JSON.parse(fs.readFileSync(path.join(out, 'model.hg2.json'), 'utf8'))).model;
  assert.deepEqual(RUN.state(again).filter(s => s.state === 'stale'), []);
 } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
