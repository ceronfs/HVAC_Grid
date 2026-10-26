// Ver 2.0 duct engine - AUTO (V2-1.4, docs/v2/STUDY_PHG.md 3.2 ② ③ ⑥). Written anew (D7).
// For one plan: the network without a main first (lib/duct/network.cjs); with three or more RUs, main spines too -
// a straight main along x or y at a chosen line (through the root, at the RUs' median, or along a corridor), joined to
// the root, the RUs then branching off it - and the network of least weighted cost wins (main / branch / sub-branch
// length and bends weighted, a main outside the corridors costs extra). A spine is dropped when it covers less than 70 %
// of the RUs' span, or makes the network over 1.6 times the length or with more main bends than the one without (a
// spine's one bend from the root always allowed). A spine never runs over an RU.
// When some RU cannot be joined with every forbidden zone in place, AUTO tries again without the outside of the deck,
// then without the restricted rooms, then without any (zonesRelaxed), and keeps the first full network (else the first
// it got).
'use strict';

const A = require('./astar.cjs'), N = require('./network.cjs'), I = require('./input.cjs');
const SPINE_MIN_COVER = 0.7, SPINE_MAX_LENGTH = 1.6;
const manhattan = N.manhattan, len = pts => pts.slice(1).reduce((s, q, i) => s + manhattan(pts[i], q), 0);

// the role of every edge from the root: MAIN as built, sub-branch when it reaches an RU, else branch
function roles(net) {
 const out = new Map();
 for (const e of net.edges) { const t = [e.from, e.to].some(id => net.nodes.get(id)?.type === 'terminal'); out.set(e.id, t ? 'subBranch' : e.role === 'MAIN' ? 'main' : 'branch'); }
 return out;
}
// bends of a network from the root: inside the edges, and at nodes where the duct goes on in another direction
function bends(net) {
 const inner = new Map(net.edges.map(e => [e.id, Math.max(0, e.points.length - 2)])), at = new Map();
 const adj = new Map(); for (const e of net.edges) for (const id of [e.from, e.to]) { if (!adj.has(id)) adj.set(id, []); adj.get(id).push(e); }
 const dirOut = (e, id) => { const p = e.from === id ? e.points : [...e.points].reverse(); return { x: Math.sign(p[1].x - p[0].x), y: Math.sign(p[1].y - p[0].y) }; };
 const seen = new Set(['ROOT']), queue = [['ROOT', null]];
 while (queue.length) {
  const [id, inE] = queue.shift();
  for (const e of adj.get(id) || []) {
   if (e === inE) continue; const o = e.from === id ? e.to : e.from; if (seen.has(o)) continue; seen.add(o);
   if (inE) { const a = dirOut(inE, id), b = dirOut(e, id); if (!(a.x === -b.x && a.y === -b.y)) at.set(e.id, 1); }
   queue.push([o, e]);
  }
 }
 return { inner, at };
}

// weighted cost (for choosing a candidate; not a pressure): length and bends by role, a main outside the corridors
function weightedCost(input, net) {
 const w = input.rules.costWeights, role = roles(net), { inner, at } = bends(net), out = { total: 0, corridorCost: 0, roles: { main: { lengthMm: 0, bends: 0 }, branch: { lengthMm: 0, bends: 0 }, subBranch: { lengthMm: 0, bends: 0 } } };
 for (const e of net.edges) { const r = role.get(e.id), L = len(e.points), b = (inner.get(e.id) || 0) + (at.get(e.id) || 0); out.roles[r].lengthMm += L; out.roles[r].bends += b; out.total += L * w[r].length + b * w[r].bend; }
 // main length outside every corridor
 if (input.corridors.length) {
  let outside = 0;
  for (const e of net.edges) if (role.get(e.id) === 'main') for (let i = 1; i < e.points.length; i++) {
   const a = e.points[i - 1], b = e.points[i], L = manhattan(a, b), n = Math.max(1, Math.round(L / 100));
   for (let k = 0; k < n; k++) { const p = { x: a.x + (b.x - a.x) * (k + 0.5) / n, y: a.y + (b.y - a.y) * (k + 0.5) / n }; if (!input.corridors.some(c => A.insidePoly(p, c.polygon))) outside += L / n; }
  }
  out.corridorCost = outside * w.main.length * input.rules.corridorPenalty; out.total += out.corridorCost; out.mainOutsideCorridorMm = outside;
 }
 return out;
}

