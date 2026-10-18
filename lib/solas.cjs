// SOLAS II-2 fire integrity on the shared room model (pure): room -> SOLAS space and category, adjacent boundaries
// (bulkheads between rooms on a deck, decks between rooms stacked above each other, outer boundaries to the open deck)
// with the minimum rating from Tables 9.1-9.8, and duct penetrations (deck ducts from PHG D, risers from lib/risers.cjs)
// with the measures of II-2/9.7.3. Data: lib/solas-data.json, extracted from the user's tool (tools/solas-extract.cjs).
// Design aid only - the final judgement is with the flag administration and the class society.
'use strict';
const DATA = require('./solas-data.json');
const G = require('./phg-plan.cjs');

const DEFAULT_SETTINGS = Object.freeze({ ship: 'CARG', method: 'IC', sprinkler: false, wallToleranceMm: 400, minOverlapMm: 100 });
// strictness order of ratings (strictest first) - used to pick between alternatives and to sort
const GRADES = ['A-60', 'A-30', 'A-15', 'A-0', 'B-15', 'B-0', 'C', '*', '-'];
const rank = g => { const i = GRADES.indexOf(g); return i < 0 ? GRADES.length : i; };
const gradeClass = g => /^A-/.test(g) ? 'A' : /^B-/.test(g) ? 'B' : g === 'C' ? 'C' : g === '*' ? 'STAR' : 'NONE';

