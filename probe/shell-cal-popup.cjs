// The shell's 격실 부하 command opens BOX CAL's room load table (a popup window) with content.
'use strict';
const path = require('path');
const { launch } = require('../tools/browser.cjs'), { start } = require('../tools/serve.cjs');
(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 await p.goto(s.url + '/app/'); await p.waitForFunction(() => window.HVACGrid?.box.loading, null, { timeout: 30000 }); await idle();
 await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
 await p.locator('#ribbon .cmd', { hasText: 'S5 예제' }).click(); await p.waitForFunction(() => HVACGrid.box.hasDrawing(), null, { timeout: 180000 }); await p.waitForTimeout(800);
 await p.click('.step[data-step=load]'); await idle();
 const popup = p.waitForEvent('popup', { timeout: 60000 });
 await p.locator('#ribbon .cmd', { hasText: '격실 부하' }).click();
 const w = await popup; await w.waitForLoadState(); await w.waitForTimeout(1500);
 const text = await w.evaluate(() => document.body.innerText.slice(0, 200).replace(/\s+/g, ' '));
 await w.setViewportSize({ width: 1400, height: 800 }); await w.screenshot({ path: path.join(__dirname, '..', 'docs', 'ui', 'shell-2-load-table.png') });
 console.log(JSON.stringify({ popupText: text, errors })); await b.close(); await s.close();
})().catch(e => { console.error(e); process.exit(1); });
