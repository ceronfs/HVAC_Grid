// V2-0 기준값 실행기: the 1.x shell runs headless over S5, T3 or N3 the way a designer does (the same code path as the
// ribbon, tools/hvac-run.cjs and the e2e tests), and hands back what 1.x made - the project (contract, results, duct
// networks), BOX CAL's room loads, how long it took, and (phg: true) what PHG D did for every plan. Used by
// tools/v1-golden.cjs and tools/phg-golden.cjs (docs/v2/PLAN_V2_WORK.md 0.1·0.2). Nothing here changes the shell.
//   S5: BOX's own example (openSample) · T3: samples/t3/T3.box.json + T3.solas.json (openSample)
//   N3: samples/n3 (seed 20261023) from the deck DXFs, as test/e2e/n3.e2e.cjs does it (① DXF, Deck name·Z·height, hull
//       outline · ② room inputs pasted, waterline off, loads, design data · ③ hospital exhaust fan in the linen store ·
//       ⑤ engine room below) - without its screenshots and asserts
// Then ④ every plan AUTO (HVACGrid.runAll, as "모든 계통 AUTO").
'use strict';
const fs = require('fs'), path = require('path');
const { launch } = require('./browser.cjs'), { start } = require('./serve.cjs');
const ROOT = path.join(__dirname, '..');
const SHIPS = ['s5', 't3', 'n3'];
const N3_DIR = path.join(ROOT, 'samples', 'n3');
const LIST_FIELDS = ['sup', 'exh', 'ret', 'people', 'minimumFreshAir', 'equipW', 'minimumAch', 'lighting', 'coolTemp', 'coolingRh', 'heatTemp', 'heatingRh', 'ceilingHeight'];

// in the PHG D frame, before its scripts run: every worker's messages both ways (the routing engine, the sizing worker,
// the V2 calculation and DXF workers). A worker without a name is named by the type of its first message.
function phgWorkerLog() {
 if (!/DuctConcept_PHG_D/.test(location.pathname)) return;
 const log = window.__goldenWorkers = [], W = window.Worker;
 window.Worker = class extends W {
  constructor(url, opt) { super(url, opt); this.__name = opt?.name || null; this.addEventListener('message', e => log.push({ dir: 'out', worker: this.__name, data: e.data })); }
  postMessage(m, tr) { if (!this.__name) this.__name = 'blob:' + (m?.type || 'message'); log.push({ dir: 'in', worker: this.__name, data: m }); return super.postMessage(m, tr); }
 };
}

// in the shell: PHG D's state right after loadPlan, every AUTO preview (the forbidden zones it ran with, its candidates),
// the worker messages, the ducts and the pressure paths after AUTO. Wraps the Phg instance's methods only.
function phgHooks() {
 const P = HVACGrid.phg, G = window.__golden = { plans: {}, order: [] }, clone = v => JSON.parse(JSON.stringify(v ?? null));
 const drain = () => { const log = P.win.__goldenWorkers || []; const out = clone(log); log.length = 0; return out; };
 const STATE = ['entities', 'nodes', 'diffusers', 'ducts', 'settings', 'layers', 'bounds', 'validationMessages'];
 const snap = st => Object.fromEntries(STATE.map(k => [k, clone(st[k])]));
 const loadPlan = P.loadPlan, auto = P.auto;
 P.loadPlan = async function (pl, dxf) {
  drain();
  const r = await loadPlan.call(this, pl, dxf), st = this.win.LineDesignLegacy.getState();
  const { dxf: planDxf, ...plan } = pl;
  G.cur = pl.key; G.order.push(pl.key);
  G.plans[pl.key] = { plan: clone(plan), dxf: { plan: planDxf?.length || 0, sent: dxf?.length || 0, cad: dxf !== planDxf }, loaded: { state: snap(st), result: clone(r), workers: drain() } };
  return r;
 };
 P.auto = async function (opts) {
  const w = this.win, R = w.DuctConceptRouting, st = w.LineDesignLegacy.getState(), preview = R.preview, previews = [];
  R.preview = async function (...a) {
   const zones = (st.settings.routingForbiddenZones || []).map(z => z.id);
   const pv = await preview.apply(this, a); previews.push({ zones, preview: clone(pv) }); return pv;
  };
  let r; try { r = await auto.call(this, opts); } finally { R.preview = preview; }
  let pressure = null; try { pressure = clone(w.LineDesignV2.calculateSimplePressure({})); } catch (e) { pressure = { error: e.message }; }
  G.plans[G.cur].auto = { opts: clone(opts || {}), previews, workers: drain(), ducts: clone(st.ducts), diffusers: clone(st.diffusers), nodes: clone(st.nodes), pressure, result: clone(r), geometry: clone(this.geometry()) };
  return r;
 };
}

