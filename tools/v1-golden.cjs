// V2-0.1 1.x 기준값: what HVAC Grid 1.x makes of S5, T3 and N3, kept in test/fixtures/v1-golden/<ship>/ so that every
// Ver 2.0 engine can be held to the same answer (docs/v2/PLAN_V2_WORK.md 0.1, PLAN_V2.md G8).
//   node tools/v1-golden.cjs [s5 t3 n3] [--out=<dir>]   write the fixtures (default: all three, test/fixtures/v1-golden)
//   node tools/v1-golden.cjs [s5 t3 n3] --check          run 1.x again and compare with the fixtures (exit 1 on a difference)
// Browser (tools/golden-run.cjs): BOX → CAL loads → design data → ⑤ SOLAS → ④ every plan AUTO in PHG D. Files:
//   project.json  the 1.x project as saved, without the PHG D projects (tools/phg-golden.cjs) and the BOX file; time
//                 stamps and run seconds fixed (results[*].at = 1, seconds = 0), BOX-made deck ids (N3) named DECK1..n
//   cal.json      BOX CAL's rooms (HVACGrid.box.calSnapshot: K mode, design conditions, per-room inputs and loads with
//                 the transmission parts) · box-extract.json  what the contract is built from (HVACGrid.box.extract)
// Node (derive, from project.json only - test/v1-golden.test.cjs recomputes these with npm test):
//   rooms.json (decks, rooms) · loads.json · airflow.json (rules, rooms, zones) · systems.json (systems, ESP, fan, risers)
//   rus.json (plans: Root, RUs) · networks.json (ducts: path, size, flow; the AUTO result) · solas.json (classes,
//   boundaries, penetrations, passages, checklist) · review.json (checks, room airflow checks) · outputs.json (XLSX
//   cell values by sheet, DXF entity counts by type and layer, report HTML size and hash)
// meta.json (inputs and vendor hashes, browser, seconds) is not compared.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('node:assert/strict');
const PJ = require('../lib/project.cjs'), RP = require('../lib/report.cjs'), XL = require('../lib/xlsx.cjs'), DX = require('../lib/dxf-out.cjs');
const FP = require('../lib/fire-plan.cjs'), DG = require('../lib/diagram.cjs'), { readWorkbook } = require('../lib/xlsx-read.cjs');
const ROOT = path.join(__dirname, '..'), FIXTURES = path.join(ROOT, 'test', 'fixtures', 'v1-golden');
const DERIVED = ['rooms', 'loads', 'airflow', 'systems', 'rus', 'networks', 'solas', 'review', 'outputs'];
const BROWSER = ['project', 'cal', 'box-extract'];
const clone = v => JSON.parse(JSON.stringify(v ?? null));
const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

// BOX names a deck opened from a DXF "D" + time stamp + random digits: named by deck order instead, everywhere
function deckIds(project) {
 const ids = (project.contract?.decks || []).map(d => d.id), map = {};
 ids.forEach((id, i) => { if (/^D\d{12,}\.\d+$/.test(id)) map[id] = `DECK${i + 1}`; });
 if (!Object.keys(map).length) return { map, fix: v => v };
 const re = new RegExp(Object.keys(map).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
 return { map, fix: v => JSON.parse(JSON.stringify(v).replace(re, m => map[m])) };
}

// the project as 1.x saved it, made comparable
function normalize(run) {
 const { fix, map } = deckIds(run.project), { projects, box, ...rest } = run.project;
 const project = fix({ ...rest, savedAt: '-',
  results: Object.fromEntries(Object.entries(rest.results || {}).map(([k, r]) => [k, { ...r, ...(r.at ? { at: 1 } : {}), ...('seconds' in r ? { seconds: 0 } : {}) }])) });
 const cal = fix(run.cal), extract = fix(run.extract);
 return { project, cal, 'box-extract': extract, deckMap: map, phgProjects: Object.keys(projects || {}).length, boxFile: box ? box.format : null };
}

// DXF: entities in ENTITIES by type and by layer (POLYLINE's VERTEX and SEQEND counted as their own types)
function dxfCounts(text) {
 const L = text.split(/\r?\n/), byType = {}, byLayer = {}; let section = null, n = 0, cur = null;
 for (let i = 0; i + 1 < L.length; i += 2) {
  const code = L[i].trim(), v = L[i + 1].trim();
  if (code === '0' && v === 'SECTION') { section = L[i + 3]?.trim(); i += 2; continue; }
  if (code === '0' && v === 'ENDSEC') { section = null; continue; }
  if (section !== 'ENTITIES') continue;
  if (code === '0') { byType[v] = (byType[v] || 0) + 1; n++; cur = v; }
  else if (code === '8' && cur && !['VERTEX', 'SEQEND'].includes(cur)) { byLayer[v] = (byLayer[v] || 0) + 1; cur = null; }
 }
 const sort = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a < b ? -1 : 1));
 return { entities: n, byType: sort(byType), byLayer: sort(byLayer), bytes: Buffer.byteLength(text) };
}

