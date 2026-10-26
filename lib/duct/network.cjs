// Ver 2.0 duct engine - building the network (V2-1.3, docs/v2/STUDY_PHG.md 3.2 ① ④). Written anew (D7).
// Trunk and branches: the RUs are taken one by one in Prim order (from the root, the RU nearest to what is connected
// so far) and each is joined to the network built so far - its duct leaves the RU straight for the run-out (800 mm, in
// the best of the four directions), then the cheapest grid route to the nearest allowed point of the network. Where it
// joins the middle of a duct, that duct is cut and a branch node made. Allowed points (the tap rules):
//  - at least the minimum piece (500 mm) from a fitting (the root, a branch node) along the duct, and the RU leaf
//    (300 mm, at least a grid step) from an RU;
//  - at least the elbow run (500 mm) from a bend of that duct;
//  - not on a branch node (no cross tee);
//  - not inside another RU's room (a corridor and the unit's room excepted);
//  - RU groups (one room, within 8 m; without rooms within 2 m): a group's ducts are its own branch - no other RU
//    joins them, and once a group has a duct its other RUs join only that;
//  - the root itself may always be joined (unless it already has three ducts).
// The run-out is run in full before the duct may reach the network.
// An RU that cannot be joined is tried again once all others are in, then with the rules relaxed (only the zones and
// the network itself still in the way); one still unjoined is reported (`unconnected`).
'use strict';

const A = require('./astar.cjs'), S = require('./size.cjs');

const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
// half the estimated width of a duct carrying cmh, plus insulation and the installation clearance (PHG D's envelope)
function halfWidth(cmh, type, rules) { const r = S.rules({}).types[type] || S.rules({}).types.branch, s = S.rectSize(Math.max(1, cmh), r); return s.widthMm / 2 + rules.insulationMm + rules.installClearanceMm; }

// the order the RUs are joined in: Prim from the root over manhattan distance (ties by id)
function primOrder(root, terminals) {
 const left = [...terminals], seen = [root], out = [];
 while (left.length) {
  let bi = 0, bd = Infinity;
  left.forEach((t, i) => { const d = Math.min(...seen.map(p => manhattan(p, t))); if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && t.id < left[bi].id)) { bd = d; bi = i; } });
  const t = left.splice(bi, 1)[0]; out.push(t); seen.push(t);
 }
 return out;
}

// RU groups by union-find: RUs of one room within roomGroupMaxMm (or the spacing), RUs of two rooms never; without
// rooms, within autoGroupSpacingMm. Only groups of two or more. Map terminal id → group id
function groups(input) {
 const r = input.rules, ts = [...input.terminals].sort((a, b) => a.id < b.id ? -1 : 1), parent = ts.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
 for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
  const a = ts[i], b = ts[j], d = manhattan(a, b);
  const pair = a.roomId && b.roomId ? a.roomId === b.roomId && d <= Math.max(r.roomGroupMaxMm, r.autoGroupSpacingMm) + 1e-6 : d <= r.autoGroupSpacingMm + 1e-6;
  if (pair) { const x = find(i), y = find(j); if (x !== y) parent[Math.max(x, y)] = Math.min(x, y); }
 }
 const parts = new Map(); ts.forEach((t, i) => { const k = find(i); if (!parts.has(k)) parts.set(k, []); parts.get(k).push(t.id); });
 const out = new Map(); let n = 0; for (const ids of parts.values()) if (ids.length > 1) { const id = `G${++n}`; for (const t of ids) out.set(t, id); }
 return out;
}

