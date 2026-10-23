// Interference of the duct networks of different systems on a deck (pure, mm) - the all-system check after AUTO
// (user / review 2026-10-23). Ducts are taken at one level under the ceiling:
//  - plan overlap: two ducts of different systems side by side nearer than their half widths + the gap, over more than
//    100 mm - they collide;
//  - crossing: two ducts of different systems cross - stacked, their heights + the gap must fit the deck's duct layer
//    (deck height − duct bottom − reserve, lib/duct-layer.cjs);
//  - corridor section: the ducts running along a corridor, their widths + gaps against its width (worst 1 m slice).
// Geometry in app coordinates (y down, as PHG D): room coordinates are y up, so y is flipped here.
'use strict';
const GE = require('./geom.cjs'), DL = require('./duct-layer.cjs'), { isCorridor } = require('./contract.cjs');

function segmentsOf(plans, geometry) {
 const out = {};
 for (const p of plans) for (const d of geometry[p.key]?.ducts || []) {
  const w = d.diameterMm || d.widthMm || 0, h = d.diameterMm || d.heightMm || 0;
  for (let i = 0; i + 1 < (d.points || []).length; i++) {
   const a = { x: d.points[i].x, y: -d.points[i].y }, b = { x: d.points[i + 1].x, y: -d.points[i + 1].y }, L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1) continue;
   (out[p.deckId] = out[p.deckId] || []).push({ key: p.key, systemId: p.systemId, kind: p.kind, duct: d.displayName || d.id, type: d.type, a, b, L, w, h,
    dir: Math.abs(b.y - a.y) < 1 ? 'H' : Math.abs(b.x - a.x) < 1 ? 'V' : 'D' });
  }
 }
 return out;
}
// proper intersection of two segments (not at their ends)
function cross(p, q, a, b) {
 const r = { x: q.x - p.x, y: q.y - p.y }, s = { x: b.x - a.x, y: b.y - a.y }, den = r.x * s.y - r.y * s.x; if (Math.abs(den) < 1e-9) return null;
 const t = ((a.x - p.x) * s.y - (a.y - p.y) * s.x) / den, u = ((a.x - p.x) * r.y - (a.y - p.y) * r.x) / den, e = 1e-6;
 return t > e && t < 1 - e && u > e && u < 1 - e ? { x: p.x + t * r.x, y: p.y + t * r.y } : null;
}
const label = s => `${s.systemId} ${s.w}×${s.h}`;

