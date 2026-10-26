// V2-0.6 성능 기준 (docs/v2/BASELINE.md): what 1.x takes on the machine it runs on, for Ver 2.0 to be measured against
// (PLAN_V2.md G6·G7·G9). Writes out/v2-baseline/<host>.json and prints a table for BASELINE.md.
//   node tools/v2-baseline.cjs [auto] [big] [size] [--sizes=20,100,200] [--ships=t3,n3]
//   auto  T3·N3 every plan AUTO (tools/golden-run.cjs - the same path as "모든 계통 AUTO"), seconds per plan and in all
//   big   synthetic deck drawings of 20·100·200 MB (N3 D2 with furniture lines in the rooms, layer FURNITURE, as in
//         docs/REVIEW_2026-10-25_BIG_DXF.md; for SketchCAD the walls on WALL as in test/e2e/sketchcad.e2e.cjs): ① BOX DXF 열기 (box.setFile, as the shell does) - time to the deck, to
//         the room list, rooms found, JS heap; SketchCAD (SKETCHCAD_HTML, else ../SketchCAD/SketchCAD.html) - open,
//         ROOMAUTO, rooms, heap. Each step has a time limit (BIG_LIMIT_S, default 600 s): over it the step is "> limit".
//   size  one-file copy (tools/make-single.cjs) and closed-network copy (tools/make-offline.cjs) bytes, made in out/
// The machine: CPU, cores, memory, OS, Node, browser - recorded with every result.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { launch } = require('./browser.cjs'), { start } = require('./serve.cjs');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'out', 'v2-baseline');
const LIMIT = 1000 * +(process.env.BIG_LIMIT_S || 600);
const SKETCHCAD = process.env.SKETCHCAD_HTML || path.join(ROOT, '..', 'SketchCAD', 'SketchCAD.html');

function machine() {
 const cpus = os.cpus();
 return { host: os.hostname(), cpu: cpus[0]?.model || '?', cores: cpus.length, memGB: Math.round(os.totalmem() / 2 ** 30 * 10) / 10, os: `${os.type()} ${os.release()} ${os.arch()}`, node: process.version };
}

// N3 D2 (29 rooms) with furniture: short horizontal and vertical LINEs on layer FURNITURE inside every room's box,
// added until the file has the size asked. The rooms and their texts stay as they were.
// wallLayer: the walls (layer ROOM in N3, which SketchCAD keeps for its own room outlines) on another layer, as a
// shipyard drawing has them (test/e2e/sketchcad.e2e.cjs withWallLayer)
function bigDxf(mb, file, { wallLayer = null } = {}) {
 let src = fs.readFileSync(path.join(ROOT, 'samples', 'n3', 'N3_D2.dxf'), 'latin1');
 if (wallLayer) src = src.replace(/(\r?\n\s*8\r?\n)ROOM(\r?\n)/g, `$1${wallLayer}$2`);
 const inp = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 'n3', 'N3.inputs.json'), 'utf8'));
 const rooms = inp.rooms.filter(r => r.deck === 'D2').map(r => { const xs = r.points.map(p => p[0]), ys = r.points.map(p => p[1]); return [Math.min(...xs) + 100, Math.min(...ys) + 100, Math.max(...xs) - 100, Math.max(...ys) - 100]; });
 const end = src.lastIndexOf('ENDSEC', src.lastIndexOf('EOF')), head = src.slice(0, src.lastIndexOf('\n', src.lastIndexOf('\n', end - 1) - 1) + 1), tail = src.slice(head.length);
 const eol = src.includes('\r\n') ? '\r\n' : '\n', fd = fs.openSync(file, 'w'), target = mb * 1e6; let bytes = 0, n = 0, i = 0;
 const write = s => { fs.writeSync(fd, s, null, 'latin1'); bytes += s.length; };
 write(head);
 while (bytes + tail.length < target) {
  const [x0, y0, x1, y1] = rooms[i++ % rooms.length], k = (n * 7919) % 1000 / 1000, h = n % 2 === 0;
  const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * ((n * 104729) % 1000 / 1000), L = 300 + (n % 5) * 100;
  const xa = h ? Math.min(x, x1 - L) : x, ya = h ? y : Math.min(y, y1 - L);
  let chunk = '';
  for (let j = 0; j < 200 && bytes + chunk.length + tail.length < target; j++, n++) chunk += ['  0', 'LINE', '  8', 'FURNITURE', ' 10', (xa + j % 3).toFixed(1), ' 20', (ya + j % 3).toFixed(1), ' 30', '0.0', ' 11', (h ? xa + L : xa).toFixed(1), ' 21', (h ? ya : ya + L).toFixed(1), ' 31', '0.0', ''].join(eol);
  write(chunk);
 }
 write(tail); fs.closeSync(fd);
 return { file, bytes, lines: n };
}

