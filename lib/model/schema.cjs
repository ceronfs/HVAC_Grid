// Ver 2.0 ship model, schema hvac-grid/2 (V2-3.1, docs/v2/PLAN_V2.md 6). One model for every step: the drawing's decks,
// the rooms, the loads, the airflow and systems, the duct networks and the fire review. Parts are the units the modules
// read and write (app/modules/*: reads, writes) and the recompute table hashes (lib/model/graph.cjs). Coordinates in
// mm, y as BOX draws it (1.x stored duct geometry with y turned over - lib/io/v1.cjs turns it back).
//   empty()            → a model with every part
//   clean(data)        → { model, notes } - a file read from outside: checked, numbers kept numbers, unknown keys dropped
//   validate(model)    → [problem] (empty: valid)
// F-1: rules has one supply ΔT (summer); there is no winter airflow rule. An old rules.heatingSupplyDeltaTK is dropped
// when read (AGENTS.md).
'use strict';

const SCHEMA = 'hvac-grid/2';
// part → which step writes it and whether a person sets it (input) or an engine works it out (derived). A derived part
// is never trusted from a file blindly: the recompute table (results) says whether it is up to date.
const PARTS = Object.freeze({
 source: { step: 0, kind: 'input' },       // { from, files: [{ name, sha256_16 }], v1? } - the original DXF is not kept
 decks: { step: 0, kind: 'input' },        // [{ id, name, code, z, height, origin {x,y}, rotation, scale, order }]
 geometry: { step: 0, kind: 'input' },     // { [deckId]: { lines: [{ id, a, b, purpose, layer }], texts } } - V2-5
 rooms: { step: 1, kind: 'input' },        // [{ id, deckId, no, name, polygon, holes, areaM2, volumeM3, ceilingHeightMm, isoClass }]
 boundaries: { step: 1, kind: 'derived' }, // V2-5.10 face rows
 conditions: { step: 2, kind: 'input' },   // { project: <design conditions>, rooms: { [roomId]: … }, k: … }
 loads: { step: 2, kind: 'derived' },      // { [roomId]: { coolingSensibleW, …, complete } } - from 1.x until V2-4 (D9)
 rules: { step: 3, kind: 'input' },        // airflow rules (F-1)
 assign: { step: 3, kind: 'input' },       // { [roomId]: { supply, exhaust, return } } - system names
 transfers: { step: 3, kind: 'input' },    // { [roomId]: sourceRoomId | 'own-inlet' } - the user's choice
 unitDecks: { step: 3, kind: 'input' },    // { [systemKey]: deckId }
 classes: { step: 3, kind: 'derived' },    // { [roomId]: { space, cat, source, check } } - SOLAS spaces (airflow, plans, fire read them)
 airflow: { step: 3, kind: 'derived' },    // { [roomId]: { supplyCmh, exhaustCmh, returnCmh, freshAirCmh, basis, transfer… } }
 zones: { step: 3, kind: 'derived' },      // [{ supplySystemId, saCmh, eaCmh, oaCmh, raCmh, ok, … }]
 systems: { step: 3, kind: 'derived' },    // [{ id, kind, key, deckIds, roomIds, designCmh }]
 roots: { step: 4, kind: 'input' },        // { [planKey]: { x, y } } - unit / shaft point the user put
 ruMoves: { step: 4, kind: 'input' },      // { [ruId]: { x, y } }
 ductEdits: { step: 4, kind: 'input' },    // { [planKey]: { pick, manual: [{ key, size }] } }
 plans: { step: 4, kind: 'derived' },      // [{ key: deck__system, root, rus, avoid, outside, … }] - the duct engine's plans, in order
 networks: { step: 4, kind: 'derived' },   // { [planKey]: { source: 'engine' | 'v1', ducts, nodes, diffusers, root, rus, result } }
 solas: { step: 5, kind: 'input' },        // { ship, method, lowestBelow, sprinkler, wallToleranceMm, minOverlapMm, rooms: { [roomId]: { space, cat } }, bounds: { [boundaryId]: { grade } } }
 review: { step: 5, kind: 'derived' },     // lib/engines/review/review.cjs: systems with ESP, SOLAS, checks
 results: { step: null, kind: 'table' },   // { [producer or producer:key]: { inputHash, at } } - lib/model/graph.cjs
});
const RULES = Object.freeze({ supplyDeltaTK: 10, roundCmh: 10, exhaustFrom: 'ach', airBalance: 'zone', pressurizationPct: 5, pressurizationBasis: 'exhaust',
 transferVelocityMps: 2, transferMakeup: true, defaultCeilingMm: null, minOaPct: 25 });