function check(contract, plans, geometry) {
 const set = DL.settings(contract), segs = segmentsOf(plans, geometry), roomsOf = deckId => contract.rooms.filter(r => r.deckId === deckId), decks = [];
 for (const [deckId, S] of Object.entries(segs)) {
  const layer = DL.layerOf(contract, deckId), rooms = roomsOf(deckId), roomAt = p => rooms.find(r => GE.inRoom(p, r)), name = r => r ? `${r.no} ${r.name}` : '—';
  const D = { deckId, deckName: contract.decks.find(d => d.id === deckId)?.name || deckId, layerMm: layer.layerMm, layerSource: layer.source, gapMm: set.gapMm, overlaps: [], crossings: [], corridor: [] };
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
   const s = S[i], t = S[j]; if (s.key === t.key) continue;
   if (s.dir === t.dir && s.dir !== 'D') {
    const ax = s.dir === 'H' ? 'x' : 'y', ox = s.dir === 'H' ? 'y' : 'x';
    const lo = Math.max(Math.min(s.a[ax], s.b[ax]), Math.min(t.a[ax], t.b[ax])), hi = Math.min(Math.max(s.a[ax], s.b[ax]), Math.max(t.a[ax], t.b[ax]));
    const off = Math.abs(s.a[ox] - t.a[ox]), need = (s.w + t.w) / 2 + set.gapMm;
    if (hi - lo > 100 && off < need) {
     const mid = s.dir === 'H' ? { x: (lo + hi) / 2, y: (s.a.y + t.a.y) / 2 } : { x: (s.a.x + t.a.x) / 2, y: (lo + hi) / 2 };
     D.overlaps.push({ a: label(s), b: label(t), keys: [s.key, t.key], ducts: [s.duct, t.duct], lengthMm: Math.round(hi - lo), centreGapMm: Math.round(off), needMm: Math.round(need), at: { x: Math.round(mid.x), y: Math.round(mid.y) }, room: name(roomAt(mid)) });
    }
   } else {
    const x = cross(s.a, s.b, t.a, t.b); if (!x) continue;
    const stack = s.h + t.h + set.gapMm;
    D.crossings.push({ a: label(s), b: label(t), keys: [s.key, t.key], ducts: [s.duct, t.duct], stackMm: stack, over: stack > layer.layerMm, at: { x: Math.round(x.x), y: Math.round(x.y) }, room: name(roomAt(x)) });
   }
  }
  // corridor sections: 1 m slices along each corridor, the ducts running along it inside it
  for (const r of rooms.filter(isCorridor)) {
   const b = GE.bbox(r.polygon), along = b.maxX - b.minX >= b.maxY - b.minY ? 'H' : 'V', width = along === 'H' ? b.maxY - b.minY : b.maxX - b.minX;
   let worst = null;
   for (let c = (along === 'H' ? b.minX : b.minY) + 500; c < (along === 'H' ? b.maxX : b.maxY); c += 1000) {
    const hit = S.filter(s => s.dir === along && (along === 'H' ? Math.min(s.a.x, s.b.x) <= c && Math.max(s.a.x, s.b.x) >= c && s.a.y >= b.minY && s.a.y <= b.maxY : Math.min(s.a.y, s.b.y) <= c && Math.max(s.a.y, s.b.y) >= c && s.a.x >= b.minX && s.a.x <= b.maxX));
    const sum = hit.reduce((t, s) => t + s.w + set.gapMm, 0);
    if (!worst || sum > worst.sumMm) worst = { atMm: Math.round(c), sumMm: Math.round(sum), ducts: hit.map(label) };
   }
   D.corridor.push({ roomId: r.id, room: `${r.no} ${r.name}`, widthMm: Math.round(width), worst, fill: worst && width ? Math.round(worst.sumMm / width * 100) / 100 : 0 });
  }
  const inCorr = c => /복도|통로|ALLEY|CORR/i.test(c.room);
  D.summary = { overlaps: D.overlaps.length, overlapM: Math.round(D.overlaps.reduce((t, o) => t + o.lengthMm, 0) / 100) / 10, crossings: D.crossings.length, over: D.crossings.filter(c => c.over).length,
   maxStackMm: D.crossings.reduce((m, c) => Math.max(m, c.stackMm), 0), inCorridor: [...D.crossings, ...D.overlaps].filter(inCorr).length,
   byPair: Object.entries(D.crossings.reduce((m, c) => { const k = [c.a.split(' ')[0], c.b.split(' ')[0]].sort().join('×'); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]) };
  decks.push(D);
 }
 const order = new Map(contract.decks.map((d, i) => [d.id, i])); decks.sort((a, b) => (order.get(a.deckId) ?? 0) - (order.get(b.deckId) ?? 0));
 const total = { overlaps: 0, overlapM: 0, crossings: 0, over: 0, inCorridor: 0, maxStackMm: 0 };
 for (const d of decks) { for (const k of ['overlaps', 'crossings', 'over', 'inCorridor']) total[k] += d.summary[k]; total.overlapM = Math.round((total.overlapM + d.summary.overlapM) * 10) / 10; total.maxStackMm = Math.max(total.maxStackMm, d.summary.maxStackMm); }
 return { decks, total };
}
// ducts deeper than their deck's duct layer
function deepDucts(contract, plans, geometry) {
 const out = [];
 for (const p of plans) { const L = DL.layerOf(contract, p.deckId).layerMm; for (const d of geometry[p.key]?.ducts || []) if ((d.heightMm || d.diameterMm || 0) > L) out.push({ key: p.key, duct: d.displayName, size: d.diameterMm ? `Ø${d.diameterMm}` : `${d.widthMm}×${d.heightMm}`, layerMm: L }); }
 return out;
}

module.exports = { check, deepDucts, segmentsOf };
