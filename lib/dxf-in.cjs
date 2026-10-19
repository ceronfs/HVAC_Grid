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
 for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
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
 const texts = ents.filter(e => (e.type === 'TEXT' || e.type === 'MTEXT') && Number.isFinite(e.x)).map(e => ({ layer: e.layer, x: e.x, y: e.y, s: decode(e.text) })).filter(t => t.s);
 const lines = polys.length ? [] : ents.filter(e => e.type === 'LINE' && (roomLayer.test(e.layer) || wallLayer.test(e.layer))).map(e => ({ x1: e.x, y1: e.y, x2: e.x2, y2: e.y2 }));
 const out = polys.length ? polys.map(e => ({ polygon: e.pts.map(p => ({ x: p.x, y: p.y })), layer: e.layer, texts: [] }))
  : faces(lines).map(polygon => ({ polygon, layer: 'LINE', texts: [] }));
 // a text belongs to the smallest outline that contains it
 for (const t of texts) { let best = null; for (const r of out) if (G.inside(t, r.polygon)) { const a = Math.abs(G.area(r.polygon)); if (!best || a < best.a) best = { r, a }; } if (best) best.r.texts.push(t); }
 return out.map(r => {
  const no = r.texts.find(t => /NO|NUM|번호/i.test(t.layer)) || r.texts.find(t => /^[A-Z]?\d+[A-Z]?$/i.test(t.s));
  const name = r.texts.find(t => /NAME|이름|실명/i.test(t.layer) && t !== no) || r.texts.find(t => t !== no);
  return { no: no?.s || null, name: name?.s || '', polygon: r.polygon, areaM2: Math.abs(G.area(r.polygon)) / 1e6, layer: r.layer };
 });
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

module.exports = { pairs, entities, rooms, faces, compare, decode };
