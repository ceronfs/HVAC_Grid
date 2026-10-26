// Ver 2.0 systems engine, the plans (V2-3.9 systems): for every system and deck it serves, the duct engine's plan - the
// unit deck, the Root (unit or shaft point), the RUs of the served rooms with their airflow, the restricted rooms AUTO
// keeps out of and the outside of the deck. New code (D7); 1.0 lib/phg-plan.cjs is the functional reference. 2.0 sends
// the duct engine the rooms themselves, so the plan carries no deck DXF (1.0 made one for PHG D).
//   plans({ rooms, decks, airflow, systems, classes, unitDecks, roots, ruMoves }, { maxRuCmh, gridMm, kinds }) → [plan]
//   plan: { key: deck__systemKey, deckId, systemId, systemKey, kind, flowMode, outside, unitDeckId, unitDeckSource,
//           isUnitDeck, decks, rootRoomId, root, rootSource, rus: [{ id, roomId, roomNo, systemId, use, x, y, flowCmh, moved? }],
//           avoid: [{ roomId, no, name, space, polygon, zone }], rooms: [roomId], designCmh }
// Airflow F-1: the RUs carry the room's one (summer) airflow.
'use strict';
const PL = require('../geometry/plan.cjs'), NAMES = require('./names.json');

const KINDS = ['supply', 'exhaust', 'return'], FIELD = { supply: 'supplyCmh', exhaust: 'exhaustCmh', return: 'returnCmh' };
const re = ([s, f]) => new RegExp(s, f);
const FAN = re(NAMES.fanRoom), SHAFT = re(NAMES.shaftRoom), GALLEY_NAME = re(NAMES.galleyName), SEALED_SPACE = re(NAMES.sealedSpace), AVOID = new Set(NAMES.avoidSpaces);
const CORRIDOR = re(require('../airflow/names.json').corridor);
const isCorridor = r => r.isoClass === 'ALLEY_SOUND' || r.isoClass === 'ALLEY_NON_SOUND' || CORRIDOR.test(r.name || '');
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

// a system name used by two kinds (one name for a supply and an exhaust) gets the kind in its key
function systemKeys(systems) { const n = {}; for (const s of systems) n[s.id] = (n[s.id] || 0) + 1; return s => n[s.id] > 1 ? `${s.id}~${s.kind}` : s.id; }

// RUs of a room: one per maxRuCmh, along the longer side of a rectangle-like room, else spread over it; the flows add
// up to the room airflow in 10 CMH steps
function roomRus(room, flowCmh, opt) {
 const n = Math.max(1, Math.ceil(flowCmh / opt.maxRuCmh)), b = PL.bounds(room.polygon), wide = b.maxX - b.minX >= b.maxY - b.minY;
 let pts = n === 1 ? [PL.innerPoint(room)] : Array.from({ length: n }, (_, i) => wide ? { x: b.minX + (b.maxX - b.minX) * (i + 0.5) / n, y: (b.minY + b.maxY) / 2 } : { x: (b.minX + b.maxX) / 2, y: b.minY + (b.maxY - b.minY) * (i + 0.5) / n });
 if (pts.some(p => !PL.inRoom(p, room))) pts = spread(room, n);
 const base = Math.floor(flowCmh / n / 10) * 10; let rest = flowCmh - base * n;
 const out = pts.map((p, i) => { const extra = rest >= 10 ? 10 : i === 0 ? rest : 0; rest -= extra; return { x: PL.snap(p.x, opt.gridMm), y: PL.snap(p.y, opt.gridMm), flowCmh: base + extra }; });
 if (rest > 0) out[0].flowCmh += rest;
 return out;
}
// n points over a room, each the grid point farthest from those chosen (and from `away`); the first is the room's inner
// point unless there is something to keep away from
function spread(room, n, away = []) {
 const grid = PL.grid(room, 200, 300), out = [];
 if (!grid.length) return Array.from({ length: n }, () => PL.innerPoint(room));
 const far = p => Math.min(...[...out, ...away].map(q => Math.hypot(q.x - p.x, q.y - p.y)));
 const farthest = () => grid.reduce((a, p) => far(p) > far(a) ? p : a);
 out.push(away.length ? farthest() : PL.innerPoint(room));
 while (out.length < n) out.push(farthest());
 return out;
}

