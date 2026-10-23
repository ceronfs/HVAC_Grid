// Duct layer and routing of the systems together (pure, mm). User decisions 2026-10-23:
//  - ducts run in one layer under the ceiling: duct layer = deck height − duct bottom (2,200 default) − structure /
//    cable reserve (300 default); ducts of different systems may cross when both heights + the gap fit that layer;
//  - corridor ceilings carry the cables above the ducts: when the corridor is full, the supply main runs inside the rooms
//    (a band parallel to the corridor, through the cabin ceilings) instead of crossing every duct in the corridor;
//  - supply RUs of cabins sit near the window: 1,000 mm from the ship's side.
// contract.ductLayer holds the project's values (missing fields = DEFAULTS). Room coordinates as the contract (DXF y up).
'use strict';
const GE = require('./geom.cjs'), { isCorridor } = require('./contract.cjs');

const DEFAULTS = Object.freeze({
 bottomMm: 2200,           // duct bottom above the deck (user: 2,200 or 2,150 by project)
 reserveMm: 300,           // under the deck above: structure and the cable tier
 gapMm: 50,                // between two ducts (crossing: stacked; side by side: clear)
 mainMaxHeightMm: null,    // AUTO sizes main ducts at most this high: null = auto (any two ducts may cross: (layer − gap) / 2
 branchMaxHeightMm: null,  // down to 50 mm - 150 in the default 400 layer), 0 = PHG D's own choice, else the value
 supplyMain: 'auto',       // 'auto' | 'corridor' | 'band': where the supply main of a deck runs
 corridorFill: 0.7,        // auto: the main goes into the rooms when the corridor's ducts would take more of its width
 bandFromSideMm: 2400,     // centre of the band in the rooms, from the ship's side (RU 1,000 + RU straight run 800 + 600)
 bandWidthMm: 1200,
 ruFromSideMm: 1000,       // cabin supply RU from the ship's side (0 = room centre as before)
 foreignMode: 'soft'       // ducts of the other systems: 'soft' = overlaps and crossings over the layer cost (one search, the
                           // review's cost-not-threshold); 'hard' = blocked, then soft when no route; 'auto' = as hard; 'off'
});
const MODES = ['auto', 'corridor', 'band'], FOREIGN = ['auto', 'hard', 'soft', 'off'];
const LAYER_FALLBACK_MM = 400;   // a deck without a height: the old fixed ceiling void
const INSULATION_MM = 25;        // PHG D's insulation allowance on the duct envelope (phgdInsulationMm default)

function settings(c) { return { ...DEFAULTS, ...((c && c.ductLayer) || {}) }; }
// problems of contract.ductLayer (empty = valid)
function validate(v) {
 if (v == null) return [];
 if (typeof v !== 'object' || Array.isArray(v)) return ['ductLayer'];
 const out = [], num = (k, lo, hi) => { if (v[k] != null && !(Number.isFinite(v[k]) && v[k] >= lo && v[k] <= hi)) out.push(`ductLayer.${k} (${lo}–${hi})`); };
 num('bottomMm', 1000, 5000); num('reserveMm', 0, 2000); num('gapMm', 0, 500); num('mainMaxHeightMm', 0, 2000); num('branchMaxHeightMm', 0, 2000);   // null = auto
 num('corridorFill', 0.1, 1); num('bandFromSideMm', 300, 20000); num('bandWidthMm', 400, 5000); num('ruFromSideMm', 0, 10000);
 if (v.supplyMain != null && !MODES.includes(v.supplyMain)) out.push('ductLayer.supplyMain');
 if (v.foreignMode != null && !FOREIGN.includes(v.foreignMode)) out.push('ductLayer.foreignMode');
 return out;
}
// the height ducts have under the ceiling on a deck: deck height − duct bottom − reserve
function layerOf(c, deckId) {
 const s = settings(c), d = (c.decks || []).find(x => x.id === deckId), h = +d?.heightMm;
 if (!(h > 0)) return { layerMm: LAYER_FALLBACK_MM, deckHeightMm: null, bottomMm: s.bottomMm, reserveMm: s.reserveMm, source: 'fallback' };
 return { layerMm: Math.max(0, h - s.bottomMm - s.reserveMm), deckHeightMm: h, bottomMm: s.bottomMm, reserveMm: s.reserveMm, source: 'deck' };
}

