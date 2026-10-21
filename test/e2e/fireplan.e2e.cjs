// End-to-end: ⑤ 방화 등급도 (fire-rating plan) in the app - T3 opened, the tab shows the deck with its ratings written on
// the walls and the rooms' categories, other decks by the buttons, C ratings on request; a screenshot for a look.
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a), H = (f, a) => p.evaluate(f, a);
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 const view = () => H(() => { const svg = document.querySelector('#report svg.fireplan');
  return svg ? { deck: svg.dataset.deck, labels: svg.querySelectorAll('text[font-weight="700"]').length, cats: [...svg.querySelectorAll('text')].filter(t => /^\(\d+\) /.test(t.textContent)).length,
   legend: !!document.querySelector('#report .fp-cats'), pressed: document.querySelector('#report [data-fpdeck][aria-pressed="true"]')?.dataset.fpdeck } : null; });
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  await H(() => HVACGrid.openSample('t3')); await idle();
  await p.click('.step[data-step=review]'); await idle();
  await p.locator('#report .tabs button', { hasText: '방화 등급도' }).click(); await idle();
  const v1 = await view(); log('tab', JSON.stringify(v1));
  assert.ok(v1 && v1.labels > 5 && v1.cats > 5 && v1.legend, 'ratings on the walls, categories in the rooms, the legend');
  // another deck
  await p.locator('#report [data-fpdeck="D2"]').click(); await idle();
  const v2 = await view(); assert.equal(v2.deck, 'D2'); assert.equal(v2.pressed, 'D2');
  await p.screenshot({ path: path.join(OUT, 'fireplan-D2.png') });
  // C ratings written too
  await p.locator('#fpShowC').check(); await idle();
  const v3 = await view(); assert.ok(v3.labels > v2.labels, `C labels: ${v2.labels} -> ${v3.labels}`); log('C on', v2.labels, '->', v3.labels);
  log('page errors', errors.length, errors.slice(0, 3)); assert.equal(errors.length, 0);
  log('E2E FIREPLAN PASS');
 } catch (e) { console.error('E2E FIREPLAN FAIL', e); process.exitCode = 1; }
 finally { await b.close(); await s.close(); }
})();