// the outside of a deck (round and between its rooms) as rectangles - forbidden zones of AUTO. A raster of the rooms
// (100 mm, coarser for a big deck), closed by half of `gapMm` so wall gaps count as inside, rows of outside cells merged
// into rectangles, and a frame of `frameMm` on the rooms' extent. Kept for the last 32 deck outlines.
const outsideMemo = new Map();
function outside(rooms, cellMm = 100, frameMm = 10000, gapMm = 600) {
 if (!rooms.length) return [];
 const key = JSON.stringify([cellMm, frameMm, gapMm, rooms.map(r => [r.polygon, r.holes || []])]);
 if (!outsideMemo.has(key)) { outsideMemo.set(key, outsideRaster(rooms, cellMm, frameMm, gapMm)); if (outsideMemo.size > 32) outsideMemo.delete(outsideMemo.keys().next().value); }
 return outsideMemo.get(key);
}
function outsideRaster(rooms, cell, frame, gap) {
 const b = PL.bounds(rooms.flatMap(r => r.polygon));
 cell = Math.max(cell, Math.ceil(Math.sqrt((b.maxX - b.minX) * (b.maxY - b.minY) / 400000) / 100) * 100);
 const x0 = Math.floor(b.minX / cell) * cell, y0 = Math.floor(b.minY / cell) * cell, nx = Math.ceil((b.maxX - x0) / cell), ny = Math.ceil((b.maxY - y0) / cell), k = Math.max(1, Math.round(gap / 2 / cell));
 let g = new Uint8Array(nx * ny);
 for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = rooms.some(r => PL.inRoom({ x: x0 + (i + 0.5) * cell, y: y0 + (j + 0.5) * cell }, r)) ? 1 : 0;
 // one pass along x or y: grow (a cell is in when one within k is in; off the raster is out) or shrink (a cell stays in
 // while every cell within k on the raster is in)
 const pass = (src, dx, dy, grow) => {
  const o = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
   let v = grow ? 0 : 1;
   for (let d = -k; d <= k; d++) { const ii = i + d * dx, jj = j + d * dy, on = ii >= 0 && jj >= 0 && ii < nx && jj < ny, c = on ? src[jj * nx + ii] : 0; if (grow && c) { v = 1; break; } if (!grow && on && !c) { v = 0; break; } }
   o[j * nx + i] = v;
  }
  return o;
 };
 g = pass(pass(pass(pass(g, 1, 0, true), 0, 1, true), 1, 0, false), 0, 1, false);
 const rects = [], open = new Map();   // run "start:end" of outside cells → the row it started on
 for (let j = 0; j <= ny; j++) {
  const runs = [];
  if (j < ny) { let s = -1; for (let i = 0; i <= nx; i++) { const out = i < nx && !g[j * nx + i]; if (out && s < 0) s = i; if (!out && s >= 0) { runs.push(`${s}:${i}`); s = -1; } } }
  for (const [run, from] of open) if (!runs.includes(run)) { const [s, e] = run.split(':').map(Number); rects.push([x0 + s * cell, y0 + from * cell, x0 + e * cell, y0 + j * cell]); open.delete(run); }
  for (const run of runs) if (!open.has(run)) open.set(run, j);
 }
 const X1 = x0 + nx * cell, Y1 = y0 + ny * cell;
 rects.push([x0 - frame, y0 - frame, X1 + frame, y0], [x0 - frame, Y1, X1 + frame, Y1 + frame], [x0 - frame, y0, x0, Y1], [X1, y0, X1 + frame, Y1]);
 return rects.map(([a, c, d, e]) => [{ x: a, y: c }, { x: d, y: c }, { x: d, y: e }, { x: a, y: e }]);
}

