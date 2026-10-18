// HVAC Grid data contract v0 (docs/CONTRACT.md): build it from what BOX CAL reports, derive room airflow, validate.
// Pure functions, no browser: tools/box-extract.cjs collects the raw BOX data, this module shapes and checks it.
'use strict';

const SCHEMA = 'hvac-grid/0';
const DEFAULT_RULES = Object.freeze({
 supplyDeltaTK: 10,        // supply air = cooling sensible W x 3 / dT (prior integration rule, ~ 1/(rho cp) = 2.99)
 roundCmh: 10,             // airflow rounded up to this step
 exhaustFrom: 'ach',       // exhaust air = room ACH x volume (BOX ventilationAirCmh) for rooms with an exhaust system
});

const point = p => Array.isArray(p) ? { x: +p[0], y: +p[1] } : { x: +p.x, y: +p.y };
const ceilTo = (v, step) => step > 0 ? Math.ceil(v / step - 1e-9) * step : v;
const name = v => (typeof v === 'string' && v.trim()) ? v.trim() : null;

// raw = { source:{file,sha256,app}, decks:[BOX deck], rooms:[BOX room load record], conditions }
function buildContract(raw, rules = {}) {
 const r = { ...DEFAULT_RULES, ...rules };
 const decks = raw.decks.map(d => ({ id: d.id, name: d.name || d.id, elevationMm: +d.z || 0, heightMm: +d.height || null,
  offsetMm: { x: +d.offsetX || 0, y: +d.offsetY || 0 }, rotationDeg: +d.rotation || 0 }));
 const rooms = [], loads = {}, airflow = {}, systems = new Map();
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
  airflow[room.id] = roomAirflow(room, loads[room.id], r);
  system(room.systems.supply, 'supply', room); system(room.systems.exhaust, 'exhaust', room); system(room.systems.return, 'return', room);
 }
 const systemList = [...systems.values()].map(s => ({ ...s, deckIds: [...s.deckIds].sort(),
  designCmh: s.roomIds.reduce((t, id) => t + (s.kind === 'supply' ? airflow[id].supplyCmh : s.kind === 'exhaust' ? airflow[id].exhaustCmh : airflow[id].returnCmh), 0) }))
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
 return { schema: SCHEMA, units: 'mm', source: raw.source, rules: r, conditions: raw.conditions || null,
  decks, rooms, loads, airflow, systems: systemList, rus: [], ducts: {} };
}

// v0 rules (docs/CONTRACT.md 4): supply from the cooling sensible load, exhaust from ACH, return = supply - exhaust
function roomAirflow(room, load, r) {
 if (!load.complete) return { supplyCmh: 0, exhaustCmh: 0, returnCmh: 0, freshAirCmh: 0, source: 'pending' };
 const supplyCmh = room.systems.supply ? ceilTo(load.coolingSensibleW * 3 / r.supplyDeltaTK, r.roundCmh) : 0;
 const exhaustCmh = room.systems.exhaust ? ceilTo(load.achAirCmh, r.roundCmh) : 0;
 const returnCmh = room.systems.return ? Math.max(0, supplyCmh - exhaustCmh) : 0;
 return { supplyCmh, exhaustCmh, returnCmh, freshAirCmh: load.minFreshAirCmh, source: 'load' };
}

// structural checks; returns a list of problems (empty = valid)
function validate(c) {
 const out = [], push = m => out.push(m);
 if (c.schema !== SCHEMA) push('schema ' + c.schema);
 if (c.units !== 'mm') push('units ' + c.units);
 const deckIds = new Set(c.decks.map(d => d.id)), roomIds = new Set();
 if (deckIds.size !== c.decks.length) push('duplicate deck id');
 for (const room of c.rooms) {
  if (roomIds.has(room.id)) push('duplicate room id ' + room.id); roomIds.add(room.id);
  if (!deckIds.has(room.deckId)) push(`room ${room.id}: unknown deck ${room.deckId}`);
  if (room.polygon.length < 3 || room.polygon.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) push(`room ${room.id}: polygon`);
  if (!c.loads[room.id]) push(`room ${room.id}: no load`);
  const a = c.airflow[room.id]; if (!a || [a.supplyCmh, a.exhaustCmh, a.returnCmh].some(v => !(v >= 0))) push(`room ${room.id}: airflow`);
 }
 for (const s of c.systems) for (const id of s.roomIds) if (!roomIds.has(id)) push(`system ${s.id}: unknown room ${id}`);
 return out;
}

module.exports = { SCHEMA, DEFAULT_RULES, buildContract, roomAirflow, validate };
