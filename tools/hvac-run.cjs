// Whole pipeline without a person: the HVAC Grid shell runs headless over the real vendor apps (the same code path as
// the ribbon), opens a contract or a project, sends every deck and system (supply, exhaust, return) to PHG D with AUTO,
// and writes the project file and the outputs.
//   node tools/hvac-run.cjs <contract.json | project.json> <outDir> [--shots] [--solas=<settings.json>] [--strict]
// outDir: project.json, report.xlsx, report.html, integrated.dxf, fire-plan.dxf (방화 등급도), summary.json, phg/<deck__system>.phg.json, shots/*.png
// --solas: { "lowestBelow": "<space>", "ship": "CARG", "method": "IC", "sprinkler": false, "rooms": { "<room no>": "<space>" } }
//          (a flat { "<room no>": "<space>" } map works too). Exit code 1 when a plan did not finish AUTO or the page
//          reported an error. --strict: also when the review has a fail (summary.count.fail) - for automation that
//          needs a passing review, not only a finished run (review 2026-10-21 F11). A pass is not an approval.
'use strict';
const fs = require('fs'), path = require('path');
const { launch } = require('./browser.cjs'), { start } = require('./serve.cjs');
const K = require('../lib/contract.cjs'), PJ = require('../lib/project.cjs'), RP = require('../lib/report.cjs'), XL = require('../lib/xlsx.cjs'), DX = require('../lib/dxf-out.cjs'), U = require('../lib/util.cjs');

// SOLAS settings and room spaces (by room number) into the contract
function applySolas(contract, solas) {
 if (!solas) return contract;
 const flat = !('rooms' in solas) && !Object.keys(solas).some(k => ['ship', 'method', 'sprinkler', 'lowestBelow'].includes(k));
 const byNo = Object.fromEntries(contract.rooms.map(r => [r.no, r.id])), rooms = { ...(contract.solas?.rooms || {}) };
 for (const [no, space] of Object.entries(flat ? solas : solas.rooms || {})) if (byNo[no]) rooms[byNo[no]] = { space };
 const settings = flat ? {} : Object.fromEntries(Object.entries(solas).filter(([k]) => k !== 'rooms'));
 // the zone balance uses the SOLAS spaces (transfer-air sources): the airflow is worked out again with them
 return K.applyRules({ ...contract, solas: { ...(contract.solas || {}), ...settings, rooms } });
}

