// Ver 2.0 system diagrams (계통도, V2-3.9 output): one schematic per AHU or fan - the unit on its deck, the shaft through
// the decks with each riser's size, flow, velocity and fire damper, a box per served deck with its air, RUs, ducts and
// losses, the index deck (the ESP) marked. Primitives in diagram units (1 = 1 px, y down), so the same diagram goes to
// the screen, the HTML report (SVG) and the integrated DXF. New code (D7); 1.0 lib/diagram.cjs is the reference.
//   systemDiagrams({ decks }, review) → [{ systemKey, systemId, kind, w, h, items }]; toSvg(diagram, { width })
'use strict';
const { esc } = require('./text.cjs');

const KIND = { supply: '급기(SA)', exhaust: '배기(EA)', return: '환기(RA)' }, UNIT = { supply: '공조기', exhaust: '배기 팬', return: '환기 팬' };
const COLOR = { supply: '#1f5fa8', exhaust: '#a05e17', return: '#147c61', grid: '#c8cdd2', text: '#1f1f1f', muted: '#6b6b6b', warn: '#a05e17', fail: '#b42318' };
const W = 760, HEAD = 46, ROW = 84, UX = 138, UW = 112, SX = 272, BX = 320, BW = 430, BH = 58;
const fmt = v => v == null || !Number.isFinite(+v) ? '—' : Math.round(+v).toLocaleString('en-US');
const pa = v => v == null || !Number.isFinite(+v) ? '—' : (Math.round(+v * 10) / 10).toLocaleString('en-US');

function systemDiagram({ decks }, rv, sys) {
 const items = [], k = sys.kind, col = COLOR[k], supply = k === 'supply';
 const line = (x1, y1, x2, y2, o = {}) => items.push({ t: 'line', x1, y1, x2, y2, c: o.c || col, w: o.w || 1.5, dash: !!o.dash });
 const rect = (x, y, w, h, o = {}) => items.push({ t: 'rect', x, y, w, h, c: o.c || col, w2: o.w || 1.2, fill: o.fill || null });
 const text = (x, y, s, o = {}) => items.push({ t: 'text', x, y, s: String(s), size: o.size || 12, anchor: o.anchor || 'start', bold: !!o.bold, c: o.c || COLOR.text });
 const arrow = (x, y, dir) => items.push({ t: 'poly', pts: dir > 0 ? [[x - 8, y - 5], [x, y], [x - 8, y + 5]] : [[x + 8, y - 5], [x, y], [x + 8, y + 5]], c: col });
 const deck = id => decks.find(d => d.id === id), z = id => deck(id)?.z ?? 0;
 // the decks the system touches, passed decks included, the highest on top
 const touched = [...new Set([sys.unitDeckId, ...sys.decks.map(d => d.deckId), ...sys.risers.flatMap(r => [r.fromDeckId, r.toDeckId])])];
 const lo = Math.min(...touched.map(z)), hi = Math.max(...touched.map(z)), rows = decks.filter(d => d.z >= lo && d.z <= hi).sort((x, y) => y.z - x.z);
 const yOf = id => HEAD + rows.findIndex(d => d.id === id) * ROW + ROW / 2, H = HEAD + rows.length * ROW + 16;
 text(0, 18, `${sys.systemId} · ${KIND[k]} · ${fmt(sys.fanCmh)} CMH`, { size: 15, bold: true, c: col });
 text(0, 36, `팬 정압(추정) ${fmt(sys.fanPa)} Pa · ESP ${pa(sys.indexPa)} Pa${sys.indexDeckId ? ` (${deck(sys.indexDeckId)?.name || sys.indexDeckId})` : ''}${sys.risers.length ? ` · 수직 덕트 ${pa(sys.riserLengthM)} m` : ''}${sys.complete ? '' : ' · AUTO 미완료'}${sys.stale ? ' · 다시 보내기 필요' : ''}`, { size: 11, c: sys.complete && !sys.stale ? COLOR.muted : COLOR.warn });
 rows.forEach((d, i) => {
  const y = HEAD + (i + 1) * ROW;
  line(0, y, W, y, { c: COLOR.grid, w: 1, dash: true });
  text(0, y - ROW / 2 - 2, d.name || d.id, { size: 12, bold: true }); text(0, y - ROW / 2 + 14, `Z ${fmt(d.z)}`, { size: 10, c: COLOR.muted });
 });
 const uy = yOf(sys.unitDeckId), multi = sys.risers.length > 0;
 if (multi) {
  const ys = [...sys.decks.map(d => yOf(d.deckId)), uy];
  line(SX, Math.min(...ys), SX, Math.max(...ys), { w: 3 });
  for (const r of sys.risers) {
   const y1 = yOf(r.fromDeckId), y2 = yOf(r.toDeckId), my = (y1 + y2) / 2;
   text(SX - 8, my - 4, `${r.widthMm}×${r.heightMm}`, { size: 11, anchor: 'end', bold: true, c: col });
   text(SX - 8, my + 10, `${fmt(r.flowCmh)} CMH · ${r.velocityMps} m/s`, { size: 10, anchor: 'end', c: r.exceeded ? COLOR.fail : COLOR.muted });
   if (r.damperPa > 0) { const fy = my + (y2 > y1 ? 22 : -22); rect(SX - 6, fy - 6, 12, 12, { c: COLOR.fail, w: 1.4, fill: '#fff' }); line(SX - 6, fy + 6, SX + 6, fy - 6, { c: COLOR.fail, w: 1.4 }); text(SX + 10, fy + 4, 'FD', { size: 9, c: COLOR.fail, bold: true }); }
  }
 }
 rect(UX, uy - 22, UW, 44, { w: 2, fill: col + '18' });
 text(UX + UW / 2, uy - 4, UNIT[k], { size: 12, bold: true, anchor: 'middle', c: col }); text(UX + UW / 2, uy + 12, sys.systemId, { size: 10, anchor: 'middle' });
 line(UX + UW, uy, SX, uy, { w: 2 });
 for (const d of sys.decks) {
  const y = yOf(d.deckId), p = rv.plans.find(x => x.key === d.key), r = rv.results?.[d.key], index = sys.indexDeckId === d.deckId && sys.decks.length > 1;
  line(SX, y, BX, y, { w: 2 });
  if (supply) arrow(BX, y, 1); else arrow(SX + 1, y, -1);
  if (multi && d.deckId !== sys.unitDeckId) items.push({ t: 'circle', x: SX, y, r: 5, c: col });
  items.push({ t: 'rect', x: BX, y: y - BH / 2, w: BW, h: BH, c: col, w2: index ? 2.6 : 1.2, fill: '#ffffff', key: d.key });
  text(BX + 10, y - 10, `${deck(d.deckId)?.name || d.deckId} · ${fmt(d.designCmh)} CMH · RU ${p?.rus?.length ?? '—'}${d.isUnitDeck ? '' : supply ? ' · 수직 덕트에서' : ' · 수직 덕트로'}`, { size: 12, bold: true });
  const run = !r?.auto ? 'AUTO 전 — 덕트망 없음' : `덕트 ${r.ducts ?? '—'}개 · ${pa(r.lengthM)} m · Deck ${pa(d.deckIndexPa)} Pa${d.damperPa ? ` + 방화댐퍼 ${pa(d.damperPa)}` : ''}${multi && !d.isUnitDeck ? ` + 수직 ${pa(d.riserPa)}` : ''}${d.damperPa || (multi && !d.isUnitDeck) ? ` = ${pa(d.totalPa)} Pa` : ''}`;
  text(BX + 10, y + 10, run, { size: 11, c: !r?.auto ? COLOR.muted : COLOR.text });
  if (d.stale) text(BX + BW - 8, y - 10, '다시 보내기 필요', { size: 10, anchor: 'end', c: COLOR.warn, bold: true });
  else if (index) text(BX + BW - 8, y - 10, '최대 손실 (ESP)', { size: 10, anchor: 'end', c: col, bold: true });
 }
 return { systemKey: sys.systemKey, systemId: sys.systemId, kind: k, w: W, h: H, items };
}

