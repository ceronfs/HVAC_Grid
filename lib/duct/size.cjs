// Ver 2.0 duct engine - sizing (V2-1.5, docs/v2/STUDY_PHG.md 3.4). Written anew from the functional specification of PHG D's
// sizing (D7: PHG D is a reference, its code is not taken). A network: { nodes, ducts, diffusers, settings }; nodes
// {id, type: 'root' | 'diffuser' | 'junction'}, ducts {id, type: main | branch | sub_branch, fromNodeId, toNodeId,
// manualSize, shape, widthMm, heightMm, diameterMm}, diffusers {id, connectedNodeId, flowCmh} (the summer airflow of
// the plan, F-1 - the engine has no other flow input). Returns what PHG D's calculation returns: { ok, messages,
// ductUpdates, rootFlows, totalFlowCmh, visitedNodeIds, loopDuctIds }.
// The velocities and minimum heights are PHG D's program defaults, not values of a standard.
'use strict';

const TYPES = ['main', 'branch', 'sub_branch'];
const DEFAULTS = { main: { shape: 'rect', velocityMps: 10, minHeightMm: 200, maxHeightMm: 0, maxFrictionPaPerM: 0 },
 branch: { shape: 'rect', velocityMps: 8, minHeightMm: 100, maxHeightMm: 0, maxFrictionPaPerM: 0 },
 sub_branch: { shape: 'rect', velocityMps: 8, minHeightMm: 100, maxHeightMm: 0, maxFrictionPaPerM: 0 } };
const ROUND_MM = [80, 100, 125, 160, 200];
const STEP_MM = 50, MIN_W_MM = 100, MAX_SIDE_MM = 5000, MAX_ASPECT = 3, MANUAL_OVER = 1.1;
// air for the friction check (Swamee-Jain): roughness 0.09 mm, kinematic viscosity 1.51e-5 m²/s, density 1.2 kg/m³
const AIR = { roughnessM: 9e-5, nu: 1.51e-5, rho: 1.2 };

const num = v => Number.isFinite(+v) ? +v : 0;
const typeOf = d => TYPES.includes(d.type) ? d.type : TYPES.includes(d.ductClass) ? d.ductClass : 'sub_branch';
function rules(settings = {}) {
 const s = settings.sizing || {}, out = {};
 for (const t of TYPES) { const g = { ...DEFAULTS[t], ...(s[t] || {}) }; out[t] = { shape: g.shape === 'round' ? 'round' : 'rect', velocityMps: num(g.velocityMps) || DEFAULTS[t].velocityMps, minHeightMm: num(g.minHeightMm), maxHeightMm: num(g.maxHeightMm), maxFrictionPaPerM: num(g.maxFrictionPaPerM) }; }
 return { types: out, roundMm: (Array.isArray(settings.roundDiametersMm) && settings.roundDiametersMm.length ? settings.roundDiametersMm : ROUND_MM).map(num).filter(v => v > 0).sort((a, b) => a - b) };
}

const velocity = (cmh, areaM2) => areaM2 > 0 ? cmh / 3600 / areaM2 : 0;
// friction Pa/m of a section (Darcy-Weisbach, Swamee-Jain friction factor)
function frictionPaPerM(cmh, { widthMm, heightMm, diameterMm }) {
 const round = diameterMm > 0, a = round ? Math.PI * (diameterMm / 2000) ** 2 : widthMm * heightMm / 1e6, dh = round ? diameterMm / 1000 : 2 * widthMm * heightMm / (widthMm + heightMm) / 1000;
 const v = velocity(cmh, a); if (!(v > 0 && dh > 0)) return 0;
 const re = v * dh / AIR.nu, f = 0.25 / Math.log10(AIR.roughnessM / (3.7 * dh) + 5.74 / re ** 0.9) ** 2;
 return f / dh * AIR.rho * v * v / 2;
}

