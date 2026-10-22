// HVAC Grid project file (one file: the contract, the PHG D project of every deck and system, their results and duct
// geometry) and the review over it: zones, systems with vertical ducts, airflow checks, SOLAS boundaries, penetrations,
// restricted spaces passed and check lists. Pure - the shell, tools/hvac-run.cjs and the outputs (lib/report.cjs) use it.
'use strict';
const K = require('./contract.cjs'), PL = require('./phg-plan.cjs'), RS = require('./risers.cjs'), SO = require('./solas.cjs'), D = require('./ducts.cjs'), GE = require('./geom.cjs');

const SCHEMA = 'hvac-grid-project/1';
const LEGACY = ['hvac-grid-project/0'];
const LIMITS = Object.freeze({ heatingSupplyDeltaK: 22, coolingSupplyDeltaK: 15,corridorGrilleM2: 0.05, ceilingVoidMm: 400, trunkFill: 0.7, reliefPct: 10 });   // reliefPct: zone over-pressure above this % of its supply needs a relief damper or more exhaust

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

// box: BOX's own project JSON (text) when the project carries the drawing (① ②), with the room ids of that drawing -
// opened again in BOX with the project (review 2026-10-21 F05)
function make({ contract, projects = {}, results = {}, geometry = {}, app = {}, box = null }) {
 return { schema: SCHEMA, savedAt: new Date().toISOString(), app: { name: 'HVAC Grid', ...app }, contract, projects, results, geometry, ...(box ? { box } : {}) };
}
const BOX_LIMIT = 64e6;   // a BOX project with background images; beyond this the file is refused, not cut
function cleanBox(b) {
 if (!b || typeof b !== 'object' || typeof b.json !== 'string' || !b.json) return null;
 if (b.json.length > BOX_LIMIT) throw new Error(`BOX 도면이 ${Math.round(BOX_LIMIT / 1e6)} MB를 넘습니다`);
 return { format: 'BOX JSON', json: b.json, roomIds: Array.isArray(b.roomIds) ? b.roomIds.filter(x => typeof x === 'string').slice(0, 20000) : [] };
}

