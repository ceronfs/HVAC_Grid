// Ver 2.0 airflow engine (V2-3.9 airflow): room airflow, transfer air, make-up, the balance of every air handling zone
// and the system totals. New code (D7); 1.0 lib/contract.cjs is the functional reference. Pure - Node and Worker.
//   airflow({ rooms, loads, rules, assign, transfers, conditions, classes }) → { airflow, zones, systems }
//     classes: { [roomId]: { space } } from lib/engines/fire/classify.cjs (spaces that never give transfer air)
//
// F-1 (AGENTS.md, user rule 2026-10-22): one airflow all year, the summer one -
//   supply = round up to rules.roundCmh of max(cooling sensible W × safety factor × 3 ÷ ΔT, minimum fresh air)
//   (+ the make-up of a room that gives transfer air). Winter is the heating capacity on that airflow (AHU heater,
//   reheaters - lib/engines/systems), never a winter airflow: no heating load enters here.
'use strict';
const PL = require('../geometry/plan.cjs'), NAMES = require('./names.json');

const KINDS = ['supply', 'exhaust', 'return'], FIELD = { supply: 'supplyCmh', exhaust: 'exhaustCmh', return: 'returnCmh' };
const re = ([source, flags]) => new RegExp(source, flags);
const CORRIDOR = re(NAMES.corridor), SEALED = re(NAMES.sealed), NO_SOURCE = re(NAMES.noSource), NO_SOURCE_SPACES = new Set(NAMES.noSourceSpaces);
const isCorridor = r => r.isoClass === 'ALLEY_SOUND' || r.isoClass === 'ALLEY_NON_SOUND' || CORRIDOR.test(r.name || '');
// a room belongs to another (en-suite): named after it, or wrapped by it on 40 % of its outline
const belongsTo = (t, n, wall = null) => (t.name || '').startsWith(n.name || '\0') || (wall ?? PL.sharedWall(t, n)) >= 0.4 * PL.perimeter(t);
const up = (v, step) => step > 0 ? Math.ceil(v / step - 1e-9) * step : v;
const down = (v, step) => Math.floor(v / step) * step;
const marginOf = conditions => 1 + Math.max(0, +(conditions?.safetyFactorPct ?? 0) || 0) / 100;
// the volume the air changes are counted over: the room's, or floor × rules.defaultCeilingMm when it has no ceiling height
const ownCeiling = (room, r) => !room.ceilingHeightMm && r.defaultCeilingMm > 0;
const achVolume = (room, r) => ownCeiling(room, r) ? room.areaM2 * r.defaultCeilingMm / 1000 : room.volumeM3 || 0;

// one room from its load (F-1: the summer sensible load, or the fresh air)
function room(rm, load, sys, r, margin) {
 if (!load?.complete) return { supplyCmh: 0, exhaustCmh: 0, returnCmh: 0, freshAirCmh: 0, source: 'pending' };
 const cooling = load.coolingSensibleW * margin * 3 / r.supplyDeltaTK;
 const supplyCmh = sys.supply ? up(Math.max(cooling, load.minFreshAirCmh), r.roundCmh) : 0;
 const ach = ownCeiling(rm, r) && load.minAch ? load.minAch * achVolume(rm, r) : load.achAirCmh;
 const exhaustCmh = sys.exhaust ? up(ach, r.roundCmh) : 0;
 const out = { supplyCmh, exhaustCmh, returnCmh: sys.return ? Math.max(0, supplyCmh - exhaustCmh) : 0, freshAirCmh: load.minFreshAirCmh, source: 'load' };
 if (supplyCmh) out.basis = load.minFreshAirCmh >= cooling ? 'freshAir' : 'cooling';
 return out;
}

