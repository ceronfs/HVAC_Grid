// HVAC Grid data contract (docs/CONTRACT.md): build it from what BOX CAL reports, derive room airflow, validate.
// Pure functions, no browser: tools/box-extract.cjs collects the raw BOX data, this module shapes and checks it.
'use strict';
const GE = require('./geom.cjs'), SO = require('./solas.cjs');

const SCHEMA = 'hvac-grid/0';
const KINDS = ['supply', 'exhaust', 'return'];
const FLOW_FIELD = Object.freeze({ supply: 'supplyCmh', exhaust: 'exhaustCmh', return: 'returnCmh' });
const DEFAULT_RULES = Object.freeze({
 supplyDeltaTK: 10,        // supply air = cooling sensible W x 3 / dT (prior integration rule, ~ 1/(rho cp) = 2.99), at least the room's fresh air
 roundCmh: 10,             // airflow rounded up to this step
 exhaustFrom: 'ach',       // exhaust air = room ACH x volume (BOX ventilationAirCmh) for rooms with an exhaust system
 airBalance: 'zone',       // 'zone': return air from the balance of each air handling zone (below); 'room': return = supply - exhaust per room (v0)
 pressurizationPct: 5,     // zone fresh air >= zone exhaust + this % - the accommodation stays slightly over-pressured
 pressurizationBasis: 'exhaust',   // the % above is of the zone exhaust ('exhaust') or of the zone supply ('supply', owner's spec)
 transferVelocityMps: 2,   // transfer air through a door grille / undercut, for the grille area check
 transferMakeup: true,     // a room that gives transfer air is supplied for it (supply >= own exhaust + transfer given)
 defaultCeilingMm: null,   // ceiling height for the ACH volume of rooms BOX gives none (null: BOX volume = floor x deck height)
 minOaPct: 25,             // fresh air share of a recirculating zone at least this (owner's specification; a floor of the fresh air)
});

const point = p => Array.isArray(p) ? { x: +p[0], y: +p[1] } : { x: +p.x, y: +p.y };
const ceilTo = (v, step) => step > 0 ? Math.ceil(v / step - 1e-9) * step : v;
const name = v => (typeof v === 'string' && v.trim()) ? v.trim() : null;
const CORRIDOR = /복도|통로|\bALLEY|CORRIDOR|PASSAGE/i;
const SEALED = /CO2|CO₂|소화제|배터리|축전지|BATTERY|페인트|PAINT/i;
// rooms that cannot give transfer air: stairs (no door grilles, II-2/9.4.2), the open deck, cold and other stores,
// trunks, gas-tight rooms
// trunks, gas-tight rooms, fan rooms, and the restricted spaces (galley, machinery) whose air must not spread
// the same by SOLAS space (the user's choice in ③ or the classification), for rooms whose name does not tell
const NO_SOURCE_SPACES = new Set(['기관실 — A류', '보일러실', '조리실', '팬트리 — 조리기구 있음 (조리실 부속)', '소화제 저장실 (CO₂실)', '계단격실', '축전지실', '페인트 로커',
 '가연성 액체 창고', '램프실', '승강기 트렁크', '비상탈출트렁크', '외부계단 (피난용)', '개방갑판', '냉장실', '식료품 냉장고', '덕트 트렁크', '환기·공조 기계실', '로커·창고 — 4㎡ 초과',
 '로커·소창고 — 4㎡ 미만', '청소구 로커', '잡물창고', '쓰레기실', '냉동기계실', '펌프실 (기관구역)', '화물창', '화물펌프실', '보이드·코퍼댐']);
const NO_SOURCE = /계단|STAIR|선교\s*윙|BRIDGE\s*WING|개방|OPEN\s*DECK|냉장|냉동|REFRIG|FREEZ|창고|STORE|로커|LOCKER|보관실|트렁크|TRUNK|샤프트|SHAFT|팬룸|팬실|FAN\s*ROOM|기계실|조리실|주방|갤리|GALLEY|기관실|케이싱|보일러|ENGINE|CASING|BOILER/i;
const isCorridor = r => r.isoClass === 'ALLEY_SOUND' || r.isoClass === 'ALLEY_NON_SOUND' || CORRIDOR.test(r.name || '');

