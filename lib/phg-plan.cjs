// Contract -> PHG D plan (pure): per deck and system (supply, exhaust, return), the room drawing (DXF text), the Root,
// the RUs with their airflow and the rooms AUTO must keep out of. A system that serves several decks has one unit on its
// unit deck and a vertical duct (shaft) to every other deck; the Root of those decks is the shaft point (lib/risers.cjs
// sizes the vertical ducts). tools/hvac-run.cjs and the shell turn a plan into PHG D projects.
'use strict';
const GE = require('./geom.cjs'), { FLOW_FIELD, KINDS, isCorridor } = require('./contract.cjs'), SO = require('./solas.cjs'), { dxfText } = require('./util.cjs');

const FAN_WORDS = /팬룸|공조기|공조실|FAN\s*ROOM|\bAHU\b|A\/C\s*ROOM|\bAC\s*ROOM|팬실/i;
const SHAFT_WORDS = /샤프트|트렁크|덕트\s*스페이스|SHAFT(?!\s*(ALLEY|TUNNEL))|TRUNK|DUCT\s*SPACE/i;
const KIND_LABEL = { supply: '급기(SA)', exhaust: '배기(EA)', return: '환기(RA)' };
// spaces a duct of another system must not pass (II-2/9.7.2): AUTO gets them as forbidden zones (PHG D 금지 영역)
const AVOID = new Set(['기관실 — A류', '보일러실', '조리실', '팬트리 — 조리기구 있음 (조리실 부속)', '소화제 저장실 (CO₂실)', '계단격실', '축전지실', '페인트 로커', '가연성 액체 창고', '램프실']);
const { inside, inRoom, centroid, bbox, area, interiorPoint, snap } = GE;

// RUs of one room: one per maxRuCmh. Rectangular rooms: spread along the longer side; L-shaped and other rooms where that
// line leaves the room: farthest-point spread over the room's grid. Flows sum to the room airflow.
function roomRus(room, flowCmh, opt) {
 const n = Math.max(1, Math.ceil(flowCmh / opt.maxRuCmh)), b = bbox(room.polygon), horizontal = b.maxX - b.minX >= b.maxY - b.minY;
 let pts = n === 1 ? [interiorPoint(room.polygon, 100, room.holes)] : Array.from({ length: n }, (_, i) => horizontal ? { x: b.minX + (b.maxX - b.minX) * (i + 0.5) / n, y: (b.minY + b.maxY) / 2 } : { x: (b.minX + b.maxX) / 2, y: b.minY + (b.maxY - b.minY) * (i + 0.5) / n });
 if (pts.some(p => !inRoom(p, room))) pts = spread(room, n);
 const base = Math.floor(flowCmh / n / 10) * 10; let rest = flowCmh - base * n;
 const out = pts.map((p, i) => { const extra = rest >= 10 ? 10 : i === 0 ? rest : 0; rest -= extra; return { x: snap(p.x, opt.gridMm), y: snap(p.y, opt.gridMm), flowCmh: base + extra }; });
 if (rest > 0) out[0].flowCmh += rest;
 return out;
}
// n points spread over a room: start at its interior point, then always the grid point farthest from the chosen ones
function spread(room, n, avoid = []) {
 const grid = GE.gridPoints(room, 200, 300), out = [];
 if (!grid.length) return Array.from({ length: n }, () => interiorPoint(room.polygon, 100, room.holes));
 const far = p => Math.min(...[...out, ...avoid].map(q => Math.hypot(q.x - p.x, q.y - p.y)));
 out.push(avoid.length ? grid.reduce((a, p) => far(p) > far(a) ? p : a) : interiorPoint(room.polygon, 100, room.holes));
 while (out.length < n) out.push(grid.reduce((a, p) => far(p) > far(a) ? p : a));
 return out;
}

// system ids can repeat across kinds in BOX (a name used as supply and as exhaust): the key then carries the kind
function systemKeys(contract) {
 const count = {}; for (const s of contract.systems) count[s.id] = (count[s.id] || 0) + 1;
 return s => count[s.id] > 1 ? `${s.id}~${s.kind}` : s.id;
}
const roomFlow = (contract, room, kind) => contract.airflow[room.id]?.[FLOW_FIELD[kind]] || 0;
const servedBy = (room, sys) => room.systems[sys.kind] === sys.id;
const elevation = (contract, d) => contract.decks.find(x => x.id === d)?.elevationMm || 0;

