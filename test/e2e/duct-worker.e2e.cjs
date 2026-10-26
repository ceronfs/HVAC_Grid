// Ver 2.0 duct engine in the browser (app/duct-pool.js, app/duct-worker.js, V2-1.8): golden plans of S5, T3 and N3 run
// in Web Workers give the same network as lib/duct/engine.cjs in Node, and the plans run in parallel.
//   node test/e2e/duct-worker.e2e.cjs
'use strict';
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs');
const P = require('../../tools/phg-golden.cjs'), G = require('../../tools/v1-golden.cjs'), E = require('../../lib/duct/engine.cjs');

(async () => {
 const jobs = [];
 for (const ship of ['s5', 't3', 'n3']) {
  const dir = path.join(P.FIXTURES, ship), index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), rooms = G.read(path.join(G.FIXTURES, ship), 'project').contract.rooms;
  for (const key of index.order.slice(0, 6)) { const e = P.ungz(path.join(dir, P.safe(key) + '.json.gz')), byId = new Map(rooms.map(r => [r.id, r])); jobs.push({ key, plan: { ...e.plan }, rooms: (e.plan.rooms || []).map(id => byId.get(id)).filter(Boolean) }); }
 }
 const s = await start(), b = await launch(), p = await b.newPage(), errors = [];
 p.on('pageerror', e => errors.push(e.message));
 try {
  await p.goto(s.url + '/samples/t3/T3.solas.json');
  await p.addScriptTag({ url: '/app/duct-pool.js' });
  const t0 = Date.now();
  const outs = await p.evaluate(async jobs => { const pool = await HVACGridDuct.createPool({ base: '/' }); try { return { threads: pool.threads, outs: await pool.run(jobs.map(j => ({ plan: j.plan, rooms: j.rooms }))) }; } finally { pool.close(); } }, jobs);
  const ms = Date.now() - t0;
  outs.outs.forEach((o, i) => { assert.ok(!o.error, `${jobs[i].key}: ${o.error}`); assert.deepEqual(o.network, E.auto(jobs[i].plan, jobs[i].rooms).network, jobs[i].key + ': the same network as in Node'); });
  assert.deepEqual(errors, []);
  console.log(`E2E DUCT WORKER PASS · ${jobs.length} plans · ${outs.threads} workers · ${ms} ms`);
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E DUCT WORKER FAIL', e); process.exit(1); });
