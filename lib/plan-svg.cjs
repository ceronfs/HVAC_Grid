// Deck plan as standalone SVG (pure): rooms tinted by system, ducts with their size, RUs, the unit / shaft, fire
// boundaries coloured by rating and the penetrations. Used by the HTML report; colours work on white paper.
'use strict';
const G = require('./phg-plan.cjs');

const GRADE_COLORS = { 'A-60': '#b3261e', 'A-30': '#d4542b', 'A-15': '#e07b39', 'A-0': '#c99400', 'B-15': '#2f6fb3', 'B-0': '#5b8fd1', C: '#8a8f98', '*': '#b9bec6', '-': '#d9dce1' };
const KIND_COLORS = { supply: '#1f5fa8', exhaust: '#a0307a', return: '#00796b' };
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// opt: { plans, geometry, boundaries, penetrations, kinds: ['supply',...], width }
function deckSvg(contract, deckId, opt = {}) {
 const rooms = contract.rooms.filter(r => r.deckId === deckId); if (!rooms.length) return '';
 const xs = rooms.flatMap(r => r.polygon.map(p => p.x)), ys = rooms.flatMap(r => r.polygon.map(p => -p.y));
 const pad = 800, minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad, W = maxX - minX, H = maxY - minY;
 const px = (opt.width || 900) / W, s = v => v / px;   // s(n): n screen px in drawing units
 const kinds = opt.kinds || ['supply', 'exhaust', 'return'], plans = (opt.plans || []).filter(p => p.deckId === deckId && kinds.includes(p.kind));
 let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${W} ${H}" width="${opt.width || 900}" height="${Math.round((opt.width || 900) * H / W)}" font-family="Malgun Gothic, sans-serif">`;
 out += `<rect x="${minX}" y="${minY}" width="${W}" height="${H}" fill="#fff"/>`;
 for (const r of rooms) {
  const pts = r.polygon.map(p => `${p.x},${-p.y}`).join(' '), b = G.bbox(r.polygon), sup = r.systems.supply;
  out += `<polygon points="${pts}" fill="${sup ? '#e8eef7' : '#f6f6f4'}" stroke="#555" stroke-width="${s(0.8)}"><title>${esc(r.no)} ${esc(r.name)}</title></polygon>`;
  if ((b.maxX - b.minX) * px > 26 && (b.maxY - b.minY) * px > 14) out += `<text x="${b.minX + s(3)}" y="${-b.maxY + s(10)}" font-size="${s(8)}" fill="#333">${esc(r.no)}</text>`;
 }
 // fire boundaries (bulkheads and outer walls) by rating, under the ducts
 for (const bd of (opt.boundaries || []).filter(x => x.deckId === deckId && x.kind !== 'deck' && x.grade && !['-', '*', 'C'].includes(x.grade)))
  out += `<line x1="${bd.a.x}" y1="${-bd.a.y}" x2="${bd.b.x}" y2="${-bd.b.y}" stroke="${GRADE_COLORS[bd.grade] || '#888'}" stroke-width="${s(/^A-60/.test(bd.grade) ? 3.2 : /^A/.test(bd.grade) ? 2.4 : 1.6)}" stroke-linecap="round"><title>${esc(bd.grade)}</title></line>`;
 for (const p of plans) {
  const g = (opt.geometry || {})[p.key], col = KIND_COLORS[p.kind];
  for (const d of g?.ducts || []) out += `<polyline points="${d.points.map(q => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${s(d.type === 'main' ? 2.6 : 1.6)}" stroke-opacity=".85"><title>${esc(p.systemId)} ${esc(d.displayName || '')} ${d.widthMm ? d.widthMm + '×' + d.heightMm : d.diameterMm ? 'Ø' + d.diameterMm : ''} · ${Math.round(d.flowCmh || 0)} CMH</title></polyline>`;
  for (const u of p.rus) out += `<rect x="${u.x - s(3)}" y="${-u.y - s(3)}" width="${s(6)}" height="${s(6)}" fill="#fff" stroke="${col}" stroke-width="${s(1.2)}"><title>${esc(u.id)} · ${u.flowCmh} CMH</title></rect>`;
  const sz = s(p.isUnitDeck ? 11 : 9);
  out += p.isUnitDeck ? `<rect x="${p.root.x - sz / 2}" y="${-p.root.y - sz / 2}" width="${sz}" height="${sz}" fill="${col}"><title>${esc(p.systemId)} 공조기·팬</title></rect>`
   : `<circle cx="${p.root.x}" cy="${-p.root.y}" r="${sz / 2}" fill="#fff" stroke="${col}" stroke-width="${s(2)}"><title>${esc(p.systemId)} 수직 덕트</title></circle>`;
 }
 for (const pn of (opt.penetrations || []).filter(x => x.deckId === deckId)) {
  const c = pn.damper ? '#b3261e' : /SIZE|CHECK/.test(pn.code) ? '#c99400' : '#333';
  out += `<g><circle cx="${pn.x}" cy="${-pn.y}" r="${s(4)}" fill="${pn.damper ? c : '#fff'}" stroke="${c}" stroke-width="${s(1.2)}"/><title>${esc(pn.no)} ${esc(pn.grade || '?')} · ${esc(pn.text)}</title></g>`;
  if (pn.damper) out += `<text x="${pn.x + s(5)}" y="${-pn.y - s(4)}" font-size="${s(7)}" fill="${c}">${esc(pn.no)} FD</text>`;
 }
 return out + '</svg>';
}

module.exports = { deckSvg, GRADE_COLORS, KIND_COLORS };