// the height caps on a deck: the user's, else so that two ducts of the layer stack within it (N3 2026-10-23: with
// 200 mm mains every main-to-main crossing was 450 > 400; with 150 none was over)
const autoCap = (layerMm, gapMm) => Math.max(100, Math.floor((layerMm - gapMm) / 2 / 50) * 50);
function capsOf(c, deckId) {
 const s = settings(c), L = layerOf(c, deckId).layerMm, pick = v => v == null ? autoCap(L, s.gapMm) : v;
 return { main: pick(s.mainMaxHeightMm), branch: pick(s.branchMaxHeightMm), auto: { main: s.mainMaxHeightMm == null, branch: s.branchMaxHeightMm == null } };
}
// the corridor of a deck (the longest one) and its axis: 'x' when it runs along x
function corridorOf(rooms) {
 const list = rooms.filter(isCorridor).map(r => ({ r, b: GE.bbox(r.polygon) })).map(o => ({ ...o, len: Math.max(o.b.maxX - o.b.minX, o.b.maxY - o.b.minY) }));
 if (!list.length) return null;
 const { r, b } = list.sort((p, q) => q.len - p.len)[0], axis = b.maxX - b.minX >= b.maxY - b.minY ? 'x' : 'y', cross = axis === 'x' ? 'y' : 'x';
 return { room: r, axis, cross, lo: axis === 'x' ? b.minY : b.minX, hi: axis === 'x' ? b.maxY : b.maxX, from: axis === 'x' ? b.minX : b.minY, to: axis === 'x' ? b.maxX : b.maxY, widthMm: axis === 'x' ? b.maxY - b.minY : b.maxX - b.minX };
}
const span = (b, axis) => axis === 'x' ? [b.minX, b.maxX] : [b.minY, b.maxY];
// the ship's side at a point along the corridor, on one side of it (+1: higher cross coordinate): the farthest room edge
// of the deck there
function sideAt(rooms, cor, along, sign) {
 let best = null;
 for (const r of rooms) { const b = GE.bbox(r.polygon), [a0, a1] = span(b, cor.axis); if (along < a0 - 1 || along > a1 + 1) continue;
  const [c0, c1] = span(b, cor.cross), v = sign > 0 ? c1 : c0; if (best == null || (sign > 0 ? v > best : v < best)) best = v; }
 return best;
}
const pt = (cor, along, cross) => cor.axis === 'x' ? { x: along, y: cross } : { x: cross, y: along };

// cabin supply RUs near the window: a room of the ship's side gets its RUs on the line ruFromSideMm in from the side,
// spread along it; a point that leaves the room (or comes within 300 mm of its walls) keeps the place roomRus gave
const CABIN = /^선실/;
function sideRus(room, pts, deckRooms, opt) {
 const s = opt.layer || DEFAULTS; if (!(s.ruFromSideMm > 0) || !pts.length) return null;
 const cor = opt.corridor || corridorOf(deckRooms); if (!cor) return null;
 const b = GE.bbox(room.polygon), [a0, a1] = span(b, cor.axis), [c0, c1] = span(b, cor.cross), mid = (c0 + c1) / 2, sign = mid > (cor.lo + cor.hi) / 2 ? 1 : -1;
 const n = pts.length, out = [];
 for (let i = 0; i < n; i++) {
  const along = a0 + (a1 - a0) * (i + 0.5) / n, side = sideAt(deckRooms, cor, along, sign);
  if (side == null || Math.abs((sign > 0 ? c1 : c0) - side) > 300) return null;   // not a room of the ship's side
  const p = pt(cor, along, side - sign * s.ruFromSideMm);
  if (!GE.inRoom(p, room) || GE.roomEdgeDistance(p, room) < 300) return null;
  out.push(p);
 }
 return out;
}

