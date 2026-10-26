// Ver 2.0 fire engine, system checks (V2-3.9 fire): systems that must be separate (II-2/9.7.2.1, 9.7.5), the items a
// surveyor expects per ventilation system, the user's SOLAS choices that no longer find their room or wall, and the
// counts of the review. New code (D7); 1.0 lib/solas.cjs is the functional reference. SOLAS / FSS / IEC clause numbers
// as 1.0 had them: 원문 미확인 (F-2).
'use strict';
const { GALLEY, MACHINERY_A } = require('./penetrations.cjs'), { LIVING } = require('./boundaries.cjs');
const CARGO = new Set(['화물창', '화물유탱크', 'Ro-ro 구역', '차량구역', '특수분류구역']);

// galley, category A machinery and cargo spaces each on their own ventilation
function systemWarnings(systems, classes) {
 const out = [];
 for (const s of systems) {
  const spaces = s.roomIds.map(id => classes[id]?.space).filter(Boolean);
  for (const [set, what, allow] of [[GALLEY, '조리실', new Set([...GALLEY, '팬트리 — 조리기구 없음'])], [MACHINERY_A, 'A류 기관구역', new Set(MACHINERY_A)], [CARGO, '화물구역', CARGO]]) {
   if (!spaces.some(x => set.has(x))) continue;
   const others = [...new Set(spaces.filter(x => !allow.has(x)))];
   if (others.length) out.push({ systemId: s.id, kind: s.kind, rule: 'II-2/9.7.2.1' + (what === '조리실' ? ' · 9.7.5' : ''), text: `${s.id}: ${what}과 다른 구역(${others.slice(0, 4).join(', ')}${others.length > 4 ? ' …' : ''})을 같은 계통이 담당 — ${what} 환기는 분리` });
  }
 }
 return out;
}

// items to confirm per system (not worked out): galley range exhaust, battery and CO2 rooms, closing of every system
function checklist({ rooms, assign, systems }, classes, passages = []) {
 const out = [], item = (systemId, rule, text, level = 'check') => out.push({ systemId, rule, text, level });
 for (const s of systems) {
  const spaces = new Set(s.roomIds.map(id => classes[id]?.space));
  if (s.kind === 'exhaust' && [...spaces].some(x => GALLEY.has(x))) {
   const through = passages.filter(p => p.systemId === s.id && LIVING.test(p.space || '')).reduce((t, p) => t + p.lengthM, 0);
   item(s.id, 'II-2/9.7.5', '조리실 레인지 배기: 쉽게 분리·청소되는 그리스 트랩, 덕트 하단 방화댐퍼, 조리실 안에서 배기팬 정지, 덕트 안 고정식 소화장치');
   if (through > 0) item(s.id, 'II-2/9.7.5.1', `조리실 배기 덕트가 거주·가연물 구역을 ${Math.round(through * 10) / 10} m 통과 — 그 구간 A급 구조`);
  }
  // air taken out of a battery or CO2 room (exhaust, return) never shares a system; a shared supply is only flagged
  const shared = spaces.size > 1, takesOut = s.kind !== 'supply';
  if (spaces.has('축전지실')) item(s.id, '선급 규칙 · IEC 60092', !shared ? '축전지실 독립 배기: 방폭 또는 기류 밖 팬, 상부 배기' : takesOut ? `축전지실 ${s.kind === 'return' ? '환기(RA)' : '배기'}를 다른 실과 같은 계통이 담당 — 독립 배기·방폭(또는 기류 밖) 팬으로 분리` : '축전지실 급기를 공용 공조기에서 — 환기(RA) 없이, 배기는 독립 계통인지 확인', shared && takesOut ? 'fail' : 'check');
  if (spaces.has('소화제 저장실 (CO₂실)')) item(s.id, 'FSS Code 5.2', !shared ? 'CO₂실 독립 환기(바닥 근처 흡입) 확인' : takesOut ? 'CO₂실 배기·환기를 다른 실과 같은 계통이 담당 — 독립 환기' : 'CO₂실 급기를 공용 공조기에서 — 배기는 독립 계통인지 확인', shared && takesOut ? 'fail' : 'check');
 }
 for (const r of rooms.filter(r => !assign[r.id]?.exhaust)) {
  const sp = classes[r.id]?.space, supply = assign[r.id]?.supply;
  if (sp === '소화제 저장실 (CO₂실)') item(null, 'FSS Code 5.2', `${r.no} ${r.name}: 배기 계통 없음 — CO₂실은 독립 환기 필요${supply ? ' (급기만 있음)' : ''}`, supply ? 'check' : 'fail');
  if (sp === '축전지실') item(null, '선급 규칙 · IEC 60092', `${r.no} ${r.name}: 배기 계통 없음 — 축전지실은 독립 배기(수소) 필요`, 'fail');
 }
 if (systems.length) item(null, 'II-2/5.2.1', `통풍 정지·폐쇄: 모든 계통(${systems.length}개)의 흡입·배출구 폐쇄 장치와 구역 밖 팬 정지 위치, 기관구역 팬은 다른 구역과 별도 정지`);
 return out;
}

// the user's room spaces and wall ratings whose room or wall is gone (kept - it may come back - and listed)
function staleSettings({ rooms, solas = {} }, bounds) {
 const ids = new Set(rooms.map(r => r.id)), walls = new Set(bounds.boundaries.map(b => b.id));
 return { rooms: Object.keys(solas.rooms || {}).filter(k => !ids.has(k)), bounds: Object.keys(solas.bounds || {}).filter(k => !walls.has(k)) };
}

function summary(bounds, pens, pass = [], list = []) {
 const byGrade = {}, byCode = {}, sleeves = {}, dampers = {}, r1 = v => Math.round(v * 10) / 10;
 for (const b of bounds.boundaries) byGrade[b.grade ?? '미정'] = (byGrade[b.grade ?? '미정'] || 0) + 1;
 for (const p of pens) { byCode[p.code] = (byCode[p.code] || 0) + 1; if (p.sleeveMm) sleeves[p.sleeveMm] = (sleeves[p.sleeveMm] || 0) + 1; if (p.damper) dampers[p.size] = (dampers[p.size] || 0) + 1; }
 return { boundaries: bounds.boundaries.length, byGrade, penetrations: pens.length, byCode, sleeves, dampers, fireDampers: Object.values(dampers).reduce((t, n) => t + n, 0),
  unclassified: Object.entries(bounds.classes).filter(([, c]) => !c.cat).map(([id]) => id),
  boundaryChecks: bounds.boundaries.filter(b => b.check.length).length, roomChecks: Object.values(bounds.classes).filter(c => c.check).length,
  penetrationChecks: pens.filter(p => /SIZE|CHECK/.test(p.code) || p.note).length, outsideM: r1(pass.filter(p => p.outside).reduce((t, p) => t + p.lengthM, 0)), unmodelledM: r1(pass.filter(p => p.unmodelled).reduce((t, p) => t + p.lengthM, 0)),
  passagesFail: pass.filter(p => p.level === 'fail' && !p.outside).length, passagesCheck: pass.filter(p => p.level === 'check' && !p.unmodelled).length,
  checklistFail: list.filter(x => x.level === 'fail').length, checklistCheck: list.filter(x => x.level === 'check').length };
}

module.exports = { systemWarnings, checklist, staleSettings, summary };
