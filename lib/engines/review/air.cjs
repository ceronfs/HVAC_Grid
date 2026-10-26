// Ver 2.0 review, the airflow checks (V2-3.9 review): per room and zone - loads not done, pressure of rooms that must
// stay below the accommodation, ISO 7547 exhaust, transfer air and door grilles, each room's own fresh air, zone balance,
// relief, exhaust groups - and the winter check of F-1. New code (D7); 1.0 lib/project.cjs airChecks is the functional
// reference. ISO 7547:2022 clause values as 1.0 had them: 원문 미확인 (F-2 - the original is not in this environment).
//   airChecks({ rooms, loads, rules, assign, airflow, zones, systems, solas }) → [{ roomId | systemId, level, code, text }]
//
// F-1: winter runs on the summer airflow. A room whose supply would have to be more than 22 K above the room to carry its
// heating (ISO 7547 6.3) is a check on supplementary heating or reheater capacity (HEATING_DT) - never more airflow.
'use strict';
const A = require('../airflow/airflow.cjs');

const LIMITS = Object.freeze({ heatingSupplyDeltaK: 22, coolingSupplyDeltaK: 15, corridorGrilleM2: 0.05, reliefPct: 10 });
// rooms heated by other means than their supply air (machinery control rooms, wheelhouse - ISO 7547 C.3.1, D.3.1) or
// outside its scope (machinery, not air-conditioned): no winter supply-temperature check
const SEPARATE_HEATING = new Set(['CONTROL', 'WHEELHOUSE', 'ENGINE', 'BOILER', 'NON_AC']);
// a sanitary room: the name ends with the word (a number may follow) - "선실(화장실 포함)" is a cabin
const SANITARY = /(화장실|욕실|샤워실?|변소|TOILET|\bW\.?\s?C\.?|BATH(\s*ROOM)?|SHOWER(\s*ROOM)?|LAVATORY)\s*[-#]?\s*\d*\s*$/i, PUBLIC = /공용|공중|PUBLIC|COMMON/i, PRIVATE = /개인|전용|PRIVATE|EN[\s-]?SUITE/i;
// ISO 7547 6.4.1 exhaust by room name (의무실 read as the hospital)
const EXHAUST = [
 { re: /병원|병실|의무실|HOSPITAL|배식|팬트리|PANTRY|흡연|SMOKING/i, supplyX: 1.2, rule: '급기 × 1.2', kind: '병원(의무실)·배식실·흡연실' },
 { re: /세탁|건조실|다림|LAUNDRY|DRYING|IRONING/i, ach: 15, rule: '15회/h' },
 { re: /탈의|세면|청소도구|청소구|CHANGING|WASH\s*ROOM|CLEANING/i, ach: 10, rule: '10회/h' }];
// rooms ISO 7547 6.5 keeps below the accommodation next to them
const BELOW = /조리실|주방|갤리|GALLEY|배식|팬트리|PANTRY|식품\s*준비|FOOD\s*PREP|병원|병실|의무실|HOSPITAL|흡연|SMOKING/i;
const KIND_LABEL = { supply: '급기(SA)', exhaust: '배기(EA)', return: '환기(RA)' };

function airChecks(m) {
 const out = [], air = m.airflow, byId = new Map(m.rooms.map(r => [r.id, r])), ship = m.solas?.ship || 'CARG', R = m.rules, none = {};
 const sys = r => m.assign[r.id] || none, step = R.roundCmh || 10, press = R.pressurizationPct ?? 5;
 // a sanitary room is private when it belongs to a room (named after it or wrapped by it), when its name says so, or
 // when it takes no transfer air and a supplied room of its deck holds it - else common
 const owned = r => m.rooms.some(n => n !== r && n.deckId === r.deckId && sys(n).supply && !A.isCorridor(n) && !SANITARY.test(n.name || '') && A.belongsTo(r, n));
 const isoExhaust = (r, a) => {
  const v = A.achVolume(r, R), name = r.name || '', passenger = ship === 'P36P' || ship === 'P36M';
  if (SANITARY.test(name)) return (a.transferEnsuite || PRIVATE.test(name) || (!a.transferInCmh && owned(r))) && !PUBLIC.test(name) ? { need: Math.max(72, 10 * v), rule: v ? 'max(72 CMH, 10회/h)' : '72 CMH', kind: '개인 위생실' }
   : passenger ? { need: Math.max(144, 15 * v), rule: 'max(144 CMH, 15회/h)', kind: '여객선 공용 위생실' } : v ? { need: 15 * v, rule: '15회/h', kind: '공용 위생실' } : null;
  const x = EXHAUST.find(e => e.re.test(name)); if (!x) return null;
  if (x.supplyX) return a.supplyCmh ? { need: a.supplyCmh * x.supplyX, rule: x.rule, kind: x.kind } : null;
  return v ? { need: x.ach * v, rule: x.rule } : null;
 };
 for (const r of m.rooms) {
  const a = air[r.id], l = m.loads[r.id], s = sys(r), lab = `${r.no} ${r.name}`;
  if (!l?.complete) { out.push({ roomId: r.id, level: 'check', code: 'LOAD_PENDING', text: `${lab}: 부하 계산 미완료 — 풍량 0` }); continue; }
  // lower pressure: a fail for the rooms 6.5 names and sanitary rooms, a check for other exhaust-only rooms; none for a
  // room that gives transfer air (its supply is meant to exceed its exhaust)
  if (s.exhaust && !s.return && a.supplyCmh > a.exhaustCmh && !(a.transferOutCmh > 0)) {
   const must = BELOW.test(r.name || '') || SANITARY.test(r.name || '');
   out.push({ roomId: r.id, level: must ? 'fail' : 'check', code: 'NEG_PRESSURE', text: `${lab}: 급기 ${a.supplyCmh} > 배기 ${a.exhaustCmh} CMH — 부압 미확보 (배기 증가 또는 급기 제한${must ? '' : '; ISO 7547 6.5 대상 실은 아님'})` });
  } else if (s.exhaust && a.supplyCmh > 0 && BELOW.test(r.name || '') && a.exhaustCmh < a.supplyCmh * (1 + press / 100) && !(a.transferOutCmh > 0))
   out.push({ roomId: r.id, level: 'check', code: 'NEG_MARGIN', text: `${lab}: 배기 ${a.exhaustCmh} ≈ 급기 ${a.supplyCmh} CMH — ISO 7547 6.5: 이웃 거주구보다 약간 낮은 압력이 되도록 배기를 급기보다 ${press} % 이상 많게` });
  // a room with a return grille gets no transfer air: where the rest comes from (6.2.2)
  if (s.return && a.exhaustCmh > a.supplyCmh) out.push({ roomId: r.id, level: 'check', code: 'EXHAUST_OVER_SUPPLY', text: `${lab}: 배기 ${a.exhaustCmh} > 급기 ${a.supplyCmh} CMH, 환기구가 있어 전달 공기를 배정하지 않음 — 부족한 ${a.exhaustCmh - a.supplyCmh} CMH의 출처(급기 증가·전달 공기) 확인` });
  if ((s.supply || s.exhaust || s.return) && !(a.supplyCmh || a.exhaustCmh || a.returnCmh)) out.push({ roomId: r.id, level: 'info', code: 'NO_AIR', text: `${lab}: 계통은 있으나 풍량 0` });
  // F-1: the supply temperature rise winter needs on the summer airflow = heating W × 3 / SA
  if (a.supplyCmh > 0 && l.heatingW > 0 && !SEPARATE_HEATING.has(r.isoClass)) { const dT = l.heatingW * 3 / a.supplyCmh; if (dT > LIMITS.heatingSupplyDeltaK + 0.5) out.push({ roomId: r.id, level: 'check', code: 'HEATING_DT', text: `${lab}: 여름 풍량 ${a.supplyCmh} CMH로 난방 ${Math.round(l.heatingW)} W를 하면 급기 온도차 ${Math.round(dT)} K (> ${LIMITS.heatingSupplyDeltaK} K, ISO 7547 6.3) — 풍량은 그대로, 보조 난방(컨벡터 등) 또는 재열기 용량 검토` }); }
  const ex = isoExhaust(r, a); if (ex && a.exhaustCmh + 0.5 < ex.need) out.push({ roomId: r.id, level: 'check', code: 'EXHAUST_ISO', text: `${lab}: 배기 ${a.exhaustCmh} CMH < ${ex.kind ? ex.kind + ' ' : ''}${ex.rule} ${Math.ceil(ex.need)} CMH (ISO 7547 6.4.1) — 환기 횟수 확인` });
  if (a.supplyCmh > 0 && /기관실|보일러|ENGINE(?!ER)|BOILER/i.test(r.name) && r.isoClass !== 'CONTROL') out.push({ roomId: r.id, level: 'check', code: 'MACHINERY_RULE', text: `${lab}: 기관구역 급기를 냉방 현열 규칙으로 계산 — 연소 공기·방열(ISO 8861)로 따로 확인` });
  if (a.transferInCmh > 0) {
   const src = byId.get(a.transferFrom);
   if (a.transferFrom === 'own-inlet') out.push({ roomId: r.id, level: 'info', code: 'OWN_INLET', text: `${lab}: 배기 ${a.transferInCmh} CMH를 자체 외기 흡입구로 (기밀 실)` });
   else if (!src) out.push({ roomId: r.id, level: 'check', code: 'TRANSFER_OUTSIDE', text: `${lab}: 배기 ${a.transferInCmh} CMH를 받을 급기 실이 이웃에 없음 — 외기 흡입구 또는 급기 필요` });
   else if (A.isCorridor(src) && (ship === 'CARG' || ship === 'TANK')) { const m2 = a.transferInCmh / 3600 / (R.transferVelocityMps || 2);
    if (m2 > LIMITS.corridorGrilleM2) out.push({ roomId: r.id, level: 'check', code: 'DOOR_GRILLE', text: `${lab}: 복도에서 전달 공기 ${a.transferInCmh} CMH → 문 통기구 ${Math.round(m2 * 1000) / 1000} m² (> 0.05 m², II-2/9.4.2) — 급기 추가 또는 덕트로 보충` }); }
  }
  if (a.transferOutCmh > 0 && a.transferOutCmh > Math.max(0, a.supplyCmh - a.exhaustCmh)) out.push({ roomId: r.id, level: 'check', code: 'TRANSFER_OVER', text: `${lab}: 이웃 실로 보내는 전달 공기 ${a.transferOutCmh} CMH > 남는 급기 ${Math.max(0, a.supplyCmh - a.exhaustCmh)} CMH` });
 }
 // each room's own fresh air in a recirculating zone: its supply × the zone's fresh-air share (ISO 7547 4.4, 6.2.1 c);
 // short by less than one supply step is rounding. The supply that would do it: the zone balanced again with only that
 // room's supply changed (transfer air as assigned), searched in roundCmh steps up to 20 × the need
 const zoneOa = (id, sid, supplyCmh) => { const z = A.zone(m.rooms, { ...air, [id]: { ...air[id], supplyCmh } }, sys, R, sid).zone; return z.saCmh ? supplyCmh * z.oaCmh / z.saCmh : 0; };
 const enough = (id, sid, need) => { let lo = air[id].supplyCmh, hi = Math.max(lo + step, Math.ceil(need * 20 / step) * step); if (zoneOa(id, sid, hi) < need) return null;
  while (hi - lo > step) { const mid = lo + Math.floor((hi - lo) / step / 2) * step; if (zoneOa(id, sid, mid) >= need) hi = mid; else lo = mid; } return hi; };
 for (const z of m.zones) if (z.recirculating && z.oaPct > 0) for (const id of z.roomIds) {
  const r = byId.get(id), a = air[id], need = m.loads[id]?.minFreshAirCmh || 0; if (!r || !a?.supplyCmh || !need) continue;
  const got = a.supplyCmh * z.oaPct / 100; if (need - got <= step * z.oaPct / 100 + 1e-9) continue;
  const s = enough(id, z.supplySystemId, need);
  out.push({ roomId: id, level: 'check', code: 'ROOM_OA', text: `${r.no} ${r.name}: 실 신기 ${Math.round(got)} CMH(급기 ${a.supplyCmh} × 구역 신기 ${z.oaPct} %) < 최소 신기 ${Math.round(need)} CMH — ${s ? `급기 ${s} CMH 이상 또는 ` : ''}${z.supplySystemId} 신기 비율 ${Math.ceil(need * 100 / a.supplyCmh)} % 이상` });
 }
 for (const z of m.zones) if (!z.ok) out.push({ systemId: z.supplySystemId, level: 'fail', code: 'ZONE_BALANCE', text: `${z.supplySystemId}: 급기 ${z.saCmh} CMH < 필요 신기 ${z.oaNeedCmh} CMH (배기 ${z.eaCmh}, 최소 신기 ${z.minOaCmh}) — 구역 부압` });
 const floor = R.minOaPct ?? 0;
 for (const z of m.zones) if (z.recirculating && z.ok && floor > 0 && z.oaPct < floor) out.push({ systemId: z.supplySystemId, level: 'check', code: 'OA_SHARE', text: `${z.supplySystemId}: 신기 비율 ${z.oaPct} % < ${floor} % — 선주 사양·CO₂ 농도 확인` });
 // over-pressure beyond reliefPct of the supply: a relief damper - not for a zone serving machinery (its air leaves by the casing)
 const machinery = z => z.roomIds.some(id => ['ENGINE', 'BOILER'].includes(byId.get(id)?.isoClass));
 for (const z of m.zones) if (z.ok && z.saCmh && (z.recirculating || !machinery(z)) && z.pressurizationCmh > z.saCmh * LIMITS.reliefPct / 100) out.push({ systemId: z.supplySystemId, level: 'check', code: 'RELIEF', text: `${z.supplySystemId}: 가압 ${z.pressurizationCmh} CMH = 급기의 ${Math.round(z.pressurizationCmh / z.saCmh * 100)} % > ${LIMITS.reliefPct} % — 릴리프 댐퍼 또는 배기 경로 필요(문 개폐·소음)` });
 if (R.supplyDeltaTK > LIMITS.coolingSupplyDeltaK) out.push({ level: 'check', code: 'SUPPLY_DT', text: `급기 ΔT ${R.supplyDeltaTK} K > ${LIMITS.coolingSupplyDeltaK} K — ISO 7547 6.3: 냉방 급기는 실온보다 15 K 넘게 낮을 수 없음` });
 // hospital, sanitary, laundry and pantry exhaust each on its own system (6.4.2); sanitary rooms in the hospital may share
 // its exhaust (6.4.2 NOTE)
 const GROUPS = [['병원', /병원|병실|의무실|HOSPITAL/i], ['위생실', SANITARY], ['세탁실', /세탁|LAUNDRY/i], ['배식실', /배식|팬트리|PANTRY/i]];
 for (const s of m.systems) if (s.kind === 'exhaust') {
  const rooms = s.roomIds.map(id => byId.get(id)).filter(Boolean), hospitals = rooms.filter(x => GROUPS[0][1].test(x.name || ''));
  const inHospital = x => hospitals.some(h => (x.name || '').startsWith(h.name || '\0') || air[x.id]?.transferFrom === h.id);
  const got = new Set(rooms.map(x => { const g = GROUPS.find(([, re]) => re.test(x.name || ''))?.[0]; return g === '위생실' && inHospital(x) ? null : g; }).filter(Boolean));
  if (got.size > 1) out.push({ systemId: s.id, level: 'check', code: 'EXHAUST_GROUPS', text: `${s.id}: ${[...got].join('·')} 배기가 한 계통 — ISO 7547 6.4.2: 병원·위생실·세탁실·배식실 배기는 각각 분리` });
 }
 // ISO 7547 Annex E dry provision stores, when the owner asks for it: supply ≥ 6 ACH, fresh air ≥ 0.035 m³/s
 for (const r of m.rooms) if (sys(r).supply && /(건식\s*)?식품\s*창고|식료품\s*창고|DRY\s*PROVISION/i.test(r.name || '') && !/냉장|냉동|REFRIG|COLD|FREEZ/i.test(r.name || '')) {
  const a = air[r.id], need6 = 6 * A.achVolume(r, R);
  if (a.supplyCmh + 0.5 < need6 || (m.loads[r.id]?.minFreshAirCmh || 0) < 126) out.push({ roomId: r.id, level: 'info', code: 'ANNEX_E', text: `${r.no} ${r.name}: 선주가 ISO 7547 부속서 E를 지정하면 급기 ≥ 6회/h(${Math.ceil(need6)} CMH), 신기 ≥ 126 CMH — 지금 급기 ${a.supplyCmh}, 최소 신기 ${Math.round(m.loads[r.id]?.minFreshAirCmh || 0)} CMH` });
 }
 for (const s of m.systems) if (!s.designCmh) out.push({ systemId: s.id, level: 'info', code: 'SYSTEM_EMPTY', text: `${s.id} (${KIND_LABEL[s.kind]}): 풍량 0 — PHG D 계획 없음` });
 return out;
}

module.exports = { airChecks, LIMITS, SEPARATE_HEATING, SANITARY };
