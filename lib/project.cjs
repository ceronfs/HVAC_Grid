// HVAC Grid project file (one file: the contract, the PHG D project of every deck and system, their results and duct
// geometry) and the review over it: zones, systems with vertical ducts, airflow checks, SOLAS boundaries, penetrations,
// restricted spaces passed and check lists. Pure - the shell, tools/hvac-run.cjs and the outputs (lib/report.cjs) use it.
'use strict';
const K = require('./contract.cjs'), PL = require('./phg-plan.cjs'), RS = require('./risers.cjs'), SO = require('./solas.cjs'), D = require('./ducts.cjs'), GE = require('./geom.cjs');

const SCHEMA = 'hvac-grid-project/1';
const LEGACY = ['hvac-grid-project/0'];
const LIMITS = Object.freeze({ heatingSupplyDeltaK: 18, corridorGrilleM2: 0.05, ceilingVoidMm: 400, trunkFill: 0.7, reliefPct: 10 });   // reliefPct: zone over-pressure above this % of its supply needs a relief damper or more exhaust

// what a PHG D result was made from: the Root, the RUs, the flow mode and the deck drawing. A result whose plan changed
// since (airflow rules, unit location, unit deck, rooms of the deck) is stale and has to be sent again.
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
const planSig = p => JSON.stringify([p.flowMode, p.root.x, p.root.y, p.rus.map(u => [u.x, u.y, u.flowCmh]), hash(p.dxf || ''), (p.avoid || []).map(z => z.roomId)]);
// results with `stale` brought up to date against the current plans; a result without a signature (an old file) is
// stale - nothing says what it was made from
function freshResults(contract, results, plans = PL.plan(contract)) {
 const out = {};
 for (const [k, r] of Object.entries(results || {})) { const p = plans.find(x => x.key === k); out[k] = { ...r, stale: !p || !r.sig || r.sig !== planSig(p) }; }
 return out;
}

function make({ contract, projects = {}, results = {}, geometry = {}, app = {} }) {
 return { schema: SCHEMA, savedAt: new Date().toISOString(), app: { name: 'HVAC Grid', ...app }, contract, projects, results, geometry };
}

// numbers stay numbers, the rest is dropped or made text: a project file is input from outside
// what AUTO dropped when no route inside every forbidden zone reached all RUs
const RELAX_TEXT = { outside: '실 밖 영역만 해제', rooms: '제한 구역 해제', all: '전부 해제' };
const numOrNull = v => v != null && v !== '' && Number.isFinite(+v) ? +v : null;
const str = (v, n = 200) => typeof v === 'string' ? v.slice(0, n) : null;
function cleanResult(r) {
 if (!r || typeof r !== 'object') return null;
 const out = {};
 for (const k of ['rus', 'flowCmh', 'designCmh', 'roots', 'ducts', 'lengthM', 'indexPa', 'seconds', 'unconnected', 'candidates', 'pick', 'at']) if (numOrNull(r[k]) != null) out[k] = numOrNull(r[k]);
 for (const k of ['auto', 'stale', 'edited']) if (typeof r[k] === 'boolean') out[k] = r[k];
 // which forbidden zones AUTO had to drop: 'outside' (kept the restricted rooms), 'rooms' (kept the outside of the deck)
 // or 'all' (true in older files)
 if (r.zonesRelaxed === true || r.zonesRelaxed === 'all') out.zonesRelaxed = 'all'; else if (r.zonesRelaxed === 'rooms' || r.zonesRelaxed === 'outside') out.zonesRelaxed = r.zonesRelaxed;
 for (const k of ['kind', 'rootSource', 'candidate', 'sig']) if (str(r[k], 4000) != null) out[k] = str(r[k], 4000);
 if (r.ductTypes && typeof r.ductTypes === 'object') out.ductTypes = Object.fromEntries(Object.entries(r.ductTypes).filter(([, v]) => numOrNull(v) != null).map(([k, v]) => [str(k, 40), numOrNull(v)]));
 return out;
}
const pt = p => p && numOrNull(p.x) != null && numOrNull(p.y) != null ? { x: numOrNull(p.x), y: numOrNull(p.y) } : null;
// a deck network of a real ship has some hundred ducts of a few points: a file beyond these limits is cut (and reported)
const GEOMETRY_LIMITS = { rus: 2000, ducts: 5000, points: 500 };
function cleanGeometry(g) {
 if (!g || typeof g !== 'object') return null;
 const L = GEOMETRY_LIMITS, cut = a => Array.isArray(a) ? a : [];
 return { root: pt(g.root), rus: cut(g.rus).slice(0, L.rus).map(u => ({ ...pt(u), flowCmh: numOrNull(u?.flowCmh) || 0 })).filter(u => u.x != null),
  ducts: cut(g.ducts).slice(0, L.ducts).map(d => ({ id: str(d?.id, 60) || '', displayName: str(d?.displayName, 60) || '', type: str(d?.type, 20) || '', shape: str(d?.shape, 20) || '',
   widthMm: numOrNull(d?.widthMm) || 0, heightMm: numOrNull(d?.heightMm) || 0, ...(d?.manualSize === true ? { manualSize: true } : {}), diameterMm: numOrNull(d?.diameterMm) || 0, flowCmh: numOrNull(d?.flowCmh) || 0, points: cut(d?.points).slice(0, L.points).map(pt).filter(Boolean) })).filter(d => d.points.length > 1),
  ...(cut(g.rus).length > L.rus || cut(g.ducts).length > L.ducts || cut(g.ducts).some(d => cut(d?.points).length > L.points) ? { truncated: true } : {}) };
}