function plans(m, options = {}) {
 const opt = { maxRuCmh: 500, gridMm: 100, kinds: KINDS, ...options }, out = [], keyOf = systemKeys(m.systems), classes = m.classes || {};
 const z = id => m.decks.find(d => d.id === id)?.z || 0, flowOf = (r, kind) => m.airflow[r.id]?.[FIELD[kind]] || 0;
 const servedBy = (r, sys) => m.assign[r.id]?.[sys.kind] === sys.id;
 // RU ids name the room by its number, by its id when two rooms share the number
 const seen = new Set(), dup = new Set(); for (const r of m.rooms) if (r.no) { if (seen.has(r.no)) dup.add(r.no); seen.add(r.no); }
 const earlier = {}, starts = {}, outsides = {};   // RU points of earlier plans per room, Roots per deck, outside per deck
 for (const sys of m.systems.filter(s => opt.kinds.includes(s.kind)).sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind))) {
  const key0 = keyOf(sys), carries = d => m.rooms.some(r => r.deckId === d && servedBy(r, sys) && flowOf(r, sys.kind) > 0);
  const decks = sys.deckIds.filter(carries).sort((a, b) => z(a) - z(b));
  if (!decks.length) continue;
  // the unit's deck: the user's choice, else the deck with a fan room that moves the most air (lower deck on a tie),
  // else the deck with the most air
  let unit; const set = m.unitDecks?.[key0];
  if (set && decks.includes(set)) unit = { deckId: set, source: 'user' };
  else {
   const air = d => m.rooms.filter(r => r.deckId === d && servedBy(r, sys)).reduce((t, r) => t + flowOf(r, sys.kind), 0);
   const byAir = [...decks].sort((a, b) => air(b) - air(a) || z(a) - z(b)), fan = byAir.find(d => m.rooms.some(r => r.deckId === d && FAN.test(r.name)));
   unit = fan ? { deckId: fan, source: 'fan-room' } : { deckId: byAir[0], source: 'most-air' };
  }
  let unitPoint = null;
  for (const deckId of [unit.deckId, ...decks.filter(d => d !== unit.deckId)]) {
   const deckRooms = m.rooms.filter(r => r.deckId === deckId), served = deckRooms.filter(r => servedBy(r, sys) && flowOf(r, sys.kind) > 0), isUnit = deckId === unit.deckId, key = `${deckId}__${key0}`;
   const corridor = deckRooms.find(isCorridor), shaft = deckRooms.find(r => SHAFT.test(r.name));
   // the fan room for this system: a galley fan room for a galley system (and the other way round), then the nearest
   const galley = served.some(r => classes[r.id]?.space === NAMES.galleySpace), mid = served.length ? PL.centroid(served.flatMap(r => r.polygon)) : null;
   const fan = deckRooms.filter(r => FAN.test(r.name)).map(r => { const c = PL.innerPoint(r); return { r, fit: GALLEY_NAME.test(r.name) === galley ? 0 : 1, d: mid ? Math.hypot(c.x - mid.x, c.y - mid.y) : 0 }; })
    .sort((a, b) => a.fit - b.fit || a.d - b.d)[0]?.r;
   // a gas-tight room on a system of its own (CO2, batteries): the fan is on the room, the duct goes straight out
   const sealed = served.length === 1 && SEALED_SPACE.test(classes[served[0].id]?.space || '') ? served[0] : null;
   let root, rootSource; const put = m.roots?.[key];
   if (put && Number.isFinite(put.x) && Number.isFinite(put.y)) { root = { x: put.x, y: put.y }; rootSource = 'user'; }
   else if (isUnit && sealed) { const b = PL.bounds(sealed.polygon); root = { x: b.minX + 300, y: (b.minY + b.maxY) / 2 }; if (!PL.inRoom(root, sealed)) root = PL.innerPoint(sealed); rootSource = 'own-room:' + sealed.no; }
   else if (isUnit && fan) { root = PL.innerPoint(fan); rootSource = 'fan-room:' + fan.no; }
   else if (!isUnit && shaft) { root = PL.innerPoint(shaft); rootSource = 'shaft-room:' + shaft.no; }
   else if (!isUnit && unitPoint && deckRooms.some(r => PL.inRoom(unitPoint, r))) { root = { ...unitPoint }; rootSource = 'above-unit'; }
   else if (corridor) { const b = PL.bounds(corridor.polygon); root = b.maxX - b.minX >= b.maxY - b.minY ? { x: b.minX + 400, y: (b.minY + b.maxY) / 2 } : { x: (b.minX + b.maxX) / 2, y: b.minY + 400 }; rootSource = 'assumed:corridor-end:' + corridor.no; }
   else { const b = PL.bounds(deckRooms.flatMap(r => r.polygon)); root = { x: b.minX + 400, y: b.minY + 400 }; rootSource = 'assumed:deck-corner'; }
   root = { x: PL.snap(root.x, opt.gridMm), y: PL.snap(root.y, opt.gridMm) };
   // units and shafts of other systems in the same room: 600 mm apart, 200 mm off the walls
   if (rootSource !== 'user') {
    const used = starts[deckId] || [], room = deckRooms.find(r => PL.inRoom(root, r)), clear = p => used.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 600);
    if (room && !clear(root)) find: for (let k = 1; k <= 30; k++) for (const [dx, dy] of AROUND) { const q = { x: root.x + dx * k * opt.gridMm, y: root.y + dy * k * opt.gridMm }; if (PL.inRoom(q, room) && PL.wallDistance(q, room) >= 200 && clear(q)) { root = q; break find; } }
   }
   (starts[deckId] = starts[deckId] || []).push(root);
   if (isUnit) unitPoint = root;
   const rootRoom = deckRooms.find(r => PL.inRoom(root, r));
   // no two nodes on one point: an RU on the Root or on another RU goes to the nearest free grid point of its room (400 mm)
   const taken = [root], free = (p, room) => PL.inRoom(p, room) && taken.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 400);
   const settle = (p, room) => { if (free(p, room)) return p; for (let k = 1; k <= 30; k++) for (const [dx, dy] of AROUND) { const q = { x: p.x + dx * k * opt.gridMm, y: p.y + dy * k * opt.gridMm }; if (free(q, room)) return q; } return p; };
   const rus = served.flatMap(r => {
    const flow = flowOf(r, sys.kind), before = earlier[r.id] || [];
    // an exhaust or return RU in a room with RUs of earlier plans: as far from them as the room allows (no short circuit)
    const away = sys.kind !== 'supply' && before.length ? spread(r, Math.max(1, Math.ceil(flow / opt.maxRuCmh)), before).map(p => ({ x: PL.snap(p.x, opt.gridMm), y: PL.snap(p.y, opt.gridMm) })) : null;
    const placed = away ? roomRus(r, flow, opt).map((u, i) => ({ ...u, x: away[i].x, y: away[i].y })) : roomRus(r, flow, opt);
    if (sys.kind !== 'supply') taken.push(...before);
    return placed.map((p, i) => {
     const id = `${key0}/${r.no && !dup.has(r.no) ? r.no : r.id}/${i + 1}`, mv = m.ruMoves?.[id], q = mv && PL.inRoom(mv, r) ? { x: mv.x, y: mv.y } : settle(p, r);
     taken.push(q); (earlier[r.id] = earlier[r.id] || []).push(q);
     return { id, roomId: r.id, roomNo: r.no, systemId: sys.id, use: sys.kind, ...p, x: q.x, y: q.y, ...(mv && q.x === mv.x && q.y === mv.y ? { moved: true } : {}) };
    });
   });
   // rooms AUTO keeps out of: restricted spaces (II-2/9.7.2) the plan neither serves nor starts in; a galley exhaust keeps
   // out of every room but fan rooms and trunks (II-2/9.7.5). SOLAS: 원문 미확인 (F-2)
   const servedIds = new Set(served.map(r => r.id)), galleyExhaust = sys.kind === 'exhaust' && galley;
   const avoid = deckRooms.filter(r => !servedIds.has(r.id) && r !== rootRoom && (AVOID.has(classes[r.id]?.space) || (galleyExhaust && !NAMES.galleyExhaustMay.includes(classes[r.id]?.space))))
    .map(r => ({ roomId: r.id, no: r.no, name: r.name, space: classes[r.id].space, polygon: r.polygon, zone: PL.inset(r.polygon, 50) }));
   if (!outsides[deckId]) outsides[deckId] = outside(deckRooms);
   out.push({ key, deckId, systemId: sys.id, systemKey: key0, kind: sys.kind, flowMode: sys.kind === 'supply' ? 'supply' : 'exhaust', outside: outsides[deckId],
    unitDeckId: unit.deckId, unitDeckSource: unit.source, isUnitDeck: isUnit, decks: decks.length, rootRoomId: rootRoom?.id || null,
    root, rootSource, rus, avoid, rooms: deckRooms.map(r => r.id), designCmh: rus.reduce((t, u) => t + u.flowCmh, 0) });
  }
 }
 return out;
}

module.exports = { plans, roomRus, spread, outside, systemKeys, isCorridor, KINDS, FIELD };
