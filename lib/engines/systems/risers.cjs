// Ver 2.0 systems engine, vertical ducts and ESP (V2-3.9 size): a system over several decks has its unit on one deck and
// a riser between consecutive served decks going away from it, carrying the air of every deck beyond. The duct external
// static pressure (ESP, ducts and terminals, not the unit) = max over decks of (deck network index Pa + riser path).
// New code (D7); 1.x lib/risers.cjs and lib/ducts.cjs are the functional reference.
//   systems({ decks, plans, results, extraPa, deckExtraPa }, rules) → [{ systemKey, …, decks, risers, indexPa, fanPa }]
//     results: { [planKey]: { indexPa, stale } } - a stale or missing deck result leaves the ESP unknown
//     extraPa: { [riserId]: Pa } fire dampers in a riser; deckExtraPa: { [planKey]: Pa } fire dampers of a deck network
// Air 1.2 kg/m³, 1.81e-5 Pa·s, galvanised steel 0.09 mm, Darcy-Weisbach with Colebrook. Fitting K values are settings
// (ASHRAE CR3-1 range for r/W = 1: 원문 미확인, F-2).
'use strict';

const AIR = Object.freeze({ densityKgM3: 1.2, viscosityPaS: 1.81e-5, roughnessMm: 0.09 });
const RULES = Object.freeze({ maxVelocityMps: 10, maxFrictionPaM: 2, stepMm: 50, minSideMm: 100, maxAspect: 4, elbowK: 0.25, elbowsPerRiser: 2, branchK: 0.4, straightK: 0.1, fireDamperK: 0.3 });
// fan pressure on top of the ESP: inside an air handling unit (coil, filter, heater, mixing) or a plain fan, and the louvre
const FAN = Object.freeze({ ahuInternalPa: 600, fanInternalPa: 100, louverPa: 50 });

const area = d => d.diameterMm ? Math.PI * (d.diameterMm / 1000) ** 2 / 4 : d.widthMm / 1000 * (d.heightMm / 1000);
const hydraulic = d => d.diameterMm ? d.diameterMm / 1000 : 2 * (d.widthMm / 1000) * (d.heightMm / 1000) / ((d.widthMm + d.heightMm) / 1000);
const velocity = (cmh, d) => cmh / 3600 / area(d);
const dynamic = v => AIR.densityKgM3 * v * v / 2;
// Colebrook-White by fixed-point iteration from Haaland; laminar below Re 2300
function darcy(re, rr) {
 if (re <= 0) return 0; if (re < 2300) return 64 / re;
 let f = (-1.8 * Math.log10((rr / 3.7) ** 1.11 + 6.9 / re)) ** -2;
 for (let i = 0; i < 30; i++) { const g = (-2 * Math.log10(rr / 3.7 + 2.51 / (re * Math.sqrt(f)))) ** -2; if (Math.abs(g - f) < 1e-12) { f = g; break; } f = g; }
 return f;
}
function paPerM(cmh, d) { const v = velocity(cmh, d), D = hydraulic(d); return darcy(AIR.densityKgM3 * v * D / AIR.viscosityPaS, AIR.roughnessMm / 1000 / D) / D * dynamic(v); }
// the smallest rectangle (stepMm, W/H ≤ maxAspect, the squarer one of equal area) within the velocity and friction limits
function sizeRect(cmh, r = RULES) {
 const need = cmh / 3600 / r.maxVelocityMps; let best = null;
 for (let h = r.minSideMm; h <= 2000; h += r.stepMm) for (let w = h; w <= h * r.maxAspect && w <= 3000; w += r.stepMm) {
  const a = w * h / 1e6; if (a + 1e-12 < need || (r.maxFrictionPaM && paPerM(cmh, { widthMm: w, heightMm: h }) > r.maxFrictionPaM)) continue;
  if (!best || a < best.a - 1e-12 || (Math.abs(a - best.a) < 1e-12 && w / h < best.w / best.h)) best = { w, h, a };
  break;   // the first width that fits is the smallest for this height
 }
 return best ? { widthMm: best.w, heightMm: best.h } : { widthMm: 3000, heightMm: 2000, exceeded: true };
}
function loss(cmh, d, lengthM, elbows, r = RULES) { const v = velocity(cmh, d), fr = paPerM(cmh, d) * lengthM, el = elbows * r.elbowK * dynamic(v); return { velocityMps: v, frictionPa: fr, elbowPa: el, totalPa: fr + el }; }
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