// a rectangular section: W from 100 mm, H from the type's minimum, 50 mm steps; W ≥ H, W/H ≤ 3, at most the target
// velocity (and friction cap). The best is closest to the target velocity, then squarest, then least spare area.
function rectSize(cmh, r, hCap = 0) {
 const need = cmh / 3600 / r.velocityMps, minH = Math.max(STEP_MM, r.minHeightMm || 0);
 const u = Math.min(MAX_SIDE_MM, Math.max(MIN_W_MM, minH, Math.max(600, Math.ceil(Math.sqrt(need * 1e6) * 4 / STEP_MM) * STEP_MM)));
 const hMax = Math.min(r.maxHeightMm > 0 ? r.maxHeightMm : Infinity, u, hCap > 0 ? hCap : Infinity);
 let best = null;
 for (let w = MIN_W_MM; w <= u; w += STEP_MM) for (let h = minH; h <= Math.min(w, hMax); h += STEP_MM) {
  if (w / h > MAX_ASPECT) continue;
  const a = w * h / 1e6; if (a < need) continue;
  const v = velocity(cmh, a); if (v > r.velocityMps + 1e-9) continue;
  if (r.maxFrictionPaPerM > 0 && frictionPaPerM(cmh, { widthMm: w, heightMm: h }) > r.maxFrictionPaPerM) continue;
  const score = Math.abs(r.velocityMps - v) * 1000 + Math.abs(w / h - 1) * 10 + (h <= 50 ? 1e5 : 0) + (a - need) / need;
  if (!best || score < best.score) best = { score, widthMm: w, heightMm: h };
 }
 if (best) return { shape: 'rect', widthMm: best.widthMm, heightMm: best.heightMm, diameterMm: 0, exceeded: false };
 // nothing fits: the largest section allowed, flagged
 const h = Math.max(minH, Math.min(hMax === Infinity ? u : hMax, u)), w = Math.min(u, Math.max(h, h * MAX_ASPECT));
 return { shape: 'rect', widthMm: w, heightMm: h, diameterMm: 0, exceeded: true };
}

function roundSize(cmh, r, list, hCap = 0) {
 const cap = Math.min(r.maxHeightMm > 0 ? r.maxHeightMm : Infinity, hCap > 0 ? hCap : Infinity);
 for (const d of list) { if (d > cap) break; if (velocity(cmh, Math.PI * (d / 2000) ** 2) <= r.velocityMps + 1e-9) return { shape: 'round', widthMm: 0, heightMm: 0, diameterMm: d, exceeded: false }; }
 return null;
}

// the graph: every duct between two existing nodes, every RU on a node of degree 1, each root alone in its tree, no loop
function check(net) {
 const msgs = [], nodes = new Map((net.nodes || []).map(n => [n.id, n])), adj = new Map([...nodes.keys()].map(k => [k, []])), err = (code, text, ids = []) => msgs.push({ type: 'error', code, text, ids });
 const roots = [...nodes.values()].filter(n => n.type === 'root');
 if (!roots.length) err('NO_ROOT', 'Root가 없습니다');
 const seen = new Set();
 for (const d of net.ducts || []) {
  if (!nodes.has(d.fromNodeId) || !nodes.has(d.toNodeId) || d.fromNodeId === d.toNodeId) { err('OPEN_DUCT', `덕트 ${d.displayName || d.id}의 끝이 노드에 닿지 않습니다`, [d.id]); continue; }
  const k = [d.fromNodeId, d.toNodeId].sort().join('|'); if (seen.has(k)) err('DUPLICATE_DUCT', `덕트 ${d.displayName || d.id}가 다른 덕트와 같은 두 노드를 잇습니다`, [d.id]); seen.add(k);
  adj.get(d.fromNodeId).push([d, d.toNodeId]); adj.get(d.toNodeId).push([d, d.fromNodeId]);
 }
 const ruAt = new Map();
 for (const u of net.diffusers || []) {
  const n = nodes.get(u.connectedNodeId);
  if (!n) { err('RU_NODE', `RU ${u.displayName || u.id}의 노드가 없습니다`, [u.id]); continue; }
  if (adj.get(n.id).length !== 1) err('RU_DEGREE', `RU ${u.displayName || u.id}에 덕트가 ${adj.get(n.id).length}개 닿습니다(1개여야 함)`, [u.id]);
  if (!(num(u.flowCmh) > 0)) err('RU_FLOW', `RU ${u.displayName || u.id}의 풍량이 0 이하입니다`, [u.id]);
  ruAt.set(n.id, (ruAt.get(n.id) || 0) + num(u.flowCmh));
 }
 return { msgs, nodes, adj, roots, ruAt };
}