// read a saved project (or a bare contract); returns { project, notes } or throws with the reason (in Korean)
function read(input) {
 let data = input;
 if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSON 객체가 아닙니다');
 const notes = [], check = c => { const problems = K.validate(c); if (problems.length) throw new Error('설계 데이터 검사 실패: ' + problems.slice(0, 5).join(', ')); };
 if (data.schema === K.SCHEMA) { check(data); const c = K.applyRules(data), same = JSON.stringify(c.airflow) === JSON.stringify(data.airflow);
  return { project: make({ contract: c }), notes: ['설계 데이터 파일 — PHG D 결과 없음', ...same ? [] : ['풍량·구역 수지를 지금 규칙으로 다시 계산함 (파일 값과 다름)']] }; }
 if (LEGACY.includes(data.schema)) notes.push(`${data.schema}: 같은 구조로 읽음 — 결과에 서명이 없어 모두 "다시 보내기 필요"`);
 else if (data.schema !== SCHEMA) throw new Error('HVAC Grid 프로젝트·설계 데이터 파일이 아닙니다 (schema ' + String(data.schema).slice(0, 40) + ')');
 check(data.contract);
 const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
 // airflow, zones and system totals derive from the rooms, loads and rules: computed again, not trusted from the file
 const derived = K.applyRules(data.contract), changed = JSON.stringify(derived.airflow) !== JSON.stringify(data.contract.airflow) || JSON.stringify(derived.zones || []) !== JSON.stringify(data.contract.zones || []);
 if (changed) notes.push('풍량·구역 수지를 지금 규칙으로 다시 계산함 (파일 값과 다름)');
 data = { ...data, contract: derived };
 const keys = new Set(PL.plan(data.contract).map(p => p.key)), projects = {}, results = {}, geometry = {};
 for (const [k, v] of Object.entries(obj(data.projects))) { if (!keys.has(k) || typeof v !== 'string') { notes.push(k.slice(0, 60) + ': 계획에 없는 계통 결과 제외'); continue; } projects[k] = v; }
 for (const [k, v] of Object.entries(obj(data.results))) { const r = cleanResult(v); if (keys.has(k) && r) results[k] = r; }
 for (const [k, v] of Object.entries(obj(data.geometry))) { const g = cleanGeometry(v); if (keys.has(k) && g) { if (g.truncated) notes.push(`${k}: 덕트 형상이 한도(RU 2,000 · 덕트 5,000 · 점 500)를 넘어 잘림`); delete g.truncated; geometry[k] = g; } }
 const project = { ...make({ contract: data.contract, projects, results, geometry, app: { name: 'HVAC Grid', version: str(obj(data.app).version, 40) || undefined } }), savedAt: str(data.savedAt, 40) };
 return { project, notes };
}

