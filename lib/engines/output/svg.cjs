// Ver 2.0 deck plan as one SVG (V2-3.9 output, the HTML report): rooms with number and name, fire boundaries by rating,
// ducts, RUs, the unit or shaft, penetrations and the ship's directions; colours that print. Drawn with y up (the
// model's BOX y turned over), as the deck drawings are read. New code (D7); 1.x lib/plan-svg.cjs is the reference.
//   deckSvg({ rooms, assign }, deckId, { plans, nets, boundaries, penetrations, kinds, width, fitMm })
//   fitMm { w, h }: the box the plan prints in - sized so 7 px room names print at 7 pt or more (2.8 px per mm)
'use strict';
const PL = require('../geometry/plan.cjs'), { esc, num } = require('./text.cjs');

const GRADE_COLORS = { 'A-60': '#b3261e', 'A-30': '#d4542b', 'A-15': '#e07b39', 'A-0': '#c99400', 'B-15': '#2f6fb3', 'B-0': '#5b8fd1', C: '#8a8f98', '*': '#b9bec6', '-': '#d9dce1' };
const KIND_COLORS = { supply: '#1f5fa8', exhaust: '#a0307a', return: '#00796b' };
// legend symbols, the shapes the plans draw
const SYMBOL = {
 unit: '<svg width="12" height="12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" fill="#1f5fa8"/></svg>',
 shaft: '<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="#fff" stroke="#1f5fa8" stroke-width="2"/></svg>',
 pen: '<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="#fff" stroke="#333" stroke-width="1.5"/></svg>',
 fd: '<svg width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" fill="#fff" stroke="#111" stroke-width="2"/><line x1="2" y1="10" x2="10" y2="2" stroke="#111" stroke-width="1.5"/></svg>',
 deckPen: '<svg width="12" height="12" aria-hidden="true"><path d="M6 1L11 6L6 11L1 6Z" fill="#fff" stroke="#333" stroke-width="1.5"/></svg>' };
// the ship's directions in a corner: +x forward, +y port
const compass = (ax, ay, s) => `<g font-size="${s(8)}" fill="#444"><line x1="${ax}" y1="${ay}" x2="${ax + s(36)}" y2="${ay}" stroke="#444" stroke-width="${s(1.2)}"/><path d="M${ax + s(36)} ${ay - s(3)}L${ax + s(42)} ${ay}L${ax + s(36)} ${ay + s(3)}Z"/><text x="${ax + s(45)}" y="${ay + s(3)}">선수 FWD</text>`
 + `<line x1="${ax}" y1="${ay}" x2="${ax}" y2="${ay - s(28)}" stroke="#444" stroke-width="${s(1.2)}"/><path d="M${ax - s(3)} ${ay - s(28)}L${ax} ${ay - s(34)}L${ax + s(3)} ${ay - s(28)}Z"/><text x="${ax + s(4)}" y="${ay - s(28)}">좌현 P</text></g>`;

