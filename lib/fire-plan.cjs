// Fire-rating plan (방화 등급도): SOLAS II-2/9 written on the deck plans - every room with its space category, every
// rated bulkhead with its rating along the wall (one label for a run of one rating on one line, none on short pieces),
// the deck under and over each room, the penetrations with their measure. A model (pure data, from lib/solas.cjs's
// boundaries and penetrations) and two drawings of it: SVG (the app's ⑤ and the report) and a DXF of its own (one layer
// per rating for the lines, the labels on layers of their own so a CAD user can switch them off).
'use strict';
const GE = require('./geom.cjs'), SO = require('./solas.cjs'), { esc, num, dxfText } = require('./util.cjs');
const { GRADE_COLORS, SYMBOL } = require('./plan-svg.cjs');

// minLabelMm: runs shorter than this get no label; joinGapMm: pieces of one wall closer than this are one run
const RULES = Object.freeze({ minLabelMm: 1000, joinGapMm: 60, angleTolDeg: 0.5, offsetTolMm: 40 });
const strictest = gs => gs.filter(g => g && g !== '-').sort((x, y) => SO.rank(x) - SO.rank(y));
const labelled = (g, o) => !!g && g !== '-' && (g !== 'C' || o.showC) && (g !== '*' || o.showOuter);

// solas: { settings, classes, boundaries, penetrations } (analysis().solas); opt: { showC, showOuter, minLabelMm }
function model(contract, solas, opt = {}) {
 const o = { ...RULES, showC: false, showOuter: false, ...opt }, ship = solas.settings.ship, cls = solas.classes || {}, B = solas.boundaries || [];
 const decks = [...contract.decks].sort((a, b) => a.elevationMm - b.elevationMm), out = [];
 const used = { grades: new Set(), cats: new Map() };
 for (const d of decks) {
  const rooms = contract.rooms.filter(r => r.deckId === d.id); if (!rooms.length) continue;
  // rooms: the space and category, the strictest rating under (deck or floor) and over (deck or ceiling) the room
  const pick = gs => { const s = strictest(gs); return s.length ? { grade: s[0], mixed: new Set(s).size > 1 } : null; };
  const roomRecs = rooms.map(r => {
   const c = cls[r.id] || {};
   if (c.cat) used.cats.set(c.cat, SO.catName(ship, c.cat));
   return { id: r.id, no: r.no || '', name: r.name || '', polygon: r.polygon, holes: r.holes || [], at: GE.interiorPoint(r.polygon, 100, r.holes),
    space: c.space || null, cat: c.cat || null, catName: c.cat ? SO.catName(ship, c.cat) : null,
    floor: pick(B.filter(b => (b.kind === 'deck' || b.kind === 'floor') && b.roomB === r.id).map(b => b.grade)),
    ceiling: pick(B.filter(b => (b.kind === 'deck' || b.kind === 'ceiling') && b.roomA === r.id).map(b => b.grade)) };
  });
  // walls: the boundary pieces of one rating and kind on one line, joined into runs
  const groups = new Map();
  for (const b of B) {
   if (b.deckId !== d.id || !b.a || !b.b || !['bulkhead', 'outer', 'void'].includes(b.kind)) continue;
   const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y; if (Math.hypot(dx, dy) < 1) continue;
   let ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang <= -90) ang += 180; if (ang > 90) ang -= 180;   // (-90, 90]: reads left to right
   const ux = Math.cos(ang * Math.PI / 180), uy = Math.sin(ang * Math.PI / 180), off = -b.a.x * uy + b.a.y * ux;
   const grade = b.grade || null, key = [grade || '?', b.kind === 'outer' ? 'O' : 'B', Math.round(ang / o.angleTolDeg), Math.round(off / o.offsetTolMm)].join('|');
   if (!groups.has(key)) groups.set(key, { grade, kind: b.kind === 'outer' ? 'outer' : 'bulkhead', ang, ux, uy, off, items: [] });
   const t0 = b.a.x * ux + b.a.y * uy, t1 = b.b.x * ux + b.b.y * uy;
   groups.get(key).items.push({ t0: Math.min(t0, t1), t1: Math.max(t0, t1), id: b.id, check: (b.check || []).length > 0 });
  }
  const walls = [];
  for (const g of groups.values()) {
   const at = (t) => ({ x: t * g.ux - g.off * g.uy, y: t * g.uy + g.off * g.ux });
   g.items.sort((x, y) => x.t0 - y.t0);
   let run = null;
   const close = () => { if (!run) return; const len = run.t1 - run.t0, a = at(run.t0), b = at(run.t1);
    walls.push({ a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, angle: g.ang, grade: g.grade, kind: g.kind, lengthMm: Math.round(len), ids: run.ids, check: run.check,
     label: (g.grade ? labelled(g.grade, o) : true) && len >= o.minLabelMm });
    if (g.grade && g.grade !== '-') used.grades.add(g.grade); };
   for (const it of g.items) {
    if (run && it.t0 <= run.t1 + o.joinGapMm) { run.t1 = Math.max(run.t1, it.t1); run.ids.push(it.id); run.check = run.check || it.check; }
    else { close(); run = { t0: it.t0, t1: it.t1, ids: [it.id], check: it.check }; }
   }
   close();
  }
  walls.sort((x, y) => SO.rank(y.grade) - SO.rank(x.grade));   // the strictest drawn last (on top)
  const pens = (solas.penetrations || []).filter(p => p.deckId === d.id).map(p => ({ no: p.no, x: p.x, y: p.y, grade: p.grade || null, damper: !!p.damper, sleeveMm: p.sleeveMm || 0, deck: p.boundaryKind === 'deck',
   label: [p.no, p.grade || '?', p.damper ? 'FD' : p.sleeveMm ? 'SL' + p.sleeveMm : ''].filter(Boolean).join(' ') }));
  out.push({ id: d.id, name: d.name || d.id, elevationMm: d.elevationMm, bbox: GE.bbox(rooms.flatMap(r => r.polygon)), rooms: roomRecs, walls, pens });
 }
 return { ship, shipLabel: SO.DATA.ships[ship]?.label || ship, method: solas.settings.method, lowestBelow: solas.settings.lowestBelow || null, options: o, decks: out,
  grades: [...used.grades].sort((x, y) => SO.rank(x) - SO.rank(y)), cats: [...used.cats].sort((x, y) => x[0] - y[0]) };
}

