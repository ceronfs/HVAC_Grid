// Ver 2.0 fire engine, the fire boundaries (V2-3.9 fire): every bulkhead between two rooms of a deck, every outer wall
// (to the open deck), every hole no room fills, every deck between stacked rooms and every floor or ceiling the next deck
// does not cover - each rated by lib/engines/fire/rate.cjs. New code (D7); 1.x lib/solas.cjs is the functional reference.
//   boundaries({ rooms, decks, solas }) → { settings, classes, stairDecks, boundaries: [{ id, kind, deckId, roomA, roomB,
//     a, b, lengthMm | areaM2, orient, grade, raw, notes, check, table, cell, aSpace, bSpace, aCat, bCat }] }
// Boundary ids carry the rooms and the place (B:roomA|roomB|x|y …) - a user's rating (solas.bounds) stays with its wall.
'use strict';
const PL = require('../geometry/plan.cjs'), C = require('./classify.cjs'), R = require('./rate.cjs');

// the parts of [0, L] no interval covers, at least `min` long
function gaps(L, intervals, min) {
 const out = []; let at = 0;
 for (const [s, e] of [...intervals].sort((x, y) => x[0] - y[0])) { if (s - at >= min) out.push([at, s]); at = Math.max(at, e); }
 if (L - at >= min) out.push([at, L]);
 return out;
}
const mid = (a, b) => `${Math.round((a.x + b.x) / 2)}|${Math.round((a.y + b.y) / 2)}`;
// accommodation, service and control spaces (a tanker's wall facing the cargo area)
const LIVING = /^선실|^사무실|^식당|^오락실|^공공장소|^병원|^통로|^로비|^조타실|^해도실|^무선실|^항해·통신|^계단|^화장실|^팬트리 — 조리기구 없음/;

