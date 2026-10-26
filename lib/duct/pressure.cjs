// Ver 2.0 duct engine - pressure (V2-1.6, docs/v2/STUDY_PHG.md 3.5). Written anew from the functional specification of
// PHG D's path pressure (D7). A sized network { nodes, ducts, diffusers } (lib/duct/size.cjs) and the root's
// pressureFlowMode ('supply': diverging fittings, 'exhaust': converging - 1.0 gives exhaust and return networks
// 'exhaust'). For every RU: the path from the root, duct friction, elbows, junctions, RU loss; the index path is the
// largest total (1.0 indexPa, then lib/risers.cjs).
// Fitting tables: the values PHG D uses (DECISIONS D14), named after ASHRAE fittings CR3-1, CR3-3, SR5-13, ER5-3 -
// 원문 미확인 (F-2: the ASHRAE Duct Fitting Database is not at hand; to be checked before V2-1 is done).
'use strict';

const DEFAULTS = { airDensityKgM3: 1.2, dynamicViscosityPaS: 1.81e-5, roughnessMm: 0.09, fittingMethod: 'ashrae_auto', elbowRadiusRatio: 1, elbowK: 0.25, branchK: 0.4, terminalDamperK: 0.5, applyTerminalDamperToAllRu: false, additionalFixedLossPa: 0 };
const RU_LOSS_PA = 10;          // RU (mesh / grille) own loss - PHG D's rough value for its default RU type
const ELBOW_MIN_DEG = 15, STRAIGHT_MAX_DEG = 22.5;

// --- tables (원문 미확인) ---
// elbow angle factor Kθ
const K_THETA = { deg: [0, 20, 30, 45, 60, 75, 90, 110, 130, 150, 180], k: [0, 0.31, 0.45, 0.6, 0.78, 0.9, 1, 1.13, 1.2, 1.28, 1.4] };
// CR3-1 rectangular smooth-radius elbow without vanes: Co by r/W (rows) and H/W (columns), Reynolds factor by r/W
const CR3_1 = { rW: [0.5, 0.75, 1, 1.5, 2], hW: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8],
 co: [[1.53, 1.38, 1.29, 1.18, 1.06, 1, 1, 1.06, 1.12, 1.16, 1.18], [0.57, 0.52, 0.48, 0.44, 0.4, 0.39, 0.39, 0.4, 0.42, 0.43, 0.44], [0.27, 0.25, 0.23, 0.21, 0.19, 0.18, 0.18, 0.19, 0.2, 0.21, 0.21],
  [0.22, 0.2, 0.19, 0.17, 0.15, 0.14, 0.14, 0.15, 0.16, 0.17, 0.17], [0.2, 0.18, 0.16, 0.15, 0.14, 0.13, 0.13, 0.14, 0.14, 0.15, 0.15]],
 re: [1e4, 2e4, 3e4, 4e4, 6e4, 8e4, 1e5, 1.4e5, 2e5], kReHalf: [1.4, 1.26, 1.19, 1.14, 1.09, 1.06, 1.04, 1, 1], kRe: [2, 1.77, 1.64, 1.56, 1.46, 1.38, 1.3, 1.15, 1] };
// CR3-3 rectangular smooth-radius elbow with one splitter vane: Co by r/W (rows) and H/W (columns)
const CR3_3 = { rW: [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1], hW: [0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8],
 co: [[0.52, 0.4, 0.43, 0.49, 0.55, 0.66, 0.75, 0.84, 0.93, 1.01, 1.09], [0.36, 0.27, 0.25, 0.28, 0.3, 0.35, 0.39, 0.42, 0.46, 0.49, 0.52], [0.28, 0.21, 0.18, 0.19, 0.2, 0.22, 0.25, 0.26, 0.28, 0.3, 0.32],
  [0.22, 0.16, 0.14, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.21], [0.18, 0.13, 0.11, 0.11, 0.11, 0.12, 0.13, 0.14, 0.14, 0.15, 0.15], [0.15, 0.11, 0.09, 0.09, 0.09, 0.09, 0.1, 0.1, 0.11, 0.11, 0.12],
  [0.13, 0.09, 0.08, 0.07, 0.07, 0.08, 0.08, 0.08, 0.08, 0.09, 0.09], [0.11, 0.08, 0.07, 0.06, 0.06, 0.06, 0.06, 0.07, 0.07, 0.07, 0.07], [0.1, 0.07, 0.06, 0.05, 0.05, 0.05, 0.05, 0.05, 0.06, 0.06, 0.06],
  [0.09, 0.06, 0.05, 0.05, 0.04, 0.04, 0.04, 0.05, 0.05, 0.05, 0.05]] };
