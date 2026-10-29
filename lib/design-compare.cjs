// The designer's ducts against AUTO (pure): the duct lines of a designer's drawing (a DXF's LINE / LWPOLYLINE on its
// duct layers) and the AUTO networks of the same deck, each measured by how much of its length runs within a distance
// (tolMm) of the other. For checking AUTO on a real ship's drawing (PLAN H5: 실도면 검증). A drawing of double-line
// ducts compares too when the distance takes in half a duct's width.
'use strict';
const X = require('./dxf-in.cjs');

// layer names that usually hold ducts; the user picks the layers, these come first
const DUCT_LAYER = /DUCT|DCT|덕트|HVAC|M-DU|공조/i;
const LINEISH = new Set(['LINE', 'LWPOLYLINE']);

// the layers of a drawing that have lines, with how many: the likely duct layers first, then by count
function layers(text) {
 const n = new Map();
 for (const e of X.entities(text)) if (LINEISH.has(e.type)) n.set(e.layer, (n.get(e.layer) || 0) + 1);
 return [...n].map(([name, count]) => ({ name, count, duct: DUCT_LAYER.test(name) })).sort((a, b) => (b.duct - a.duct) || (b.count - a.count));
}

// the line segments on the layers picked, DXF's way round: [x1, y1, x2, y2] in mm
function segments(text, pick) {
 const want = new Set(pick), out = [], add = (a, b) => { if (Math.hypot(b.x - a.x, b.y - a.y) > 1) out.push([a.x, a.y, b.x, b.y]); };
 for (const e of X.entities(text)) {
  if (!want.has(e.layer)) continue;
  if (e.type === 'LINE' && Number.isFinite(e.x2)) add({ x: e.x, y: e.y }, { x: e.x2, y: e.y2 });
  else if (e.type === 'LWPOLYLINE') { const p = e.pts.filter(q => Number.isFinite(q.x) && Number.isFinite(q.y)); for (let i = 1; i < p.length; i++) add(p[i - 1], p[i]); if (e.flags & 1 && p.length > 2) add(p.at(-1), p[0]); }
 }
 return out;
}

const len = s => Math.hypot(s[2] - s[0], s[3] - s[1]);
// DXF y runs up, BOX's (the design data's) down: the drawing turned to the plan's way round - or kept, if that sits
// better on the deck's rooms. fit: the share of the length whose middle falls on the rooms' extent (1 m round it)
function place(segs, rooms) {
 const xs = rooms.flatMap(r => r.polygon.map(p => p.x)), ys = rooms.flatMap(r => r.polygon.map(p => p.y));
 if (!segs.length || !xs.length) return { segs: [], flip: true, fit: 0 };
 const box = { x0: Math.min(...xs) - 1000, x1: Math.max(...xs) + 1000, y0: Math.min(...ys) - 1000, y1: Math.max(...ys) + 1000 }, total = segs.reduce((t, s) => t + len(s), 0);
 const fitOf = list => list.reduce((t, s) => { const mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2; return t + (mx >= box.x0 && mx <= box.x1 && my >= box.y0 && my <= box.y1 ? len(s) : 0); }, 0) / total;
 const flipped = segs.map(s => [s[0], -s[1], s[2], -s[3]]), a = fitOf(flipped), b = fitOf(segs);
 return a >= b ? { segs: flipped, flip: true, fit: a } : { segs, flip: false, fit: b };
}

// the AUTO ducts of a deck as segments in the design data's coordinates (geometry y is -BOX y)
function autoSegments(geometry, plans, deckId) {
 const out = [];
 for (const p of plans) if (p.deckId === deckId) for (const d of geometry[p.key]?.ducts || []) for (let i = 1; i < d.points.length; i++) { const a = d.points[i - 1], b = d.points[i]; out.push([a.x, -a.y, b.x, -b.y]); }
 return out.filter(s => len(s) > 1);
}

// segments put in square cells of the distance: a point's near segments are in its cell and the eight round it
function grid(segs, cell) {
 const g = new Map(), key = (i, j) => i + ',' + j;
 segs.forEach((s, k) => { const i0 = Math.floor(Math.min(s[0], s[2]) / cell), i1 = Math.floor(Math.max(s[0], s[2]) / cell), j0 = Math.floor(Math.min(s[1], s[3]) / cell), j1 = Math.floor(Math.max(s[1], s[3]) / cell);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = key(i, j); if (!g.has(c)) g.set(c, []); g.get(c).push(k); } });
 return { near(x, y, tol) { const i = Math.floor(x / cell), j = Math.floor(y / cell);
  for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) for (const k of g.get(key(a, b)) || []) if (distSeg(x, y, segs[k]) <= tol) return true;
  return false; } };
}
function distSeg(x, y, s) { const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / L2)) : 0; return Math.hypot(x - (s[0] + t * dx), y - (s[1] + t * dy)); }

// how much of `from` runs within tol of `to`: points every stepMm along each segment
function covered(from, to, tol, step) {
 const g = grid(to, Math.max(tol, 1)); let total = 0, near = 0;
 const per = from.map(s => { const L = len(s), n = Math.max(1, Math.ceil(L / step)); let hit = 0;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; if (g.near(s[0] + t * (s[2] - s[0]), s[1] + t * (s[3] - s[1]), tol)) hit++; }
  total += L; near += L * hit / n; return hit / n; });
 return { m: total / 1000, share: total ? near / total : 0, per };
}

// the two ways round: how much of the designer's ducts AUTO also runs (designShare) and how much of AUTO the designer
// also drew (autoShare), within tolMm; per designer segment its own share (the plan marks the ones AUTO left)
function compare(design, auto, { tolMm = 500, stepMm = 100 } = {}) {
 const d = covered(design, auto, tolMm, stepMm), a = covered(auto, design, tolMm, stepMm);
 return { tolMm, designM: d.m, autoM: a.m, designShare: d.share, autoShare: a.share, designSegShare: d.per };
}

module.exports = { DUCT_LAYER, layers, segments, place, autoSegments, compare };
