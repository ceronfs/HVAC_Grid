// Ver 2.0 recompute (V2-3.2): run the producers whose results are not up to date, in order, each as one command (its
// parts and its stamps in the recompute table), so a change and what it led to undo together when the caller runs them
// through one history. Networks run per plan - in a worker pool when one is given (lib/duct/pool.cjs, app/duct-pool.js).
//   state(model)                         → [{ id, key, state }] of every producer
//   recompute(model, { upTo, skip, pool, history, group, onStep }) → Promise<model>
//     group: the history group of the edit that led to it, so both undo as one
//     upTo: stop after this producer; skip: producer ids not to run (their results stay as they are)
//   adoptV1(model)                       → model with the 1.0 networks that fit today's plans marked up to date
'use strict';
const GR = require('./graph.cjs'), C = require('./commands.cjs'), { PRODUCERS } = require('../engines/producers.cjs');

const state = (m, producers = PRODUCERS) => GR.status(m, producers);
const late = (m, id, producers) => state(m, producers).filter(s => s.id === id && s.state !== 'fresh');

async function recompute(m, { upTo = null, skip = [], pool = null, history = null, group = null, onStep = () => {}, producers = PRODUCERS } = {}) {
 const apply = (model, cmd) => history ? history.run(model, cmd, { group }) : C.apply(model, cmd).model, at = new Date().toISOString();
 for (const p of GR.order(producers)) {
  if (!skip.includes(p.id)) {
   const todo = late(m, p.id, producers);
   if (todo.length) {
    onStep({ id: p.id, count: todo.length });
    let ops;
    if (p.keys) {
     const keys = todo.map(s => s.key), have = new Set(p.keys(m));
     let outs;
     if (pool) { const inputs = keys.map(k => p.input(m, k)), answers = await pool.run(inputs.map(p.job)); outs = answers.map((o, i) => { if (o?.error) throw new Error(`${keys[i]}: ${o.error}`); return p.fromJob(inputs[i], o, at); }); }
     else outs = keys.map(k => p.runKey(m, k));
     ops = keys.map((k, i) => ({ path: [p.writes[0], k], value: outs[i] }));
     // what is gone: networks of plans no longer there, and their stamps
     for (const k of Object.keys(m[p.writes[0]] || {})) if (!have.has(k)) ops.push({ path: [p.writes[0], k], value: undefined });
     for (const k of Object.keys(m.results)) if (k.startsWith(p.id + ':') && !have.has(k.slice(p.id.length + 1))) ops.push({ path: ['results', k], value: undefined });
     ops.push(...keys.map(k => GR.stamp(m, p, k, at)));
    } else {
     const stale = new Set(state(m, producers).filter(s => s.id === 'networks' && s.state !== 'fresh').map(s => s.key));
     const out = p.run(m, { stale });
     ops = [...p.writes.map(w => ({ path: [w], value: out[w] })), GR.stamp(m, p, null, at)];
    }
    m = apply(m, { label: `다시 계산: ${p.id}`, ops });
   }
  }
  if (p.id === upTo) break;
 }
 return m;
}

// a 1.0 network fits today's plan when it was made for the same Root and the same RUs (place and airflow)
const fits = (n, p) => !!n?.root && n.root.x === p.root.x && n.root.y === p.root.y && n.rus.length === p.rus.length && n.rus.every((u, i) => u.x === p.rus[i].x && u.y === p.rus[i].y && u.flowCmh === p.rus[i].flowCmh);
function adoptV1(m, producers = PRODUCERS) {
 const p = producers.find(x => x.id === 'networks'), ops = [];
 for (const plan of m.plans) { const n = m.networks[plan.key]; if (n?.source === 'v1' && n.result && fits(n, plan)) ops.push(GR.stamp(m, p, plan.key, n.result.at || null)); }
 return ops.length ? C.apply(m, { label: '1.0 덕트망 그대로 씀', ops }).model : m;
}

module.exports = { state, recompute, adoptV1, fits };