// raw = { source:{file,sha256,app}, decks:[BOX deck], rooms:[BOX room load record], conditions }
function buildContract(raw, rules = {}) {
 const r = { ...DEFAULT_RULES, ...rules };
 const decks = raw.decks.map(d => ({ id: d.id, name: d.name || d.id, elevationMm: +d.z || 0, heightMm: +d.height || null,
  offsetMm: { x: +d.offsetX || 0, y: +d.offsetY || 0 }, rotationDeg: +d.rotation || 0, scale: +d.scale || 1 }));
 const rooms = [], loads = {}, systems = new Map();
 const system = (id, kind, room) => { if (!id) return; const key = kind + ':' + id;
  if (!systems.has(key)) systems.set(key, { id, kind, deckIds: new Set(), roomIds: [] });
  const s = systems.get(key); s.deckIds.add(room.deckId); s.roomIds.push(room.id); };
 for (const x of raw.rooms) {
  const room = { id: String(x.id), no: x.no != null ? String(x.no) : null, name: x.name || '', deckId: x.deckId || x.deck,
   isoClass: x.isoClass || null, polygon: (x.polygon || []).map(point), holes: (x.holes || []).map(h => h.map(point)),
   areaM2: +x.floor || 0, volumeM3: +x.volume || 0, ceilingHeightMm: +x.ceilingHeight || null,
   systems: { supply: name(x.sup), exhaust: name(x.exh), return: name(x.ret) } };
  rooms.push(room);
  loads[room.id] = { coolingSensibleW: +x.coolingSensibleW || 0, coolingLatentW: +x.coolingLatentW || 0, coolingW: +x.coolingW || 0,
   heatingW: +x.heatingW || 0, minFreshAirCmh: +x.minimumFreshAirCmh || 0, minAch: +x.minimumAch || 0,
   achAirCmh: +x.ventilationAirCmh || 0, complete: !!x.calculationComplete, status: x.calculationStatus || null };
  system(room.systems.supply, 'supply', room); system(room.systems.exhaust, 'exhaust', room); system(room.systems.return, 'return', room);
 }
 // deck ids in elevation order (BOX ids are not)
 const elev = id => decks.find(d => d.id === id)?.elevationMm ?? 0;
 const systemList = [...systems.values()].map(s => ({ ...s, deckIds: [...s.deckIds].sort((a, b) => elev(a) - elev(b) || String(a).localeCompare(String(b))) }))
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
 const base = { schema: SCHEMA, units: 'mm', coordinates: 'ship', source: raw.source, rules: r, conditions: raw.conditions || null, decks, rooms, loads, systems: systemList, rus: [], ducts: {} };
 return withAirflow(base, r);
}

// v0 room rules (docs/CONTRACT.md 4): supply from the cooling sensible load (at least the room's fresh air), exhaust
// from ACH; return = supply - exhaust per room, replaced by the zone balance when rules.airBalance is 'zone'
function roomAirflow(room, load, r) {
 if (!load.complete) return { supplyCmh: 0, exhaustCmh: 0, returnCmh: 0, freshAirCmh: 0, source: 'pending' };
 const supplyCmh = room.systems.supply ? ceilTo(Math.max(load.coolingSensibleW * 3 / r.supplyDeltaTK, load.minFreshAirCmh), r.roundCmh) : 0;
 // ACH air: BOX's (floor x its ceiling height, or the deck height); with rules.defaultCeilingMm for rooms without one
 const ach = !room.ceilingHeightMm && r.defaultCeilingMm && load.minAch ? load.minAch * room.areaM2 * r.defaultCeilingMm / 1000 : load.achAirCmh;
 const exhaustCmh = room.systems.exhaust ? ceilTo(ach, r.roundCmh) : 0;
 const returnCmh = room.systems.return ? Math.max(0, supplyCmh - exhaustCmh) : 0;
 return { supplyCmh, exhaustCmh, returnCmh, freshAirCmh: load.minFreshAirCmh, source: 'load' };
}