// SR5-13 rectangular diverging tee (supply): branch Cb by Ab/Ac (rows) and Qb/Qc (columns); main Cs by As/Ac (rows) and
// Qs/Qc (columns, only up to the row's own As/Ac)
const R9 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const SR5_13 = { cb: [[0.73, 0.34, 0.32, 0.34, 0.35, 0.37, 0.38, 0.39, 0.4], [3.1, 0.73, 0.41, 0.34, 0.32, 0.32, 0.33, 0.34, 0.35], [7.59, 1.65, 0.73, 0.47, 0.37, 0.34, 0.32, 0.32, 0.32],
  [14.2, 3.1, 1.28, 0.73, 0.51, 0.41, 0.36, 0.34, 0.32], [22.92, 5.08, 2.07, 1.12, 0.73, 0.54, 0.44, 0.38, 0.35], [33.76, 7.59, 3.1, 1.65, 1.03, 0.73, 0.56, 0.47, 0.41],
  [46.71, 10.63, 4.36, 2.31, 1.42, 0.98, 0.73, 0.58, 0.49], [61.79, 14.2, 5.86, 3.1, 1.9, 1.28, 0.94, 0.73, 0.6], [78.98, 18.29, 7.59, 4.02, 2.46, 1.65, 1.19, 0.91, 0.73]],
 cs: [[0.04], [0.98, 0.04], [3.48, 0.31, 0.04], [7.55, 0.98, 0.18, 0.04], [13.18, 2.03, 0.49, 0.13, 0.04], [20.38, 3.48, 0.98, 0.31, 0.1, 0.04], [29.15, 5.32, 1.64, 0.6, 0.23, 0.09, 0.04],
  [39.48, 7.55, 2.47, 0.98, 0.42, 0.18, 0.08, 0.04], [51.37, 10.17, 3.48, 1.46, 0.67, 0.31, 0.15, 0.07, 0.04]] };
// ER5-3 rectangular converging tee (exhaust, return): rows by geometry (Ab/As, Ab/Ac), the nearest row taken; Cc,b and
// Cc,s by flow ratio (0.1 - 0.9)
const ER5_3 = [{ abAs: 0.33, abAc: 0.25, branch: [-1.2, -0.4, 0.4, 1.6, 3, 4.8, 6.8, 8.9, 11], main: [0.3, 0.3, 0.2, -0.1, -0.45, -0.92, -1.5, -2, -2.6] },
 { abAs: 0.5, abAc: 0.5, branch: [-0.5, -0.2, 0, 0.25, 0.45, 0.7, 1, 1.5, 2], main: [0.17, 0.16, 0.1, 0, -0.08, -0.18, -0.27, -0.37, -0.46] },
 { abAs: 0.67, abAc: 0.5, branch: [-1, -0.6, -0.2, 0.1, 0.3, 0.6, 1, 1.5, 2], main: [0.27, 0.35, 0.32, 0.25, 0.12, -0.03, -0.23, -0.42, -0.58] },
 { abAs: 1, abAc: 0.5, branch: [-2.2, -1.5, -0.95, -0.5, 0, 0.4, 0.8, 1.3, 1.9], main: [1.2, 1.1, 0.9, 0.65, 0.35, 0, -0.4, -0.8, -1.3] },
 { abAs: 1, abAc: 1, branch: [-0.6, -0.3, -0.1, -0.04, 0.13, 0.21, 0.29, 0.36, 0.42], main: [0.18, 0.24, 0.27, 0.26, 0.23, 0.18, 0.1, 0, -0.12] },
 { abAs: 1.33, abAc: 1, branch: [-1.2, -0.8, -0.4, -0.2, 0, 0.16, 0.24, 0.32, 0.38], main: [0.75, 0.36, 0.38, 0.35, 0.27, 0.18, 0.05, -0.08, -0.22] },
 { abAs: 2, abAc: 1, branch: [-2.1, -1.4, -0.9, -0.5, -0.2, 0, 0.2, 0.25, 0.3], main: [0.8, 0.87, 0.8, 0.68, 0.55, 0.4, 0.25, 0.08, -0.1] }];

