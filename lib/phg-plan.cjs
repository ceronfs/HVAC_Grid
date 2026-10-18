// Contract -> PHG D plan (pure): per deck and system (supply, exhaust, return), the room drawing (DXF text), the Root and
// the RUs with their airflow. A system that serves several decks has one air handling unit on its unit deck and a
// vertical duct (shaft) to every other deck; the Root of those decks is the shaft point (lib/risers.cjs sizes the vertical
// ducts). tools/phg-generate.cjs and the shell turn a plan into PHG D projects.
'use strict';

const FAN_WORDS = /팬룸|공조기|공조실|FAN\s*ROOM|AHU|A\/C\s*ROOM|AC\s*ROOM|팬실/i;
const CORRIDOR_WORDS = /복도|통로|ALLEY|CORRIDOR|PASSAGE/i;
const SHAFT_WORDS = /샤프트|트렁크|덕트\s*스페이스|SHAFT|TRUNK|DUCT\s*SPACE/i;
const KINDS = ['supply', 'exhaust', 'return'];
const FLOW_FIELD = { supply: 'supplyCmh', exhaust: 'exhaustCmh', return: 'returnCmh' };
const KIND_LABEL = { supply: '급기', exhaust: '배기', return: '환기' };

const area = poly => poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
function inside(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
 if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
// inside the outline and not in one of its holes
const inRoom = (p, room) => inside(p, room.polygon) && !(room.holes || []).some(h => h.length > 2 && inside(p, h));
function centroid(poly) { const A = area(poly); if (Math.abs(A) < 1e-9) return { x: poly[0].x, y: poly[0].y };
 let cx = 0, cy = 0; poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], f = a.x * b.y - b.x * a.y; cx += (a.x + b.x) * f; cy += (a.y + b.y) * f; });
 return { x: cx / (6 * A), y: cy / (6 * A) }; }
const bbox = poly => ({ minX: Math.min(...poly.map(p => p.x)), maxX: Math.max(...poly.map(p => p.x)), minY: Math.min(...poly.map(p => p.y)), maxY: Math.max(...poly.map(p => p.y)) });
// distance from a point to the room outline
function edgeDistance(p, poly) { let d = Infinity; poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
 const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; d = Math.min(d, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)); }); return d; }
// a point well inside the room: the centroid when it is inside (and not in a hole), else the grid point farthest from the outline
function interiorPoint(poly, step = 100, holes = []) { const room = { polygon: poly, holes }, c = centroid(poly); if (inRoom(c, room)) return c; const b = bbox(poly); let best = null;
 for (let x = b.minX + step / 2; x < b.maxX; x += step) for (let y = b.minY + step / 2; y < b.maxY; y += step) { const p = { x, y }; if (!inRoom(p, room)) continue;
  const d = Math.min(edgeDistance(p, poly), ...holes.map(h => edgeDistance(p, h))); if (!best || d > best.d) best = { ...p, d }; } return best ? { x: best.x, y: best.y } : c; }
const snap = (v, g) => Math.round(v / g) * g;

// RUs of one room: one per maxRuCmh, spread along the room's longer side, flows sum to the room airflow
function roomRus(room, flowCmh, opt) {
 const n = Math.max(1, Math.ceil(flowCmh / opt.maxRuCmh)), b = bbox(room.polygon), horizontal = b.maxX - b.minX >= b.maxY - b.minY, out = [];
 const base = Math.floor(flowCmh / n / 10) * 10; let rest = flowCmh - base * n;
 for (let i = 0; i < n; i++) {
  let p = n === 1 ? interiorPoint(room.polygon, 100, room.holes) : horizontal ? { x: b.minX + (b.maxX - b.minX) * (i + 0.5) / n, y: (b.minY + b.maxY) / 2 } : { x: (b.minX + b.maxX) / 2, y: b.minY + (b.maxY - b.minY) * (i + 0.5) / n };
  if (!inRoom(p, room)) p = interiorPoint(room.polygon, 100, room.holes);
  // the remainder in 10 CMH steps over the first RUs; a remainder below 10 (unrounded airflow) goes to the first RU
  const extra = rest >= 10 ? 10 : i === 0 ? rest : 0; rest -= extra;
  out.push({ x: snap(p.x, opt.gridMm), y: snap(p.y, opt.gridMm), flowCmh: base + extra });
 }
 if (rest > 0) out[0].flowCmh += rest;
 return out;
}

