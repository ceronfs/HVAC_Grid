// Room drawing reader (pure): closed LWPOLYLINE / POLYLINE outlines on a room layer + the room number and name TEXT /
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

// opt: { roomLayers: /ROOM/i (outline layers), noLayers, nameLayers }; texts on any layer are matched by content when no
// layer says: a short token with a digit is the number, the rest is the name
function rooms(text, opt = {}) {
 const roomLayer = opt.roomLayers || /^ROOM$|ROOM[_-]?(OUTLINE|LINE|BOUNDARY)|^실$|^A-ROOM/i;
 const ents = entities(text), polys = ents.filter(e => e.type === 'LWPOLYLINE' && (e.flags & 1) && roomLayer.test(e.layer) && e.pts.length >= 3);
 const texts = ents.filter(e => (e.type === 'TEXT' || e.type === 'MTEXT') && Number.isFinite(e.x)).map(e => ({ layer: e.layer, x: e.x, y: e.y, s: decode(e.text) })).filter(t => t.s);
 const out = polys.map(e => ({ polygon: e.pts.map(p => ({ x: p.x, y: p.y })), layer: e.layer, texts: [] }));
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

module.exports = { pairs, entities, rooms, compare, decode };