// --- interpolation ---
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function bracket(xs, x) { const v = clamp(x, xs[0], xs[xs.length - 1]); let i = 0; while (i < xs.length - 2 && v > xs[i + 1]) i++; const t = xs[i + 1] === xs[i] ? 0 : (v - xs[i]) / (xs[i + 1] - xs[i]); return [i, Math.min(i + 1, xs.length - 1), t]; }
function lin(xs, ys, x) { if (ys.length === 1) return ys[0]; const [i, j, t] = bracket(xs.slice(0, ys.length), x); return ys[i] + (ys[j] - ys[i]) * t; }
function bilin(rows, cols, T, r, c) { const [i, j, t] = bracket(rows, r), a = lin(cols, T[i], c), b = lin(cols, T[j], c); return a + (b - a) * t; }

// --- sections ---
function section(d, air) {
 const round = d.shape === 'round', w = +d.widthMm || 0, h = +d.heightMm || 0, dia = +d.diameterMm || 0;
 const area = round ? Math.PI * (dia / 2000) ** 2 : w * h / 1e6, dh = round ? dia / 1000 : w + h > 0 ? 2 * w * h / (w + h) / 1000 : 0;
 const v = area > 0 ? (+d.flowCmh || 0) / 3600 / area : 0, re = dh > 0 ? v * dh * air.airDensityKgM3 / air.dynamicViscosityPaS : 0;
 return { round, widthMm: w, heightMm: h, diameterMm: dia, area, dh, v, re, pv: air.airDensityKgM3 * v * v / 2 };
}
// Darcy friction factor: laminar 64/Re, else Haaland
function frictionFactor(re, dh, roughnessMm) { if (!(re > 0 && dh > 0)) return 0; if (re < 2300) return 64 / re; const e = roughnessMm / 1000 / dh; return 1 / (-1.8 * Math.log10((e / 3.7) ** 1.11 + 6.9 / re)) ** 2; }
const lengthM = d => (d.points || []).slice(1).reduce((t, q, i) => t + Math.hypot(q.x - d.points[i].x, q.y - d.points[i].y), 0) / 1000;
const angleDeg = (a, b) => { const c = (a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) || 1); return Math.acos(clamp(c, -1, 1)) * 180 / Math.PI; };

// an elbow turning θ in a duct of this section: rectangular W ≤ 200 mm CR3-1, wider CR3-3 (one vane), centre radius
// r = 100 mm + W/2 (PHG D's rule); round sections are not in 1.0 networks - manual K for them until the round tables
function elbowK(s, theta, set) {
 const kt = lin(K_THETA.deg, K_THETA.k, theta);
 if (set.fittingMethod === 'manual_k' || s.round) return { k: set.elbowK * kt, basis: `Manual elbow K × Kθ θ=${theta.toFixed(0)}°` };
 const W = s.widthMm, H = s.heightMm, r = 100 + W / 2, rW = r / W, hW = H / W;
 if (W <= 200) {
  const co = bilin(CR3_1.rW, CR3_1.hW, CR3_1.co, rW, hW), kre = lin(CR3_1.re, rW < 0.75 ? CR3_1.kReHalf : CR3_1.kRe, s.re);
  return { k: co * kt * kre, basis: `ASHRAE CR3-1 (원문 미확인) W=${W} mm · r/W=${rW.toFixed(4)} · H/W=${hW.toFixed(4)} · Co90=${co.toFixed(4)} × Kθ × KRe` };
 }
 const co = bilin(CR3_3.rW, CR3_3.hW, CR3_3.co, rW, hW);
 return { k: co * kt, basis: `ASHRAE CR3-3 (원문 미확인) W=${W} mm · r/W=${rW.toFixed(4)} · H/W=${hW.toFixed(4)} · Co90=${co.toFixed(4)} × Kθ` };
}