function boundaries({ rooms, decks: deckList, solas = {} }) {
 const s = C.settings(solas), ship = s.ship, classes = Object.fromEntries(rooms.map(r => [r.id, C.classify(r, s, solas.rooms || {})]));
 const decks = [...deckList].sort((a, b) => a.z - b.z), at = id => decks.findIndex(d => d.id === id), onDeck = id => rooms.filter(r => r.deckId === id);
 // stair enclosures: how many decks each spans (stair rooms of adjacent decks over each other) and whether it reaches the
 // top or bottom of the model
 const stairs = rooms.filter(r => classes[r.id].space === '계단격실'), stairDecks = {}, stairEdge = {};
 for (const r of stairs) {
  let n = 1, edge = false;
  for (const dir of [1, -1]) for (let k = at(r.deckId) + dir, cur = r; ; k += dir) { const d = decks[k]; if (!d) { edge = true; break; } const next = stairs.find(x => x.deckId === d.id && PL.overlapM2(cur, x) > 0.5); if (!next) break; n++; cur = next; }
  stairDecks[r.id] = n; stairEdge[r.id] = edge;
 }
 const side = id => ({ ...classes[id], stairDecks: stairDecks[id], stairEdge: stairEdge[id] });
 const open = { space: '개방갑판', cat: C.DATA.cats[C.DATA.ships[ship].cat].indexOf('개방갑판') + 1 };
 const out = [];
 const push = (b, A, B, orient, extra = []) => {
  const r = R.rate(ship, orient, A, B, s, !!A.space && A.space === B.space && A.source !== 'unclassified'), set = solas.bounds?.[b.id];
  if (set?.grade && R.GRADES.includes(set.grade)) { r.grade = set.grade; r.check = [...r.check, '사용자 지정 등급']; }
  out.push({ ...b, orient, grade: r.grade, raw: r.raw, notes: r.notes, check: [...r.check, ...extra], table: r.table, cell: r.cell, aSpace: A.space, bSpace: B.space, aCat: A.cat, bCat: B.cat });
 };
 const tankerWall = c => ship === 'TANK' && LIVING.test(c.space || '') ? ['II-2/9.2.4.2.5: 화물구역을 향한 외벽(단부에서 3 m 포함)이면 A-60 — 확인'] : [];
 for (const deck of decks) {
  const here = onDeck(deck.id), covered = new Map(), walls = new Map(here.map(r => [r.id, PL.roomSides(r)])), t = s.wallToleranceMm;
  const cover = (key, span) => covered.set(key, [...(covered.get(key) || []), span]);
  for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
   const p = here[i], q = here[j], bp = PL.bounds(p.polygon), bq = PL.bounds(q.polygon);
   if (bp.minX - t > bq.maxX || bq.minX - t > bp.maxX || bp.minY - t > bq.maxY || bq.minY - t > bp.maxY) continue;
   walls.get(p.id).forEach((e, ei) => walls.get(q.id).forEach((f, fi) => {
    const seg = PL.facing(e, f, t, s.minOverlapMm); if (!seg) return;
    // the walls face each other: just off the piece one side is in p and the other in q (not a wall paired with the far
    // wall of a thin neighbour, not across a thin room between)
    const m = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 }, L = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1, nx = -(seg.b.y - seg.a.y) / L, ny = (seg.b.x - seg.a.x) / L, o = seg.gapMm / 2 + 10;
    const s1 = { x: m.x + nx * o, y: m.y + ny * o }, s2 = { x: m.x - nx * o, y: m.y - ny * o };
    if (!((PL.inRoom(s1, p) && PL.inRoom(s2, q)) || (PL.inRoom(s1, q) && PL.inRoom(s2, p)))) return;
    if (seg.gapMm > 20 && here.some(r => r !== p && r !== q && PL.inRoom(m, r))) return;
    cover(p.id + '#' + ei, seg.along);
    const back = PL.facing(f, e, t, s.minOverlapMm); if (back) cover(q.id + '#' + fi, back.along);
    push({ id: `B:${p.id}|${q.id}|${mid(seg.a, seg.b)}`, kind: 'bulkhead', deckId: deck.id, roomA: p.id, roomB: q.id, a: seg.a, b: seg.b, lengthMm: Math.round(seg.lengthMm) }, side(p.id), side(q.id), 'B');
   }));
  }
  // what no neighbour covers: an outline → an outer wall to the open deck; a hole → a space the model leaves out
  for (const p of here) {
   const outline = p.polygon.length;
   walls.get(p.id).forEach(([a, b], ei) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y), dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
    for (const [t0, t1] of gaps(L, covered.get(p.id + '#' + ei) || [], s.minOverlapMm * 5)) {
     const A = { x: a.x + dx * t0, y: a.y + dy * t0 }, B = { x: a.x + dx * t1, y: a.y + dy * t1 };
     if (ei >= outline) out.push({ id: `V:${p.id}|${mid(A, B)}`, kind: 'void', deckId: deck.id, roomA: p.id, roomB: null, a: A, b: B, lengthMm: Math.round(t1 - t0), orient: 'B', grade: null, raw: null, notes: [], check: ['구멍 안 공간이 모델에 없음 — 그 공간을 격실로 넣거나 등급 확인'], table: null, aSpace: classes[p.id].space, bSpace: null, aCat: classes[p.id].cat, bCat: null });
     else push({ id: `O:${p.id}|${mid(A, B)}`, kind: 'outer', deckId: deck.id, roomA: p.id, roomB: null, a: A, b: B, lengthMm: Math.round(t1 - t0) }, side(p.id), open, 'B', tankerWall(classes[p.id]));
    }
   });
  }
 }
 // decks: a room and each room of the next deck up over it (a small shaft counts when half of it is over)
 for (let k = 0; k + 1 < decks.length; k++) for (const p of onDeck(decks[k].id)) for (const q of onDeck(decks[k + 1].id)) {
  const m2 = PL.overlapM2(p, q), min = Math.min(0.5, 0.5 * Math.min(PL.roomAreaMm2(p), PL.roomAreaMm2(q)) / 1e6); if (m2 < min || m2 <= 0) continue;
  push({ id: `D:${p.id}|${q.id}`, kind: 'deck', deckId: decks[k + 1].id, belowDeckId: decks[k].id, roomA: p.id, roomB: q.id, areaM2: Math.round(m2 * 100) / 100 }, side(p.id), side(q.id), 'D');
 }
 // the model's edge: floors the deck below does not cover (below the lowest deck: solas.lowestBelow, else held) and
 // ceilings the deck above does not cover (the open deck)
 const lowest = s.lowestBelow ? { space: s.lowestBelow, cat: C.category(ship, s.lowestBelow) } : null;
 for (let k = 0; k < decks.length; k++) {
  const under = k > 0 ? onDeck(decks[k - 1].id) : [], over = k + 1 < decks.length ? onDeck(decks[k + 1].id) : [];
  for (const p of onDeck(decks[k].id)) {
   const f = PL.uncoveredM2(p, under), c = PL.uncoveredM2(p, over);
   if (f.m2 >= 0.5) {
    const b = { id: `F:${p.id}`, kind: 'floor', deckId: decks[k].id, roomA: null, roomB: p.id, areaM2: Math.round(f.m2 * 10) / 10, at: f.at };
    if (k === 0 && !lowest) out.push({ ...b, orient: 'D', grade: null, raw: null, notes: [], check: ['최하층 아래 공간 미지정 — ⑤ 방화에서 "최하층 아래" 지정'], table: null, aSpace: null, bSpace: classes[p.id].space, aCat: null, bCat: classes[p.id].cat });
    else push(b, k === 0 ? lowest : open, side(p.id), 'D', k === 0 ? [] : ['아래가 개방갑판(돌출부) — 확인']);
   }
   if (c.m2 >= 0.5) push({ id: `C:${p.id}`, kind: 'ceiling', deckId: decks[k].id, roomA: p.id, roomB: null, areaM2: Math.round(c.m2 * 10) / 10, at: c.at }, side(p.id), open, 'D', k + 1 < decks.length ? ['위가 노출 갑판 — 확인'] : []);
  }
 }
 return { settings: s, classes, stairDecks, boundaries: out };
}

module.exports = { boundaries, LIVING };
