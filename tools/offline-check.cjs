// Acceptance check of an offline copy (review 2026-10-21 A08) - on the build PC after make-offline, and on the closed
// network PC itself before the copy is used: every file against MANIFEST.json, then the copy's own server, the app,
// both examples (S5 BOX's, T3 with its SOLAS settings) and the design data made from them, with no page or HTTP error.
//   node tools/offline-check.cjs [copy=dist/HVAC_Grid_offline]   (on the closed network: runtime\node.exe tools\offline-check.cjs .)
// The browser part needs Edge or Chrome (as the app does); tools/browser.cjs finds it.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DIR = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'HVAC_Grid_offline'));
const t0 = Date.now(), log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);

function files() {
 const m = JSON.parse(fs.readFileSync(path.join(DIR, 'MANIFEST.json'), 'utf8')), bad = [];
 for (const [f, sha] of Object.entries(m.files)) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) bad.push('없음 ' + f); else if (crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') !== sha) bad.push('다름 ' + f);
 }
 return { m, bad };
}

(async () => {
 const { m, bad } = files();
 log(`MANIFEST ${m.commit} · Node ${m.node} · 파일 ${Object.keys(m.files).length}개`, bad.length ? '— ' + bad.join(', ') : '— 모두 일치');
 if (bad.length) { process.exitCode = 1; return; }
 // the browser driver lives with the source (dev dependency); a closed network copy is checked with the source's tools
 let launch; try { ({ launch } = require(path.join(__dirname, 'browser.cjs'))); } catch { log('브라우저 시험 생략: tools/browser.cjs 없음 (파일 확인만 함)'); return; }
 const { start } = require(path.join(DIR, 'tools', 'serve.cjs'));
 const s = await start(0), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [], failed = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept()); p.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 try {
  await p.goto(s.url + '/app/'); await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 60000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  for (const [name, rooms] of [['s5', 94], ['t3', 79]]) {
   await p.evaluate(n => { HVACGrid.S.dirty = false; return HVACGrid.openSample(n); }, name); await idle();
   const r = await p.evaluate(() => ({ rooms: HVACGrid.S.contract?.rooms.length, systems: HVACGrid.S.contract?.systems.length, below: HVACGrid.S.contract?.solas?.lowestBelow || null }));
   log(name.toUpperCase(), JSON.stringify(r));
   if (r.rooms !== rooms || (name === 't3' && !r.below)) failed.push(`${name}: 격실 ${r.rooms}/${rooms}` + (name === 't3' && !r.below ? ' · SOLAS 설정 없음' : ''));
  }
  log('페이지 오류', errors.length, errors.slice(0, 3)); log('HTTP 오류', failed.length, failed.slice(0, 5));
  const ok = !errors.length && !failed.length; log(ok ? 'OFFLINE CHECK PASS' : 'OFFLINE CHECK FAIL'); if (!ok) process.exitCode = 1;
 } catch (e) { log('OFFLINE CHECK FAIL', e.message); process.exitCode = 1; } finally { await b.close(); await s.close(); }
})();