// flows from the RUs up to every duct and the root: breadth first from each root, then backwards
function accumulate({ adj, roots, ruAt }) {
 const parent = new Map(), order = [], owner = new Map(), loops = new Set(), flow = new Map(), ductFlow = new Map();
 for (const r of roots) {
  if (owner.has(r.id)) continue;
  owner.set(r.id, r.id); order.push(r.id); parent.set(r.id, null);
  for (let i = order.length - 1; i < order.length; i++) {
   const at = order[i];
   for (const [d, to] of adj.get(at)) {
    if (parent.get(at)?.id === d.id) continue;
    if (owner.has(to)) { loops.add(d.id); continue; }
    owner.set(to, r.id); parent.set(to, d); order.push(to);
   }
  }
 }
 for (let i = order.length - 1; i >= 0; i--) {
  const n = order[i], f = (flow.get(n) || 0) + (ruAt.get(n) || 0); flow.set(n, f);
  const d = parent.get(n); if (!d) continue;
  ductFlow.set(d.id, f); const up = d.fromNodeId === n ? d.toNodeId : d.fromNodeId; flow.set(up, (flow.get(up) || 0) + f);
 }
 return { order, parent, owner, loops, flow, ductFlow };
}

function size(net) {
 const t0 = Date.now(), g = check(net), R = rules(net.settings), msgs = g.msgs;
 const a = accumulate(g);
 const rootsTogether = g.roots.filter(r => a.owner.get(r.id) !== r.id);
 for (const r of rootsTogether) msgs.push({ type: 'error', code: 'ROOTS_JOINED', text: `Root ${r.name || r.id}가 다른 Root의 망에 이어져 있습니다`, ids: [r.id] });
 for (const id of a.loops) msgs.push({ type: 'error', code: 'LOOP', text: `순환 덕트 ${id}`, ids: [id] });
 for (const [n] of g.ruAt) if (!a.owner.has(n)) msgs.push({ type: 'error', code: 'RU_NO_ROOT', text: `RU 노드 ${n}가 Root에 닿지 않습니다`, ids: [n] });
 const base = { visitedNodeIds: a.order, loopDuctIds: [...a.loops], calculationTimeMs: 0 };
 if (msgs.some(m => m.type === 'error')) return { ok: false, messages: msgs, ductUpdates: [], rootFlows: [], totalFlowCmh: 0, ...base };
 // the main duct above each node (for the branch height cap): the nearest main on the way to the root
 const mainAbove = new Map(), sized = new Map();
 for (const n of a.order) { const d = a.parent.get(n); if (!d) { mainAbove.set(n, null); continue; } const up = d.fromNodeId === n ? d.toNodeId : d.fromNodeId; mainAbove.set(n, typeOf(d) === 'main' ? d : mainAbove.get(up)); }
 const updates = [];
 const pick = (d, cmh, hCap = 0) => {
  const r = R.types[typeOf(d)];
  if (d.manualSize) {
   const round = d.shape === 'round' || (num(d.diameterMm) > 0 && !(num(d.widthMm) > 0));
   const s = round ? { shape: 'round', widthMm: 0, heightMm: 0, diameterMm: num(d.diameterMm) } : { shape: 'rect', widthMm: num(d.widthMm), heightMm: num(d.heightMm), diameterMm: 0 };
   const v = velocity(cmh, round ? Math.PI * (s.diameterMm / 2000) ** 2 : s.widthMm * s.heightMm / 1e6);
   if (v > r.velocityMps * MANUAL_OVER) msgs.push({ type: 'warning', code: 'MANUAL_VELOCITY', text: `${d.displayName || d.id}: 수동 단면 속도 ${v.toFixed(2)} m/s가 목표 ${r.velocityMps} m/s의 110 %를 넘습니다`, ids: [d.id] });
   return { ...s, exceeded: v > r.velocityMps + 1e-9, manual: true };
  }
  const s = (r.shape === 'round' && roundSize(cmh, r, R.roundMm, hCap)) || rectSize(cmh, r, hCap);
  if (s.exceeded) msgs.push({ type: 'warning', code: 'AUTO_VELOCITY', text: `${d.displayName || d.id}: 목표 속도 ${r.velocityMps} m/s를 지키는 단면이 없습니다`, ids: [d.id] });
  return s;
 };
 // mains first (the branch cap reads them), then the rest in the network order
 const ducts = (net.ducts || []).filter(d => a.ductFlow.has(d.id));
 for (const d of ducts.filter(d => typeOf(d) === 'main')) sized.set(d.id, pick(d, a.ductFlow.get(d.id)));
 const sideOf = s => s.shape === 'round' ? s.diameterMm : s.heightMm;
 for (const d of ducts.filter(d => typeOf(d) !== 'main')) {
  const cmh = a.ductFlow.get(d.id), lower = [d.fromNodeId, d.toNodeId].find(n => a.parent.get(n)?.id === d.id), above = mainAbove.get(lower === d.fromNodeId ? d.toNodeId : d.fromNodeId) ?? null;
  let s = pick(d, cmh);
  // a branch no deeper than the main it hangs from: sized again with that height as the cap
  const capS = above && sized.get(above.id), cap = capS ? sideOf(capS) : 0;
  if (cap > 0 && !s.manual && sideOf(s) > cap) { s = pick(d, cmh, cap); if (sideOf(s) > cap) msgs.push({ type: 'warning', code: 'BRANCH_HEIGHT', text: `${d.displayName || d.id}: 높이가 위 주관(${cap} mm)보다 큽니다`, ids: [d.id] }); }
  sized.set(d.id, s);
 }
 for (const d of net.ducts || []) {
  const s = sized.get(d.id); if (!s) continue;
  const r = R.types[typeOf(d)], cmh = a.ductFlow.get(d.id), area = s.shape === 'round' ? Math.PI * (s.diameterMm / 2000) ** 2 : s.widthMm * s.heightMm / 1e6;
  const h = s.shape === 'round' ? s.diameterMm : s.heightMm, w = s.shape === 'round' ? s.diameterMm : s.widthMm;
  if (s.shape === 'rect') {
   if (w < h) msgs.push({ type: 'warning', code: 'WIDTH_LT_HEIGHT', text: `${d.displayName || d.id}: 폭이 높이보다 작습니다`, ids: [d.id] });
   if (h > 0 && w / h > MAX_ASPECT) msgs.push({ type: 'warning', code: 'ASPECT', text: `${d.displayName || d.id}: 종횡비가 ${MAX_ASPECT}를 넘습니다`, ids: [d.id] });
   if (h <= 50) msgs.push({ type: 'warning', code: 'LOW_HEIGHT', text: `${d.displayName || d.id}: 높이 50 mm 이하`, ids: [d.id] });
  }
  if (typeOf(d) === 'main' && h < r.minHeightMm) msgs.push({ type: 'warning', code: 'MAIN_MIN_HEIGHT', text: `${d.displayName || d.id}: 주관 높이가 최소 ${r.minHeightMm} mm보다 작습니다`, ids: [d.id] });
  if (r.maxHeightMm > 0 && h > r.maxHeightMm) msgs.push({ type: 'warning', code: 'MAX_HEIGHT', text: `${d.displayName || d.id}: 최대 높이 ${r.maxHeightMm} mm를 넘습니다`, ids: [d.id] });
  updates.push({ id: d.id, flowCmh: cmh, shape: s.shape, widthMm: s.widthMm, heightMm: s.heightMm, diameterMm: s.diameterMm, targetVelocityMps: r.velocityMps, actualVelocityMps: velocity(cmh, area), sizeVelocityExceeded: !!s.exceeded });
 }
 if (!msgs.some(m => m.type === 'warning')) msgs.unshift({ type: 'ok', code: 'CALC_OK', text: '그래프 검증, 풍량 누적, 덕트 크기 선정 완료' });
 const rootFlows = g.roots.map(r => ({ rootId: r.id, rootName: r.name || r.id, flowCmh: a.flow.get(r.id) || 0 }));
 return { ok: true, messages: msgs, ductUpdates: updates, rootFlows, totalFlowCmh: rootFlows.reduce((t, r) => t + r.flowCmh, 0), ...base, calculationTimeMs: Date.now() - t0 };
}

// the network with the sizes written in (what PHG D's applyCalculationResult does)
function apply(net, result) {
 const by = new Map(result.ductUpdates.map(u => [u.id, u]));
 return { ...net, ducts: (net.ducts || []).map(d => by.has(d.id) ? { ...d, ...by.get(d.id) } : d) };
}

module.exports = { DEFAULTS, ROUND_MM, rules, rectSize, roundSize, frictionPaPerM, size, apply };