// ---------- room -> space ----------
// drawing names -> SOLAS space (Korean name of the space dictionary). Korean compound names end with the word that
// tells the use (선교화장실 = a toilet, 사관식당 = a mess, 냉동기계실 = machinery), so the match that ends last in the name
// wins, then the longer match (GALLEY over ALLEY, 비상발전기실 over 발전기실). Area-dependent spaces resolve in classify().
const SYNONYMS = [
 [/조타실|선교|WHEEL\s*HOUSE|BRIDGE/i, '조타실'], [/선교\s*윙|BRIDGE\s*WING|개방\s*갑판|OPEN\s*DECK/i, '개방갑판'],
 [/해도실?|CHART\s*(ROOM)?/i, '해도실'], [/무선실|통신실|RADIO\s*(ROOM)?/i, '무선실'],
 [/비상\s*발전기?실|비상\s*전원실|EMERG\w*\s*GEN\w*(\s*ROOM)?/i, '비상발전기실'], [/(화재|소방)\s*제어(소|실)|FIRE\s*CONTROL(\s*STATION)?/i, '화재제어소'],
 [/CO2실?|CO₂실?|소화제\s*(저장)?실|FIRE\s*EXTING\w*/i, '소화제 저장실 (CO₂실)'], [/기관\s*제어실|\bECR\b|ENGINE\s*CONTROL(\s*ROOM)?/i, '추진제어실 (기관구역 외)'],
 [/계단실?|STAIR\w*/i, '계단격실'], [/승강기|엘리베이터|\bLIFT\b|ELEVATOR/i, '승강기 트렁크'], [/비상\s*탈출\S*|ESCAPE\s*TRUNK/i, '비상탈출트렁크'],
 [/조리실|주방|갤리|GALLEY|KITCHEN/i, '조리실'],
 [/화장실|샤워실?|욕실|변소|탈의실|TOILET|\bW\.?C\b|SHOWER|BATH(ROOM)?|LAVATORY|SANITARY|CHANGING\s*ROOM/i, '화장실·샤워실·욕실'],
 [/복도|통로|\bALLEY|CORRIDOR|PASSAGE/i, '통로'], [/로비|LOBBY|ENTRANCE/i, '로비'],
 [/팬트리|배식실|PANTRY/i, '팬트리 — 조리기구 없음'], [/식당|MESS(\s*ROOM)?|DINING(\s*ROOM)?/i, '식당'],
 [/오락실|휴게실|흡연실|체육실|헬스장|RECREATION(\s*ROOM)?|LOUNGE|SMOKING(\s*ROOM)?|\bGYM\b|HOBBY(\s*ROOM)?/i, '오락실'], [/사무실|OFFICE/i, '사무실'],
 [/병원|진료실|의무실|HOSPITAL|SICK\s*BAY/i, '병원'], [/조제실|DISPENSARY/i, '조제실'], [/이발소|미용실|BARBER/i, '이발소·미용실'], [/사우나|SAUNA/i, '사우나'],
 [/침실|선실|숙소|거실|(선장|기관장|항해사|기관사|통신장|조리장|갑판장|도선사|부원|사관)실|CABIN|BERTH|DAY\s*ROOM|BED\s*ROOM|SUITE/i, '선실 — 비제한 가구'],
 [/회의실|도서실|CONFERENCE(\s*ROOM)?|MEETING(\s*ROOM)?|LIBRARY/i, '@public'],
 [/세탁실|LAUNDRY/i, '@laundry'], [/건조실|DRYING(\s*ROOM)?/i, '@drying'],
 [/냉장(고|실)|냉동(고|실)|REFRIG\w*(\s*(STORE|CHAMBER|ROOM))?|COLD\s*ROOM|FREEZER/i, '냉장실'], [/페인트\s*(창고|로커|실)?|PAINT(\s*(STORE|LOCKER))?/i, '페인트 로커'],
 [/쓰레기실?|폐기물\s*(보관)?실?|GARBAGE(\s*ROOM)?/i, '쓰레기실'], [/램프실|LAMP\s*ROOM/i, '램프실'],
 [/작업(장|실)|공작실|WORKSHOP/i, '작업장 (기관구역 외)'], [/청소\s*(도구|용구)?\s*(실|로커)|CLEANING(\s*GEAR)?(\s*(LOCKER|STORE))?/i, '청소구 로커'],
 [/팬룸|팬실|공조기?실|공조\s*기계실|FAN\s*ROOM|\bAHU(\s*ROOM)?|A\/C\s*ROOM|\bAC\s*ROOM|환기실/i, '환기·공조 기계실'],
 [/냉동\s*기계실|REFRIG\w*\s*MACHINERY(\s*ROOM)?/i, '냉동기계실'], [/기계실/i, '환기·공조 기계실'],
 [/보일러실?|BOILER(\s*ROOM)?/i, '보일러실'], [/기관실|기관구역|발전기실|정화기실|케이싱|ENGINE(\s*(ROOM|CASING))?|CASING|MACHINERY\s*SPACE|GENERATOR\s*ROOM|PURIFIER(\s*ROOM)?/i, '기관실 — A류'],
 [/조타기실|STEERING\s*GEAR(\s*ROOM)?/i, '조타기실'], [/양묘기실|WINDLASS(\s*ROOM)?/i, '양묘기실'], [/(소화|스프링클러)\s*펌프실|FIRE\s*PUMP(\s*ROOM)?|SPRINKLER(\s*PUMP)?(\s*ROOM)?/i, '스프링클러·소화펌프실'],
 [/축계실|축로|파이프\s*터널|SHAFT\s*(ALLEY|TUNNEL)|PIPE\s*TUNNEL/i, '축로·파이프터널'], [/펌프실|PUMP\s*ROOM/i, '펌프실 (기관구역)'],
 [/오수\s*처리실|SEWAGE(\s*TREATMENT)?(\s*ROOM)?/i, '오수처리실'], [/배터리실|축전지실|BATTERY(\s*ROOM)?/i, '축전지실'],
 [/(전기|배전|변압기?|전자|통신|항해)\s*(장비|설비)?실|ELEC\w*(\s*EQUIPMENT)?\s*ROOM|SWBD(\s*ROOM)?|SWITCHBOARD(\s*ROOM)?/i, '전기설비실'],
 [/창고|식료품\S*|로커|저장실|보관실|린넨실?|STORE\w*|PROVISION\w*|LOCKER|LINEN|BOND\w*/i, '@store']];
