// H1 entry point, kept for its command line: contract -> PHG D projects per deck and system (+ AUTO). Since H2 the work
// is done by tools/hvac-run.cjs, which drives the HVAC Grid shell headless (the same code path as the ribbon) and also
// writes the project file, XLSX, DXF and the report.
//   node tools/phg-generate.cjs samples/s5.contract.json out/s5 [--auto]
// Without --auto the plans are still sent and run (PHG D sizing needs the AUTO routes); --auto adds the screenshots.
'use strict';
const { run, writeOutputs } = require('./hvac-run.cjs');
(async () => {
 const args = process.argv.slice(2), [input = 'samples/s5.contract.json', outDir = 'out/s5'] = args.filter(a => !a.startsWith('--'));
 const { project, errors } = await run(input, outDir, { shots: args.includes('--auto') });
 const { summary } = writeOutputs(project, outDir);
 console.log(JSON.stringify({ out: outDir, autoDone: `${summary.autoDone}/${summary.plans}`, pageErrors: errors.length }));
 if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
