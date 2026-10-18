// Where the CAL panel tabs (RL, DC, LR ...) live, and what clicking LR opens.
'use strict';
const path = require('path');
const { launch } = require('../tools/browser.cjs'), { start } = require('../tools/serve.cjs');
(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } });
 p.on('dialog', d => d.accept());
 await p.goto(s.url + '/vendor/BOX_CAL_Enhance.html'); await p.waitForFunction(() => window.CAD_APP && document.querySelector('#s5ExampleBtn'), null, { timeout: 120000 });
 await p.click('#s5ExampleBtn'); await p.waitForFunction(() => CAD_APP.st.entities.length > 0, null, { timeout: 120000 }); await p.waitForTimeout(800);
 await p.click('#calEnhanceBtn'); await p.waitForFunction(() => /^현재 격실/.test(document.querySelector('#calEnhancePanel [role=status]')?.textContent || ''), null, { timeout: 120000 });
 const fr = p.frameLocator('#calEnhancePanel iframe');
 const before = p.context().pages().length; await fr.locator('#roomLoadResultBtn').click(); await p.waitForTimeout(1500);
 console.log('pages', before, '->', p.context().pages().length, p.context().pages().map(x => x.url().slice(0, 80)));
 console.log(await p.evaluate(() => {
  const d = document.querySelector('#calEnhancePanel iframe').contentDocument;
  const open = [...d.querySelectorAll('dialog')].filter(x => x.open).map(x => x.id + ' ' + Math.round(x.getBoundingClientRect().width) + 'x' + Math.round(x.getBoundingClientRect().height));
  const outer = [...document.querySelectorAll('dialog')].filter(x => x.open).map(x => x.id);
  const big = [...d.body.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 600 && r.height > 300 && getComputedStyle(e).display !== 'none'; }).slice(0, 8).map(e => e.tagName + '#' + e.id + '.' + String(e.className).slice(0, 30));
  return JSON.stringify({ open, outer, big, dialogs: d.querySelectorAll('dialog').length });
 }));
 await p.screenshot({ path: path.join(__dirname, '..', 'out', 'cal-lr.png') });
 await b.close(); await s.close();
})().catch(e => { console.error(e); process.exit(1); });
