// Ver 2.0 duct engine - plans in parallel (V2-1.8): a pool of Node worker threads (cores − 1) each running
// lib/duct/engine.cjs auto() for one plan at a time. The browser gets the same with Web Workers (V2-3). A stop()
// lets the plans running finish and starts no more (the shell's 멈춤).
//   const pool = createPool({ threads }); const outs = await pool.run(jobs, { onDone }); pool.close();
//   jobs: [{ plan, rooms, opt }] → [{ network, result } | { error }] in the same order
'use strict';
const os = require('os'), path = require('path');

function createPool({ threads = Math.max(1, (os.availableParallelism?.() || os.cpus().length) - 1) } = {}) {
 const { Worker } = require('worker_threads'), file = path.join(__dirname, 'worker.cjs'), workers = [];
 let stopped = false;
 const get = i => workers[i] || (workers[i] = new Worker(file));
 async function run(jobs, { onDone = () => {} } = {}) {
  stopped = false;
  const out = new Array(jobs.length), n = Math.min(threads, jobs.length); let next = 0;
  await Promise.all(Array.from({ length: n }, (_, i) => (async () => {
   const w = get(i);
   while (!stopped && next < jobs.length) {
    const k = next++;
    out[k] = await new Promise(resolve => { const on = m => { w.off('message', on); w.off('error', bad); resolve(m); }, bad = e => { w.off('message', on); resolve({ error: String(e?.message || e) }); };
     w.on('message', on); w.on('error', bad); w.postMessage({ id: k, job: jobs[k] }); });
    onDone(k, out[k]);
   }
  })()));
  return out;
 }
 return { threads, run, stop() { stopped = true; }, close: () => Promise.all(workers.filter(Boolean).map(w => w.terminate())) };
}

module.exports = { createPool };