// spaces HVAC Grid adds to the tool's dictionary (same row format: Korean, English, category in p14, p11, c11, t10)
const EXTRA_SPACES = [
 ['냉동기계실', 'Refrigerating machinery room', 10, 7, 7, 7], ['펌프실 (기관구역)', 'Pump room (machinery, not cargo)', 10, 7, 7, 7],
 ['오수처리실', 'Sewage treatment room', 10, 7, 7, 7], ['축전지실', 'Battery room', 10, 7, 7, 7]];
// BOX ISO 7547 room classes that fix the space when the name does not
const ISO_CLASS_SPACE = { WHEELHOUSE: '조타실', ALLEY_SOUND: '통로', ALLEY_NON_SOUND: '통로', ENGINE: '기관실 — A류', BOILER: '보일러실', CONTROL: '추진제어실 (기관구역 외)' };

const SPACES = [...DATA.spaces, ...EXTRA_SPACES];
const spaceRow = ko => SPACES.find(r => r[0] === ko) || null;
const catSet = ship => DATA.ships[ship].cat;
const catOf = (ship, ko) => { const r = spaceRow(ko); return r ? r[DATA.catIndex[catSet(ship)]] : null; };

// the space whose name match ends last, then the longest match, then the earlier rule
function matchName(name) {
 let best = null;
 SYNONYMS.forEach(([re, ko], i) => { const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m;
  while ((m = g.exec(name))) { if (!m[0]) { g.lastIndex++; continue; } const end = m.index + m[0].length;
   if (!best || end > best.end || (end === best.end && m[0].length > best.len)) best = { ko, end, len: m[0].length, i }; } });
 return best ? best.ko : null;
}
// space of one room: the user's choice wins, then the name, then the BOX ISO class; null = unclassified
function classify(room, settings = DEFAULT_SETTINGS, user = {}) {
 const s = { ...DEFAULT_SETTINGS, ...settings }, u = user[room.id];
 if (u?.cat) return { space: u.space || null, cat: u.cat, source: 'user' };
 let ko = u?.space || null, source = ko ? 'user' : null;
 if (!ko) { const hit = matchName(room.name || ''); if (hit) { ko = hit; source = 'name'; } }
 if (!ko && ISO_CLASS_SPACE[room.isoClass]) { ko = ISO_CLASS_SPACE[room.isoClass]; source = 'iso-class'; }
 const a = room.areaM2 || 0;
 if (ko === '@public') ko = a < 50 ? '공공장소 — 50㎡ 미만' : '공공장소 — 50㎡ 이상 · 비제한';
 if (ko === '@laundry') ko = a > 4 ? '주세탁실' : '소세탁실';
 if (ko === '@drying') ko = a > 4 ? '대건조실 — 4㎡ 초과' : '소건조실 — 4㎡ 이하';
 if (ko === '@store') ko = a > 4 ? '로커·창고 — 4㎡ 초과' : '로커·소창고 — 4㎡ 미만';
 if (!ko) return { space: null, cat: null, source: 'unclassified' };
 const cat = catOf(s.ship, ko);
 return { space: ko, cat, source: cat == null ? 'no-category' : source };
}
const catName = (ship, cat) => cat ? DATA.cats[catSet(ship)][cat - 1] : null;

// ---------- table lookup ----------
function parseCell(raw) { if (raw == null) return null; return { raw, alts: raw.split('|').map(p => { const [val, sup = ''] = p.split('^'); return { val, sup: sup.split('').filter(Boolean) }; }) }; }
// cats are 1-based; orient 'B' bulkhead (symmetric), 'D' deck (i = space below, j = space above)
function lookup(ship, orient, i, j) {
 const sh = DATA.ships[ship], t = DATA.tables[orient === 'D' ? sh.D : sh.B], n = DATA.cats[sh.cat].length;
 if (!(i >= 1 && j >= 1 && i <= n && j <= n)) return null;
 return orient === 'D' ? parseCell(t[i - 1][j - 1]) : parseCell(t[Math.min(i, j) - 1][Math.max(i, j) - 1]);
}

