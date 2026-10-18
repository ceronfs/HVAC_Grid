// SOLAS II-2 fire integrity on the shared room model (pure): room -> SOLAS space and category, adjacent boundaries
// (bulkheads between rooms on a deck, decks between rooms stacked above each other, outer walls, the floor and the
// ceiling at the edge of the model) with the minimum rating from Tables 9.1-9.8, duct penetrations (deck ducts from
// PHG D, vertical ducts from lib/risers.cjs) with the measures of II-2/9.7.3, ducts passing restricted spaces
// (II-2/9.7.2) and the ventilation check lists (II-2/5.2, 9.7.5). Data: lib/solas-data.json, extracted from the user's
// tool (tools/solas-extract.cjs). Design aid only - the final judgement is with the flag administration and the class.
'use strict';
const DATA = require('./solas-data.json');
const GE = require('./geom.cjs');

const DEFAULT_SETTINGS = Object.freeze({ ship: 'CARG', method: 'IC', sprinkler: false, wallToleranceMm: 400, minOverlapMm: 100, lowestBelow: null });
const SHIPS = Object.keys(DATA.ships);
// strictness order of ratings (strictest first) - used to pick between alternatives and to sort
const GRADES = ['A-60', 'A-30', 'A-15', 'A-0', 'B-15', 'B-0', 'C', '*', '-'];
const rank = g => { const i = GRADES.indexOf(g); return i < 0 ? GRADES.length : i; };
const gradeClass = g => /^A-/.test(g) ? 'A' : /^B-/.test(g) ? 'B' : g === 'C' ? 'C' : g === '*' ? 'STAR' : 'NONE';
const settingsOf = (contract, extra = {}) => { const s = { ...DEFAULT_SETTINGS, ...(contract?.solas || {}), ...extra }; if (!SHIPS.includes(s.ship)) s.ship = DEFAULT_SETTINGS.ship; if (!['IC', 'IIC', 'IIIC'].includes(s.method)) s.method = 'IC'; return s; };

