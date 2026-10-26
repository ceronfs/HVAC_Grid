// HVAC Grid 1.0 project → Ver 2.0 model and back (V2-3.4). 1.0 files: a project (hvac-grid-project/1, /0 - the
// contract, PHG D results and duct geometry) or a bare contract (hvac-grid/0). The 1.0 code is the functional reference
// only (D7): this reads its file format, nothing of lib/project.cjs is used.
//   fromV1(data)  → { model, notes }   1.0 file (parsed JSON) → hvac-grid/2
//   toV1(model)   → 1.0 project        for the 1.0 outputs and the comparison with the golden values (D8)
// What changes on the way:
//  - room system names leave the room (rooms[].systems → assign), deck fields get the 2.0 names (elevationMm → z, …)
//  - duct geometry: 1.0 stored y turned over (PHG D's screen y); 2.0 keeps BOX y everywhere
//  - rules.heatingSupplyDeltaTK of older files is dropped (F-1); PHG D project texts and the BOX drawing are not kept
//    (2.0 has neither window - D2, D17); the recompute table starts empty, so every derived part is stale until worked out
'use strict';
const S = require('../model/schema.cjs');

const V1_PROJECT = ['hvac-grid-project/1', 'hvac-grid-project/0'], V1_CONTRACT = 'hvac-grid/0';
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : null;
const flip = p => p ? { ...p, x: p.x, y: -p.y } : p;

function fromV1(data) {
 if (!obj(data)) throw new Error('JSON 객체가 아닙니다');
 const isProject = V1_PROJECT.includes(data.schema), c = isProject ? obj(data.contract) : data.schema === V1_CONTRACT ? data : null;
 if (!c) throw new Error(`HVAC Grid 1.0 파일이 아닙니다 (schema ${String(data.schema).slice(0, 40)})`);
 const notes = [];
 if (isProject && obj(data.projects) && Object.keys(data.projects).length) notes.push(`PHG D 프로젝트 ${Object.keys(data.projects).length}개는 가져오지 않음 — 덕트 형상·결과만 가져옴`);
 if (isProject && obj(data.box)) notes.push('BOX 도면은 가져오지 않음 — 격실은 설계 데이터에서');
 const decks = (c.decks || []).map(d => ({ id: d.id, name: d.name, code: d.id, z: d.elevationMm, height: d.heightMm, origin: d.offsetMm || { x: 0, y: 0 }, rotation: d.rotationDeg || 0, scale: d.scale || 1 }))
  .map((d, i, a) => ({ ...d, order: [...a].sort((p, q) => (p.z ?? 0) - (q.z ?? 0)).indexOf(d) }));
 const rooms = c.rooms || [], assign = Object.fromEntries(rooms.map(r => [r.id, { supply: r.systems?.supply ?? null, exhaust: r.systems?.exhaust ?? null, return: r.systems?.return ?? null }]));
 const networks = {}, ductEdits = {}, results = obj(data.results) || {}, geometry = obj(data.geometry) || {};
 for (const key of new Set([...Object.keys(results), ...Object.keys(geometry)])) {
  const g = obj(geometry[key]), r = obj(results[key]);
  networks[key] = { source: 'v1', result: r, root: g ? flip(g.root) : null, rus: g ? (g.rus || []).map(flip) : [],
   ducts: g ? (g.ducts || []).map(d => ({ ...d, points: (d.points || []).map(flip) })) : [] };
  const manual = networks[key].ducts.filter(d => d.manualSize && d.points.length > 1).map(d => ({ key: `${d.type}:${d.points[0].x},${d.points[0].y}>${d.points.at(-1).x},${d.points.at(-1).y}`, size: d.shape === 'round' ? { diameterMm: d.diameterMm } : { widthMm: d.widthMm, heightMm: d.heightMm } }));
  if (manual.length || r?.pick) ductEdits[key] = { pick: r?.pick || 0, manual };
 }
 const raw = { schema: S.SCHEMA, units: 'mm', app: { version: obj(data.app)?.version }, savedAt: data.savedAt ?? null,
  source: { from: 'v1', files: [], v1: { schema: data.schema, contractSource: c.source ?? null, coordinates: c.coordinates ?? null } },
  decks, rooms: rooms.map(({ systems, ...r }) => r), conditions: { project: obj(c.conditions) || {}, rooms: {}, k: {} }, loads: c.loads || {},
  rules: c.rules || {}, assign, transfers: c.transfers || {}, unitDecks: c.unitDecks || {}, roots: c.roots || {}, ruMoves: c.ruMoves || {}, ductEdits, solas: c.solas || {},
  airflow: c.airflow || {}, zones: c.zones || [], systems: c.systems || [], networks };
 const { model, notes: more } = S.clean(raw);
 return { model, notes: [...notes, ...more] };
}

// the 1.0 project of a model: what lib/project.cjs analyze and the 1.0 outputs read
function toV1(m) {
 const v1 = m.source?.v1 || {};
 const contract = { schema: V1_CONTRACT, units: 'mm', coordinates: v1.coordinates ?? 'ship', source: v1.contractSource ?? { app: 'HVAC Grid 2.0' }, rules: m.rules, conditions: m.conditions.project,
  decks: [...m.decks].sort((a, b) => a.order - b.order).map(d => ({ id: d.id, name: d.name, elevationMm: d.z, heightMm: d.height, offsetMm: d.origin, rotationDeg: d.rotation, scale: d.scale })),
  rooms: m.rooms.map(r => ({ ...r, systems: { supply: m.assign[r.id]?.supply ?? null, exhaust: m.assign[r.id]?.exhaust ?? null, return: m.assign[r.id]?.return ?? null } })),
  loads: m.loads, systems: m.systems, rus: [], ducts: {}, airflow: m.airflow, zones: m.zones };
 for (const k of ['roots', 'unitDecks', 'ruMoves', 'transfers', 'solas']) if (m[k] && Object.keys(m[k]).length) contract[k] = m[k];
 const results = {}, geometry = {};
 for (const [key, n] of Object.entries(m.networks)) {
  if (n.result) results[key] = n.result;
  if (n.root || n.ducts?.length) geometry[key] = { root: flip(n.root), rus: (n.rus || []).map(flip), ducts: (n.ducts || []).map(d => ({ ...d, points: (d.points || []).map(flip) })) };
 }
 return { schema: 'hvac-grid-project/1', savedAt: m.savedAt, app: { name: 'HVAC Grid', ...(m.app?.version && !m.app.version.startsWith('2.') ? { version: m.app.version } : {}) }, contract, results, geometry };
}

module.exports = { fromV1, toV1 };
