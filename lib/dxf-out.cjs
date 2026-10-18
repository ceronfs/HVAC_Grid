// Integrated DXF (AC1015, mm): every deck side by side, each with its rooms, the RUs, ducts (with size labels), the unit
// and the shafts of every system, fire boundaries on one layer per rating, and the penetrations. Pure - returns text.
'use strict';
const G = require('./phg-plan.cjs');

const ACI = { 'A-60': 1, 'A-30': 30, 'A-15': 40, 'A-0': 2, 'B-15': 5, 'B-0': 4, C: 8, '*': 9 };
const KIND_ACI = { supply: 5, exhaust: 6, return: 3 };
const layerOfGrade = g => 'FIRE_' + String(g).replace('*', 'STAR').replace('-', '');

// opt: { plans, geometry, boundaries, penetrations, risers, gapMm }
function integratedDxf(contract, opt = {}) {
 const L = [], add = (...kv) => { for (let i = 0; i < kv.length; i += 2) L.push(String(kv[i]), String(kv[i + 1])); };
 let handle = 0x100; const h = () => (handle++).toString(16).toUpperCase();
 const decks = [...contract.decks].sort((a, b) => a.elevationMm - b.elevationMm), gap = opt.gapMm ?? 6000, offset = {};
 let x = 0; for (const d of decks) { const rooms = contract.rooms.filter(r => r.deckId === d.id); if (!rooms.length) continue; const b = G.bbox(rooms.flatMap(r => r.polygon)); offset[d.id] = { dx: x - b.minX, dy: 0, b }; x += b.maxX - b.minX + gap; }
 const layers = new Map([['DECK_TITLE', 7], ['ROOM', 8], ['ROOM_TEXT', 7], ['RISER', 1], ['FIRE_PEN', 1], ['FIRE_PEN_TEXT', 1]]);
 for (const k of ['supply', 'exhaust', 'return']) { layers.set('DUCT_' + k.toUpperCase(), KIND_ACI[k]); layers.set('DUCT_TEXT_' + k.toUpperCase(), KIND_ACI[k]); layers.set('RU_' + k.toUpperCase(), KIND_ACI[k]); layers.set('UNIT_' + k.toUpperCase(), KIND_ACI[k]); }
 for (const g of Object.keys(ACI)) layers.set(layerOfGrade(g), ACI[g]);
 add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 4, 9, '$DWGCODEPAGE', 3, 'ANSI_949', 0, 'ENDSEC');
 add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, layers.size);
 for (const [n, c] of layers) add(0, 'LAYER', 2, n, 70, 0, 62, c, 6, 'CONTINUOUS');
 add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
 const P = (deckId, p) => ({ x: p.x + offset[deckId].dx, y: p.y + offset[deckId].dy });
 const poly = (layer, pts, closed) => { add(0, 'LWPOLYLINE', 5, h(), 8, layer, 90, pts.length, 70, closed ? 1 : 0); for (const p of pts) add(10, Math.round(p.x * 10) / 10, 20, Math.round(p.y * 10) / 10); };
 // non-ASCII text as \U+XXXX: AutoCAD reads it in an AC1015 file whatever the code page (BOX reads it too)
 const uni = s => String(s).replace(/[^\x20-\x7E]/g, ch => '\\U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
 const text = (layer, p, size, s, rot = 0) => add(0, 'TEXT', 5, h(), 8, layer, 10, Math.round(p.x), 20, Math.round(p.y), 30, 0, 40, size, 1, uni(s), 50, rot);
 const circle = (layer, p, r) => add(0, 'CIRCLE', 5, h(), 8, layer, 10, Math.round(p.x), 20, Math.round(p.y), 30, 0, 40, r);
 for (const d of decks) {
  if (!offset[d.id]) continue; const b = offset[d.id].b;
  text('DECK_TITLE', P(d.id, { x: b.minX, y: b.maxY + 900 }), 450, `${d.name} (Z ${d.elevationMm})`);
  for (const r of contract.rooms.filter(k => k.deckId === d.id)) {
   poly('ROOM', r.polygon.map(p => P(d.id, p)), true);
   const rb = G.bbox(r.polygon); text('ROOM_TEXT', P(d.id, { x: rb.minX + 120, y: rb.maxY - 300 }), 150, `${r.no || ''} ${r.name || ''}`.trim());
  }
  for (const bd of (opt.boundaries || []).filter(k => k.deckId === d.id && k.kind !== 'deck' && k.grade && k.grade !== '-'))
   poly(layerOfGrade(bd.grade), [P(d.id, bd.a), P(d.id, bd.b)], false);
 }
 for (const p of opt.plans || []) {
  if (!offset[p.deckId]) continue; const K = p.kind.toUpperCase(), g = (opt.geometry || {})[p.key];
  for (const dct of g?.ducts || []) {
   const pts = dct.points.map(q => P(p.deckId, { x: q.x, y: -q.y })); poly('DUCT_' + K, pts, false);
   const size = dct.widthMm ? `${dct.widthMm}x${dct.heightMm}` : dct.diameterMm ? `D${dct.diameterMm}` : '';
   if (size && pts.length > 1) { const a = pts[0], b = pts[1], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, rot = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 0 : 90;
    text('DUCT_TEXT_' + K, { x: mid.x + (rot ? -60 : 0), y: mid.y + (rot ? 0 : 60) }, 90, `${size} ${Math.round(dct.flowCmh || 0)}CMH`, rot); }
  }
  for (const u of p.rus) { const q = P(p.deckId, u); poly('RU_' + K, [{ x: q.x - 150, y: q.y - 150 }, { x: q.x + 150, y: q.y - 150 }, { x: q.x + 150, y: q.y + 150 }, { x: q.x - 150, y: q.y + 150 }], true); text('RU_' + K, { x: q.x + 180, y: q.y - 60 }, 90, `${u.flowCmh}`); }
  const r = P(p.deckId, p.root);
  if (p.isUnitDeck) { poly('UNIT_' + K, [{ x: r.x - 300, y: r.y - 300 }, { x: r.x + 300, y: r.y - 300 }, { x: r.x + 300, y: r.y + 300 }, { x: r.x - 300, y: r.y + 300 }], true); text('UNIT_' + K, { x: r.x - 300, y: r.y + 380 }, 120, p.systemId); }
  else { circle('UNIT_' + K, r, 250); text('UNIT_' + K, { x: r.x - 300, y: r.y + 330 }, 100, p.systemId + ' 수직'); }
 }
 for (const rs of opt.risers || []) for (const dk of [rs.fromDeckId, rs.toDeckId]) if (offset[dk]) {
  const at = P(dk, dk === rs.fromDeckId ? rs.from : rs.to); circle('RISER', at, 180);
  text('RISER', { x: at.x + 260, y: at.y - 260 }, 90, `${rs.systemId} ${rs.widthMm}x${rs.heightMm} ${rs.flowCmh}CMH ${rs.fromDeckId}-${rs.toDeckId}`);
 }
 for (const pn of opt.penetrations || []) if (offset[pn.deckId]) {
  const at = P(pn.deckId, pn); circle('FIRE_PEN', at, 120);
  text('FIRE_PEN_TEXT', { x: at.x + 150, y: at.y + 150 }, 80, `${pn.no} ${pn.grade || '?'} ${pn.damper ? 'FD' : pn.sleeveMm ? 'SL' + pn.sleeveMm : ''}`.trim());
 }
 add(0, 'ENDSEC', 0, 'EOF');
 return L.join('\r\n') + '\r\n';
}

module.exports = { integratedDxf, layerOfGrade };