// the deck that holds the unit of a system: the user's choice, else the deck with a fan room that moves the most air of
// the system (lowest deck first on a tie), else the deck with the most air
function unitDeckOf(contract, sys, decks) {
 const set = (contract.unitDecks || {})[systemKeys(contract)(sys)];
 if (set && decks.includes(set)) return { deckId: set, source: 'user' };
 const flow = d => contract.rooms.filter(r => r.deckId === d && servedBy(r, sys)).reduce((t, r) => t + roomFlow(contract, r, sys.kind), 0);
 const order = [...decks].sort((a, b) => flow(b) - flow(a) || elevation(contract, a) - elevation(contract, b));
 const fan = order.find(d => contract.rooms.some(r => r.deckId === d && FAN_WORDS.test(r.name)));
 return fan ? { deckId: fan, source: 'fan-room' } : { deckId: order[0], source: 'most-air' };
}

// the outside of a deck (around and between its rooms: open deck, notches, empty holes) as rectangles, for PHG D
// forbidden zones - AUTO must not run a duct outside the accommodation. 100 mm raster, runs merged; a frame of 10 m
// around the rooms' extent.
// the raster is the slow part of planning: kept per deck outline (same rooms -> same zones), the last 32 decks
const outsideCache = new Map();
function outsideOf(rooms, cell = 100, frame = 10000, gapMm = 600) {
 if (!rooms.length) return [];
 const key = JSON.stringify([cell, frame, gapMm, rooms.map(r => [r.polygon, r.holes || []])]);
 if (outsideCache.has(key)) return outsideCache.get(key);
 const out = outsideRaster(rooms, cell, frame, gapMm);
 outsideCache.set(key, out); if (outsideCache.size > 32) outsideCache.delete(outsideCache.keys().next().value);
 return out;
}
function outsideRaster(rooms, cell, frame, gapMm) {
 const b0 = bbox(rooms.flatMap(r => r.polygon)); cell = Math.max(cell, Math.ceil(Math.sqrt((b0.maxX - b0.minX) * (b0.maxY - b0.minY) / 400000) / 100) * 100);
 const b = b0, x0 = Math.floor(b.minX / cell) * cell, y0 = Math.floor(b.minY / cell) * cell, nx = Math.ceil((b.maxX - x0) / cell), ny = Math.ceil((b.maxY - y0) / cell);
 // raster of room cells, closed (dilate then erode by half the gap): wall gaps between rooms count as inside
 const k = Math.max(1, Math.round(gapMm / 2 / cell)), at = (g, i, j) => i >= 0 && j >= 0 && i < nx && j < ny && g[j * nx + i];
 let g = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = rooms.some(r => inRoom({ x: x0 + (i + 0.5) * cell, y: y0 + (j + 0.5) * cell }, r)) ? 1 : 0;
 const pass = (src, dx, dy, any) => { const o = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let v = any ? 0 : 1; for (let d = -k; d <= k; d++) { const ii = i + d * dx, jj = j + d * dy, inGrid = ii >= 0 && jj >= 0 && ii < nx && jj < ny, x = inGrid ? src[jj * nx + ii] : 0; if (any && x) { v = 1; break; } if (!any && inGrid && !x) { v = 0; break; } } o[j * nx + i] = v; } return o; };
 g = pass(pass(pass(pass(g, 1, 0, true), 0, 1, true), 1, 0, false), 0, 1, false);
 const rects = [], open = new Map();   // runs of outside cells per row, merged with the identical run of the row below
 for (let j = 0; j <= ny; j++) {
  const runs = [];
  if (j < ny) { let s = -1; for (let i = 0; i <= nx; i++) { const out = i < nx && !at(g, i, j); if (out && s < 0) s = i; if (!out && s >= 0) { runs.push(`${s}:${i}`); s = -1; } } }
  for (const [k, v] of open) if (!runs.includes(k)) { const [s, e] = k.split(':').map(Number); rects.push([x0 + s * cell, y0 + v * cell, x0 + e * cell, y0 + j * cell]); open.delete(k); }
  for (const k of runs) if (!open.has(k)) open.set(k, j);
 }
 const X1 = x0 + nx * cell, Y1 = y0 + ny * cell;
 // the frame on the rooms' extent: a frame set off from it lets AUTO run ducts in the strip between (T3: 8 m)
 rects.push([x0 - frame, y0 - frame, X1 + frame, y0], [x0 - frame, Y1, X1 + frame, Y1 + frame], [x0 - frame, y0, x0, Y1], [X1, y0, X1 + frame, Y1]);
 return rects.map(([a, c, d, e]) => [{ x: a, y: c }, { x: d, y: c }, { x: d, y: e }, { x: a, y: e }]);
}

