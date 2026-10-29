// End-to-end: a duct's route edited on the ④ plan - a straight run moved across itself (the run in line with it moves
// too, the legs at a right angle stretch), PHG D calculates again, one undo entry puts the route back; the handle on the
// plan drags the leg (its preview the way the pointer goes), and so does an RU's preview.
//   node test/e2e/route-edit.e2e.cjs
'use strict';
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), G = require('../../tools/v1-golden.cjs');
const OUT = path.join(__dirname, '..', '..', 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
 const H = (f, a) => p.evaluate(f, a), idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 300000 });
 try {
  await p.goto(s.url + '/app/'); await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await H(d => HVACGrid.loadProject(d, 'T3'), G.read(path.join(G.FIXTURES, 't3'), 'project')); await idle();
  const key = await H(() => { const pl = HVACGrid.plans().find(p => p.kind === 'supply' && p.rus.length > 10); const S = HVACGrid.S; S.deck = pl.deckId; S.kind = pl.kind; S.sys = pl.systemKey; return pl.key; });
  await p.click('.step[data-step=duct]'); await idle(); await H(k => HVACGrid.runAll([k]), key); await idle();
  // the network still in one piece: every duct's ends on its nodes, PHG D's pressure paths reaching every RU
  const whole = () => H(() => { const st = HVACGrid.phg.win.LineDesignLegacy.getState(), node = id => st.nodes.find(n => n.id === id), on = (p, n) => n && Math.hypot(p.x - n.x, p.y - n.y) < 1;
   const loose = st.ducts.filter(d => !on(d.points[0], node(d.fromNodeId)) || !on(d.points.at(-1), node(d.toNodeId))).map(d => d.displayName);
   const paths = HVACGrid.phg.win.LineDesignV2.calculateSimplePressure({})?.paths?.length || 0; return { loose, paths, rus: st.diffusers.length }; });
  const inOne = async msg => { const w = await whole(); assert.ok(!w.loose.length && w.paths === w.rus, `${msg}: ${JSON.stringify(w)}`); };
  // a run that can move: legs of 1 m or more, tried in turn (a run reaching an RU or the unit is refused, untouched)
  const legs = await H(k => HVACGrid.S.geometry[k].ducts.flatMap((d, i) => d.points.slice(1).map((q, j) => ({ i, j, id: d.id, L: Math.hypot(q.x - d.points[j].x, q.y - d.points[j].y) }))).filter(x => x.L >= 1000).sort((a, b) => b.L - a.L), key);
  let hit = null, refused = 0;
  for (const c of legs.slice(0, 40)) {
   const before = await H(([k, c]) => ({ pts: JSON.stringify(HVACGrid.S.geometry[k].ducts.find(d => d.id === c.id).points), undo: HVACGrid.S.undo.length, lengthM: HVACGrid.result(k).lengthM }), [key, c]);
   await H(([k, c]) => HVACGrid.moveRun(k, c.i, c.j, 200), [key, c]); await idle();
   const after = await H(([k, c]) => { const d = HVACGrid.S.geometry[k].ducts.find(x => x.id === c.id); return { pts: d && JSON.stringify(d.points), d, undo: HVACGrid.S.undo.length, label: HVACGrid.S.undo.at(-1)?.label, err: HVACGrid.S.msgErr, msg: HVACGrid.S.msg, lengthM: HVACGrid.result(k).lengthM, edited: HVACGrid.result(k).edited }; }, [key, c]);
   if (after.err) { refused++; assert.equal(after.pts, before.pts, 'a refused move leaves the route'); assert.equal(after.undo, before.undo); continue; }
   hit = { c, before, after }; break;
  }
  assert.ok(hit, `a run moved (${refused} refused first)`);
  const { c, before, after } = hit, b0 = JSON.parse(before.pts), a1 = after.d.points, horiz = Math.abs(b0[c.j + 1].x - b0[c.j].x) >= Math.abs(b0[c.j + 1].y - b0[c.j].y);
  const axis = horiz ? 'y' : 'x', moved = [a1[c.j][axis] - b0[c.j][axis], a1[c.j + 1][axis] - b0[c.j + 1][axis]];
  assert.deepEqual(moved, [200, 200], `the leg 200 mm across itself ${JSON.stringify({ moved, msg: after.msg })}`);
  assert.ok(after.undo === before.undo + 1 && /구간 이동/.test(after.label) && after.edited && /구간 200 mm/.test(after.msg), JSON.stringify(after));
  await inOne('after the move');
  console.log(`moved ${c.id} leg ${c.j} (${refused} refused first): ${before.lengthM} → ${after.lengthM} m · ${after.msg}`);
  await H(() => HVACGrid.undo()); await idle();
  assert.equal(await H(([k, id]) => JSON.stringify(HVACGrid.S.geometry[k].ducts.find(d => d.id === id).points), [key, c.id]), before.pts, 'undo: the route of before');
  // the handle on the plan: picked duct, its leg dragged; the preview goes the pointer's way
  await H(([k, c]) => { const i = HVACGrid.S.geometry[k].ducts.findIndex(d => d.id === c.id); HVACGrid.S.duct = { key: k, i }; HVACGrid.S.room = null; HVACGrid.render(); }, [key, c]); await idle();
  const hb = await p.locator(`#plan .leg[data-leg="${c.j}"] rect`).boundingBox(); assert.ok(hb, 'a handle on the picked leg');
  const k = await H(() => HVACGrid.S.planShown.k), dpx = Math.round(300 * k) + 2;   // about 300 mm on the screen
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down();
  await p.mouse.move(hb.x + hb.width / 2 + (horiz ? 0 : dpx), hb.y + hb.height / 2 + (horiz ? dpx : 0), { steps: 6 });
  const tf = await p.locator(`#plan .leg[data-leg="${c.j}"]`).getAttribute('transform');
  const [tx, ty] = tf.match(/-?[\d.]+/g).map(Number);
  assert.ok(horiz ? tx === 0 && ty > 0 : ty === 0 && tx > 0, `preview across the leg, the pointer's way: ${tf}`);
  await p.mouse.up(); await idle();
  const d2 = await H(([k, id]) => HVACGrid.S.geometry[k].ducts.find(d => d.id === id).points, [key, c.id]);
  const m2 = d2[c.j][axis] - b0[c.j][axis];
  assert.ok(m2 % 50 === 0 && (horiz ? m2 < 0 : m2 > 0) && Math.abs(Math.abs(m2) - 300) <= 100, `dragged on the plan: ${m2} mm (down = -y, right = +x)`);
  await inOne('after the drag');
  await p.screenshot({ path: path.join(OUT, 'route-edit.png') });
  // an RU's preview goes the pointer's way too
  await H(() => { HVACGrid.S.duct = null; HVACGrid.render(); }); await idle();
  const ru = p.locator('#plan .ru.drag').first(), rb = await ru.boundingBox();
  await p.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await p.mouse.down(); await p.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2 + 12, { steps: 4 });
  const rt = (await ru.getAttribute('transform')).match(/-?[\d.]+/g).map(Number);
  await p.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2, { steps: 4 }); await p.mouse.up(); await idle();
  assert.ok(rt[1] > 0, `RU preview down with the pointer: ${rt}`);
  assert.deepEqual(errors, []);
  console.log('E2E ROUTE-EDIT PASS');
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('E2E ROUTE-EDIT FAIL', e); process.exit(1); });