// rating of one boundary: the table cell, its alternatives and notes resolved by the settings; `check` lists what a
// designer must confirm (alternatives that depend on the arrangement, same-use exemptions)
function rate(ship, orient, a, b, settings = DEFAULT_SETTINGS, sameUse = false) {
 const s = { ...DEFAULT_SETTINGS, ...settings }, sh = DATA.ships[ship], notesOf = DATA.notes[sh.notes];
 if (!a.cat || !b.cat) return { grade: null, raw: null, notes: [], check: ['미분류 실 — 범주 지정 필요'], table: null };
 const i = orient === 'D' ? a.cat : a.cat, j = b.cat, cell = lookup(ship, orient, i, j);
 if (!cell) return { grade: null, raw: null, notes: [], check: ['표에 값 없음'], table: null };
 const check = [], notes = [];
 let alt = cell.alts[0];
 if (cell.alts.length > 1) {
  // alternatives: by the bulkhead reaching the deck (cargo ships, tankers) or by sprinklers (passenger <= 36)
  const sorted = [...cell.alts].sort((x, y) => rank(x.val) - rank(y.val));
  if (sh.altRule === 'sprinkler') alt = s.sprinkler ? sorted.at(-1) : sorted[0];
  else { alt = sorted[0]; check.push(`${cell.alts.map(x => x.val).join(' / ')} 중 엄격한 값 적용 — 격벽이 갑판까지 연장되는지 확인`); }
 }
 let grade = alt.val;
 for (const k of new Set(cell.alts.flatMap(x => x.sup))) notes.push({ key: k, text: notesOf[k] });
 const sups = alt.sup;
 // cargo ships: note a - methods IIC / IIIC put no requirement on these bulkheads; note b - IIIC: B-0 between >= 50 m²
 if (ship === 'CARG' && sups.includes('a') && s.method !== 'IC') { grade = '-'; check.push(`방화방식 ${s.method}: 이 격벽은 특별 요건 없음 (주석 a)`); }
 if (ship === 'CARG' && sups.includes('b') && s.method === 'IIIC') check.push('방식 IIIC: 50㎡ 이상 구역(군) 사이 B-0 (주석 b)');
 // same category, "only when the uses differ" notes: same space name = same use = not required
 const sameNote = { CARG: 'd', TANK: 'b', P36M: 'b', P36P: 'a' }[ship];
 if (a.cat === b.cat && sups.includes(sameNote)) {
  if (sameUse) { grade = '-'; check.push('같은 용도 — 표의 등급은 용도가 다를 때만 요구'); } else check.push('같은 범주·다른 용도 — 표의 등급 적용');
 }
 return { grade, raw: cell.raw, notes, check, table: orient === 'D' ? sh.tD : sh.tB, cell: orient === 'D' ? [i, j] : [Math.min(i, j), Math.max(i, j)] };
}