// a room that exhausts more than it is supplied and has no return takes the rest as transfer air from a supplied room
// of its deck: the user's choice; else the room it belongs to; else the corridor when its shared wall is at least half
// the best other one's; else the neighbour with the longest shared wall (≥ 300 mm). Gas-tight rooms take it through
// their own inlet; a room no source touches takes it from outside.
function transfer(rooms, air, sysOf, transfers, classes) {
 const byId = new Map(rooms.map(x => [x.id, x]));
 const canGive = n => air[n.id].supplyCmh > air[n.id].exhaustCmh && !NO_SOURCE.test(n.name || '') && !SEALED.test(n.name || '') && !NO_SOURCE_SPACES.has(classes[n.id]?.space);
 for (const t of rooms) {
  const a = air[t.id], deficit = a.exhaustCmh - a.supplyCmh;
  if (deficit <= 0 || sysOf(t).return) continue;
  if (SEALED.test(t.name || '')) { Object.assign(a, { transferInCmh: deficit, transferFrom: 'own-inlet' }); continue; }
  const set = transfers[t.id];
  if (set === 'own-inlet') { Object.assign(a, { transferInCmh: deficit, transferFrom: 'own-inlet', transferSet: true }); continue; }
  let best = null, corridor = null;
  const chosen = byId.get(set);
  if (chosen && chosen !== t && chosen.deckId === t.deckId) best = { n: chosen, wall: PL.sharedWall(t, chosen), user: true };
  else for (const n of rooms) {
   if (n === t || n.deckId !== t.deckId || !canGive(n)) continue;
   const wall = PL.sharedWall(t, n); if (wall < 300) continue;
   if (isCorridor(n)) { if (!corridor || wall > corridor.wall) corridor = { n, wall }; } else if (!best || wall > best.wall) best = { n, wall };
  }
  // a room that belongs to its best neighbour keeps it: its door opens there, not to the corridor
  if (corridor && !(best && !best.user && belongsTo(t, best.n, best.wall)) && (!best || corridor.wall >= best.wall / 2)) best = corridor;
  Object.assign(a, { transferInCmh: deficit, transferFrom: best ? best.n.id : 'outside' });
  if (best?.user) a.transferSet = true;
  if (best && !isCorridor(best.n) && belongsTo(t, best.n, best.wall)) a.transferEnsuite = true;   // ISO 7547 6.4.1 private sanitary room
  if (best) air[best.n.id].transferOutCmh += deficit;
 }
}

// one zone (the rooms of a supply system): fresh air for its exhaust and pressurization, the rest returns from its
// return rooms in rules.roundCmh steps (largest remainder), each at most what it keeps
function zone(rooms, air, sysOf, r, sid) {
 const members = rooms.filter(x => sysOf(x).supply === sid && air[x.id].source !== 'pending'), inZone = new Set(members.map(x => x.id));
 const sa = members.reduce((t, x) => t + air[x.id].supplyCmh, 0), minOa = members.reduce((t, x) => t + (air[x.id].freshAirCmh || 0), 0);
 const fed = rooms.filter(t => !inZone.has(t.id) && inZone.has(air[t.id].transferFrom));
 // exhaust the zone's own air makes up: its rooms' exhaust less the transfer air coming from outside the zone, plus the
 // transfer air it gives to rooms of other zones
 const ea = members.reduce((t, x) => t + air[x.id].exhaustCmh - (inZone.has(air[x.id].transferFrom) ? 0 : air[x.id].transferInCmh), 0) + fed.reduce((t, x) => t + air[x.id].transferInCmh, 0);
 const ret = members.filter(x => sysOf(x).return), keep = ret.map(x => Math.max(0, air[x.id].supplyCmh - air[x.id].exhaustCmh - air[x.id].transferOutCmh));
 const press = (r.pressurizationPct || 0) / 100;
 const oaNeed = ret.length ? Math.max(minOa, r.pressurizationBasis === 'supply' ? ea + sa * press : ea * (1 + press), sa * (r.minOaPct ?? 0) / 100) : Math.max(minOa, ea);
 const canReturn = keep.reduce((t, v) => t + v, 0), ra = down(Math.min(Math.max(0, sa - Math.ceil(oaNeed)), canReturn), r.roundCmh);
 const exact = keep.map(k => canReturn ? ra * k / canReturn : 0), share = exact.map((v, i) => Math.min(keep[i], down(v, r.roundCmh)));
 let rest = ra - share.reduce((t, v) => t + v, 0);
 for (const i of exact.map((v, i) => i).sort((p, q) => (exact[q] - share[q]) - (exact[p] - share[p]))) { if (rest < r.roundCmh) break; if (share[i] + r.roundCmh <= keep[i]) { share[i] += r.roundCmh; rest -= r.roundCmh; } }
 const raCmh = share.reduce((t, v) => t + v, 0), oa = sa - raCmh;
 return { returns: ret.map((x, i) => [x.id, share[i]]), zone: { supplySystemId: sid, roomIds: members.map(x => x.id), transferRoomIds: fed.map(x => x.id), saCmh: sa, eaCmh: ea,
  minOaCmh: Math.round(minOa), oaCmh: oa, raCmh, recirculating: ret.length > 0, oaNeedCmh: Math.ceil(oaNeed), oaPct: sa ? Math.round(oa / sa * 1000) / 10 : 0, pressurizationCmh: oa - ea, ok: oa >= Math.ceil(oaNeed) } };
}