function plan(contract, options = {}) {
 const opt = { maxRuCmh: 500, gridMm: 100, kinds: KINDS, ...options }, plans = [], sysKey = systemKeys(contract);
 const cls = Object.fromEntries(contract.rooms.map(r => [r.id, SO.classify(r, { ...SO.DEFAULT_SETTINGS, ...(contract.solas || {}) }, contract.solas?.rooms || {})]));
 // supply RUs are planned first; exhaust / return RUs go to the far side of the room from the RUs placed before them
 const supplyPoints = {};
 // units and shafts of different systems in the same fan room / trunk get their own point (>= 600 mm apart)
 const starts = {}, outside = {};
 const systems = contract.systems.filter(s => opt.kinds.includes(s.kind)).sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
 for (const sys of systems) {
  const id = sysKey(sys);
  // decks where the system has air to move (rooms still pending carry no air yet), in elevation order
  const decks = sys.deckIds.filter(d => contract.rooms.some(r => r.deckId === d && servedBy(r, sys) && roomFlow(contract, r, sys.kind) > 0)).sort((a, b) => elevation(contract, a) - elevation(contract, b));
  if (!decks.length) continue;
  const unit = unitDeckOf(contract, sys, decks);
  let unitPoint = null;
  for (const deckId of [unit.deckId, ...decks.filter(d => d !== unit.deckId)]) {
   const deckRooms = contract.rooms.filter(r => r.deckId === deckId), served = deckRooms.filter(r => servedBy(r, sys) && roomFlow(contract, r, sys.kind) > 0);
   const key = `${deckId}__${id}`, isUnit = deckId === unit.deckId;
   const corridor = deckRooms.find(isCorridor), shaftRoom = deckRooms.find(r => SHAFT_WORDS.test(r.name));
   // the fan room of this system: one named for what it serves (a galley fan room for galley systems) first, then the
   // nearest to the rooms it serves
   const servedSpaces = new Set(served.map(r => cls[r.id]?.space)), galley = servedSpaces.has('조리실'), mid = served.length ? GE.centroid(served.flatMap(r => r.polygon)) : null;
   const fan = deckRooms.filter(r => FAN_WORDS.test(r.name)).map(r => { const c = interiorPoint(r.polygon, 100, r.holes);
    return { r, aff: /조리|갤리|GALLEY/i.test(r.name) === galley ? 0 : 1, d: mid ? Math.hypot(c.x - mid.x, c.y - mid.y) : 0 }; }).sort((a, b) => a.aff - b.aff || a.d - b.d)[0]?.r;
   // a gas-tight room on its own system (CO2, batteries): its fan sits on the room itself, the duct goes straight out
   const sealedOnly = served.length === 1 && /^(소화제 저장실|축전지실)/.test(cls[served[0].id]?.space || '') ? served[0] : null;
   // Root: a location the user set in HVAC Grid (contract.roots[key]) wins. On the unit deck it is the unit: a fan / AHU
   // room, else the corridor end, else the deck corner. On the other decks it is the shaft: a shaft / trunk room, else
   // straight above or below the unit when that point is inside a room, else the corridor end.
   let root, rootSource; const set = (contract.roots || {})[key];
   if (set && Number.isFinite(set.x) && Number.isFinite(set.y)) { root = { x: set.x, y: set.y }; rootSource = 'user'; }
   else if (isUnit && sealedOnly) { const b = bbox(sealedOnly.polygon); root = { x: b.minX + 300, y: (b.minY + b.maxY) / 2 }; if (!inRoom(root, sealedOnly)) root = interiorPoint(sealedOnly.polygon, 100, sealedOnly.holes); rootSource = 'own-room:' + sealedOnly.no; }
   else if (isUnit && fan) { root = interiorPoint(fan.polygon, 100, fan.holes); rootSource = 'fan-room:' + fan.no; }
   else if (!isUnit && shaftRoom) { root = interiorPoint(shaftRoom.polygon, 100, shaftRoom.holes); rootSource = 'shaft-room:' + shaftRoom.no; }
   else if (!isUnit && unitPoint && deckRooms.some(r => inRoom(unitPoint, r))) { root = { ...unitPoint }; rootSource = 'above-unit'; }
   else if (corridor) { const b = bbox(corridor.polygon), h = b.maxX - b.minX >= b.maxY - b.minY; root = h ? { x: b.minX + 400, y: (b.minY + b.maxY) / 2 } : { x: (b.minX + b.maxX) / 2, y: b.minY + 400 }; rootSource = 'assumed:corridor-end:' + corridor.no; }
   else { const b = bbox(deckRooms.flatMap(r => r.polygon)); root = { x: b.minX + 400, y: b.minY + 400 }; rootSource = 'assumed:deck-corner'; }
   root = { x: snap(root.x, opt.gridMm), y: snap(root.y, opt.gridMm) };
   if (rootSource !== 'user') {
    const used = starts[deckId] || [], room = deckRooms.find(r => inRoom(root, r)), clear = p => used.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 600);
    if (room && !clear(root)) search: for (let k = 1; k <= 30; k++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
     const q = { x: root.x + dx * k * opt.gridMm, y: root.y + dy * k * opt.gridMm }; if (inRoom(q, room) && GE.roomEdgeDistance(q, room) >= 200 && clear(q)) { root = q; break search; } }
   }
   (starts[deckId] = starts[deckId] || []).push(root);
   if (isUnit) unitPoint = root;
   const rootRoom = deckRooms.find(r => inRoom(root, r));
   // no two nodes on one point (PHG D refuses it): an RU on the Root or on another RU moves to the nearest free grid
   // point inside its room, at least 400 mm away
   const taken = [root], free = (p, room) => inRoom(p, room) && taken.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 400);
   const settle = (p, room) => { if (free(p, room)) return p; for (let k = 1; k <= 30; k++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const q = { x: p.x + dx * k * opt.gridMm, y: p.y + dy * k * opt.gridMm }; if (free(q, room)) return q; } return p; };
   const rus = served.flatMap(r => {
    const flow = roomFlow(contract, r, sys.kind), sup = supplyPoints[r.id] || [];
    // exhaust / return in a room with RUs of earlier plans (supply, then exhaust): as far from them as the room allows
    // (no short circuit, and an exhaust and a return RU never share a point)
    const pts = sys.kind !== 'supply' && sup.length ? spread(r, Math.max(1, Math.ceil(flow / opt.maxRuCmh)), sup).map(p => ({ x: snap(p.x, opt.gridMm), y: snap(p.y, opt.gridMm) })) : null;
    const placed = pts ? roomRus(r, flow, opt).map((u, i) => ({ ...u, x: pts[i].x, y: pts[i].y })) : roomRus(r, flow, opt);
    if (sys.kind !== 'supply') taken.push(...sup);
    return placed.map((p, i) => { const q = settle(p, r); taken.push(q);
     (supplyPoints[r.id] = supplyPoints[r.id] || []).push(q);
     return { id: `${id}/${r.no || r.id}/${i + 1}`, roomId: r.id, roomNo: r.no, systemId: sys.id, use: sys.kind, ...p, x: q.x, y: q.y }; });
   });
   // rooms AUTO keeps out of: restricted spaces (AVOID) this plan neither serves nor starts in
   // a galley exhaust keeps out of every other room too (II-2/9.7.5: a galley range exhaust duct through accommodation
   // needs A-class construction) - only fan rooms and trunks may carry it; the galley supply avoids the restricted rooms only
   const servedIds = new Set(served.map(r => r.id)), galleyPlan = sys.kind === 'exhaust' && served.some(r => cls[r.id]?.space === '조리실');
   const avoid = deckRooms.filter(r => !servedIds.has(r.id) && r !== rootRoom && (AVOID.has(cls[r.id]?.space) || (galleyPlan && !['환기·공조 기계실', '덕트 트렁크'].includes(cls[r.id]?.space))))
    .map(r => ({ roomId: r.id, no: r.no, name: r.name, space: cls[r.id].space, polygon: r.polygon, zone: GE.inset(r.polygon, 50) }));
   if (!outside[deckId]) outside[deckId] = outsideOf(deckRooms);
   plans.push({ key, deckId, systemId: sys.id, systemKey: id, kind: sys.kind, flowMode: sys.kind === 'supply' ? 'supply' : 'exhaust', outside: outside[deckId],
    unitDeckId: unit.deckId, unitDeckSource: unit.source, isUnitDeck: isUnit, decks: decks.length, rootRoomId: rootRoom?.id || null,
    root, rootSource, rus, avoid, rooms: deckRooms.map(r => r.id), designCmh: rus.reduce((t, u) => t + u.flowCmh, 0), dxf: deckDxf(contract, deckId) });
  }
 }
 return plans;
}