// ---------- boundaries ----------
const edges = poly => poly.map((a, i) => [a, poly[(i + 1) % poly.length]]);
// shared part of two room edges: parallel, within the wall tolerance, overlapping >= minOverlap -> segment on the mid line
function sharedSegment([a, b], [c, d], tol, minOverlap) {
 const ux = b.x - a.x, uy = b.y - a.y, L = Math.hypot(ux, uy); if (L < 1) return null;
 const dx = ux / L, dy = uy / L, vx = d.x - c.x, vy = d.y - c.y, M = Math.hypot(vx, vy); if (M < 1) return null;
 if (Math.abs(dx * vy - dy * vx) / M > 0.02) return null;                       // not parallel (> ~1.1 deg)
 const off = p => (p.x - a.x) * -dy + (p.y - a.y) * dx, dist = (off(c) + off(d)) / 2;
 if (Math.abs(dist) > tol) return null;
 const t = p => (p.x - a.x) * dx + (p.y - a.y) * dy, t0 = Math.max(0, Math.min(t(c), t(d))), t1 = Math.min(L, Math.max(t(c), t(d)));
 if (t1 - t0 < minOverlap) return null;
 const at = (s, o) => ({ x: a.x + dx * s - dy * o, y: a.y + dy * s + dx * o });
 return { a: at(t0, dist / 2), b: at(t1, dist / 2), lengthMm: t1 - t0, gapMm: Math.abs(dist), along: [t0, t1] };
}
// parts of [0, L] not covered by the intervals
function uncovered(L, intervals, min) {
 const iv = [...intervals].sort((x, y) => x[0] - y[0]), out = []; let at = 0;
 for (const [s, e] of iv) { if (s - at >= min) out.push([at, s]); at = Math.max(at, e); }
 if (L - at >= min) out.push([at, L]);
 return out;
}
// area shared by two rooms seen from above (rooms on adjacent decks): grid sampling, m²
function overlapM2(p, q, step = 200) {
 const A = G.bbox(p.polygon), B = G.bbox(q.polygon), x0 = Math.max(A.minX, B.minX), x1 = Math.min(A.maxX, B.maxX), y0 = Math.max(A.minY, B.minY), y1 = Math.min(A.maxY, B.maxY);
 if (x1 - x0 < step / 2 || y1 - y0 < step / 2) return 0;
 let n = 0; for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) { const pt = { x, y }; if (G.inRoom(pt, p) && G.inRoom(pt, q)) n++; }
 return n * step * step / 1e6;
}

// all boundaries of the contract: bulkheads (same deck), outer boundaries (to the open deck), decks (stacked rooms)
function boundaries(contract, settings = {}) {
 const s = { ...DEFAULT_SETTINGS, ...(contract.solas || {}), ...settings }, user = contract.solas?.rooms || {}, ship = s.ship;
 const cls = Object.fromEntries(contract.rooms.map(r => [r.id, classify(r, s, user)]));
 const openCat = DATA.cats[catSet(ship)].indexOf('개방갑판') + 1, open = { space: '개방갑판', cat: openCat };
 const out = [], push = (b, a, c, orient) => { const sameUse = !!a.space && a.space === c.space && a.source !== 'unclassified';
  const r = rate(ship, orient, a, c, s, sameUse), over = contract.solas?.bounds?.[b.id]; if (over?.grade) { r.grade = over.grade; r.check = [...r.check, '사용자 지정 등급']; }
  out.push({ ...b, orient, grade: r.grade, raw: r.raw, notes: r.notes, check: r.check, table: r.table, cell: r.cell, aSpace: a.space, bSpace: c.space, aCat: a.cat, bCat: c.cat }); };
 for (const deck of contract.decks) {
  const rooms = contract.rooms.filter(r => r.deckId === deck.id), covered = new Map();
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
   const p = rooms[i], q = rooms[j];
   const bp = G.bbox(p.polygon), bq = G.bbox(q.polygon);
   if (bp.minX - s.wallToleranceMm > bq.maxX || bq.minX - s.wallToleranceMm > bp.maxX || bp.minY - s.wallToleranceMm > bq.maxY || bq.minY - s.wallToleranceMm > bp.maxY) continue;
   edges(p.polygon).forEach((e, ei) => edges(q.polygon).forEach((f, fi) => {
    const seg = sharedSegment(e, f, s.wallToleranceMm, s.minOverlapMm); if (!seg) return;
    const key = p.id + '#' + ei; covered.set(key, [...(covered.get(key) || []), seg.along]);
    const back = sharedSegment(f, e, s.wallToleranceMm, s.minOverlapMm); if (back) covered.set(q.id + '#' + fi, [...(covered.get(q.id + '#' + fi) || []), back.along]);
    push({ id: `B:${p.id}|${q.id}|${ei}|${fi}`, kind: 'bulkhead', deckId: deck.id, roomA: p.id, roomB: q.id, a: seg.a, b: seg.b, lengthMm: Math.round(seg.lengthMm) }, cls[p.id], cls[q.id], 'B');
   }));
  }
  // outer boundaries: parts of room edges no other room covers face the open deck (or a space outside the model)
  for (const p of rooms) edges(p.polygon).forEach(([a, b], ei) => {
   const L = Math.hypot(b.x - a.x, b.y - a.y), dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
   for (const [t0, t1] of uncovered(L, covered.get(p.id + '#' + ei) || [], s.minOverlapMm * 5))
    push({ id: `O:${p.id}|${ei}|${Math.round(t0)}`, kind: 'outer', deckId: deck.id, roomA: p.id, roomB: null, a: { x: a.x + dx * t0, y: a.y + dy * t0 }, b: { x: a.x + dx * t1, y: a.y + dy * t1 }, lengthMm: Math.round(t1 - t0) }, cls[p.id], open, 'B');
  });
 }
 // decks: a room and the rooms of the next deck up that overlap it in plan (table: space below, space above)
 const decks = [...contract.decks].sort((a, b) => a.elevationMm - b.elevationMm);
 for (let k = 0; k + 1 < decks.length; k++) {
  const below = contract.rooms.filter(r => r.deckId === decks[k].id), above = contract.rooms.filter(r => r.deckId === decks[k + 1].id);
  for (const p of below) for (const q of above) { const m2 = overlapM2(p, q); if (m2 < 0.5) continue;
   push({ id: `D:${p.id}|${q.id}`, kind: 'deck', deckId: decks[k + 1].id, belowDeckId: decks[k].id, roomA: p.id, roomB: q.id, areaM2: Math.round(m2 * 10) / 10 }, cls[p.id], cls[q.id], 'D'); }
 }
 return { settings: s, classes: cls, boundaries: out };
}

