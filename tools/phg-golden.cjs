// V2-0.2 PHG D 기준값 (PLAN_PHG_LIB P0): for every plan (deck × system) of S5, T3 and N3, what PHG D did when 1.x sent
// it and ran AUTO - kept in test/fixtures/phg-golden/<ship>/ as the functional reference for the Ver 2.0 route and size
// engines (written anew, DECISIONS D7; the same answer is not required, D8 - a difference is recorded).
//   node tools/phg-golden.cjs [s5 t3 n3] [--out=<dir>]   write the fixtures (default: all three)
//   node tools/phg-golden.cjs [s5 t3 n3] --check          run again and compare with the fixtures (exit 1 on a difference)
// Per plan, <deck__system>.json.gz (gzip of JSON, deterministic):
//   plan     the plan 1.x sent (lib/phg-plan.cjs: Root, RUs, forbidden zones, outside; the dxf by length only)
//   loaded   PHG D state right after loadPlan (entities, nodes, diffusers, settings, layers ...) and its DXF worker
//   auto     every AUTO preview (forbidden zones it ran with, the candidates), the worker messages in and out
//            (routing engine, sizing worker, V2 calculation), ducts / RUs / nodes after sizing, the pressure paths,
//            the bridge's result and geometry()
// index.json: per plan the counts and the result (RUs, ducts, length, index Pa, candidates, zones relaxed, worker
// messages) - readable without unzipping. Ids PHG D makes up (time stamps, random) are numbered in order of first use;
// worker messages are sorted (parallel routing workers answer in any order).
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { diff } = require('./v1-golden.cjs');
const ROOT = path.join(__dirname, '..'), FIXTURES = path.join(ROOT, 'test', 'fixtures', 'phg-golden');
const safe = k => k.replace(/[^A-Za-z0-9_.-]+/g, '_');

// numbers in ids and stamps that differ from run to run: PHG D's ids ("n_lx3k9_…", "duct-1792…"), time fields (and every
// number under a key ending in Ms: routingTimeMs, preparationMs, nativeWorkerMs …)
const TIME_KEYS = new Set(['at', 'createdAt', 'updatedAt', 'modifiedAt', 'savedAt', 'timestamp', 'time', 't', 'elapsedMs', 'durationMs', 'ms', 'seconds', 'startedAt', 'finishedAt']);
// what the machine decides: PHG D's parallel worker split (core count)
const MACHINE_KEYS = new Set(['phgdParallel']);
const RANDOM_ID = /^(?:[A-Za-z]+[-_])?(?:[0-9a-z]{6,}[-_])?(?:\d{10,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-z]{10,})(?:[-_][0-9a-z]+)*$/;
function canonical(v, ids = new Map()) {
 const id = s => { if (!ids.has(s)) ids.set(s, `#${ids.size + 1}`); return ids.get(s); };
 const walk = (x, key) => {
  if (Array.isArray(x)) return x.map(y => walk(y, key));
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).map(k => [k, MACHINE_KEYS.has(k) ? '-' : (TIME_KEYS.has(k) || /Ms$/.test(k)) && typeof x[k] === 'number' ? 0 : walk(x[k], k)]));
  if (typeof x === 'string' && /(^|[a-z])(id|Id|ids|Ids)$/.test(key || '') && RANDOM_ID.test(x) && /\d/.test(x)) return id(x);
  if (typeof x === 'string' && /^blob:/.test(x)) return 'blob:';
  return x;
 };
 return walk(v);
}

function sortMessages(list) {
 const key = m => `${m.worker}\u0000${m.dir === 'in' ? 0 : 1}\u0000${JSON.stringify(canonical(m.data))}`;
 return list.map(m => [key(m), m]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, m]) => m);
}

