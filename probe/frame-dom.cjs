// Which elements make up the native command bars and docks of the vendor apps (to hide or restyle them from the shell).
'use strict';
const { launch } = require('../tools/browser.cjs'), { start } = require('../tools/serve.cjs');
(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message));
 const outline = () => {
  const desc = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const r = e => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)].join(','); };
  const walk = (e, depth) => depth > 3 ? [] : [...e.children].filter(c => { const q = c.getBoundingClientRect(); return q.width > 30 && q.height > 10; })
   .flatMap(c => [' '.repeat(depth) + desc(c) + ' [' + r(c) + ']', ...walk(c, depth + 1)]);
  return walk(document.body, 0).slice(0, 80);
 };
 await p.goto(s.url + '/vendor/BOX_CAL_Enhance.html'); await p.waitForFunction(() => window.CAD_APP && document.querySelector('#s5ExampleBtn'), null, { timeout: 120000 });
 console.log('BOX'); console.log((await p.evaluate(outline)).join('\n'));
 console.log('BOX ancestors', await p.evaluate(() => ['newBtn', 'calEnhanceBtn', 's5ExampleBtn', 'fitBtn'].map(id => { let e = document.getElementById(id), out = []; while (e && e !== document.body) { out.push(e.tagName + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '')); e = e.parentElement; } return id + ': ' + out.join(' < '); })));
 await p.goto(s.url + '/vendor/DuctConcept_PHG_D.html'); await p.waitForFunction(() => window.DuctConceptRouting?.ready, null, { timeout: 120000 });
 console.log('PHG'); console.log((await p.evaluate(outline)).join('\n'));
 console.log(JSON.stringify({ errors })); await b.close(); await s.close();
})().catch(e => { console.error(e); process.exit(1); });