// everything the golden files hold apart from the browser's own, from the saved project only (pure)
function derive(project) {
 const a = PJ.analyze(project), c = project.contract;
 const rooms = { decks: c.decks, rooms: c.rooms };
 const loads = c.loads;
 const airflow = { rules: c.rules, rooms: c.airflow, zones: c.zones || [] };
 const systems = { systems: c.systems, analysis: a.systems.map(s => ({ system: s.systemKey, systemId: s.systemId, kind: s.kind, unitDeck: s.unitDeckId, fanCmh: s.fanCmh, designCmh: s.designCmh,
  decks: s.decks.map(d => d.deckId ?? d), complete: s.complete, espPa: s.indexPa, fanPa: s.fanPa, indexDeck: s.indexDeckId, riserLengthM: s.riserLengthM })), risers: a.risers };
 const rus = a.plans.map(p => { const { dxf, ...rest } = p; return { ...rest, dxfBytes: dxf ? Buffer.byteLength(dxf) : 0, dxfSha: dxf ? sha(dxf) : null }; });
 const networks = Object.fromEntries(a.plans.map(p => [p.key, { result: project.results[p.key] || null, geometry: project.geometry?.[p.key] || null }]));
 const solas = a.solas;
 const review = { count: a.count, checks: a.checks, air: a.air, done: a.done, stale: a.stale, total: a.total, staleNets: a.staleNets, rootsOutside: a.rootsOutside, rootsBadRoom: a.rootsBadRoom, deepDucts: a.deepDucts, trunks: a.trunks, deckAlign: a.deckAlign, open: RP.openItems(project, a) };
 const wb = readWorkbook(Buffer.from(XL.xlsx(RP.sheets(project, a)))), html = RP.html(project, a);
 const integrated = DX.integratedDxf(c, { diagrams: DG.systemDiagrams(c, a), plans: a.plans, geometry: a.geometry, boundaries: a.solas.boundaries, penetrations: a.solas.penetrations, risers: a.risers });
 const fire = FP.toDxf(FP.model(c, a.solas));
 const outputs = { xlsx: wb, dxf: { integrated: dxfCounts(integrated), firePlan: dxfCounts(fire) }, html: { bytes: Buffer.byteLength(html), sha256_16: sha(html) } };
 return clone({ rooms, loads, airflow, systems, rus, networks, solas, review, outputs });
}

const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8'));
const text = v => JSON.stringify(v, null, 1) + '\n';
function files(norm) { const d = derive(norm.project); return { project: norm.project, cal: norm.cal, 'box-extract': norm['box-extract'], ...d }; }

// first differing paths of two JSON values (for the --check report)
function diff(a, b, at = '', out = []) {
 if (out.length >= 12) return out;
 if (JSON.stringify(a) === JSON.stringify(b)) return out;
 if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${at}/${k}`, out); return out; }
 out.push(`${at || '/'}: ${JSON.stringify(a)?.slice(0, 120)} ≠ ${JSON.stringify(b)?.slice(0, 120)}`); return out;
}

function inputsOf(ship) {
 const f = { s5: ['vendor/BOX_CAL_Enhance.html'], t3: ['samples/t3/T3.box.json', 'samples/t3/T3.solas.json'], n3: ['samples/n3/N3.inputs.json', 'samples/n3/N3_D1.dxf', 'samples/n3/N3_D2.dxf', 'samples/n3/N3_D3.dxf'] }[ship];
 return Object.fromEntries(f.map(x => [x, sha(fs.readFileSync(path.join(ROOT, x)))]));
}
function meta(ship, run, norm) {
 const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'VERSIONS.json'), 'utf8'));
 const vendor = Object.fromEntries(['BOX_CAL_Enhance.html', 'DuctConcept_PHG_D.html'].map(f => [f, sha(fs.readFileSync(path.join(ROOT, 'vendor', f)))]));
 let commit = null; try { commit = require('child_process').execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch {}
 return { ship, tool: 'tools/v1-golden.cjs', made: new Date().toISOString(), commit, inputs: inputsOf(ship), vendor, versions: V.files ? Object.keys(V.files) : undefined,
  browser: run.browser, node: process.version, deckMap: norm.deckMap, phgProjects: norm.phgProjects, boxFile: norm.boxFile, pageErrors: run.errors, status: run.status, timing: run.timing };
}

async function main() {
 const args = process.argv.slice(2), check = args.includes('--check'), out = (args.find(a => a.startsWith('--out=')) || '').slice(6) || FIXTURES;
 const { SHIPS, runShip } = require('./golden-run.cjs'), ships = args.filter(a => !a.startsWith('--')); if (!ships.length) ships.push(...SHIPS);
 let bad = 0;
 for (const ship of ships) {
  const t = Date.now(), run = await runShip(ship, { log: m => console.log('  ' + m) });
  if (run.errors.length) { console.error(`${ship}: 페이지 오류 ${run.errors.length}`, run.errors.slice(0, 5)); bad++; }
  const norm = normalize(run), all = files(norm), dir = path.join(out, ship);
  const done = Object.values(norm.project.results).filter(r => r.auto && !r.stale).length, total = all.rus.length;
  if (done !== total) { console.error(`${ship}: AUTO ${done}/${total}`); bad++; }
  if (check) {
   const diffs = [];
   for (const [k, v] of Object.entries(all)) { let want; try { want = read(dir, k); } catch { diffs.push(`${k}: 기준값 파일 없음`); continue; } for (const d of diff(want, v)) diffs.push(`${k}${d}`); }
   console.log(`${ship}: ${diffs.length ? 'DIFF' : 'SAME'} (${Math.round((Date.now() - t) / 1000)} s · AUTO ${run.timing.autoS} s)`); for (const d of diffs.slice(0, 40)) console.log('   ' + d);
   if (diffs.length) bad++;
  } else {
   fs.mkdirSync(dir, { recursive: true });
   for (const [k, v] of Object.entries(all)) fs.writeFileSync(path.join(dir, k + '.json'), text(v));
   fs.writeFileSync(path.join(dir, 'meta.json'), text(meta(ship, run, norm)));
   console.log(`${ship}: ${path.relative(ROOT, dir)} (${Math.round((Date.now() - t) / 1000)} s · AUTO ${done}/${total} ${run.timing.autoS} s)`);
  }
 }
 if (bad) process.exit(1);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { FIXTURES, DERIVED, BROWSER, derive, normalize, dxfCounts, diff, read };
