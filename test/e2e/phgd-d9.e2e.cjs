// PHG D D9 in the browser (docs/VENDOR_PATCHES.md D9): AUTO of one system with the ducts of another system of the deck.
//  1. no foreign ducts: the straight route (as before D9);
//  2. a foreign duct lying on that line: the route moves beside it (no plan overlap);
//  3. a foreign wall across the canvas 150 mm high: crossed, the stack within the 400 mm duct layer;
//  4. the same wall 350 mm high: no hard route (crossing over the layer); 'soft' routes it and the score counts it;
//  5. a host band (phgdRouteZones PREFERRED + phgdMainCorridors): the main follows the band.
//   node test/e2e/phgd-d9.e2e.cjs
'use strict';
const assert = require('node:assert/strict'), { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs');

(async () => {
 const s = await start(), b = await launch(), p = await b.newPage(), errors = [];
 p.on('pageerror', e => errors.push(e.message));
 try {
  await p.goto(s.url + '/vendor/DuctConcept_PHG_D.html');
  await p.waitForFunction(() => window.DuctConceptRouting?.ready && window.LineDesignV2 && window.PHGDForeign, null, { timeout: 120000 });
  // a fresh project: Root at the left, three RUs to the right (app coordinates, y down)
  const run = (settings, rus = [[8000, 0], [8000, 2000], [8000, -2000]]) => p.evaluate(async ([settings, rus]) => {
   const L = window.LineDesignLegacy, R = window.DuctConceptRouting, st = L.getState();
   st.nodes.length = 0; st.ducts.length = 0; st.diffusers.length = 0; st.entities.length = 0;
   for (const k of ['phgdForeignDucts', 'phgdForeignCrossing', 'phgdRouteZones', 'phgdMainCorridors']) delete st.settings[k];
   Object.assign(st.settings, settings); st.settings.routingForbiddenZones = [];
   R.placeRoot({ x: 0, y: 0 }); for (const [x, y] of rus) R.placeRu({ x, y, flowCmh: 300 });
   L.renderEverything();
   let pv; try { pv = await R.preview({ timeoutMs: 60000 }); } catch (e) { return { error: e.code || e.message }; }
   const c = pv.candidates?.[0]; if (!c) return { error: pv.reason || 'none' };
   return { unconnected: c.unconnectedRuIds?.length || 0, routes: (c.routes || []).map(r => r.points.map(q => [Math.round(q.x), Math.round(q.y)])), label: c.label };
  }, [settings, rus]);
  const crossing = { layerMm: 400, gapMm: 50, mode: 'hard' };
  const onLine = r => r.routes.some(pts => pts.some(([x, y], i) => i && y === 0 && pts[i - 1][1] === 0 && Math.min(x, pts[i - 1][0]) < 6000 && Math.max(x, pts[i - 1][0]) > 3000));
  const crossesX = (r, X) => r.routes.some(pts => pts.some(([x], i) => i && Math.min(x, pts[i - 1][0]) < X && Math.max(x, pts[i - 1][0]) > X));

  const r1 = await run({}, [[8000, 0]]);
  assert.equal(r1.unconnected, 0, JSON.stringify(r1)); assert.ok(onLine(r1), 'without foreign ducts the route is straight: ' + JSON.stringify(r1.routes));
  const r2 = await run({ phgdForeignDucts: [{ id: 'RA/1', systemId: 'RA', points: [{ x: 2000, y: 0 }, { x: 7000, y: 0 }], widthMm: 300, heightMm: 200 }], phgdForeignCrossing: crossing }, [[8000, 0]]);
  assert.equal(r2.unconnected, 0, JSON.stringify(r2)); assert.ok(!onLine(r2), 'beside a foreign duct, not on it: ' + JSON.stringify(r2.routes));
  const wall = h => ({ phgdForeignDucts: [{ id: 'EF/1', systemId: 'EF', points: [{ x: 4000, y: -20000 }, { x: 4000, y: 20000 }], widthMm: 200, heightMm: h }], phgdForeignCrossing: crossing });
  const r3 = await run(wall(150));
  assert.equal(r3.unconnected, 0, JSON.stringify(r3)); assert.ok(crossesX(r3, 4000), 'crossed within the layer');
  const r4 = await run(wall(350));
  assert.ok(r4.error || r4.unconnected > 0, 'no hard route over the duct layer: ' + JSON.stringify(r4).slice(0, 200));
  const r5 = await run({ ...wall(350), phgdForeignCrossing: { ...crossing, mode: 'soft' } });
  assert.equal(r5.unconnected, 0, 'soft: routed anyway ' + JSON.stringify(r5).slice(0, 200));
  // a band 1,200 mm wide at y = 3000 (below the Root line): the main follows it to the RUs
  const band = [{ x: -500, y: 2400 }, { x: 9000, y: 2400 }, { x: 9000, y: 3600 }, { x: -500, y: 3600 }];
  const r6 = await run({ phgdRouteZones: [{ id: 'B', zoneType: 'PREFERRED', polygon: band }], phgdMainCorridors: [{ name: 'band', polygon: band }] }, [[8000, 1000], [6000, 1000], [4000, 1000], [2000, 1000], [8000, 5000], [5000, 5000]]);
  const inBand = r6.routes.flat().filter(([, y]) => y >= 2400 && y <= 3600).length;
  assert.equal(r6.unconnected, 0, JSON.stringify(r6)); assert.ok(inBand >= 4, 'route points in the band: ' + JSON.stringify(r6.routes));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, straight: r1.routes, beside: r2.routes, crossed: r3.label, overLayer: r4.error || `unconnected ${r4.unconnected}`, soft: r5.label, band: r6.routes }));
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error(e); process.exit(1); });
