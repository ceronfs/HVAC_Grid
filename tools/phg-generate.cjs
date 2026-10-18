// H1: contract -> PHG D projects. Per deck and supply system: the room drawing goes into PHG D as its background,
// the Root and the RUs (supply airflow per room) are placed, and the PHG D project JSON is saved. With --auto the AUTO
// routing, duct assignment and sizing run too, and a screenshot is taken.
//   node tools/phg-generate.cjs samples/s5.contract.json out/s5 [--auto]
// PHG_HTML overrides the PHG D build (default vendor/DuctConcept_PHG_D.html, a frozen copy - the original PHG D file is
// never modified). Everything is written to outDir inside HVAC Grid.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { plan } = require('../lib/phg-plan.cjs');
const { launch, vendor } = require('./browser.cjs');
const PHG_HTML = process.env.PHG_HTML || vendor('DuctConcept_PHG_D.html');

(async () => {
 const args = process.argv.slice(2), auto = args.includes('--auto'), [input = 'samples/s5.contract.json', outDir = 'out/s5'] = args.filter(a => !a.startsWith('--'));
 const contract = JSON.parse(fs.readFileSync(input, 'utf8')), plans = plan(contract);
 fs.mkdirSync(outDir, { recursive: true });
 const b = await launch(), summary = [], rus = [];
 try {
  for (const pl of plans) {
   const p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
   await p.goto('file:///' + PHG_HTML.replace(/\\/g, '/')); await p.waitForFunction(() => window.DuctConceptRouting?.ready, null, { timeout: 120000 });
   const dxfFile = path.resolve(outDir, pl.key + '.dxf'); fs.writeFileSync(dxfFile, pl.dxf);
   await p.locator('#fileInput').setInputFiles(dxfFile); await p.waitForSelector('#dxfImportOptionsDialog[open]');
   await p.locator('#dxfImportOptionsDialog button[type=submit]').click();
   await p.waitForFunction(() => !document.getElementById('dxfImportOptionsDialog').open && LineDesignLegacy.getState().entities.length > 0, null, { timeout: 120000 });
   // PHG D shows DXF y upward as screen y downward: app y = -DXF y
   const placed = await p.evaluate(({ pl }) => {
    const R = DuctConceptRouting, L = LineDesignLegacy; L.setProjectIdentity?.(pl.key, pl.key + '.dxf');
    R.placeRoot({ x: pl.root.x, y: -pl.root.y });
    const out = [];
    for (const u of pl.rus) { R.placeRu({ x: u.x, y: -u.y, flowCmh: u.flowCmh }); const s = L.getState(), node = s.nodes.at(-1), ru = s.diffusers.find(d => d.connectedNodeId === node.id);
     if (ru) ru.memo = 'HVAC Grid ' + u.id; out.push({ id: u.id, phgRu: ru?.displayName, flowCmh: ru?.flowCmh }); }
    L.renderEverything();
    // the rooms PHG D itself finds around each RU (the same room finder as 같은 실 BR / 풍량 초안)
    const state = L.getState(), rooms = PHGDRooms.index(state.entities);
    const found = pl.rus.map(u => { const room = rooms.roomAt({ x: u.x, y: -u.y }); return room ? rooms.namesOf(room).join(' ') : null; });
    return { out, found, rus: state.diffusers.length, total: state.diffusers.reduce((t, d) => t + (+d.flowCmh || 0), 0) };
   }, { pl });
   const row = { key: pl.key, deck: pl.deckId, system: pl.systemId, rootSource: pl.rootSource, rus: placed.rus, flowCmh: placed.total, designCmh: pl.designCmh,
    roomMatched: pl.rus.filter((u, i) => (placed.found[i] || '').split(' ').includes(u.roomNo)).length };
   if (auto) {
    const a = await p.evaluate(async () => {
     const R = DuctConceptRouting, t = performance.now(), pv = await R.preview({ timeoutMs: 120000 }), c = pv.candidates?.[0];
     if (!c) return { fail: pv.reason || pv.message };
     await R.applyPreview(c.id); const st = LineDesignLegacy.getState(); st.selectedEntityIds.clear(); for (const e of st.entities) if (e.autoRoute) st.selectedEntityIds.add(e.id); LineDesignLegacy.renderEverything();
     document.getElementById('makeDuctBtn').click(); await new Promise(r => setTimeout(r, 600)); const d = document.getElementById('phgb-conversion'); if (d?.open) document.getElementById('phgb-conversion-apply').click(); await new Promise(r => setTimeout(r, 600));
     document.getElementById('calculateBtn').click(); await new Promise(r => setTimeout(r, 400)); st.selectedEntityIds.clear(); LineDesignLegacy.renderEverything();
     const len = d => d.points.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - d.points[i].x, q.y - d.points[i].y), 0);
     let pressure = null; try { const paths = LineDesignV2.calculateSimplePressure({})?.paths || []; pressure = Math.max(...paths.map(p => p.totalPressureLossPa)); } catch {}
     return { seconds: Math.round((performance.now() - t) / 100) / 10, label: c.label, ducts: st.ducts.length, lengthM: Math.round(st.ducts.reduce((s, d) => s + len(d), 0) / 100) / 10, unconnected: c.unconnectedRuIds?.length || 0, indexPa: pressure && Math.round(pressure) };
    });
    Object.assign(row, { auto: a });
    await p.evaluate(() => { const v = LineDesignLegacy.getState().view, svg = document.getElementById('svg'), xs = [], ys = []; for (const e of LineDesignLegacy.getState().entities) for (const q of e.points || []) { xs.push(q.x); ys.push(q.y); }
     const minX = Math.min(...xs) - 800, maxX = Math.max(...xs) + 800, minY = Math.min(...ys) - 800, maxY = Math.max(...ys) + 800, rc = svg.getBoundingClientRect(), w = Math.max(maxX - minX, (maxY - minY) * rc.width / rc.height), h = w * rc.height / rc.width;
     Object.assign(v, { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h }); svg.setAttribute('viewBox', `${v.x} ${v.y} ${w} ${h}`); LineDesignLegacy.renderEverything(); });
    await p.waitForTimeout(400); await p.screenshot({ path: path.resolve(outDir, pl.key + '.png') });
   }
   const project = await p.evaluate(() => JSON.stringify(LineDesignV2.serializeTypedProject()));
   fs.writeFileSync(path.resolve(outDir, pl.key + '.phg.json'), project);
   rus.push(...pl.rus.map((u, i) => ({ ...u, phgRu: placed.out[i]?.phgRu, project: pl.key + '.phg.json' })));
   row.errors = errors.length; summary.push(row); console.log(JSON.stringify(row)); await p.close();
  }
 } finally { await b.close(); }
 const phgSha = crypto.createHash('sha256').update(fs.readFileSync(PHG_HTML)).digest('hex').slice(0, 16);
 const out = { ...contract, rus, ducts: Object.fromEntries(summary.map(s => [s.key, { project: s.key + '.phg.json', deckId: s.deck, systemId: s.system, rootSource: s.rootSource, auto: s.auto || null }])), phg: { file: PHG_HTML, sha256: phgSha } };
 fs.writeFileSync(path.resolve(outDir, 'project.contract.json'), JSON.stringify(out, null, 1));
 fs.writeFileSync(path.resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
