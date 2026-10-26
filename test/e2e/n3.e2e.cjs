// End-to-end from drawings: a new N3 test ship (tools/make-test-ship3.cjs, 3 decks, the layout varied by a seed) runs
// through HVAC Grid the way a designer starts a ship - no BOX project, only the general-arrangement DXFs:
//  ① the three deck DXFs into BOX (D1 an R12 drawing in code page ANSI_949), each deck's name, Z and height in the deck
//    list, the hull outline (OL) on every edge of the deck outline (square, chamfered, tapered or curved bow);
//  ② the room inputs pasted into BOX CAL's room list (systems, persons, fresh air, equipment, ACH, ceiling, temperatures
//    - N3.inputs.json, what a designer types), the waterline off in the design conditions (an accommodation block above
//    the weather deck), the loads, the design data;
//  ③ airflow (one summer airflow, AGENTS.md F-1), the hospital exhaust fan placed in the linen store (위치 지정);
//  ⑤ SOLAS with the engine room below; ④ every deck and system AUTO; outputs (project, XLSX, DXF, report), the project
//  saved and opened again. Throughout: no BOX-made deck id ("D1792…0.42…") shows where a deck name belongs.
// Writes out/n3/<seed>/: the drawings, screenshots, summary.json and summary.md (what passed, what to look at).
//   node test/e2e/n3.e2e.cjs [seed]      (default: today's date as YYYYMMDD - a new ship every day)
'use strict';
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { launch } = require('../../tools/browser.cjs'), { start } = require('../../tools/serve.cjs'), N3 = require('../../tools/make-test-ship3.cjs'), { readWorkbook } = require('../../lib/xlsx-read.cjs');
// a deck id BOX makes up for a deck opened from a DXF: "D" + timestamp + "0." + random digits
const DECK_ID = /D\d{12,}\.\d{4,}/;
const ROOT = path.join(__dirname, '..', '..');
const today = () => { const d = new Date(); return +`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const seed = +(process.argv[2] || today()), OUT = path.join(ROOT, 'out', 'n3', String(seed));

// BOX room-list fields from the input sheet (windows, activity and equipment latent heat are in the room load popup,
// not the list - left at BOX's defaults here)
const LIST_FIELDS = ['sup', 'exh', 'ret', 'people', 'minimumFreshAir', 'equipW', 'minimumAch', 'lighting', 'coolTemp', 'coolingRh', 'heatTemp', 'heatingRh', 'ceilingHeight'];

(async () => {
 fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
 const made = N3.write(OUT, seed), inp = JSON.parse(fs.readFileSync(path.join(OUT, 'N3.inputs.json'), 'utf8'));
 const summary = { seed, ship: made, variant: inp.variant, plan: inp.plan, startedAt: new Date().toISOString(), steps: [], findings: [] };
 const s = await start(), b = await launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 }, acceptDownloads: true }), ctx = p.context(), errors = [], t0 = Date.now();
 p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
 const prompts = [];   // answers for BOX's prompt() (deck names)
 p.on('dialog', d => { if (d.type() === 'prompt' && prompts.length) return d.accept(prompts.shift()); summary.findings.push({ level: 'info', at: 'dialog', text: d.message().slice(0, 300) }); d.accept(); });
 const leaks = [], leak = (where, text) => { const m = String(text).match(DECK_ID); if (m) leaks.push(`${where}: …${String(text).slice(Math.max(0, m.index - 60), m.index + 40).replace(/\s+/g, ' ')}…`); };
 const scan = async where => leak(where, await H(() => document.body.innerText));
 const shot = (n, page = p) => page.screenshot({ path: path.join(OUT, n + '.png') });
 const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);
 const step = (name, detail) => { summary.steps.push({ name, s: +((Date.now() - t0) / 1000).toFixed(1), ...detail }); log(name, JSON.stringify(detail)); };
 const ribbon = label => p.locator('#ribbon .cmd', { hasText: label }).first();
 const idle = () => p.waitForFunction(() => document.getElementById('busy').hasAttribute('hidden'), null, { timeout: 900000 });
 const H = (f, a) => p.evaluate(f, a);
 // a CAL table opens in its own window: the command, then that window
 const popup = async label => { const [w] = await Promise.all([ctx.waitForEvent('page', { timeout: 180000 }), ribbon(label).click()]); await w.waitForLoadState(); return w; };
 let failed = null;
 try {
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 30000 }); await idle();
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });

  // ① drawings -> BOX decks
  for (const [i, d] of inp.decks.entries()) {
   const bytes = [...fs.readFileSync(path.join(OUT, `N3_${d.id}.dxf`))];
   await H(([bytes, name]) => HVACGrid.box.setFile('dxfFile', new File([new Uint8Array(bytes)], name, { type: 'application/dxf' })), [bytes, `N3_${d.id}.dxf`]);
   await p.waitForFunction(n => HVACGrid.box.win.CAD_APP.stack.decks.length === n, i + 1, { timeout: 120000 });
  }
  const boxRooms = await H(() => HVACGrid.box.win.CAD_APP.rooms().map(r => ({ no: r.no, name: r.name, deck: r.deck })));
  const missing = inp.rooms.filter(r => !boxRooms.some(x => x.no === r.no && x.name === r.name));
  step('① DXF → BOX', { decks: inp.decks.length, rooms: boxRooms.length, want: inp.rooms.length, missing: missing.map(r => `${r.no} ${r.name}`) });
  assert.equal(missing.length, 0, 'every room of the drawings found by BOX with its number and name (D1: R12 ANSI_949)');
  // deck name (BOX asks with a prompt on a double click), Z and height, typed in the deck list
  prompts.push(...inp.decks.map(d => d.name));
  await H(() => { const W = HVACGrid.box.win, doc = HVACGrid.box.doc;
   for (const d of W.CAD_APP.stack.decks) doc.querySelector(`#deckList [data-deck-action="activate"][data-deck-id="${CSS.escape(d.id)}"]`)?.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true })); });
  const decks = await H(async decks => { const W = HVACGrid.box.win, doc = HVACGrid.box.doc, A = W.CAD_APP;
   A.stack.decks.forEach((d, i) => { for (const [field, v] of [['z', decks[i].z], ['height', decks[i].height]]) {
    const el = doc.querySelector(`#deckList [data-deck-field="${field}"][data-deck-id="${CSS.escape(d.id)}"]`); el.value = String(v); el.dispatchEvent(new W.Event('change', { bubbles: true })); } });
   return A.stack.decks.map(d => [d.name, d.z, d.height]); }, inp.decks);
  // the hull outline, bottom and top (OL tool, 하부·상부 외곽선): every edge of every deck's outline (4 for a square bow,
  // 6 chamfered or tapered, 14 curved; BOX's y is the drawing's -y)
  const ol = await H(([outlines, rooms]) => { const A = HVACGrid.box.win.CAD_APP, done = [];
   A.stack.decks.forEach((d, i) => { A.st.activeDeck = d.id; const o = outlines[i]; o.forEach((p, k) => { const q = o[(k + 1) % o.length];
    // a point on the edge clear of every room corner: at a corner an inner wall meets the hull and a click there may take
    // the inner wall (a chamfered bow's midpoint is often where the corridor wall ends)
    const t = [0.37, 0.29, 0.43, 0.61, 0.23, 0.71].find(t => { const x = p[0] + t * (q[0] - p[0]), y = p[1] + t * (q[1] - p[1]); return !rooms.some(r => r.points.some(v => Math.hypot(v[0] - x, v[1] - y) < 150)); }) ?? 0.37;
    // bottom and top outline on the same line: the accommodation walls stand vertical. Without a top outline BOX takes
    // the stack of deck outlines as the hull - wrong for a stepped superstructure (N3 run 2026-10-22, BOX fix 2026-10-22)
    const pt = { x: p[0] + t * (q[0] - p[0]), y: -(p[1] + t * (q[1] - p[1])) }; done.push(!!A.designateOutlineAt(pt, 'HULL_BOTTOM') && !!A.designateOutlineAt(pt, 'HULL_TOP')); }); });
   return { done: done.filter(Boolean).length, issues: A.outlineAssignmentIssues().map(x => `${x.deck} ${x.reason}`) }; }, [inp.decks.map(d => d.outline), inp.rooms.filter(r => true).map(r => ({ points: r.points }))]);
  step('① Deck Z·높이, 하부 외곽선', { decks, outline: ol });
  assert.equal(ol.done, inp.decks.reduce((t, d) => t + d.outline.length, 0), 'every outline edge designated'); assert.deepEqual(ol.issues, []); assert.deepEqual(decks.map(d => d[0]), inp.decks.map(d => d.name), 'deck names typed');
  await H(() => HVACGrid.box.click('fitBtn')).catch(() => {}); await p.waitForTimeout(500); await shot('1-box-drawings');

  // ② room inputs pasted into the CAL room list
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
  await list.waitForTimeout(1500); await shot('2-room-list', list);
  const autoClass = await list.evaluate(() => [...document.querySelectorAll('[data-room-field="isoClass"][placeholder^="자동"]')].map(e => e.placeholder.slice(4)));
  step('② 격실 입력 붙여넣기', { ...pasted, isoClassAuto: Object.entries(autoClass.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {})) });
  assert.deepEqual(pasted.unmatched, []);
  await list.close();
  // design conditions: no waterline (the block is above the weather deck)
  const dc = await popup('설계 조건'); await dc.waitForSelector('select, input', { timeout: 60000 });
  const wl = await dc.evaluate(() => { const el = document.querySelector('[data-design-field="waterlineEnabled"], [data-field="waterlineEnabled"], select[name="waterlineEnabled"]');
   if (!el) return { found: false, fields: [...document.querySelectorAll('[data-design-field],[data-field]')].slice(0, 8).map(e => e.outerHTML.slice(0, 120)) };
   el.value = 'off'; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('input', { bubbles: true }));
   const apply = [...document.querySelectorAll('button')].find(x => /적용|저장|확인/.test(x.textContent)); apply?.click(); return { found: true, apply: apply?.textContent || null }; });
  step('② 설계 조건: 흘수선 미적용', wl); await shot('2-design-conditions', dc); await dc.close().catch(() => {});

  // ② the loads and the design data
  const lr = await popup('격실 부하'); await lr.waitForSelector('table', { timeout: 300000 }).catch(() => {}); await lr.waitForTimeout(1500); await shot('2-load', lr); await lr.close().catch(() => {});
  await ribbon('설계 데이터 만들기').click(); await idle();
  const c = await H(() => { const c = HVACGrid.S.contract; if (!c) return null; const pend = c.rooms.filter(r => !c.loads[r.id].complete);
   return { rooms: c.rooms.length, systems: c.systems.map(s => `${s.kind}:${s.id}`), plans: HVACGrid.plans().length, multi: [...new Set(HVACGrid.plans().filter(x => x.decks > 1).map(x => x.systemId))].sort(),
    pending: pend.map(r => `${r.no} ${r.name}: ${c.loads[r.id].status}`).slice(0, 10), pendingN: pend.length, iso: Object.entries(c.rooms.reduce((m, r) => (m[r.isoClass || '-'] = (m[r.isoClass || '-'] || 0) + 1, m), {})),
    supply: c.systems.filter(s => s.kind === 'supply').reduce((t, s) => t + s.designCmh, 0), deckZ: c.decks.map(d => d.elevationMm) }; });
  step('② 설계 데이터', c);
  assert.ok(c, 'design data made'); assert.equal(c.rooms, inp.rooms.length); assert.equal(c.pendingN, 0, 'every room load complete');
  assert.deepEqual(c.deckZ, inp.decks.map(d => d.z));

  // ③ airflow: one summer airflow (F-1)
  await p.click('.step[data-step=air]'); await idle();
  await H(() => { const d = HVACGrid.S.contract.decks.find(x => x.name === 'CREW DK'); if (d) { HVACGrid.S.deck = d.id; HVACGrid.render(); } }); await p.waitForTimeout(300); await shot('3-air');
  const air = await H(() => { const c = HVACGrid.S.contract, a = HVACGrid.analysis(); return { heatingBasis: Object.values(c.airflow).filter(x => x.basis === 'heating').length, zones: c.zones.map(z => `${z.supplySystemId} SA ${z.saCmh} OA ${z.oaCmh} ${z.ok ? '적합' : '부족'}`),
   checks: a.air.filter(x => x.level !== 'info').map(x => `${x.level} ${x.code} ${x.text}`) }; });
  step('③ 풍량·구역 수지', { zones: air.zones, heatingBasis: air.heatingBasis, airChecks: air.checks.length });
  assert.equal(air.heatingBasis, 0, 'F-1: no airflow set by heating');
  // the hospital exhaust fan has no fan room on its deck: placed by hand in the linen store (③ 위치 지정, a click on the room)
  const hos = await H(() => { const c = HVACGrid.S.contract, r = c.rooms.find(x => x.no === '232'), p = HVACGrid.plans().find(x => x.systemId === 'EF-HOS' && x.isUnitDeck);
   Object.assign(HVACGrid.S, { deck: p.deckId, sys: p.systemKey, kind: 'exhaust' }); HVACGrid.render(); return { room: r.id, key: p.key, before: p.rootSource }; });
  await ribbon('위치 지정').click(); await p.locator(`#plan .rm[data-room="${hos.room}"]`).click(); await idle();
  const placed = await H(k => ({ root: HVACGrid.plans().find(x => x.key === k).rootSource, msg: HVACGrid.S.msg }), hos.key);
  step('③ 의무실 배기팬 위치 지정', { before: hos.before, after: placed.root, msg: placed.msg });
  assert.equal(placed.root, 'user'); await scan('③ 상태줄'); await shot('3-air-root');
  for (const t of air.checks) summary.findings.push({ level: t.startsWith('fail') ? 'fail' : 'check', at: '풍량', text: t });

  // ⑤ SOLAS: the engine room below the lowest deck
  await p.click('.step[data-step=review]'); await idle();
  await p.locator('#report .tabs button', { hasText: '방화 (SOLAS)' }).click();
  await p.selectOption('#belowSel', '기관실 — A류'); await idle();
  const so = await H(() => { const a = HVACGrid.analysis(), c = HVACGrid.S.contract; return { unclassified: a.solas.summary.unclassified.map(id => { const r = c.rooms.find(x => x.id === id); return `${r.no} ${r.name}`; }), boundaries: a.solas.summary.boundaries }; });
  step('⑤ SOLAS 분류', so);
  for (const r of so.unclassified) summary.findings.push({ level: 'check', at: 'SOLAS', text: `미분류: ${r}` });

  // ④ every deck and system: AUTO
  const ta = Date.now(); await ribbon('모든 계통 AUTO').click(); await idle();
  const a = await H(() => { const a = HVACGrid.analysis(); return { done: a.done, total: a.total, count: a.count, checks: a.checks.filter(k => k.level !== 'ok').map(k => `${k.level} ${k.text}`), out: a.solas.summary.outsideM,
   pens: a.solas.summary.penetrations, fd: a.solas.summary.fireDampers, pass: a.solas.passages.filter(x => x.level === 'fail').map(x => `${x.systemId} ${x.text}`), unconnected: a.plans.reduce((t, p) => t + (a.results[p.key]?.unconnected || 0), 0),
   systems: a.systems.map(s => `${s.systemId} ${s.fanCmh} CMH ESP ${s.indexPa ?? '-'} Pa 팬 ${s.fanPa ?? '-'} Pa${s.complete ? '' : ' (미완료)'}`), relaxed: Object.values(a.results).filter(r => r.zonesRelaxed).length }; });
  step('④ 모든 계통 AUTO', { seconds: Math.round((Date.now() - ta) / 1000), done: `${a.done}/${a.total}`, count: a.count, penetrations: a.pens, fireDampers: a.fd, outsideM: a.out, unconnected: a.unconnected, relaxed: a.relaxed, systems: a.systems });
  for (const t of a.checks) summary.findings.push({ level: t.split(' ')[0], at: '검토', text: t.slice(t.indexOf(' ') + 1) });
  for (const t of a.pass) summary.findings.push({ level: 'fail', at: '제한 구역 통과', text: t });
  const tab = async (name, file) => { await p.locator('#report .tabs button', { hasText: name }).first().click(); await p.waitForTimeout(400); if (file) await shot(file); await scan('⑤ ' + name); };
  await tab('덕트망', '5-review-nets');
  await tab('계통·수직', '5-review-systems'); await tab('계통도', '5-diagram'); await tab('방화 (SOLAS)', '5-review-fire'); await tab('방화 등급도', '5-fire-plan');
  await p.click('.step[data-step=duct]'); await idle(); await H(() => HVACGrid.closeEditor()); await idle();
  await H(() => { const d = HVACGrid.S.contract.decks.find(x => x.name === 'CREW DK'); if (d) Object.assign(HVACGrid.S, { deck: d.id }); HVACGrid.render(); });
  await p.locator('.seg button', { hasText: '모든 계통' }).first().click().catch(() => {}); await idle(); await p.waitForTimeout(400); await shot('4-duct');
  assert.equal(a.done, a.total, 'AUTO done on every plan'); assert.equal(a.out, 0, 'no duct outside the decks');

  // outputs as real downloads, the project saved and opened again
  await p.click('.step[data-step=review]'); await idle();
  const dl = async (label, name) => { const [d] = await Promise.all([p.waitForEvent('download'), p.locator('#ribbon .cmd', { hasText: label }).first().click()]); const f = path.join(OUT, name); await d.saveAs(f); return fs.statSync(f).size; };
  const outs = { project: await dl('프로젝트 저장', 'n3.project.json'), xlsx: await dl('통합 XLSX', 'n3.xlsx'), dxf: await dl('통합 DXF', 'n3.dxf'), report: await dl('보고서', 'n3.report.html') };
  leak('보고서', fs.readFileSync(path.join(OUT, 'n3.report.html'), 'utf8').replace(/<[^>]+>/g, ' '));
  for (const [name, rows] of Object.entries(readWorkbook(fs.readFileSync(path.join(OUT, 'n3.xlsx'))))) leak('XLSX ' + name, rows.map(r => r.join(' ')).join(String.fromCharCode(10)));
  leak('통합 DXF', fs.readFileSync(path.join(OUT, 'n3.dxf'), 'latin1'));
  step('Deck id 노출 검사', { leaks });
  for (const t of leaks) summary.findings.push({ level: 'fail', at: 'Deck id 노출', text: t });
  const answer = () => p.locator('#dlg[open] button[data-v=discard]').click({ timeout: 3000 }).catch(() => {});
  const opening = H(() => HVACGrid.openSample('s5')); await answer(); await opening; await idle();
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#openProjectBtn').then(() => p.click('#fileMenu button[data-a=open]')).then(answer)]);
  await chooser.setFiles(path.join(OUT, 'n3.project.json')); await idle();
  await p.waitForFunction(n => HVACGrid.S.contract?.rooms.length === n, inp.rooms.length, { timeout: 60000 });
  const back = await H(() => { const a = HVACGrid.analysis(); return { done: a.done, total: a.total, pens: a.solas.summary.penetrations, box: !!HVACGrid.S.boxFile }; });
  step('출력·프로젝트 왕복', { bytes: outs, reopened: back });
  assert.equal(back.done, a.done); assert.equal(back.pens, a.pens); assert.deepEqual(leaks, [], 'no BOX-made deck id shown');
  step('페이지 오류', { count: errors.length, first: errors.slice(0, 5) });
  assert.equal(errors.length, 0, 'no page errors');
 } catch (e) { failed = e; summary.findings.push({ level: 'fail', at: 'E2E', text: String(e.message || e).slice(0, 500) }); await shot('fail').catch(() => {}); }
 finally {
  await b.close(); await s.close();
  summary.result = failed ? 'FAIL' : 'PASS'; summary.endedAt = new Date().toISOString();
  // what is wrong with the program (a failed step, a page error, a deck id shown) apart from what the rules say of the design
  const program = summary.findings.filter(f => ['E2E', 'Deck id 노출', 'dialog'].includes(f.at)), design = summary.findings.filter(f => !program.includes(f));
  summary.programIssues = program.length;
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  const md = [`# N3 시험선 실행 — seed ${seed} · ${summary.result}`, '', `${made.lengthMm / 1000} × 14 m · ${made.rooms}실 (${made.perDeck}) · ${summary.startedAt}`, '', '## 단계', '',
   `외곽선: 선수 ${({ rect: '직각', chamfer: '모따기', taper: '테이퍼', curve: '곡선' })[inp.variant.bow]}${inp.variant.stepped ? ` · 3층 ${inp.variant.step / 1000} m 짧음` : ''} · 복도 ${({ straight: '일직선', offset: '한쪽 치우침', jog: '꺾임' })[inp.variant.corridor]} · 조리실 ${inp.variant.galleyPort ? '좌현' : '우현'} · 의무실 ${inp.variant.hospPort ? '좌현' : '우현'}${inp.plan != null ? ` (20일 계획 ${inp.plan + 1}일째)` : ''}`, '',
   ...summary.steps.map(x => `- **${x.name}** (${x.s} s): \`${JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => !['name', 's'].includes(k)))).slice(0, 600)}\``), '',
   '## 프로그램 이상', '', ...(program.length ? program.map(f => `- ${f.at} · ${f.text}`) : ['- 없음']), '',
   '## 설계 확인 사항 (규칙이 잡은 것 — 시험선 배치·입력에 따름)', '', ...(design.length ? design.map(f => `- ${f.level} · ${f.at} · ${f.text}`) : ['- 없음']), ''];
  fs.writeFileSync(path.join(OUT, 'summary.md'), md.join('\n'));
  // the same as a PowerPoint report with the step captures (tools/n3-report-pptx.cjs)
  try { console.log('PPT', path.relative(ROOT, await require('../../tools/n3-report-pptx.cjs').build(OUT))); } catch (e) { console.log('PPT 만들기 실패:', e.message); }
  console.log(failed ? 'E2E N3 FAIL ' + (failed.stack || failed) : 'E2E N3 PASS', '→', path.relative(ROOT, OUT));
  if (failed) process.exit(1);
 }
})();