// ---------- penetrations ----------
function crossing(p, q, a, b) {
 const r = { x: q.x - p.x, y: q.y - p.y }, s = { x: b.x - a.x, y: b.y - a.y }, den = r.x * s.y - r.y * s.x;
 if (Math.abs(den) < 1e-9) return null;                                            // parallel: a duct along a wall does not cross it
 const t = ((a.x - p.x) * s.y - (a.y - p.y) * s.x) / den, u = ((a.x - p.x) * r.y - (a.y - p.y) * r.x) / den;
 return t > 1e-6 && t < 1 - 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 ? { x: p.x + r.x * t, y: p.y + r.y * t, t } : null;
}
// II-2/9.7.3 measures by the boundary class and the duct's free cross-section (inner size; nominal size used here)
function measure(grade, areaM2, sized = true) {
 const c = gradeClass(grade);
 if (!grade) return { code: 'CHECK', text: '경계 범주 미정 — 실 분류 후 판정', sleeveMm: 0, damper: false };
 if (c === 'A') {
  if (!sized) return { code: 'A-SIZE', text: '덕트 크기 산정 후 판정 (A급)', sleeveMm: 0, damper: false };
  if (areaM2 > 0.075) return { code: 'A-FD', text: `강재 슬리브 3t × 900 + ${grade} 단열 + 자동 방화댐퍼`, sleeveMm: 900, damper: true };
  if (areaM2 > 0.02) return { code: 'A-900', text: `강재 슬리브 3t × 900 + ${grade} 단열`, sleeveMm: 900, damper: false };
  return { code: 'A-200', text: '강재 슬리브 3t × 200', sleeveMm: 200, damper: false };
 }
 if (c === 'B') return !sized ? { code: 'B-SIZE', text: '덕트 크기 산정 후 판정 (B급)', sleeveMm: 0, damper: false }
  : areaM2 > 0.02 ? { code: 'B-900', text: '강재 슬리브 900 (그 길이가 강재 덕트면 생략)', sleeveMm: 900, damper: false } : { code: 'B-SEAL', text: '관통부 밀폐', sleeveMm: 0, damper: false };
 if (c === 'STAR') return { code: 'STAR', text: '강 또는 동등재, 관통부 밀폐', sleeveMm: 0, damper: false };
 return { code: 'NONE', text: '요건 없음', sleeveMm: 0, damper: false };
}
const ductArea = d => d.diameterMm ? Math.PI * (d.diameterMm / 1000) ** 2 / 4 : d.widthMm && d.heightMm ? d.widthMm * d.heightMm / 1e6 : 0;
const sizeText = d => d.diameterMm ? `Ø${d.diameterMm}` : d.widthMm && d.heightMm ? `${d.widthMm}×${d.heightMm}` : '미산정';

