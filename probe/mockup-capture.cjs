// Screenshots of docs/ui/mockup.html for each step (and one room selected) -> docs/ui/mockup-*.png
'use strict';
const path = require('path');
const { launch } = require('../tools/browser.cjs');
(async () => {
 const b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
 await p.goto(require('url').pathToFileURL(path.join(__dirname, '..', 'docs', 'ui', 'mockup.html')).href);
 const shot = n => p.screenshot({ path: path.join(__dirname, '..', 'docs', 'ui', n) });
 const steps = ['room', 'load', 'air', 'duct', 'review'];
 for (const [i, s] of steps.entries()) {
  await p.click(`.step[data-step=${s}]`); await p.waitForTimeout(150); await shot(`mockup-${i + 1}-${s}.png`);
 }
 await p.click('.step[data-step=duct]'); await p.click('#tree .room >> nth=2'); await p.waitForTimeout(150); await shot('mockup-6-duct-room.png');
 await p.click('.step[data-step=load]'); await p.waitForTimeout(150); await shot('mockup-7-load-room.png');
 await p.setViewportSize({ width: 1280, height: 800 }); await p.click('.step[data-step=duct]'); await p.waitForTimeout(150); await shot('mockup-8-duct-1280.png');
 const overflow = await p.evaluate(() => { const r = document.getElementById('ribbon'); return { ribbon: r.scrollWidth - r.clientWidth, steps: document.getElementById('steps').getBoundingClientRect().width }; });
 console.log(JSON.stringify({ errors, overflow })); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
