// Ver 2.0 review (V2-3.9 review, ⑤): everything the review page, the XLSX and the report show - systems with risers and
// ESP (fire dampers included), SOLAS boundaries, penetrations and restricted spaces, airflow checks, units and the check
// list with its levels. New code (D7); 1.x lib/project.cjs analyze is the functional reference.
//   review(m, { plans, results, nets }) → { plans, results, nets, staleNets, systems, risers, zones, solas, air, checks,
//                                          count, done, stale, total, rootsOutside, rootsBadRoom, deepDucts, trunks, deckAlign }
//   m: rooms, decks, loads, rules, assign, airflow, zones, systems, solas, roots
//   plans: lib/engines/systems/plans.cjs; results: { [planKey]: { indexPa, auto, zonesRelaxed, unconnected, flowCmh, at,
//          stale } } - stale: made from another plan (the recompute table says); nets: { [planKey]: { ducts (BOX y) } }
// A stale network is left out of penetrations, dampers, restricted spaces and quantities until AUTO runs again.
'use strict';
const PL = require('../geometry/plan.cjs'), RS = require('../systems/risers.cjs'), B = require('../fire/boundaries.cjs'), P = require('../fire/penetrations.cjs'), FC = require('../fire/checks.cjs'), R = require('../fire/rate.cjs'), AC = require('./air.cjs');

const RELAX_TEXT = { outside: '실 밖 영역만 해제', rooms: '제한 구역 해제', all: '전부 해제' };
const LIMITS = Object.freeze({ ceilingVoidMm: 400, trunkFill: 0.7 });
// spaces a unit or shaft cannot go in: escape routes, spaces of their own fire risk or gas, cargo
const UNIT_BAD = /^(계단격실|승강기 트렁크|비상탈출트렁크|외부계단|소화제 저장실|조리실|기관실 — A류|보일러실|페인트 로커|가연성 액체|실험실 — 가연성|화물|축전지)/;
const SHAFTS = new Set(['계단격실', '승강기 트렁크', '비상탈출트렁크', '덕트 트렁크']), CASING = /케이싱|CASING/i;

// decks over each other: the spaces that run through decks (stairs, lifts, trunks, casings) stand over each other - a
// pair of adjacent decks that share such a kind with none of it overlapping is reported with the move that would put
// most of them back over each other
function deckAlignment(rooms, deckList, classes) {
 const kind = r => SHAFTS.has(classes[r.id]?.space) ? classes[r.id].space : CASING.test(r.name || '') ? '케이싱' : null;
 const decks = [...deckList].sort((a, b) => a.z - b.z), out = [];
 for (let k = 0; k + 1 < decks.length; k++) {
  if (decks[k].z === decks[k + 1].z) continue;   // a duplicate elevation is reported on its own
  const lo = rooms.filter(r => r.deckId === decks[k].id && kind(r)), hi = rooms.filter(r => r.deckId === decks[k + 1].id && kind(r));
  const kinds = [...new Set(lo.map(kind))].filter(t => hi.some(r => kind(r) === t)); if (!kinds.length) continue;
  const over = (p, q) => PL.overlapM2(p, q) >= Math.min(0.5, 0.5 * Math.min(PL.roomAreaMm2(p), PL.roomAreaMm2(q)) / 1e6);
  if (kinds.some(t => lo.some(p => kind(p) === t && hi.some(q => kind(q) === t && over(p, q))))) continue;
  const votes = new Map();
  for (const p of lo) for (const q of hi) if (kind(p) === kind(q)) { const a = PL.centroid(p.polygon), b = PL.centroid(q.polygon), key = `${Math.round((a.x - b.x) / 50) * 50},${Math.round((a.y - b.y) / 50) * 50}`; votes.set(key, (votes.get(key) || 0) + 1); }
  const [x, y] = [...votes].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  out.push({ lowerDeckId: decks[k].id, upperDeckId: decks[k + 1].id, lower: decks[k].name, upper: decks[k + 1].name, kinds, moveMm: { x, y } });
 }
 return out;
}