// the loss of the duct `out` leaving (supply) or entering (exhaust) a junction whose common duct is `common`; `other`:
// the other ducts at that node with their sections
function junction(mode, set, common, out, isStraight, others) {
 const sc = common.s, so = out.s;
 const ratios = { area: sc.area > 0 ? so.area / sc.area : 0, flow: (+common.d.flowCmh || 0) > 0 ? (+out.d.flowCmh || 0) / (+common.d.flowCmh || 1) : 0, velocity: sc.v > 0 ? so.v / sc.v : 0 };
 if (set.fittingMethod === 'manual_k' || sc.round || so.round) return { k: Math.max(0, set.branchK), pv: sc.pv, ratios, basis: 'Manual junction K × common-duct velocity pressure', clamped: false };
 if (mode !== 'exhaust') {
  const a = clamp(ratios.area, 0.1, 0.9), q = clamp(ratios.flow, 0.1, 0.9);
  if (!isStraight) return { k: Math.max(0, bilin(R9, R9, SR5_13.cb, a, q)), pv: so.pv, ratios, basis: `ASHRAE SR5-13 Cb (원문 미확인) · Ab/Ac=${ratios.area.toFixed(3)} · Qb/Qc=${ratios.flow.toFixed(3)} · Pvb`, clamped: a !== ratios.area || q !== ratios.flow };
  // the straight main: its row only reaches up to its own area ratio
  const o = Math.min(q, a), [i, j, t] = bracket(R9, a), ri = lin(R9, SR5_13.cs[i], o), rj = lin(R9, SR5_13.cs[j], o);
  return { k: Math.max(0, ri + (rj - ri) * t), pv: so.pv, ratios, basis: `ASHRAE SR5-13 Cs (원문 미확인) · As/Ac=${ratios.area.toFixed(3)} · Qs/Qc=${ratios.flow.toFixed(3)} · Pvs`, clamped: a !== ratios.area || q !== ratios.flow || o !== q };
 }
 // converging: the inlet on the path and its companion - the other inlet with the most flow. A branch inlet is Ab with
 // the companion as As; a straight inlet is As with the companion as Ab. The geometry row is the nearest (Ab/As, Ab/Ac)
 const comp = others.slice().sort((x, y) => (+y.d.flowCmh || 0) - (+x.d.flowCmh || 0))[0] || null, qc = +common.d.flowCmh || 0, qo = +out.d.flowCmh || 0;
 const compA = Math.max(1e-12, comp?.s.area || Math.max(sc.area - so.area, so.area)), compQ = Math.max(0, comp ? (+comp.d.flowCmh || 0) : qc - qo);
 const ab = isStraight ? compA : so.area, as = isStraight ? so.area : compA, qb = isStraight ? compQ : qo, qs = isStraight ? qo : compQ;
 const abAs = as > 0 ? ab / as : 0, abAc = sc.area > 0 ? ab / sc.area : 0;
 let row = ER5_3[0], best = Infinity; for (const g of ER5_3) { const dd = Math.hypot((abAs - g.abAs) / 2, abAc - g.abAc); if (dd < best) { best = dd; row = g; } }
 if (!isStraight) { const x = qc > 0 ? qb / qc : 0; return { k: lin(R9, row.branch, x), pv: sc.pv, ratios, basis: `ASHRAE ER5-3 Cc,b (원문 미확인) · Ab/As≈${row.abAs} · Ab/Ac≈${row.abAc} · Qb/Qc=${x.toFixed(3)} · Pvc · nearest geometry row`, clamped: false }; }
 const x = qs > 0 ? qb / qs : 0;
 return { k: lin(R9, row.main, x), pv: sc.pv, ratios, basis: `ASHRAE ER5-3 Cc,s (원문 미확인) · Ab/As≈${row.abAs} · Ab/Ac≈${row.abAc} · Qb/Qs=${x.toFixed(3)} · Pvc · nearest geometry row`, clamped: false };
}