const median = v => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const snap = (v, g, o) => Math.round((v - o) / g) * g + o;

// the lines a spine may take along an axis ('x': a horizontal main, the line is a y value)
function spineLines(input, axis) {
 const o = axis === 'x' ? 'y' : 'x', g = input.grid, org = axis === 'x' ? input.area.minY : input.area.minX, hwMain = N.halfWidth(input.designCmh, 'main', input.rules);
 const ts = input.terminals, vals = new Set();
 // corridors running along the axis: every grid line inside with room for the main (nearest the middle first)
 const band = [];
 for (const c of input.corridors) {
  const xs = c.polygon.map(p => p.x), ys = c.polygon.map(p => p.y), w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  if ((axis === 'x' ? w < h : h < w)) continue;
  const lo = axis === 'x' ? Math.min(...ys) : Math.min(...xs), hi = axis === 'x' ? Math.max(...ys) : Math.max(...xs), mid = (lo + hi) / 2;
  band.push([lo, hi]);
  const cand = []; for (let v = snap(lo, g, org); v <= hi; v += g) if (v - lo >= hwMain && hi - v >= hwMain) cand.push(v);
  cand.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b); for (const v of cand) vals.add(v);
 }
 const inBand = v => band.some(([lo, hi]) => v >= lo && v <= hi);
 // the root's line and the RUs' median (moved a grid step off an RU standing on it)
 for (let v of [input.root[o], snap(median(ts.map(t => t[o])), g, org)]) {
  if (inBand(v) && band.length) continue;
  if (ts.some(t => t[o] === v)) v += g;
  vals.add(v);
 }
 return [...vals];
}

// a spine: root → (root, line) → along the line to both ends of the RUs' span; null when blocked or over an RU
function spineSeed(input, grid, axis, v) {
 const ts = input.terminals, lo = Math.min(...ts.map(t => t[axis])), hi = Math.max(...ts.map(t => t[axis]));
 const hw = N.halfWidth(input.designCmh, 'main', input.rules), r = input.root, j = axis === 'x' ? { x: r.x, y: v } : { x: v, y: r.y };
 const a = axis === 'x' ? { x: lo, y: v } : { x: v, y: lo }, b = axis === 'x' ? { x: hi, y: v } : { x: v, y: hi };
 // the grid must hold these points
 for (const p of [j, a, b]) if (grid.at(p) < 0) return null;
 const clear = (p, q) => { // straight p → q keeps hw clear and passes no RU
  const k0 = grid.at(p), k1 = grid.at(q); if (k0 < 0 || k1 < 0) return false; if (k0 === k1) return true;
  const d = p.x < q.x ? 0 : p.y < q.y ? 1 : p.x > q.x ? 2 : 3; let k = k0;
  while (k !== k1) { if (!grid.open(k, d, hw)) return false; k = grid.next(k, d); const pt = grid.pt(k); if (ts.some(t => t.x === pt.x && t.y === pt.y)) return false; }
  return true;
 };
 if (!clear(r, j)) return null;
 const nodes = [{ id: 'SJ', type: 'branch', x: j.x, y: j.y }], edges = [];
 if (manhattan(r, j) > 0) edges.push({ from: 'ROOT', to: 'SJ', points: [r, j], role: 'MAIN' });
 for (const [end, id] of [[a, 'SA'], [b, 'SB']]) {
  if (manhattan(j, end) < input.grid) continue;
  if (!clear(j, end)) return null;
  nodes.push({ id, type: 'spine-end', x: end.x, y: end.y }); edges.push({ from: 'SJ', to: id, points: [j, end], role: 'MAIN' });
 }
 if (!edges.length) return null;
 // the junction is the root itself when the line runs through it
 if (manhattan(r, j) === 0) { for (const e of edges) { if (e.from === 'SJ') e.from = 'ROOT'; } nodes.shift(); }
 return { nodes, edges };
}