// airflow checks per room and zone
function airChecks(contract) {
 const out = [], air = contract.airflow, byId = new Map(contract.rooms.map(r => [r.id, r])), ship = contract.solas?.ship || 'CARG';
 for (const r of contract.rooms) {
  const a = air[r.id], l = contract.loads[r.id], lab = `${r.no} ${r.name}`;
  if (!l.complete) { out.push({ roomId: r.id, level: 'check', code: 'LOAD_PENDING', text: `${lab}: 부하 계산 미완료 — 풍량 0` }); continue; }
  if (r.systems.exhaust && !r.systems.return && a.supplyCmh > a.exhaustCmh) out.push({ roomId: r.id, level: 'fail', code: 'NEG_PRESSURE', text: `${lab}: 급기 ${a.supplyCmh} > 배기 ${a.exhaustCmh} CMH — 부압 미확보 (배기 증가 또는 급기 제한)` });
  if ((r.systems.supply || r.systems.exhaust || r.systems.return) && !(a.supplyCmh || a.exhaustCmh || a.returnCmh)) out.push({ roomId: r.id, level: 'info', code: 'NO_AIR', text: `${lab}: 계통은 있으나 풍량 0` });
  // heating with the cooling airflow: supply temperature rise = heating W x 3 / SA
  if (a.supplyCmh > 0 && l.heatingW > 0) { const dT = l.heatingW * 3 / a.supplyCmh; if (dT > LIMITS.heatingSupplyDeltaK) out.push({ roomId: r.id, level: 'check', code: 'HEATING_DT', text: `${lab}: 난방 시 급기 온도차 ${Math.round(dT)} K (> ${LIMITS.heatingSupplyDeltaK} K) — 난방 풍량·재열기 검토` }); }
  if (a.supplyCmh > 0 && /기관실|보일러|ENGINE|BOILER/i.test(r.name) && r.isoClass !== 'CONTROL') out.push({ roomId: r.id, level: 'check', code: 'MACHINERY_RULE', text: `${lab}: 기관구역 급기를 냉방 현열 규칙으로 계산 — 연소 공기·방열(ISO 8861)로 따로 확인` });
  if (a.transferInCmh > 0) {
   const src = byId.get(a.transferFrom);
   if (a.transferFrom === 'own-inlet') out.push({ roomId: r.id, level: 'info', code: 'OWN_INLET', text: `${lab}: 배기 ${a.transferInCmh} CMH를 자체 외기 흡입구로 (기밀 실)` });
   else if (!src) out.push({ roomId: r.id, level: 'check', code: 'TRANSFER_OUTSIDE', text: `${lab}: 배기 ${a.transferInCmh} CMH를 받을 급기 실이 이웃에 없음 — 외기 흡입구 또는 급기 필요` });
   else if (K.isCorridor(src) && (ship === 'CARG' || ship === 'TANK')) { const m2 = a.transferInCmh / 3600 / (contract.rules.transferVelocityMps || 2);
    if (m2 > LIMITS.corridorGrilleM2) out.push({ roomId: r.id, level: 'check', code: 'DOOR_GRILLE', text: `${lab}: 복도에서 전달 공기 ${a.transferInCmh} CMH → 문 통기구 ${Math.round(m2 * 1000) / 1000} m² (> 0.05 m², II-2/9.4.2) — 급기 추가 또는 덕트로 보충` }); }
  }
  if (a.transferOutCmh > 0 && a.transferOutCmh > Math.max(0, a.supplyCmh - a.exhaustCmh)) out.push({ roomId: r.id, level: 'check', code: 'TRANSFER_OVER', text: `${lab}: 이웃 실로 보내는 전달 공기 ${a.transferOutCmh} CMH > 남는 급기 ${Math.max(0, a.supplyCmh - a.exhaustCmh)} CMH` });
 }
 // each room's own fresh air: in a recirculating zone a room gets the zone's OA share of its supply - the zone total
 // meeting the sum of the minimums does not mean every room does (a mess with 12 people, a cabin with little load)
 for (const z of contract.zones || []) if (z.recirculating && z.oaPct > 0) for (const id of z.roomIds) {
  const r = byId.get(id), a = air[id], need = contract.loads[id]?.minFreshAirCmh || 0; if (!r || !a?.supplyCmh || !need) continue;
  const got = a.supplyCmh * z.oaPct / 100;
  if (got + 0.5 < need) out.push({ roomId: id, level: 'check', code: 'ROOM_OA', text: `${r.no} ${r.name}: 실 신기 ${Math.round(got)} CMH(급기 ${a.supplyCmh} × 구역 신기 ${z.oaPct} %) < 최소 신기 ${Math.round(need)} CMH — 급기 ${Math.ceil(need * 100 / z.oaPct / 10) * 10} CMH 이상 또는 ${z.supplySystemId} 신기 비율 ${Math.ceil(need * 100 / a.supplyCmh)} % 이상` });
 }
 for (const z of contract.zones || []) if (!z.ok) out.push({ systemId: z.supplySystemId, level: 'fail', code: 'ZONE_BALANCE', text: `${z.supplySystemId}: 급기 ${z.saCmh} CMH < 필요 신기 ${z.oaNeedCmh} CMH (배기 ${z.eaCmh}, 최소 신기 ${z.minOaCmh}) — 구역 부압` });
 for (const z of contract.zones || []) if (z.recirculating && z.ok && z.oaPct < (contract.rules.minOaPct ?? 25)) out.push({ systemId: z.supplySystemId, level: 'check', code: 'OA_SHARE', text: `${z.supplySystemId}: 신기 비율 ${z.oaPct} % < ${contract.rules.minOaPct ?? 25} % — 선주 사양·CO₂ 농도 확인` });
 for (const z of contract.zones || []) if (z.recirculating && z.ok && z.saCmh && z.pressurizationCmh > z.saCmh * LIMITS.reliefPct / 100) out.push({ systemId: z.supplySystemId, level: 'check', code: 'RELIEF', text: `${z.supplySystemId}: 가압 ${z.pressurizationCmh} CMH = 급기의 ${Math.round(z.pressurizationCmh / z.saCmh * 100)} % > ${LIMITS.reliefPct} % — 릴리프 댐퍼 또는 배기 경로 필요(문 개폐·소음)` });
 for (const s of contract.systems) if (!s.designCmh) out.push({ systemId: s.id, level: 'info', code: 'SYSTEM_EMPTY', text: `${s.id} (${PL.KIND_LABEL[s.kind]}): 풍량 0 — PHG D 계획 없음` });
 return out;
}