// Zone balance. A zone is the rooms of one supply system (one air handling unit). Rooms that exhaust more than they are
// supplied and have no return (toilets, changing rooms, pantries) take the difference as transfer air from a supplied
// neighbour on the same deck: the user's choice (contract.transfers[roomId]), else the room an en-suite room belongs to,
// else the corridor when it shares at least half as much wall as the best other neighbour, else the neighbour with the longest shared wall (the cabin for its
// toilet); stairs, the open deck, stores, trunks and gas-tight rooms never give air. Gas-tight rooms take theirs through
// their own inlet; a room no supplied room touches takes it from outside (flagged). Per zone:
//   exhaust EA = exhaust of the zone's rooms + transfer air its rooms give to rooms outside the zone
//   fresh air OA = max(sum of the rooms' minimum fresh air, EA x (1 + pressurization)), at most the zone supply
//   return RA = supply - OA, shared over the zone's return rooms in proportion to what they keep:
//              supply - own exhaust - transfer air given away (a room never returns more than that)
const perimeter = room => { const p = (room.polygon || []).map(point); let L = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; L += Math.hypot(b.x - a.x, b.y - a.y); } return L; };
function balance(c, r) {
 const solasSettings = { ...SO.DEFAULT_SETTINGS, ...(c.solas || {}) }, spaceOf = n => SO.classify(n, solasSettings, c.solas?.rooms || {}).space;
 const air = c.airflow, byId = new Map(c.rooms.map(x => [x.id, x])), zones = [];
 for (const x of c.rooms) Object.assign(air[x.id], { transferInCmh: 0, transferFrom: null, transferOutCmh: 0, makeupCmh: 0 });
 // transfer air
 for (const t of c.rooms) {
  const a = air[t.id], deficit = a.exhaustCmh - a.supplyCmh; if (deficit <= 0 || t.systems.return) continue;
  // gas-tight rooms (CO2, batteries, paint) take their air through their own inlet, never from a neighbour
  if (SEALED.test(t.name || '')) { a.transferInCmh = deficit; a.transferFrom = 'own-inlet'; continue; }
  const set = (c.transfers || {})[t.id];
  if (set === 'own-inlet') { a.transferInCmh = deficit; a.transferFrom = 'own-inlet'; a.transferSet = true; continue; }
  let best = null, corridor = null;
  const user = byId.get(set);
  if (user && user.deckId === t.deckId && user !== t) best = { n: user, L: GE.sharedLength(t, user), user: true };
  else for (const n of c.rooms) {
   // a source keeps more supply than it exhausts (a room short of air itself cannot give any)
   if (n === t || n.deckId !== t.deckId || !(air[n.id].supplyCmh > air[n.id].exhaustCmh) || NO_SOURCE.test(n.name || '') || SEALED.test(n.name || '') || NO_SOURCE_SPACES.has(spaceOf(n))) continue;
   const L = GE.sharedLength(t, n); if (L < 300) continue;
   if (isCorridor(n)) { if (!corridor || L > corridor.L) corridor = { n, L }; } else if (!best || L > best.L) best = { n, L };
  }
  // an en-suite room (named after the room it belongs to, or wrapped by it on 40 % of its perimeter) keeps that room:
  // its door opens there, not to the corridor
  const ensuite = best && !best.user && ((t.name || '').startsWith(best.n.name || String.fromCharCode(0)) || best.L >= 0.4 * perimeter(t));
  if (corridor && !ensuite && (!best || corridor.L >= best.L / 2)) best = corridor;
  a.transferInCmh = deficit; a.transferFrom = best ? best.n.id : 'outside'; if (best?.user) a.transferSet = true;
  if (best) air[best.n.id].transferOutCmh += deficit;
 }
 // a room that gives transfer air gets the supply to cover it (and its own exhaust): the corridor in front of public
 // toilets is supplied for them
 // (with the pressurization share of what it gives, so a zone supplied mostly as make-up still balances)
 if (r.transferMakeup !== false) for (const n of c.rooms) { const a = air[n.id], need = ceilTo(a.exhaustCmh + a.transferOutCmh * (1 + (r.pressurizationPct || 0) / 100), r.roundCmh);
  if (a.transferOutCmh > 0 && a.supplyCmh < need) { a.makeupCmh = need - a.supplyCmh; a.supplyCmh = need; } }
 const supplyIds = [...new Set(c.rooms.map(x => x.systems.supply).filter(Boolean))].sort();
 for (const sid of supplyIds) {
  const members = c.rooms.filter(x => x.systems.supply === sid && air[x.id].source !== 'pending');
  const sa = members.reduce((t, x) => t + air[x.id].supplyCmh, 0), minOa = members.reduce((t, x) => t + (air[x.id].freshAirCmh || 0), 0);
  const inZone = new Set(members.map(x => x.id));
  const fed = c.rooms.filter(t => !inZone.has(t.id) && inZone.has(air[t.id].transferFrom));
  // exhaust the zone's own air has to make up: its rooms' exhaust, less what other zones / outside send in as transfer
  // air, plus the transfer air its rooms give to rooms outside the zone
  const ea = members.reduce((t, x) => t + air[x.id].exhaustCmh - (inZone.has(air[x.id].transferFrom) ? 0 : air[x.id].transferInCmh), 0) + fed.reduce((t, x) => t + air[x.id].transferInCmh, 0);
  const ret = members.filter(x => x.systems.return), basis = ret.map(x => Math.max(0, air[x.id].supplyCmh - air[x.id].exhaustCmh - air[x.id].transferOutCmh));
  // recirculating zones (with return rooms) stay over-pressured; an all-fresh-air zone (galley supply fan) only has to
  // cover its net exhaust - the rest of its exhaust comes in as transfer air
  const press = (r.pressurizationPct || 0) / 100, oaNeed = ret.length ? Math.max(minOa, r.pressurizationBasis === 'supply' ? ea + sa * press : ea * (1 + press), sa * (r.minOaPct ?? 0) / 100) : Math.max(minOa, ea);
  const room = Math.max(0, sa - Math.ceil(oaNeed)), canReturn = basis.reduce((t, b) => t + b, 0);
  let ra = Math.min(room, canReturn); ra = Math.floor(ra / r.roundCmh) * r.roundCmh;
  // shares in roundCmh steps, largest remainder, each at most its basis
  const shares = ret.map((x, i) => canReturn ? ra * basis[i] / canReturn : 0), floor = shares.map((v, i) => Math.min(basis[i], Math.floor(v / r.roundCmh) * r.roundCmh));
  let rest = ra - floor.reduce((t, v) => t + v, 0);
  for (const i of shares.map((v, i) => i).sort((p, q) => (shares[q] - floor[q]) - (shares[p] - floor[p]))) { if (rest < r.roundCmh) break; if (floor[i] + r.roundCmh <= basis[i]) { floor[i] += r.roundCmh; rest -= r.roundCmh; } }
  ret.forEach((x, i) => { air[x.id].returnCmh = floor[i]; });
  const raSum = floor.reduce((t, v) => t + v, 0), oa = sa - raSum;
  zones.push({ supplySystemId: sid, roomIds: members.map(x => x.id), transferRoomIds: fed.map(x => x.id), saCmh: sa, eaCmh: ea, minOaCmh: Math.round(minOa), oaCmh: oa, raCmh: raSum,
   recirculating: ret.length > 0, oaNeedCmh: Math.ceil(oaNeed), oaPct: sa ? Math.round(oa / sa * 1000) / 10 : 0, pressurizationCmh: oa - ea,
   // not enough supply for the fresh air the zone needs (its exhaust + pressurization, or the minimum fresh air)
   ok: oa >= Math.ceil(oaNeed) });
 }
 // return rooms outside every zone (no supply) return nothing
 for (const x of c.rooms) if (x.systems.return && !x.systems.supply) air[x.id].returnCmh = 0;
 return zones;
}