async function run(input, outDir, { shots = false, solas = null, log = console.log } = {}) {
 const data = JSON.parse(fs.readFileSync(input, 'utf8')), { project: given } = PJ.read(data);
 given.contract = applySolas(given.contract, solas);
 fs.mkdirSync(path.join(outDir, 'phg'), { recursive: true }); if (shots) fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 600000 });
 try {
  await p.goto(s.url + '/app/'); await p.waitForFunction(() => window.HVACGrid, null, { timeout: 60000 }); await idle();
  await p.evaluate(pr => { const H = HVACGrid; H.setContract(pr.contract); Object.assign(H.S, { projects: pr.projects, results: pr.results, geometry: pr.geometry }); H.render(); }, given);
  const keys = await p.evaluate(() => HVACGrid.plans().map(x => x.key));
  log(`${keys.length} plans`);
  await p.evaluate(() => HVACGrid.go('duct')); await idle();
  for (const [i, key] of keys.entries()) {
   const t = Date.now();
   await p.evaluate(k => HVACGrid.runAll([k], { onlyNeeded: true }), key); await idle();
   const r = await p.evaluate(k => HVACGrid.result(k), key), msg = await p.evaluate(() => HVACGrid.S.msgErr ? HVACGrid.S.msg : '');
   log(`${i + 1}/${keys.length} ${key}: ${r?.auto && !r.stale ? `RU ${r.rus} · ${r.flowCmh} CMH · 덕트 ${r.ducts} · ${r.lengthM} m · ${r.indexPa} Pa · ${r.seconds}s${r.zonesRelaxed ? ` · 금지 영역 해제(${{ all: '전부', rooms: '제한 구역', outside: '선체 밖' }[r.zonesRelaxed]})` : ''}` : 'FAIL ' + msg} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
   if (shots && r?.auto) await p.locator('#center').screenshot({ path: path.join(outDir, 'shots', U.safeName(key) + '.png') });
  }
  const project = JSON.parse(await p.evaluate(() => HVACGrid.projectJson()));
  return { project, errors, seconds: Math.round((Date.now() - t0) / 1000) };
 } finally { await b.close(); await s.close(); }
}

function writeOutputs(project, outDir) {
 const a = PJ.analyze(project);
 fs.writeFileSync(path.join(outDir, 'project.json'), JSON.stringify(project));
 // file names from system names (free text from BOX): made safe, and checked to stay inside outDir
 const phgDir = path.resolve(outDir, 'phg');
 for (const [k, text] of Object.entries(project.projects)) { const f = path.resolve(phgDir, U.safeName(k) + '.phg.json'); if (path.dirname(f) === phgDir) fs.writeFileSync(f, text); }
 fs.writeFileSync(path.join(outDir, 'report.xlsx'), XL.xlsx(RP.sheets(project, a)));
 fs.writeFileSync(path.join(outDir, 'report.html'), RP.html(project, a));
 fs.writeFileSync(path.join(outDir, 'fire-plan.dxf'), require('../lib/fire-plan.cjs').toDxf(require('../lib/fire-plan.cjs').model(project.contract, a.solas)));
 fs.writeFileSync(path.join(outDir, 'integrated.dxf'), DX.integratedDxf(project.contract, { diagrams: require('../lib/diagram.cjs').systemDiagrams(project.contract, a), plans: a.plans, geometry: project.geometry, boundaries: a.solas.boundaries, penetrations: a.solas.penetrations, risers: a.risers }));
 const summary = { plans: a.total, autoDone: a.done, stale: a.stale, count: a.count, checks: a.checks, zones: a.zones.map(z => ({ zone: z.supplySystemId, sa: z.saCmh, ea: z.eaCmh, oa: z.oaCmh, ra: z.raCmh, ok: z.ok })),
  systems: a.systems.map(s => ({ system: s.systemKey, kind: s.kind, unitDeck: s.unitDeckId, fanCmh: s.fanCmh, decks: s.decks.length, risers: s.risers.length, riserLengthM: s.riserLengthM, espPa: s.indexPa, fanPa: s.fanPa, indexDeck: s.indexDeckId })),
  solas: { ...a.solas.summary, warnings: a.solas.warnings.length }, open: RP.openItems(project, a).map(([lv, area, text]) => `${lv} · ${area} · ${text}`) };
 fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
 return { analysis: a, summary };
}

if (require.main === module) (async () => {
 const args = process.argv.slice(2), [input, outDir = 'out/run'] = args.filter(a => !a.startsWith('--'));
 if (!input) { console.error('사용법: node tools/hvac-run.cjs <contract.json|project.json> <outDir> [--shots] [--solas=<settings.json>] [--strict]'); process.exit(2); }
 const solasArg = args.find(a => a.startsWith('--solas=')), solas = solasArg ? JSON.parse(fs.readFileSync(solasArg.slice(8), 'utf8')) : null;
 const { project, errors, seconds } = await run(input, outDir, { shots: args.includes('--shots'), solas });
 const { summary } = writeOutputs(project, outDir);
 console.log(JSON.stringify({ out: outDir, seconds, autoDone: `${summary.autoDone}/${summary.plans}`, count: summary.count, notOk: summary.checks.filter(c => c.level !== 'ok').map(c => `${c.level}: ${c.text}`), penetrations: summary.solas.penetrations, fireDampers: summary.solas.fireDampers, pageErrors: errors.length }));
 if (errors.length) console.error(errors.slice(0, 10).join('\n'));
 if (errors.length || summary.autoDone < summary.plans) process.exit(1);
 if (args.includes('--strict') && summary.count.fail > 0) { console.error(`--strict: 검토 실패 ${summary.count.fail}건`); process.exit(3); }
})().catch(e => { console.error(e); process.exit(1); });

module.exports = { run, writeOutputs, applySolas };