// minimal DXF 2007 (AC1021, mm, UTF-8 text) for PHG D: a closed LWPOLYLINE per room on ROOM, room number and name TEXT
// on ROOM_NO / ROOM_NAME, with the subclass markers CAD readers require. Text on one line (a line break would end the
// group-code pair).
function deckDxf(contract, deckId) {
 const L = [], add = (...kv) => { for (let i = 0; i < kv.length; i += 2) L.push(String(kv[i]), String(kv[i + 1])); };
 let handle = 0x100; const h = () => (handle++).toString(16).toUpperCase();
 add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1021', 9, '$DWGCODEPAGE', 3, 'ANSI_1252', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');   // 2007+: text UTF-8 whatever the code page
 add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 5, h(), 100, 'AcDbSymbolTable', 70, 3);
 for (const layer of ['ROOM', 'ROOM_NO', 'ROOM_NAME']) add(0, 'LAYER', 5, h(), 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, layer, 70, 0, 62, 7, 6, 'CONTINUOUS');
 add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
 for (const r of contract.rooms.filter(x => x.deckId === deckId)) {
  add(0, 'LWPOLYLINE', 5, h(), 100, 'AcDbEntity', 8, 'ROOM', 100, 'AcDbPolyline', 90, r.polygon.length, 70, 1);
  for (const p of r.polygon) add(10, p.x, 20, p.y);
  // labels near the top-left corner inside the room, clear of the RU at its centre
  const b = bbox(r.polygon), size = Math.max(80, Math.min(200, Math.sqrt(Math.abs(area(r.polygon))) / 12));
  let c = { x: b.minX + size, y: b.maxY - size * 1.6 }; if (!inside(c, r.polygon)) c = interiorPoint(r.polygon);
  if (r.no) add(0, 'TEXT', 5, h(), 100, 'AcDbEntity', 8, 'ROOM_NO', 100, 'AcDbText', 10, c.x, 20, c.y, 30, 0, 40, size, 1, dxfText(r.no), 100, 'AcDbText');
  add(0, 'TEXT', 5, h(), 100, 'AcDbEntity', 8, 'ROOM_NAME', 100, 'AcDbText', 10, c.x, 20, c.y - size * 1.6, 30, 0, 40, size, 1, dxfText(r.name || r.id), 100, 'AcDbText');
 }
 add(0, 'ENDSEC', 0, 'EOF');
 return L.join('\r\n') + '\r\n';
}

module.exports = { KINDS, KIND_LABEL, FLOW_FIELD, AVOID, plan, outsideOf, deckDxf, roomRus, spread, interiorPoint, inside, inRoom, centroid, bbox, area, systemKeys, unitDeckOf };
