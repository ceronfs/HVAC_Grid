// A worker thread of lib/duct/pool.cjs: one plan at a time through lib/duct/engine.cjs auto().
'use strict';
const { parentPort } = require('worker_threads'), E = require('./engine.cjs');
parentPort.on('message', ({ id, job }) => {
 try { const a = E.auto(job.plan, job.rooms, job.opt || {}); parentPort.postMessage({ id, network: a.network, result: a.result }); }
 catch (e) { parentPort.postMessage({ id, error: String(e?.stack || e) }); }
});
