// HVAC Grid project file (one file: the contract, the PHG D project of every deck and system, their results and duct
// geometry) and the review over it: systems with vertical ducts, airflow checks, SOLAS boundaries and penetrations.
// Pure - the shell, tools/phg-generate.cjs and tools/hvac-report.cjs all use it.
'use strict';
const K = require('./contract.cjs'), PL = require('./phg-plan.cjs'), RS = require('./risers.cjs'), SO = require('./solas.cjs');

const SCHEMA = 'hvac-grid-project/1';
const LEGACY = ['hvac-grid-project/0'];

// what a PHG D result was made from: the Root, the RUs and the flow mode. A result whose plan changed since (airflow
// rules, unit location, unit deck) is stale and has to be sent again.
const planSig = p => JSON.stringify([p.flowMode, p.root.x, p.root.y, p.rus.map(u => [u.x, u.y, u.flowCmh])]);
// results with `stale` brought up to date against the current plans (results without a signature keep their flag)
function freshResults(contract, results) {
 const plans = PL.plan(contract), out = {};
 for (const [k, r] of Object.entries(results || {})) { const p = plans.find(x => x.key === k); out[k] = r.sig && p ? { ...r, stale: r.sig !== planSig(p) } : r; }
 return out;
}

function make({ contract, projects = {}, results = {}, geometry = {}, app = {} }) {
 return { schema: SCHEMA, savedAt: new Date().toISOString(), app: { name: 'HVAC Grid', ...app }, contract, projects, results, geometry };
}

// read a saved project (or a bare contract); returns { project, notes } or throws with the reason
function read(data) {
 if (!data || typeof data !== 'object') throw new Error('JSON 객체가 아닙니다');
 const notes = [];
 if (data.schema === K.SCHEMA) return { project: make({ contract: data }), notes: ['계약 파일 — PHG D 결과 없음'] };
 if (LEGACY.includes(data.schema)) notes.push(`${data.schema} → ${SCHEMA} 변환 (수직 덕트·SOLAS 설정 기본값)`);
 else if (data.schema !== SCHEMA) throw new Error('HVAC Grid 프로젝트·계약 파일이 아닙니다 (schema ' + data.schema + ')');
 const problems = K.validate(data.contract || {});
 if (problems.length) throw new Error('계약 검사 실패: ' + problems.slice(0, 3).join(', '));
 const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
 const project = { ...make({ contract: data.contract, projects: obj(data.projects), results: obj(data.results), geometry: obj(data.geometry), app: obj(data.app) }), savedAt: data.savedAt || null };
 // PHG D projects must be JSON text; results of plans that no longer exist are dropped
 const keys = new Set(PL.plan(project.contract).map(p => p.key));
 for (const k of Object.keys(project.projects)) if (typeof project.projects[k] !== 'string' || !keys.has(k)) { delete project.projects[k]; delete project.results[k]; delete project.geometry[k]; notes.push(k + ': 계획에 없는 계통 결과 제외'); }
 for (const k of Object.keys(project.results)) if (!keys.has(k)) { delete project.results[k]; delete project.geometry[k]; }
 return { project, notes };
}

// airflow checks per room: a room with its own exhaust and no return must not get more supply than exhaust
// (galley, toilets, laundry stay under negative pressure); systems without air; rooms still pending
function airChecks(contract) {
 const out = [];
 for (const r of contract.rooms) {
  const a = contract.airflow[r.id], l = contract.loads[r.id];
  if (!l.complete) out.push({ roomId: r.id, level: 'warn', code: 'LOAD_PENDING', text: `${r.no} ${r.name}: 부하 계산 미완료 — 풍량 0` });
  else if (r.systems.exhaust && !r.systems.return && a.supplyCmh > a.exhaustCmh) out.push({ roomId: r.id, level: 'warn', code: 'NEG_PRESSURE', text: `${r.no} ${r.name}: 급기 ${a.supplyCmh} > 배기 ${a.exhaustCmh} CMH — 부압 미확보 (배기 증가 또는 급기 제한)` });
  if (l.complete && (r.systems.supply || r.systems.exhaust || r.systems.return) && !(a.supplyCmh || a.exhaustCmh || a.returnCmh)) out.push({ roomId: r.id, level: 'info', code: 'NO_AIR', text: `${r.no} ${r.name}: 계통은 있으나 풍량 0` });
 }
 for (const s of contract.systems) if (!s.designCmh) out.push({ systemId: s.id, level: 'info', code: 'SYSTEM_EMPTY', text: `${s.id} (${PL.KIND_LABEL[s.kind]}): 풍량 0 — PHG D 계획 없음` });
 return out;
}