// ---------- room -> space ----------
// drawing names -> SOLAS space (Korean name of the space dictionary). Korean compound names end with the word that
// tells the use (선교화장실 = a toilet, 사관식당 = a mess, 냉동기계실 = machinery), so the match that ends last in the name
// wins, then the longer match (GALLEY over ALLEY, 비상발전기실 over 발전기실). Area-dependent spaces resolve in classify().
const SYNONYMS = [
 [/조타실|선교|WHEEL\s*HOUSE|BRIDGE/i, '조타실'], [/선교\s*윙|BRIDGE\s*WING|개방\s*갑판|OPEN\s*DECK/i, '개방갑판'],
 [/해도실?|CHART\s*(ROOM)?/i, '해도실'], [/무선실|통신실|RADIO\s*(ROOM)?/i, '무선실'],
 [/(항해|통신|무선|전자|GMDSS)\s*(장비|설비|기기)\s*실|GMDSS\s*(실|ROOM)|NAV\w*\s*EQUIP\w*(\s*ROOM)?|RADIO\s*EQUIP\w*(\s*ROOM)?|ELECTRONIC\s*(EQUIP\w*\s*)?ROOM/i, '항해·통신 장비실 (제어장소)'],
 [/비상\s*발전기?실|비상\s*전원실|EMERG\w*\s*GEN\w*(\s*ROOM)?/i, '비상발전기실'], [/(화재|소방)\s*제어(소|실)|FIRE\s*CONTROL(\s*STATION)?/i, '화재제어소'],
 [/CO2실?|CO₂실?|소화제\s*(저장)?실|FIRE\s*EXTING\w*/i, '소화제 저장실 (CO₂실)'], [/기관\s*제어실|\bECR\b|ENGINE\s*CONTROL(\s*ROOM)?/i, '추진제어실 (기관구역 외)'],
 [/계단실?|STAIR\w*/i, '계단격실'], [/승강기(\s*트렁크)?|엘리베이터|\bLIFT(\s*TRUNK)?\b|ELEVATOR/i, '승강기 트렁크'], [/비상\s*탈출\S*|ESCAPE\s*TRUNK/i, '비상탈출트렁크'],
 [/(덕트|공조|환기)\s*(트렁크|스페이스|샤프트)|트렁크|DUCT\s*(TRUNK|SPACE|SHAFT)|\bTRUNK\b/i, '덕트 트렁크'],
 [/조리실|주방|갤리|GALLEY|KITCHEN/i, '조리실'],
 [/화장실|샤워실?|욕실|변소|탈의실|TOILET|\bW\.?C\b|SHOWER|BATH(ROOM)?|LAVATORY|SANITARY|CHANGING\s*ROOM/i, '화장실·샤워실·욕실'],
 [/복도|통로|\bALLEY|CORRIDOR|PASSAGE/i, '통로'], [/로비|LOBBY|ENTRANCE/i, '로비'],
 [/팬트리|배식실|PANTRY/i, '팬트리 — 조리기구 없음'], [/식당|MESS(\s*ROOM)?|DINING(\s*ROOM)?/i, '식당'],
 [/오락실|휴게실|흡연실|체육실|헬스장|취미실|RECREATION(\s*ROOM)?|LOUNGE|SMOKING(\s*ROOM)?|\bGYM\b|HOBBY(\s*ROOM)?/i, '오락실'], [/사무실|OFFICE/i, '사무실'],
 [/병원|진료실|의무실|HOSPITAL|SICK\s*BAY/i, '병원'], [/조제실|DISPENSARY/i, '조제실'], [/이발소|미용실|BARBER/i, '이발소·미용실'], [/사우나|SAUNA/i, '사우나'],
 [/침실|선실|숙소|거실|(선장|기관장|항해사|기관사|통신장|조리장|갑판장|도선사|부원|사관)실|CABIN|BERTH|DAY\s*ROOM|BED\s*ROOM|SUITE/i, '선실 — 비제한 가구'],
 [/회의실|도서실|CONFERENCE(\s*ROOM)?|MEETING(\s*ROOM)?|LIBRARY/i, '@public'],
 [/세탁실|LAUNDRY/i, '@laundry'], [/건조실|DRYING(\s*ROOM)?/i, '@drying'],
 [/냉장(고|실)|냉동(고|실)|REFRIG\w*(\s*(STORE|CHAMBER|ROOM))?|COLD\s*ROOM|FREEZER/i, '냉장실'], [/(식료품|식품|부식)\s*(냉장|냉동)(고|실|창고)|냉장고|냉동고|PROVISION\w*\s*(REFRIG\w*|COLD|FREEZ\w*)(\s*(STORE|ROOM))?/i, '식료품 냉장고'],
 [/페인트\s*(창고|로커|실)?|PAINT(\s*(STORE|LOCKER))?/i, '페인트 로커'],
 [/쓰레기실?|폐기물\s*(보관)?실?|GARBAGE(\s*ROOM)?/i, '쓰레기실'], [/램프실|LAMP\s*ROOM/i, '램프실'],
 [/작업(장|실)|공작실|WORKSHOP/i, '작업장 (기관구역 외)'], [/청소\s*(도구|용구)?\s*(실|로커)|CLEANING(\s*GEAR)?(\s*(LOCKER|STORE))?/i, '청소구 로커'],
 [/팬룸|팬실|공조기?실|공조\s*기계실|FAN\s*ROOM|\bAHU(\s*ROOM)?|A\/C\s*ROOM|\bAC\s*ROOM|환기실/i, '환기·공조 기계실'],
 [/냉동\s*기계실|REFRIG\w*\s*MACHINERY(\s*ROOM)?/i, '냉동기계실'], [/기계실/i, '환기·공조 기계실'],
 [/보일러실?|BOILER(\s*ROOM)?/i, '보일러실'], [/기관실|기관구역|발전기실|정화기실|케이싱|ENGINE(\s*(ROOM|CASING))?|CASING|MACHINERY\s*SPACE|GENERATOR\s*ROOM|PURIFIER(\s*ROOM)?/i, '기관실 — A류'],
 [/조타기실|STEERING\s*GEAR(\s*ROOM)?/i, '조타기실'], [/양묘기실|WINDLASS(\s*ROOM)?/i, '양묘기실'], [/(소화|스프링클러)\s*펌프실|FIRE\s*PUMP(\s*ROOM)?|SPRINKLER(\s*PUMP)?(\s*ROOM)?/i, '스프링클러·소화펌프실'],
 [/축계실|축로|파이프\s*터널|SHAFT\s*(ALLEY|TUNNEL)|PIPE\s*TUNNEL/i, '축로·파이프터널'], [/펌프실|PUMP\s*ROOM/i, '펌프실 (기관구역)'],
 [/오수\s*처리실|SEWAGE(\s*TREATMENT)?(\s*ROOM)?/i, '오수처리실'], [/배터리실|축전지실|BATTERY(\s*ROOM)?/i, '축전지실'],
 [/(전기|배전|변압기?)\s*(장비|설비)?실|ELEC\w*(\s*EQUIPMENT)?\s*ROOM|SWBD(\s*ROOM)?|SWITCHBOARD(\s*ROOM)?/i, '전기설비실'],
 [/창고|식료품\S*|로커|저장실|보관실|린넨실?|STORE\w*|PROVISION\w*|LOCKER|LINEN|BOND\w*/i, '@store']];
// spaces HVAC Grid adds to the tool's dictionary (same row format: Korean, English, category in p14, p11, c11, t10)
const EXTRA_SPACES = [
 ['냉동기계실', 'Refrigerating machinery room', 10, 7, 7, 7], ['펌프실 (기관구역)', 'Pump room (machinery, not cargo)', 10, 7, 7, 7],
 ['오수처리실', 'Sewage treatment room', 10, 7, 7, 7], ['축전지실', 'Battery room', 10, 7, 7, 7],
 // II-2/3.18: spaces with the radio or main navigating equipment are control stations
 ['항해·통신 장비실 (제어장소)', 'Navigation / radio equipment room (control station, II-2/3.18)', 1, 1, 1, 1],
 // air-conditioning duct trunks: with the ventilation machinery spaces
 ['덕트 트렁크', 'Air-conditioning duct trunk', 10, 7, 7, 7],
 // provision cold rooms in the accommodation: treated as stores, not as cargo spaces (flagged)
 ['식료품 냉장고', 'Provision refrigerated store', 13, 9, 9, 9]];