async function heapMB(page) {
 try { const c = await page.context().newCDPSession(page); await c.send('Performance.enable'); const m = await c.send('Performance.getMetrics'); await c.detach().catch(() => {}); const v = m.metrics.find(x => x.name === 'JSHeapUsedSize')?.value; return v ? Math.round(v / 2 ** 20) : null; } catch { return null; }
}
const timed = async (f, limit = LIMIT) => { const t = Date.now(); try { const v = await Promise.race([f(), new Promise((_, no) => setTimeout(() => no(new Error('limit')), limit))]); return { s: Math.round((Date.now() - t) / 100) / 10, v }; } catch (e) { return { s: e.message === 'limit' ? `> ${Math.round(limit / 1000)}` : null, error: e.message.slice(0, 200) }; } };

async function autoTimes(ships) {
 const { runShip } = require('./golden-run.cjs'), out = {};
 for (const ship of ships) { const r = await runShip(ship, { log: m => console.log('  ' + m) }); const res = Object.values(r.project.results);
  out[ship] = { autoS: r.timing.autoS, done: `${res.filter(x => x.auto && !x.stale).length}/${res.length}`, openS: r.timing.openS, plans: r.timing.plans, pageErrors: r.errors.length, browser: r.browser }; console.log(ship, JSON.stringify(out[ship])); }
 return out;
}

async function boxBig(file) {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } });
 p.on('dialog', d => d.accept());
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 60000 });
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  const before = await heapMB(p), t0 = Date.now();
  // the shell hands the file to BOX's DXF input (the ribbon refuses 16 MiB and over; BOX itself is measured here)
  await p.evaluate(async f => { const r = await fetch(f); const blob = await r.blob(); HVACGrid.box.setFile('dxfFile', new File([blob], 'big.dxf', { type: 'application/dxf' })); }, '/samples/__big.dxf');
  const deck = await timed(() => p.waitForFunction(() => HVACGrid.box.win.CAD_APP.stack.decks.length > 0, null, { timeout: 0, polling: 1000 }));
  const rooms = deck.error ? { s: null } : await timed(() => p.waitForFunction(() => { try { return HVACGrid.box.win.CAD_APP.rooms().length > 0; } catch { return false; } }, null, { timeout: 0, polling: 2000 }), Math.max(1000, LIMIT - (Date.now() - t0)));
  const n = await p.evaluate(() => { try { return HVACGrid.box.win.CAD_APP.rooms().length; } catch { return null; } }).catch(() => null);
  return { deckS: deck.s, roomsS: rooms.s, rooms: n, heapBeforeMB: before, heapMB: await heapMB(p), error: deck.error || rooms.error || null };
 } finally { await b.close(); await s.close(); }
}

