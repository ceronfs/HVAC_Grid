// Plan geometry shared by the HVAC Grid modules (pure, mm): polygons as [{x,y}], rooms as { polygon, holes }.
// Room polygons are ship (world) coordinates: BOX applies the deck offset / rotation / scale before it reports them
// (checked with a rotated, offset deck - test/geom.test.cjs), so rooms of different decks compare directly.
'use strict';

const area = poly => poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
function inside(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
 if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
// inside the outline and not in one of its holes
const inRoom = (p, room) => inside(p, room.polygon) && !(room.holes || []).some(h => h.length > 2 && inside(p, h));
const roomArea = room => Math.abs(area(room.polygon)) - (room.holes || []).reduce((t, h) => t + (h.length > 2 ? Math.abs(area(h)) : 0), 0);
function centroid(poly) { const A = area(poly); if (Math.abs(A) < 1e-9) return { x: poly[0].x, y: poly[0].y };
 let cx = 0, cy = 0; poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], f = a.x * b.y - b.x * a.y; cx += (a.x + b.x) * f; cy += (a.y + b.y) * f; });
 return { x: cx / (6 * A), y: cy / (6 * A) }; }
const bbox = poly => ({ minX: Math.min(...poly.map(p => p.x)), maxX: Math.max(...poly.map(p => p.x)), minY: Math.min(...poly.map(p => p.y)), maxY: Math.max(...poly.map(p => p.y)) });
const edges = poly => poly.map((a, i) => [a, poly[(i + 1) % poly.length]]);
// all edges of a room: the outline and the outlines of its holes
const roomEdges = room => [...edges(room.polygon), ...(room.holes || []).filter(h => h.length > 2).flatMap(edges)];
// distance from a point to a segment / to a polygon outline
function segDistance(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }
const edgeDistance = (p, poly) => Math.min(...edges(poly).map(([a, b]) => segDistance(p, a, b)));
const roomEdgeDistance = (p, room) => Math.min(...roomEdges(room).map(([a, b]) => segDistance(p, a, b)));
// grid points inside a room (not in holes), at least `margin` from every edge
function gridPoints(room, step = 100, margin = 0) { const b = bbox(room.polygon), out = [];
 for (let x = b.minX + step / 2; x < b.maxX; x += step) for (let y = b.minY + step / 2; y < b.maxY; y += step) { const p = { x, y }; if (inRoom(p, room) && (!margin || roomEdgeDistance(p, room) >= margin)) out.push(p); }
 return out; }
// a point well inside the room: the centroid when it is inside (and not in a hole), else the grid point farthest from the edges
function interiorPoint(poly, step = 100, holes = []) { const room = { polygon: poly, holes }, c = centroid(poly); if (inRoom(c, room)) return c; let best = null;
 for (const p of gridPoints(room, step)) { const d = roomEdgeDistance(p, room); if (!best || d > best.d) best = { ...p, d }; } return best ? { x: best.x, y: best.y } : c; }
// shared part of two edges: parallel (<= ~1.1 deg), within `tol` of each other, overlapping >= minOverlap -> segment on the mid line
function sharedSegment([a, b], [c, d], tol, minOverlap) {
 const ux = b.x - a.x, uy = b.y - a.y, L = Math.hypot(ux, uy); if (L < 1) return null;
 const dx = ux / L, dy = uy / L, vx = d.x - c.x, vy = d.y - c.y, M = Math.hypot(vx, vy); if (M < 1) return null;
 if (Math.abs(dx * vy - dy * vx) / M > 0.02) return null;
 const off = p => (p.x - a.x) * -dy + (p.y - a.y) * dx, dist = (off(c) + off(d)) / 2;
 if (Math.abs(dist) > tol) return null;
 const t = p => (p.x - a.x) * dx + (p.y - a.y) * dy, t0 = Math.max(0, Math.min(t(c), t(d))), t1 = Math.min(L, Math.max(t(c), t(d)));
 if (t1 - t0 < minOverlap) return null;
 const at = (s, o) => ({ x: a.x + dx * s - dy * o, y: a.y + dy * s + dx * o });
 return { a: at(t0, dist / 2), b: at(t1, dist / 2), lengthMm: t1 - t0, gapMm: Math.abs(dist), along: [t0, t1] };
}
// length of wall two rooms of one deck share (mm)
function sharedLength(p, q, tol = 400, minOverlap = 100) { let L = 0; for (const e of roomEdges(p)) for (const f of roomEdges(q)) { const s = sharedSegment(e, f, tol, minOverlap); if (s) L += s.lengthMm; } return L; }
// area two rooms share seen from above (rooms on adjacent decks), m², by grid sampling. The step follows the smaller room
// so a 0.5 m² shaft still gets ~50 samples.
function overlapM2(p, q) {
 const A = bbox(p.polygon), B = bbox(q.polygon), x0 = Math.max(A.minX, B.minX), x1 = Math.min(A.maxX, B.maxX), y0 = Math.max(A.minY, B.minY), y1 = Math.min(A.maxY, B.maxY);
 if (x1 <= x0 || y1 <= y0) return 0;
 const step = Math.max(20, Math.min(200, Math.sqrt((x1 - x0) * (y1 - y0) / 50)));
 let n = 0; for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) { const pt = { x, y }; if (inRoom(pt, p) && inRoom(pt, q)) n++; }
 return n * step * step / 1e6;
}
// part of a room's floor area (m²) that no room of the other list covers (open floor / exposed ceiling)
function uncoveredM2(room, others) {
 const b = bbox(room.polygon), step = Math.max(50, Math.min(250, Math.sqrt((b.maxX - b.minX) * (b.maxY - b.minY) / 200))); let n = 0, pts = [];
 for (let x = b.minX + step / 2; x < b.maxX; x += step) for (let y = b.minY + step / 2; y < b.maxY; y += step) { const p = { x, y }; if (inRoom(p, room) && !others.some(o => inRoom(p, o))) { n++; pts.push(p); } }
 return { m2: n * step * step / 1e6, at: pts.length ? pts[Math.floor(pts.length / 2)] : null };
}
// polygon moved inward by d (simple polygons, small d): each vertex along its corner bisector
function inset(poly, d) {
 const ccw = area(poly) > 0, n = poly.length;
 return poly.map((p, i) => {
  const a = poly[(i + n - 1) % n], c = poly[(i + 1) % n], n1 = norm({ x: p.y - a.y, y: a.x - p.x }), n2 = norm({ x: c.y - p.y, y: p.x - c.x }), s = ccw ? -1 : 1;
  const bx = n1.x + n2.x, by = n1.y + n2.y, bl = Math.hypot(bx, by) || 1, cos = (n1.x * bx + n1.y * by) / bl || 1;
  return { x: p.x + s * bx / bl * d / cos, y: p.y + s * by / bl * d / cos };
 });
}
const norm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const snap = (v, g) => Math.round(v / g) * g;

module.exports = { area, inside, inRoom, roomArea, centroid, bbox, edges, roomEdges, segDistance, edgeDistance, roomEdgeDistance, gridPoints, interiorPoint, sharedSegment, sharedLength, overlapM2, uncoveredM2, inset, snap };
