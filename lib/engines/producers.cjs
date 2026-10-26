// Ver 2.0 producers (V2-3.2, 3.9): every engine as an entry of the recompute table - the model parts it reads and writes
// and how it runs. lib/model/run.cjs runs the stale ones in order; the modules (app/modules/*) show their state.
//   classes → airflow → plans → networks (one per plan, the duct engine) → review
// F-1: airflow reads the loads and the rules - one summer airflow; nothing downstream raises it for winter.
'use strict';
const F = require('./fire/classify.cjs'), A = require('./airflow/airflow.cjs'), PS = require('./systems/plans.cjs'), RV = require('./review/review.cjs'), E = require('../duct/engine.cjs');

const deckRooms = (m, plan) => { const ids = new Set(plan.rooms); return m.rooms.filter(r => ids.has(r.id)); };
// what the duct engine needs of the model for one plan: the plan, its deck's rooms, the user's edits of that network
const networkInput = (m, key) => { const plan = m.plans.find(p => p.key === key); return plan ? { plan, rooms: deckRooms(m, plan), edit: m.ductEdits[key] || null } : null; };
// the duct engine's job for one plan (the same in this thread and in a worker), and its answer as the model keeps it -
// the result in the fields the review and the outputs read
const job = input => ({ plan: input.plan, rooms: input.rooms, opt: { manual: input.edit?.manual || [], pick: input.edit?.pick || 0 } });
const toNetwork = (input, a, at = new Date().toISOString()) => ({ source: 'engine', nodes: a.network.nodes, ducts: a.network.ducts, diffusers: a.network.diffusers, root: input.plan.root, rus: input.plan.rus.map(u => ({ x: u.x, y: u.y, flowCmh: u.flowCmh })),
 result: { ...a.result, kind: input.plan.kind, rootSource: input.plan.rootSource, designCmh: input.plan.designCmh, auto: true, at, edited: (input.edit?.manual || []).length > 0 } });
const network = (input, at) => { const j = job(input); return toNetwork(input, E.auto(j.plan, j.rooms, j.opt), at); };

const PRODUCERS = [
 { id: 'classes', step: 3, reads: ['rooms', 'solas'], writes: ['classes'], run: m => ({ classes: F.classes(m.rooms, m.solas) }) },
 { id: 'airflow', step: 3, reads: ['rooms', 'decks', 'loads', 'rules', 'assign', 'transfers', 'conditions', 'classes'], writes: ['airflow', 'zones', 'systems'],
  run: m => A.airflow({ rooms: m.rooms, decks: m.decks, loads: m.loads, rules: m.rules, assign: m.assign, transfers: m.transfers, conditions: m.conditions.project, classes: m.classes }) },
 { id: 'plans', step: 4, reads: ['rooms', 'decks', 'assign', 'airflow', 'systems', 'classes', 'unitDecks', 'roots', 'ruMoves'], writes: ['plans'], run: m => ({ plans: PS.plans(m) }) },
 // one network per plan: a change on one deck leaves the other decks' networks as they are
 { id: 'networks', step: 4, reads: ['plans', 'rooms', 'ductEdits'], writes: ['networks'], keys: m => m.plans.map(p => p.key), input: networkInput, job, fromJob: toNetwork, runKey: (m, key) => network(networkInput(m, key)) },
 { id: 'review', step: 5, reads: ['rooms', 'decks', 'loads', 'rules', 'assign', 'airflow', 'zones', 'systems', 'solas', 'roots', 'plans', 'networks'], writes: ['review'],
  // stale: the networks the table says are not made from the plans now (they stay out of penetrations and quantities)
  run: (m, { stale = new Set() } = {}) => {
   const results = {}, nets = {};
   for (const [k, n] of Object.entries(m.networks)) { if (n.result) results[k] = { ...n.result, stale: stale.has(k) }; nets[k] = { ducts: n.ducts || [] }; }
   return { review: RV.review(m, { plans: m.plans, results, nets }) };
  } }];

module.exports = { PRODUCERS, network, networkInput, deckRooms, job, toNetwork };