// systems from the rooms' assignment: one per kind and name, decks in elevation order
function systems(rooms, decks, sysOf, air) {
 const out = new Map(), z = id => decks.find(d => d.id === id)?.z ?? 0;
 for (const x of rooms) for (const kind of KINDS) {
  const id = sysOf(x)[kind]; if (!id) continue;
  const k = kind + ':' + id; if (!out.has(k)) out.set(k, { id, kind, deckIds: new Set(), roomIds: [] });
  out.get(k).deckIds.add(x.deckId); out.get(k).roomIds.push(x.id);
 }
 return [...out.values()].map(s => ({ id: s.id, kind: s.kind, deckIds: [...s.deckIds].sort((a, b) => z(a) - z(b) || String(a).localeCompare(String(b))), roomIds: s.roomIds, designCmh: s.roomIds.reduce((t, id) => t + (air[id][FIELD[s.kind]] || 0), 0) }))
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

function airflow({ rooms, decks = [], loads, rules: r, assign = {}, transfers = {}, conditions = {}, classes = {} }) {
 const none = { supply: null, exhaust: null, return: null }, sysOf = x => assign[x.id] || none, margin = marginOf(conditions), air = {};
 for (const x of rooms) air[x.id] = room(x, loads[x.id], sysOf(x), r, margin);
 const zones = [];
 if (r.airBalance === 'zone') {
  for (const x of rooms) Object.assign(air[x.id], { transferInCmh: 0, transferFrom: null, transferOutCmh: 0, makeupCmh: 0 });
  transfer(rooms, air, sysOf, transfers, classes);
  // a room that gives transfer air is supplied for it (with the pressurization % of what it gives): the corridor in front
  // of public toilets; its supply is then set by the make-up
  if (r.transferMakeup !== false) for (const x of rooms) {
   const a = air[x.id], need = up(a.exhaustCmh + a.transferOutCmh * (1 + (r.pressurizationPct || 0) / 100), r.roundCmh);
   if (a.transferOutCmh > 0 && a.supplyCmh < need) Object.assign(a, { makeupCmh: need - a.supplyCmh, supplyCmh: need, basis: 'makeup' });
  }
  for (const sid of [...new Set(rooms.map(x => sysOf(x).supply).filter(Boolean))].sort()) { const z = zone(rooms, air, sysOf, r, sid); for (const [id, cmh] of z.returns) air[id].returnCmh = cmh; zones.push(z.zone); }
  for (const x of rooms) if (sysOf(x).return && !sysOf(x).supply) air[x.id].returnCmh = 0;   // a return room outside every zone
 }
 return { airflow: air, zones, systems: systems(rooms, decks, sysOf, air) };
}

module.exports = { airflow, room, zone, isCorridor, belongsTo, achVolume, marginOf, KINDS, FIELD };