// what a designer should confirm for some spaces whatever their category
const SPACE_CHECKS = {
 '축전지실': 'GMDSS·비상전원 축전지실이면 제어장소(1)일 수 있음 — 확인',
 '식료품 냉장고': '식료품 냉장고를 창고(고위험)로 분류 — 화물구역으로 볼지 주관청 확인',
 '냉장실': '냉장실(화물구역)로 분류 — 식료품 냉장고면 창고로 지정',
 '전기설비실': '주항해·무선 장비가 있으면 제어장소(1) — 확인',
 '덕트 트렁크': '트렁크 벽은 관통하는 갑판의 방화 성능을 이어야 함 — 확인' };
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
 if (!SHIPS.includes(s.ship)) s.ship = DEFAULT_SETTINGS.ship;
 if (u?.cat) return { space: u.space || null, cat: u.cat, source: 'user', check: null };
 let ko = u?.space || null, source = ko ? 'user' : null;
 if (!ko) { const hit = matchName(room.name || ''); if (hit) { ko = hit; source = 'name'; } }
 if (!ko && ISO_CLASS_SPACE[room.isoClass]) { ko = ISO_CLASS_SPACE[room.isoClass]; source = 'iso-class'; }
 const a = room.areaM2 || 0;
 if (ko === '@public') ko = a < 50 ? '공공장소 — 50㎡ 미만' : '공공장소 — 50㎡ 이상 · 비제한';
 if (ko === '@laundry') ko = a > 4 ? '주세탁실' : '소세탁실';
 if (ko === '@drying') ko = a > 4 ? '대건조실 — 4㎡ 초과' : '소건조실 — 4㎡ 이하';
 // lockers and stores: 4 m² and more are high-risk service spaces
 if (ko === '@store') ko = a >= 4 ? '로커·창고 — 4㎡ 초과' : '로커·소창고 — 4㎡ 미만';
 if (!ko) return { space: null, cat: null, source: 'unclassified', check: null };
 const cat = catOf(s.ship, ko);
 return { space: ko, cat, source: cat == null ? 'no-category' : source, check: source === 'user' ? null : SPACE_CHECKS[ko] || null };
}
const catName = (ship, cat) => cat ? DATA.cats[catSet(SHIPS.includes(ship) ? ship : 'CARG')][cat - 1] : null;

// ---------- table lookup ----------
function parseCell(raw) { if (raw == null) return null; return { raw, alts: raw.split('|').map(p => { const [val, sup = ''] = p.split('^'); return { val, sup: sup.split('').filter(Boolean) }; }) }; }
// cats are 1-based; orient 'B' bulkhead (symmetric), 'D' deck (i = space below, j = space above)
function lookup(ship, orient, i, j) {
 const sh = DATA.ships[ship], t = DATA.tables[orient === 'D' ? sh.D : sh.B], n = DATA.cats[sh.cat].length;
 if (!(i >= 1 && j >= 1 && i <= n && j <= n)) return null;
 return orient === 'D' ? parseCell(t[i - 1][j - 1]) : parseCell(t[Math.min(i, j) - 1][Math.max(i, j) - 1]);
}
// the notes that decide between two values: "see 9.2.x (bulkhead to the deck / stairway protection)" and the sprinkler note
const WHICH_NOTE = { CARG: 'c', TANK: 'a', P36M: 'a' }, SPRINKLER_NOTE = { P36M: 'd' }, SAME_USE_NOTE = { CARG: 'd', TANK: 'b', P36M: 'b' };

// rating of one boundary: the table cell, its alternatives and notes resolved by the settings; `check` lists what a
// designer must confirm. a / b: { space, cat, stairDecks } (stairDecks: decks the stair enclosure spans).
function rate(ship, orient, a, b, settings = DEFAULT_SETTINGS, sameUse = false) {
 const s = { ...DEFAULT_SETTINGS, ...settings }; if (!SHIPS.includes(ship)) ship = DEFAULT_SETTINGS.ship;
 const sh = DATA.ships[ship], notesOf = DATA.notes[sh.notes];
 if (!a.cat || !b.cat) return { grade: null, raw: null, notes: [], check: ['미분류 실 — 범주 지정 필요'], table: null };
 const cell = lookup(ship, orient, a.cat, b.cat);
 if (!cell) return { grade: null, raw: null, notes: [], check: ['표에 값 없음'], table: null };
 const check = [], notes = [];
 const sorted = [...cell.alts].sort((x, y) => rank(x.val) - rank(y.val)); let alt = sorted[0];
 if (cell.alts.length > 1) {
  const sups = cell.alts.flatMap(x => x.sup), stair = [a, b].find(x => x.space === '계단격실');
  if (SPRINKLER_NOTE[ship] && sups.includes(SPRINKLER_NOTE[ship])) {
   // II-2/9.2.2.4.2.3-4: both sides sprinklered -> the smaller value, otherwise the larger
   alt = s.sprinkler ? sorted.at(-1) : sorted[0]; check.push(`스프링클러 ${s.sprinkler ? '양쪽 설치' : '미설치(또는 한쪽)'} 기준 ${alt.val} — 실별 설치 여부 확인`);
  } else if (sups.includes(WHICH_NOTE[ship]) && stair) {
   // stairways (cargo ships II-2/9.2.3.4, tankers 9.2.4, passenger <= 36 9.2.2.5): through one deck B-0 at least at one
   // level, through more than one deck A-0 at all levels
   if ((stair.stairDecks || 1) >= 2) alt = sorted[0];
   else { alt = sorted.at(-1); check.push(`계단이 갑판 하나만 관통 — ${alt.val} 가능(한 층 이상, 자동폐쇄문) · 여러 층이면 ${sorted[0].val}`); }
  } else check.push(`${cell.alts.map(x => x.val).join(' / ')} 중 엄격한 값 — 해당 조항(주석 ${[...new Set(sups)].join('')}) 확인`);
 }
 let grade = alt.val;
 for (const k of new Set(cell.alts.flatMap(x => x.sup))) notes.push({ key: k, text: notesOf[k] });
 const sups = alt.sup;
 // cargo ships: note a - methods IIC / IIIC put no requirement on these bulkheads; note b - IIIC: B-0 between >= 50 m²
 if (ship === 'CARG' && sups.includes('a') && s.method !== 'IC') { grade = '-'; check.push(`방화방식 ${s.method}: 이 격벽은 특별 요건 없음 (주석 a)`); }
 if (ship === 'CARG' && sups.includes('b') && s.method === 'IIIC') check.push('방식 IIIC: 50㎡ 이상 구역(군) 사이 B-0 (주석 b)');
 // same category, "only when the uses differ": the same space on both sides = the same use = not required
 if (a.cat === b.cat && sups.includes(SAME_USE_NOTE[ship])) {
  if (sameUse) { grade = '-'; check.push('같은 용도 — 표의 등급은 용도가 다를 때만 요구'); } else check.push('같은 범주·다른 용도 — 표의 등급 적용');
 }
 // passenger > 36, note a: the administration may waive the division between spaces of the same category - only flagged
 if (ship === 'P36P' && a.cat === b.cat && sups.includes('a')) check.push('주석 a: 같은 범주 사이 격벽 생략은 주관청 판단 — 확인');
 return { grade, raw: cell.raw, notes, check, table: orient === 'D' ? sh.tD : sh.tB, cell: orient === 'D' ? [a.cat, b.cat] : [Math.min(a.cat, b.cat), Math.max(a.cat, b.cat)] };
}

