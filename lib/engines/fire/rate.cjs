// Ver 2.0 fire engine, the rating of one boundary (V2-3.9 fire): SOLAS II-2 Tables 9.1-9.8 by ship type - a bulkhead
// (symmetric, 'B') or a deck ('D', row = space below, column = space above) between two fire categories - with the
// table's alternatives and notes resolved by the settings. Tables and note texts: solas-data.json (data from the 1.x
// SOLAS tool, D20). SOLAS values 원문 미확인 (F-2).
//   rate(ship, orient, a, b, settings, sameUse) → { grade, raw, notes, check, table, cell }
//     a, b: { space, cat, stairDecks, stairEdge }; sameUse: the same space on both sides
'use strict';
const C = require('./classify.cjs'), DATA = C.DATA;

// strictest first
const GRADES = ['A-60', 'A-30', 'A-15', 'A-0', 'B-15', 'B-0', 'C', '*', '-'];
const rank = g => { const i = GRADES.indexOf(g); return i < 0 ? GRADES.length : i; };
const gradeClass = g => /^A-/.test(g) ? 'A' : /^B-/.test(g) ? 'B' : g === 'C' ? 'C' : g === '*' ? 'STAR' : 'NONE';
// a table cell "A-0^a|B-0^bd": alternatives, each a value and the notes it carries
const cellOf = raw => raw == null ? null : { raw, alts: raw.split('|').map(p => { const [val, sup = ''] = p.split('^'); return { val, sup: [...sup] }; }) };
function lookup(ship, orient, i, j) {
 const sh = DATA.ships[ship], t = DATA.tables[orient === 'D' ? sh.D : sh.B], n = DATA.cats[sh.cat].length;
 if (!(i >= 1 && j >= 1 && i <= n && j <= n)) return null;
 return cellOf(orient === 'D' ? t[i - 1][j - 1] : t[Math.min(i, j) - 1][Math.max(i, j) - 1]);
}
// the note letter that decides between two values, by ship: stairway protection, sprinklers, the same use on both sides
const STAIR_NOTE = { CARG: 'c', TANK: 'a', P36M: 'a' }, SPRINKLER_NOTE = { P36M: 'd' }, SAME_USE_NOTE = { CARG: 'd', TANK: 'b', P36M: 'b' };

function rate(ship, orient, a, b, settings = C.DEFAULTS, sameUse = false) {
 const s = C.settings(settings); if (!C.SHIPS.includes(ship)) ship = C.DEFAULTS.ship;
 const sh = DATA.ships[ship], texts = DATA.notes[sh.notes];
 if (!a.cat || !b.cat) return { grade: null, raw: null, notes: [], check: ['미분류 실 — 범주 지정 필요'], table: null };
 const cell = lookup(ship, orient, a.cat, b.cat);
 if (!cell) return { grade: null, raw: null, notes: [], check: ['표에 값 없음'], table: null };
 const check = [], byRank = [...cell.alts].sort((x, y) => rank(x.val) - rank(y.val)), strict = byRank[0], light = byRank.at(-1);
 let alt = strict;
 if (cell.alts.length > 1) {
  const sups = cell.alts.flatMap(x => x.sup), stair = [a, b].find(x => x.space === '계단격실');
  if (SPRINKLER_NOTE[ship] && sups.includes(SPRINKLER_NOTE[ship])) {
   // II-2/9.2.2.4.2.3-4: sprinklered on both sides → the lighter value
   alt = s.sprinkler ? light : strict; check.push(`스프링클러 ${s.sprinkler ? '양쪽 설치' : '미설치(또는 한쪽)'} 기준 ${alt.val} — 실별 설치 여부 확인`);
  } else if (sups.includes(STAIR_NOTE[ship]) && stair) {
   // stairways (cargo II-2/9.2.3.4, tankers 9.2.4, passenger ≤ 36 9.2.2.5): through one deck B-0 at one level at least,
   // through more A-0 at every level; a stair that ends at the model's top or bottom may go on beyond it
   const through = (stair.stairDecks || 1) - 1;
   if (through >= 2) alt = strict;
   else if (stair.stairEdge) { alt = strict; check.push(`계단이 모델 끝 Deck에서 끝남 — 모델 밖으로 이어지면 ${strict.val}, 갑판 하나만 관통하면 ${light.val} 가능`); }
   else if (through === 1) { alt = light; check.push(`계단이 갑판 하나만 관통 — ${alt.val} 가능(한 층 이상, 자동폐쇄문)`); }
   else check.push('갑판을 관통하지 않는 계단 — 계단실 범위 확인');
  } else check.push(`${cell.alts.map(x => x.val).join(' / ')} 중 엄격한 값 — 해당 조항(주석 ${[...new Set(sups)].join('')}) 확인`);
 }
 let grade = alt.val;
 const notes = [...new Set(cell.alts.flatMap(x => x.sup))].map(k => ({ key: k, text: texts[k] }));
 // cargo ships: note a - methods IIC and IIIC ask nothing of these bulkheads; note b - IIIC: B-0 between ≥ 50 m²
 if (ship === 'CARG' && alt.sup.includes('a') && s.method !== 'IC') { grade = '-'; check.push(`방화방식 ${s.method}: 이 격벽은 특별 요건 없음 (주석 a)`); }
 if (ship === 'CARG' && alt.sup.includes('b') && s.method === 'IIIC') check.push('방식 IIIC: 50㎡ 이상 구역(군) 사이 B-0 (주석 b)');
 // the same category "only where the uses differ": the same space on both sides is the same use
 if (a.cat === b.cat && alt.sup.includes(SAME_USE_NOTE[ship])) {
  if (sameUse) { grade = '-'; check.push('같은 용도 — 표의 등급은 용도가 다를 때만 요구'); } else check.push('같은 범주·다른 용도 — 표의 등급 적용');
 }
 // passenger > 36, note a: leaving out a division between spaces of one category is the administration's call
 if (ship === 'P36P' && a.cat === b.cat && alt.sup.includes('a')) check.push('주석 a: 같은 범주 사이 격벽 생략은 주관청 판단 — 확인');
 return { grade, raw: cell.raw, notes, check, table: orient === 'D' ? sh.tD : sh.tB, cell: orient === 'D' ? [a.cat, b.cat] : [Math.min(a.cat, b.cat), Math.max(a.cat, b.cat)] };
}

module.exports = { GRADES, rank, gradeClass, lookup, rate };
