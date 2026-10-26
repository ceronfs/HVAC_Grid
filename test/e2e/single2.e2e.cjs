// HVAC Grid 2.0 one-file copy (tools/make-single2.cjs) opened by double-click (file://): no server and no request off the
// file - T3, AUTO in Web Workers started from blobs, the XLSX.
//   node test/e2e/single2.e2e.cjs
'use strict';
const R = require("path").join(__dirname, "..", "..") + "/", { launch } = require(R + "tools/browser.cjs");
(async () => {
 const b = await launch(), p = await b.newPage({ viewport: { width: 1500, height: 900 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
 p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) errors.push('request ' + r.url()); });
 try {
  const out = require(R + 'tools/make-single2.cjs').build(require('path').join(require('os').tmpdir(), 'HVAC_Grid_2.0.e2e.html')).out;
  await p.goto('file://' + out); await p.waitForFunction(() => window.HG2, null, { timeout: 60000 });
  await p.click(`button[data-act="sample"][data-arg='"t3"']`); await p.waitForFunction(() => HG2.model()?.rooms.length === 79 && !HG2.state.busy);
  await p.click('.step[data-step="4"]'); const t = Date.now(); await p.click('button[data-act="auto"]');
  await p.waitForFunction(() => HG2.model().review?.done === 18 && !HG2.state.busy, null, { timeout: 180000 });
  console.log('AUTO', (Date.now() - t) / 1000, 's', await p.evaluate(() => ({ threads: HG2.state.pool?.threads ?? 0, msg: HG2.state.msg, count: HG2.model().review.count })));
  await p.click('.step[data-step="5"]');
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('button[data-act="xlsx"]')]); if (require('fs').statSync(await d.path()).size < 20000) throw new Error('XLSX');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('E2E SINGLE2 PASS');
 } finally { await b.close(); }
})().catch(e => { console.error('E2E SINGLE2 FAIL', e); process.exit(1); });