function withAirflow(c, r) {
 const airflow = {};
 for (const room of c.rooms) airflow[room.id] = roomAirflow(room, c.loads[room.id], r);
 const out = { ...c, rules: r, airflow };
 out.zones = r.airBalance === 'zone' ? balance(out, r) : [];
 out.systems = c.systems.map(s => ({ ...s, designCmh: s.roomIds.reduce((t, id) => t + (airflow[id][FLOW_FIELD[s.kind]] || 0), 0) }));
 return out;
}

// the same contract under other airflow rules (HVAC Grid step 3): room airflow, zones and system totals again, the rest kept
function applyRules(c, rules = {}) { return withAirflow(c, { ...DEFAULT_RULES, ...c.rules, ...rules }); }

// structural checks; returns a list of problems (empty = valid). Defensive: the input may be any parsed JSON.
function validate(c) {
 // coordinates in mm within +-1000 m of the origin: beyond that the drawing's unit or origin is wrong (and the raster
 // checks would run for ever)
 const out = [], push = m => out.push(m), obj = v => v && typeof v === 'object' && !Array.isArray(v), coord = v => Number.isFinite(v) && Math.abs(v) <= 1e6;
 if (!obj(c)) return ['계약이 JSON 객체가 아님'];
 if (c.schema !== SCHEMA) push('schema ' + c.schema);
 if (c.units !== 'mm') push('units ' + c.units);
 for (const k of ['decks', 'rooms', 'systems']) if (!Array.isArray(c[k])) push(k + ' 배열 없음');
 for (const k of ['loads', 'airflow', 'rules']) if (!obj(c[k])) push(k + ' 객체 없음');
 if (out.length) return out;
 const deckIds = new Set(c.decks.map(d => d?.id)), roomIds = new Set();
 if (deckIds.size !== c.decks.length) push('duplicate deck id');
 for (const d of c.decks) if (!Number.isFinite(d?.elevationMm)) push(`deck ${d?.id}: elevationMm`);
 if (!(c.rules.supplyDeltaTK > 0)) push('rules.supplyDeltaTK');
 if (c.rules.pressurizationPct != null && !(c.rules.pressurizationPct >= 0 && c.rules.pressurizationPct <= 30)) push('rules.pressurizationPct');
 if (c.rules.pressurizationBasis != null && !['exhaust', 'supply'].includes(c.rules.pressurizationBasis)) push('rules.pressurizationBasis');
 for (const room of c.rooms) {
  if (!obj(room) || typeof room.id !== 'string') { push('room id'); continue; }
  if (roomIds.has(room.id)) push('duplicate room id ' + room.id); roomIds.add(room.id);
  if (!deckIds.has(room.deckId)) push(`room ${room.id}: unknown deck ${room.deckId}`);
  if (!Array.isArray(room.polygon) || room.polygon.length < 3 || room.polygon.length > 2000 || room.polygon.some(p => !coord(p?.x) || !coord(p?.y))) push(`room ${room.id}: polygon`);
  if (room.holes != null && (!Array.isArray(room.holes) || room.holes.some(h => !Array.isArray(h) || h.some(p => !coord(p?.x) || !coord(p?.y))))) push(`room ${room.id}: holes`);
  if (!obj(room.systems)) push(`room ${room.id}: systems`);
  if (!obj(c.loads[room.id])) push(`room ${room.id}: no load`);
  const a = c.airflow[room.id]; if (!obj(a) || [a.supplyCmh, a.exhaustCmh, a.returnCmh].some(v => !(v >= 0))) push(`room ${room.id}: airflow`);
 }
 for (const s of c.systems) {
  if (!obj(s) || typeof s.id !== 'string' || !KINDS.includes(s.kind) || !Array.isArray(s.roomIds) || !Array.isArray(s.deckIds)) { push('system ' + s?.id + ': 형식'); continue; }
  for (const id of s.roomIds) if (!roomIds.has(id)) push(`system ${s.id}: unknown room ${id}`);
 }
 if (c.roots != null) { if (!obj(c.roots)) push('roots'); else for (const [k, p] of Object.entries(c.roots)) if (!coord(p?.x) || !coord(p?.y)) push('roots ' + k); }
 if (c.unitDecks != null && (!obj(c.unitDecks) || Object.values(c.unitDecks).some(d => !deckIds.has(d)))) push('unitDecks');
 if (c.transfers != null && (!obj(c.transfers) || Object.entries(c.transfers).some(([k, v]) => !roomIds.has(k) || (v !== 'own-inlet' && !roomIds.has(v))))) push('transfers');
 if (c.solas != null) {
  if (!obj(c.solas)) push('solas');
  else {
   if (c.solas.ship != null && !['CARG', 'TANK', 'P36P', 'P36M'].includes(c.solas.ship)) push('solas.ship ' + c.solas.ship);
   if (c.solas.method != null && !['IC', 'IIC', 'IIIC'].includes(c.solas.method)) push('solas.method ' + c.solas.method);
   if (c.solas.rooms != null && !obj(c.solas.rooms)) push('solas.rooms');
  }
 }
 return out;
}

module.exports = { SCHEMA, KINDS, FLOW_FIELD, DEFAULT_RULES, buildContract, roomAirflow, applyRules, validate, balance, isCorridor };