// system ids can repeat across kinds in BOX (a name used as supply and as exhaust): the key then carries the kind
function systemKeys(contract) {
 const count = {}; for (const s of contract.systems) count[s.id] = (count[s.id] || 0) + 1;
 return s => count[s.id] > 1 ? `${s.id}~${s.kind}` : s.id;
}
const roomFlow = (contract, room, kind) => contract.airflow[room.id]?.[FLOW_FIELD[kind]] || 0;
const servedBy = (room, sys) => room.systems[sys.kind] === sys.id;

// the deck that holds the unit of a system: the user's choice, else a deck with a fan room, else the deck with the most air
function unitDeckOf(contract, sys, decks) {
 const set = (contract.unitDecks || {})[systemKeys(contract)(sys)];
 if (set && decks.includes(set)) return { deckId: set, source: 'user' };
 const fan = decks.find(d => contract.rooms.some(r => r.deckId === d && FAN_WORDS.test(r.name)));
 if (fan) return { deckId: fan, source: 'fan-room' };
 const flow = d => contract.rooms.filter(r => r.deckId === d && servedBy(r, sys)).reduce((t, r) => t + roomFlow(contract, r, sys.kind), 0);
 const elev = d => contract.decks.find(x => x.id === d)?.elevationMm || 0;
 return { deckId: [...decks].sort((a, b) => flow(b) - flow(a) || elev(b) - elev(a))[0], source: 'most-air' };
}

function plan(contract, options = {}) {
 const opt = { maxRuCmh: 500, gridMm: 100, kinds: KINDS, ...options }, plans = [], sysKey = systemKeys(contract);
 // supply RUs are planned first; exhaust / return RUs keep 400 mm away from them in the same room
 const supplyPoints = {};
 // units and shafts of different systems in the same fan room / trunk get their own point (>= 600 mm apart)
 const starts = {};
 const systems = contract.systems.filter(s => opt.kinds.includes(s.kind)).sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
 for (const sys of systems) {
  const id = sysKey(sys);
  // decks where the system has air to move (rooms still pending carry no air yet)
  const decks = sys.deckIds.filter(d => contract.rooms.some(r => r.deckId === d && servedBy(r, sys) && roomFlow(contract, r, sys.kind) > 0));
  if (!decks.length) continue;
  const unit = unitDeckOf(contract, sys, decks);
  let unitPoint = null;
  for (const deckId of [unit.deckId, ...decks.filter(d => d !== unit.deckId)]) {
   const deckRooms = contract.rooms.filter(r => r.deckId === deckId), served = deckRooms.filter(r => servedBy(r, sys) && roomFlow(contract, r, sys.kind) > 0);
   const key = `${deckId}__${id}`, isUnit = deckId === unit.deckId;
   const fan = deckRooms.find(r => FAN_WORDS.test(r.name)), corridor = deckRooms.find(r => CORRIDOR_WORDS.test(r.name) || r.isoClass === 'ALLEY_SOUND');
   const shaftRoom = deckRooms.find(r => SHAFT_WORDS.test(r.name));
   // Root: a location the user set in HVAC Grid (contract.roots[key]) wins. On the unit deck it is the unit: a fan / AHU
   // room, else the corridor end, else the deck corner. On the other decks it is the shaft: a shaft / trunk room, else
   // straight above or below the unit when that point is inside a room, else the corridor end.
   let root, rootSource; const set = (contract.roots || {})[key];
   if (set && Number.isFinite(set.x) && Number.isFinite(set.y)) { root = { x: set.x, y: set.y }; rootSource = 'user'; }
   else if (isUnit && fan) { root = interiorPoint(fan.polygon, 100, fan.holes); rootSource = 'fan-room:' + fan.no; }
   else if (!isUnit && shaftRoom) { root = interiorPoint(shaftRoom.polygon, 100, shaftRoom.holes); rootSource = 'shaft-room:' + shaftRoom.no; }
   else if (!isUnit && unitPoint && deckRooms.some(r => inRoom(unitPoint, r))) { root = { ...unitPoint }; rootSource = 'above-unit'; }
   else if (corridor) { const b = bbox(corridor.polygon), h = b.maxX - b.minX >= b.maxY - b.minY; root = h ? { x: b.minX + 400, y: (b.minY + b.maxY) / 2 } : { x: (b.minX + b.maxX) / 2, y: b.minY + 400 }; rootSource = 'assumed:corridor-end:' + corridor.no; }
   else { const b = bbox(deckRooms.flatMap(r => r.polygon)); root = { x: b.minX + 400, y: b.minY + 400 }; rootSource = 'assumed:deck-corner'; }
   root = { x: snap(root.x, opt.gridMm), y: snap(root.y, opt.gridMm) };
   if (rootSource !== 'user') {
    const used = starts[deckId] || [], room = deckRooms.find(r => inRoom(root, r)), clear = p => used.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 600);
    if (room && !clear(root)) search: for (let k = 1; k <= 30; k++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
     const q = { x: root.x + dx * k * opt.gridMm, y: root.y + dy * k * opt.gridMm }; if (inRoom(q, room) && edgeDistance(q, room.polygon) >= 200 && clear(q)) { root = q; break search; } }
   }
   (starts[deckId] = starts[deckId] || []).push(root);
   if (isUnit) unitPoint = root;
   // no two nodes on one point (PHG D refuses it): an RU on the Root or on another RU moves to the nearest free grid
   // point inside its room, at least 400 mm away
   const taken = [root], free = (p, room) => inRoom(p, room) && taken.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 400);
   const settle = (p, room) => { if (free(p, room)) return p; for (let k = 1; k <= 30; k++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const q = { x: p.x + dx * k * opt.gridMm, y: p.y + dy * k * opt.gridMm }; if (free(q, room)) return q; } return p; };
   const rus = served.flatMap(r => { if (sys.kind !== 'supply') taken.push(...(supplyPoints[r.id] || []));
    return roomRus(r, roomFlow(contract, r, sys.kind), opt).map((p, i) => { const q = settle(p, r); taken.push(q);
     if (sys.kind === 'supply') (supplyPoints[r.id] = supplyPoints[r.id] || []).push(q);
     return { id: `${id}/${r.no || r.id}/${i + 1}`, roomId: r.id, roomNo: r.no, systemId: sys.id, use: sys.kind, ...p, x: q.x, y: q.y }; }); });
   plans.push({ key, deckId, systemId: sys.id, systemKey: id, kind: sys.kind, flowMode: sys.kind === 'supply' ? 'supply' : 'exhaust',
    unitDeckId: unit.deckId, unitDeckSource: unit.source, isUnitDeck: isUnit, decks: decks.length,
    root, rootSource, rus, rooms: deckRooms.map(r => r.id), designCmh: rus.reduce((t, u) => t + u.flowCmh, 0), dxf: deckDxf(contract, deckId) });
  }
 }
 return plans;
}

