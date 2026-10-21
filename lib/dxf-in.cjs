// Room drawing reader (pure): closed LWPOLYLINE / POLYLINE outlines on a room layer - or, in a drawing of plain LINEs
// (walls drawn once, meeting in T-junctions), the closed faces those lines make - + the room number and name TEXT /
// MTEXT inside them -> rooms { no, name, polygon, areaM2 }. Reads the test drawings (samples/t3/*.dxf), the drawings
// HVAC Grid sends to PHG D, and general-arrangement DXFs drawn the same way. Used to check a drawing against a contract.
'use strict';
const G = require('./phg-plan.cjs');

// DXF text: group code / value pairs
function pairs(text) { const lines = text.split(/\r?\n/), out = []; for (let i = 0; i + 1 < lines.length; i += 2) out.push([+lines[i].trim(), lines[i + 1]]); return out; }
// \U+XXXX escapes (AutoCAD unicode) and MTEXT formatting codes
const decode = s => String(s).replace(/\\U\+([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/[{}]/g, '').replace(/\\P/g, ' ').trim();

// texts that name a room: TEXT, MTEXT and the attributes of a block reference (a room tag: ATTRIB after its INSERT)
const TEXT_TYPES = new Set(['TEXT', 'MTEXT', 'ATTRIB']);
function entities(text) {
 const p = pairs(text), out = []; let i = p.findIndex(([c, v]) => c === 2 && v.trim() === 'ENTITIES'); if (i < 0) return out;
 let cur = null;
 for (i++; i < p.length; i++) {
  const [c, v] = p[i];
  if (c === 0) { if (cur) out.push(cur); const t = v.trim(); if (t === 'ENDSEC') { cur = null; break; } cur = { type: t, layer: '', pts: [], flags: 0, x: null, y: null, text: '' }; continue; }
  if (!cur) continue;
  if (c === 8) cur.layer = v.trim();
  else if (c === 70) cur.flags = +v;
  else if (c === 10) { if (cur.type === 'LWPOLYLINE' || cur.type === 'VERTEX') cur.pts.push({ x: +v, y: NaN }); else cur.x = +v; }
  else if (c === 20) { if ((cur.type === 'LWPOLYLINE' || cur.type === 'VERTEX') && cur.pts.length) cur.pts[cur.pts.length - 1].y = +v; else cur.y = +v; }
  else if (c === 11) cur.x2 = +v; else if (c === 21) cur.y2 = +v;
  else if (c === 40) cur.r = +v; else if (c === 50) cur.a0 = +v; else if (c === 51) cur.a1 = +v;   // ARC / CIRCLE (TEXT: height, rotation)
  else if (c === 1 || c === 3) cur.text += v;
 }
 if (cur) out.push(cur);
 // old-style POLYLINE + VERTEX ... SEQEND -> one polyline
 const merged = [];
 for (let k = 0; k < out.length; k++) { const e = out[k];
  if (e.type === 'POLYLINE') { const pl = { ...e, type: 'LWPOLYLINE', pts: [] }; while (out[k + 1]?.type === 'VERTEX') pl.pts.push(...out[++k].pts.length ? out[k].pts : [{ x: out[k].x, y: out[k].y }]); if (out[k + 1]?.type === 'SEQEND') k++; merged.push(pl); }
  else merged.push(e); }
 return merged;
}

// the closed faces a set of LINEs makes (walls): lines split where they cross or another one ends on them (T-junction),
// ends closer than tol (mm) joined, dangling ends dropped, every face traced with its inside on the left; the outside
// face (clockwise) is not a room. A room standing free inside another one (no shared wall) is not cut out of it.
function faces(lines, tol = 1) {
 const segs = lines.filter(l => Number.isFinite(l.x1 + l.y1 + l.x2 + l.y2) && Math.hypot(l.x2 - l.x1, l.y2 - l.y1) > tol);
 const cuts = segs.map(() => []);
 // only lines whose boxes are near each other: a grid of cells about the mean line length
 const mean = segs.reduce((t, l) => t + Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 0) / (segs.length || 1), cs = Math.max(mean, tol * 10), cellOf = new Map(), pairsTo = segs.map(() => []);
 segs.forEach((l, n) => { for (let i = Math.floor((Math.min(l.x1, l.x2) - tol) / cs); i <= Math.floor((Math.max(l.x1, l.x2) + tol) / cs); i++) for (let j = Math.floor((Math.min(l.y1, l.y2) - tol) / cs); j <= Math.floor((Math.max(l.y1, l.y2) + tol) / cs); j++) {
  const k = i + ',' + j; let list = cellOf.get(k); if (!list) cellOf.set(k, list = []); for (const m of list) pairsTo[n].push(m); list.push(n); } });
 for (let j = 0; j < segs.length; j++) for (const i of new Set(pairsTo[j])) {
  const a = segs[i], b = segs[j], rx = a.x2 - a.x1, ry = a.y2 - a.y1, sx = b.x2 - b.x1, sy = b.y2 - b.y1, d = rx * sy - ry * sx;
  const la = Math.hypot(rx, ry), lb = Math.hypot(sx, sy);
  if (Math.abs(d) > 1e-9 * la * lb) {
   const t = ((b.x1 - a.x1) * sy - (b.y1 - a.y1) * sx) / d, u = ((b.x1 - a.x1) * ry - (b.y1 - a.y1) * rx) / d;
   if (t > -tol / la && t < 1 + tol / la && u > -tol / lb && u < 1 + tol / lb) { cuts[i].push(t); cuts[j].push(u); }
  } else for (const [p, q, k, len, cx, cy, ox, oy] of [[b.x1, b.y1, i, la, rx, ry, a.x1, a.y1], [b.x2, b.y2, i, la, rx, ry, a.x1, a.y1], [a.x1, a.y1, j, lb, sx, sy, b.x1, b.y1], [a.x2, a.y2, j, lb, sx, sy, b.x1, b.y1]]) {
   // collinear overlap: the other line's ends cut this one
   const t = ((p - ox) * cx + (q - oy) * cy) / (len * len), off = Math.abs((p - ox) * cy - (q - oy) * cx) / len;
   if (off <= tol && t > 0 && t < 1) cuts[k].push(t);
  }
 }
 const key = (x, y) => `${Math.round(x / tol)},${Math.round(y / tol)}`, nodes = new Map(), adj = new Map(), edges = new Set();
 const node = (x, y) => { const k = key(x, y); if (!nodes.has(k)) { nodes.set(k, { x, y }); adj.set(k, new Set()); } return k; };
 segs.forEach((s, i) => {
  const ts = [0, 1, ...cuts[i].map(t => Math.min(1, Math.max(0, t)))].sort((a, b) => a - b);
  for (let k = 0; k + 1 < ts.length; k++) {
   const a = node(s.x1 + (s.x2 - s.x1) * ts[k], s.y1 + (s.y2 - s.y1) * ts[k]), b = node(s.x1 + (s.x2 - s.x1) * ts[k + 1], s.y1 + (s.y2 - s.y1) * ts[k + 1]);
   if (a !== b) { adj.get(a).add(b); adj.get(b).add(a); }
  }
 });
 // dangling ends belong to no face
 for (let pruned = true; pruned;) { pruned = false; for (const [k, n] of adj) if (n.size === 1) { const [o] = n; adj.get(o).delete(k); n.clear(); pruned = true; } }
 const ang = (a, b) => Math.atan2(nodes.get(b).y - nodes.get(a).y, nodes.get(b).x - nodes.get(a).x);
 const order = new Map([...adj].map(([k, n]) => [k, [...n].sort((p, q) => ang(k, p) - ang(k, q))]));
 const out = [];
 for (const [a, ns] of order) for (const b of ns) {
  if (edges.has(a + '>' + b)) continue;
  const ring = []; let u = a, v = b;
  while (!edges.has(u + '>' + v)) {
   edges.add(u + '>' + v); ring.push(nodes.get(u));
   // at v: the next wall clockwise from the one we came along - the face on the left stays on the left
   const around = order.get(v), back = around.indexOf(u), w = around[(back - 1 + around.length) % around.length];
   u = v; v = w;
  }
  // no vertex in the middle of a straight wall
  const pts = ring.filter((p, k) => { const q = ring[(k - 1 + ring.length) % ring.length], r = ring[(k + 1) % ring.length]; return Math.abs((p.x - q.x) * (r.y - p.y) - (p.y - q.y) * (r.x - p.x)) > tol * Math.hypot(r.x - q.x, r.y - q.y); });
  if (pts.length >= 3 && G.area(pts) > 0) out.push(pts);
 }
 return out;
}

// opt: { roomLayers: /ROOM/i (outline layers), wallLayers (LINE drawings: the room layers and the deck / hull outline),
// noLayers, nameLayers }; texts on any layer are matched by content when no layer says: a short token with a digit is the
// number, the rest is the name
function rooms(text, opt = {}) {
 const roomLayer = opt.roomLayers || /^ROOM$|ROOM[_-]?(OUTLINE|LINE|BOUNDARY)|^실$|^A-ROOM/i, wallLayer = opt.wallLayers || /OUTLINE|HULL|WALL|벽/i;
 const ents = entities(text), polys = ents.filter(e => e.type === 'LWPOLYLINE' && (e.flags & 1) && roomLayer.test(e.layer) && e.pts.length >= 3);
 const texts = ents.filter(e => TEXT_TYPES.has(e.type) && Number.isFinite(e.x)).map(e => ({ layer: e.layer, x: e.x, y: e.y, s: decode(e.text) })).filter(t => t.s);
 const lines = polys.length ? [] : ents.filter(e => e.type === 'LINE' && (roomLayer.test(e.layer) || wallLayer.test(e.layer))).map(e => ({ x1: e.x, y1: e.y, x2: e.x2, y2: e.y2 }));
 const out = polys.length ? polys.map(e => ({ polygon: e.pts.map(p => ({ x: p.x, y: p.y })), layer: e.layer, texts: [] }))
  : faces(lines).map(polygon => ({ polygon, layer: 'LINE', texts: [] }));
 // a text belongs to the smallest outline that contains it
 for (const t of texts) { let best = null; for (const r of out) if (G.inside(t, r.polygon)) { const a = Math.abs(G.area(r.polygon)); if (!best || a < best.a) best = { r, a }; } if (best) best.r.texts.push(t); }
 return out.map(r => ({ ...label(r.texts), polygon: r.polygon, areaM2: Math.abs(G.area(r.polygon)) / 1e6, layer: r.layer }));
}

// ---------- an architectural drawing: rooms found from their name texts ----------
// Walls drawn as two lines (their faces) with gaps for the doors, door leaves and swings, furniture: no closed outline and
// no closed face of lines a room could be read from. Here the walls (LINE, polyline edges, ARC) are drawn on a grid,
// each door opening closed by a threshold - two wall ends that face each other along one line, at most maxGapMm apart -
// and the grid cut into its free areas; a free area that holds a room text is that room, its outline traced along the
// grid and straightened. Door, furniture, stair, text and dimension layers are not walls. Units: mm.
const WALL_LAYERS = /WALL|벽|HULL|선체|OUTLINE|외곽|BULKHEAD|격벽|PARTITION|칸막이|WINDOW|창|ROOM|실|DECK|갑판|LINING|PANEL/i;
const NOT_WALL = /DOOR|문|FURN|가구|TEXT|글자|문자|DIM|치수|HATCH|해치|STAIR|계단|EQUIP|장비|GRID|AXIS|CENTER|중심|SYMBOL|기호|TITLE|BORDER|FRAME|도곽|GUIDE|NOTE|주석|DEFPOINTS/i;
function wallSegments(ents, opt = {}) {
 const geo = ents.filter(e => ['LINE', 'LWPOLYLINE', 'ARC', 'CIRCLE'].includes(e.type));
 const named = opt.wallLayers || WALL_LAYERS, notWall = opt.notWallLayers || NOT_WALL;
 // the layers named as walls; a drawing without such names: every layer that is not a door, furniture, text ...
 let walls = geo.filter(e => named.test(e.layer) && !notWall.test(e.layer)); if (!walls.length) walls = geo.filter(e => !notWall.test(e.layer));
 const out = [], add = (x1, y1, x2, y2) => { if (Number.isFinite(x1 + y1 + x2 + y2) && (x1 !== x2 || y1 !== y2)) out.push({ x1, y1, x2, y2 }); };
 for (const e of walls) {
  if (e.type === 'LINE') add(e.x, e.y, e.x2, e.y2);
  else if (e.type === 'LWPOLYLINE') { const p = e.pts; for (let i = 0; i + 1 < p.length; i++) add(p[i].x, p[i].y, p[i + 1].x, p[i + 1].y); if ((e.flags & 1) && p.length > 2) add(p[p.length - 1].x, p[p.length - 1].y, p[0].x, p[0].y); }
  else if (Number.isFinite(e.r) && e.r > 0) {   // an arc (a curved wall, the hull) as chords of at most 10 degrees
   const a0 = e.type === 'CIRCLE' ? 0 : (e.a0 || 0), a1 = e.type === 'CIRCLE' ? 360 : (e.a1 ?? 360), span = ((a1 - a0) % 360 + 360) % 360 || 360, n = Math.max(2, Math.ceil(span / 10));
   for (let k = 0; k < n; k++) { const t0 = (a0 + span * k / n) * Math.PI / 180, t1 = (a0 + span * (k + 1) / n) * Math.PI / 180; add(e.x + e.r * Math.cos(t0), e.y + e.r * Math.sin(t0), e.x + e.r * Math.cos(t1), e.y + e.r * Math.sin(t1)); }
  }
 }
 return out;
}
// door thresholds: from each wall end, the nearest other wall end ahead of it on the same line (5 degrees, 60 mm), facing
// back, more than 1 mm and at most maxGapMm away, crossing no wall. Not between two lines shorter than minWallMm: the
// jambs that close a wall's thickness at an opening face each other across a corridor.
function thresholds(segs, maxGapMm = 1800, minWallMm = 300) {
 const ends = []; for (const s of segs) { const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1); if (L < 1) continue; const ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L, short = L < minWallMm; ends.push({ x: s.x2, y: s.y2, ux, uy, short }, { x: s.x1, y: s.y1, ux: -ux, uy: -uy, short }); }
 // grids of the ends and of the walls (every cell a wall passes) so each looks only near itself
 const cell = maxGapMm, grid = new Map(), walls = new Map(), k = (i, j) => i + ',' + j, put = (m, key, v) => { if (!m.has(key)) m.set(key, []); m.get(key).push(v); };
 for (const e of ends) put(grid, k(Math.floor(e.x / cell), Math.floor(e.y / cell)), e);
 segs.forEach((s, n) => { for (let i = Math.floor(Math.min(s.x1, s.x2) / cell); i <= Math.floor(Math.max(s.x1, s.x2) / cell); i++) for (let j = Math.floor(Math.min(s.y1, s.y2) / cell); j <= Math.floor(Math.max(s.y1, s.y2) / cell); j++) put(walls, k(i, j), n); });
 // does p-q cross a wall inside (not at its own two ends)?
 const crosses = (p, q) => { const near = new Set(); for (const e of [p, q]) { const i0 = Math.floor(e.x / cell), j0 = Math.floor(e.y / cell); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const n of walls.get(k(i, j)) || []) near.add(n); }
  const rx = q.x - p.x, ry = q.y - p.y;
  for (const n of near) { const s = segs[n], sx = s.x2 - s.x1, sy = s.y2 - s.y1, d = rx * sy - ry * sx; if (Math.abs(d) < 1e-9) continue;
   const t = ((s.x1 - p.x) * sy - (s.y1 - p.y) * sx) / d, u = ((s.x1 - p.x) * ry - (s.y1 - p.y) * rx) / d; if (t > 0.01 && t < 0.99 && u > 0.001 && u < 0.999) return true; }
  return false; };
 const cos5 = Math.cos(5 * Math.PI / 180), out = [], seen = new Set();
 for (const p of ends) {
  let best = null; const i0 = Math.floor(p.x / cell), j0 = Math.floor(p.y / cell);
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const q of grid.get(k(i, j)) || []) {
   const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy); if (d <= 1 || d > maxGapMm || (p.short && q.short)) continue;
   if ((dx * p.ux + dy * p.uy) / d < cos5 || Math.abs(dx * p.uy - dy * p.ux) > 60 || -(q.ux * p.ux + q.uy * p.uy) < cos5) continue;
   if ((!best || d < best.d) && !crosses(p, q)) best = { q, d };
  }
  if (!best) continue; const id = [p.x, p.y, best.q.x, best.q.y].map(Math.round).join(','), rid = [best.q.x, best.q.y, p.x, p.y].map(Math.round).join(',');
  if (seen.has(rid)) continue; seen.add(id); out.push({ x1: p.x, y1: p.y, x2: best.q.x, y2: best.q.y });
 }
 return out;
}
// opt: { cellMm (50, larger for a big drawing: at most maxCells), maxGapMm (1800: widest door opening closed), wallLayers,
// notWallLayers }. Returns rooms like rooms() and, for each, the count of texts in its area and of those not its number
// (names > 1: two rooms run together - a wall gap wider than maxGapMm or not drawn - or a note in the room).
function roomsByText(text, opt = {}) {
 const ents = entities(text), texts = ents.filter(e => TEXT_TYPES.has(e.type) && Number.isFinite(e.x)).map(e => ({ layer: e.layer, x: e.x, y: e.y, s: decode(e.text) })).filter(t => t.s);
 const walls = wallSegments(ents, opt); if (!walls.length || !texts.length) return [];
 const segs = walls.concat(thresholds(walls, opt.maxGapMm ?? 1800));
 let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const s of walls) { x0 = Math.min(x0, s.x1, s.x2); y0 = Math.min(y0, s.y1, s.y2); x1 = Math.max(x1, s.x1, s.x2); y1 = Math.max(y1, s.y1, s.y2); }
 const maxCells = opt.maxCells || 8e6; let c = opt.cellMm || 50; while (((x1 - x0) / c + 5) * ((y1 - y0) / c + 5) > maxCells) c *= 1.5;
 // two free cells all round: the outside is one area that reaches the border
 const nx = Math.ceil((x1 - x0) / c) + 5, ny = Math.ceil((y1 - y0) / c) + 5, ox = x0 - 2 * c, oy = y0 - 2 * c, wall = new Uint8Array(nx * ny);
 // a wall marks every cell its line passes through (no gap a 4-way fill could slip through)
 for (const s of segs) {
  const ax = (s.x1 - ox) / c, ay = (s.y1 - oy) / c, bx = (s.x2 - ox) / c, by = (s.y2 - oy) / c, n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2) + 1;
  let pi = -1, pj = -1;
  for (let k = 0; k <= n; k++) { const i = Math.floor(ax + (bx - ax) * k / n), j = Math.floor(ay + (by - ay) * k / n);
   if (i === pi && j === pj) continue; wall[j * nx + i] = 1; if (pi >= 0 && i !== pi && j !== pj) wall[pj * nx + i] = 1; pi = i; pj = j; }
 }
 // the free areas, 4-way
 const lab = new Int32Array(nx * ny).fill(-1), sizes = [], touches = [], boxes = []; let n = 0; const stack = [];
 for (let s0 = 0; s0 < nx * ny; s0++) { if (wall[s0] || lab[s0] >= 0) continue;
  lab[s0] = n; stack.push(s0); let size = 0, edge = false; const bb = [nx, ny, 0, 0];
  while (stack.length) { const q = stack.pop(), i = q % nx, j = (q - i) / nx; size++; if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) edge = true;
   if (i < bb[0]) bb[0] = i; if (j < bb[1]) bb[1] = j; if (i > bb[2]) bb[2] = i; if (j > bb[3]) bb[3] = j;
   for (const r of [i > 0 ? q - 1 : -1, i < nx - 1 ? q + 1 : -1, j > 0 ? q - nx : -1, j < ny - 1 ? q + nx : -1]) if (r >= 0 && !wall[r] && lab[r] < 0) { lab[r] = n; stack.push(r); } }
  sizes.push(size); touches.push(edge); boxes.push(bb); n++; }
 // each text to its area (a text on a wall line: the nearest free cell within 300 mm)
 const byArea = new Map(), reach = Math.ceil(300 / c);
 for (const t of texts) {
  const i0 = Math.floor((t.x - ox) / c), j0 = Math.floor((t.y - oy) / c); let a = -1;
  for (let d = 0; d <= reach && a < 0; d++) for (let i = i0 - d; i <= i0 + d && a < 0; i++) for (let j = j0 - d; j <= j0 + d && a < 0; j++) if (i >= 0 && j >= 0 && i < nx && j < ny && lab[j * nx + i] >= 0) a = lab[j * nx + i];
  if (a < 0 || touches[a]) continue; if (!byArea.has(a)) byArea.set(a, []); byArea.get(a).push(t);
 }
 const out = [];
 for (const [a, ts] of byArea) {
  const polygon = traceArea(lab, nx, ny, a, boxes[a]).map(p => ({ x: ox + p.x * c, y: oy + p.y * c })), areaM2 = Math.abs(G.area(polygon)) / 1e6;
  const lb = label(ts); out.push({ ...lb, polygon, areaM2, layer: 'TEXT-AREA', texts: ts.length, names: ts.filter(t => t.s !== lb.no).length });
 }
 return out;
}
// the outline of one free area (grid corners, counter-clockwise), corners only, then straightened (Douglas-Peucker, one
// cell) so a sloping or curved wall is not a staircase
function traceArea(lab, nx, ny, a, bb = [0, 0, nx - 1, ny - 1]) {
 const inA = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && lab[j * nx + i] === a, next = new Map(), W = nx + 1, K = (x, y) => y * W + x;
 const push = (x, y, x2, y2) => { const k = K(x, y); if (!next.has(k)) next.set(k, []); next.get(k).push([x2, y2]); };
 for (let j = bb[1]; j <= bb[3]; j++) for (let i = bb[0]; i <= bb[2]; i++) { if (!inA(i, j)) continue;
  if (!inA(i, j - 1)) push(i, j, i + 1, j); if (!inA(i + 1, j)) push(i + 1, j, i + 1, j + 1); if (!inA(i, j + 1)) push(i + 1, j + 1, i, j + 1); if (!inA(i - 1, j)) push(i, j + 1, i, j); }
 // every loop; the area's outline is the longest (the others are holes: a pillar, a free-standing room)
 const loops = [];
 while (next.size) {
  const k0 = next.keys().next().value, start = [k0 % W, Math.floor(k0 / W)];
  const loop = []; let cur = start, prevDir = null;
  for (let guard = 0; guard < 4 * (bb[2] - bb[0] + 2) * (bb[3] - bb[1] + 2); guard++) {
   const k = K(cur[0], cur[1]), opts = next.get(k); if (!opts || !opts.length) break;
   // where two cells of the area touch at a corner: turn left first, so a loop does not cross itself
   let pick = 0; if (opts.length > 1 && prevDir) { const left = [-prevDir[1], prevDir[0]]; const li = opts.findIndex(o => o[0] - cur[0] === left[0] && o[1] - cur[1] === left[1]); if (li >= 0) pick = li; }
   const nx2 = opts.splice(pick, 1)[0]; if (!opts.length) next.delete(k);
   loop.push({ x: cur[0], y: cur[1] }); prevDir = [nx2[0] - cur[0], nx2[1] - cur[1]]; cur = nx2;
   if (cur[0] === start[0] && cur[1] === start[1]) break;
  }
  loops.push(loop);
 }
 const loop = loops.sort((p, q) => Math.abs(G.area(q)) - Math.abs(G.area(p)))[0] || [];
 const corners = loop.filter((p, k) => { const q = loop[(k - 1 + loop.length) % loop.length], r = loop[(k + 1) % loop.length]; return (p.x - q.x) * (r.y - p.y) - (p.y - q.y) * (r.x - p.x) !== 0; });
 return simplifyRing(corners, 1.01);
}
function simplifyRing(pts, eps) {
 if (pts.length <= 4) return pts;
 const dp = (a, b, lo, hi, keep) => { let m = -1, md = eps; for (let k = lo + 1; k < hi; k++) { const p = pts[k], L = Math.hypot(b.x - a.x, b.y - a.y) || 1, d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L; if (d > md) { md = d; m = k; } } if (m >= 0) { keep[m] = 1; dp(a, pts[m], lo, m, keep); dp(pts[m], b, m, hi, keep); } };
 // split at the corner farthest from the first: two open chains
 let far = 0, fd = -1; for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k].x - pts[0].x, pts[k].y - pts[0].y); if (d > fd) { fd = d; far = k; } }
 const keep = new Uint8Array(pts.length); keep[0] = keep[far] = 1; pts.push(pts[0]); dp(pts[0], pts[far], 0, far, keep); dp(pts[far], pts[pts.length - 1], far, pts.length - 1, keep); pts.pop();
 return pts.filter((_, k) => keep[k]);
}
// a room's number and name from its texts (the same rule as rooms())
function label(ts) {
 const no = ts.find(t => /NO|NUM|번호/i.test(t.layer)) || ts.find(t => /^[A-Z]?\d+[A-Z]?$/i.test(t.s));
 const name = ts.find(t => /NAME|이름|실명/i.test(t.layer) && t !== no) || ts.find(t => t !== no);
 return { no: no?.s || null, name: name?.s || '' };
}
// the reading that finds the most named rooms: room outlines / faces of the wall lines (exact) first, every LINE as a
// wall, then the rooms found from their texts (an architectural drawing) - taken only when the exact readings name fewer
// than half as many rooms (a drawing with ducts and labels drawn over the rooms cuts them into more text areas than rooms)
function bestRooms(text, opt = {}) {
 const named = rs => rs.filter(r => r.areaM2 >= (opt.minM2 ?? 0.3) && (r.name || r.no)).length;
 let best = { rooms: rooms(text, opt), how: 'outline' };
 if (!named(best.rooms)) { const all = rooms(text, { ...opt, wallLayers: /./ }); if (named(all) > named(best.rooms)) best = { rooms: all, how: 'lines' }; }
 const byText = roomsByText(text, opt); if (named(best.rooms) * 2 < named(byText)) best = { rooms: byText, how: 'text' };
 return best;
}

