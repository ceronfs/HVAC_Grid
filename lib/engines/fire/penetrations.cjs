// Ver 2.0 fire engine, ducts through fire boundaries (V2-3.9 fire): every place a deck duct or a riser crosses a
// boundary, with the II-2/9.7.3 measure (sleeve, fire damper) by the boundary class and the duct's cross-section; and
// the restricted spaces a deck duct passes without serving them (II-2/9.7.2). New code (D7); 1.x lib/solas.cjs is the
// functional reference. SOLAS values 원문 미확인 (F-2).
//   penetrations({ rooms, decks }, bounds, nets, risers) → [{ no, planKey | riserId, deckId, systemId, duct, boundaryId,
//                  grade, x, y, size, areaM2, flowCmh, code, text, sleeveMm, damper, … }]
//   passages({ rooms }, plans, nets, classes)           → [{ planKey, roomId, space, lengthM, level, rule, text }]
//   nets: { [planKey]: { deckId, systemId, kind, ducts: [{ points (BOX y), widthMm, heightMm, diameterMm, flowCmh, type, displayName }] } }
'use strict';
const PL = require('../geometry/plan.cjs'), R = require('./rate.cjs'), { LIVING } = require('./boundaries.cjs');

// where a polyline crosses a boundary segment: a vertex on the line counts once, and only when the polyline goes on to the
// other side (touching and turning back, or running along it, is no crossing)
function crossings(pts, a, b, tol = 1) {
 const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 1) return [];
 const cross = p => (p.x - a.x) * dy - (p.y - a.y) * dx, side = p => { const v = cross(p) / L; return Math.abs(v) <= tol ? 0 : Math.sign(v); };
 const along = p => ((p.x - a.x) * dx + (p.y - a.y) * dy) / (L * L), sides = pts.map(side), out = [];
 let prev = -1;
 for (let k = 0; k < pts.length; k++) {
  if (!sides[k]) continue;
  if (prev >= 0 && sides[k] !== sides[prev]) {
   let x;
   if (k === prev + 1) { const p = pts[prev], q = pts[k], sp = cross(p), sq = cross(q), t = sp / (sp - sq); x = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; }
   else x = pts[k - 1];   // the last vertex on the line, where the duct leaves it
   const u = along(x); if (u >= -tol / L && u <= 1 + tol / L) out.push(x);
  }
  prev = k;
 }
 return out;
}

// II-2/9.7.3 by the boundary class and the free cross-section (nominal size here)
function measure(grade, areaM2, sized = true) {
 const c = R.gradeClass(grade), ins = grade && grade !== 'A-0' ? ` + ${grade} 단열` : '';
 if (!grade) return { code: 'CHECK', text: '경계 범주 미정 — 실 분류 후 판정', sleeveMm: 0, damper: false };
 if (c === 'A') {
  if (!sized) return { code: 'A-SIZE', text: '덕트 크기 산정 후 판정 (A급)', sleeveMm: 0, damper: false };
  if (areaM2 > 0.075) return { code: 'A-FD', text: `강재 슬리브 3t × 900${ins} + 자동 방화댐퍼`, sleeveMm: 900, damper: true };
  if (areaM2 > 0.02) return { code: 'A-900', text: `강재 슬리브 3t × 900${ins}`, sleeveMm: 900, damper: false };
  return { code: 'A-200', text: '강재 슬리브 3t × 200', sleeveMm: 200, damper: false };
 }
 if (c === 'B') return !sized ? { code: 'B-SIZE', text: '덕트 크기 산정 후 판정 (B급)', sleeveMm: 0, damper: false }
  : areaM2 > 0.02 ? { code: 'B-900', text: '강재 슬리브 900 (그 길이가 강재 덕트면 생략)', sleeveMm: 900, damper: false } : { code: 'B-SEAL', text: '관통부 밀폐', sleeveMm: 0, damper: false };
 if (c === 'STAR') return { code: 'STAR', text: '강 또는 동등재, 관통부 밀폐', sleeveMm: 0, damper: false };
 return { code: 'NONE', text: '요건 없음', sleeveMm: 0, damper: false };
}
const ductArea = d => d.diameterMm ? Math.PI * (d.diameterMm / 1000) ** 2 / 4 : d.widthMm && d.heightMm ? d.widthMm * d.heightMm / 1e6 : 0;
const sizeText = d => d.diameterMm ? `Ø${d.diameterMm}` : d.widthMm && d.heightMm ? `${d.widthMm}×${d.heightMm}` : '미산정';
const SHAFT_SPACES = new Set(['덕트 트렁크', '환기·공조 기계실']);
const r4 = v => Math.round(v * 10000) / 10000;