function deckFix(project) {
 const map = {}; (project.contract?.decks || []).forEach((d, i) => { if (/^D\d{12,}\.\d+$/.test(d.id)) map[d.id] = `DECK${i + 1}`; });
 const keys = Object.keys(map); if (!keys.length) return { fix: v => v, key: k => k };
 const re = new RegExp(keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
 return { fix: v => JSON.parse(JSON.stringify(v).replace(re, m => map[m])), key: k => k.replace(re, m => map[m]) };
}

function planFiles(run) {
 const { fix, key } = deckFix(run.project), out = {}, index = { order: [], plans: {} };
 for (const k of run.phg.order) {
  const e = run.phg.plans[k], name = key(k); if (!e) continue;
  // PHG D runs several routing workers at once and their answers come back in any order: each plan's messages are put
  // in a fixed order (worker, in before out, the message's own canonical text) - which answer belongs to which request
  // is not kept
  for (const part of [e.loaded, e.auto]) if (part?.workers) part.workers = sortMessages(part.workers);
  const g = canonical(fix(e));
  out[name] = g; index.order.push(name);
  const w = dir => (e.auto?.workers || []).filter(m => m.dir === dir).reduce((o, m) => (o[m.worker] = (o[m.worker] || 0) + 1, o), {});
  const r = e.auto?.result || {};
  index.plans[name] = { entities: e.loaded?.state?.entities?.length ?? 0, forbiddenZones: e.loaded?.state?.settings?.routingForbiddenZones?.length ?? 0,
   rus: r.rus, flowCmh: r.flowCmh, ducts: r.ducts, lengthM: r.lengthM, indexPa: r.indexPa, ductTypes: r.ductTypes, candidate: r.candidate, candidates: r.candidates, pick: r.pick, unconnected: r.unconnected, zonesRelaxed: r.zonesRelaxed,
   previews: (e.auto?.previews || []).map(p => ({ zones: p.zones.length, candidates: p.preview?.candidates?.length ?? 0, reason: p.preview?.reason || null })),
   workersIn: w('in'), workersOut: w('out'), pressurePaths: e.auto?.pressure?.paths?.length ?? null };
 }
 return { files: out, index: canonical(index) };
}

const gz = v => zlib.gzipSync(Buffer.from(JSON.stringify(v)), { level: 9 });
const ungz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
const text = v => JSON.stringify(v, null, 1) + '\n';

async function main() {
 const args = process.argv.slice(2), check = args.includes('--check'), out = (args.find(a => a.startsWith('--out=')) || '').slice(6) || FIXTURES;
 const { SHIPS, runShip } = require('./golden-run.cjs'), ships = args.filter(a => !a.startsWith('--')); if (!ships.length) ships.push(...SHIPS);
 let bad = 0;
 for (const ship of ships) {
  const t = Date.now(), run = await runShip(ship, { phg: true, log: m => console.log('  ' + m) });
  if (run.errors.length) { console.error(`${ship}: 페이지 오류 ${run.errors.length}`, run.errors.slice(0, 5)); bad++; }
  const { files, index } = planFiles(run), dir = path.join(out, ship);
  if (check) {
   const diffs = [];
   let want; try { want = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch { want = null; }
   if (!want) diffs.push('index.json 없음'); else for (const d of diff(want, index)) diffs.push('index' + d);
   for (const [k, v] of Object.entries(files)) { let w; try { w = ungz(path.join(dir, safe(k) + '.json.gz')); } catch { diffs.push(`${k}: 기준값 파일 없음`); continue; } for (const d of diff(w, v)) diffs.push(k + d); }
   console.log(`${ship}: ${diffs.length ? 'DIFF' : 'SAME'} (${Math.round((Date.now() - t) / 1000)} s)`); for (const d of diffs.slice(0, 40)) console.log('   ' + d);
   if (diffs.length) bad++;
  } else {
   fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
   for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, safe(k) + '.json.gz'), gz(v));
   fs.writeFileSync(path.join(dir, 'index.json'), text(index));
   fs.writeFileSync(path.join(dir, 'meta.json'), text({ ship, tool: 'tools/phg-golden.cjs', made: new Date().toISOString(), browser: run.browser, node: process.version, pageErrors: run.errors, timing: run.timing }));
   console.log(`${ship}: ${path.relative(ROOT, dir)} · ${Object.keys(files).length} plans (${Math.round((Date.now() - t) / 1000)} s)`);
  }
 }
 if (bad) process.exit(1);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { FIXTURES, canonical, sortMessages, planFiles, ungz, safe };
