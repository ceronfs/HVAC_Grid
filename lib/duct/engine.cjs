// Ver 2.0 duct engine - the one API (V2-1.8). For a plan (one deck × system) and its deck's rooms: AUTO routes the
// network (lib/duct/route.cjs, zone relaxation included), assigns ducts, sizes them and works out the pressure - what
// 1.x got from PHG D in a hidden window (app/bridge.js Phg.loadPlan + auto). No browser, no DOM; Node and Web Worker.
//   auto(plan, rooms, { manual, pick, select }) → { network, result, sizing, pressure, route }
//     pick: the n-th candidate (1.x 다른 경로); select 'pressure' (default, D16): lowest index Pa within 10 % of the
//     least weighted cost; select 'cost': the least weighted cost (1.x)
//   resize(network, ductId, size)   → the same network sized again with one duct by hand (size null: automatic again)
// result has the fields 1.x stores per plan (rus, flowCmh, ducts, lengthM, indexPa, ductTypes, zonesRelaxed,
// unconnected, candidates). Coordinates in BOX y. F-1: the RU airflow of the plan (summer) is the only flow.
'use strict';

const I = require('./input.cjs'), R = require('./route.cjs'), AS = require('./assign.cjs'), S = require('./size.cjs'), X = require('./pressure.cjs');

function evaluate(network) {
 const sizing = S.size(network), sized = sizing.ok ? S.apply(network, sizing) : network;
 const pressure = sizing.ok ? X.pressure(sized) : { paths: [], roots: [], warnings: [], indexPa: null };
 return { network: sized, sizing, pressure };
}

function summary(network, pressure, extra) {
 const ducts = network.ducts, types = {}; for (const d of ducts) types[d.type] = (types[d.type] || 0) + 1;
 return { rus: network.diffusers.length, flowCmh: network.diffusers.reduce((t, u) => t + u.flowCmh, 0), roots: 1, ducts: ducts.length, lengthM: Math.round(AS.lengthMm(ducts) / 100) / 10,
  indexPa: pressure.indexPa, ductTypes: types, ...extra };
}

// manual: [{ key, size: { widthMm, heightMm } | { diameterMm } }] - sizes kept from before (found again by key)
function auto(plan, rooms, opt = {}) {
 const t0 = Date.now(), input = I.routeInput(plan, rooms, opt.rules || {});
 let r = R.route(input, opt);
 // select 'pressure' (D16, not 1.x): among the candidates within 10 % of the least weighted cost, the lowest index pressure
 const select = opt.select || 'pressure';
 if (select === 'pressure' && r.all?.length > 1) {
  const best = r.all[0].m.weightedCost.total, near = r.all.filter(c => c.m.unconnected === r.all[0].m.unconnected && c.m.weightedCost.total <= best * 1.1);
  const pa = c => evaluate(AS.assign(r.input, c.net)).pressure.indexPa ?? Infinity;
  const pick = near.map(c => [pa(c), c]).sort((a, b) => a[0] - b[0])[0][1];
  r = { ...r, ...pick, all: r.all };
 }
 // another route (1.x 다른 경로): the next candidate in the order of choice
 if (opt.pick > 0 && r.all?.length > 1) { const c = r.all[opt.pick % r.all.length]; r = { ...r, ...c, all: r.all, pick: opt.pick % r.all.length }; }
 let network = AS.assign(r.input, r.net);
 const lost = [];
 for (const m of opt.manual || []) { const d = network.ducts.find(x => x.key === m.key); if (!d) { lost.push(m.key); continue; } Object.assign(d, { manualSize: true, ...(m.size.diameterMm ? { shape: 'round', diameterMm: m.size.diameterMm, widthMm: 0, heightMm: 0 } : { shape: 'rect', widthMm: m.size.widthMm, heightMm: m.size.heightMm, diameterMm: 0 }) }); }
 const ev = evaluate(network);
 const result = summary(ev.network, ev.pressure, { select, zonesRelaxed: r.zonesRelaxed, unconnected: r.unconnected.length, unconnectedRus: r.unconnected.map(id => input.terminals.find(t => t.id === id)?.ruId), candidates: r.candidates, pick: r.pick || 0, spine: r.spine || null,
  relaxedRus: r.relaxedTerminals.map(id => input.terminals.find(t => t.id === id)?.ruId), weightedCost: Math.round(r.m.weightedCost.total), seconds: Math.round((Date.now() - t0) / 100) / 10, manualLost: lost });
 return { network: ev.network, result, sizing: ev.sizing, pressure: ev.pressure, route: { input: r.input, zonesRelaxed: r.zonesRelaxed, spine: r.spine || null } };
}

function resize(network, ductId, size) {
 const ducts = network.ducts.map(d => d.id !== ductId ? d : size ? { ...d, manualSize: true, ...(size.diameterMm ? { shape: 'round', diameterMm: size.diameterMm, widthMm: 0, heightMm: 0 } : { shape: 'rect', widthMm: size.widthMm, heightMm: size.heightMm, diameterMm: 0 }) } : { ...d, manualSize: false });
 if (!network.ducts.some(d => d.id === ductId)) throw new Error('덕트 없음: ' + ductId);
 const ev = evaluate({ ...network, ducts });
 return { network: ev.network, result: summary(ev.network, ev.pressure, {}), sizing: ev.sizing, pressure: ev.pressure };
}

module.exports = { auto, resize, evaluate };