function penetrations({ rooms, decks: deckList }, bounds, nets = {}, risers = []) {
 const out = [], byDeck = {}, byId = new Map(bounds.boundaries.map(b => [b.id, b]));
 for (const b of bounds.boundaries) if (b.a && b.b) (byDeck[b.deckId] = byDeck[b.deckId] || []).push(b);
 // crossings within 50 mm are one penetration where walls meet (the strictest grade) - not on two parallel walls apart
 // (a double wall, a thin room between): those stay two
 const apart = (i, j) => { const p = byId.get(i), q = byId.get(j); if (!p?.a || !q?.a) return false;
  const ux = p.b.x - p.a.x, uy = p.b.y - p.a.y, L = Math.hypot(ux, uy), vx = q.b.x - q.a.x, vy = q.b.y - q.a.y, M = Math.hypot(vx, vy); if (L < 1 || M < 1) return false;
  return Math.abs(ux * vy - uy * vx) / (L * M) < 0.02 && Math.abs((q.a.x - p.a.x) * uy - (q.a.y - p.a.y) * ux) / L > 5; };
 const add = (list, p) => {
  const same = list.find(x => Math.hypot(x.x - p.x, x.y - p.y) <= 50 && !x.boundaryIds.some(id => apart(id, p.boundaryId)));
  if (!same) list.push(p); else if (R.rank(p.grade) < R.rank(same.grade)) Object.assign(same, p, { boundaryIds: [...same.boundaryIds, ...p.boundaryIds] }); else same.boundaryIds.push(...p.boundaryIds);
 };
 for (const [key, net] of Object.entries(nets)) {
  const recs = (net.ducts || []).map((d, di) => ({ d, di, pts: d.points || [] })).filter(r => r.pts.length > 1), here = [];
  const pen = (r, b, x) => { const area = ductArea(r.d); add(here, { planKey: key, deckId: net.deckId, systemId: net.systemId, kind: net.kind, duct: r.d.displayName || r.d.id || `#${r.di + 1}`, ductType: r.d.type, boundaryId: b.id, boundaryIds: [b.id], boundaryKind: b.kind,
   roomA: b.roomA, roomB: b.roomB, grade: b.grade, x: Math.round(x.x), y: Math.round(x.y), size: sizeText(r.d), areaM2: r4(area), flowCmh: r.d.flowCmh, ...measure(b.grade, area, area > 0) }); };
  for (const b of byDeck[net.deckId] || []) {
   for (const r of recs) for (const x of crossings(r.pts, b.a, b.b)) pen(r, b, x);
   // a network split at tees and reducers: pieces that end on the wall line at one point and reach both sides of it
   // cross the wall there
   const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y, L = Math.hypot(dx, dy); if (L < 1) continue;
   const sideOf = p => { const v = ((p.x - b.a.x) * dy - (p.y - b.a.y) * dx) / L; return Math.abs(v) <= 1 ? 0 : Math.sign(v); }, along = p => ((p.x - b.a.x) * dx + (p.y - b.a.y) * dy) / (L * L);
   const ends = new Map();
   for (const r of recs) for (const [end, step] of [[0, 1], [r.pts.length - 1, -1]]) {
    const p = r.pts[end]; if (sideOf(p) !== 0 || along(p) < -1 / L || along(p) > 1 + 1 / L) continue;
    let k = end; while (k >= 0 && k < r.pts.length && sideOf(r.pts[k]) === 0) k += step; if (k < 0 || k >= r.pts.length) continue;
    const id = Math.round(p.x) + ',' + Math.round(p.y), n = ends.get(id) || { p, sides: new Set(), recs: [] }; n.sides.add(sideOf(r.pts[k])); n.recs.push(r); ends.set(id, n);
   }
   for (const n of ends.values()) if (n.sides.size === 2) pen(n.recs.reduce((x, y) => ductArea(y.d) > ductArea(x.d) ? y : x), b, n.p);
  }
  out.push(...here);
 }
 // risers: the sideways run on the deck of the unit side (x first or y first, whichever crosses fewer boundaries), the
 // vertical part at the far shaft through the deck of every level between the two ends
 const roomAt = (deckId, p) => rooms.find(r => r.deckId === deckId && PL.inRoom(p, r));
 const decks = [...deckList].sort((a, b) => a.z - b.z), cls = bounds.classes, ship = bounds.settings.ship, deckName = id => deckList.find(d => d.id === id)?.name || id;
 for (const r of risers) {
  const area = r.widthMm * r.heightMm / 1e6, base = { planKey: null, riserId: r.id, systemId: r.systemId, kind: r.kind, duct: `RISER ${deckName(r.fromDeckId)}→${deckName(r.toDeckId)}`, size: `${r.widthMm}×${r.heightMm}`, areaM2: r4(area), flowCmh: r.flowCmh };
  const run = pts => { const o = []; for (const b of byDeck[r.fromDeckId] || []) for (const x of crossings(pts, b.a, b.b)) add(o, { ...base, deckId: r.fromDeckId, ductType: 'riser-offset', boundaryId: b.id, boundaryIds: [b.id], boundaryKind: b.kind, roomA: b.roomA, roomB: b.roomB, grade: b.grade, x: Math.round(x.x), y: Math.round(x.y), ...measure(b.grade, area, true) }); return o; };
  const xFirst = run([r.from, { x: r.to.x, y: r.from.y }, r.to]), yFirst = run([r.from, { x: r.from.x, y: r.to.y }, r.to]);
  out.push(...(yFirst.length < xFirst.length ? yFirst : xFirst));
  const i0 = decks.findIndex(d => d.id === r.fromDeckId), i1 = decks.findIndex(d => d.id === r.toDeckId), p = r.to;
  for (let k = Math.min(i0, i1) + 1; k <= Math.max(i0, i1); k++) {
   const lo = roomAt(decks[k - 1].id, p), hi = roomAt(decks[k].id, p), b = bounds.boundaries.find(x => x.kind === 'deck' && x.roomA === lo?.id && x.roomB === hi?.id);
   let grade = b?.grade ?? null, extra = {};
   if (!b && lo && hi) grade = R.rate(ship, 'D', cls[lo.id], cls[hi.id], bounds.settings, cls[lo.id].space === cls[hi.id].space).grade;
   if (!lo || !hi) extra = { text: '수직 덕트 위치 위·아래에 실이 없음 — 샤프트 위치 확인', code: 'CHECK' };
   const notShaft = [lo, hi].filter(Boolean).filter(x => !SHAFT_SPACES.has(cls[x.id]?.space));
   out.push({ ...base, deckId: decks[k].id, ductType: 'riser', boundaryId: b?.id || null, boundaryIds: b ? [b.id] : [], boundaryKind: 'deck', roomA: lo?.id || null, roomB: hi?.id || null, grade, x: Math.round(p.x), y: Math.round(p.y), ...measure(grade, area, true), ...extra,
    note: notShaft.length ? '샤프트·트렁크가 아닌 실을 수직 관통 — 트렁크 배치 확인' : null });
  }
 }
 out.sort((a, b) => a.systemId.localeCompare(b.systemId) || a.deckId.localeCompare(b.deckId) || a.x - b.x || a.y - b.y);
 out.forEach((p, i) => p.no = 'P-' + String(i + 1).padStart(3, '0'));
 return out;
}