// minimal DXF (AC1015, mm): a closed LWPOLYLINE per room on ROOM, room number and name TEXT on ROOM_NO / ROOM_NAME
function deckDxf(contract, deckId) {
 const L = [], add = (...kv) => { for (let i = 0; i < kv.length; i += 2) L.push(String(kv[i]), String(kv[i + 1])); };
 let handle = 0x100; const h = () => (handle++).toString(16).toUpperCase();
 add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
 add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 3);
 for (const layer of ['ROOM', 'ROOM_NO', 'ROOM_NAME']) add(0, 'LAYER', 2, layer, 70, 0, 62, 7, 6, 'CONTINUOUS');
 add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
 for (const r of contract.rooms.filter(x => x.deckId === deckId)) {
  add(0, 'LWPOLYLINE', 5, h(), 8, 'ROOM', 90, r.polygon.length, 70, 1);
  for (const p of r.polygon) add(10, p.x, 20, p.y);
  // labels near the top-left corner inside the room, clear of the RU at its centre
  const b = bbox(r.polygon), size = Math.max(80, Math.min(200, Math.sqrt(Math.abs(area(r.polygon))) / 12));
  let c = { x: b.minX + size, y: b.maxY - size * 1.6 }; if (!inside(c, r.polygon)) c = interiorPoint(r.polygon);
  if (r.no) add(0, 'TEXT', 5, h(), 8, 'ROOM_NO', 10, c.x, 20, c.y, 30, 0, 40, size, 1, r.no);
  add(0, 'TEXT', 5, h(), 8, 'ROOM_NAME', 10, c.x, 20, c.y - size * 1.6, 30, 0, 40, size, 1, r.name || r.id);
 }
 add(0, 'ENDSEC', 0, 'EOF');
 return L.join('\r\n') + '\r\n';
}

module.exports = { KINDS, KIND_LABEL, FLOW_FIELD, plan, deckDxf, roomRus, interiorPoint, inside, inRoom, centroid, bbox, area, systemKeys, unitDeckOf };