// ---------- boundaries ----------
// parts of [0, L] not covered by the intervals
function uncovered(L, intervals, min) {
 const iv = [...intervals].sort((x, y) => x[0] - y[0]), out = []; let at = 0;
 for (const [s, e] of iv) { if (s - at >= min) out.push([at, s]); at = Math.max(at, e); }
 if (L - at >= min) out.push([at, L]);
 return out;
}
const mid = (a, b) => `${Math.round((a.x + b.x) / 2)}|${Math.round((a.y + b.y) / 2)}`;
const LIVING = /^선실|^사무실|^식당|^오락실|^공공장소|^병원|^통로|^로비|^조타실|^해도실|^무선실|^항해·통신|^계단|^화장실|^팬트리 — 조리기구 없음/;

// all boundaries of the contract: bulkheads (same deck, outlines and holes), outer walls (to the open deck), holes no
// room fills (outside the model), decks (stacked rooms), and the floor / ceiling no room of the next deck covers
function boundaries(contract, settings = {}) {
 const s = settingsOf(contract, settings), user = contract.solas?.rooms || {}, ship = s.ship;
 const cls = Object.fromEntries(contract.rooms.map(r => [r.id, classify(r, s, user)]));
 const decks = [...contract.decks].sort((a, b) => a.elevationMm - b.elevationMm), deckIndex = id => decks.findIndex(d => d.id === id);
 // stair enclosures: how many decks each spans (stacked stair rooms that overlap in plan)
 const stairs = contract.rooms.filter(r => cls[r.id].space === '계단격실'), stairDecks = {};
 for (const r of stairs) { let n = 1;
  for (const dir of [1, -1]) { let k = deckIndex(r.deckId), cur = r; for (;;) { k += dir; const d = decks[k]; if (!d) break; const next = stairs.find(x => x.deckId === d.id && GE.overlapM2(cur, x) > 0.5); if (!next) break; n++; cur = next; } }
  stairDecks[r.id] = n; }
 const side = id => ({ ...cls[id], stairDecks: stairDecks[id] });
 const openCat = DATA.cats[catSet(ship)].indexOf('개방갑판') + 1, open = { space: '개방갑판', cat: openCat };
 const out = [], push = (b, a, c, orient, extra = []) => { const sameUse = !!a.space && a.space === c.space && a.source !== 'unclassified';
  const r = rate(ship, orient, a, c, s, sameUse), over = contract.solas?.bounds?.[b.id]; if (over?.grade && GRADES.includes(over.grade)) { r.grade = over.grade; r.check = [...r.check, '사용자 지정 등급']; }
  out.push({ ...b, orient, grade: r.grade, raw: r.raw, notes: r.notes, check: [...r.check, ...extra], table: r.table, cell: r.cell, aSpace: a.space, bSpace: c.space, aCat: a.cat, bCat: c.cat }); };
 const tankerWall = c => ship === 'TANK' && LIVING.test(c.space || '') ? ['II-2/9.2.4.2.5: 화물구역을 향한 외벽(단부에서 3 m 포함)이면 A-60 — 확인'] : [];
 for (const deck of decks) {
  const rooms = contract.rooms.filter(r => r.deckId === deck.id), covered = new Map(), E = new Map(rooms.map(r => [r.id, GE.roomEdges(r)]));
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
   const p = rooms[i], q = rooms[j], bp = GE.bbox(p.polygon), bq = GE.bbox(q.polygon), t = s.wallToleranceMm;
   if (bp.minX - t > bq.maxX || bq.minX - t > bp.maxX || bp.minY - t > bq.maxY || bq.minY - t > bp.maxY) continue;
   E.get(p.id).forEach((e, ei) => E.get(q.id).forEach((f, fi) => {
    const seg = GE.sharedSegment(e, f, t, s.minOverlapMm); if (!seg) return;
    const key = p.id + '#' + ei; covered.set(key, [...(covered.get(key) || []), seg.along]);
    const back = GE.sharedSegment(f, e, t, s.minOverlapMm); if (back) covered.set(q.id + '#' + fi, [...(covered.get(q.id + '#' + fi) || []), back.along]);
    push({ id: `B:${p.id}|${q.id}|${mid(seg.a, seg.b)}`, kind: 'bulkhead', deckId: deck.id, roomA: p.id, roomB: q.id, a: seg.a, b: seg.b, lengthMm: Math.round(seg.lengthMm) }, side(p.id), side(q.id), 'B');
   }));
  }
  // edges no other room covers: outline -> outer wall to the open deck; hole -> a space outside the model (held)
  for (const p of rooms) { const nOuter = p.polygon.length;
   E.get(p.id).forEach(([a, b], ei) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y), dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
    for (const [t0, t1] of uncovered(L, covered.get(p.id + '#' + ei) || [], s.minOverlapMm * 5)) {
     const A = { x: a.x + dx * t0, y: a.y + dy * t0 }, B = { x: a.x + dx * t1, y: a.y + dy * t1 }, hole = ei >= nOuter;
     if (hole) out.push({ id: `V:${p.id}|${mid(A, B)}`, kind: 'void', deckId: deck.id, roomA: p.id, roomB: null, a: A, b: B, lengthMm: Math.round(t1 - t0), orient: 'B', grade: null, raw: null, notes: [], check: ['구멍 안 공간이 모델에 없음 — 그 공간을 격실로 넣거나 등급 확인'], table: null, aSpace: cls[p.id].space, bSpace: null, aCat: cls[p.id].cat, bCat: null });
     else push({ id: `O:${p.id}|${mid(A, B)}`, kind: 'outer', deckId: deck.id, roomA: p.id, roomB: null, a: A, b: B, lengthMm: Math.round(t1 - t0) }, side(p.id), open, 'B', tankerWall(cls[p.id]));
    }
   });
  }
 }
 // decks: a room and the rooms of the next deck up that overlap it in plan (table: space below, space above). A small
 // shaft counts when half of it overlaps.
 for (let k = 0; k + 1 < decks.length; k++) {
  const below = contract.rooms.filter(r => r.deckId === decks[k].id), above = contract.rooms.filter(r => r.deckId === decks[k + 1].id);
  for (const p of below) for (const q of above) { const m2 = GE.overlapM2(p, q), min = Math.min(0.5, 0.5 * Math.min(GE.roomArea(p), GE.roomArea(q)) / 1e6); if (m2 < min || m2 <= 0) continue;
   push({ id: `D:${p.id}|${q.id}`, kind: 'deck', deckId: decks[k + 1].id, belowDeckId: decks[k].id, roomA: p.id, roomB: q.id, areaM2: Math.round(m2 * 100) / 100 }, side(p.id), side(q.id), 'D'); }
 }
 // the model's edge: floors no room of the deck below covers, ceilings no room of the deck above covers. Below the
 // lowest deck is the space set in solas.lowestBelow (else held); everything else open is the open deck.
 const below = s.lowestBelow ? { space: s.lowestBelow, cat: catOf(ship, s.lowestBelow) } : null;
 for (let k = 0; k < decks.length; k++) {
  const rooms = contract.rooms.filter(r => r.deckId === decks[k].id), under = k > 0 ? contract.rooms.filter(r => r.deckId === decks[k - 1].id) : [], over = k + 1 < decks.length ? contract.rooms.filter(r => r.deckId === decks[k + 1].id) : [];
  for (const p of rooms) {
   const f = GE.uncoveredM2(p, under), c = GE.uncoveredM2(p, over);
   if (f.m2 >= 0.5) {
    const b = { id: `F:${p.id}`, kind: 'floor', deckId: decks[k].id, roomA: null, roomB: p.id, areaM2: Math.round(f.m2 * 10) / 10, at: f.at };
    if (k === 0 && !below) out.push({ ...b, orient: 'D', grade: null, raw: null, notes: [], check: ['최하층 아래 공간 미지정 — ⑤ 방화에서 "최하층 아래" 지정'], table: null, aSpace: null, bSpace: cls[p.id].space, aCat: null, bCat: cls[p.id].cat });
    else push(b, k === 0 ? below : open, side(p.id), 'D', k === 0 ? [] : ['아래가 개방갑판(돌출부) — 확인']);
   }
   if (c.m2 >= 0.5) push({ id: `C:${p.id}`, kind: 'ceiling', deckId: decks[k].id, roomA: p.id, roomB: null, areaM2: Math.round(c.m2 * 10) / 10, at: c.at }, side(p.id), open, 'D', k + 1 < decks.length ? ['위가 노출 갑판 — 확인'] : []);
  }
 }
 return { settings: s, classes: cls, stairDecks, boundaries: out };
}