// N3 from its drawings (test/e2e/n3.e2e.cjs ① ② ③ ⑤, the same steps)
async function openN3(p, H, idle, ribbon, log) {
 const inp = JSON.parse(fs.readFileSync(path.join(N3_DIR, 'N3.inputs.json'), 'utf8')), ctx = p.context();
 const popup = async label => { const [w] = await Promise.all([ctx.waitForEvent('page', { timeout: 180000 }), ribbon(label).click()]); await w.waitForLoadState(); return w; };
 for (const [i, d] of inp.decks.entries()) {
  const bytes = [...fs.readFileSync(path.join(N3_DIR, `N3_${d.id}.dxf`))];
  await H(([bytes, name]) => HVACGrid.box.setFile('dxfFile', new File([new Uint8Array(bytes)], name, { type: 'application/dxf' })), [bytes, `N3_${d.id}.dxf`]);
  await p.waitForFunction(n => HVACGrid.box.win.CAD_APP.stack.decks.length === n, i + 1, { timeout: 120000 });
 }
 p.__prompts.push(...inp.decks.map(d => d.name));
 await H(() => { const W = HVACGrid.box.win, doc = HVACGrid.box.doc;
  for (const d of W.CAD_APP.stack.decks) doc.querySelector(`#deckList [data-deck-action="activate"][data-deck-id="${CSS.escape(d.id)}"]`)?.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true })); });
 await H(decks => { const W = HVACGrid.box.win, doc = HVACGrid.box.doc, A = W.CAD_APP;
  A.stack.decks.forEach((d, i) => { for (const [field, v] of [['z', decks[i].z], ['height', decks[i].height]]) {
   const el = doc.querySelector(`#deckList [data-deck-field="${field}"][data-deck-id="${CSS.escape(d.id)}"]`); el.value = String(v); el.dispatchEvent(new W.Event('change', { bubbles: true })); } }); }, inp.decks);
 const ol = await H(([outlines, rooms]) => { const A = HVACGrid.box.win.CAD_APP; let done = 0;
  A.stack.decks.forEach((d, i) => { A.st.activeDeck = d.id; const o = outlines[i]; o.forEach((p, k) => { const q = o[(k + 1) % o.length];
   const t = [0.37, 0.29, 0.43, 0.61, 0.23, 0.71].find(t => { const x = p[0] + t * (q[0] - p[0]), y = p[1] + t * (q[1] - p[1]); return !rooms.some(r => r.points.some(v => Math.hypot(v[0] - x, v[1] - y) < 150)); }) ?? 0.37;
   const pt = { x: p[0] + t * (q[0] - p[0]), y: -(p[1] + t * (q[1] - p[1])) }; if (A.designateOutlineAt(pt, 'HULL_BOTTOM') && A.designateOutlineAt(pt, 'HULL_TOP')) done++; }); });
  return { done, issues: A.outlineAssignmentIssues().map(x => `${x.deck} ${x.reason}`) }; }, [inp.decks.map(d => d.outline), inp.rooms.map(r => ({ points: r.points }))]);
 if (ol.done !== inp.decks.reduce((t, d) => t + d.outline.length, 0) || ol.issues.length) throw new Error('N3 외곽선 지정 실패: ' + JSON.stringify(ol));
 log('N3 ① DXF·Deck·외곽선');
 await p.click('.step[data-step=load]'); await idle();
 const list = await popup('격실 입력'); await list.waitForSelector('table.popup-table [data-room-field]', { timeout: 180000 });
 const pasted = await list.evaluate(([rooms, fields, deckNames]) => {
  const table = document.querySelector('table.popup-table'), edits = [], unmatched = [];
  for (const tr of table.tBodies[0].rows) {
   const no = tr.querySelector('[data-room-field="roomNo"]')?.value, deck = tr.cells[2]?.textContent.trim(), r = rooms.find(x => x.no === no && deckNames[x.deck] === deck);
   if (!r) { unmatched.push(`${deck} ${no}`); continue; }
   for (const f of fields) { const el = tr.querySelector(`[data-room-field="${f}"]`); if (!el) continue; el.value = f === 'ceilingHeight' && !r[f] ? '' : String(r[f] ?? ''); edits.push(el); }
  }
  table._applyGridPaste(edits); return { cells: edits.length, unmatched };
 }, [inp.rooms, LIST_FIELDS, Object.fromEntries(inp.decks.map(d => [d.id, d.name]))]);
 if (pasted.unmatched.length) throw new Error('N3 격실 입력: 맞지 않는 행 ' + pasted.unmatched.join(', '));
 await list.waitForTimeout(1500); await list.close();
 const dc = await popup('설계 조건'); await dc.waitForSelector('select, input', { timeout: 60000 });
 await dc.evaluate(() => { const el = document.querySelector('[data-design-field="waterlineEnabled"], [data-field="waterlineEnabled"], select[name="waterlineEnabled"]');
  if (!el) throw new Error('흘수선 항목 없음'); el.value = 'off'; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('input', { bubbles: true }));
  [...document.querySelectorAll('button')].find(x => /적용|저장|확인/.test(x.textContent))?.click(); });
 await dc.close().catch(() => {});
 const lr = await popup('격실 부하'); await lr.waitForSelector('table', { timeout: 300000 }).catch(() => {}); await lr.waitForTimeout(1500); await lr.close().catch(() => {});
 await ribbon('설계 데이터 만들기').click(); await idle();
 const pend = await H(() => HVACGrid.S.contract ? HVACGrid.S.contract.rooms.filter(r => !HVACGrid.S.contract.loads[r.id].complete).length : -1);
 if (pend !== 0) throw new Error('N3 설계 데이터: 부하 미완료 ' + pend);
 log('N3 ② 격실 입력·부하·설계 데이터');
 // ③ the hospital exhaust fan in the linen store (위치 지정, a click on the room)
 await p.click('.step[data-step=air]'); await idle();
 const hos = await H(() => { const c = HVACGrid.S.contract, r = c.rooms.find(x => x.no === '232'), p = HVACGrid.plans().find(x => x.systemId === 'EF-HOS' && x.isUnitDeck);
  Object.assign(HVACGrid.S, { deck: p.deckId, sys: p.systemKey, kind: 'exhaust' }); HVACGrid.render(); return { room: r.id, key: p.key }; });
 await ribbon('위치 지정').click(); await p.locator(`#plan .rm[data-room="${hos.room}"]`).click(); await idle();
 if (await H(k => HVACGrid.plans().find(x => x.key === k).rootSource, hos.key) !== 'user') throw new Error('N3 의무실 배기팬 위치 지정 실패');
 log('N3 ③ 의무실 배기팬 위치');
}

