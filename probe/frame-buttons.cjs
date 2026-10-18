// Native command ids of both vendor apps (the shell ribbon calls them inside the frames).
'use strict';
const { launch } = require('../tools/browser.cjs'), { start } = require('../tools/serve.cjs');
(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } });
 const list = sel => [...document.querySelectorAll(sel)].map(e => [e.id || '-', (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14), (e.title || e.getAttribute('aria-label') || '').slice(0, 40)].join(' | '));
 await p.goto(s.url + '/vendor/BOX_CAL_Enhance.html'); await p.waitForFunction(() => window.CAD_APP && document.querySelector('#s5ExampleBtn'), null, { timeout: 120000 });
 console.log('BOX header'); console.log((await p.evaluate(list, 'header.top button, header.top input[type=file], header.top select')).join('\n'));
 console.log('BOX left'); console.log((await p.evaluate(list, 'aside.side:not(.right) button')).join('\n'));
 await p.goto(s.url + '/vendor/DuctConcept_PHG_D.html'); await p.waitForFunction(() => window.DuctConceptRouting?.ready, null, { timeout: 120000 });
 console.log('PHG header'); console.log((await p.evaluate(list, 'header.topbar button, header.topbar input[type=file]')).join('\n'));
 console.log('PHG right'); console.log((await p.evaluate(list, '#phg-right-commands button')).join('\n'));
 console.log('PHG autosave', await p.evaluate(() => Object.keys(localStorage)));
 await b.close(); await s.close();
})().catch(e => { console.error(e); process.exit(1); });