// the text of a room's label: number and name, "(category) space", the deck ratings under and over it (A and B only)
function roomLines(r) {
 const deck = (w, g) => g && /^[AB]-/.test(g.grade) ? `${w} ${g.grade}${g.mixed ? ' 등' : ''}` : '';
 return [`${r.no} ${r.name}`.trim(), r.cat ? `(${r.cat}) ${r.space || ''}`.trim() : '미분류', [deck('바닥', r.floor), deck('천장', r.ceiling)].filter(Boolean).join(' · ')];
}
const WIDTH = { 'A-60': 3.6, 'A-30': 3, 'A-15': 2.8, 'A-0': 2.6, 'B-15': 2, 'B-0': 1.8, C: 1.1, '*': 1 };

// one deck's fire layer laid out for a drawing: the wall runs with their rating labels and the penetrations with theirs
// (FD, SL), in the drawing's units - the report's SVG (toSvg) and the app's plan (⑤, ③ 방화) paint the same layer each
// in its own way. s(v): v screen px in drawing units; flip: the drawing's y up (toSvg) - the app's plan has y down as BOX;
// boxes: label boxes (y down) the penetration labels keep clear of, added to
function layout(d, { s, flip = false, boxes = [] }) {
 const Y = v => flip ? -num(v) : num(v);
 const walls = d.walls.map((wl, i) => ({ i, run: wl, x1: num(wl.a.x), y1: Y(wl.a.y), x2: num(wl.b.x), y2: Y(wl.b.y), color: wl.grade ? (GRADE_COLORS[wl.grade] || '#888') : '#d97706',
  width: s(WIDTH[wl.grade] || 1.4), dash: !wl.grade || wl.grade === '*' ? [s(4), s(3)] : null,
  label: wl.label ? { x: num(wl.mid.x), y: Y(wl.mid.y), rot: flip ? -wl.angle : wl.angle, dy: s(3.3), size: s(9.5), text: wl.grade || '?' } : null }));
 const pens = d.pens.map(p => {
  const x = num(p.x), y = Y(p.y), r = s(3.5), out = { pen: p, x, y, r, label: null };
  if (!(p.damper || p.sleeveMm)) return out;
  // the label beside the symbol, on the first side that keeps clear of the room labels and other penetration labels
  const fs = s(7.5), lw = p.label.length * fs * 0.58, spots = [[x + r + s(1.5), y - r], [x + r + s(1.5), y + r + fs], [x - r - s(1.5) - lw, y - r], [x - r - s(1.5) - lw, y + r + fs]];
  const free = ([lx, ly]) => boxes.every(q => lx + lw < q.x0 || lx > q.x1 || ly < q.y0 || ly - fs > q.y1);
  const [lx, ly] = spots.find(free) || spots[0];
  boxes.push({ x0: lx, x1: lx + lw, y0: ly - fs, y1: ly });
  out.label = { x: lx, y: ly, size: fs, text: p.label }; return out;
 });
 return { walls, pens };
}