// the bands in the rooms for a supply main, one each side of the corridor: slices of 500 mm along it, the band centre
// bandFromSideMm in from the side there, kept clear of the corridor by 300 mm; equal slices merged into rectangles
function bands(deckRooms, s = DEFAULTS, cor = corridorOf(deckRooms)) {
 if (!cor || !deckRooms.length) return [];
 const all = GE.bbox(deckRooms.flatMap(r => r.polygon)), [A0, A1] = span(all, cor.axis), out = [], half = s.bandWidthMm / 2, step = 500;
 for (const sign of [1, -1]) {
  let run = null; const flush = () => { if (run && run.a1 - run.a0 >= 2000) out.push({ side: sign, centre: run.c, from: run.a0, to: run.a1, polygon: rect(cor, run.a0, run.a1, run.c - half, run.c + half) }); run = null; };
  for (let a = A0; a < A1; a += step) {
   const side = sideAt(deckRooms, cor, a + step / 2, sign), c = side == null ? null : side - sign * s.bandFromSideMm;
   const ok = c != null && (sign > 0 ? c - half >= cor.hi + 300 : c + half <= cor.lo - 300);
   if (!ok) { flush(); continue; }
   if (run && run.c === c && run.a1 === a) run.a1 = a + step; else { flush(); run = { a0: a, a1: Math.min(A1, a + step), c }; }
  }
  flush();
 }
 return out;
}
const rect = (cor, a0, a1, c0, c1) => [pt(cor, a0, c0), pt(cor, a1, c0), pt(cor, a1, c1), pt(cor, a0, c1)];

// rough section of a main for a flow under a height cap (10 m/s, 50 mm steps), for the corridor estimate only
function mainWidth(flowCmh, s, cap = s.mainMaxHeightMm) {
 const h = cap > 0 ? cap : 300, w = Math.ceil(flowCmh / 3600 / 10 / (h / 1000) * 1000 / 50) * 50;
 return Math.max(h, w);
}
// where a deck's supply main runs. 'auto': the mains that must use the corridor (return and exhaust networks of 3 RUs or
// more on this deck) and the supply main side by side, with insulation and the gap, against corridorFill of the
// corridor width - over it, the supply goes into the rooms (when the deck has a band)
function supplyMainOf(c, deckId, deckPlans, deckRooms) {
 const s = settings(c), cor = corridorOf(deckRooms), bs = cor ? bands(deckRooms, s, cor) : [];
 // the supply mains that may move: networks over 3 rooms or more (a galley's own supply stays where it is)
 const spread = p => new Set(p.rus.map(u => u.roomId)).size >= 3, sup = deckPlans.filter(p => p.kind === 'supply' && spread(p)), others = deckPlans.filter(p => p.kind !== 'supply' && p.rus.length >= 3);
 const cap = capsOf(c, deckId).main, need = p => mainWidth(p.designCmh, s, cap) + 2 * INSULATION_MM + s.gapMm;
 const corridorMm = others.reduce((t, p) => t + need(p), 0), supplyMm = sup.reduce((t, p) => t + need(p), 0), widthMm = cor?.widthMm || 0;
 const fill = widthMm ? (corridorMm + supplyMm) / widthMm : null;
 let mode = s.supplyMain, reason;
 if (mode === 'auto') {
  if (!cor) { mode = 'corridor'; reason = '복도 없음'; }
  else if (!bs.length) { mode = 'corridor'; reason = '실 안 띠를 둘 자리 없음'; }
  else if (fill > s.corridorFill) { mode = 'band'; reason = `복도 덕트 폭 ${Math.round(corridorMm + supplyMm)} / ${Math.round(widthMm)} mm (${Math.round(fill * 100)} % > ${Math.round(s.corridorFill * 100)} %)`; }
  else { mode = 'corridor'; reason = `복도 덕트 폭 ${Math.round(corridorMm + supplyMm)} / ${Math.round(widthMm)} mm (${Math.round(fill * 100)} % ≤ ${Math.round(s.corridorFill * 100)} %)`; }
 } else reason = mode === 'band' ? '사용자 지정 (실 안)' : '사용자 지정 (복도)';
 if (mode === 'band' && !bs.length) { mode = 'corridor'; reason += ' · 실 안 띠 없음 → 복도'; }
 return { mode, reason, keys: sup.map(p => p.key), fill: fill == null ? null : Math.round(fill * 100) / 100, corridorMm: Math.round(corridorMm), supplyMm: Math.round(supplyMm), widthMm: Math.round(widthMm),
  corridor: cor ? { roomId: cor.room.id, polygon: cor.room.polygon } : null, bands: mode === 'band' ? bs : [] };
}

