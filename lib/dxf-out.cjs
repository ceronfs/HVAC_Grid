// Integrated DXF, R12 (AC1009 - the simplest version every CAD program reads, no handles or object dictionaries), mm:
// every deck side by side, each with its rooms, the RUs, ducts (with size labels), the unit and the shafts of every
// system, vertical ducts, fire boundaries on one layer per rating (bulkheads as lines, decks as the outline of the
// smaller room), the penetrations and, below the decks, the system diagrams (lib/diagram.cjs). Text as \U+XXXX (AutoCAD reads it whatever the code page). Pure - returns text.
'use strict';
const GE = require('./geom.cjs'), { dxfText, num } = require('./util.cjs');

const ACI = { 'A-60': 1, 'A-30': 30, 'A-15': 40, 'A-0': 2, 'B-15': 5, 'B-0': 4, C: 8, '*': 9 };
const KIND_ACI = { supply: 5, exhaust: 6, return: 3 };
const layerOfGrade = g => 'FIRE_' + String(g).replace('*', 'STAR').replace('-', '');

// opt: { plans, geometry, boundaries, penetrations, risers, diagrams, gapMm }
function integratedDxf(contract, opt = {}) {
 const L = [], add = (...kv) => { for (let i = 0; i < kv.length; i += 2) L.push(String(kv[i]), String(kv[i + 1])); };
 const decks = [...contract.decks].sort((a, b) => a.elevationMm - b.elevationMm), gap = opt.gapMm ?? 6000, offset = {};
 let x = 0; for (const d of decks) { const rooms = contract.rooms.filter(r => r.deckId === d.id); if (!rooms.length) continue; const b = GE.bbox(rooms.flatMap(r => r.polygon)); offset[d.id] = { dx: x - b.minX, b }; x += b.maxX - b.minX + gap; }
 const layers = new Map([['DECK_TITLE', 7], ['ROOM', 8], ['ROOM_TEXT', 7], ['RISER', 1], ['FIRE_PEN', 1], ['FIRE_PEN_TEXT', 1], ['DIAGRAM_TEXT', 7], ['DIAGRAM_GRID', 8]]);
 for (const k of ['supply', 'exhaust', 'return']) layers.set('DIAGRAM_' + k.toUpperCase(), KIND_ACI[k]);
 for (const k of ['supply', 'exhaust', 'return']) for (const p of ['DUCT_', 'DUCT_TEXT_', 'RU_', 'UNIT_']) layers.set(p + k.toUpperCase(), KIND_ACI[k]);
 for (const g of Object.keys(ACI)) { layers.set(layerOfGrade(g), ACI[g]); layers.set('FIRE_DECK_' + layerOfGrade(g).slice(5), ACI[g]); }
 add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$DWGCODEPAGE', 3, 'ANSI_949', 0, 'ENDSEC');
 add(0, 'SECTION', 2, 'TABLES');
 add(0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
 add(0, 'TABLE', 2, 'LAYER', 70, layers.size + 1, 0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS');
 for (const [n, c] of layers) add(0, 'LAYER', 2, n, 70, 0, 62, c, 6, 'CONTINUOUS');
 add(0, 'ENDTAB', 0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, 'txt', 4, '', 0, 'ENDTAB', 0, 'ENDSEC');
 add(0, 'SECTION', 2, 'BLOCKS', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
 const r1 = v => Math.round(num(v) * 10) / 10;
 const P = (deckId, p) => ({ x: num(p.x) + offset[deckId].dx, y: num(p.y) });
 const poly = (layer, pts, closed) => { add(0, 'POLYLINE', 8, layer, 66, 1, 70, closed ? 1 : 0, 10, 0, 20, 0, 30, 0); for (const p of pts) add(0, 'VERTEX', 8, layer, 10, r1(p.x), 20, r1(p.y), 30, 0); add(0, 'SEQEND', 8, layer); };
 const line = (layer, a, b) => add(0, 'LINE', 8, layer, 10, r1(a.x), 20, r1(a.y), 30, 0, 11, r1(b.x), 21, r1(b.y), 31, 0);
 const text = (layer, p, size, s, rot = 0) => add(0, 'TEXT', 8, layer, 10, Math.round(p.x), 20, Math.round(p.y), 30, 0, 40, size, 1, dxfText(s, true), 50, rot);
 const circle = (layer, p, r) => add(0, 'CIRCLE', 8, layer, 10, Math.round(p.x), 20, Math.round(p.y), 30, 0, 40, r);
 const room = id => contract.rooms.find(r => r.id === id);
 for (const d of decks) {
  if (!offset[d.id]) continue; const b = offset[d.id].b;
  text('DECK_TITLE', P(d.id, { x: b.minX, y: b.maxY + 900 }), 450, `${d.name} (Z ${d.elevationMm})`);
  for (const r of contract.rooms.filter(k => k.deckId === d.id)) {
   poly('ROOM', r.polygon.map(p => P(d.id, p)), true); for (const h of r.holes || []) if (h.length > 2) poly('ROOM', h.map(p => P(d.id, p)), true);
   const rb = GE.bbox(r.polygon); text('ROOM_TEXT', P(d.id, { x: rb.minX + 120, y: rb.maxY - 300 }), 150, `${r.no || ''} ${r.name || ''}`.trim());
  }
  for (const bd of (opt.boundaries || []).filter(k => k.deckId === d.id && k.a && k.b && k.grade && k.grade !== '-')) line(layerOfGrade(bd.grade), P(d.id, bd.a), P(d.id, bd.b));
  // deck boundaries: the smaller of the two rooms outlines the rated deck area (on the upper deck's drawing)
  for (const bd of (opt.boundaries || []).filter(k => k.deckId === d.id && k.kind === 'deck' && k.grade && /^[AB]-/.test(k.grade))) {
   const a = room(bd.roomA), c = room(bd.roomB), small = a && c ? (GE.roomArea(a) <= GE.roomArea(c) ? a : c) : a || c;
   if (small) poly('FIRE_DECK_' + layerOfGrade(bd.grade).slice(5), GE.inset(small.polygon, 60).map(p => P(d.id, p)), true);
  }
 }
 for (const p of opt.plans || []) {
  if (!offset[p.deckId]) continue; const K = p.kind.toUpperCase(), g = (opt.geometry || {})[p.key];
  for (const dct of g?.ducts || []) {
   const pts = (dct.points || []).map(q => P(p.deckId, { x: q.x, y: -q.y })); if (pts.length < 2) continue; poly('DUCT_' + K, pts, false);
   const size = num(dct.widthMm) ? `${num(dct.widthMm)}x${num(dct.heightMm)}` : num(dct.diameterMm) ? `D${num(dct.diameterMm)}` : '';
   if (size) { const a = pts[0], b = pts[1], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, rot = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 0 : 90;
    text('DUCT_TEXT_' + K, { x: mid.x + (rot ? -60 : 0), y: mid.y + (rot ? 0 : 60) }, 90, `${size} ${Math.round(num(dct.flowCmh))}CMH`, rot); }
  }
  for (const u of p.rus) { const q = P(p.deckId, u); poly('RU_' + K, [{ x: q.x - 150, y: q.y - 150 }, { x: q.x + 150, y: q.y - 150 }, { x: q.x + 150, y: q.y + 150 }, { x: q.x - 150, y: q.y + 150 }], true); text('RU_' + K, { x: q.x + 180, y: q.y - 60 }, 90, `${u.flowCmh}`); }
  const r = P(p.deckId, p.root);
  if (p.isUnitDeck) { poly('UNIT_' + K, [{ x: r.x - 300, y: r.y - 300 }, { x: r.x + 300, y: r.y - 300 }, { x: r.x + 300, y: r.y + 300 }, { x: r.x - 300, y: r.y + 300 }], true); text('UNIT_' + K, { x: r.x - 300, y: r.y + 380 }, 120, p.systemId); }
  else { circle('UNIT_' + K, r, 250); text('UNIT_' + K, { x: r.x - 300, y: r.y + 330 }, 100, p.systemId + ' 수직'); }
 }
 // risers sharing a shaft point on a deck: their labels one under the other; decks by name (a DXF-born deck's id is made up)
 const deckName = id => contract.decks.find(d => d.id === id)?.name || id;
 const labelsAt = new Map();
 for (const rs of opt.risers || []) for (const dk of [rs.fromDeckId, rs.toDeckId]) if (offset[dk]) {
  const at = P(dk, dk === rs.fromDeckId ? rs.from : rs.to), spot = `${dk}|${Math.round(at.x)}|${Math.round(at.y)}`, n = labelsAt.get(spot) || 0; labelsAt.set(spot, n + 1);
  if (!n) circle('RISER', at, 180);
  text('RISER', { x: at.x + 260, y: at.y - 260 - n * 150 }, 90, `${rs.systemId} ${rs.widthMm}x${rs.heightMm} ${rs.flowCmh}CMH ${deckName(rs.fromDeckId)}-${deckName(rs.toDeckId)}`);
 }
 for (const pn of opt.penetrations || []) if (offset[pn.deckId]) {
  const at = P(pn.deckId, pn); circle('FIRE_PEN', at, 120);
  text('FIRE_PEN_TEXT', { x: at.x + 150, y: at.y + 150 }, 80, `${pn.no} ${pn.grade || '?'} ${pn.damper ? 'FD' : pn.sleeveMm ? 'SL' + pn.sleeveMm : ''}`.trim());
 }
 // system diagrams under the decks, three to a row; 1 diagram unit = 20 mm, y down in the diagram, up in the DXF
 const dias = opt.diagrams || [];
 if (dias.length) {
  const S = 20, all = Object.values(offset).map(o => o.b), y0 = (all.length ? Math.min(...all.map(b => b.minY)) : 0) - 5000, cellW = (900) * S, cols = 3;
  text('DECK_TITLE', { x: 0, y: y0 }, 450, '계통도');
  const layerOf = (it, k) => it.c === '#c8cdd2' ? 'DIAGRAM_GRID' : it.t === 'text' && !/^#(1f5fa8|a05e17|147c61)$/.test(it.c) ? 'DIAGRAM_TEXT' : 'DIAGRAM_' + k.toUpperCase();
  let top = y0 - 1200;
  for (let i = 0; i < dias.length; i += cols) {
   const row = dias.slice(i, i + cols), h = Math.max(...row.map(d => d.h));
   row.forEach((d, j) => {
    const ox = j * cellW, Q = (x, y) => ({ x: ox + x * S, y: top - y * S });
    for (const it of d.items) {
     const ly = layerOf(it, d.kind);
     if (it.t === 'line') line(ly, Q(it.x1, it.y1), Q(it.x2, it.y2));
     else if (it.t === 'rect') poly(ly, [Q(it.x, it.y), Q(it.x + it.w, it.y), Q(it.x + it.w, it.y + it.h), Q(it.x, it.y + it.h)], true);
     else if (it.t === 'circle') circle(ly, Q(it.x, it.y), it.r * S);
     else if (it.t === 'poly') { const [a, b, c] = it.pts.map(p => Q(p[0], p[1])); add(0, 'SOLID', 8, ly, 10, r1(a.x), 20, r1(a.y), 30, 0, 11, r1(b.x), 21, r1(b.y), 31, 0, 12, r1(c.x), 22, r1(c.y), 32, 0, 13, r1(c.x), 23, r1(c.y), 33, 0); }
     else {
      const p = Q(it.x, it.y), hj = it.anchor === 'middle' ? 1 : it.anchor === 'end' ? 2 : 0;
      add(0, 'TEXT', 8, ly, 10, Math.round(p.x), 20, Math.round(p.y), 30, 0, 40, Math.round(it.size * S * 0.8), 1, dxfText(it.s, true), 50, 0);
      if (hj) add(72, hj, 11, Math.round(p.x), 21, Math.round(p.y), 31, 0);
     }
    }
   });
   top -= (h + 40) * S;
  }
 }
 add(0, 'ENDSEC', 0, 'EOF');
 return L.join('\r\n') + '\r\n';
}

module.exports = { integratedDxf, layerOfGrade };