const KINDS = ['supply', 'exhaust', 'return'];
const SHIPS = ['CARG', 'TANK', 'P36P', 'P36M'], METHODS = ['IC', 'IIC', 'IIIC'];
const LIMIT_MM = 1e6;           // ±1 000 km is not a ship: a wrong unit or origin
const LIMIT_POINTS = 2000;      // points of one room outline

function empty() {
 return { schema: SCHEMA, units: 'mm', app: { name: 'HVAC Grid', version: '2.0.0-dev' }, savedAt: null,
  source: { from: 'new', files: [] }, decks: [], geometry: {}, rooms: [], boundaries: [], conditions: { project: {}, rooms: {}, k: {} }, loads: {},
  rules: { ...RULES }, assign: {}, transfers: {}, unitDecks: {}, classes: {}, airflow: {}, zones: [], systems: [],
  roots: {}, ruMoves: {}, ductEdits: {}, plans: [], networks: {}, solas: {}, review: null, results: {} };
}

const obj = v => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d = null) => v != null && v !== '' && Number.isFinite(+v) ? +v : d;
const str = (v, n = 200) => typeof v === 'string' ? v.slice(0, n) : v == null ? null : String(v).slice(0, n);
const name = v => typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null;
const point = p => obj(p) && num(p.x) != null && num(p.y) != null ? { x: +p.x, y: +p.y } : Array.isArray(p) && p.length >= 2 ? point({ x: p[0], y: p[1] }) : null;
const points = a => Array.isArray(a) ? a.map(point).filter(Boolean) : [];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

function cleanDeck(d, i) {
 return { id: str(d.id, 80), name: str(d.name ?? d.id, 80), code: str(d.code ?? d.id, 40), z: num(d.z, 0), height: num(d.height), origin: point(d.origin) || { x: 0, y: 0 },
  rotation: num(d.rotation, 0), scale: num(d.scale, 1), order: num(d.order, i) };
}
function cleanRoom(r) {
 return { id: str(r.id, 120), deckId: str(r.deckId, 80), no: r.no == null ? null : str(r.no, 40), name: str(r.name ?? '', 120), polygon: points(r.polygon),
  holes: Array.isArray(r.holes) ? r.holes.map(points).filter(h => h.length > 2) : [], areaM2: num(r.areaM2, 0), volumeM3: num(r.volumeM3, 0),
  ceilingHeightMm: num(r.ceilingHeightMm), isoClass: r.isoClass ? str(r.isoClass, 40) : null };
}
const LOAD_KEYS = ['coolingSensibleW', 'coolingLatentW', 'coolingW', 'heatingW', 'minFreshAirCmh', 'minAch', 'achAirCmh'];
function cleanLoad(l) { const out = Object.fromEntries(LOAD_KEYS.map(k => [k, num(l[k], 0)])); out.complete = l.complete === true; out.status = l.status == null ? null : str(l.status, 200); return out; }
function cleanRules(r, notes) {
 const out = { ...RULES };
 for (const k of Object.keys(RULES)) if (r[k] !== undefined) out[k] = typeof RULES[k] === 'string' ? str(r[k], 20) : typeof RULES[k] === 'boolean' ? r[k] !== false : num(r[k], RULES[k]);
 // F-1: a winter airflow rule of an older file is not applied
 if (r.heatingSupplyDeltaTK != null) notes.push('겨울 풍량 규칙(rules.heatingSupplyDeltaTK)은 쓰지 않음 — 풍량은 여름 기준 하나, 겨울은 같은 풍량에 난방 용량 (F-1)');
 return out;
}
const pointMap = m => obj(m) ? Object.fromEntries(Object.entries(m).map(([k, p]) => [str(k, 400), point(p)]).filter(([, p]) => p)) : {};

