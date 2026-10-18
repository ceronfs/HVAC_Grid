// BOX CAL -> HVAC Grid contract v0. Opens BOX CAL Enhance headless, loads a project (a BOX JSON file, or the built-in
// S5 example with "s5"), opens the CAL frame, reads CAL_ENHANCE.report() and the deck stack, and writes the contract.
//   node tools/box-extract.cjs s5 samples/s5.contract.json
//   node tools/box-extract.cjs <project.json> <out.json>
// BOX_HTML overrides the BOX file (default: vendor/BOX_CAL_Enhance.html, the frozen copy of the latest CAL Enhance).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { buildContract, validate } = require('../lib/contract.cjs');
const { launch, vendor } = require('./browser.cjs');
const BOX_HTML = process.env.BOX_HTML || vendor('BOX_CAL_Enhance.html');   // frozen copy; the original is read only

async function extract(input) {
 const b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 try {
  await p.goto('file:///' + BOX_HTML.replace(/\\/g, '/'));
  await p.waitForFunction(() => window.CAD_APP && document.querySelector('#s5ExampleBtn'), null, { timeout: 120000 });
  if (input === 's5') await p.click('#s5ExampleBtn');
  else await p.locator('#jsonFile').setInputFiles(path.resolve(input));
  await p.waitForFunction(() => CAD_APP.st.entities.length > 0 && CAD_APP.st.decks.length > 0, null, { timeout: 180000 });
  await p.waitForTimeout(800);
  await p.click('#calEnhanceBtn');
  await p.waitForFunction(() => /^현재 격실/.test(document.querySelector('#calEnhancePanel [role=status]')?.textContent || ''), null, { timeout: 180000 });
  const raw = await p.evaluate(() => {
   const C = document.querySelector('#calEnhancePanel iframe').contentWindow.CAL_ENHANCE, rep = C.report();
   const keep = ['id', 'no', 'name', 'deck', 'deckId', 'isoClass', 'polygon', 'holes', 'floor', 'volume', 'ceilingHeight', 'sup', 'exh', 'ret',
    'coolingSensibleW', 'coolingLatentW', 'coolingW', 'heatingW', 'minimumFreshAirCmh', 'minimumAch', 'ventilationAirCmh', 'calculationComplete', 'calculationStatus'];
   return { decks: CAD_APP.stack.decks, conditions: rep.conditions, rooms: rep.loads.map(x => Object.fromEntries(keep.map(k => [k, x[k]]))) };
  });
  if (errors.length) raw.warnings = errors.slice(0, 20);
  return raw;
 } finally { await b.close(); }
}

(async () => {
 const [input = 's5', out = 'samples/s5.contract.json'] = process.argv.slice(2);
 const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
 const raw = await extract(input);
 raw.source = { app: 'BOX CAL Enhance', file: path.relative(path.join(__dirname, '..'), BOX_HTML).split(path.sep).join('/'), sha256: sha(BOX_HTML), project: input === 's5' ? 'built-in S5 example' : path.basename(input), path: input === 's5' ? null : path.relative(process.cwd(), path.resolve(input)).split(path.sep).join('/') };
 const contract = buildContract(raw), problems = validate(contract);
 fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
 fs.writeFileSync(out, JSON.stringify(contract, null, 1));
 const t = k => contract.systems.filter(s => s.kind === k).length;
 console.log(JSON.stringify({ out, decks: contract.decks.length, rooms: contract.rooms.length, systems: { supply: t('supply'), exhaust: t('exhaust'), return: t('return') },
  supplyCmh: contract.systems.filter(s => s.kind === 'supply').reduce((a, s) => a + s.designCmh, 0), problems: problems.length, warnings: raw.warnings?.length || 0 }));
 if (problems.length) { console.error(problems.slice(0, 20).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