const MACHINERY_A = new Set(['기관실 — A류', '보일러실']), GALLEY = new Set(['조리실', '팬트리 — 조리기구 있음 (조리실 부속)']);
const RESTRICTED = { '기관실 — A류': 'A류 기관구역', '보일러실': 'A류 기관구역', '조리실': '조리실', '팬트리 — 조리기구 있음 (조리실 부속)': '조리실', '소화제 저장실 (CO₂실)': 'CO₂실', '계단격실': '계단(피난로)', '축전지실': '축전지실', '페인트 로커': '페인트 로커', '가연성 액체 창고': '가연성 액체 창고', '램프실': '램프실' };

// rooms a deck duct passes without serving them, sampled every 100 mm; a point off every room is inside the deck (a
// space the model leaves out) when rooms lie on all four sides of it, else outside the deck outline
function passages({ rooms }, plans, nets, classes) {
 const out = [];
 for (const p of plans) {
  const ducts = nets?.[p.key]?.ducts || []; if (!ducts.length) continue;
  const served = new Set(p.rus.map(u => u.roomId)), here = rooms.filter(r => r.deckId === p.deckId), len = {}; let outside = 0, inner = 0;
  const boxes = here.map(x => PL.bounds(x.polygon)), enclosed = q => boxes.some(b => b.maxX <= q.x && b.minY <= q.y && b.maxY >= q.y) && boxes.some(b => b.minX >= q.x && b.minY <= q.y && b.maxY >= q.y)
   && boxes.some(b => b.maxY <= q.y && b.minX <= q.x && b.maxX >= q.x) && boxes.some(b => b.minY >= q.y && b.minX <= q.x && b.maxX >= q.x);
  const spaces = new Set([...served].map(id => classes[id]?.space));
  for (const d of ducts) {
   const pts = d.points || [];
   for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.min(2000, Math.max(1, Math.ceil(L / 100)));
    for (let k = 0; k < n; k++) {
     const t = (k + 0.5) / n, q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
     const r = here.find(x => PL.inRoom(q, x) && PL.wallDistance(q, x) > 60);
     if (r && !served.has(r.id) && r.id !== p.rootRoomId) len[r.id] = (len[r.id] || 0) + L / n;
     else if (!r && !here.some(x => PL.inRoom(q, x) || PL.wallDistance(q, x) <= 300)) { if (enclosed(q)) inner += L / n; else outside += L / n; }
    }
   }
  }
  const base = { planKey: p.key, deckId: p.deckId, systemId: p.systemId, kind: p.kind };
  if (inner >= 300) out.push({ ...base, roomId: null, space: '모델에 없는 공간', lengthM: Math.round(inner / 100) / 10, level: 'check', rule: '배치', unmodelled: true, text: '덕트가 Deck 안의 실 없는 곳을 지남 — 그 공간을 격실로 추가하거나 경로 확인' });
  if (outside >= 300) out.push({ ...base, roomId: null, space: '실 밖', lengthM: Math.round(outside / 100) / 10, level: 'fail', rule: '배치', outside: true, text: '덕트가 실 밖(선체 밖·개방갑판)을 지남 — 외벽 두 번 관통, 실현 불가 경로' });
  for (const [id, mm] of Object.entries(len)) {
   if (mm < 300) continue;
   const sp = classes[id]?.space, what = RESTRICTED[sp], hazard = [...spaces].some(x => GALLEY.has(x) || MACHINERY_A.has(x)), row = { ...base, roomId: id, space: sp, lengthM: Math.round(mm / 100) / 10 };
   if (what && !spaces.has(sp)) out.push({ ...row, level: what === '계단(피난로)' ? 'check' : 'fail', rule: 'II-2/9.7.2', text: `${what}을(를) 통과 — ${what === '계단(피난로)' ? '피난로에 덕트, 피하는 것이 원칙' : '원칙적으로 금지(조건부 예외: 강판 덕트·A-60 단열·경계 근처 자동 방화댐퍼)'}` });
   else if (hazard && LIVING.test(sp || '')) out.push({ ...row, level: 'check', rule: 'II-2/9.7.2 · 9.7.5', text: `${[...spaces].some(x => GALLEY.has(x)) ? '조리실' : 'A류 기관구역'} 덕트가 거주·업무구역 통과 — 해당 구간 A급 구조·방화댐퍼 조건 확인` });
  }
 }
 return out;
}

module.exports = { crossings, measure, ductArea, penetrations, passages, GALLEY, MACHINERY_A, RESTRICTED };