// a drawing against the contract rooms of one deck: matched by number; outline area and position differences
function compare(drawingRooms, contract, deckId, tolM2 = 0.05) {
 const mine = contract.rooms.filter(r => r.deckId === deckId), out = { matched: [], missingInDrawing: [], extraInDrawing: [], areaDiffs: [], nameDiffs: [] };
 const byNo = new Map(drawingRooms.filter(r => r.no).map(r => [r.no, r]));
 for (const r of mine) {
  const d = byNo.get(r.no); if (!d) { out.missingInDrawing.push(r.no); continue; }
  out.matched.push(r.no); byNo.delete(r.no);
  const a = Math.abs(G.area(r.polygon)) / 1e6; if (Math.abs(a - d.areaM2) > tolM2) out.areaDiffs.push({ no: r.no, contractM2: Math.round(a * 100) / 100, drawingM2: Math.round(d.areaM2 * 100) / 100 });
  if ((d.name || '') !== (r.name || '')) out.nameDiffs.push({ no: r.no, contract: r.name, drawing: d.name });
 }
 out.extraInDrawing = [...byNo.keys()];
 out.ok = !out.missingInDrawing.length && !out.extraInDrawing.length && !out.areaDiffs.length;
 return out;
}

module.exports = { pairs, entities, rooms, faces, compare, decode, roomsByText, bestRooms, wallSegments, thresholds };
