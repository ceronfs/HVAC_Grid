// Systems over decks (pure): for each system the unit deck, the deck plans, the vertical ducts (risers) between the unit
// and the other decks, and the system index pressure = max over decks (PHG D deck index + riser path to that deck).
// A riser runs between consecutive served decks going away from the unit deck; it carries the air of every deck beyond
// it. Its length is the deck height difference plus the horizontal offset between the shaft points of the two decks.
'use strict';
const D = require('./ducts.cjs');

const elevationOf = (contract, deckId) => contract.decks.find(d => d.id === deckId)?.elevationMm ?? 0;

// plans: lib/phg-plan.cjs plan(); results: { [planKey]: { indexPa, flowCmh, ... } } from PHG D (optional)
function systems(contract, plans, results = {}, rules = D.RISER_RULES) {
 const bySystem = new Map();
 for (const p of plans) { if (!bySystem.has(p.systemKey)) bySystem.set(p.systemKey, []); bySystem.get(p.systemKey).push(p); }
 const out = [];
 for (const [systemKey, ps] of bySystem) {
  const unitPlan = ps.find(p => p.isUnitDeck), order = [...ps].sort((a, b) => elevationOf(contract, a.deckId) - elevationOf(contract, b.deckId));
  const u = order.indexOf(unitPlan), risers = [], pathPa = { [unitPlan.deckId]: 0 }, path = { [unitPlan.deckId]: [] };
  // walk up and down from the unit deck
  for (const dir of [1, -1]) for (let i = u; i + dir >= 0 && i + dir < order.length; i += dir) {
   const from = order[i], to = order[i + dir], beyond = dir > 0 ? order.slice(i + 1) : order.slice(0, i);
   const flowCmh = beyond.reduce((t, p) => t + p.designCmh, 0), size = D.sizeRect(flowCmh, rules);
   const verticalM = Math.abs(elevationOf(contract, to.deckId) - elevationOf(contract, from.deckId)) / 1000;
   const offsetM = (Math.abs(to.root.x - from.root.x) + Math.abs(to.root.y - from.root.y)) / 1000;
   const elbows = rules.elbowsPerRiser + (offsetM > 0.05 ? 2 : 0), loss = D.segmentLoss(flowCmh, size, verticalM + offsetM, elbows, rules);
   // decks the riser passes without serving them (deck penetrations for SOLAS)
   const lo = Math.min(elevationOf(contract, from.deckId), elevationOf(contract, to.deckId)), hi = Math.max(elevationOf(contract, from.deckId), elevationOf(contract, to.deckId));
   const through = contract.decks.filter(d => d.elevationMm > lo && d.elevationMm < hi).map(d => d.id);
   const r = { id: `${systemKey}:${from.deckId}-${to.deckId}`, systemKey, systemId: from.systemId, kind: from.kind, fromDeckId: from.deckId, toDeckId: to.deckId,
    from: from.root, to: to.root, flowCmh, ...size, verticalM, offsetM: Math.round(offsetM * 100) / 100, lengthM: Math.round((verticalM + offsetM) * 100) / 100, elbows,
    velocityMps: Math.round(loss.velocityMps * 100) / 100, frictionPa: Math.round(loss.frictionPa * 10) / 10, elbowPa: Math.round(loss.elbowPa * 10) / 10, totalPa: Math.round(loss.totalPa * 10) / 10, through };
   risers.push(r); pathPa[to.deckId] = pathPa[from.deckId] + loss.totalPa; path[to.deckId] = [...path[from.deckId], r.id];
  }
  const decks = order.map(p => { const res = results[p.key] || {}, deckPa = Number.isFinite(res.indexPa) ? res.indexPa : null;
   return { key: p.key, deckId: p.deckId, designCmh: p.designCmh, isUnitDeck: p.isUnitDeck, riserPa: Math.round(pathPa[p.deckId] * 10) / 10, risers: path[p.deckId],
    deckIndexPa: deckPa, totalPa: deckPa == null ? null : Math.round((deckPa + pathPa[p.deckId]) * 10) / 10 }; });
  const known = decks.filter(d => d.totalPa != null), index = known.length ? known.reduce((a, b) => b.totalPa > a.totalPa ? b : a) : null;
  out.push({ systemKey, systemId: unitPlan.systemId, kind: unitPlan.kind, unitDeckId: unitPlan.deckId, unitDeckSource: unitPlan.unitDeckSource, unit: unitPlan.root, unitSource: unitPlan.rootSource,
   fanCmh: ps.reduce((t, p) => t + p.designCmh, 0), decks, risers, riserLengthM: Math.round(risers.reduce((t, r) => t + r.lengthM, 0) * 100) / 100,
   indexPa: index ? index.totalPa : null, indexDeckId: index ? index.deckId : null, complete: known.length === decks.length });
 }
 return out;
}

module.exports = { systems, elevationOf };