// ducts: { [planKey]: { deckId, systemId, kind, ducts:[{ points (app coords, y down), widthMm, heightMm, diameterMm, flowCmh, type }] } }
// risers: lib/risers.cjs riser list
function penetrations(contract, bounds, ducts = {}, risers = []) {
 const out = [], byDeck = {};
 for (const b of bounds.boundaries) if (b.kind !== 'deck') (byDeck[b.deckId] = byDeck[b.deckId] || []).push(b);
 for (const [key, net] of Object.entries(ducts)) for (const [di, d] of (net.ducts || []).entries()) {
  const pts = d.points.map(p => ({ x: p.x, y: -p.y })), area = ductArea(d), sized = area > 0;
  for (let i = 0; i + 1 < pts.length; i++) for (const b of byDeck[net.deckId] || []) {
   const x = crossing(pts[i], pts[i + 1], b.a, b.b); if (!x) continue;
   out.push({ planKey: key, deckId: net.deckId, systemId: net.systemId, kind: net.kind, duct: d.displayName || d.id || `#${di + 1}`, ductType: d.type, boundaryId: b.id, boundaryKind: b.kind,
    roomA: b.roomA, roomB: b.roomB, grade: b.grade, x: Math.round(x.x), y: Math.round(x.y), size: sizeText(d), areaM2: Math.round(area * 10000) / 10000, flowCmh: d.flowCmh, ...measure(b.grade, area, sized) });
  }
 }
 // risers (lib/risers.cjs runs them from the unit side to the far side): the horizontal offset runs on the deck of the
 // unit side, from the unit (or the previous shaft) to the shaft of the far deck, x first then y - its bulkhead
 // crossings are penetrations like a deck duct. The vertical part stands at the far shaft and crosses the deck of every
 // level between the two ends.
 const roomAt = (deckId, p) => contract.rooms.find(r => r.deckId === deckId && G.inRoom(p, r));
 const decks = [...contract.decks].sort((a, b) => a.elevationMm - b.elevationMm);
 for (const r of risers) {
  const area = r.widthMm * r.heightMm / 1e6, size = `${r.widthMm}×${r.heightMm}`, base = { planKey: null, riserId: r.id, systemId: r.systemId, kind: r.kind, duct: `RISER ${r.fromDeckId}→${r.toDeckId}`, size, areaM2: Math.round(area * 10000) / 10000, flowCmh: r.flowCmh };
  // the L-shaped run (x first or y first) that crosses fewer boundaries
  const hits = run => { const o = []; for (let i = 0; i + 1 < run.length; i++) for (const b of byDeck[r.fromDeckId] || []) { const x = crossing(run[i], run[i + 1], b.a, b.b); if (x) o.push({ b, x }); } return o; };
  const clean = run => run.filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) > 1);
  const xFirst = hits(clean([r.from, { x: r.to.x, y: r.from.y }, r.to])), yFirst = hits(clean([r.from, { x: r.from.x, y: r.to.y }, r.to]));
  for (const { b, x } of yFirst.length < xFirst.length ? yFirst : xFirst)
   out.push({ ...base, deckId: r.fromDeckId, ductType: 'riser-offset', boundaryId: b.id, boundaryKind: b.kind, roomA: b.roomA, roomB: b.roomB, grade: b.grade, x: Math.round(x.x), y: Math.round(x.y), ...measure(b.grade, area, true) });
  const iFrom = decks.findIndex(d => d.id === r.fromDeckId), iTo = decks.findIndex(d => d.id === r.toDeckId), p = r.to;
  for (let k = Math.min(iFrom, iTo) + 1; k <= Math.max(iFrom, iTo); k++) {
   const below = roomAt(decks[k - 1].id, p), above = roomAt(decks[k].id, p);
   const b = bounds.boundaries.find(x => x.kind === 'deck' && x.roomA === below?.id && x.roomB === above?.id), grade = b ? b.grade : null;
   out.push({ ...base, deckId: decks[k].id, ductType: 'riser', boundaryId: b?.id || null, boundaryKind: 'deck', roomA: below?.id || null, roomB: above?.id || null, grade, x: Math.round(p.x), y: Math.round(p.y), ...measure(grade, area, true),
    ...(b ? {} : { text: '수직 덕트 위치 위·아래에 실이 없음 — 샤프트 위치 확인', code: 'CHECK' }) });
  }
 }
 // number from the unit outwards: by system, deck, then distance along the list
 out.sort((a, b) => a.systemId.localeCompare(b.systemId) || a.deckId.localeCompare(b.deckId) || a.x - b.x || a.y - b.y);
 out.forEach((p, i) => p.no = 'P-' + String(i + 1).padStart(3, '0'));
 return out;
}