const r = (v, n) => { const f = 10 ** n; return Math.round(v * f) / f; };

function pressure(net, settings = {}) {
 const set = { ...DEFAULTS, ...settings }, warnings = [];
 const nodes = new Map((net.nodes || []).map(n => [n.id, n])), ducts = (net.ducts || []).filter(d => nodes.has(d.fromNodeId) && nodes.has(d.toNodeId));
 const at = new Map([...nodes.keys()].map(k => [k, []])); for (const d of ducts) { at.get(d.fromNodeId).push(d); at.get(d.toNodeId).push(d); }
 const sec = new Map(ducts.map(d => [d.id, section(d, set)]));
 // the direction of a duct leaving node n (its first segment from n)
 const dirFrom = (d, n) => { const p = d.points || [], [a, b] = d.fromNodeId === n ? [p[0], p[1]] : [p[p.length - 1], p[p.length - 2]]; return a && b ? { x: b.x - a.x, y: b.y - a.y } : { x: 0, y: 0 }; };
 const paths = [], roots = [];
 for (const root of [...nodes.values()].filter(n => n.type === 'root')) {
  const mode = root.pressureFlowMode === 'exhaust' ? 'exhaust' : 'supply';
  // the tree from the root (1.0 networks are trees; the shortest path by length otherwise)
  const up = new Map([[root.id, null]]), order = [root.id];
  for (let i = 0; i < order.length; i++) for (const d of at.get(order[i])) { const o = d.fromNodeId === order[i] ? d.toNodeId : d.fromNodeId; if (!up.has(o)) { up.set(o, d); order.push(o); } }
  const rus = (net.diffusers || []).filter(u => up.has(u.connectedNodeId));
  for (const u of rus) {
   const chain = []; let n = u.connectedNodeId; while (up.get(n)) { const d = up.get(n), from = d.fromNodeId === n ? d.toNodeId : d.fromNodeId; chain.unshift({ d, from, to: n }); n = from; }
   const details = [];
   for (const [i, c] of chain.entries()) {
    const s = sec.get(c.d.id), L = lengthM(c.d), f = frictionFactor(s.re, s.dh, set.roughnessMm), fr = s.dh > 0 ? f * L / s.dh * s.pv : 0;
    const det = { ductId: c.d.id, ductName: c.d.displayName || c.d.id, lengthM: r(L, 3), flowCmh: +c.d.flowCmh || 0, velocityMps: r(s.v, 3), hydraulicDiameterM: r(s.dh, 4), reynolds: Math.round(s.re), frictionFactor: r(f, 5), frictionLossPa: r(fr, 2),
     bendCount: 0, elbowCoefficientSum: 0, bendLossPa: 0, branchCoefficient: 0, branchAngleDeg: 0, branchVelocityRatio: 0, branchAreaRatio: 0, branchFlowRatio: 0, branchLossPa: 0, fittingBasis: '', _f: fr, _e: 0, _b: 0 };
    const basis = [];
    // bends inside the duct
    const p = c.d.points || []; for (let k = 1; k < p.length - 1; k++) { const th = angleDeg({ x: p[k].x - p[k - 1].x, y: p[k].y - p[k - 1].y }, { x: p[k + 1].x - p[k].x, y: p[k + 1].y - p[k].y }); if (th >= ELBOW_MIN_DEG) { const e = elbowK(s, th, set); det.bendCount++; det.elbowCoefficientSum += e.k; det._e += e.k * s.pv; basis.push(e.basis); } }
    if (i > 0) {
     const prev = chain[i - 1], deg = at.get(c.from).length, inDir = dirFrom(prev.d, c.from), outDir = dirFrom(c.d, c.from), th = angleDeg({ x: -inDir.x, y: -inDir.y }, outDir);
     if (deg === 2 && th >= ELBOW_MIN_DEG) { const e = elbowK(s, th, set); det.bendCount++; det.elbowCoefficientSum += e.k; det._e += e.k * s.pv; basis.push(e.basis + ` · node elbow θ=${th.toFixed(0)}° · downstream velocity pressure`); }
     else if (deg >= 3) {
      const common = { d: prev.d, s: sec.get(prev.d.id) }, straight = th <= STRAIGHT_MAX_DEG;
      const others = at.get(c.from).filter(x => x.id !== c.d.id && x.id !== prev.d.id).map(x => ({ d: x, s: sec.get(x.id), straight: angleDeg({ x: -inDir.x, y: -inDir.y }, dirFrom(x, c.from)) <= STRAIGHT_MAX_DEG }));
      const j = junction(mode, set, common, { d: c.d, s }, straight, others);
      Object.assign(det, { branchCoefficient: r(j.k, 4), branchAngleDeg: r(th, 1), branchVelocityRatio: r(j.ratios.velocity, 4), branchAreaRatio: r(j.ratios.area, 4), branchFlowRatio: r(j.ratios.flow, 4) }); det._b = j.k * j.pv;
      if (Math.abs(j.k) > 1e-12) basis.push(j.basis + (j.clamped ? ' · table boundary clamp' : ''));
      if (j.clamped) { const w = `${det.ductName}: 피팅 표 범위를 벗어나 경계값으로 계산 (원문 미확인 표)`; if (!warnings.includes(w)) warnings.push(w); }
     }
    }
    det.elbowCoefficientSum = r(det.elbowCoefficientSum, 4); det.bendLossPa = r(det._e, 2); det.branchLossPa = r(det._b, 2); det.fittingBasis = basis.join(' | ');
    details.push(det);
   }
   const sum = k => details.reduce((t, d) => t + d[k], 0), damper = set.applyTerminalDamperToAllRu && chain.length ? set.terminalDamperK * sec.get(chain.at(-1).d.id).pv : 0;
   const total = sum('_f') + sum('_e') + sum('_b') + damper + (+set.additionalFixedLossPa || 0) + RU_LOSS_PA;
   paths.push({ rootId: root.id, rootName: root.name || root.id, diffuserId: u.id, diffuserName: u.displayName || u.id, flowCmh: +u.flowCmh || 0, pathDuctIds: chain.map(c => c.d.id), pathLengthM: r(chain.reduce((t, c) => t + lengthM(c.d), 0), 3),
    ductFrictionLossPa: r(sum('_f'), 1), elbowLossPa: r(sum('_e'), 1), elbowCoefficientSum: r(sum('elbowCoefficientSum'), 4), branchLossPa: r(sum('_b'), 1), branchCoefficientSum: r(details.reduce((t, d) => t + d.branchCoefficient, 0), 4),
    terminalDamperLossPa: r(damper, 1), pressureFlowMode: mode, additionalFixedLossPa: +set.additionalFixedLossPa || 0, ruPressureLossPa: RU_LOSS_PA, totalPressureLossPa: r(total, 1), maxVelocityMps: r(Math.max(0, ...details.map(d => d.velocityMps)), 3),
    fittingMethod: set.fittingMethod, details: details.map(({ _f, _e, _b, ...d }) => d) });
  }
  const mine = paths.filter(p => p.rootId === root.id), crit = mine.reduce((a, b) => !a || b.totalPressureLossPa > a.totalPressureLossPa ? b : a, null);
  roots.push({ rootId: root.id, rootName: root.name || root.id, criticalDiffuserId: crit?.diffuserId || null, criticalPressureLossPa: crit?.totalPressureLossPa ?? null, pressureFlowMode: mode });
 }
 const indexPa = paths.length ? Math.round(Math.max(...paths.map(p => p.totalPressureLossPa))) : null;
 return { mode: 'path', settings: set, paths, roots, warnings, indexPa };
}

module.exports = { DEFAULTS, RU_LOSS_PA, tables: { K_THETA, CR3_1, CR3_3, SR5_13, ER5_3 }, lin, bilin, section, frictionFactor, elbowK, pressure };