// duct networks for the SOLAS penetration check, from the stored geometry (app coordinates, y down)
function ductNets(plans, geometry) {
 const out = {};
 for (const p of plans) { const g = geometry[p.key]; if (g?.ducts?.length) out[p.key] = { deckId: p.deckId, systemId: p.systemId, kind: p.kind, ducts: g.ducts }; }
 return out;
}

// everything the review page, the XLSX and the report show
function analyze(project) {
 const c = project.contract, plans = PL.plan(c), results = freshResults(c, project.results);
 const systems = RS.systems(c, plans, results), risers = systems.flatMap(s => s.risers);
 const bounds = SO.boundaries(c), pens = SO.penetrations(c, bounds, ductNets(plans, project.geometry || {}), risers);
 const solas = { settings: bounds.settings, classes: bounds.classes, boundaries: bounds.boundaries, penetrations: pens, warnings: SO.systemWarnings(c, bounds), summary: SO.summary(bounds, pens) };
 const done = plans.filter(p => results[p.key]?.auto && !results[p.key].stale).length;
 const unconnected = plans.reduce((t, p) => t + (results[p.key]?.unconnected || 0), 0);
 const flowMismatch = plans.filter(p => results[p.key]?.at && !results[p.key].stale && results[p.key].flowCmh !== p.designCmh).map(p => p.key);
 const checks = [
  { id: 'loads', ok: !c.rooms.some(r => !c.loads[r.id].complete), text: `부하 계산 미완료 격실 ${c.rooms.filter(r => !c.loads[r.id].complete).length}개` },
  { id: 'units', ok: !plans.some(p => p.isUnitDeck && p.rootSource.startsWith('assumed')), text: `공조기 위치 임시 ${plans.filter(p => p.isUnitDeck && p.rootSource.startsWith('assumed')).length}개 계통 — ③에서 지정` },
  { id: 'auto', ok: done === plans.length, text: `AUTO 완료 ${done}/${plans.length} (Deck·계통)` },
  { id: 'connected', ok: !unconnected, text: `연결 안 된 RU ${unconnected}개` },
  { id: 'flow', ok: !flowMismatch.length, text: `RU 풍량 ≠ 설계 풍량 ${flowMismatch.length}개 계획` },
  { id: 'air', ok: !airChecks(c).some(x => x.level === 'warn'), text: `풍량 경고 ${airChecks(c).filter(x => x.level === 'warn').length}개 (부압·미완료)` },
  { id: 'solasRooms', ok: !solas.summary.unclassified.length, text: `SOLAS 미분류 실 ${solas.summary.unclassified.length}개 — ⑤ 방화에서 지정` },
  { id: 'solasCheck', ok: !pens.some(p => /SIZE|CHECK/.test(p.code)), text: `관통 판정 보류 ${pens.filter(p => /SIZE|CHECK/.test(p.code)).length}곳 (덕트 크기·범주)` },
  { id: 'solasSystems', ok: !solas.warnings.length, text: `계통 분리 경고 ${solas.warnings.length}개 (II-2/9.7.2·9.7.5)` }];
 return { plans, systems, risers, solas, air: airChecks(c), checks, done, total: plans.length };
}

module.exports = { SCHEMA, make, read, airChecks, analyze, ductNets, planSig, freshResults };
