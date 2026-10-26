// Ver 2.0 duct engine - the routing grid and its search (V2-1.2, docs/v2/STUDY_PHG.md 3.2 ④). Written anew (D7).
// The grid: lines at every multiple of the grid step inside the routing area plus the lines through the root and the
// RUs (their points need not sit on the grid). A duct runs along grid lines only (orthogonal). A step is open when the
// duct, at its estimated half width, keeps clear of every forbidden zone (inside a zone is never open) and does not
// run onto the network being built (only a target may be touched). The search: A* over (point, direction), a bend
// costs `bendCost`, no turning back; after a bend the duct runs at least `minRunMm` straight before it may bend again
// or reach the target (elbow-to-elbow straight, PHG D minElbowRunMm).
'use strict';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const BIG = 1e18;

// distance from a point to a polygon (0 inside)
function insidePoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
function segDist(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }
function polyDist(p, poly) { if (insidePoly(p, poly)) return 0; let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length])); return d; }

class Grid {
 // input: lib/duct/input.cjs routeInput; extra: more coordinates to put lines through
 constructor(input, extra = []) {
  const { area, grid } = input, xs = new Set(), ys = new Set();
  for (let x = area.minX; x <= area.maxX + 1e-6; x += grid) xs.add(Math.round(x));
  for (let y = area.minY; y <= area.maxY + 1e-6; y += grid) ys.add(Math.round(y));
  for (const p of [input.root, ...input.terminals, ...extra]) { xs.add(Math.round(p.x)); ys.add(Math.round(p.y)); }
  this.xs = [...xs].sort((a, b) => a - b); this.ys = [...ys].sort((a, b) => a - b);
  this.nx = this.xs.length; this.ny = this.ys.length; this.n = this.nx * this.ny;
  this.ix = new Map(this.xs.map((x, i) => [x, i])); this.iy = new Map(this.ys.map((y, i) => [y, i]));
  this.zones = input.forbidden.map(z => { const xs = z.polygon.map(p => p.x), ys = z.polygon.map(p => p.y); return { poly: z.polygon, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }; });
  this.clear = new Float64Array(this.n); this.midH = new Float64Array(this.n); this.midV = new Float64Array(this.n);
  const reach = 2000;   // farther than this from a zone counts as clear (half widths are far less)
  const dist = p => { let d = reach; for (const z of this.zones) { if (p.x < z.minX - d || p.x > z.maxX + d || p.y < z.minY - d || p.y > z.maxY + d) continue; d = Math.min(d, polyDist(p, z.poly)); if (d === 0) break; } return d; };
  for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.ny; j++) {
   const k = i * this.ny + j, x = this.xs[i], y = this.ys[j];
   this.clear[k] = dist({ x, y });
   this.midH[k] = i + 1 < this.nx ? dist({ x: (x + this.xs[i + 1]) / 2, y }) : 0;
   this.midV[k] = j + 1 < this.ny ? dist({ x, y: (y + this.ys[j + 1]) / 2 }) : 0;
  }
 }
 id(i, j) { return i * this.ny + j; }
 at(p) { const i = this.ix.get(Math.round(p.x)), j = this.iy.get(Math.round(p.y)); return i == null || j == null ? -1 : this.id(i, j); }
 pt(k) { return { x: this.xs[Math.floor(k / this.ny)], y: this.ys[k % this.ny] }; }
 next(k, d) { const i = Math.floor(k / this.ny), j = k % this.ny, a = i + DIRS[d][0], b = j + DIRS[d][1]; return a < 0 || b < 0 || a >= this.nx || b >= this.ny ? -1 : this.id(a, b); }
 // the step k → its neighbour in direction d keeps hw clear of the zones (hw 0: only not inside)
 open(k, d, hw) {
  const m = this.next(k, d); if (m < 0) return false;
  const lim = Math.max(hw, 1e-9), mid = d === 0 ? this.midH[k] : d === 2 ? this.midH[m] : d === 1 ? this.midV[k] : this.midV[m];
  return this.clear[m] >= lim && mid >= lim;
 }
 len(k, m) { const a = this.pt(k), b = this.pt(m); return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
}

// a binary heap of [f, state]
class Heap { constructor() { this.a = []; } get size() { return this.a.length; }
 push(f, s) { const a = this.a; a.push([f, s]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
 pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; } }

// search from `start` (grid index, optional fixed first direction startDir) to any point of `goal` (Set of grid indices).
// opt: { hw, bendCost, minRunMm, blocked: Set of grid indices not to step on (the network), heuristic: k => number,
//        maxExpand, startDir: the direction the duct already runs at the start (it may go on or turn, not back) }
function search(grid, start, goal, opt) {
 const { hw = 0, bendCost = 1200, minRunMm = 0, blocked = new Set(), heuristic = () => 0, maxExpand = 2e6, startDir = -1 } = opt;
 if (goal.has(start)) return { cost: 0, points: [start], expanded: 0 };
 const best = new Map(), from = new Map(), heap = new Heap(), key = (k, d) => k * 5 + d;
 const s0 = key(start, startDir >= 0 ? startDir : 4); best.set(s0, 0); heap.push(heuristic(start), s0);
 let expanded = 0;
 while (heap.size) {
  const [, s] = heap.pop(), k = Math.floor(s / 5), d = s % 5, g = best.get(s);
  if (++expanded > maxExpand) break;
  if (d !== 4 && goal.has(k)) { const pts = []; for (let t = s; t != null; t = from.get(t)) pts.push(Math.floor(t / 5)); pts.reverse(); return { cost: g, points: pts, expanded }; }
  for (let nd = 0; nd < 4; nd++) {
   if (d !== 4 && nd === (d + 2) % 4) continue;
   const turn = d !== 4 && nd !== d;
   // one grid step straight on, or after a turn a run of at least minRunMm
   let m = k, run = 0, ok = true;
   do {
    if (!grid.open(m, nd, hw)) { ok = false; break; }
    const q = grid.next(m, nd); run += grid.len(m, q); m = q;
    if (goal.has(m)) { if (turn && run < minRunMm) { ok = false; } break; }
    if (blocked.has(m)) { ok = false; break; }
   } while (turn && run < minRunMm);
   if (!ok) continue;
   const ns = key(m, nd), ng = g + run + (turn ? bendCost : 0);
   if (ng < (best.get(ns) ?? BIG)) { best.set(ns, ng); from.set(ns, s); heap.push(ng + heuristic(m), ns); }
  }
 }
 return null;
}

// grid indices of a path → its corner points (the polyline)
function corners(grid, idx) {
 const p = idx.map(k => grid.pt(k)), out = [p[0]];
 for (let i = 1; i < p.length - 1; i++) { const a = out[out.length - 1], b = p[i], c = p[i + 1]; if (!((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) out.push(b); }
 if (p.length > 1) out.push(p[p.length - 1]);
 return out;
}

module.exports = { DIRS, Grid, Heap, search, corners, polyDist, insidePoly, segDist };
