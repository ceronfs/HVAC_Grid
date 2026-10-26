// Ver 2.0 whole pipeline without a person or a browser (V2-3): a 1.x design data / project file or a 2.0 model →
// airflow, plans, every network by the 2.0 duct engine in worker threads, the review and the outputs - all 2.0 code
// (lib/model, lib/engines, lib/duct; no 1.x lib, D7).
//   node tools/hvac-run2.cjs <input.json> <outDir> [--solas=<settings.json>] [--threads=n] [--keep-v1] [--strict]
//   --solas: { "lowestBelow", "ship", "method", "sprinkler", "rooms": { "<room no>": "<space>" } } or a flat { no: space }
//   --keep-v1: keep the networks of a 1.x project that fit today's plans (default: the 2.0 engine makes every one)
// outDir: model.hg2.json, report.xlsx, report.html, integrated.dxf, fire-plan.dxf, summary.json. Exit code 1 when a
// plan has no network or an RU is not joined; 3 with --strict when the review has a fail.
'use strict';
const fs = require('fs'), path = require('path');
const V = require('../lib/io/v1.cjs'), S = require('../lib/model/schema.cjs'), C = require('../lib/model/commands.cjs'), RUN = require('../lib/model/run.cjs'), PR = require('../lib/engines/producers.cjs');
const RP = require('../lib/engines/output/report.cjs'), XL = require('../lib/engines/output/xlsx.cjs'), DX = require('../lib/engines/output/dxf.cjs'), DG = require('../lib/engines/output/diagram.cjs'), FP = require('../lib/engines/output/fireplan.cjs');

// SOLAS settings and room spaces by room number, as a command on the model
function solasCmd(m, solas) {
 const flat = !('rooms' in solas) && !Object.keys(solas).some(k => ['ship', 'method', 'sprinkler', 'lowestBelow'].includes(k));
 const byNo = Object.fromEntries(m.rooms.map(r => [r.no, r.id])), rooms = { ...(m.solas.rooms || {}) };
 for (const [no, space] of Object.entries(flat ? solas : solas.rooms || {})) if (byNo[no]) rooms[byNo[no]] = { space };
 const settings = flat ? {} : Object.fromEntries(Object.entries(solas).filter(([k]) => k !== 'rooms'));
 return { label: 'SOLAS 설정', ops: [{ path: ['solas'], value: { ...m.solas, ...settings, rooms } }] };
}

async function run(input, outDir, { solas = null, threads = undefined, keepV1 = false, log = console.log } = {}) {
 const t0 = Date.now(), data = typeof input === 'string' ? JSON.parse(fs.readFileSync(input, 'utf8')) : input;
 let { model: m, notes } = data.schema === S.SCHEMA ? S.clean(data) : V.fromV1(data);
 if (solas) m = C.apply(m, solasCmd(m, solas)).model;
 m = await RUN.recompute(m, { upTo: 'plans' });
 if (keepV1) m = RUN.adoptV1(m);
 const { createPool } = require('../lib/duct/pool.cjs'), pool = createPool(threads ? { threads } : {});
 try { m = await RUN.recompute(m, { pool, onStep: s => log(`  ${s.id}${s.count > 1 ? ' ' + s.count : ''}`) }); } finally { await pool.close(); }
 const seconds = Math.round((Date.now() - t0) / 100) / 10;
 return { model: m, notes, seconds, threads: pool.threads };
}

function writeOutputs(m, outDir) {
 fs.mkdirSync(outDir, { recursive: true });
 const rv = PR.attach(m), w = (f, d) => fs.writeFileSync(path.join(outDir, f), d);
 w('model.hg2.json', JSON.stringify({ ...m, savedAt: new Date().toISOString() }));
 w('report.xlsx', XL.xlsx(RP.sheets(m, rv)));
 w('report.html', RP.html(m, rv));
 w('integrated.dxf', DX.integratedDxf(m, { diagrams: DG.systemDiagrams(m, rv), plans: rv.plans, nets: rv.nets, boundaries: rv.solas.boundaries, penetrations: rv.solas.penetrations, risers: rv.risers }));
 w('fire-plan.dxf', FP.toDxf(FP.model(m, rv.solas)));
 const unconnected = Object.values(m.networks).reduce((t, n) => t + (n.result?.unconnected || 0), 0);
 const summary = { plans: m.plans.length, autoDone: rv.done, unconnected, count: rv.count, checks: rv.checks, systems: rv.systems.map(s => ({ system: s.systemKey, kind: s.kind, fanCmh: s.fanCmh, espPa: s.indexPa, fanPa: s.fanPa })),
  solas: { boundaries: rv.solas.summary.boundaries, penetrations: rv.solas.summary.penetrations, fireDampers: rv.solas.summary.fireDampers } };
 w('summary.json', JSON.stringify(summary, null, 1));
 return { summary };
}

if (require.main === module) (async () => {
 const args = process.argv.slice(2), [input, outDir = 'out/run2'] = args.filter(a => !a.startsWith('--')), opt = k => args.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
 if (!input) { console.error('사용법: node tools/hvac-run2.cjs <1.x json | 2.0 model> <outDir> [--solas=<settings.json>] [--threads=n] [--keep-v1] [--strict]'); process.exit(2); }
 const solas = opt('solas') ? JSON.parse(fs.readFileSync(opt('solas'), 'utf8')) : null;
 const { model, notes, seconds, threads } = await run(input, outDir, { solas, threads: opt('threads') ? +opt('threads') : undefined, keepV1: args.includes('--keep-v1') });
 const { summary } = writeOutputs(model, outDir);
 console.log(JSON.stringify({ out: outDir, seconds, threads, autoDone: `${summary.autoDone}/${summary.plans}`, unconnected: summary.unconnected, count: summary.count, notes, notOk: summary.checks.filter(c => c.level !== 'ok').map(c => `${c.level}: ${c.text}`) }, null, 1));
 if (summary.autoDone < summary.plans || summary.unconnected) process.exit(1);
 if (args.includes('--strict') && summary.count.fail > 0) { console.error(`--strict: 검토 실패 ${summary.count.fail}건`); process.exit(3); }
})().catch(e => { console.error(e); process.exit(1); });

module.exports = { run, writeOutputs, solasCmd };