function deckSvg({ rooms: all, assign = {} }, deckId, opt = {}) {
 const rooms = all.filter(r => r.deckId === deckId); if (!rooms.length) return '';
 const xs = rooms.flatMap(r => r.polygon.map(p => p.x)), ys = rooms.flatMap(r => r.polygon.map(p => -p.y)), pad = 1200;
 const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad, W = maxX - minX, H = maxY - minY;
 const width = opt.fitMm ? Math.round(Math.min(opt.fitMm.w, opt.fitMm.h * W / H) * 2.8) : opt.width || 900, px = width / W, s = v => v / px;   // s(n): n screen px in mm
 const kinds = opt.kinds || ['supply', 'exhaust', 'return'], plans = (opt.plans || []).filter(p => p.deckId === deckId && kinds.includes(p.kind));
 let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${W} ${H}" width="${width}" height="${Math.round(width * H / W)}" font-family="Malgun Gothic, sans-serif"><rect x="${minX}" y="${minY}" width="${W}" height="${H}" fill="#fff"/>`;
 let labels = '';   // room numbers and names go last, over everything, with a white halo
 for (const r of rooms) {
  const b = PL.bounds(r.polygon), w = (b.maxX - b.minX) * px, h = (b.maxY - b.minY) * px;
  out += `<polygon points="${r.polygon.map(p => `${num(p.x)},${-num(p.y)}`).join(' ')}" fill="${assign[r.id]?.supply ? '#eef3f9' : '#f6f6f4'}" stroke="#555" stroke-width="${s(0.8)}"><title>${esc(r.no)} ${esc(r.name)}</title></polygon>`;
  // at the top-left corner when it is in the room (not in the cut-out of an L-shaped room), else round its inner point
  let at = { x: b.minX + s(3), y: -b.maxY + s(10) };
  if (!PL.inRoom({ x: at.x + s(4), y: -at.y + s(4) }, r)) { const c = PL.innerPoint(r); at = { x: c.x - s(16), y: -c.y - s(8) }; }
  if (w > 24 && h > 12) labels += `<text x="${at.x}" y="${at.y}" font-size="${s(8)}" fill="#222" font-weight="600">${esc(r.no)}</text>`;
  if (w > 60 && h > 26) labels += `<text x="${at.x}" y="${at.y + s(9)}" font-size="${s(7)}" fill="#444">${esc(String(r.name).slice(0, Math.floor(w / 7)))}</text>`;
 }
 for (const bd of (opt.boundaries || []).filter(x => x.deckId === deckId && x.a && x.b && x.grade && !['-', '*', 'C'].includes(x.grade)))
  out += `<line x1="${num(bd.a.x)}" y1="${-num(bd.a.y)}" x2="${num(bd.b.x)}" y2="${-num(bd.b.y)}" stroke="${GRADE_COLORS[bd.grade] || '#888'}" stroke-width="${s(/^A-60/.test(bd.grade) ? 3.2 : /^A/.test(bd.grade) ? 2.4 : 1.6)}" stroke-linecap="round"><title>${esc(bd.grade)}</title></line>`;
 for (const p of plans) {
  const col = KIND_COLORS[p.kind];
  for (const d of opt.nets?.[p.key]?.ducts || []) out += `<polyline points="${(d.points || []).map(q => `${num(q.x)},${-num(q.y)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${s(d.type === 'main' ? 2.6 : 1.6)}" stroke-opacity=".85"><title>${esc(p.systemId)} ${esc(d.displayName)} ${num(d.widthMm) ? num(d.widthMm) + '×' + num(d.heightMm) : num(d.diameterMm) ? 'Ø' + num(d.diameterMm) : ''} · ${Math.round(num(d.flowCmh))} CMH</title></polyline>`;
  for (const u of p.rus) out += `<rect x="${u.x - s(3)}" y="${-u.y - s(3)}" width="${s(6)}" height="${s(6)}" fill="#fff" stroke="${col}" stroke-width="${s(1.2)}"><title>${esc(u.id)} · ${num(u.flowCmh)} CMH</title></rect>`;
  const sz = s(p.isUnitDeck ? 11 : 9);
  out += p.isUnitDeck ? `<rect x="${p.root.x - sz / 2}" y="${-p.root.y - sz / 2}" width="${sz}" height="${sz}" fill="${col}"><title>${esc(p.systemId)} 공조기·팬</title></rect>`
   : `<circle cx="${p.root.x}" cy="${-p.root.y}" r="${sz / 2}" fill="#fff" stroke="${col}" stroke-width="${s(2)}"><title>${esc(p.systemId)} 수직 덕트</title></circle>`;
 }
 // penetrations: a circle; a square with a slash = fire damper; a diamond = through a deck; damper numbers where room
 const placed = [];
 for (const pn of (opt.penetrations || []).filter(x => x.deckId === deckId)) {
  const x = num(pn.x), y = -num(pn.y), r = s(4), tip = `<title>${esc(pn.no)} ${esc(pn.systemId)} · ${esc(pn.grade || '?')} · ${esc(pn.text)}</title>`;
  if (pn.boundaryKind === 'deck') out += `<path d="M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z" fill="${pn.damper ? '#111' : '#fff'}" stroke="#333" stroke-width="${s(1.2)}">${tip}</path>`;
  else if (pn.damper) out += `<g><rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="#fff" stroke="#111" stroke-width="${s(1.6)}"/><line x1="${x - r}" y1="${y + r}" x2="${x + r}" y2="${y - r}" stroke="#111" stroke-width="${s(1.2)}"/>${tip}</g>`;
  else out += `<circle cx="${x}" cy="${y}" r="${r * 0.8}" fill="#fff" stroke="${/SIZE|CHECK/.test(pn.code) ? '#9a6700' : '#333'}" stroke-width="${s(1.1)}">${tip}</circle>`;
  if (pn.damper && placed.every(q => Math.hypot(q.x - x, q.y - y) > s(40))) { placed.push({ x, y }); out += `<text x="${x + r + s(2)}" y="${y - r}" font-size="${s(7)}" fill="#111">${esc(pn.no)}</text>`; }
 }
 out += compass(minX + s(14), maxY - s(14), s);
 return out + `<g stroke="#fff" stroke-width="${s(2.5)}" paint-order="stroke" stroke-linejoin="round">${labels}</g></svg>`;
}

module.exports = { deckSvg, compass, GRADE_COLORS, KIND_COLORS, SYMBOL };