// one deck as SVG; opt: { width, fitMm: { w, h } } (as lib/plan-svg.cjs)
function toSvg(m, deckId, opt = {}) {
 const d = m.decks.find(x => x.id === deckId); if (!d) return '';
 const pad = 1200, b = d.bbox, minX = b.minX - pad, maxX = b.maxX + pad, minY = -b.maxY - pad, maxY = -b.minY + pad, W = maxX - minX, H = maxY - minY;
 const width = opt.fitMm ? Math.round(Math.min(opt.fitMm.w, opt.fitMm.h * W / H) * 2.8) : opt.width || 900, px = width / W, s = v => v / px;
 let out = `<svg xmlns="http://www.w3.org/2000/svg" class="fireplan" data-deck="${esc(d.id)}" viewBox="${minX} ${minY} ${W} ${H}" width="${width}" height="${Math.round(width * H / W)}" font-family="Malgun Gothic, sans-serif">`
  + `<defs><pattern id="fp-uncls" width="${s(6)}" height="${s(6)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${s(6)}" stroke="#d9a400" stroke-width="${s(1.2)}"/></pattern></defs>`
  + `<rect x="${minX}" y="${minY}" width="${W}" height="${H}" fill="#fff"/>`;
 let labels = ''; const boxes = [];   // the room labels' boxes (y down), kept clear by the penetration labels
 for (const r of d.rooms) {
  out += `<polygon data-room="${esc(r.id)}" points="${r.polygon.map(p => `${num(p.x)},${-num(p.y)}`).join(' ')}" fill="${r.cat ? '#fff' : 'url(#fp-uncls)'}" stroke="#9aa1a9" stroke-width="${s(0.7)}"><title>${esc(roomLines(r).filter(Boolean).join(' · '))}</title></polygon>`;
  const rb = GE.bbox(r.polygon), w = (rb.maxX - rb.minX) * px, h = (rb.maxY - rb.minY) * px, lines = roomLines(r), x = num(r.at.x), y = -num(r.at.y);
  const show = [w > 34 && h > 16, w > 56 && h > 30, w > 64 && h > 44 && !!lines[2]];
  const rows = lines.map((t, i) => show[i] ? t : null).filter(Boolean), y0 = y - s(5.5) * (rows.length - 1) + s(3);
  rows.forEach((t, i) => { const fs = s(i === 0 ? 9 : 8), ty = y0 + i * s(11), shown = t.slice(0, Math.max(4, Math.floor(w / 7.5))), half = shown.length * fs * 0.5;
   boxes.push({ x0: x - half, x1: x + half, y0: ty - fs, y1: ty + fs * 0.25 });
   labels += `<text x="${x}" y="${ty}" text-anchor="middle" font-size="${fs}" fill="${i === 1 ? (r.cat ? '#1f5fa8' : '#9a6700') : i === 2 ? '#7a2b8a' : '#222'}" font-weight="${i === 1 ? 600 : 400}">${esc(shown)}</text>`; });
 }
 const L = layout(d, { s, flip: true, boxes });
 for (const w of L.walls) {
  const wl = w.run, dash = w.dash ? ` stroke-dasharray="${w.dash[0]} ${w.dash[1]}"` : '';
  out += `<line data-run="${w.i}" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${w.color}" stroke-width="${w.width}" stroke-linecap="round"${dash}><title>${esc(wl.grade || '등급 미정')} · ${(wl.lengthMm / 1000).toFixed(1)} m</title></line>`;
  if (w.label) labels += `<text data-run="${w.i}" x="${w.label.x}" y="${w.label.y}" transform="rotate(${w.label.rot} ${w.label.x} ${w.label.y})" text-anchor="middle" dy="${w.label.dy}" font-size="${w.label.size}" font-weight="700" fill="${w.color}">${esc(w.label.text)}</text>`;
 }
 for (const { pen: p, x, y, r, label } of L.pens) {
  out += p.deck ? `<path d="M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z" fill="${p.damper ? '#111' : '#fff'}" stroke="#333" stroke-width="${s(1.1)}"/>`
   : p.damper ? `<g><rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="#fff" stroke="#111" stroke-width="${s(1.4)}"/><line x1="${x - r}" y1="${y + r}" x2="${x + r}" y2="${y - r}" stroke="#111" stroke-width="${s(1.1)}"/></g>`
   : `<circle cx="${x}" cy="${y}" r="${r * 0.8}" fill="#fff" stroke="#333" stroke-width="${s(1)}"/>`;
  if (label) labels += `<text x="${label.x}" y="${label.y}" font-size="${label.size}" fill="#111">${esc(label.text)}</text>`;
 }
 const ax = minX + s(14), ay = maxY - s(14);
 out += `<g font-size="${s(8)}" fill="#444"><line x1="${ax}" y1="${ay}" x2="${ax + s(36)}" y2="${ay}" stroke="#444" stroke-width="${s(1.2)}"/><path d="M${ax + s(36)} ${ay - s(3)}L${ax + s(42)} ${ay}L${ax + s(36)} ${ay + s(3)}Z"/><text x="${ax + s(45)}" y="${ay + s(3)}">선수 FWD</text>`
  + `<line x1="${ax}" y1="${ay}" x2="${ax}" y2="${ay - s(28)}" stroke="#444" stroke-width="${s(1.2)}"/><path d="M${ax - s(3)} ${ay - s(28)}L${ax} ${ay - s(34)}L${ax + s(3)} ${ay - s(28)}Z"/><text x="${ax + s(4)}" y="${ay - s(28)}">좌현 P</text></g>`;
 return out + `<g stroke="#fff" stroke-width="${s(2.4)}" paint-order="stroke" stroke-linejoin="round">${labels}</g></svg>`;
}