// duct networks for the SOLAS checks, from the stored geometry (app coordinates, y down)
function ductNets(plans, geometry) {
 const out = {};
 for (const p of plans) { const g = geometry[p.key]; if (g?.ducts?.length) out[p.key] = { deckId: p.deckId, systemId: p.systemId, kind: p.kind, ducts: g.ducts }; }
 return out;
}

// everything the review page, the XLSX and the report show
// plans: the plans of project.contract when the caller has them already (the shell keeps them between edits)
const UNIT_BAD = /^(계단격실|승강기 트렁크|비상탈출트렁크|외부계단|소화제 저장실|조리실|기관실 — A류|보일러실|페인트 로커|가연성 액체|실험실 — 가연성|화물|축전지)/;
function analyze(project, given = null) {
 const c = project.contract, plans = given || PL.plan(c), results = freshResults(c, project.results, plans), geometry = project.geometry || {};
 const sys0 = RS.systems(c, plans, results), risers0 = sys0.flatMap(s => s.risers);
 const bounds = SO.boundaries(c), pens = SO.penetrations(c, bounds, ductNets(plans, geometry), risers0);
 // fire dampers in a riser add their loss to it
 const damperPa = {}; for (const p of pens) if (p.riserId && p.damper) { const r = risers0.find(x => x.id === p.riserId); damperPa[p.riserId] = (damperPa[p.riserId] || 0) + D.RISER_RULES.fireDamperK * D.dynamicPa(r.velocityMps); }
 const systems = RS.systems(c, plans, results, D.RISER_RULES, damperPa).map(s => ({ ...s, fanPa: RS.fanPa(s) })), risers = systems.flatMap(s => s.risers);
 const pass = SO.passages(c, plans, geometry, bounds.classes), list = SO.checklist(c, bounds, pass), warnings = SO.systemWarnings(c, bounds);
 const solas = { settings: bounds.settings, classes: bounds.classes, boundaries: bounds.boundaries, penetrations: pens, passages: pass, checklist: list, warnings, summary: SO.summary(bounds, pens, pass, list) };
 const air = airChecks(c), sum = solas.summary, byId = new Map(c.rooms.map(r => [r.id, r]));
 // transfer air through a fire boundary: an A-class division needs a fire-dampered transfer duct (or an A-class door
 // without a grille); a stair door may have no ventilation opening (II-2/9.4.2)
 for (const r of c.rooms) { const a = c.airflow[r.id], src = byId.get(a.transferFrom); if (!src || !a.transferInCmh) continue;
  const b = bounds.boundaries.find(x => x.kind === 'bulkhead' && ((x.roomA === r.id && x.roomB === src.id) || (x.roomB === r.id && x.roomA === src.id)));
  if (bounds.classes[src.id]?.space === '계단격실') air.push({ roomId: r.id, level: 'fail', code: 'TRANSFER_STAIR', text: `${r.no} ${r.name}: 계단실에서 전달 공기 — 계단실 문에는 통기구 불가 (II-2/9.4.2)` });
  else if (b && SO.gradeClass(b.grade) === 'A') air.push({ roomId: r.id, level: 'check', code: 'TRANSFER_A', text: `${r.no} ${r.name}: ${src.no} ${src.name}에서 전달 공기 ${a.transferInCmh} CMH가 ${b.grade} 경계를 지남 — 방화댐퍼 붙은 전달 덕트 또는 출처 변경` }); }
 const done = plans.filter(p => results[p.key]?.auto && !results[p.key].stale).length, stale = plans.filter(p => results[p.key]?.stale).length;
 // AUTO runs that had to drop forbidden zones, by how much (a route to review, not a pass)
 const relaxed = { outside: 0, rooms: 0, all: 0 }; for (const p of plans) { const z = results[p.key]?.zonesRelaxed; if (results[p.key]?.auto && !results[p.key].stale && z) relaxed[z === true ? 'all' : z] = (relaxed[z === true ? 'all' : z] || 0) + 1; }
 const relaxedN = relaxed.outside + relaxed.rooms + relaxed.all;
 const unconnected = plans.reduce((t, p) => t + (results[p.key]?.unconnected || 0), 0);
 const flowMismatch = plans.filter(p => results[p.key]?.at && !results[p.key].stale && results[p.key].flowCmh !== p.designCmh).map(p => p.key);
 // user locations that are not inside a room of their deck
 const rootsOutside = Object.entries(c.roots || {}).filter(([k, p]) => { const deckId = k.split('__')[0]; return !c.rooms.some(r => r.deckId === deckId && GE.inRoom(p, r)); }).map(([k]) => k);
 // units and shafts set by the user in a space that cannot take them: an escape route (stair, lift, escape trunk), a
 // space of its own fire risk or gas (CO2, galley, machinery A, boiler, paint, flammable liquids, battery), cargo
 const rootsBadRoom = Object.entries(c.roots || {}).map(([k, p]) => { const deckId = k.split('__')[0], r = c.rooms.find(x => x.deckId === deckId && GE.inRoom(p, x)), space = r && bounds.classes[r.id]?.space;
  return r && UNIT_BAD.test(space || '') ? { key: k, roomId: r.id, room: `${r.no} ${r.name}`, space } : null; }).filter(Boolean);
 const elevations = c.decks.map(d => d.elevationMm), dupElev = elevations.length !== new Set(elevations).size;
 // ducts deeper than the ceiling void; trunks too small for the risers in them
 const deep = []; for (const p of plans) for (const d of geometry[p.key]?.ducts || []) if ((d.heightMm || d.diameterMm || 0) > LIMITS.ceilingVoidMm) deep.push({ key: p.key, duct: d.displayName, size: d.diameterMm ? `Ø${d.diameterMm}` : `${d.widthMm}×${d.heightMm}` });
 const trunks = []; for (const r of c.rooms.filter(r => bounds.classes[r.id]?.space === '덕트 트렁크')) {
  // the vertical part of a riser stands at its far shaft point on every deck from one end to the other
  const z = RS.elevationOf(c, r.deckId), inside = risers.filter(x => { const a = RS.elevationOf(c, x.fromDeckId), b = RS.elevationOf(c, x.toDeckId); return z >= Math.min(a, b) && z <= Math.max(a, b) && GE.inRoom(x.to, r); });
  // each riser with 50 mm insulation / clearance all round
  const need = inside.reduce((t, x) => t + (x.widthMm + 100) * (x.heightMm + 100) / 1e6, 0), have = GE.roomArea(r) / 1e6;
  if (need > have * LIMITS.trunkFill) trunks.push({ roomId: r.id, needM2: Math.round(need * 100) / 100, haveM2: Math.round(have * 100) / 100 }); }
 const level = (fail, check) => fail ? 'fail' : check ? 'check' : 'ok', n = (arr, lv) => arr.filter(x => x.level === lv).length;
 const checks = [
  { id: 'loads', level: level(0, n(air.filter(x => x.code === 'LOAD_PENDING'), 'check')), text: `부하 계산 미완료 격실 ${air.filter(x => x.code === 'LOAD_PENDING').length}개` },
  { id: 'zones', level: level(air.filter(x => x.code === 'ZONE_BALANCE').length, 0), text: `공조 구역 풍량 수지(급기 ≥ 배기 + 가압 · 최소 신기): 부족 ${air.filter(x => x.code === 'ZONE_BALANCE').length}개 구역` },
  { id: 'air', level: level(n(air, 'fail') - air.filter(x => x.code === 'ZONE_BALANCE').length, air.filter(x => x.level === 'check' && x.code !== 'LOAD_PENDING').length), text: `실 풍량: 부압 미확보 ${air.filter(x => x.code === 'NEG_PRESSURE').length}${air.some(x => x.code === 'ROOM_OA') ? ` · 실 신기 부족 ${air.filter(x => x.code === 'ROOM_OA').length}` : ''}${air.some(x => x.code === 'TRANSFER_STAIR') ? ` · 계단실 전달 공기 ${air.filter(x => x.code === 'TRANSFER_STAIR').length}` : ''}${air.some(x => x.level === 'fail' && !['NEG_PRESSURE', 'TRANSFER_STAIR', 'ZONE_BALANCE'].includes(x.code)) ? ` · 기타 실패 ${air.filter(x => x.level === 'fail' && !['NEG_PRESSURE', 'TRANSFER_STAIR', 'ZONE_BALANCE'].includes(x.code)).length}` : ''} · 확인 ${air.filter(x => x.level === 'check' && x.code !== 'LOAD_PENDING').length} (난방 급기 온도·전달 공기·문 통기구·기관구역)` },
  { id: 'units', level: level(rootsOutside.length, rootsBadRoom.length + plans.filter(p => p.isUnitDeck && p.rootSource.startsWith('assumed')).length), text: `공조기 위치: 임시 ${plans.filter(p => p.isUnitDeck && p.rootSource.startsWith('assumed')).length}개 계통 · 실 밖 지정 ${rootsOutside.length}개${rootsBadRoom.length ? ` · 둘 수 없는 실 ${rootsBadRoom.length}개(${rootsBadRoom.slice(0, 3).map(b => `${b.key.split('__')[1]} → ${b.room} · ${b.space}`).join(', ')}${rootsBadRoom.length > 3 ? ' …' : ''})` : ''}` },
  { id: 'auto', level: level(0, plans.length - done + relaxedN), text: `AUTO 완료 ${done}/${plans.length} (Deck·계통)${stale ? ` · 다시 보내기 필요 ${stale}` : ''}${relaxedN ? ` · 금지 영역 완화 ${relaxedN}계획(${Object.entries(relaxed).filter(([, v]) => v).map(([k, v]) => `${RELAX_TEXT[k]} ${v}`).join(' · ')})` : ''}` },
  { id: 'connected', level: level(unconnected, 0), text: `연결 안 된 RU ${unconnected}개` },
  { id: 'flow', level: level(flowMismatch.length, 0), text: `RU 풍량 ≠ 설계 풍량 ${flowMismatch.length}개 계획` },
  { id: 'risers', level: level(0, risers.filter(r => r.exceeded).length + trunks.length + (dupElev ? 1 : 0)), text: `수직 덕트: 크기 한계 초과 ${risers.filter(r => r.exceeded).length} · 트렁크 단면 부족 ${trunks.length}${dupElev ? ' · Deck 고도 중복' : ''}` },
  { id: 'ceiling', level: level(0, deep.length), text: `천장 속(${LIMITS.ceilingVoidMm} mm)보다 높은 덕트 ${deep.length}개` },
  { id: 'solasRooms', level: level(0, sum.unclassified.length + sum.roomChecks), text: `SOLAS 실 분류: 미분류 ${sum.unclassified.length} · 확인 ${sum.roomChecks}` },
  { id: 'solasBounds', level: level(0, sum.boundaryChecks), text: `방화 경계 확인 사항 ${sum.boundaryChecks}개 (병기 값·같은 범주·모델 가장자리)` },
  { id: 'solasPen', level: level(0, sum.penetrationChecks), text: `관통 판정 보류·확인 ${sum.penetrationChecks}곳` },
  { id: 'outside', level: level(sum.outsideM > 0 ? 1 : 0, sum.unmodelledM > 0 ? 1 : 0), text: `Deck 밖(선체 밖)으로 지나는 덕트 ${sum.outsideM} m · 모델에 없는 Deck 안 공간 ${sum.unmodelledM} m` },
  { id: 'solasPass', level: level(sum.passagesFail, sum.passagesCheck), text: `제한 구역 통과(II-2/9.7.2): 금지 ${sum.passagesFail} · 확인 ${sum.passagesCheck}` },
  { id: 'solasSystems', level: level(warnings.length + sum.checklistFail, sum.checklistCheck), text: `계통 분리·점검표: 분리 경고 ${warnings.length} · 위반 ${sum.checklistFail} · 확인 ${sum.checklistCheck}` }];
 const count = { ok: checks.filter(k => k.level === 'ok').length, check: checks.filter(k => k.level === 'check').length, fail: checks.filter(k => k.level === 'fail').length };
 return { plans, results, systems, risers, zones: c.zones || [], solas, air, checks, count, done, stale, total: plans.length, rootsOutside, rootsBadRoom, deepDucts: deep, trunks };
}

module.exports = { SCHEMA, LIMITS, UNIT_BAD, make, read, airChecks, analyze, ductNets, planSig, freshResults, cleanGeometry, cleanResult };