function review(m, { plans, results = {}, nets: allNets = {} }) {
 const live = Object.fromEntries(Object.entries(allNets).filter(([k]) => results[k] && !results[k].stale));
 const staleNets = plans.filter(p => results[p.key]?.stale && allNets[p.key]?.ducts?.length).map(p => p.key);
 const decks = m.decks, z = id => decks.find(d => d.id === id)?.z ?? 0;
 const sys0 = RS.systems({ decks, plans, results }), risers0 = sys0.flatMap(s => s.risers);
 const bounds = B.boundaries(m), nets = {};
 for (const p of plans) if (live[p.key]?.ducts?.length) nets[p.key] = { deckId: p.deckId, systemId: p.systemId, kind: p.kind, ducts: live[p.key].ducts };
 const pens = P.penetrations(m, bounds, nets, risers0);
 // fire dampers add their loss: in a riser to it; in the horizontal ducts of a deck network to that deck (all of them,
 // as the index path is not traced through them - an allowance shown on its own)
 const extraPa = {}, deckExtraPa = {};
 for (const p of pens) if (p.riserId && p.damper) { const r = risers0.find(x => x.id === p.riserId); extraPa[p.riserId] = (extraPa[p.riserId] || 0) + RS.RULES.fireDamperK * RS.dynamic(r.velocityMps); }
 for (const p of pens) if (!p.riserId && p.damper && p.planKey && p.areaM2 > 0 && p.flowCmh > 0) deckExtraPa[p.planKey] = (deckExtraPa[p.planKey] || 0) + RS.RULES.fireDamperK * RS.dynamic(p.flowCmh / 3600 / p.areaM2);
 const systems = RS.systems({ decks, plans, results, extraPa, deckExtraPa }).map(s => ({ ...s, fanPa: RS.fanPa(s) })), risers = systems.flatMap(s => s.risers);
 const pass = P.passages(m, plans, live, bounds.classes), list = FC.checklist(m, bounds.classes, pass), warnings = FC.systemWarnings(m.systems, bounds.classes);
 const solas = { settings: bounds.settings, classes: bounds.classes, boundaries: bounds.boundaries, penetrations: pens, passages: pass, checklist: list, warnings, summary: FC.summary(bounds, pens, pass, list) };
 const air = AC.airChecks(m), sum = solas.summary, byId = new Map(m.rooms.map(r => [r.id, r]));
 // transfer air through a fire boundary: through an A-class division a fire-dampered transfer duct; none from a stair
 // (no ventilation opening in a stair door, II-2/9.4.2)
 for (const r of m.rooms) {
  const a = m.airflow[r.id], src = byId.get(a.transferFrom); if (!src || !a.transferInCmh) continue;
  const b = bounds.boundaries.find(x => x.kind === 'bulkhead' && ((x.roomA === r.id && x.roomB === src.id) || (x.roomB === r.id && x.roomA === src.id)));
  if (bounds.classes[src.id]?.space === '계단격실') air.push({ roomId: r.id, level: 'fail', code: 'TRANSFER_STAIR', text: `${r.no} ${r.name}: 계단실에서 전달 공기 — 계단실 문에는 통기구 불가 (II-2/9.4.2)` });
  else if (b && R.gradeClass(b.grade) === 'A') air.push({ roomId: r.id, level: 'check', code: 'TRANSFER_A', text: `${r.no} ${r.name}: ${src.no} ${src.name}에서 전달 공기 ${a.transferInCmh} CMH가 ${b.grade} 경계를 지남 — 방화댐퍼 붙은 전달 덕트 또는 출처 변경` });
 }
 const fresh = p => results[p.key] && !results[p.key].stale;
 const done = plans.filter(p => results[p.key]?.auto && fresh(p)).length, stale = plans.filter(p => results[p.key]?.stale).length;
 const relaxed = { outside: 0, rooms: 0, all: 0 }; for (const p of plans) { const zr = results[p.key]?.zonesRelaxed; if (results[p.key]?.auto && fresh(p) && zr) relaxed[zr === true ? 'all' : zr] = (relaxed[zr === true ? 'all' : zr] || 0) + 1; }
 const relaxedN = relaxed.outside + relaxed.rooms + relaxed.all;
 const unconnected = plans.reduce((t, p) => t + (results[p.key]?.unconnected || 0), 0);
 const flowMismatch = plans.filter(p => results[p.key]?.at && fresh(p) && results[p.key].flowCmh !== p.designCmh).map(p => p.key);
 // the deck of a user's unit location: from its plan, else the longest deck id its key starts with
 const deckOf = k => plans.find(p => p.key === k)?.deckId ?? decks.map(d => d.id).filter(id => k.startsWith(id + '__')).sort((x, y) => y.length - x.length)[0] ?? k.split('__')[0];
 const sysOf = k => plans.find(p => p.key === k)?.systemKey ?? k.slice(deckOf(k).length + 2);
 const rootsOutside = Object.entries(m.roots || {}).filter(([k, p]) => !m.rooms.some(r => r.deckId === deckOf(k) && PL.inRoom(p, r))).map(([k]) => k);
 const rootsBadRoom = Object.entries(m.roots || {}).map(([k, p]) => { const r = m.rooms.find(x => x.deckId === deckOf(k) && PL.inRoom(p, x)), space = r && bounds.classes[r.id]?.space;
  return r && UNIT_BAD.test(space || '') ? { key: k, roomId: r.id, room: `${r.no} ${r.name}`, space } : null; }).filter(Boolean);
 const dupElev = decks.length !== new Set(decks.map(d => d.z)).size, deckAlign = deckAlignment(m.rooms, decks, bounds.classes);
 const stale0 = FC.staleSettings(m, bounds), staleN = stale0.rooms.length + stale0.bounds.length;
 const deep = []; for (const p of plans) for (const d of live[p.key]?.ducts || []) if ((d.heightMm || d.diameterMm || 0) > LIMITS.ceilingVoidMm) deep.push({ key: p.key, duct: d.displayName, size: d.diameterMm ? `Ø${d.diameterMm}` : `${d.widthMm}×${d.heightMm}` });
 // a duct trunk holds the risers whose vertical part stands in it on its level, each with 50 mm round it
 const trunks = []; for (const r of m.rooms.filter(r => bounds.classes[r.id]?.space === '덕트 트렁크')) {
  const zr = z(r.deckId), inside = risers.filter(x => zr >= Math.min(z(x.fromDeckId), z(x.toDeckId)) && zr <= Math.max(z(x.fromDeckId), z(x.toDeckId)) && PL.inRoom(x.to, r));
  const need = inside.reduce((t, x) => t + (x.widthMm + 100) * (x.heightMm + 100) / 1e6, 0), have = PL.roomAreaMm2(r) / 1e6;
  if (need > have * LIMITS.trunkFill) trunks.push({ roomId: r.id, needM2: Math.round(need * 100) / 100, haveM2: Math.round(have * 100) / 100 });
 }
 const level = (fail, check) => fail ? 'fail' : check ? 'check' : 'ok', n = (arr, lv) => arr.filter(x => x.level === lv).length, codes = c => air.filter(x => x.code === c).length;
 const otherFail = air.filter(x => x.level === 'fail' && !['NEG_PRESSURE', 'TRANSFER_STAIR', 'ZONE_BALANCE'].includes(x.code)).length;
 const assumed = plans.filter(p => p.isUnitDeck && p.rootSource.startsWith('assumed')).length;
 const checks = [
  { id: 'loads', level: level(0, n(air.filter(x => x.code === 'LOAD_PENDING'), 'check')), text: `부하 계산 미완료 격실 ${codes('LOAD_PENDING')}개` },
  { id: 'zones', level: level(codes('ZONE_BALANCE'), 0), text: `공조 구역 풍량 수지(급기 ≥ 배기 + 가압 · 최소 신기): 부족 ${codes('ZONE_BALANCE')}개 구역` },
  { id: 'air', level: level(n(air, 'fail') - codes('ZONE_BALANCE'), air.filter(x => x.level === 'check' && x.code !== 'LOAD_PENDING').length),
   text: `실 풍량: 부압 미확보 ${codes('NEG_PRESSURE')}${codes('ROOM_OA') ? ` · 실 신기 부족 ${codes('ROOM_OA')}` : ''}${codes('TRANSFER_STAIR') ? ` · 계단실 전달 공기 ${codes('TRANSFER_STAIR')}` : ''}${otherFail ? ` · 기타 실패 ${otherFail}` : ''} · 확인 ${air.filter(x => x.level === 'check' && x.code !== 'LOAD_PENDING').length} (난방 급기 온도·전달 공기·문 통기구·기관구역)` },
  { id: 'units', level: level(rootsOutside.length, rootsBadRoom.length + assumed), text: `공조기 위치: 임시 ${assumed}개 계통 · 실 밖 지정 ${rootsOutside.length}개${rootsBadRoom.length ? ` · 둘 수 없는 실 ${rootsBadRoom.length}개(${rootsBadRoom.slice(0, 3).map(b => `${sysOf(b.key)} → ${b.room} · ${b.space}`).join(', ')}${rootsBadRoom.length > 3 ? ' …' : ''})` : ''}` },
  { id: 'auto', level: level(0, plans.length - done + relaxedN), text: `AUTO 완료 ${done}/${plans.length} (Deck·계통)${stale ? ` · 다시 보내기 필요 ${stale}` : ''}${staleNets.length ? ` (그 옛 덕트망 ${staleNets.length}개는 관통·방화댐퍼·제한 구역 통과·물량·평면에서 뺌)` : ''}${relaxedN ? ` · 금지 영역 완화 ${relaxedN}계획(${Object.entries(relaxed).filter(([, v]) => v).map(([k, v]) => `${RELAX_TEXT[k]} ${v}`).join(' · ')})` : ''}` },
  { id: 'connected', level: level(unconnected, 0), text: `연결 안 된 RU ${unconnected}개` },
  { id: 'flow', level: level(flowMismatch.length, 0), text: `RU 풍량 ≠ 설계 풍량 ${flowMismatch.length}개 계획` },
  { id: 'risers', level: level(0, risers.filter(r => r.exceeded).length + trunks.length + (dupElev ? 1 : 0)), text: `수직 덕트: 크기 한계 초과 ${risers.filter(r => r.exceeded).length} · 트렁크 단면 부족 ${trunks.length}${dupElev ? ' · Deck 고도 중복' : ''}` },
  { id: 'deckAlign', level: level(0, deckAlign.length), text: deckAlign.length ? `Deck 정렬: 위아래 Deck의 수직 공간(계단·트렁크·케이싱)이 겹치지 않음 ${deckAlign.length}곳 — ${deckAlign.slice(0, 3).map(d => `${d.lower}→${d.upper}(${d.kinds.join('·')}; 위 Deck을 X ${d.moveMm.x} · Y ${d.moveMm.y} mm 옮기면 겹침)`).join(', ')}${deckAlign.length > 3 ? ' …' : ''}. BOX의 Deck 위치(offset)를 확인하세요 — 갑판 방화 경계와 수직 덕트가 이 위치로 정해짐` : 'Deck 정렬: 위아래 Deck의 수직 공간(계단·트렁크·케이싱)이 겹침' },
  { id: 'ceiling', level: level(0, deep.length), text: `천장 속(${LIMITS.ceilingVoidMm} mm)보다 높은 덕트 ${deep.length}개` },
  { id: 'solasRooms', level: level(0, sum.unclassified.length + sum.roomChecks), text: `SOLAS 실 분류: 미분류 ${sum.unclassified.length} · 확인 ${sum.roomChecks}` },
  ...(staleN ? [{ id: 'solasStale', level: 'check', text: `SOLAS 사용자 지정이 지금 도면과 맞지 않음: 실 분류 ${stale0.rooms.length} · 벽·갑판 등급 ${stale0.bounds.length} — 실이 없어졌거나 벽이 옮겨짐. 방화 탭에서 다시 지정하세요 (지정은 파일에 남아 있음)` }] : []),
  { id: 'solasBounds', level: level(0, sum.boundaryChecks), text: `방화 경계 확인 사항 ${sum.boundaryChecks}개 (병기 값·같은 범주·모델 가장자리)` },
  { id: 'solasPen', level: level(0, sum.penetrationChecks), text: `관통 판정 보류·확인 ${sum.penetrationChecks}곳` },
  { id: 'outside', level: level(sum.outsideM > 0 ? 1 : 0, sum.unmodelledM > 0 ? 1 : 0), text: `Deck 밖(선체 밖)으로 지나는 덕트 ${sum.outsideM} m · 모델에 없는 Deck 안 공간 ${sum.unmodelledM} m` },
  { id: 'solasPass', level: level(sum.passagesFail, sum.passagesCheck), text: `제한 구역 통과(II-2/9.7.2): 금지 ${sum.passagesFail} · 확인 ${sum.passagesCheck}` },
  { id: 'solasSystems', level: level(warnings.length + sum.checklistFail, sum.checklistCheck), text: `계통 분리·점검표: 분리 경고 ${warnings.length} · 위반 ${sum.checklistFail} · 확인 ${sum.checklistCheck}` }];
 const count = { ok: n(checks, 'ok'), check: n(checks, 'check'), fail: n(checks, 'fail') };
 return { plans, results, nets: live, staleNets, systems, risers, zones: m.zones || [], solas, air, checks, count, done, stale, total: plans.length, rootsOutside, rootsBadRoom, deepDucts: deep, trunks, deckAlign };
}

module.exports = { review, deckAlignment, UNIT_BAD, LIMITS };