// ---------- penetrations ----------
// where a polyline crosses a boundary segment. A vertex on the boundary line counts once, and only when the polyline goes
// from one side to the other (touching and turning back is not a crossing); a run along the boundary is not a crossing.
function polyCrossings(pts, a, b, tol = 1) {
 const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 1) return [];
 const side = p => { const v = ((p.x - a.x) * dy - (p.y - a.y) * dx) / L; return Math.abs(v) <= tol ? 0 : Math.sign(v); };
 const along = p => ((p.x - a.x) * dx + (p.y - a.y) * dy) / (L * L);
 const sides = pts.map(side), out = [];
 let prev = -1;   // last vertex index with a side
 for (let k = 0; k < pts.length; k++) {
  if (!sides[k]) continue;
  if (prev >= 0 && sides[k] !== sides[prev]) {
   let x;
   if (k === prev + 1) { const p = pts[prev], q = pts[k], sp = ((p.x - a.x) * dy - (p.y - a.y) * dx), sq = ((q.x - a.x) * dy - (q.y - a.y) * dx), t = sp / (sp - sq); x = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; }
   else x = pts[prev + 1];   // the first vertex on the line
   const u = along(x); if (u >= -tol / L && u <= 1 + tol / L) out.push(x);
  }
  prev = k;
 }
 return out;
}
// kept for callers of the segment form: the crossing of two segments (end points excluded)
function crossing(p, q, a, b) { const x = polyCrossings([p, q], a, b); return x.length ? x[0] : null; }