// the legend: line per rating present, the categories present (number and name), the symbols
function legendHtml(m) {
 const ln = g => `<svg width="24" height="10" aria-hidden="true"><line x1="1" y1="5" x2="23" y2="5" stroke="${GRADE_COLORS[g] || '#888'}" stroke-width="${Math.max(1.5, WIDTH[g] || 1.4)}"${g === '*' ? ' stroke-dasharray="4 3"' : ''}/></svg>`;
 return `<div class="fp-legend">${m.grades.map(g => `<span>${ln(g)}${esc(g)}</span>`).join('')}<span><svg width="24" height="10" aria-hidden="true"><line x1="1" y1="5" x2="23" y2="5" stroke="#d97706" stroke-width="2" stroke-dasharray="4 3"/></svg>등급 미정</span>`
  + (m.decks.some(d => d.pens.length) ? `<span>${SYMBOL.fd} 방화댐퍼(FD)</span><span>${SYMBOL.pen} 슬리브(SL)·관통</span><span>${SYMBOL.deckPen} 갑판 관통</span>` : '') + `</div>`
  + `<div class="fp-cats"><b>${esc(m.shipLabel)} · 방화방식 ${esc(m.method)} 범주</b>${m.cats.map(([n, name]) => `<span>(${n}) ${esc(name)}</span>`).join('')}</div>`;
}