// numbers stay numbers, the rest is dropped or made text: a project file is input from outside
// what AUTO dropped when no route inside every forbidden zone reached all RUs
const RELAX_TEXT = { outside: '실 밖 영역만 해제', rooms: '제한 구역 해제', all: '전부 해제' };
const numOrNull = v => v != null && v !== '' && Number.isFinite(+v) ? +v : null;
const str = (v, n = 200) => typeof v === 'string' ? v.slice(0, n) : null;
const SIG_LIMIT = 2e6;   // planSig grows about 20 characters an RU - room for 100,000 RUs
function cleanResult(r) {
 if (!r || typeof r !== 'object') return null;
 const out = {};
 for (const k of ['rus', 'flowCmh', 'designCmh', 'roots', 'ducts', 'lengthM', 'indexPa', 'seconds', 'unconnected', 'candidates', 'pick', 'at']) if (numOrNull(r[k]) != null) out[k] = numOrNull(r[k]);
 for (const k of ['auto', 'stale', 'edited']) if (typeof r[k] === 'boolean') out[k] = r[k];
 // which forbidden zones AUTO had to drop: 'outside' (kept the restricted rooms), 'rooms' (kept the outside of the deck)
 // or 'all' (true in older files)
 if (r.zonesRelaxed === true || r.zonesRelaxed === 'all') out.zonesRelaxed = 'all'; else if (r.zonesRelaxed === 'rooms' || r.zonesRelaxed === 'outside') out.zonesRelaxed = r.zonesRelaxed;
 for (const k of ['kind', 'rootSource', 'candidate']) if (str(r[k], 4000) != null) out[k] = str(r[k], 4000);
 // the signature is compared whole: cut, a plan of some 200 RUs would never be up to date again (review 2026-10-21 F07)
 if (str(r.sig, SIG_LIMIT) != null) out.sig = str(r.sig, SIG_LIMIT);
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

// systems come from the rooms' assignments (contract systemsOf, F04): a file whose list disagrees is said so
const sysKey = list => JSON.stringify((list || []).map(x => [x.kind, x.id, x.roomIds, x.deckIds]));
const SYSTEMS_NOTE = '계통 목록을 격실의 계통 배정에 맞춰 다시 만듦 (파일의 계통 목록과 다름)';
// read a saved project (or a bare contract); returns { project, notes } or throws with the reason (in Korean)
function read(input) {
 let data = input;
 if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSON 객체가 아닙니다');
 // a winter airflow rule of an older file is not applied: the airflow is the summer one, winter the heating capacity
 const WINTER_NOTE = '겨울 풍량 규칙(rules.heatingSupplyDeltaTK)은 쓰지 않음 — 풍량은 여름 기준 하나, 겨울은 같은 풍량에 난방 용량';
 const notes = [], check = c => { const problems = K.validate(c); if (problems.length) throw new Error('설계 데이터 검사 실패: ' + problems.slice(0, 5).join(', ')); };
 // the file is checked, and so is what is worked out from it (review 2026-10-21 F03)
 if (data.schema === K.SCHEMA) { check(data); const c = K.applyRules(data); check(c); const same = JSON.stringify(c.airflow) === JSON.stringify(data.airflow);
  return { project: make({ contract: c }), notes: ['설계 데이터 파일 — PHG D 결과 없음', ...same ? [] : ['풍량·구역 수지를 지금 규칙으로 다시 계산함 (파일 값과 다름)'], ...data.rules?.heatingSupplyDeltaTK > 0 ? [WINTER_NOTE] : [], ...sysKey(c.systems) === sysKey(data.systems) ? [] : [SYSTEMS_NOTE]] }; }
 if (LEGACY.includes(data.schema)) notes.push(`${data.schema}: 같은 구조로 읽음 — 결과에 서명이 없어 모두 "다시 보내기 필요"`);
 else if (data.schema !== SCHEMA) throw new Error('HVAC Grid 프로젝트·설계 데이터 파일이 아닙니다 (schema ' + String(data.schema).slice(0, 40) + ')');
 check(data.contract);
 const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
 // airflow, zones and system totals derive from the rooms, loads and rules: computed again, not trusted from the file
 const derived = K.applyRules(data.contract), changed = JSON.stringify(derived.airflow) !== JSON.stringify(data.contract.airflow) || JSON.stringify(derived.zones || []) !== JSON.stringify(data.contract.zones || []);
 check(derived);
 if (changed) notes.push('풍량·구역 수지를 지금 규칙으로 다시 계산함 (파일 값과 다름)');
 if (data.contract.rules?.heatingSupplyDeltaTK > 0) notes.push(WINTER_NOTE);
 if (sysKey(derived.systems) !== sysKey(data.contract.systems)) notes.push(SYSTEMS_NOTE);
 data = { ...data, contract: derived };
 const keys = new Set(PL.plan(data.contract).map(p => p.key)), projects = {}, results = {}, geometry = {};
 for (const [k, v] of Object.entries(obj(data.projects))) { if (!keys.has(k) || typeof v !== 'string') { notes.push(k.slice(0, 60) + ': 계획에 없는 계통 결과 제외'); continue; } projects[k] = v; }
 for (const [k, v] of Object.entries(obj(data.results))) { const r = cleanResult(v); if (keys.has(k) && r) results[k] = r; }
 // a cut geometry is not the network the result was made from: the result loses its signature, so it stays
 // "다시 보내기 필요" also after the project is saved again (A01)
 for (const [k, v] of Object.entries(obj(data.geometry))) { const g = cleanGeometry(v); if (keys.has(k) && g) { if (g.truncated) { notes.push(`${k}: 덕트 형상이 한도(RU 2,000 · 덕트 5,000 · 점 500)를 넘어 잘림 — 다시 보내기 필요`); if (results[k]) delete results[k].sig; } delete g.truncated; geometry[k] = g; } }
 const box = cleanBox(data.box);
 if (box && box.roomIds.length) { const ids = new Set(data.contract.rooms.map(r => r.id)); if (box.roomIds.length !== ids.size || box.roomIds.some(id => !ids.has(id))) notes.push('함께 저장된 BOX 도면의 격실이 설계 데이터와 다름 — 저장 뒤 BOX에서 바꾼 것'); }
 const project = { ...make({ contract: data.contract, projects, results, geometry, box, app: { name: 'HVAC Grid', version: str(obj(data.app).version, 40) || undefined } }), savedAt: str(data.savedAt, 40) };
 return { project, notes };
}

// ISO 7547 6.4.1 exhaust for the rooms it names, by room name: { need CMH, rule } or null. A sanitary room is one whose
// name ends with the word (a number may follow) - "선실(화장실 포함)" is a cabin (logic review L-13)
const ISO_SAN = /(화장실|욕실|샤워실?|변소|TOILET|\bW\.?\s?C\.?|BATH(\s*ROOM)?|SHOWER(\s*ROOM)?|LAVATORY)\s*[-#]?\s*\d*\s*$/i, ISO_PUBLIC = /공용|공중|PUBLIC|COMMON/i;
const ISO_EXHAUST = [
 // 의무실 (first-aid room) is read as the ship's hospital - on a cargo ship it usually is (L-12)
 { re: /병원|병실|의무실|HOSPITAL|배식|팬트리|PANTRY|흡연|SMOKING/i, supplyX: 1.2, rule: '급기 × 1.2', kind: '병원(의무실)·배식실·흡연실' },
 { re: /세탁|건조실|다림|LAUNDRY|DRYING|IRONING/i, ach: 15, rule: '15회/h' },
 { re: /탈의|세면|청소도구|청소구|CHANGING|WASH\s*ROOM|CLEANING/i, ach: 10, rule: '10회/h' }];
// A sanitary room is private when it belongs to a room (en-suite: named after it or wrapped by it - contract ensuiteTo,
// the rule the transfer air uses; also when its own supply covers its exhaust and it takes no transfer air, review
// 2026-10-22 #9), or its name says so; every other one is common - 15 ACH
const ISO_PRIVATE = /개인|전용|PRIVATE|EN[\s-]?SUITE/i;
const ownedBy = (c, r) => c.rooms.some(n => n !== r && n.deckId === r.deckId && n.systems?.supply && !K.isCorridor(n) && !ISO_SAN.test(n.name || '') && K.ensuiteTo(r, n));
// rooms ISO 7547 6.5 keeps at a lower pressure than the accommodation next to them
const NEG_ROOMS = /조리실|주방|갤리|GALLEY|배식|팬트리|PANTRY|식품\s*준비|FOOD\s*PREP|병원|병실|의무실|HOSPITAL|흡연|SMOKING/i;
// on a passenger ship (SOLAS P36P / P36M) a public sanitary room takes max(15 ACH, 0.04 m³/s = 144 CMH) (6.4.1, L-08)
function isoExhaust(r, a, rules = {}, ship = 'CARG', c = null) {
 const v = K.achVolumeM3(r, rules), name = r.name || '', passenger = ship === 'P36P' || ship === 'P36M';
 if (ISO_SAN.test(name)) return (a.transferEnsuite || ISO_PRIVATE.test(name) || (c && !a.transferInCmh && ownedBy(c, r))) && !ISO_PUBLIC.test(name)
  ? { need: Math.max(72, 10 * v), rule: v ? 'max(72 CMH, 10회/h)' : '72 CMH', kind: '개인 위생실' }
  : passenger ? { need: Math.max(144, 15 * v), rule: 'max(144 CMH, 15회/h)', kind: '여객선 공용 위생실' } : (v ? { need: 15 * v, rule: '15회/h', kind: '공용 위생실' } : null);
 const x = ISO_EXHAUST.find(e => e.re.test(name)); if (!x) return null;
 if (x.supplyX) return a.supplyCmh ? { need: a.supplyCmh * x.supplyX, rule: x.rule, kind: x.kind } : null;
 return v ? { need: x.ach * v, rule: x.rule } : null;
}

// the smallest supply (in roundCmh steps) at which a room of a recirculating zone gets its own fresh air: its zone
// balanced again with only that room's supply changed (the zone's fresh-air share moves with it; the transfer air stays
// as assigned - the zone alone, not the whole ship's transfer search, review 2026-10-21 A04); null when even a supply
// of 20 x the need (a 5 % share) does not do it
function roomOaSupply(c, id, sid, need) {
 const step = c.rules.roundCmh || 10;
 const got = s => { const z = K.zoneBalance(c, c.rules, sid, { ...c.airflow, [id]: { ...c.airflow[id], supplyCmh: s } }).zone; return z.saCmh ? s * z.oaCmh / z.saCmh : 0; };
 let lo = c.airflow[id].supplyCmh, hi = Math.max(lo + step, Math.ceil(need * 20 / step) * step);
 if (got(hi) < need) return null;
 while (hi - lo > step) { const mid = lo + Math.floor((hi - lo) / step / 2) * step; if (got(mid) >= need) hi = mid; else lo = mid; }
 return hi;
}

// airflow checks per room and zone
function airChecks(contract) {
 const out = [], air = contract.airflow, byId = new Map(contract.rooms.map(r => [r.id, r])), ship = contract.solas?.ship || 'CARG';
 for (const r of contract.rooms) {
  const a = air[r.id], l = contract.loads[r.id], lab = `${r.no} ${r.name}`;
  if (!l.complete) { out.push({ roomId: r.id, level: 'check', code: 'LOAD_PENDING', text: `${lab}: 부하 계산 미완료 — 풍량 0` }); continue; }
  // lower pressure than the accommodation: a fail for the rooms ISO 7547 6.5 names (galleys, food preparation, hospitals,
  // smoking rooms) and sanitary rooms (practice; their exhaust is not recirculated, 6.4.2), a check for the other rooms
  // with exhaust only (laundry, drying, changing rooms); none for a room that gives transfer air - its supply is meant
  // to be over its exhaust (make-up air)
  if (r.systems.exhaust && !r.systems.return && a.supplyCmh > a.exhaustCmh && !(a.transferOutCmh > 0)) {
   const must = NEG_ROOMS.test(r.name || '') || ISO_SAN.test(r.name || '');
   out.push({ roomId: r.id, level: must ? 'fail' : 'check', code: 'NEG_PRESSURE', text: `${lab}: 급기 ${a.supplyCmh} > 배기 ${a.exhaustCmh} CMH — 부압 미확보 (배기 증가 또는 급기 제한${must ? '' : '; ISO 7547 6.5 대상 실은 아님'})` });
  }
  // 6.5 "slightly lower": a galley, food preparation, hospital or smoking room supplied as much as it exhausts is not below
  // its neighbours - at least the zone's pressurization share more exhaust (L-19; pantry and hospital have 6.4.1's x 1.2)
  else if (r.systems.exhaust && a.supplyCmh > 0 && NEG_ROOMS.test(r.name || '') && a.exhaustCmh < a.supplyCmh * (1 + (contract.rules.pressurizationPct ?? 5) / 100) && !(a.transferOutCmh > 0))
   out.push({ roomId: r.id, level: 'check', code: 'NEG_MARGIN', text: `${lab}: 배기 ${a.exhaustCmh} ≈ 급기 ${a.supplyCmh} CMH — ISO 7547 6.5: 이웃 거주구보다 약간 낮은 압력이 되도록 배기를 급기보다 ${contract.rules.pressurizationPct ?? 5} % 이상 많게` });
  // a room with a return grille is not given transfer air: exhausting more than it is supplied, the rest comes from
  // wherever (doors, the return) - say how much (6.2.2, L-09)
  if (r.systems.return && a.exhaustCmh > a.supplyCmh) out.push({ roomId: r.id, level: 'check', code: 'EXHAUST_OVER_SUPPLY', text: `${lab}: 배기 ${a.exhaustCmh} > 급기 ${a.supplyCmh} CMH, 환기구가 있어 전달 공기를 배정하지 않음 — 부족한 ${a.exhaustCmh - a.supplyCmh} CMH의 출처(급기 증가·전달 공기) 확인` });
  if ((r.systems.supply || r.systems.exhaust || r.systems.return) && !(a.supplyCmh || a.exhaustCmh || a.returnCmh)) out.push({ roomId: r.id, level: 'info', code: 'NO_AIR', text: `${lab}: 계통은 있으나 풍량 0` });
  // winter on the summer airflow: supply temperature rise = heating W x 3 / SA. Above 22 K (ISO 7547 6.3) the supply air
  // cannot carry the heating alone - supplementary heating (6.2.2 NOTE), never more airflow (AGENTS.md); not for the rooms
  // without air heating (contract SEPARATE_HEATING)
  if (a.supplyCmh > 0 && l.heatingW > 0 && !K.SEPARATE_HEATING.has(r.isoClass)) { const dT = l.heatingW * 3 / a.supplyCmh; if (dT > LIMITS.heatingSupplyDeltaK + 0.5) out.push({ roomId: r.id, level: 'check', code: 'HEATING_DT', text: `${lab}: 여름 풍량 ${a.supplyCmh} CMH로 난방 ${Math.round(l.heatingW)} W를 하면 급기 온도차 ${Math.round(dT)} K (> ${LIMITS.heatingSupplyDeltaK} K, ISO 7547 6.3) — 풍량은 그대로, 보조 난방(컨벡터 등) 또는 재열기 용량 검토` }); }
  // exhaust air per ISO 7547 6.4.1 for the rooms it names (BOX's ACH is the input; this checks what it gives)
  const ex = isoExhaust(r, a, contract.rules, ship, contract); if (ex && a.exhaustCmh + 0.5 < ex.need) out.push({ roomId: r.id, level: 'check', code: 'EXHAUST_ISO', text: `${lab}: 배기 ${a.exhaustCmh} CMH < ${ex.kind ? ex.kind + ' ' : ''}${ex.rule} ${Math.ceil(ex.need)} CMH (ISO 7547 6.4.1) — 환기 횟수 확인` });
  if (a.supplyCmh > 0 && /기관실|보일러|ENGINE(?!ER)|BOILER/i.test(r.name) && r.isoClass !== 'CONTROL') out.push({ roomId: r.id, level: 'check', code: 'MACHINERY_RULE', text: `${lab}: 기관구역 급기를 냉방 현열 규칙으로 계산 — 연소 공기·방열(ISO 8861)로 따로 확인` });
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
 // (ISO 7547 4.4, 6.2.1 c). Short by less than one supply step (roundCmh x the share) is the rounding, not a shortage.
 // The remedies: the room's supply - found by balancing the zone again, as its share falls when the supply rises - or
 // the zone's share (rules.minOaPct, a floor on every recirculating zone)
 for (const z of contract.zones || []) if (z.recirculating && z.oaPct > 0) for (const id of z.roomIds) {
  const r = byId.get(id), a = air[id], need = contract.loads[id]?.minFreshAirCmh || 0; if (!r || !a?.supplyCmh || !need) continue;
  const got = a.supplyCmh * z.oaPct / 100, step = contract.rules.roundCmh || 10;
  if (need - got <= step * z.oaPct / 100 + 1e-9) continue;
  const s = roomOaSupply(contract, id, z.supplySystemId, need);
  out.push({ roomId: id, level: 'check', code: 'ROOM_OA', text: `${r.no} ${r.name}: 실 신기 ${Math.round(got)} CMH(급기 ${a.supplyCmh} × 구역 신기 ${z.oaPct} %) < 최소 신기 ${Math.round(need)} CMH — ${s ? `급기 ${s} CMH 이상 또는 ` : ''}${z.supplySystemId} 신기 비율 ${Math.ceil(need * 100 / a.supplyCmh)} % 이상` });
 }
 for (const z of contract.zones || []) if (!z.ok) out.push({ systemId: z.supplySystemId, level: 'fail', code: 'ZONE_BALANCE', text: `${z.supplySystemId}: 급기 ${z.saCmh} CMH < 필요 신기 ${z.oaNeedCmh} CMH (배기 ${z.eaCmh}, 최소 신기 ${z.minOaCmh}) — 구역 부압` });
 // the owner's fresh-air floor as the balance uses it: rules.minOaPct, null or 0 = none (L-07)
 const oaFloor = contract.rules.minOaPct ?? 0;
 for (const z of contract.zones || []) if (z.recirculating && z.ok && oaFloor > 0 && z.oaPct < oaFloor) out.push({ systemId: z.supplySystemId, level: 'check', code: 'OA_SHARE', text: `${z.supplySystemId}: 신기 비율 ${z.oaPct} % < ${oaFloor} % — 선주 사양·CO₂ 농도 확인` });
 // over-pressure: recirculating zones, and all-fresh-air zones too (L-11) - except those serving a machinery space, whose
 // air is meant to leave through the casing
 const machinery = z => z.roomIds.some(id => ['ENGINE', 'BOILER'].includes(byId.get(id)?.isoClass));
 for (const z of contract.zones || []) if (z.ok && z.saCmh && (z.recirculating || !machinery(z)) && z.pressurizationCmh > z.saCmh * LIMITS.reliefPct / 100) out.push({ systemId: z.supplySystemId, level: 'check', code: 'RELIEF', text: `${z.supplySystemId}: 가압 ${z.pressurizationCmh} CMH = 급기의 ${Math.round(z.pressurizationCmh / z.saCmh * 100)} % > ${LIMITS.reliefPct} % — 릴리프 댐퍼 또는 배기 경로 필요(문 개폐·소음)` });
 // cooling supply at most 15 K below the room (ISO 7547 6.3)
 if (contract.rules.supplyDeltaTK > LIMITS.coolingSupplyDeltaK) out.push({ level: 'check', code: 'SUPPLY_DT', text: `급기 ΔT ${contract.rules.supplyDeltaTK} K > ${LIMITS.coolingSupplyDeltaK} K — ISO 7547 6.3: 냉방 급기는 실온보다 15 K 넘게 낮을 수 없음` });
 // exhaust of hospitals, sanitary rooms, laundries and pantries: each group its own system (ISO 7547 6.4.2)
 const GROUPS = [['병원', /병원|병실|의무실|HOSPITAL/i], ['위생실', ISO_SAN], ['세탁실', /세탁|LAUNDRY/i], ['배식실', /배식|팬트리|PANTRY/i]];
 for (const s of contract.systems) if (s.kind === 'exhaust') {
  // sanitary rooms located in the hospital may share its exhaust (6.4.2 NOTE): named after a hospital room of the system
  // or taking their air from it - other sanitary rooms on a hospital system still count (L-06)
  const rooms = s.roomIds.map(id => byId.get(id)).filter(Boolean), hospitals = rooms.filter(x => GROUPS[0][1].test(x.name || ''));
  const inHospital = x => hospitals.some(h => (x.name || '').startsWith(h.name || String.fromCharCode(0)) || air[x.id]?.transferFrom === h.id);
  const got = new Set(rooms.map(x => { const g = GROUPS.find(([, re]) => re.test(x.name || ''))?.[0]; return g === '위생실' && inHospital(x) ? null : g; }).filter(Boolean));
  if (got.size > 1) out.push({ systemId: s.id, level: 'check', code: 'EXHAUST_GROUPS', text: `${s.id}: ${[...got].join('·')} 배기가 한 계통 — ISO 7547 6.4.2: 병원·위생실·세탁실·배식실 배기는 각각 분리` });
 }
 // ISO 7547 Annex E, dry provision stores - when the owner specifies it: supply at least 6 ACH, fresh air 0.035 m³/s (L-17)
 for (const r of contract.rooms) if (r.systems.supply && /(건식\s*)?식품\s*창고|식료품\s*창고|DRY\s*PROVISION/i.test(r.name || '') && !/냉장|냉동|REFRIG|COLD|FREEZ/i.test(r.name || '')) {
  const a = air[r.id], need6 = 6 * K.achVolumeM3(r, contract.rules);
  if (a.supplyCmh + 0.5 < need6 || (contract.loads[r.id]?.minFreshAirCmh || 0) < 126) out.push({ roomId: r.id, level: 'info', code: 'ANNEX_E', text: `${r.no} ${r.name}: 선주가 ISO 7547 부속서 E를 지정하면 급기 ≥ 6회/h(${Math.ceil(need6)} CMH), 신기 ≥ 126 CMH — 지금 급기 ${a.supplyCmh}, 최소 신기 ${Math.round(contract.loads[r.id]?.minFreshAirCmh || 0)} CMH` });
 }
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
// decks over each other (review 2026-10-21 G-1): the plan coordinates come from BOX, and a deck placed off its true spot
// changes the deck boundaries (SOLAS) and the risers without a word. The spaces that run through the decks - stairs,
// lifts, escape and duct trunks (by their SOLAS space), casings (by name) - stand over each other: a pair of adjacent
// decks that share such a kind but have none of it overlapping is reported, with the move that would put the most of
// them back over each other.
const SHAFT_SPACES = new Set(['계단격실', '승강기 트렁크', '비상탈출트렁크', '덕트 트렁크']), CASING = /케이싱|CASING/i;
function deckAlignment(c, classes) {
 const kind = r => SHAFT_SPACES.has(classes[r.id]?.space) ? classes[r.id].space : CASING.test(r.name || '') ? '케이싱' : null;
 const decks = [...c.decks].sort((a, b) => a.elevationMm - b.elevationMm), out = [];
 for (let k = 0; k + 1 < decks.length; k++) {
  if (decks[k].elevationMm === decks[k + 1].elevationMm) continue;   // reported as a duplicate elevation
  const lo = c.rooms.filter(r => r.deckId === decks[k].id && kind(r)), hi = c.rooms.filter(r => r.deckId === decks[k + 1].id && kind(r));
  const kinds = [...new Set(lo.map(kind))].filter(t => hi.some(r => kind(r) === t)); if (!kinds.length) continue;
  const over = (p, q) => GE.overlapM2(p, q) >= Math.min(0.5, 0.5 * Math.min(GE.roomArea(p), GE.roomArea(q)) / 1e6);
  if (kinds.some(t => lo.some(p => kind(p) === t && hi.some(q => kind(q) === t && over(p, q))))) continue;
  const votes = new Map();
  for (const p of lo) for (const q of hi) if (kind(p) === kind(q)) { const a = GE.centroid(p.polygon), b = GE.centroid(q.polygon), key = `${Math.round((a.x - b.x) / 50) * 50},${Math.round((a.y - b.y) / 50) * 50}`; votes.set(key, (votes.get(key) || 0) + 1); }
  const [x, y] = [...votes].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  out.push({ lowerDeckId: decks[k].id, upperDeckId: decks[k + 1].id, lower: decks[k].name, upper: decks[k + 1].name, kinds, moveMm: { x, y } });
 }
 return out;
}

// the duct networks the review counts: those of results that are up to date. A stale result's network was made for a
// plan that has changed since (unit location, airflow, rooms) - its penetrations, fire dampers, restricted spaces and
// quantities are not this design's, so they stay out until it is sent again (review 2026-10-22 #1)
function liveGeometry(geometry, results) {
 return Object.fromEntries(Object.entries(geometry || {}).filter(([k]) => results[k] && !results[k].stale));
}

function analyze(project, given = null) {
 const c = project.contract, plans = given || PL.plan(c), results = freshResults(c, project.results, plans), geometry = liveGeometry(project.geometry, results);
 const staleNets = plans.filter(p => results[p.key]?.stale && project.geometry?.[p.key]?.ducts?.length).map(p => p.key);
 const sys0 = RS.systems(c, plans, results), risers0 = sys0.flatMap(s => s.risers);
 const bounds = SO.boundaries(c), pens = SO.penetrations(c, bounds, ductNets(plans, geometry), risers0);
 // fire dampers in a riser add their loss to it
 const damperPa = {}; for (const p of pens) if (p.riserId && p.damper) { const r = risers0.find(x => x.id === p.riserId); damperPa[p.riserId] = (damperPa[p.riserId] || 0) + D.RISER_RULES.fireDamperK * D.dynamicPa(r.velocityMps); }
 // and those in the horizontal ducts of a deck network to that deck - all of them, as PHG D does not say which ducts its
 // index path takes: a conservative allowance, shown on its own (A05)
 const deckDamperPa = {}; for (const p of pens) if (!p.riserId && p.damper && p.planKey && p.areaM2 > 0 && p.flowCmh > 0) deckDamperPa[p.planKey] = (deckDamperPa[p.planKey] || 0) + D.RISER_RULES.fireDamperK * D.dynamicPa(p.flowCmh / 3600 / p.areaM2);
 const systems = RS.systems(c, plans, results, D.RISER_RULES, damperPa, deckDamperPa).map(s => ({ ...s, fanPa: RS.fanPa(s) })), risers = systems.flatMap(s => s.risers);
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
 // (the deck of a key from its plan, or the longest deck id it starts with - a deck id may hold '__' itself, #2)
 const deckOf = k => plans.find(p => p.key === k)?.deckId ?? c.decks.map(d => d.id).filter(id => k.startsWith(id + '__')).sort((x, y) => y.length - x.length)[0] ?? k.split('__')[0];
 const sysOf = k => plans.find(p => p.key === k)?.systemKey ?? k.slice(deckOf(k).length + 2);
 const rootsOutside = Object.entries(c.roots || {}).filter(([k, p]) => { const deckId = deckOf(k); return !c.rooms.some(r => r.deckId === deckId && GE.inRoom(p, r)); }).map(([k]) => k);
 // units and shafts set by the user in a space that cannot take them: an escape route (stair, lift, escape trunk), a
 // space of its own fire risk or gas (CO2, galley, machinery A, boiler, paint, flammable liquids, battery), cargo
 const rootsBadRoom = Object.entries(c.roots || {}).map(([k, p]) => { const deckId = deckOf(k), r = c.rooms.find(x => x.deckId === deckId && GE.inRoom(p, x)), space = r && bounds.classes[r.id]?.space;
  return r && UNIT_BAD.test(space || '') ? { key: k, roomId: r.id, room: `${r.no} ${r.name}`, space } : null; }).filter(Boolean);
 const elevations = c.decks.map(d => d.elevationMm), dupElev = elevations.length !== new Set(elevations).size, deckAlign = deckAlignment(c, bounds.classes);
 const stale0 = SO.staleSettings(c, bounds), staleN = stale0.rooms.length + stale0.bounds.length;
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
  { id: 'units', level: level(rootsOutside.length, rootsBadRoom.length + plans.filter(p => p.isUnitDeck && p.rootSource.startsWith('assumed')).length), text: `공조기 위치: 임시 ${plans.filter(p => p.isUnitDeck && p.rootSource.startsWith('assumed')).length}개 계통 · 실 밖 지정 ${rootsOutside.length}개${rootsBadRoom.length ? ` · 둘 수 없는 실 ${rootsBadRoom.length}개(${rootsBadRoom.slice(0, 3).map(b => `${sysOf(b.key)} → ${b.room} · ${b.space}`).join(', ')}${rootsBadRoom.length > 3 ? ' …' : ''})` : ''}` },
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
 const count = { ok: checks.filter(k => k.level === 'ok').length, check: checks.filter(k => k.level === 'check').length, fail: checks.filter(k => k.level === 'fail').length };
 // geometry: the networks counted (outputs draw these); staleNets: the plans whose network was left out
 return { plans, results, geometry, staleNets, systems, risers, zones: c.zones || [], solas, air, checks, count, done, stale, total: plans.length, rootsOutside, rootsBadRoom, deepDucts: deep, trunks, deckAlign };
}

module.exports = { SCHEMA, LIMITS, UNIT_BAD, make, read, cleanBox, airChecks, analyze, deckAlignment, ductNets, liveGeometry, planSig, freshResults, cleanGeometry, cleanResult };
