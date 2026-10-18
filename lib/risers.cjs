// Systems over decks (pure): for each system the unit deck, the deck plans, the vertical ducts (risers) between the unit
// and the other decks, and the duct external static pressure of the system (ESP: ducts and terminals, not the unit) =
// max over decks (PHG D deck index + riser path to that deck).
// A riser runs between consecutive served decks going away from the unit deck; it carries the air of every deck beyond
// it. Its length is the deck height difference plus the horizontal offset between the shaft points of the two decks.
// Path losses: friction + elbows (2, + 2 when the shaft moves sideways); where air goes on past a deck, the riser
// branch to that deck adds the branch K and the air going on adds the straight-through K of the tee.
'use strict';
const D = require('./ducts.cjs');

const elevationOf = (contract, deckId) => contract.decks.find(d => d.id === deckId)?.elevationMm ?? 0;
const r1 = v => Math.round(v * 10) / 10;

// plans: lib/phg-plan.cjs plan(); results: { [planKey]: { indexPa, stale, ... } } from PHG D (optional). A stale
// result (its plan changed since) does not count: the deck's pressure is unknown until it is sent again.
// extraPa: { [riserId]: Pa } added to a riser (fire dampers in it, from the SOLAS penetrations)
function systems(contract, plans, results = {}, rules = D.RISER_RULES, extraPa = {}) {
 const bySystem = new Map();
 for (const p of plans) { if (!bySystem.has(p.systemKey)) bySystem.set(p.systemKey, []); bySystem.get(p.systemKey).push(p); }
 const out = [];
 for (const [systemKey, ps] of bySystem) {
  const unitPlan = ps.find(p => p.isUnitDeck), order = [...ps].sort((a, b) => elevationOf(contract, a.deckId) - elevationOf(contract, b.deckId));
  const u = order.indexOf(unitPlan), risers = [], pathPa = { [unitPlan.deckId]: 0 }, path = { [unitPlan.deckId]: [] }, through = { [unitPlan.deckId]: 0 };
  // walk up and down from the unit deck
  for (const dir of [1, -1]) for (let i = u; i + dir >= 0 && i + dir < order.length; i += dir) {
   const from = order[i], to = order[i + dir], beyond = dir > 0 ? order.slice(i + 1) : order.slice(0, i), goesOn = beyond.length > 1;
   const flowCmh = beyond.reduce((t, p) => t + p.designCmh, 0), size = D.sizeRect(flowCmh, rules);
   const verticalM = Math.abs(elevationOf(contract, to.deckId) - elevationOf(contract, from.deckId)) / 1000;
   const offsetM = (Math.abs(to.root.x - from.root.x) + Math.abs(to.root.y - from.root.y)) / 1000;
   const elbows = rules.elbowsPerRiser + (offsetM > 0.05 ? 2 : 0), loss = D.segmentLoss(flowCmh, size, verticalM + offsetM, elbows, rules);
   const dyn = D.dynamicPa(loss.velocityMps), branchPa = goesOn ? rules.branchK * dyn : 0, straightPa = goesOn ? rules.straightK * dyn : 0;
   const id = `${systemKey}:${from.deckId}-${to.deckId}`, extra = extraPa[id] || 0;
   // decks the riser passes without serving them (deck penetrations for SOLAS)
   const lo = Math.min(elevationOf(contract, from.deckId), elevationOf(contract, to.deckId)), hi = Math.max(elevationOf(contract, from.deckId), elevationOf(contract, to.deckId));
   const r = { id, systemKey, systemId: from.systemId, kind: from.kind, fromDeckId: from.deckId, toDeckId: to.deckId,
    from: from.root, to: to.root, flowCmh, ...size, verticalM, offsetM: Math.round(offsetM * 100) / 100, lengthM: Math.round((verticalM + offsetM) * 100) / 100, elbows,
    velocityMps: Math.round(loss.velocityMps * 100) / 100, frictionPa: r1(loss.frictionPa), elbowPa: r1(loss.elbowPa), branchPa: r1(branchPa), straightPa: r1(straightPa), damperPa: r1(extra),
    totalPa: r1(loss.totalPa + extra), exceeded: !!size.exceeded, through: contract.decks.filter(d => d.elevationMm > lo && d.elevationMm < hi).map(d => d.id) };
   risers.push(r);
   // to this deck: everything up to here, plus the branch off the riser where air goes on; on to further decks: plus the
   // straight-through tee instead
   pathPa[to.deckId] = through[from.deckId] + loss.totalPa + extra + branchPa; through[to.deckId] = through[from.deckId] + loss.totalPa + extra + straightPa;
   path[to.deckId] = [...path[from.deckId], r.id];
  }
  const decks = order.map(p => { const res = results[p.key] || {}, fresh = !res.stale && Number.isFinite(res.indexPa), deckPa = fresh ? res.indexPa : null;
   return { key: p.key, deckId: p.deckId, designCmh: p.designCmh, isUnitDeck: p.isUnitDeck, riserPa: r1(pathPa[p.deckId]), risers: path[p.deckId],
    deckIndexPa: deckPa, stale: !!res.stale, totalPa: deckPa == null ? null : r1(deckPa + pathPa[p.deckId]) }; });
  const known = decks.filter(d => d.totalPa != null), index = known.length ? known.reduce((a, b) => b.totalPa > a.totalPa ? b : a) : null;
  const complete = known.length === decks.length;
  out.push({ systemKey, systemId: unitPlan.systemId, kind: unitPlan.kind, unitDeckId: unitPlan.deckId, unitDeckSource: unitPlan.unitDeckSource, unit: unitPlan.root, unitSource: unitPlan.rootSource,
   fanCmh: ps.reduce((t, p) => t + p.designCmh, 0), decks, risers, riserLengthM: Math.round(risers.reduce((t, r) => t + r.lengthM, 0) * 100) / 100,
   // the ESP is only known when every deck has a current result
   indexPa: complete && index ? index.totalPa : null, partialIndexPa: index ? index.totalPa : null, indexDeckId: index ? index.deckId : null, complete, stale: decks.some(d => d.stale) });
 }
 return out;
}

// fan pressure estimate: ESP + the unit's own losses (coil, filter, heater - settings) + louver
function fanPa(system, fan = D.FAN_RULES) {
 if (system.indexPa == null) return null;
 const unit = system.kind === 'supply' ? fan.ahuInternalPa : fan.fanInternalPa;
 return Math.round(system.indexPa + unit + fan.louverPa);
}

module.exports = { systems, fanPa, elevationOf };