// the DXF (R12, mm, every deck side by side with its legend), a file of its own
const ACI = { 'A-60': 1, 'A-30': 30, 'A-15': 40, 'A-0': 2, 'B-15': 5, 'B-0': 4, C: 8, '*': 9 };
const gradeKey = g => String(g || 'NONE').replace('*', 'STAR').replace('-', '');
function toDxf(m, opt = {}) {
 const L = [], add = (...kv) => { for (let i = 0; i < kv.length; i += 2) L.push(String(kv[i]), String(kv[i + 1])); };
 const gap = opt.gapMm ?? 8000, offset = {}; let x0 = 0;
 for (const d of m.decks) { offset[d.id] = x0 - d.bbox.minX; x0 += d.bbox.maxX - d.bbox.minX + gap; }
 const layers = new Map([['DECK_TITLE', 7], ['ROOM', 8], ['ROOM_TEXT', 7], ['FIRE_CAT', 5], ['FIRE_DECK_TEXT', 6], ['FIRE_NONE', 30], ['FIRE_TEXT_NONE', 30], ['FIRE_PEN', 1], ['FIRE_PEN_TEXT', 1], ['LEGEND', 7]]);
 for (const g of Object.keys(ACI)) { layers.set('FIRE_' + gradeKey(g), ACI[g]); layers.set('FIRE_TEXT_' + gradeKey(g), ACI[g]); }
 add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$DWGCODEPAGE', 3, 'ANSI_949', 0, 'ENDSEC');
 add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 2, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0,
  0, 'LTYPE', 2, 'DASHED', 70, 0, 3, '__ __ __', 72, 65, 73, 2, 40, 300, 49, 200, 49, -100, 0, 'ENDTAB');
 add(0, 'TABLE', 2, 'LAYER', 70, layers.size + 1, 0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS');
 for (const [n, c] of layers) add(0, 'LAYER', 2, n, 70, 0, 62, c, 6, /STAR$|NONE$/.test(n) && !/TEXT/.test(n) ? 'DASHED' : 'CONTINUOUS');
 add(0, 'ENDTAB', 0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, 'txt', 4, '', 0, 'ENDTAB', 0, 'ENDSEC');
 add(0, 'SECTION', 2, 'BLOCKS', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
 const r1 = v => Math.round(num(v) * 10) / 10;
 const line = (layer, a, b) => add(0, 'LINE', 8, layer, 10, r1(a.x), 20, r1(a.y), 30, 0, 11, r1(b.x), 21, r1(b.y), 31, 0);
 const poly = (layer, pts) => { add(0, 'POLYLINE', 8, layer, 66, 1, 70, 1, 10, 0, 20, 0, 30, 0); for (const p of pts) add(0, 'VERTEX', 8, layer, 10, r1(p.x), 20, r1(p.y), 30, 0); add(0, 'SEQEND', 8, layer); };
 // text: left-aligned at p, or centred on p (horizontal 1, vertical middle 2) with a rotation
 const text = (layer, p, size, s, { rot = 0, centre = false } = {}) => {
  add(0, 'TEXT', 8, layer, 10, Math.round(p.x), 20, Math.round(p.y), 30, 0, 40, size, 1, dxfText(s, true), 50, Math.round(rot * 10) / 10);
  if (centre) add(72, 1, 73, 2, 11, Math.round(p.x), 21, Math.round(p.y), 31, 0); };
 const circle = (layer, p, r) => add(0, 'CIRCLE', 8, layer, 10, Math.round(p.x), 20, Math.round(p.y), 30, 0, 40, r);
 for (const d of m.decks) {
  const P = p => ({ x: num(p.x) + offset[d.id], y: num(p.y) }), b = d.bbox;
  text('DECK_TITLE', P({ x: b.minX, y: b.maxY + 1000 }), 450, `방화 등급도 — ${d.name} (Z ${d.elevationMm}) · ${m.shipLabel} · ${m.method}`);
  for (const r of d.rooms) {
   poly('ROOM', r.polygon.map(P)); for (const h of r.holes) if (h.length > 2) poly('ROOM', h.map(P));
   const [t1, t2, t3] = roomLines(r), c = P(r.at);
   text('ROOM_TEXT', { x: c.x, y: c.y + 220 }, 170, t1, { centre: true });
   text('FIRE_CAT', c, 150, t2, { centre: true });
   if (t3) text('FIRE_DECK_TEXT', { x: c.x, y: c.y - 220 }, 130, t3, { centre: true });
  }
  for (const w of d.walls) {
   const k = gradeKey(w.grade); line('FIRE_' + k, P(w.a), P(w.b));
   if (w.label) text('FIRE_TEXT_' + k, P(w.mid), 160, w.grade || '?', { rot: w.angle, centre: true });
  }
  for (const p of d.pens) {
   const at = P(p); circle('FIRE_PEN', at, p.damper ? 160 : 110);
   if (p.damper || p.sleeveMm) text('FIRE_PEN_TEXT', { x: at.x + 200, y: at.y + 160 }, 90, p.label);
  }
 }
 // the legend right of the last deck: a line and the text per rating, then the categories
 const last = m.decks[m.decks.length - 1];
 if (last) {
  let lx = x0, ly = last.bbox.maxY;
  text('LEGEND', { x: lx, y: ly }, 300, `범례 · ${m.shipLabel} · 방화방식 ${m.method}`); ly -= 600;
  for (const g of m.grades) { line('FIRE_' + gradeKey(g), { x: lx, y: ly }, { x: lx + 1200, y: ly }); text('LEGEND', { x: lx + 1500, y: ly - 80 }, 180, g); ly -= 400; }
  line('FIRE_NONE', { x: lx, y: ly }, { x: lx + 1200, y: ly }); text('LEGEND', { x: lx + 1500, y: ly - 80 }, 180, '등급 미정'); ly -= 400;
  text('LEGEND', { x: lx, y: ly - 200 }, 180, 'FD 방화댐퍼 · SL 슬리브(mm) · 실 안: 번호 이름 / (범주) 공간 / 바닥·천장 등급'); ly -= 700;
  for (const [n, name] of m.cats) { text('LEGEND', { x: lx, y: ly }, 160, `(${n}) ${name}`); ly -= 300; }
 }
 add(0, 'ENDSEC', 0, 'EOF');
 return L.join('\r\n') + '\r\n';
}

module.exports = { RULES, WIDTH, model, roomLines, layout, toSvg, legendHtml, toDxf, gradeKey };