async function sketchcadBig(file) {
 if (!fs.existsSync(SKETCHCAD)) return { skipped: 'SketchCAD.html 없음: ' + SKETCHCAD };
 const b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } });
 p.on('dialog', d => d.accept());
 try {
  await p.goto('file:///' + path.resolve(SKETCHCAD).replace(/\\/g, '/'));
  await p.waitForFunction(() => window.CAD && CAD.doc, null, { timeout: 60000 });
  const before = await heapMB(p);
  await p.setInputFiles('#fDxf', file);
  // over 16 MB SketchCAD asks which layers to read: 계산용으로 열기 (the layers the calculation keeps)
  const open = await timed(async () => {
   for (;;) {
    if (await p.evaluate(() => CAD.doc.ents.length > 0)) return;
    const calc = p.locator('button', { hasText: '계산용으로 열기' }).first(); if (await calc.isVisible().catch(() => false)) await calc.click();
    await p.waitForTimeout(500);
   }
  });
  const ents = await p.evaluate(() => CAD.doc.ents.length);
  const find = await timed(async () => { await p.evaluate(() => CAD.zoomExtents()); await p.evaluate(() => CAD.run('ROOMAUTO')); await p.locator('[data-m=ok]').first().click({ timeout: 0 }); return p.evaluate(() => CAD.roomData().length); });
  return { openS: open.s, entities: ents, roomAutoS: find.s, rooms: find.v ?? null, heapBeforeMB: before, heapMB: await heapMB(p), error: open.error || find.error || null };
 } finally { await b.close(); }
}

async function big(sizes) {
 const out = {}, tmp = path.join(ROOT, 'samples', '__big.dxf'), wall = path.join(ROOT, 'samples', '__big_wall.dxf');   // served by tools/serve.cjs (samples/), removed after
 try {
  for (const mb of sizes) {
   const made = bigDxf(mb, tmp); console.log(`${mb} MB: ${made.lines} furniture lines`);
   const box = await boxBig(tmp); fs.rmSync(tmp, { force: true });
   bigDxf(mb, wall, { wallLayer: 'WALL' });
   out[mb] = { bytes: made.bytes, furnitureLines: made.lines, box, sketchcad: await sketchcadBig(wall) }; fs.rmSync(wall, { force: true });
   console.log(mb, 'MB', JSON.stringify(out[mb]));
  }
 } finally { fs.rmSync(tmp, { force: true }); fs.rmSync(wall, { force: true }); }
 return out;
}

function sizes() {
 const dir = path.join(OUT, 'dist'), single = path.join(dir, 'HVAC_Grid.html'), offline = path.join(dir, 'HVAC_Grid_offline');
 fs.mkdirSync(dir, { recursive: true });
 execFileSync(process.execPath, [path.join(__dirname, 'make-single.cjs'), single], { stdio: 'inherit' });
 execFileSync(process.execPath, [path.join(__dirname, 'make-offline.cjs'), offline], { stdio: 'inherit' });
 const du = d => fs.readdirSync(d, { withFileTypes: true }).reduce((t, e) => t + (e.isDirectory() ? du(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
 const node = ['runtime'].map(x => path.join(offline, x)).filter(fs.existsSync).reduce((t, d) => t + du(d), 0);
 return { singleBytes: fs.statSync(single).size, offlineBytes: du(offline), offlineRuntimeBytes: node, note: 'offline: 이 기계의 node 실행 파일이 runtime에 들어감 (Windows node.exe와 크기 다름)' };
}

if (require.main === module) (async () => {
 const args = process.argv.slice(2), what = args.filter(a => !a.startsWith('--')), all = !what.length;
 const sz = (args.find(a => a.startsWith('--sizes=')) || '--sizes=20,100,200').slice(8).split(',').map(Number);
 const ships = (args.find(a => a.startsWith('--ships=')) || '--ships=t3,n3').slice(8).split(',');
 const r = { machine: machine(), at: new Date().toISOString() };
 let commit = null; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch {} r.commit = commit;
 if (all || what.includes('size')) r.size = sizes();
 if (all || what.includes('auto')) r.auto = await autoTimes(ships);
 if (all || what.includes('big')) r.big = await big(sz);
 fs.mkdirSync(OUT, { recursive: true });
 const f = path.join(OUT, `${r.machine.host.replace(/[^\w.-]/g, '_')}.json`); fs.writeFileSync(f, JSON.stringify(r, null, 1));
 console.log(JSON.stringify(r, null, 1)); console.log('→', path.relative(ROOT, f));
})().catch(e => { console.error(e); process.exit(1); });

module.exports = { bigDxf, machine };
