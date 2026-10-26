// Ver 2.0 duct engine - duct assignment (V2-1.5, docs/v2/STUDY_PHG.md 3.3). Written anew (D7). The routed network
// (lib/duct/network.cjs: nodes, edges with their route role) becomes ducts - one straight duct between two nodes, a
// node at every bend and branch - with their kind:
//  - the straight that reaches an RU: sub-branch (the RU's run-out); the other straights of that RU's route: branch;
//  - with RU groups (lib/duct/network.cjs groups): a duct feeding one group only is a branch, every other duct a main;
//  - without: the main of the route (the spine, or the duct the first RU took to the root) main, the rest branch.
// Ids follow the network from the root (stable for the same route); `key` (both ends' coordinates and the kind)
// finds a duct again after another AUTO (manual sizes).
'use strict';

const N = require('./network.cjs');

function assign(input, net) {
 const nodes = [], ducts = [], diffusers = [], adj = new Map();
 for (const e of net.edges) for (const id of [e.from, e.to]) { if (!adj.has(id)) adj.set(id, []); adj.get(id).push(e); }
 // from the root: the order of the nodes, each node's edge from its parent, the RUs below every edge
 const order = [], parentOf = new Map([['ROOT', null]]), queue = ['ROOT'];
 while (queue.length) { const id = queue.shift(); order.push(id); for (const e of adj.get(id) || []) { const o = e.from === id ? e.to : e.from; if (parentOf.has(o)) continue; parentOf.set(o, e); queue.push(o); } }
 const atNode = new Map(order.map(id => [id, net.nodes.get(id)?.type === 'terminal' ? [id] : []])), below = new Map();
 for (let i = order.length - 1; i > 0; i--) { const id = order[i], e = parentOf.get(id), up = e.from === id ? e.to : e.from; below.set(e.id, atNode.get(id)); atNode.get(up).push(...atNode.get(id)); }
 const groupOf = net.groupOf || new Map(), hasGroups = groupOf.size > 0;
 const kindOf = e => {
  const rus = below.get(e.id) || [];
  if (hasGroups) { const gs = new Set(rus.map(r => groupOf.get(r) || `solo:${r}`)); return gs.size === 1 ? 'branch' : 'main'; }
  return e.role === 'MAIN' ? 'main' : 'branch';
 };
 // nodes: root, RUs, branch nodes, and a node at every bend
 const nodeId = new Map(), add = (id, type, p, extra = {}) => { const n = { id, type, x: p.x, y: p.y, ...extra }; nodes.push(n); nodeId.set(id, n); return n; };
 add('ROOT', 'root', net.nodes.get('ROOT'), { pressureFlowMode: input.flowMode === 'exhaust' ? 'exhaust' : 'supply', name: 'Root-01' });
 for (const id of order.slice(1)) { const n = net.nodes.get(id); if (n.type === 'terminal') add(id, 'diffuser', n); else add(id, 'junction', n); }
 let bendN = 0, ductN = 0, mainN = 0, brN = 0;
 for (const id of order.slice(1)) {
  const e = parentOf.get(id), up = e.from === id ? e.to : e.from, pts = e.from === up ? e.points : [...e.points].reverse();
  const kind = kindOf(e), ru = net.nodes.get(id)?.type === 'terminal';
  let from = up;
  for (let i = 1; i < pts.length; i++) {
   const last = i === pts.length - 1, to = last ? id : add(`B${++bendN}`, 'junction', pts[i], { bend: true }).id;
   const type = ru && last ? 'sub_branch' : kind;
   const name = type === 'main' ? `M-D-${++mainN}` : `G001-D-${++brN}`;
   ducts.push({ id: `D${String(++ductN).padStart(3, '0')}`, displayName: name, type, fromNodeId: from, toNodeId: to, points: [{ ...pts[i - 1] }, { ...pts[i] }],
    key: `${type}:${pts[i - 1].x},${pts[i - 1].y}>${pts[i].x},${pts[i].y}`, flowCmh: 0, shape: 'rect', widthMm: 0, heightMm: 0, diameterMm: 0, manualSize: false });
   from = to;
  }
 }
 for (const n of nodes.filter(n => n.type === 'diffuser')) { const t = net.nodes.get(n.id).terminal; diffusers.push({ id: `RU-${n.id}`, ruId: t.ruId, displayName: t.ruId, connectedNodeId: n.id, x: n.x, y: n.y, flowCmh: t.flowCmh }); }
 return { nodes, ducts, diffusers };
}

const lengthMm = ducts => ducts.reduce((t, d) => t + N.manhattan(d.points[0], d.points[d.points.length - 1]), 0);
module.exports = { assign, lengthMm };
