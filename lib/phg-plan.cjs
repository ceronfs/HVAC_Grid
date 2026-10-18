// Contract -> PHG D plan (pure): per deck and supply system, the room drawing (DXF text), the Root and the RUs with
// their airflow. tools/phg-generate.cjs turns a plan into PHG D projects in a headless PHG D.
'use strict';

const FAN_WORDS = /팬룸|공조기|공조실|FAN\s*ROOM|AHU|A\/C\s*ROOM|AC\s*ROOM/i;
const CORRIDOR_WORDS = /복도|통로|ALLEY|CORRIDOR|PASSAGE/i;

const area = poly => poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
function inside(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
 if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
function centroid(poly) { const A = area(poly); if (Math.abs(A) < 1e-9) return { x: poly[0].x, y: poly[0].y };
 let cx = 0, cy = 0; poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], f = a.x * b.y - b.x * a.y; cx += (a.x + b.x) * f; cy += (a.y + b.y) * f; });
 return { x: cx / (6 * A), y: cy / (6 * A) }; }
const bbox = poly => ({ minX: Math.min(...poly.map(p => p.x)), maxX: Math.max(...poly.map(p => p.x)), minY: Math.min(...poly.map(p => p.y)), maxY: Math.max(...poly.map(p => p.y)) });
// distance from a point to the room outline
function edgeDistance(p, poly) { let d = Infinity; poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
 const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; d = Math.min(d, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)); }); return d; }
// a point well inside the room: the centroid when it is inside, else the grid point farthest from the outline
function interiorPoint(poly, step = 100) { const c = centroid(poly); if (inside(c, poly)) return c; const b = bbox(poly); let best = null;
 for (let x = b.minX + step / 2; x < b.maxX; x += step) for (let y = b.minY + step / 2; y < b.maxY; y += step) { const p = { x, y }; if (!inside(p, poly)) continue;
  const d = edgeDistance(p, poly); if (!best || d > best.d) best = { ...p, d }; } return best ? { x: best.x, y: best.y } : c; }
const snap = (v, g) => Math.round(v / g) * g;

// RUs of one room: one per maxRuCmh of supply, spread along the room's longer side, flows sum to the room supply
function roomRus(room, flowCmh, opt) {
 const n = Math.max(1, Math.ceil(flowCmh / opt.maxRuCmh)), b = bbox(room.polygon), horizontal = b.maxX - b.minX >= b.maxY - b.minY, out = [];
 const base = Math.floor(flowCmh / n / 10) * 10; let rest = flowCmh - base * n;
 for (let i = 0; i < n; i++) {
  let p = n === 1 ? interiorPoint(room.polygon) : horizontal ? { x: b.minX + (b.maxX - b.minX) * (i + 0.5) / n, y: (b.minY + b.maxY) / 2 } : { x: (b.minX + b.maxX) / 2, y: b.minY + (b.maxY - b.minY) * (i + 0.5) / n };
  if (!inside(p, room.polygon)) p = interiorPoint(room.polygon);
  const extra = rest > 0 ? Math.min(rest, 10) : 0; rest -= extra;
  out.push({ x: snap(p.x, opt.gridMm), y: snap(p.y, opt.gridMm), flowCmh: base + extra });
 }
 return out;
}

function plan(contract, options = {}) {
 const opt = { maxRuCmh: 500, gridMm: 100, ...options }, plans = [];
 for (const sys of contract.systems.filter(s => s.kind === 'supply')) for (const deckId of sys.deckIds) {
  const deckRooms = contract.rooms.filter(r => r.deckId === deckId), served = deckRooms.filter(r => r.systems.supply === sys.id && contract.airflow[r.id].supplyCmh > 0);
  if (!served.length) continue;
  // Root: a fan / AHU room on the deck, else the end of the corridor (assumed, to be moved to the real unit)
  const fan = deckRooms.find(r => FAN_WORDS.test(r.name)), corridor = deckRooms.find(r => CORRIDOR_WORDS.test(r.name) || r.isoClass === 'ALLEY_SOUND');
  let root, rootSource;
  if (fan) { root = interiorPoint(fan.polygon); rootSource = 'fan-room:' + fan.no; }
  else if (corridor) { const b = bbox(corridor.polygon), h = b.maxX - b.minX >= b.maxY - b.minY; root = h ? { x: b.minX + 400, y: (b.minY + b.maxY) / 2 } : { x: (b.minX + b.maxX) / 2, y: b.minY + 400 }; rootSource = 'assumed:corridor-end:' + corridor.no; }
  else { const b = bbox(deckRooms.flatMap(r => r.polygon)); root = { x: b.minX + 400, y: b.minY + 400 }; rootSource = 'assumed:deck-corner'; }
  root = { x: snap(root.x, opt.gridMm), y: snap(root.y, opt.gridMm) };
  // no two nodes on one point (PHG D refuses it): an RU on the Root or on another RU moves to the nearest free grid
  // point inside its room, at least 400 mm away
  const taken = [root], free = (p, room) => inside(p, room.polygon) && taken.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= 400);
  const settle = (p, room) => { if (free(p, room)) return p; for (let k = 1; k <= 30; k++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
   const q = { x: p.x + dx * k * opt.gridMm, y: p.y + dy * k * opt.gridMm }; if (free(q, room)) return q; } return p; };
  const rus = served.flatMap(r => roomRus(r, contract.airflow[r.id].supplyCmh, opt).map((p, i) => { const q = settle(p, r); taken.push(q);
   return { id: `${sys.id}/${r.no || r.id}/${i + 1}`, roomId: r.id, roomNo: r.no, systemId: sys.id, use: 'supply', ...p, x: q.x, y: q.y }; }));
  plans.push({ key: `${deckId}__${sys.id}`, deckId, systemId: sys.id, root, rootSource, rus, rooms: deckRooms.map(r => r.id),
   designCmh: rus.reduce((t, u) => t + u.flowCmh, 0), dxf: deckDxf(contract, deckId) });
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

module.exports = { plan, deckDxf, roomRus, interiorPoint, inside, centroid };
