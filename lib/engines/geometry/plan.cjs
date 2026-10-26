// Ver 2.0 plan geometry (mm) shared by the engines: rooms are { polygon: [{x,y}], holes: [[{x,y}]] } in ship
// coordinates (every deck on the same coordinates, the deck origin already applied). New code (D7); V2-5 adds the
// drawing engine (lines, faces, room finding) beside it.
'use strict';

// summed as s + a.x·b.y − b.x·a.y in that order: a room centre on a half grid step rounds the same way every time
const signedArea = poly => { let s = 0; for (let i = 0, n = poly.length; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; s = s + a.x * b.y - b.x * a.y; } return s / 2; };
// even-odd ray test along +x
function inPolygon(p, poly) {
 let inside = false;
 for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside; }
 return inside;
}
const inRoom = (p, room) => inPolygon(p, room.polygon) && !(room.holes || []).some(h => h.length > 2 && inPolygon(p, h));
const roomAreaMm2 = room => Math.abs(signedArea(room.polygon)) - (room.holes || []).reduce((t, h) => t + (h.length > 2 ? Math.abs(signedArea(h)) : 0), 0);
function bounds(poly) { let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (const p of poly) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; } return { minX, minY, maxX, maxY }; }
function centroid(poly) {
 const A = signedArea(poly); if (Math.abs(A) < 1e-9) return { x: poly[0].x, y: poly[0].y };
 let x = 0, y = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], f = a.x * b.y - b.x * a.y; x += (a.x + b.x) * f; y += (a.y + b.y) * f; }
 return { x: x / (6 * A), y: y / (6 * A) };
}
const sides = poly => poly.map((a, i) => [a, poly[(i + 1) % poly.length]]);
const roomSides = room => [...sides(room.polygon), ...(room.holes || []).filter(h => h.length > 2).flatMap(sides)];
function segmentDistance(p, a, b) {
 const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
 return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
const wallDistance = (p, room) => { let d = Infinity; for (const [a, b] of roomSides(room)) d = Math.min(d, segmentDistance(p, a, b)); return d; };
// points of a grid over the room (inside, out of its holes), `margin` from its walls; the step grows so a very large room
// gets about 40 000 points at most
function grid(room, step = 100, margin = 0) {
 const b = bounds(room.polygon), out = []; step = Math.max(step, Math.sqrt((b.maxX - b.minX) * (b.maxY - b.minY) / 40000));
 for (let x = b.minX + step / 2; x < b.maxX; x += step) for (let y = b.minY + step / 2; y < b.maxY; y += step) { const p = { x, y }; if (inRoom(p, room) && (!margin || wallDistance(p, room) >= margin)) out.push(p); }
 return out;
}
// a point well inside: the centroid when it is in the room, else the grid point farthest from the walls
function innerPoint(room, step = 100) {
 const c = centroid(room.polygon); if (inRoom(c, room)) return c;
 let best = null; for (const p of grid(room, step)) { const d = wallDistance(p, room); if (!best || d > best.d) best = { x: p.x, y: p.y, d }; }
 return best ? { x: best.x, y: best.y } : c;
}
// the part of two walls that faces each other: parallel (sine ≤ 0.02, about 1.1°), the gap at most `gap` mm, overlapping
// at least `overlap` mm → the piece on the line between them
function facing([a, b], [c, d], gap = 400, overlap = 100) {
 const L = Math.hypot(b.x - a.x, b.y - a.y), M = Math.hypot(d.x - c.x, d.y - c.y); if (L < 1 || M < 1) return null;
 const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
 if (Math.abs(ux * (d.y - c.y) - uy * (d.x - c.x)) / M > 0.02) return null;
 const across = p => -(p.x - a.x) * uy + (p.y - a.y) * ux, along = p => (p.x - a.x) * ux + (p.y - a.y) * uy, off = (across(c) + across(d)) / 2;
 if (Math.abs(off) > gap) return null;
 const s0 = Math.max(0, Math.min(along(c), along(d))), s1 = Math.min(L, Math.max(along(c), along(d)));
 if (s1 - s0 < overlap) return null;
 const at = s => ({ x: a.x + ux * s - uy * off / 2, y: a.y + uy * s + ux * off / 2 });
 return { a: at(s0), b: at(s1), lengthMm: s1 - s0, gapMm: Math.abs(off), along: [s0, s1] };
}
// wall length two rooms of a deck share (mm)
function sharedWall(p, q, gap = 400, overlap = 100) { let L = 0; for (const e of roomSides(p)) for (const f of roomSides(q)) { const s = facing(e, f, gap, overlap); if (s) L += s.lengthMm; } return L; }
const perimeter = room => sides(room.polygon).reduce((t, [a, b]) => t + Math.hypot(b.x - a.x, b.y - a.y), 0);
const snap = (v, step) => step > 0 ? Math.round(v / step) * step : v;
// floor area two rooms share seen from above (rooms of adjacent decks), m², by sampling; the step follows the overlap so a
// 0.5 m² shaft still gets about 50 samples
function overlapM2(p, q) {
 const A = bounds(p.polygon), B = bounds(q.polygon), x0 = Math.max(A.minX, B.minX), x1 = Math.min(A.maxX, B.maxX), y0 = Math.max(A.minY, B.minY), y1 = Math.min(A.maxY, B.maxY);
 if (x1 <= x0 || y1 <= y0) return 0;
 const step = Math.max(20, Math.min(200, Math.sqrt((x1 - x0) * (y1 - y0) / 50)));
 let n = 0; for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) { const t = { x, y }; if (inRoom(t, p) && inRoom(t, q)) n++; }
 return n * step * step / 1e6;
}
// the part of a room's floor no room of `others` covers (m²) and a point of it
function uncoveredM2(room, others) {
 const b = bounds(room.polygon), step = Math.max(50, Math.min(250, Math.sqrt((b.maxX - b.minX) * (b.maxY - b.minY) / 200))), pts = [];
 for (let x = b.minX + step / 2; x < b.maxX; x += step) for (let y = b.minY + step / 2; y < b.maxY; y += step) { const t = { x, y }; if (inRoom(t, room) && !others.some(o => inRoom(t, o))) pts.push(t); }
 return { m2: pts.length * step * step / 1e6, at: pts.length ? pts[Math.floor(pts.length / 2)] : null };
}
// a polygon moved inward by d (simple polygons, small d): every corner along its bisector
function inset(poly, d) {
 const unit = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }, s = signedArea(poly) > 0 ? -1 : 1, n = poly.length;
 return poly.map((p, i) => {
  const a = poly[(i + n - 1) % n], c = poly[(i + 1) % n], n1 = unit({ x: p.y - a.y, y: a.x - p.x }), n2 = unit({ x: c.y - p.y, y: p.x - c.x });
  const bx = n1.x + n2.x, by = n1.y + n2.y, bl = Math.hypot(bx, by) || 1, cos = (n1.x * bx + n1.y * by) / bl || 1;
  return { x: p.x + s * bx / bl * d / cos, y: p.y + s * by / bl * d / cos };
 });
}

module.exports = { signedArea, inPolygon, inRoom, roomAreaMm2, bounds, centroid, sides, roomSides, segmentDistance, wallDistance, grid, innerPoint, facing, sharedWall, perimeter, snap, inset, overlapM2, uncoveredM2 };
