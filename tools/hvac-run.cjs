// Whole pipeline without a person: the HVAC Grid shell runs headless over the real vendor apps (the same code path as
// the ribbon), opens a contract or a project, sends every deck and system (supply, exhaust, return) to PHG D with AUTO,
// and writes the project file and the outputs.
//   node tools/hvac-run.cjs <contract.json | project.json> <outDir> [--shots] [--solas=<room spaces.json>]
// outDir: project.json, report.xlsx, report.html, integrated.dxf, summary.json, phg/<deck__system>.phg.json, shots/*.png
// --solas: a JSON map { "<room no>": "<SOLAS space>" } applied before the run (rooms the dictionary does not know).
'use strict';
const fs = require('fs'), path = require('path');
const { launch } = require('./browser.cjs'), { start } = require('./serve.cjs');
const PJ = require('../lib/project.cjs'), RP = require('../lib/report.cjs'), XL = require('../lib/xlsx.cjs'), DX = require('../lib/dxf-out.cjs');

async function run(input, outDir, { shots = false, solas = null, log = console.log } = {}) {
 const data = JSON.parse(fs.readFileSync(input, 'utf8')), { project: given } = PJ.read(data);
 if (solas) { const byNo = Object.fromEntries(given.contract.rooms.map(r => [r.no, r.id])), rooms = { ...(given.contract.solas?.rooms || {}) };
  for (const [no, space] of Object.entries(solas)) if (byNo[no]) rooms[byNo[no]] = { space }; given.contract.solas = { ...(given.contract.solas || {}), rooms }; }
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
   log(`${i + 1}/${keys.length} ${key}: ${r?.auto ? `RU ${r.rus} · ${r.flowCmh} CMH · 덕트 ${r.ducts} · ${r.lengthM} m · ${r.indexPa} Pa · ${r.seconds}s` : 'FAIL ' + msg} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
   if (shots && r?.auto) await p.locator('#center').screenshot({ path: path.join(outDir, 'shots', key + '.png') });
  }
  const project = JSON.parse(await p.evaluate(() => HVACGrid.projectJson()));
  return { project, errors, seconds: Math.round((Date.now() - t0) / 1000) };
 } finally { await b.close(); await s.close(); }
}

function writeOutputs(project, outDir) {
 const a = PJ.analyze(project);
 fs.writeFileSync(path.join(outDir, 'project.json'), JSON.stringify(project));
 for (const [k, text] of Object.entries(project.projects)) fs.writeFileSync(path.join(outDir, 'phg', k + '.phg.json'), text);
 fs.writeFileSync(path.join(outDir, 'report.xlsx'), XL.xlsx(RP.sheets(project, a)));
 fs.writeFileSync(path.join(outDir, 'report.html'), RP.html(project, a));
 fs.writeFileSync(path.join(outDir, 'integrated.dxf'), DX.integratedDxf(project.contract, { plans: a.plans, geometry: project.geometry, boundaries: a.solas.boundaries, penetrations: a.solas.penetrations, risers: a.risers }));
 const summary = { plans: a.total, autoDone: a.done, checks: a.checks, systems: a.systems.map(s => ({ system: s.systemKey, kind: s.kind, unitDeck: s.unitDeckId, fanCmh: s.fanCmh, decks: s.decks.length, risers: s.risers.length, riserLengthM: s.riserLengthM, indexPa: s.indexPa, indexDeck: s.indexDeckId })),
  solas: { ...a.solas.summary, warnings: a.solas.warnings.length }, air: a.air.filter(x => x.level === 'warn').map(x => x.text) };
 fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
 return { analysis: a, summary };
}

if (require.main === module) (async () => {
 const args = process.argv.slice(2), [input, outDir = 'out/run'] = args.filter(a => !a.startsWith('--'));
 if (!input) { console.error('사용법: node tools/hvac-run.cjs <contract.json|project.json> <outDir> [--shots] [--solas=<map.json>]'); process.exit(2); }
 const solasArg = args.find(a => a.startsWith('--solas=')), solas = solasArg ? JSON.parse(fs.readFileSync(solasArg.slice(8), 'utf8')) : null;
 const { project, errors, seconds } = await run(input, outDir, { shots: args.includes('--shots'), solas });
 const { summary } = writeOutputs(project, outDir);
 console.log(JSON.stringify({ out: outDir, seconds, autoDone: `${summary.autoDone}/${summary.plans}`, checks: summary.checks.filter(c => !c.ok).map(c => c.text), penetrations: summary.solas.penetrations, fireDampers: summary.solas.fireDampers, pageErrors: errors.length }));
 if (errors.length) { console.error(errors.slice(0, 10).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });

module.exports = { run, writeOutputs };