// ⑤ the space below the lowest deck, set in the review tab as a designer does (T3 has it from T3.solas.json)
async function belowDeck(p, idle, value) {
 await p.click('.step[data-step=review]'); await idle();
 await p.locator('#report .tabs button', { hasText: '방화 (SOLAS)' }).click();
 await p.selectOption('#belowSel', value); await idle();
}

async function runShip(ship, { phg = false, log = () => {} } = {}) {
 if (!SHIPS.includes(ship)) throw new Error('배: ' + SHIPS.join(' | '));
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } }), errors = [], t0 = Date.now();
 p.__prompts = [];
 p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
 p.on('dialog', d => (d.type() === 'prompt' && p.__prompts.length ? d.accept(p.__prompts.shift()) : d.accept()));
 if (phg) await p.context().addInitScript(phgWorkerLog);
 const H = (f, a) => p.evaluate(f, a), idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 900000 });
 const ribbon = label => p.locator('#ribbon .cmd', { hasText: label }).first();
 const sec = t => Math.round((Date.now() - t) / 100) / 10, timing = {};
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 60000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  timing.appS = sec(t0);
  const to = Date.now();
  if (ship === 'n3') await openN3(p, H, idle, ribbon, log);
  else { await H(name => HVACGrid.openSample(name), ship); await idle(); }
  timing.openS = sec(to);
  const cal = await H(() => HVACGrid.box.calSnapshot()), extract = await H(() => HVACGrid.box.extract());
  // the rooms and face rows CAL gets from BOX (CAL_ENHANCE_INPUT: BOX's L4 worker, A6 face rows raw and summarized),
  // CAL's room loads as it reports them with every field (calSnapshot keeps a list), and per room the face trace CAL's
  // own tables show (roomLoadInputTrace: boundary type, area, K, temperatures, ΔT per face) where the frame has it -
  // the face-level reference for the 2.0 load and geometry engines (STUDY_CAL 8장)
  const faces = await H(async () => { await HVACGrid.box.openCal(); const w = HVACGrid.box.doc.querySelector('#calEnhancePanel iframe').contentWindow, i = w.CAL_ENHANCE_INPUT || {};
   return JSON.parse(JSON.stringify({ rooms: i.rooms || null, summarized: i.faces?.summarized || null, raw: i.faces?.raw?.length ?? null })); });
  const calLoads = await H(async () => { await HVACGrid.box.openCal(); const w = HVACGrid.box.doc.querySelector('#calEnhancePanel iframe').contentWindow, rep = w.CAL_ENHANCE.report();
   let trace = null, why = null;
   try { const f = w.eval('typeof roomLoadInputTrace === "function" ? roomLoadInputTrace : null'); if (f) trace = Object.fromEntries(rep.loads.map(r => [r.id, f(r)])); else why = 'roomLoadInputTrace 없음'; } catch (e) { why = e.message; }
   return JSON.parse(JSON.stringify({ kMode: rep.kMode ?? null, loads: rep.loads, faceTrace: trace, faceTraceMissing: why })); });
  if (ship === 'n3') await belowDeck(p, idle, '기관실 — A류');
  if (phg) await H(phgHooks);
  await H(() => HVACGrid.go('duct')); await idle();
  const ta = Date.now();
  await H(() => HVACGrid.runAll()); await idle();
  timing.autoS = sec(ta);
  const status = await H(() => ({ msg: HVACGrid.S.msg, err: !!HVACGrid.S.msgErr }));
  const project = JSON.parse(await H(() => HVACGrid.projectJson()));
  const phgLog = phg ? await H(() => window.__golden) : null;
  timing.plans = Object.fromEntries(Object.entries(project.results).map(([k, r]) => [k, r.seconds]));
  timing.totalS = sec(t0);
  log(`${ship}: AUTO ${timing.autoS} s · ${status.msg}`);
  return { ship, project, cal, extract, faces, calLoads, errors, status, timing, phg: phgLog, browser: `${b.browserType().name()} ${b.version()}` };
 } finally { await b.close(); await s.close(); }
}

module.exports = { SHIPS, runShip, N3_DIR };