// spine ends no RU uses: cut back to the last branch node on them
function trimSpine(net) {
 for (;;) {
  const end = [...net.nodes.values()].find(n => n.type === 'spine-end' && net.degree(n.id) <= 1);
  if (!end) break;
  const e = net.edges.find(x => x.from === end.id || x.to === end.id); if (e) net.edges.splice(net.edges.indexOf(e), 1);
  net.nodes.delete(end.id);
  // a branch node left with two ducts in one line is no fitting any more: the two become one
  const other = e && (e.from === end.id ? e.to : e.from), on = other && net.nodes.get(other);
  if (on && on.type === 'branch' && net.degree(on.id) === 1) { on.type = 'spine-end'; continue; }
  if (on && on.type === 'branch' && net.degree(on.id) === 2) merge(net, on.id);
 }
}
function merge(net, id) {
 const [e1, e2] = net.edges.filter(x => x.from === id || x.to === id), p1 = e1.to === id ? e1.points : [...e1.points].reverse(), p2 = e2.from === id ? e2.points : [...e2.points].reverse();
 const a = e1.to === id ? e1.from : e1.to, b = e2.from === id ? e2.to : e2.from, pts = [...p1, ...p2.slice(1)];
 const clean = pts.filter((q, i) => i === 0 || i === pts.length - 1 || !((pts[i - 1].x === q.x && q.x === pts[i + 1].x) || (pts[i - 1].y === q.y && q.y === pts[i + 1].y)));
 net.edges.splice(net.edges.indexOf(e1), 1); net.edges.splice(net.edges.indexOf(e2), 1); net.nodes.delete(id);
 net.addEdge(a, b, clean, e1.role === 'MAIN' || e2.role === 'MAIN' ? 'MAIN' : 'BRANCH', { terminal: e1.terminal || e2.terminal });
}

function metrics(input, b) {
 const w = weightedCost(input, b.net), L = b.net.edges.reduce((t, e) => t + len(e.points), 0), mainBends = w.roles.main.bends;
 return { lengthMm: L, mainBends, weightedCost: w, unconnected: b.unconnected.length };
}

// the network for one input (all zones as given)
function network(input, { spines = true } = {}) {
 const grid = new A.Grid(input, spineExtra(input));
 // without a spine the trunk - every duct not ending at an RU - is the main (PHG D's network without a main)
 const base = N.build(input, { grid });
 for (const e of base.net.edges) if (![e.from, e.to].some(id => base.net.nodes.get(id)?.type === 'terminal')) e.role = 'MAIN';
 const cands = [{ ...base, spine: null, m: metrics(input, base) }];
 if (spines && input.terminals.length >= 3) {
  for (const axis of ['x', 'y']) for (const v of spineLines(input, axis)) {
   const seed = spineSeed(input, grid, axis, v); if (!seed) continue;
   const b = N.build(input, { grid, seed }); trimSpine(b.net);
   const m = metrics(input, b), span = Math.max(...input.terminals.map(t => t[axis])) - Math.min(...input.terminals.map(t => t[axis]));
   const cover = span > 0 ? Math.min(1, b.net.edges.filter(e => e.role === 'MAIN').reduce((t, e) => t + e.points.slice(1).reduce((s, q, i) => s + Math.abs(q[axis] - e.points[i][axis]), 0), 0) / span) : 1;
   if (m.unconnected > cands[0].m.unconnected || cover < SPINE_MIN_COVER || m.lengthMm > cands[0].m.lengthMm * SPINE_MAX_LENGTH || m.mainBends > Math.max(1, cands[0].m.mainBends)) continue;
   cands.push({ ...b, spine: `${axis}=${v}`, axis, value: v, cover, m });
  }
 }
 // the least weighted cost (fewer unconnected RUs first; ties: main bends, length, axis, line)
 cands.sort((a, b) => a.m.unconnected - b.m.unconnected || a.m.weightedCost.total - b.m.weightedCost.total || a.m.mainBends - b.m.mainBends || a.m.lengthMm - b.m.lengthMm || String(a.spine).localeCompare(String(b.spine)));
 return { ...cands[0], candidates: cands.length, all: cands, grid };
}
// grid lines through the RUs' run-out ends (the run-out then ends on a grid point)
function spineExtra(input) { return input.terminals.map(t => ({ x: t.x + t.leadMm, y: t.y + t.leadMm })).concat(input.terminals.map(t => ({ x: t.x - t.leadMm, y: t.y - t.leadMm }))); }

// AUTO with the zone relaxation steps
function route(input, opt = {}) {
 const steps = I.relaxSteps(input); let first = null;
 for (const s of steps) {
  const r = network(s.input, opt), out = { ...r, zonesRelaxed: s.zonesRelaxed, input: s.input };
  if (!first && r.net.edges.length) first = out;
  if (!r.unconnected.length) return out;
 }
 return first || { ...network(input, opt), zonesRelaxed: false, input };
}

module.exports = { roles, bends, weightedCost, spineLines, spineSeed, trimSpine, network, route };