// supply first, then return, then exhaust
function systemDiagrams(m, rv) {
 const order = { supply: 0, return: 1, exhaust: 2 };
 return [...rv.systems].sort((x, y) => order[x.kind] - order[y.kind] || x.systemId.localeCompare(y.systemId)).map(s => systemDiagram(m, rv, s));
}

function toSvg(d, { width = d.w } = {}) {
 const s = width / d.w, body = d.items.map(i => {
  if (i.t === 'line') return `<line x1="${i.x1}" y1="${i.y1}" x2="${i.x2}" y2="${i.y2}" stroke="${i.c}" stroke-width="${i.w}"${i.dash ? ' stroke-dasharray="4 4"' : ''}/>`;
  if (i.t === 'rect') return `<rect${i.key ? ` class="deckbox" data-plan="${esc(i.key)}"` : ''} x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" rx="3" fill="${i.fill || 'none'}" stroke="${i.c}" stroke-width="${i.w2}"/>`;
  if (i.t === 'circle') return `<circle cx="${i.x}" cy="${i.y}" r="${i.r}" fill="#fff" stroke="${i.c}" stroke-width="2"/>`;
  if (i.t === 'poly') return `<polygon points="${i.pts.map(p => p.join(',')).join(' ')}" fill="${i.c}"/>`;
  return `<text x="${i.x}" y="${i.y}" font-size="${i.size}" text-anchor="${i.anchor}" fill="${i.c}"${i.bold ? ' font-weight="700"' : ''}>${esc(i.s)}</text>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" class="sysdia" data-key="${esc(d.systemKey)}" viewBox="-4 0 ${d.w + 8} ${d.h}" width="${Math.round((d.w + 8) * s)}" height="${Math.round(d.h * s)}" font-family="Malgun Gothic, Noto Sans KR, sans-serif"><title>${esc(d.systemId)} 계통도</title>${body}</svg>`;
}

module.exports = { systemDiagram, systemDiagrams, toSvg, KIND, COLOR };