// a model read from a file. Derived parts are kept (the recompute table decides whether they are up to date), inputs
// are cleaned; what is not understood is dropped with a note.
function clean(data) {
 if (!obj(data)) throw new Error('JSON 객체가 아닙니다');
 if (data.schema !== SCHEMA) throw new Error(`HVAC Grid 2.0 모델이 아닙니다 (schema ${String(data.schema).slice(0, 40)})`);
 const notes = [], m = empty();
 m.app = { name: 'HVAC Grid', version: str(data.app?.version, 40) || m.app.version }; m.savedAt = str(data.savedAt, 40);
 if (obj(data.source)) m.source = { from: str(data.source.from, 20) || 'new', files: (Array.isArray(data.source.files) ? data.source.files : []).filter(obj).map(f => ({ name: str(f.name, 260), sha256_16: str(f.sha256_16, 16) })), ...(obj(data.source.v1) ? { v1: data.source.v1 } : {}) };
 m.decks = (Array.isArray(data.decks) ? data.decks : []).filter(obj).map(cleanDeck);
 m.geometry = obj(data.geometry) ? data.geometry : {};
 m.rooms = (Array.isArray(data.rooms) ? data.rooms : []).filter(obj).map(cleanRoom);
 m.boundaries = Array.isArray(data.boundaries) ? data.boundaries : [];
 m.conditions = obj(data.conditions) ? { project: obj(data.conditions.project) ? data.conditions.project : {}, rooms: obj(data.conditions.rooms) ? data.conditions.rooms : {}, k: obj(data.conditions.k) ? data.conditions.k : {} } : m.conditions;
 const ids = new Set(m.rooms.map(r => r.id)), deckIds = new Set(m.decks.map(d => d.id));
 if (obj(data.loads)) for (const [k, l] of Object.entries(data.loads)) if (ids.has(k) && obj(l)) m.loads[k] = cleanLoad(l);
 m.rules = cleanRules(obj(data.rules) ? data.rules : {}, notes);
 if (obj(data.assign)) for (const [k, a] of Object.entries(data.assign)) if (ids.has(k) && obj(a)) m.assign[k] = Object.fromEntries(KINDS.map(t => [t, name(a[t])]));
 if (obj(data.transfers)) for (const [k, v] of Object.entries(data.transfers)) if (ids.has(k) && (v === 'own-inlet' || ids.has(v))) m.transfers[k] = v;
 if (obj(data.unitDecks)) for (const [k, v] of Object.entries(data.unitDecks)) if (deckIds.has(v)) m.unitDecks[str(k, 200)] = v;
 m.roots = pointMap(data.roots); m.ruMoves = pointMap(data.ruMoves);
 if (obj(data.ductEdits)) for (const [k, e] of Object.entries(data.ductEdits)) if (obj(e)) m.ductEdits[str(k, 400)] = { pick: num(e.pick, 0), manual: (Array.isArray(e.manual) ? e.manual : []).filter(x => obj(x) && typeof x.key === 'string' && obj(x.size)).map(x => ({ key: x.key.slice(0, 400), size: pick(x.size, ['widthMm', 'heightMm', 'diameterMm']) })) };
 if (obj(data.solas)) { const s = data.solas; m.solas = { ...pick(s, ['lowestBelow', 'sprinkler', 'wallToleranceMm', 'minOverlapMm']), ...(SHIPS.includes(s.ship) ? { ship: s.ship } : {}), ...(METHODS.includes(s.method) ? { method: s.method } : {}), ...(obj(s.rooms) ? { rooms: Object.fromEntries(Object.entries(s.rooms).filter(([k, v]) => ids.has(k) && obj(v))) } : {}),
  // a boundary rating the user set: kept while its boundary id may come back (the review lists the ones it does not find)
  ...(obj(s.bounds) ? { bounds: Object.fromEntries(Object.entries(s.bounds).filter(([, v]) => obj(v) && typeof v.grade === 'string').map(([k, v]) => [str(k, 400), { grade: str(v.grade, 10) }])) } : {}) };
  if (s.ship != null && !SHIPS.includes(s.ship)) notes.push('solas.ship 버림: ' + str(s.ship, 20)); }
 for (const k of ['classes', 'airflow', 'networks']) if (obj(data[k])) m[k] = data[k];
 for (const k of ['zones', 'systems', 'plans']) if (Array.isArray(data[k])) m[k] = data[k];
 if (obj(data.review)) m.review = data.review;
 if (obj(data.results)) for (const [k, r] of Object.entries(data.results)) if (obj(r) && typeof r.inputHash === 'string') m.results[str(k, 400)] = { inputHash: r.inputHash.slice(0, 40), at: str(r.at, 40) };
 const problems = validate(m); if (problems.length) throw new Error('모델 검사 실패: ' + problems.slice(0, 5).join(', '));
 return { model: m, notes };
}