// II-2/9.7.3 measures by the boundary class and the duct's free cross-section (inner size; nominal size used here)
function measure(grade, areaM2, sized = true) {
 const c = gradeClass(grade), ins = grade && grade !== 'A-0' ? ` + ${grade} 단열` : '';
 if (!grade) return { code: 'CHECK', text: '경계 범주 미정 — 실 분류 후 판정', sleeveMm: 0, damper: false };
 if (c === 'A') {
  if (!sized) return { code: 'A-SIZE', text: '덕트 크기 산정 후 판정 (A급)', sleeveMm: 0, damper: false };
  if (areaM2 > 0.075) return { code: 'A-FD', text: `강재 슬리브 3t × 900${ins} + 자동 방화댐퍼`, sleeveMm: 900, damper: true };
  if (areaM2 > 0.02) return { code: 'A-900', text: `강재 슬리브 3t × 900${ins}`, sleeveMm: 900, damper: false };
  return { code: 'A-200', text: '강재 슬리브 3t × 200', sleeveMm: 200, damper: false };
 }
 if (c === 'B') return !sized ? { code: 'B-SIZE', text: '덕트 크기 산정 후 판정 (B급)', sleeveMm: 0, damper: false }
  : areaM2 > 0.02 ? { code: 'B-900', text: '강재 슬리브 900 (그 길이가 강재 덕트면 생략)', sleeveMm: 900, damper: false } : { code: 'B-SEAL', text: '관통부 밀폐', sleeveMm: 0, damper: false };
 if (c === 'STAR') return { code: 'STAR', text: '강 또는 동등재, 관통부 밀폐', sleeveMm: 0, damper: false };
 return { code: 'NONE', text: '요건 없음', sleeveMm: 0, damper: false };
}
const ductArea = d => d.diameterMm ? Math.PI * (d.diameterMm / 1000) ** 2 / 4 : d.widthMm && d.heightMm ? d.widthMm * d.heightMm / 1e6 : 0;
const sizeText = d => d.diameterMm ? `Ø${d.diameterMm}` : d.widthMm && d.heightMm ? `${d.widthMm}×${d.heightMm}` : '미산정';
const SHAFT_SPACES = new Set(['덕트 트렁크', '환기·공조 기계실']);

// ducts: { [planKey]: { deckId, systemId, kind, ducts:[{ points (app coords, y down), widthMm, heightMm, diameterMm, flowCmh, type }] } }
// risers: lib/risers.cjs riser list. One penetration per duct and place: where boundaries meet (T-junction) the strictest.
function penetrations(contract, bounds, ducts = {}, risers = []) {
 const out = [], byDeck = {};
 for (const b of bounds.boundaries) if (b.a && b.b) (byDeck[b.deckId] = byDeck[b.deckId] || []).push(b);
 const add = (list, p) => { const same = list.find(x => Math.hypot(x.x - p.x, x.y - p.y) <= 50); if (!same) { list.push(p); return; } if (rank(p.grade) < rank(same.grade)) Object.assign(same, p, { boundaryIds: [...same.boundaryIds, ...p.boundaryIds] }); else same.boundaryIds.push(...p.boundaryIds); };
 for (const [key, net] of Object.entries(ducts)) for (const [di, d] of (net.ducts || []).entries()) {
  const pts = (d.points || []).map(p => ({ x: p.x, y: -p.y })), area = ductArea(d), sized = area > 0, here = [];
  for (const b of byDeck[net.deckId] || []) for (const x of polyCrossings(pts, b.a, b.b))
   add(here, { planKey: key, deckId: net.deckId, systemId: net.systemId, kind: net.kind, duct: d.displayName || d.id || `#${di + 1}`, ductType: d.type, boundaryId: b.id, boundaryIds: [b.id], boundaryKind: b.kind,
    roomA: b.roomA, roomB: b.roomB, grade: b.grade, x: Math.round(x.x), y: Math.round(x.y), size: sizeText(d), areaM2: Math.round(area * 10000) / 10000, flowCmh: d.flowCmh, ...measure(b.grade, area, sized) });
  out.push(...here);
 }
 // risers (lib/risers.cjs runs them from the unit side to the far side): the horizontal offset runs on the deck of the
 // unit side, from the unit (or the previous shaft) to the shaft of the far deck - x first or y first, whichever crosses
 // fewer boundaries; the vertical part stands at the far shaft and crosses the deck of every level between the two ends
 const roomAt = (deckId, p) => contract.rooms.find(r => r.deckId === deckId && GE.inRoom(p, r));
 const decks = [...contract.decks].sort((a, b) => a.elevationMm - b.elevationMm), cls = bounds.classes, ship = bounds.settings.ship;
 for (const r of risers) {
  const area = r.widthMm * r.heightMm / 1e6, size = `${r.widthMm}×${r.heightMm}`, base = { planKey: null, riserId: r.id, systemId: r.systemId, kind: r.kind, duct: `RISER ${r.fromDeckId}→${r.toDeckId}`, size, areaM2: Math.round(area * 10000) / 10000, flowCmh: r.flowCmh };
  const runOf = pts => { const o = []; for (const b of byDeck[r.fromDeckId] || []) for (const x of polyCrossings(pts, b.a, b.b)) add(o, { ...base, deckId: r.fromDeckId, ductType: 'riser-offset', boundaryId: b.id, boundaryIds: [b.id], boundaryKind: b.kind, roomA: b.roomA, roomB: b.roomB, grade: b.grade, x: Math.round(x.x), y: Math.round(x.y), ...measure(b.grade, area, true) }); return o; };
  const xFirst = runOf([r.from, { x: r.to.x, y: r.from.y }, r.to]), yFirst = runOf([r.from, { x: r.from.x, y: r.to.y }, r.to]);
  out.push(...(yFirst.length < xFirst.length ? yFirst : xFirst));
  const iFrom = decks.findIndex(d => d.id === r.fromDeckId), iTo = decks.findIndex(d => d.id === r.toDeckId), p = r.to;
  for (let k = Math.min(iFrom, iTo) + 1; k <= Math.max(iFrom, iTo); k++) {
   const lo = roomAt(decks[k - 1].id, p), hi = roomAt(decks[k].id, p);
   let b = bounds.boundaries.find(x => x.kind === 'deck' && x.roomA === lo?.id && x.roomB === hi?.id), grade = b?.grade ?? null, extra = {};
   if (!b && lo && hi) grade = rate(ship, 'D', cls[lo.id], cls[hi.id], bounds.settings, cls[lo.id].space === cls[hi.id].space).grade;
   if (!lo || !hi) extra = { text: '수직 덕트 위치 위·아래에 실이 없음 — 샤프트 위치 확인', code: 'CHECK' };
   const outsideShaft = [lo, hi].filter(Boolean).filter(x => !SHAFT_SPACES.has(cls[x.id]?.space));
   out.push({ ...base, deckId: decks[k].id, ductType: 'riser', boundaryId: b?.id || null, boundaryIds: b ? [b.id] : [], boundaryKind: 'deck', roomA: lo?.id || null, roomB: hi?.id || null, grade, x: Math.round(p.x), y: Math.round(p.y), ...measure(grade, area, true), ...extra,
    note: outsideShaft.length ? '샤프트·트렁크가 아닌 실을 수직 관통 — 트렁크 배치 확인' : null });
  }
 }
 out.sort((a, b) => a.systemId.localeCompare(b.systemId) || a.deckId.localeCompare(b.deckId) || a.x - b.x || a.y - b.y);
 out.forEach((p, i) => p.no = 'P-' + String(i + 1).padStart(3, '0'));
 return out;
}