class Network {
 constructor(input, grid) {
  this.input = input; this.grid = grid; this.rules = input.rules;
  this.nodes = new Map([['ROOT', { id: 'ROOT', type: 'root', x: input.root.x, y: input.root.y }]]);
  this.edges = []; this.n = 0;
  this.groupOf = groups(input);
 }
 // the RU group an edge belongs to: the group of an RU at one of its ends
 edgeGroup(e) { for (const id of [e.from, e.to]) { const n = this.nodes.get(id); if (n?.type === 'terminal' && this.groupOf.has(n.id)) return this.groupOf.get(n.id); } return null; }
 node(type, p, extra = {}) { const id = type === 'branch' ? `J${++this.n}` : extra.id; const n = { id, type, x: p.x, y: p.y, ...extra, id }; this.nodes.set(id, n); return n; }
 degree(id) { return this.edges.filter(e => e.from === id || e.to === id).length; }
 addEdge(from, to, points, role, extra = {}) { const e = { id: `E${this.edges.length + 1}-${from}-${to}`, from, to, points, role, ...extra }; this.edges.push(e); return e; }
 // every grid point the network runs over, with the edge and the distance along it
 cover() {
  const g = this.grid, out = new Map();
  for (const e of this.edges) {
   let along = 0;
   for (let i = 1; i < e.points.length; i++) {
    const a = e.points[i - 1], b = e.points[i], dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
    const xs = dx ? g.xs.filter(x => (x - a.x) * dx >= 0 && (b.x - x) * dx >= 0) : [a.x], ys = dy ? g.ys.filter(y => (y - a.y) * dy >= 0 && (b.y - y) * dy >= 0) : [a.y];
    const pts = dx ? xs.map(x => ({ x, y: a.y })) : ys.map(y => ({ x: a.x, y }));
    if (dx < 0 || dy < 0) pts.reverse();
    for (const p of pts) { const k = g.at(p); if (k < 0) continue; const s = along + manhattan(a, p); if (!out.has(k)) out.set(k, { edge: e, along: s, seg: i - 1 }); }
    along += manhattan(a, b);
   }
  }
  return out;
 }
 // the points a new RU duct may join: the network's points that keep the tap rules (relaxed: only not a cross tee)
 targets(t, relaxed) {
  const g = this.grid, r = this.rules, cov = this.cover(), goal = new Set(), lead = Math.max(r.minSubBranchMm, this.input.grid);
  const rootRoom = this.input.rootRoomId, rooms = this.input.ruRooms, myRoom = t.roomId;
  for (const [k, c] of cov) {
   const e = c.edge, total = e.points.slice(1).reduce((s, q, i) => s + manhattan(e.points[i], q), 0), p = g.pt(k);
   const ends = [[this.nodes.get(e.from), c.along], [this.nodes.get(e.to), total - c.along]];
   let ok = true;
   // on a node itself: never (a branch node would become a cross tee, an RU must stay an end); along the duct: the RU leaf
   // from an RU, the minimum piece from a fitting (relaxed: a grid step from an RU, anything off a fitting)
   for (const [n, d] of ends) {
    if (d < 1e-6) { ok = false; break; }
    if (n.type === 'terminal' && d < (relaxed ? this.input.grid : lead)) ok = false;
    if (!relaxed && (n.type === 'branch' || n.type === 'root') && d < r.minDuctPieceMm) ok = false;
   }
   if (!ok) continue;
   if (!relaxed && this.groupOf.size) {
    const eg = this.edgeGroup(e), mine = this.groupOf.get(t.id) ?? null;
    if (eg && eg !== mine) continue;
    if (mine && this.edges.some(x => this.edgeGroup(x) === mine) && eg !== mine) continue;
   }
   if (!relaxed) {
    // away from the duct's own bends
    let along = 0, nearBend = false;
    for (let i = 1; i < e.points.length - 1; i++) { along += manhattan(e.points[i - 1], e.points[i]); if (Math.abs(along - c.along) < r.minElbowRunMm) nearBend = true; }
    if (nearBend) continue;
    // not inside another RU's room
    let other = false; for (const [id, room] of Object.entries(rooms)) { if (id === myRoom || id === rootRoom || room.corridor) continue; if (A.insidePoly(p, room.polygon)) { other = true; break; } }
    if (other) continue;
   }
   goal.add(k);
  }
  // the root itself (not a fourth duct on it)
  if (this.degree('ROOT') < 3) goal.add(g.at(this.input.root));
  return { goal, cover: cov };
 }
 // join RU t; returns the edge or null
 join(t, { relaxed = false } = {}) {
  const g = this.grid, r = this.rules, { goal, cover } = this.targets(t, relaxed);
  if (!goal.size) return null;
  const blocked = new Set([...cover.keys()].filter(k => !goal.has(k)));
  const goalPts = [...goal].map(k => g.pt(k));
  const heuristic = k => { const p = g.pt(k); let m = Infinity; for (const q of goalPts) { const d = manhattan(p, q); if (d < m) m = d; } return m; };
  const hw = halfWidth(t.flowCmh, 'branch', r), start = g.at(t);
  let best = null;
  for (let d = 0; d < 4; d++) {
   // the run-out: straight from the RU, inside no zone, over no network point (or ending on an allowed one)
   let k = start, run = 0, ok = true, hit = -1;
   while (run < t.leadMm - 1e-6) { if (!g.open(k, d, 0)) { ok = false; break; } const m = g.next(k, d); run += g.len(k, m); k = m; if (goal.has(k)) { hit = k; break; } if (blocked.has(k)) { ok = false; break; } }
   if (!ok) continue;
   if (hit >= 0) { if (relaxed && run >= this.input.grid) { const c = run; if (!best || c < best.cost) best = { cost: c, idx: [start, hit], d }; } continue; }
   const res = A.search(g, k, goal, { hw: relaxed ? 0 : hw, bendCost: 1200, minRunMm: relaxed ? 0 : r.minElbowRunMm, blocked, heuristic, startDir: d, maxExpand: 400000 });
   if (!res) continue;
   const cost = run + res.cost;
   if (!best || cost < best.cost - 1e-9) best = { cost, idx: [start, ...res.points], d };
  }
  if (!best) return null;
  const pts = A.corners(g, best.idx), end = best.idx[best.idx.length - 1], c = cover.get(end);
  const tn = this.node('terminal', t, { id: t.id, terminal: t });
  let to;
  if (!c || end === g.at(this.input.root)) to = this.nodes.get('ROOT');   // joined at the root
  else to = this.split(c.edge, g.pt(end), c);
  const role = to.type === 'root' ? 'MAIN' : 'BRANCH';
  return this.addEdge(tn.id, to.id, pts, role, { terminal: t.id, cost: best.cost });
 }
 // cut edge e at point p (a grid point on it): a branch node; the two halves keep the edge's role
 split(e, p, c) {
  if (manhattan(p, this.nodes.get(e.from)) < 1e-6) return this.nodes.get(e.from);
  if (manhattan(p, this.nodes.get(e.to)) < 1e-6) return this.nodes.get(e.to);
  const j = this.node('branch', p), a = e.points.slice(0, c.seg + 1).concat([p]), b = [p].concat(e.points.slice(c.seg + 1));
  const clean = pts => pts.filter((q, i) => i === 0 || manhattan(q, pts[i - 1]) > 1e-6);
  this.edges.splice(this.edges.indexOf(e), 1);
  this.addEdge(e.from, j.id, clean(a), e.role, { terminal: e.terminal, seed: e.seed });
  this.addEdge(j.id, e.to, clean(b), e.role, { terminal: e.terminal, seed: e.seed });
  return j;
 }
}

// the whole network for one input; seed: edges already there (a main spine: [{from, to, points, role}] with nodes)
function build(input, { grid = new A.Grid(input), seed = null } = {}) {
 const net = new Network(input, grid);
 if (seed) { for (const n of seed.nodes) net.nodes.set(n.id, { ...n }); for (const e of seed.edges) net.addEdge(e.from, e.to, e.points, e.role, { seed: true }); }
 const order = primOrder(input.root, input.terminals), failed = [];
 for (const t of order) if (!net.join(t)) failed.push(t);
 // a second round once the others are in, then with the rules relaxed
 const still = failed.filter(t => !net.join(t)), unconnected = still.filter(t => !net.join(t, { relaxed: true }));
 return { net, grid, order: order.map(t => t.id), relaxedTerminals: still.filter(t => !unconnected.includes(t)).map(t => t.id), unconnected: unconnected.map(t => t.id) };
}

module.exports = { halfWidth, primOrder, groups, Network, build, manhattan };
