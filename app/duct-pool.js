// Ver 2.0 duct engine in the browser (V2-1.8): plans in Web Workers (cores − 1), each running lib/duct/engine.cjs - what
// lib/duct/pool.cjs does in Node. Not used by the 1.x shell yet (K2 decides whether ④ moves to the engine).
//   const pool = await HVACGridDuct.createPool({ base: '../' }); const outs = await pool.run(jobs, { onDone }); pool.close();
//   jobs: [{ plan, rooms, opt }] → [{ network, result } | { error }] in the same order; pool.stop(): no more plans started
'use strict';
(function () {
 const FILES = ['engine.cjs', 'input.cjs', 'route.cjs', 'assign.cjs', 'size.cjs', 'pressure.cjs', 'astar.cjs', 'network.cjs'];
 // the sources: from the one-file copy's table when there is one, else from the server
 async function sources(base) {
  const table = window.HVACGridFiles, out = {};
  for (const f of FILES) { const p = 'lib/duct/' + f; out[f] = table?.[p] ?? await (await fetch(base + p)).text(); }
  return out;
 }
 async function createPool({ base = '../', threads = Math.max(1, (navigator.hardwareConcurrency || 2) - 1), workerUrl = null } = {}) {
  const files = await sources(base), table = window.HVACGridFiles;
  const url = workerUrl || (table?.['app/duct-worker.js'] != null ? URL.createObjectURL(new Blob([table['app/duct-worker.js']], { type: 'text/javascript' })) : base + 'app/duct-worker.js');
  const workers = await Promise.all(Array.from({ length: threads }, () => new Promise((resolve, reject) => {
   const w = new Worker(url); w.onmessage = e => { if (e.data.type !== 'ready') return; if (e.data.error) reject(new Error(e.data.error)); else resolve(w); }; w.onerror = e => reject(e); w.postMessage({ type: 'init', files });
  })));
  let stopped = false;
  async function run(jobs, { onDone = () => {} } = {}) {
   stopped = false; const out = new Array(jobs.length); let next = 0;
   await Promise.all(workers.slice(0, Math.max(1, Math.min(workers.length, jobs.length))).map(w => (async () => {
    while (!stopped && next < jobs.length) {
     const k = next++;
     out[k] = await new Promise(resolve => { w.onmessage = e => { if (e.data.id === k) resolve(e.data); }; w.onerror = e => resolve({ id: k, error: String(e.message || e) }); w.postMessage({ id: k, job: jobs[k] }); });
     onDone(k, out[k]);
    }
   })()));
   return out;
  }
  return { threads, run, stop() { stopped = true; }, close() { workers.forEach(w => w.terminate()); } };
 }
 window.HVACGridDuct = { createPool, FILES };
})();