// ---------- restricted spaces passed (II-2/9.7.2) ----------
const MACHINERY_A = new Set(['기관실 — A류', '보일러실']), GALLEY = new Set(['조리실', '팬트리 — 조리기구 있음 (조리실 부속)']);
const RESTRICTED = { '기관실 — A류': 'A류 기관구역', '보일러실': 'A류 기관구역', '조리실': '조리실', '팬트리 — 조리기구 있음 (조리실 부속)': '조리실', '소화제 저장실 (CO₂실)': 'CO₂실', '계단격실': '계단(피난로)', '축전지실': '축전지실', '페인트 로커': '페인트 로커', '가연성 액체 창고': '가연성 액체 창고', '램프실': '램프실' };
// rooms each deck duct passes without serving them. plans: lib/phg-plan.cjs; geometry: the PHG D duct polylines.
function passages(contract, plans, geometry, classes) {
 const out = [], rooms = contract.rooms;
 for (const p of plans) {
  const ducts = geometry?.[p.key]?.ducts || []; if (!ducts.length) continue;
  const served = new Set(p.rus.map(u => u.roomId)), deckRooms = rooms.filter(r => r.deckId === p.deckId), len = {};
  const sysSpaces = new Set([...served].map(id => classes[id]?.space));
  for (const d of ducts) { const pts = (d.points || []).map(q => ({ x: q.x, y: -q.y }));
   for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / 100));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
     const r = deckRooms.find(x => GE.inRoom(q, x) && GE.roomEdgeDistance(q, x) > 60); if (r && !served.has(r.id) && r.id !== p.rootRoomId) len[r.id] = (len[r.id] || 0) + L / n; } } }
  for (const [id, mm] of Object.entries(len)) {
   if (mm < 300) continue;
   const sp = classes[id]?.space, what = RESTRICTED[sp], fromHazard = [...sysSpaces].some(x => GALLEY.has(x) || MACHINERY_A.has(x));
   const base = { planKey: p.key, deckId: p.deckId, systemId: p.systemId, kind: p.kind, roomId: id, space: sp, lengthM: Math.round(mm / 100) / 10 };
   if (what && !sysSpaces.has(sp)) out.push({ ...base, level: what === '계단(피난로)' ? 'check' : 'fail', rule: 'II-2/9.7.2', text: `${what}을(를) 통과 — ${what === '계단(피난로)' ? '피난로에 덕트, 피하는 것이 원칙' : '원칙적으로 금지(조건부 예외: 강판 덕트·A-60 단열·경계 근처 자동 방화댐퍼)'}` });
   else if (fromHazard && LIVING.test(sp || '')) out.push({ ...base, level: 'check', rule: 'II-2/9.7.2 · 9.7.5', text: `${[...sysSpaces].some(x => GALLEY.has(x)) ? '조리실' : 'A류 기관구역'} 덕트가 거주·업무구역 통과 — 해당 구간 A급 구조·방화댐퍼 조건 확인` });
  }
 }
 return out;
}

// II-2/9.7.2.1 / 9.7.5 system warnings: galley, category A machinery and cargo spaces each on their own ventilation
function systemWarnings(contract, bounds) {
 const out = [], cls = bounds.classes, CARGO = new Set(['화물창', '화물유탱크', 'Ro-ro 구역', '차량구역', '특수분류구역']);
 for (const s of contract.systems) {
  const spaces = s.roomIds.map(id => cls[id]?.space).filter(Boolean);
  for (const [set, what, allow] of [[GALLEY, '조리실', new Set([...GALLEY, '팬트리 — 조리기구 없음'])], [MACHINERY_A, 'A류 기관구역', new Set([...MACHINERY_A])], [CARGO, '화물구역', CARGO]]) {
   if (!spaces.some(x => set.has(x))) continue;
   const others = [...new Set(spaces.filter(x => !allow.has(x)))];
   if (others.length) out.push({ systemId: s.id, kind: s.kind, rule: 'II-2/9.7.2.1' + (what === '조리실' ? ' · 9.7.5' : ''), text: `${s.id}: ${what}과 다른 구역(${others.slice(0, 4).join(', ')}${others.length > 4 ? ' …' : ''})을 같은 계통이 담당 — ${what} 환기는 분리` });
  }
 }
 return out;
}