// the supply main drawn in the rooms (PHG D USER_MAIN: AUTO then only branches from it): a line on each band from its
// first to its last RU, joined by one cross duct at the free place nearest the Root (no restricted room, no stair, inside
// the rooms all the way), the Root joined to it straight or along the corridor's centre line. Contract coordinates; null
// with a reason when no such tree fits (the plan then routes as a corridor plan).
const STAIR = /^계단/;
function bandMain(plan, deckRooms, classes = {}) {
 const sm = plan.route?.supplyMain; if (sm?.mode !== 'band' || !sm.bands.length) return { error: 'no band' };
 const cor = corridorOf(deckRooms); if (!cor) return { error: '복도 없음' };
 const blocked = new Set([...(plan.avoid || []).map(z => z.roomId), ...deckRooms.filter(r => STAIR.test(classes[r.id]?.space || '')).map(r => r.id)]);
 const inside = q => deckRooms.some(r => !blocked.has(r.id) && GE.inRoom(q, r));
 const free = (a, b) => { const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / 100)); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; if (!inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false; } return true; };
 const A = q => cor.axis === 'x' ? q.x : q.y, C = q => cor.axis === 'x' ? q.y : q.x, P = (al, cr) => pt(cor, Math.round(al / 100) * 100, Math.round(cr / 100) * 100);
 const mid = (cor.lo + cor.hi) / 2, side = c => c > mid ? 1 : -1, root = plan.root;
 // the band lines that carry RUs: from the first to the last RU on their side
 const lines = [];
 for (const b of sm.bands) { const rus = plan.rus.filter(u => side(C(u)) === b.side && A(u) >= b.from - 1000 && A(u) <= b.to + 1000); if (!rus.length) continue;
  const lo = Math.max(b.from, Math.min(...rus.map(A))), hi = Math.min(b.to, Math.max(...rus.map(A))); if (hi - lo < 1000) continue;
  if (!lines.some(l => l.side === b.side && l.c === b.centre)) lines.push({ side: b.side, c: b.centre, lo, hi }); else { const l = lines.find(l => l.side === b.side && l.c === b.centre); l.lo = Math.min(l.lo, lo); l.hi = Math.max(l.hi, hi); } }
 if (!lines.length) return { error: '띠에 RU 없음' };
 const cs = lines.map(l => l.c), c0 = Math.min(...cs, mid), c1 = Math.max(...cs, mid), ra = A(root);
 // the cross duct: from the lowest to the highest band line (through the corridor's centre line), nearest the Root
 const all = GE.bbox(deckRooms.flatMap(r => r.polygon)), [a0, a1] = span(all, cor.axis);
 const spots = []; for (let x = Math.ceil(a0 / 100) * 100 + 300; x <= a1 - 300; x += 100) spots.push(x);
 spots.sort((p, q) => Math.abs(p - ra) - Math.abs(q - ra) || p - q);
 let xs = null;
 for (const x of spots) { if (!free(P(x, c0), P(x, c1))) continue;
  // 300 mm clear of the walls on both sides of the cross duct
  if (!free(P(x - 300, c0), P(x - 300, c1)) || !free(P(x + 300, c0), P(x + 300, c1))) continue;
  // each band line as far as it stays free on both sides of the cross duct (a restricted room cuts it: the RUs past it
  // get their branches from PHG D); every line must reach the cross duct
  const ext = lines.map(l => { if (!inside(P(x, l.c))) return null; let lo = x, hi = x;
   while (lo - 100 >= Math.min(x, l.lo) && free(P(lo - 100, l.c), P(lo, l.c))) lo -= 100;
   while (hi + 100 <= Math.max(x, l.hi) && free(P(hi, l.c), P(hi + 100, l.c))) hi += 100;
   return { lo, hi }; });
  if (ext.every(Boolean) && ext.some(e => e.hi - e.lo >= 2000)) { xs = x; lines.forEach((l, i) => { l.lo = ext[i].lo; l.hi = ext[i].hi; }); break; } }
 if (xs == null) return { error: '띠를 잇는 덕트 자리 없음' };
 const seg = [], add = (a, b) => { if (Math.hypot(b.x - a.x, b.y - a.y) >= 100) seg.push([a, b]); };
 // the Root to the cross duct: on its line; else into the band line of its own side and along it (in the rooms, the
 // corridor stays free); else straight across; else up to the corridor centre and along it
 const R = P(ra, C(root)), rc = C(root), own = lines.filter(l => l.side === side(rc)).sort((p, q) => Math.abs(p.c - rc) - Math.abs(q.c - rc))[0];
 let via, joint = null;
 if (Math.abs(ra - xs) < 1) via = 'straight';
 else if (own && free(R, P(ra, own.c)) && free(P(Math.min(ra, xs), own.c), P(Math.max(ra, xs), own.c))) { via = 'band'; add(R, P(ra, own.c)); own.lo = Math.min(own.lo, ra); own.hi = Math.max(own.hi, ra); }
 else if (rc >= c0 && rc <= c1 && free(R, P(xs, rc))) { via = 'across'; joint = rc; add(R, P(xs, rc)); }
 else if (free(R, P(ra, mid)) && free(P(ra, mid), P(xs, mid))) { via = 'corridor'; joint = mid; add(R, P(ra, mid)); add(P(ra, mid), P(xs, mid)); }
 else return { error: 'Root에서 띠까지 덕트 자리 없음' };
 if (via === 'straight') { if (rc >= c0 && rc <= c1) joint = rc; else add(R, P(xs, rc < c0 ? c0 : c1)); }
 // the cross duct in pieces between the joint and the band lines; the band lines in two pieces each side of it (and at
 // the Root's drop on its own line)
 const stops = [...new Set([c0, c1, ...(joint != null ? [joint] : []), ...cs])].filter(v => v >= c0 && v <= c1).sort((p, q) => p - q);
 for (let i = 1; i < stops.length; i++) add(P(xs, stops[i - 1]), P(xs, stops[i]));
 for (const l of lines) { const cuts = [...new Set([l.lo, xs, l.hi, ...(via === 'band' && l === own ? [ra] : [])])].sort((p, q) => p - q); for (let i = 1; i < cuts.length; i++) add(P(cuts[i - 1], l.c), P(cuts[i], l.c)); }
 return { segments: seg, crossAt: xs, rootVia: via };
}

// routing order on a deck (user / review 2026-10-23): systems that cannot move first (a sealed room's own fan, the galley
// exhaust), then supply, return and exhaust, the larger first; the deck's plans in that order
function routeOrder(plans) {
 const rank = p => /^own-room/.test(p.rootSource || '') || p.galley ? 0 : p.kind === 'supply' ? 1 : p.kind === 'return' ? 2 : 3;
 return [...plans].sort((a, b) => rank(a) - rank(b) || b.designCmh - a.designCmh || a.key.localeCompare(b.key));
}

module.exports = { DEFAULTS, MODES, settings, validate, layerOf, capsOf, autoCap, corridorOf, sideRus, bands, supplyMainOf, bandMain, routeOrder, mainWidth, CABIN, INSULATION_MM };