function validate(m) {
 const out = [], coord = v => Number.isFinite(v) && Math.abs(v) <= LIMIT_MM;
 if (!obj(m) || m.schema !== SCHEMA) return ['schema'];
 if (m.units !== 'mm') out.push('units ' + m.units);
 const deckIds = new Set();
 for (const d of m.decks) { if (!d.id) out.push('deck id'); else if (deckIds.has(d.id)) out.push('deck id 중복 ' + d.id); deckIds.add(d.id); if (!Number.isFinite(d.z)) out.push(`deck ${d.id}: z`); }
 const ids = new Set();
 for (const r of m.rooms) {
  if (!r.id) { out.push('room id'); continue; }
  if (ids.has(r.id)) out.push('room id 중복 ' + r.id); ids.add(r.id);
  if (!deckIds.has(r.deckId)) out.push(`room ${r.id}: deck ${r.deckId} 없음`);
  if (r.polygon.length < 3 || r.polygon.length > LIMIT_POINTS || r.polygon.some(p => !coord(p.x) || !coord(p.y))) out.push(`room ${r.id}: polygon`);
 }
 const R = m.rules;
 if (!(R.supplyDeltaTK > 0)) out.push('rules.supplyDeltaTK');
 if (!(Number.isInteger(R.roundCmh) && R.roundCmh > 0 && R.roundCmh <= 1000)) out.push('rules.roundCmh (1–1000 CMH 정수)');
 if (!(R.pressurizationPct >= 0 && R.pressurizationPct <= 30)) out.push('rules.pressurizationPct');
 if (!['exhaust', 'supply'].includes(R.pressurizationBasis)) out.push('rules.pressurizationBasis');
 if (!['zone', 'room'].includes(R.airBalance)) out.push('rules.airBalance');
 if (!(R.minOaPct >= 0 && R.minOaPct <= 100)) out.push('rules.minOaPct');
 for (const k of Object.keys(R)) if (!(k in RULES)) out.push('rules.' + k + ' (알 수 없는 규칙)');
 for (const p of [...Object.values(m.roots), ...Object.values(m.ruMoves)]) if (!coord(p.x) || !coord(p.y)) { out.push('roots/ruMoves 좌표'); break; }
 return out;
}

module.exports = { SCHEMA, PARTS, RULES, KINDS, empty, clean, validate };