// II-2/9.7.2 / 9.7.5 system warnings: galley and category A machinery air kept apart from accommodation systems
function systemWarnings(contract, bounds) {
 const out = [], cls = bounds.classes;
 for (const s of contract.systems) {
  const spaces = s.roomIds.map(id => cls[id]?.space).filter(Boolean), has = re => spaces.some(x => re.test(x));
  const galley = has(/^조리실|팬트리 — 조리기구 있음/), machinery = has(/^기관실|^보일러실/), living = has(/^선실|^사무실|^식당|^오락실|^공공장소|^병원|^통로|^로비|^조타실|^해도실/);
  if (galley && living) out.push({ systemId: s.id, kind: s.kind, rule: 'II-2/9.7.5 · 9.7.2.1', text: `${s.id}: 조리실과 거주·업무구역을 같은 계통이 담당 — 조리실 환기(특히 레인지 배기)는 분리` });
  if (machinery && living) out.push({ systemId: s.id, kind: s.kind, rule: 'II-2/9.7.2.1', text: `${s.id}: A류 기관구역과 거주구역을 같은 계통이 담당 — 기관구역 환기는 분리` });
 }
 return out;
}

// counts for the review and the material list
function summary(bounds, pens) {
 const byGrade = {}, byCode = {}, sleeves = {}, dampers = {};
 for (const b of bounds.boundaries) byGrade[b.grade ?? '미정'] = (byGrade[b.grade ?? '미정'] || 0) + 1;
 for (const p of pens) { byCode[p.code] = (byCode[p.code] || 0) + 1; if (p.sleeveMm) sleeves[p.sleeveMm] = (sleeves[p.sleeveMm] || 0) + 1; if (p.damper) dampers[p.size] = (dampers[p.size] || 0) + 1; }
 const unclassified = Object.entries(bounds.classes).filter(([, c]) => !c.cat).map(([id]) => id);
 return { boundaries: bounds.boundaries.length, byGrade, penetrations: pens.length, byCode, sleeves, dampers, fireDampers: Object.values(dampers).reduce((t, n) => t + n, 0), unclassified,
  toCheck: bounds.boundaries.filter(b => b.check.length).length + pens.filter(p => /SIZE|CHECK/.test(p.code)).length };
}

module.exports = { DATA, SPACES, EXTRA_SPACES, DEFAULT_SETTINGS, GRADES, SYNONYMS, matchName, rank, gradeClass, classify, catName, catOf, lookup, rate, sharedSegment, overlapM2, boundaries, crossing, measure, penetrations, systemWarnings, summary, ductArea };