function systems({ decks, plans, results = {}, extraPa = {}, deckExtraPa = {} }, r = RULES) {
 const z = id => decks.find(d => d.id === id)?.z ?? 0, groups = new Map(), out = [];
 for (const p of plans) { if (!groups.has(p.systemKey)) groups.set(p.systemKey, []); groups.get(p.systemKey).push(p); }
 for (const [systemKey, ps] of groups) {
  const unit = ps.find(p => p.isUnitDeck), order = [...ps].sort((a, b) => z(a.deckId) - z(b.deckId)), u = order.indexOf(unit);
  const risers = [], toDeck = { [unit.deckId]: 0 }, onward = { [unit.deckId]: 0 }, path = { [unit.deckId]: [] };
  for (const dir of [1, -1]) for (let i = u; i + dir >= 0 && i + dir < order.length; i += dir) {
   const from = order[i], to = order[i + dir], beyond = dir > 0 ? order.slice(i + 1) : order.slice(0, i), goesOn = beyond.length > 1;
   const flowCmh = beyond.reduce((t, p) => t + p.designCmh, 0), size = sizeRect(flowCmh, r);
   const verticalM = Math.abs(z(to.deckId) - z(from.deckId)) / 1000, offsetM = (Math.abs(to.root.x - from.root.x) + Math.abs(to.root.y - from.root.y)) / 1000;
   const elbows = r.elbowsPerRiser + (offsetM > 0.05 ? 2 : 0), L = loss(flowCmh, size, verticalM + offsetM, elbows, r), q = dynamic(L.velocityMps);
   // where air goes on past the deck: the branch to the deck takes the branch K, the air going on the straight K
   const branchPa = goesOn ? r.branchK * q : 0, straightPa = goesOn ? r.straightK * q : 0;
   const id = `${systemKey}:${from.deckId}-${to.deckId}`, extra = extraPa[id] || 0, lo = Math.min(z(from.deckId), z(to.deckId)), hi = Math.max(z(from.deckId), z(to.deckId));
   const riser = { id, systemKey, systemId: from.systemId, kind: from.kind, fromDeckId: from.deckId, toDeckId: to.deckId, from: from.root, to: to.root, flowCmh, ...size,
    verticalM, offsetM: r2(offsetM), lengthM: r2(verticalM + offsetM), elbows, velocityMps: r2(L.velocityMps), frictionPa: r1(L.frictionPa), elbowPa: r1(L.elbowPa),
    branchPa: r1(branchPa), straightPa: r1(straightPa), damperPa: r1(extra), totalPa: r1(L.totalPa + extra), exceeded: !!size.exceeded,
    through: decks.filter(d => d.z > lo && d.z < hi).map(d => d.id) };   // decks it passes without serving (SOLAS deck penetrations)
   risers.push(riser);
   toDeck[to.deckId] = onward[from.deckId] + L.totalPa + extra + branchPa; onward[to.deckId] = onward[from.deckId] + L.totalPa + extra + straightPa;
   path[to.deckId] = [...path[from.deckId], id];
  }
  const rows = order.map(p => {
   const res = results[p.key] || {}, fresh = !res.stale && Number.isFinite(res.indexPa), damperPa = r1(deckExtraPa[p.key] || 0);
   return { key: p.key, deckId: p.deckId, designCmh: p.designCmh, isUnitDeck: p.isUnitDeck, riserPa: r1(toDeck[p.deckId]), risers: path[p.deckId],
    deckIndexPa: fresh ? res.indexPa : null, damperPa, stale: !!res.stale, totalPa: fresh ? r1(res.indexPa + damperPa + toDeck[p.deckId]) : null };
  });
  const known = rows.filter(d => d.totalPa != null), index = known.length ? known.reduce((a, b) => b.totalPa > a.totalPa ? b : a) : null, complete = known.length === rows.length;
  out.push({ systemKey, systemId: unit.systemId, kind: unit.kind, unitDeckId: unit.deckId, unitDeckSource: unit.unitDeckSource, unit: unit.root, unitSource: unit.rootSource,
   fanCmh: ps.reduce((t, p) => t + p.designCmh, 0), decks: rows, risers, riserLengthM: r2(risers.reduce((t, x) => t + x.lengthM, 0)),
   indexPa: complete && index ? index.totalPa : null, partialIndexPa: index ? index.totalPa : null, indexDeckId: index ? index.deckId : null, complete, stale: rows.some(d => d.stale) });
 }
 return out;
}
// ESP + the unit's own losses + the louvre
const fanPa = (s, f = FAN) => s.indexPa == null ? null : Math.round(s.indexPa + (s.kind === 'supply' ? f.ahuInternalPa : f.fanInternalPa) + f.louverPa);

module.exports = { AIR, RULES, FAN, systems, fanPa, sizeRect, loss, paPerM, velocity, dynamic, area };