// check lists a surveyor expects per ventilation system (items to confirm, not computed)
function checklist(contract, bounds, pass = []) {
 const cls = bounds.classes, out = [];
 const item = (systemId, rule, text, level = 'check') => out.push({ systemId, rule, text, level });
 for (const s of contract.systems) {
  const spaces = new Set(s.roomIds.map(id => cls[id]?.space));
  if (s.kind === 'exhaust' && [...spaces].some(x => GALLEY.has(x))) {
   const through = pass.filter(p => p.systemId === s.id && LIVING.test(p.space || '')).reduce((t, p) => t + p.lengthM, 0);
   item(s.id, 'II-2/9.7.5', '조리실 레인지 배기: 쉽게 분리·청소되는 그리스 트랩, 덕트 하단 방화댐퍼, 조리실 안에서 배기팬 정지, 덕트 안 고정식 소화장치');
   if (through > 0) item(s.id, 'II-2/9.7.5.1', `조리실 배기 덕트가 거주·가연물 구역을 ${Math.round(through * 10) / 10} m 통과 — 그 구간 A급 구조`);
  }
  // battery and CO2 rooms: air taken out of them (exhaust, return) must not share a system; a shared supply is only
  // flagged (no return from the room, its own exhaust)
  const shared = spaces.size > 1, out_ = s.kind !== 'supply';
  if ([...spaces].includes('축전지실')) item(s.id, '선급 규칙 · IEC 60092', !shared ? '축전지실 독립 배기: 방폭 또는 기류 밖 팬, 상부 배기' : out_ ? `축전지실 ${s.kind === 'return' ? '환기(RA)' : '배기'}를 다른 실과 같은 계통이 담당 — 독립 배기·방폭(또는 기류 밖) 팬으로 분리` : '축전지실 급기를 공용 공조기에서 — 환기(RA) 없이, 배기는 독립 계통인지 확인', shared && out_ ? 'fail' : 'check');
  if ([...spaces].includes('소화제 저장실 (CO₂실)')) item(s.id, 'FSS Code 5.2', !shared ? 'CO₂실 독립 환기(바닥 근처 흡입) 확인' : out_ ? 'CO₂실 배기·환기를 다른 실과 같은 계통이 담당 — 독립 환기' : 'CO₂실 급기를 공용 공조기에서 — 배기는 독립 계통인지 확인', shared && out_ ? 'fail' : 'check');
 }
 // rooms that must have their own exhaust and have none
 for (const r of contract.rooms.filter(r => !r.systems.exhaust)) {
  const sp = cls[r.id]?.space;
  if (sp === '소화제 저장실 (CO₂실)') item(null, 'FSS Code 5.2', `${r.no} ${r.name}: 배기 계통 없음 — CO₂실은 독립 환기 필요${r.systems.supply ? ' (급기만 있음)' : ''}`, r.systems.supply ? 'check' : 'fail');
  if (sp === '축전지실') item(null, '선급 규칙 · IEC 60092', `${r.no} ${r.name}: 배기 계통 없음 — 축전지실은 독립 배기(수소) 필요`, 'fail');
 }
 if (contract.systems.length) item(null, 'II-2/5.2.1', `통풍 정지·폐쇄: 모든 계통(${contract.systems.length}개)의 흡입·배출구 폐쇄 장치와 구역 밖 팬 정지 위치, 기관구역 팬은 다른 구역과 별도 정지`);
 return out;
}

// counts for the review and the material list
function summary(bounds, pens, pass = [], list = []) {
 const byGrade = {}, byCode = {}, sleeves = {}, dampers = {};
 for (const b of bounds.boundaries) byGrade[b.grade ?? '미정'] = (byGrade[b.grade ?? '미정'] || 0) + 1;
 for (const p of pens) { byCode[p.code] = (byCode[p.code] || 0) + 1; if (p.sleeveMm) sleeves[p.sleeveMm] = (sleeves[p.sleeveMm] || 0) + 1; if (p.damper) dampers[p.size] = (dampers[p.size] || 0) + 1; }
 const unclassified = Object.entries(bounds.classes).filter(([, c]) => !c.cat).map(([id]) => id);
 return { boundaries: bounds.boundaries.length, byGrade, penetrations: pens.length, byCode, sleeves, dampers, fireDampers: Object.values(dampers).reduce((t, n) => t + n, 0), unclassified,
  boundaryChecks: bounds.boundaries.filter(b => b.check.length).length, roomChecks: Object.values(bounds.classes).filter(c => c.check).length,
  penetrationChecks: pens.filter(p => /SIZE|CHECK/.test(p.code) || p.note).length, passagesFail: pass.filter(p => p.level === 'fail').length, passagesCheck: pass.filter(p => p.level === 'check').length,
  checklistFail: list.filter(x => x.level === 'fail').length, checklistCheck: list.filter(x => x.level === 'check').length };
}

module.exports = { DATA, SPACES, EXTRA_SPACES, SPACE_CHECKS, DEFAULT_SETTINGS, SHIPS, GRADES, SYNONYMS, RESTRICTED, matchName, rank, gradeClass, settingsOf, classify, catName, catOf, lookup, rate,
 boundaries, polyCrossings, crossing, measure, penetrations, passages, systemWarnings, checklist, summary, ductArea, sharedSegment: GE.sharedSegment, overlapM2: GE.overlapM2 };
