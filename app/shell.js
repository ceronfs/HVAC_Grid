// HVAC Grid shell: one workflow over BOX CAL (rooms, loads) and PHG D (RUs, ducts) - docs/UI_REVIEW.md, UI_DESIGN_REVIEW.md.
// ① 도면·격실 and ② 부하 show BOX (the shell's layers over it when switched on); ③ 풍량·계통, ④ RU·덕트 and ⑤ 검토·출력 are the shell's own plan over the HVAC Grid
// project (lib/*.cjs: contract, plans per deck and system, vertical ducts, SOLAS, outputs) on BOX's canvas - ⑤ with its
// tables in a dock under it; PHG D's own screen only as ④'s detail editor. The vendor apps are driven through
// app/bridge.js and never modified.
'use strict';
(async () => {
 const B = window.HVACGridBridge, $ = id => document.getElementById(id);
 const show = (el, on) => el.toggleAttribute('hidden', !on);   // works for the SVG plan too (no .hidden property on SVG elements)
 const LIB = await B.loadLibs('../lib/', ['util.cjs', 'geom.cjs', 'solas-data.json', 'solas.cjs', 'contract.cjs', 'phg-plan.cjs', 'ducts.cjs', 'risers.cjs', 'project.cjs', 'xlsx.cjs', 'plan-svg.cjs', 'diagram.cjs', 'dxf-out.cjs', 'fire-plan.cjs', 'report.cjs', 'k-change.cjs']);
 const K = LIB.contract, PL = LIB['phg-plan'], PJ = LIB.project, SO = LIB.solas, XL = LIB.xlsx, DX = LIB['dxf-out'], RP = LIB.report, SVG = LIB['plan-svg'], U = LIB.util, GE = LIB.geom, DG = LIB.diagram, FP = LIB['fire-plan'], KCH = LIB['k-change'];
 const esc = U.esc, fmt = v => v == null || v === '' || Number.isNaN(+v) ? '—' : Math.round(v).toLocaleString();
 const box = new B.Box($('boxFrame')), phg = new B.Phg($('phgFrame'));
 const S = { step: 'room', contract: null, deck: null, room: null, kind: 'supply', sys: null, filter: 'all', overlay: 'air', tab: 'nets', gradeFilter: null, focus: null, projects: {}, results: {}, geometry: {}, active: null,
  pickRoot: false, msg: '', msgErr: false, phgDocked: false, undo: [], redo: [], dockOpen: true, dockH: null, layers: {}, deckGhost: false };
 // ⑤'s dock: open or folded, and its height, kept for the next start (a viewer's convenience only)
 try { const d = JSON.parse(localStorage.getItem('hvac-grid-dock') || '{}'); if (d.open === false) S.dockOpen = false; if (d.h > 0) S.dockH = d.h; } catch {}
 // the plan's layers switched per step and the deck filter (layerPanel), kept the same way
 try { const l = JSON.parse(localStorage.getItem('hvac-grid-layers') || '{}'); if (l.layers && typeof l.layers === 'object') S.layers = l.layers; S.deckGhost = !!l.ghost; S.dropAuto = !!l.dropAuto; } catch {}
 const saveDock = () => { try { localStorage.setItem('hvac-grid-dock', JSON.stringify({ open: S.dockOpen, h: S.dockH })); } catch {} };
 let plansCache = null, analysisCache = null;
 const invalidate = () => { plansCache = null; analysisCache = null; };
 const plans = () => plansCache || (plansCache = S.contract ? PL.plan(S.contract) : []);
 const project = () => PJ.make({ contract: S.contract, projects: S.projects, results: S.results, geometry: S.geometry });
 const analysis = () => analysisCache || (analysisCache = S.contract ? PJ.analyze(project(), plans()) : null);
 // a result is current only while its plan is what it was made from (no signature = an old file = stale)
 const result = key => { const r = S.results[key]; if (!r) return null; const p = plans().find(x => x.key === key); return { ...r, stale: !p || !r.sig || r.sig !== PJ.planSig(p) }; };
 const keyOf = (deck, sys) => `${deck}__${sys}`;
 // a plan key as the user reads it: deck name · system (BOX makes the deck id up for a drawing opened as DXF)
 const keyText = k => S.contract ? PJ.planLabel(S.contract, k, plans()) : String(k).replace('__', ' · ');
 const curKey = () => S.deck && S.sys ? keyOf(S.deck, S.sys) : null;
 const curPlan = () => plans().find(p => p.key === curKey()) || null;
 const deckPlans = kind => plans().filter(p => p.deckId === S.deck && (!kind || p.kind === kind));
 const deckName = id => S.contract?.decks.find(d => d.id === id)?.name || id;
 const roomName = id => { const r = S.contract?.rooms.find(x => x.id === id); return r ? `${r.no} ${r.name}` : ''; };
 const KL = PL.KIND_LABEL, FIELD = PL.FLOW_FIELD;
 // system colours without the red / green of errors and OK, each >= 4.4:1 on white (docs/UI_DESIGN_REVIEW.md 7)
 const SYS_COLORS = ['#1f5fa8', '#c05a00', '#00796b', '#6a3d9a', '#a0307a', '#5f6f00', '#8c564b', '#0b7a9e', '#4f5b66', '#8a6d00'];
 const sysColor = id => { const ids = [...new Set((S.contract?.systems || []).map(s => s.id))].sort(); return SYS_COLORS[ids.indexOf(id) % SYS_COLORS.length] || '#888'; };
 const rootText = RP.ROOT_TEXT;
 const UNIT_WORD = { supply: 'AHU', exhaust: 'FAN', return: 'RA' };

 // ---------- icons (20 x 20 strokes) ----------
 const P = { open: 'M3 6h5l2 2h7v8H3z', bg: 'M3 4h14v12H3zM6 13l3-4 2 2 3-4', json: 'M7 4c-2 0-2 1-2 3s-1 3-2 3c1 0 2 1 2 3s0 3 2 3M13 4c2 0 2 1 2 3s1 3 2 3c-1 0-2 1-2 3s0 3-2 3', save: 'M4 3h10l3 3v11H4zM7 3v5h6V3', dxfOut: 'M4 3h8l4 4v10H4zM10 9v6M7 12l3 3 3-3',
  undo: 'M7 5L3 9l4 4M3 9h9a4 4 0 010 8H9', redo: 'M13 5l4 4-4 4M17 9H8a4 4 0 000 8h3', fit: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4', reset: 'M4 10a6 6 0 106-6H6M6 1L3 4l3 3',
  ol: 'M3 14l4-9h6l4 9zM3 14h14', olu: 'M3 8l4-5h6l4 5zM3 8h14M10 11v6', olv: 'M3 14l4-9h6l4 9zM7 11l2 2 4-4', vl: 'M3 10h3M8 10h3M13 10h4', area: 'M4 4h12v12H4zM4 4l12 12', apoly: 'M4 4h12v12H4zM8 8h4v4H8z', roomNo: 'M4 4h12v12H4zM8 8h4M8 12h4', roomFix: 'M4 4h12v12H4zM10 7v6M7 10h6', list: 'M4 5h12M4 10h12M4 15h12', face: 'M3 6l7-3 7 3v8l-7 3-7-3zM10 3v14',
  check: 'M4 10l4 4 8-8', lines: 'M3 6h14M3 10h9M3 14h5M15 12l2 2-2 2', geo: 'M4 15l6-11 6 11z', cube: 'M10 2l7 4v8l-7 4-7-4V6zM10 2v8l7 4M10 10l-7 4', water: 'M3 12c2-2 4-2 6 0s4 2 6 0M3 16c2-2 4-2 6 0s4 2 6 0', sample: 'M5 3h10v14H5zM8 7h4M8 10h4M8 13h2',
  cal: 'M4 3h12v14H4zM7 6h6M7 9h1M10 9h1M7 12h1M10 12h1M7 15h6', cond: 'M10 3v10M7 13a3 3 0 106 0', bound: 'M3 3h14v14H3zM3 10h14', kIso: 'M5 4v12M5 10l8-6M8 8l6 8', kApply: 'M4 4v12M4 10l6-6M6 8l5 7M12 13l2 2 4-4', kLayer: 'M3 5h14M3 9h14M3 13h14M3 17h14', kUser: 'M10 9a3 3 0 100-6 3 3 0 000 6zM4 17c0-3 3-5 6-5s6 2 6 5',
  load: 'M4 16V8M10 16V4M16 16v-6', oa: 'M3 10h10M10 6l4 4-4 4M16 4v12', rh: 'M6 16c0-4 4-4 4-8M10 16c0-4 4-4 4-8', xlsx: 'M3 3h14v14H3zM3 8h14M8 3v14', xlsxIso: 'M3 3h14v14H3zM3 8h14M8 3v14M11 11l4 4', xlsxAll: 'M2 5h12v12H2zM6 2h12v12', sum: 'M14 4H5l5 6-5 6h9', sheet: 'M3 3h14v14H3zM3 7h14M3 11h14M3 15h14',
  contract: 'M5 3h7l3 3v11H5zM8 9h5M8 12h5M3 7h4M3 11h4', rule: 'M3 15h14M5 15V9M9 15V6M13 15v-4', root: 'M4 4h12v12H4zM7 13l3-6 3 6M8 11h4', pin: 'M10 17s5-5 5-9a5 5 0 00-10 0c0 4 5 9 5 9zM10 6v4', unpin: 'M5 5l10 10M10 17s5-5 5-9a5 5 0 00-10 0c0 4 5 9 5 9',
  send: 'M3 10h11M10 6l4 4-4 4M17 4v12', auto: 'M4 14l4-4 3 3 5-6M13 7h3v3', refresh: 'M5 10a5 5 0 019-3M15 10a5 5 0 01-9 3M14 3v4h-4M6 17v-4h4', all: 'M3 5h4v4H3zM3 11h4v4H3zM9 7h8M9 13h8',
  ru: 'M5 5h10v10H5zM10 8v4M8 10h4', ruAuto: 'M4 4h8v8H4zM14 10l3 3-3 3', flow: 'M3 7h8a2.5 2.5 0 10-2.5-2.5M3 11h11a2.5 2.5 0 11-2.5 2.5M3 15h5', zone: 'M3 3h14v14H3zM3 3l14 14', cmp: 'M3 4h6v12H3zM11 4h6v12h-6z', set: 'M10 7a3 3 0 100 6 3 3 0 000-6zM10 2v3M10 15v3M2 10h3M15 10h3M4.3 4.3l2.1 2.1M13.6 13.6l2.1 2.1M4.3 15.7l2.1-2.1M13.6 6.4l2.1-2.1',
  ml: 'M2 10h16M2 7h16M2 13h16', br: 'M3 6h14M10 6v11', sbr: 'M3 5h14M8 5v6h8', ad: 'M3 8h14M3 12h14', calc: 'M3 6h14v8H3zM7 6v8', noise: 'M3 8h3l4-4v12l-4-4H3z', press: 'M10 3a7 7 0 107 7M10 10l4-4', csv: 'M4 3h8l4 4v10H4zM7 10h6M7 13h6',
  dockL: 'M3 4h14v12H3zM7 4v12', dockR: 'M3 4h14v12H3zM13 4v12', fire: 'M10 17c-3 0-5-2-5-5 0-4 5-5 4-9 3 2 6 5 6 9 0 3-2 5-5 5z', air: 'M3 7h8a2.5 2.5 0 10-2.5-2.5M3 13h11a2.5 2.5 0 11-2.5 2.5', report: 'M5 3h10v14H5zM8 7h4M8 10h4M8 13h4', deck: 'M3 6h14M3 10h14M3 14h14M10 3v14' };
 const icon = n => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${P[n] || P.list}"/></svg>`;

 // ---------- helpers ----------
 function say(text, err = false) { S.msg = text; S.msgErr = err; status(); if (err) toast(text, true); }
 // a message that stays a few seconds over the window (errors and finished long work)
 let toastTimer = null;
 function toast(text, err = false) { const t = $('toast'); t.textContent = text; t.classList.toggle('err', err); show(t, true); clearTimeout(toastTimer); toastTimer = setTimeout(() => show(t, false), err ? 7000 : 4000); }
 // busy: text, and for long work a progress bar (done / total) with the time left, and a stop button
 function busy(text, { done = null, total = null, eta = null, stop = null } = {}) {
  show($('busy'), !!text); $('busyText').textContent = text || '';
  show($('busyBar'), total != null); if (total != null) $('busyFill').style.width = `${Math.round(done / total * 100)}%`;
  $('busyEta').textContent = eta != null ? `남은 시간 약 ${eta < 60 ? Math.max(1, Math.round(eta)) + '초' : Math.round(eta / 60) + '분'}` : '';
  show($('busyStop'), !!stop); $('busyStop').onclick = stop; $('busyStop').disabled = false;
 }
 async function act(label, fn) {
  try { if (label) busy(label); await fn(); } catch (e) { console.error(e); say(e.message || String(e), true); } finally { busy(null); render(); if (document.activeElement?.tagName === 'IFRAME' && !frameOnScreen()) document.activeElement.blur(); }
 }
 function pickFile(accept) {
  return new Promise(resolve => { const input = $('pick'); input.value = ''; input.accept = accept || ''; input.onchange = () => input.files[0] && resolve(input.files[0]); input.click(); });
 }
 // ---------- files: real save and open where the browser has file pickers (Edge, Chrome); else download / file input.
 // Automated runs (navigator.webdriver) keep the download path.
 const FS = typeof window.showSaveFilePicker === 'function' && !navigator.webdriver;
 const KIND = { json: ['HVAC Grid 프로젝트', 'application/json'], xlsx: ['Excel 통합 문서', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], dxf: ['DXF 도면', 'application/dxf'], html: ['HTML 보고서', 'text/html'], csv: ['CSV', 'text/csv'] };
 // saves data as name (asks where, unless handle); resolves { name, handle } or null when the user cancels
 async function saveFile(name, data, { handle = null, id = 'out' } = {}) {
  const ext = name.split('.').pop(), [desc, type] = KIND[ext] || ['파일', 'application/octet-stream'];
  if (!FS) { download(name, data, type); return { name, handle: null }; }
  let h = handle;
  if (!h) { try { h = await window.showSaveFilePicker({ suggestedName: name, id: 'hvac-grid-' + id, startIn: 'documents', types: [{ description: desc, accept: { [type]: ['.' + ext] } }] }); } catch (e) { if (e.name === 'AbortError') return null; throw e; } }
  const w = await h.createWritable(); await w.write(new Blob([data], { type })); await w.close();
  return { name: h.name, handle: h };
 }
 // recent project files: their handles in IndexedDB (they survive restarts; opening one asks for permission again)
 const idb = () => new Promise((res, rej) => { const r = indexedDB.open('hvac-grid', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
 async function recentFiles() { try { const db = await idb(); return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get('recent'); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch { return []; } }
 async function remember(handle) {
  try { const list = await recentFiles(), keep = [];
   for (const x of list) if (!(await x.handle.isSameEntry(handle))) keep.push(x);
   const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put([{ name: handle.name, handle, at: Date.now() }, ...keep].slice(0, 6), 'recent'); } catch {}
 }
 function download(name, data, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
 }
 const stamp = () => U.localStamp();
 // work that would be lost (PHG D results) - ask first
 // an in-app dialog (title HVAC Grid, not the browser's): resolves with the value of the button pressed (Esc: cancel)
 function ask(text, buttons) {
  const d = $('dlg'); $('dlgText').textContent = text;
  $('dlgBtns').innerHTML = buttons.map(([v, label, primary]) => `<button class="btn${primary ? ' primary' : ''}" data-v="${v}">${esc(label)}</button>`).join('');
  return new Promise(done => { const end = v => { d.close(); done(v); }; $('dlgBtns').querySelectorAll('button').forEach(b => b.onclick = () => end(b.dataset.v)); d.oncancel = e => { e.preventDefault(); end('cancel'); }; d.showModal(); d.querySelector('.primary')?.focus(); });
 }
 // work that would be lost (PHG D results, edits not saved): save first, go on without saving, or stay
 async function keepsWork(what) {
  if (!Object.keys(S.results).length && !S.dirty) return true;
  const v = await ask(`${what}: 지금 작업(PHG D 결과 ${Object.keys(S.results).length}개, 실행 취소 기록)이 사라집니다. 저장할까요?`, [['save', '저장하고 계속', true], ['discard', '저장하지 않고 계속'], ['cancel', '취소']]);
  if (v === 'save') return await saveProject();
  return v !== 'cancel';
 }

 // ---------- contract edits (undo / redo in the shell's own views) ----------
 // an entry keeps the design data and, for the plans the edit touched (keys), their duct work: the PHG D project, the
 // result and the plan drawing - undo puts the plan back as it was, not the new ducts under RUs that went back
 const workOf = keys => Object.fromEntries(keys.map(k => [k, { project: S.projects[k] ?? null, result: S.results[k] ? JSON.stringify(S.results[k]) : null, geometry: S.geometry[k] ? JSON.stringify(S.geometry[k]) : null }]));
 function record(label, keys = []) {
  if (keys.length) keepActive();
  S.undo.push({ label, contract: JSON.stringify(S.contract), keys, work: workOf(keys) }); if (S.undo.length > 60) S.undo.shift(); S.redo = []; S.dirty = true;
 }
 function edit(label, fn, keys = []) { record(label, keys); fn(); invalidate(); }
 function stepHistory(from, to, verb) {
  const u = from.pop(); if (!u) { say(verb + '할 HVAC Grid 편집이 없습니다'); return; }
  const keys = u.keys || []; if (keys.length) keepActive();
  to.push({ label: u.label, contract: JSON.stringify(S.contract), keys, work: workOf(keys) });
  S.contract = JSON.parse(u.contract);
  for (const k of keys) {
   const w = u.work[k];
   if (w.project) S.projects[k] = w.project; else delete S.projects[k];
   if (w.result) S.results[k] = JSON.parse(w.result); else delete S.results[k];
   if (w.geometry) S.geometry[k] = JSON.parse(w.geometry); else delete S.geometry[k];
  }
  // PHG D still holds the project of before: it opens the restored one when it is needed next
  if (keys.includes(S.active)) S.active = null;
  invalidate(); S.duct = null; S.dirty = true; S.fieldErr = {}; pickSystem();
  say(`${verb}: ${u.label}`);
 }
 const undoShell = () => stepHistory(S.undo, S.redo, '실행 취소'), redoShell = () => stepHistory(S.redo, S.undo, '다시 실행');

 // ---------- contract ----------
 function setContract(c, { keepWork = false } = {}) {
  const problems = K.validate(c); if (problems.length) throw new Error('설계 데이터 검사 실패: ' + problems.slice(0, 3).join(', '));
  S.contract = c; invalidate(); S.undo = []; S.redo = [];
  if (!keepWork) { S.projects = {}; S.results = {}; S.geometry = {}; S.active = null; }
  if (!c.decks.some(d => d.id === S.deck)) S.deck = (plans()[0] || {}).deckId || c.decks[0]?.id || null;
  S.room = null; pickSystem();
 }
 // the system shown for the deck and kind: keep the current one if the deck has it
 function pickSystem() {
  if (!deckPlans(S.kind).length && deckPlans().length) S.kind = deckPlans()[0].kind;
  const ids = deckPlans(S.kind).map(p => p.systemKey); if (!ids.includes(S.sys)) S.sys = ids[0] || null;
 }
 async function extractContract() {
  await box.load();
  const raw = await box.extract(); raw.source = { app: 'BOX CAL Enhance', file: 'vendor/BOX_CAL_Enhance.html', project: 'BOX 화면' };
  // made again after a change in BOX: the user's settings stay (risers, unit decks, SOLAS classes, transfer-air sources,
  // RU moves - those of rooms still there; the airflow worked out again with them), and so do the PHG D results - only
  // the plans that changed become "다시 보내기 필요" (their signatures no longer match), results of plans that are gone
  // are dropped
  const old = S.contract, next = K.carrySettings(old, K.buildContract(raw, old?.rules || {}));
  if (next.ruMoves) { const ids = new Set(PL.plan(next).flatMap(p => p.rus.map(u => u.id))); next.ruMoves = Object.fromEntries(Object.entries(next.ruMoves).filter(([k]) => ids.has(k))); }
  setContract(next, { keepWork: true });
  const keys = new Set(plans().map(p => p.key)), gone = Object.keys(S.results).filter(k => !keys.has(k));
  for (const k of gone) { delete S.results[k]; delete S.projects[k]; delete S.geometry[k]; } if (gone.includes(S.active)) S.active = null;
  const sup = S.contract.systems.filter(s => s.kind === 'supply'), stale = Object.keys(S.results).filter(k => result(k)?.stale).length;
  // SOLAS choices whose room or wall is not in the new drawing (G-3): said here, and kept on the 검토 tab
  const lost = old?.solas ? SO.staleSettings(S.contract) : { rooms: [], bounds: [] }, lostN = lost.rooms.length + lost.bounds.length;
  say(`설계 데이터 만듦: Deck ${S.contract.decks.length} · 격실 ${S.contract.rooms.length} · 계통 ${S.contract.systems.length} (급기 ${sup.length}) · 급기 ${fmt(sup.reduce((t, s) => t + s.designCmh, 0))} CMH${Object.keys(S.results).length ? ` · PHG D 결과 유지, 다시 보내기 ${stale}` : ''}${lostN ? ` · SOLAS 지정 ${lostN}건이 새 도면과 맞지 않음(실 ${lost.rooms.length} · 경계 ${lost.bounds.length}) — 검토 탭 참고` : ''}`);
  if (!S.contract.systems.length) toast('계통이 하나도 없습니다 — ② 격실 입력에서 실마다 SUP·EXH·RET 계통을 넣고 설계 데이터를 다시 만드세요', true);
  followBoxDeck(); S.step = 'air';
 }
 // an example opens as a user would: its drawing in BOX (① ② have it too), then the design data made from it (②) - not a
 // design data file next to an empty BOX. S5 is BOX's own example; T3 the test ship's BOX project and its SOLAS setting
 async function openSample(name = 's5') {
  if (!(await keepsWork('예제 열기'))) return;
  await box.load(); box.closeCal(); box.calSig = null;
  const w = box.win, ask = w.confirm; w.confirm = () => true;   // BOX asks before it replaces a drawing; the app has asked
  try {
   if (name === 't3') { const t = await (await B.get('../samples/t3/T3.box.json')).text(); box.setFile('jsonFile', new File([t], 'T3.box.json', { type: 'application/json' })); }
   else box.click('s5ExampleBtn');
  } finally { w.confirm = ask; }
  const n = name === 't3' ? 79 : 94;
  // the example's own room count: "at least" would pass at once over the other example (S5 has more rooms than T3) and
  // the design data would be made from the drawing BOX is still replacing (found by tools/offline-check.cjs)
  await B.until(() => { try { return box.hasDrawing() && box.win.CAD_APP.rooms().length === n; } catch { return false; } }, 180000, '예제 도면');
  // a new ship: nothing of the previous design data or its networks carries over
  Object.assign(S, { contract: null, projects: {}, results: {}, geometry: {}, active: null, file: null, duct: null, phgEditor: false, boxFile: null });
  if (phg.loading) phg.open(phg.blank, 'HVAC Grid');
  await extractContract();
  // T3's SOLAS settings (ship, the space below the lowest deck, room spaces): the zone balance uses the spaces, so the
  // airflow is worked out again; without the file (an old offline copy) the example stays open on the defaults
  if (name === 't3') {
   let solas = null; try { const res = await B.get('../samples/t3/T3.solas.json'); if (res.ok) solas = await res.json(); } catch { /* below */ }
   if (solas) { S.contract = K.applyRules({ ...S.contract, solas: { ...(S.contract.solas || {}), ...solas } }); invalidate(); }
   else toast('T3 SOLAS 설정 파일(samples/t3/T3.solas.json)을 읽지 못했습니다 — 선종·최하층 아래 공간은 기본값입니다', true);
  }
  S.undo = []; S.redo = []; S.dirty = false;
  say(name === 't3' ? `T3 시험선: 도면(①)과 설계 데이터를 열었습니다 — 4 Deck · ${S.contract.rooms.length}실 · 다층 계통` : `S5 예제: 도면(①)과 설계 데이터를 열었습니다 — 5 Deck · ${S.contract.rooms.length}실`);
 }
 // 새로 시작: the BOX drawing, the design data, every duct network and the edit history go; the app is as just opened
 async function newStart() {
  const work = Object.keys(S.results).length, drawing = box.loading && box.hasDrawing();
  if (!S.contract && !drawing) { say('이미 빈 상태입니다'); return; }
  const text = `BOX 도면${S.contract ? ', 설계 데이터' : ''}${work ? `, PHG D 덕트망 ${work}개` : ''}와 실행 취소 기록을 모두 비우고 처음부터 시작합니다.`;
  // edits not saved (ΔT, unit locations, SOLAS choices) are offered a save also without a duct network - as keepsWork does (#7)
  const v = await ask(S.dirty ? text + ' 저장하지 않은 편집이 있습니다. 저장할까요?' : text, S.dirty ? [['save', '저장하고 새로 시작', true], ['discard', '저장하지 않고 새로 시작'], ['cancel', '취소']] : [['ok', '새로 시작', true], ['cancel', '취소']]);
  if (v === 'cancel' || (v === 'save' && !(await saveProject()))) return;
  if (box.loading) {
   box.closeCal(); box.calSig = null;
   // BOX's own 새 도면 asks with confirm(); the user has just answered that here
   const w = box.win, c = w.confirm; w.confirm = () => true; try { box.click('newBtn'); } finally { w.confirm = c; }
  }
  if (phg.loading) phg.open(phg.blank, 'HVAC Grid');
  Object.assign(S, { contract: null, boxFile: null, projects: {}, results: {}, geometry: {}, active: null, undo: [], redo: [], dirty: false, file: null, deck: null, sys: null, room: null, duct: null, phgEditor: false, pickRoot: false, fieldErr: {} });
  invalidate(); await go('room'); say('새로 시작: 빈 도면입니다. ① 도면을 열거나 예제를 불러오세요.');
 }
 function applyDeltaT() {
  const v = +$('dT').value, pp = +$('pPct').value, pb = $('pBasis').value, mo = +$('minOa').value;
  const bad = [['dT', !(v >= 3 && v <= 15), '급기 ΔT는 3–15 K (ISO 7547 6.3)'], ['pPct', !(pp >= 0 && pp <= 30), '가압은 0–30 %'], ['minOa', !(mo >= 0 && mo <= 100), '최소 신기 비율은 0–100 %']].filter(x => x[1]);
  S.fieldErr = Object.fromEntries(bad.map(([id, , m]) => [id, { msg: m, value: $(id).value }]));
  if (bad.length) throw new Error(bad.map(x => x[2]).join(' · '));
  S.fieldErr = null;
  edit(`급기 ΔT ${v} K · 가압 ${pp} %`, () => { S.contract = K.applyRules(S.contract, { supplyDeltaTK: v, pressurizationPct: pp, pressurizationBasis: pb, minOaPct: mo }); });
  say(`급기 ΔT ${v} K · 가압 ${pb === 'supply' ? '급기' : '배기'}의 ${pp} % 적용: 급기 합계 ${fmt(S.contract.systems.filter(s => s.kind === 'supply').reduce((t, s) => t + s.designCmh, 0))} CMH`);
 }
 function setRoot(p) {
  const key = curKey(), pl = curPlan(); if (!key) return;
  // a unit or a shaft stands in a room of its deck
  const q = { x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 }, room = S.contract.rooms.find(r => r.deckId === S.deck && GE.inRoom(q, r));
  if (!room) { say('실 밖입니다 — 공조기·수직 덕트 위치는 실 안을 클릭하세요', true); return false; }
  // the unit of a supply system is an air handling unit; of an exhaust or return system a fan
  const what = pl?.isUnitDeck ? (pl.kind === 'supply' ? '공조기' : '팬') : '수직 덕트';
  edit(`${S.sys} ${what} 위치`, () => { S.contract.roots = { ...(S.contract.roots || {}), [key]: { x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 } }; }, [key]);
  // the room named; a space that cannot take a unit or a shaft (stair, CO2, galley, machinery …) is said at once (and stays in ⑤ 검토)
  const space = analysis().solas.classes[room.id]?.space || '', bad = PJ.UNIT_BAD.test(space);
  S.pickRoot = false; say(`${S.sys} ${what} 위치: ${room.no} ${room.name} (${deckName(S.deck)})${bad ? ` — ${space}에는 ${what}를 둘 수 없습니다(피난로·화재 위험 구역). 다른 실을 고르세요` : ''}`, bad); return true;
 }
 function clearRoot() { const key = curKey(); if (!S.contract.roots?.[key]) return; edit('위치 지정 해제', () => { const { [key]: _, ...rest } = S.contract.roots; S.contract.roots = rest; }); say('지정 해제 — 팬룸·샤프트 또는 복도 끝을 씁니다'); }
 function setUnitDeck(deckId) { const pl = curPlan(); if (!pl) return; edit(`${pl.systemId} 공조기 Deck`, () => { S.contract.unitDecks = { ...(S.contract.unitDecks || {}), [pl.systemKey]: deckId }; }); say(`${pl.systemId} 공조기 Deck: ${deckName(deckId)}`); }
 function setSolasRoom(id, space) {
  const r = S.contract.rooms.find(x => x.id === id);
  edit(`${r.no} SOLAS 공간`, () => { const rooms = { ...(S.contract.solas?.rooms || {}) }; if (space) rooms[id] = { space }; else delete rooms[id]; S.contract.solas = { ...(S.contract.solas || {}), rooms }; });
  say(`${r.no} ${r.name}: ${space || '자동 분류'}`);
 }
 function setTransfer(id, from) {
  const r = S.contract.rooms.find(x => x.id === id);
  edit(`${r.no} 전달 공기 출처`, () => { const t = { ...(S.contract.transfers || {}) }; if (from) t[id] = from; else delete t[id]; S.contract = K.applyRules({ ...S.contract, transfers: t }); });
  const A = S.contract.airflow[id]; say(`${r.no} ${r.name}: 전달 공기 ${fmt(A.transferInCmh)} CMH ← ${A.transferFrom === 'own-inlet' ? '자체 흡입구' : A.transferFrom === 'outside' ? '이웃 없음' : roomName(A.transferFrom)}`);
 }
 function setSolas(field, value) { edit(`SOLAS ${field}`, () => { S.contract.solas = { ...(S.contract.solas || {}), [field]: value }; }); }

 // ---------- PHG D projects (one per deck and system) ----------
 // before another project opens in PHG D or the outputs are made: edits made in PHG D on the open project are read back
 // (result, geometry, project together - never the project alone, which would leave the result behind it)
 function keepActive() { if (!S.active || !phg.loading) return; if (!S.projects[S.active]) S.projects[S.active] = phg.serialize(); else readBackIfEdited(); }
 // keepSig: the result is read back from PHG D after an edit there - it is still what the old plan made, so it keeps that
 // plan's signature (a plan changed since stays "다시 보내기 필요")
 function store(key, extra = {}, { keepSig = false } = {}) {
  S.dirty = true;
  const pl = plans().find(p => p.key === key), old = S.results[key];
  S.projects[key] = phg.serialize(); S.geometry[key] = phg.geometry();
  S.results[key] = { ...(old || {}), ...phg.result(), ...extra, kind: pl?.kind, rootSource: pl?.rootSource, designCmh: pl?.designCmh, sig: keepSig ? old?.sig ?? null : pl ? PJ.planSig(pl) : null, at: Date.now() };
  delete S.results[key].stale;
  analysisCache = null;
 }
 async function loadPhg() {
  await phg.load();
  // the shell inspector shows the results, so PHG D's own right dock starts closed (패널 group in ④ opens it); on a
  // narrow window the left dock too - the shell's tree is already on the left
  if (!S.phgDocked) { S.phgDocked = true; if (phg.dockShown('right')) phg.click('phgb-right-panel'); if (phg.dockShown('left')) phg.click('phgb-left-panel');
   await B.until(() => !phg.dockShown('left') && !phg.dockShown('right'), 3000).catch(() => {}); }   // closed before the ribbon shows the panel buttons
 }
 // the window narrowed below 1440 px with PHG D open: its left dock closes (the shell's tree is already on the left)
 // a desktop program: closing the window with work not saved asks first; the launcher (tools/launch.cjs) keeps its local
 // server while the app says it is open (no server for the single file, dist/HVAC_Grid.html)
 addEventListener('beforeunload', e => { if (S.dirty && (Object.keys(S.results).length || S.undo.length)) { e.preventDefault(); e.returnValue = ''; } });
 if (!B.single) { const alive = () => fetch('../__alive', { method: 'POST', keepalive: true }).catch(() => {}); alive(); setInterval(alive, 5000);
  addEventListener('pagehide', () => navigator.sendBeacon('../__bye')); }
 let wideWindow = innerWidth >= 1440;
 addEventListener('resize', () => ribbonMore()); document.getElementById('ribbon').addEventListener('scroll', () => ribbonMore(), { passive: true });
 addEventListener('resize', () => { const w = innerWidth >= 1440; if (wideWindow && !w && phg.loading && phg.dockShown('left')) phg.click('phgb-left-panel'); wideWindow = w; });
 async function openKey(key) {
  await loadPhg(); if (S.active === key) return;
  keepActive(); S.active = key;
  phg.open(S.projects[key] || phg.blank, key);
 }
 async function sendPlan(key = curKey()) {
  const pl = plans().find(p => p.key === key); if (!pl) throw new Error('보낼 계통이 없습니다 (Deck·계통을 고르세요)');
  await loadPhg(); keepActive(); S.active = key;
  // the drawing the way round it was drawn: PHG D then shows the deck as ① - ④ do (bridge.js loadPlan)
  await phg.loadPlan(pl, PL.deckDxf(S.contract, pl.deckId, { cad: true }));
  S.results[key] = {}; store(key);
  say(`${deckName(pl.deckId)} · ${KL[pl.kind]} ${pl.systemId}: RU ${pl.rus.length}개 · ${fmt(pl.designCmh)} CMH를 PHG D로 보냄`);
 }
 // AUTO makes the network again: duct sizes set by hand are put back on the duct of the same name and kind in the new
 // network (a route that changed may not have it any more - said, not hidden); other edits made in the PHG D editor are
 // not kept by AUTO, the message says so (Ctrl+Z brings them back)
 async function autoKey(key = curKey(), { pick = 0 } = {}) {
  const r0 = result(key), manual = (S.geometry[key]?.ducts || []).filter(d => d.manualSize), wasEdited = !!r0?.edited && !manual.length;
  if (pick || S.active !== key || !r0 || r0.stale) await sendPlan(key);
  let r = await phg.auto({ pick }); const kept = [], lost = [];
  if (manual.length) {
   for (const m of manual) {
    // PHG D may number its ducts again after each calculation: read them again for every duct
    const d = (phg.geometry().ducts || []).find(x => x.displayName === m.displayName && x.type === m.type);
    if (!d) { lost.push(m.displayName); continue; }
    r = { ...r, ...(await phg.setDuctSize(d.id, m.diameterMm ? { diameterMm: m.diameterMm } : { widthMm: m.widthMm, heightMm: m.heightMm })) }; kept.push(m.displayName);
   }
  }
  store(key, { auto: true, seconds: r.seconds, candidate: r.candidate, candidates: r.candidates, pick: r.pick, unconnected: r.unconnected, zonesRelaxed: r.zonesRelaxed, edited: kept.length > 0 });
  const note = (kept.length ? ` · 수동 크기 ${kept.length}개 유지` : '') + (lost.length ? ` · 수동 크기 ${lost.length}개는 새 경로에 같은 덕트가 없어 다시 지정 필요(${lost.join(', ')})` : '') + (wasEdited ? ' · PHG D 편집기 수정은 AUTO로 다시 만들어짐(Ctrl+Z로 되돌리기)' : '');
  if (note) toast(`${keyText(key)}${note}`);
  say(`${keyText(key)}: 덕트 ${r.ducts}개 · ${r.lengthM} m · 최대 ${r.indexPa ?? '—'} Pa · ${r.seconds} s${note}${r.zonesRelaxed ? ({ all: ' · 금지 영역과 선체 밖 영역을 모두 해제해야 경로가 나옴 — 경로 검토', rooms: ' · 제한 구역을 지키는 경로가 없어 해제(선체 밖은 유지) — 경로 검토', outside: ' · 선체 밖 금지 영역을 풀어야 모든 RU에 닿음(제한 구역은 유지) — 실 밖 덕트 검토' }[r.zonesRelaxed] || '') : ''}`, !!r.zonesRelaxed);
 }
 // the plans one after another; 멈춤 stops after the plan running now (the done ones keep their results)
 async function runAll(keys = plans().map(p => p.key), { onlyNeeded = false } = {}) {
  const todo = onlyNeeded ? keys.filter(k => { const r = result(k); return !r?.auto || r.stale; }) : keys, t0 = performance.now();
  let stopped = false; const stop = () => { stopped = true; $('busyStop').disabled = true; $('busyText').textContent += ' — 지금 계통까지 하고 멈춤'; };
  let ran = 0;
  // one undo entry for the whole run: Ctrl+Z puts every network it made back as it was
  if (todo.length) record(`${onlyNeeded ? '남은 것만' : '모든 계통'} AUTO (${todo.length}개)`, todo);
  const rus = k => Math.max(1, plans().find(p => p.key === k)?.rus.length || 1), allRu = todo.reduce((t, k) => t + rus(k), 0);
  let doneRu = 0;
  for (const [i, key] of todo.entries()) {
   if (stopped) break;
   // after a few plans (or a tenth of the RUs): seconds per RU so far x RUs left
   const perRu = i >= 2 || doneRu >= allRu / 10 ? (performance.now() - t0) / 1000 / doneRu : null;
   busy(`${i + 1}/${todo.length} · ${keyText(key)} AUTO`, { done: i, total: todo.length, eta: perRu != null ? perRu * (allRu - doneRu) : null, stop: todo.length > 1 ? stop : null });
   await autoKey(key); ran++; doneRu += rus(key);
  }
  const done = keys.filter(k => result(k)?.auto && !result(k).stale).length;
  say(`AUTO ${stopped ? '멈춤' : '완료'}: ${done}/${keys.length} (이번에 ${ran}개${stopped ? ` · 남은 ${todo.length - ran}개는 "남은 것만"으로` : ''})`);
  if (todo.length > 1) toast(`AUTO ${stopped ? '멈춤' : '완료'}: ${done}/${keys.length}`);
 }
 // ---------- edits on the shared plan (④): they go to PHG D, which calculates again ----------
 // another route: the next of AUTO's good candidates
 async function reroute(key = curKey()) {
  const r0 = result(key); if (!r0?.auto) throw new Error('먼저 AUTO로 덕트망을 만드세요');
  if (r0.candidates === 1) throw new Error('PHG D가 찾은 경로가 하나뿐입니다 — RU나 공조기를 끌어서 옮기면 다른 경로가 나옵니다');
  record(`${keyText(key)} 다른 경로`, [key]);
  try { await autoKey(key, { pick: (r0.pick ?? 0) + 1 }); } catch (e) { S.undo.pop(); throw e; } const r = result(key); S.duct = null;
  say(`${keyText(key)}: 경로 후보 ${(r.pick ?? 0) + 1}/${r.candidates ?? '?'} · 덕트 ${r.ducts}개 · ${r.lengthM} m · 최대 ${r.indexPa ?? '—'} Pa`);
 }
 // a duct's section by hand (null: PHG D sizes it again); the network is calculated again in PHG D
 async function resizeDuct(key, i, size) {
  const d = S.geometry[key]?.ducts?.[i]; if (!d) throw new Error('덕트를 고르세요');
  if (!S.projects[key]) throw new Error('이 계통의 덕트망이 없습니다 — AUTO 먼저');
  await loadPhg(); if (S.active !== key) await openKey(key);
  record(`${d.displayName} 크기`, [key]);
  let r; try { r = await phg.setDuctSize(d.id, size); } catch (e) { S.undo.pop(); throw e; } store(key, { edited: true }, { keepSig: true });
  // PHG D may number its ducts again when it calculates: the duct is found by id, else by its name
  const ds = S.geometry[key]?.ducts || [], at = ds.findIndex(x => x.id === d.id); S.duct = { key, i: Math.max(0, at >= 0 ? at : ds.findIndex(x => x.displayName === d.displayName)) };
  say(`${d.displayName}: ${size ? (size.diameterMm ? 'Ø' + size.diameterMm : size.widthMm + '×' + size.heightMm) + ' (수동)' : 'PHG D 자동 크기'} · 계통 최대 ${r.indexPa ?? '—'} Pa`);
 }
 // a duct's kind (주 덕트·분기·보조 분기) changed on the plan: PHG D calculates the network again (no AUTO)
 async function setDuctType(key, i, type) {
  const d = S.geometry[key]?.ducts?.[i]; if (!d) throw new Error('덕트를 고르세요');
  if (!S.projects[key]) throw new Error('이 계통의 덕트망이 없습니다 — AUTO 먼저');
  if (d.type === type) return;
  await loadPhg(); if (S.active !== key) await openKey(key);
  record(`${d.displayName} 종류`, [key]);
  let r; try { r = await phg.setDuctType(d.id, type); } catch (e) { S.undo.pop(); throw e; } store(key, { edited: true }, { keepSig: true });
  // PHG D names the duct again by its kind: found by id
  const ds = S.geometry[key]?.ducts || [], at = ds.findIndex(x => x.id === d.id); S.duct = { key, i: Math.max(0, at) };
  const nd = ds[S.duct.i], name = { main: '주 덕트', branch: '분기', sub_branch: '보조 분기' };
  say(`${d.displayName} → ${nd?.displayName || d.displayName}: ${name[type]} · ${nd?.widthMm ? nd.widthMm + '×' + nd.heightMm : nd?.diameterMm ? 'Ø' + nd.diameterMm : ''} · 계통 최대 ${r.indexPa ?? '—'} Pa (AUTO는 다시 돌리지 않음)`);
 }
 // PHG D's pressure of a plan's network (bridge pressure: per duct, per RU) while its result is the one it was worked out
 // for; asked of PHG D when it is not (the network opened there if another is) and the screen drawn again. Not stored
 const pressureCache = {}; let pressureAsked = null;
 function pressureOf(key) {
  const r = S.results[key]; if (!r?.auto || !S.projects[key]) return null;
  const c = pressureCache[key]; if (c && c.at === r.at) return c.data;
  if (!pressureAsked && !busyNow()) {
   pressureAsked = key; const at = r.at;
   act(null, async () => { pressureCache[key] = { at, data: null }; await loadPhg(); if (S.active !== key) await openKey(key); pressureCache[key] = { at, data: phg.pressure() }; }).finally(() => { pressureAsked = null; });
  }
  return null;
 }
 // an RU dropped on the plan: it stays there (inside its room). AUTO is the user's to run (2026-10-26): the network
 // shows "다시 AUTO" (the plan changed under it) - with 놓으면 AUTO on, AUTO runs again at once as it used to
 async function moveRu(key, ruId, p) {
  const pl = plans().find(x => x.key === key), u = pl?.rus.find(x => x.id === ruId), room = u && S.contract.rooms.find(r => r.id === u.roomId);
  const q = { x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 };
  if (!room || !GE.inRoom(q, room)) { say(`RU는 자기 실(${room ? room.no + ' ' + room.name : '?'}) 안에만 둘 수 있습니다`, true); return; }
  edit(`RU ${ruId} 이동`, () => { S.contract = { ...S.contract, ruMoves: { ...(S.contract.ruMoves || {}), [ruId]: q } }; }, [key]);
  if (S.dropAuto) await autoKey(key); else if (result(key)?.auto) say(`RU ${ruId} 옮김 — 덕트망은 옮기기 전 것입니다. 새 경로는 "다시 AUTO"`);
 }
 // this plan's RUs back where the plan puts them
 async function resetRuMoves(key = curKey()) {
  const pl = plans().find(x => x.key === key), ids = new Set((pl?.rus || []).filter(u => u.moved).map(u => u.id)); if (!ids.size) return;
  edit('RU 위치 초기화', () => { S.contract = { ...S.contract, ruMoves: Object.fromEntries(Object.entries(S.contract.ruMoves || {}).filter(([k]) => !ids.has(k))) }; }, [key]);
  if (S.dropAuto) await autoKey(key); else if (result(key)?.auto) say('RU 위치 초기화 — 덕트망은 그 전 것입니다. 새 경로는 "다시 AUTO"');
 }
 // dragging an RU or the unit / shaft of the current system on the ④ plan
 function planDrag(svg) {
  const toPlan = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: q.x, y: Y(q.y) }; };
  svg.querySelectorAll('.drag').forEach(el => el.onpointerdown = ev => {
   if (ev.button !== 0 || S.pickRoot) return;
   const x0 = ev.clientX, y0 = ev.clientY, a = toPlan(ev); let moved = false;
   el.setPointerCapture(ev.pointerId); el.classList.add('dragging');
   el.onpointermove = e => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 4) moved = true; if (!moved) return; const b = toPlan(e); el.setAttribute('transform', `translate(${b.x - a.x} ${-(b.y - a.y)})`); };
   el.onpointerup = e => {
    el.onpointermove = el.onpointerup = null; el.classList.remove('dragging'); if (!moved) return;
    e.stopPropagation(); el.dataset.dragged = '1'; const b = toPlan(e), key = el.dataset.key;
    if (el.dataset.ru) act(S.dropAuto ? 'RU 옮기고 다시 AUTO' : null, () => moveRu(key, el.dataset.ru, b));
    else act(S.dropAuto ? '공조기 옮기고 다시 AUTO' : null, async () => { if (setRoot(b) && S.dropAuto) await autoKey(key); });
   };
  });
 }
 // ③ ④ plan view: the wheel zooms about the cursor; a drag pans - the middle button anywhere, the left one on a room or
 // the empty plan (not on what ④ drags, not while a place is picked); a double click on the plan fits the deck again.
 // The view is S.planView, drawn by plan() (BOX's canvas follows it when it is the background); bound once
 function planNav(svg) {
  if (svg.dataset.nav) return; svg.dataset.nav = '1';
  let raf = 0, panned = false, last = null;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (S.contract) plan(); }); };
  const shown = () => S.planShown?.deck === S.deck ? S.planShown : null;
  svg.addEventListener('wheel', ev => {
   const v = S.planView || shown(); if (!v) return; ev.preventDefault();
   const rc = svg.getBoundingClientRect(), sx = ev.clientX - rc.left, sy = ev.clientY - rc.top;
   const k = Math.min(Math.max(v.k * Math.exp(-ev.deltaY * 0.0015), 0.002), 5), wx = v.minX + sx / v.k, wy = v.minY + sy / v.k;
   S.planView = { deck: S.deck, k, minX: wx - sx / k, minY: wy - sy / k }; redraw();
  }, { passive: false });
  svg.addEventListener('pointerdown', ev => {
   if (ev.button !== 1 && (ev.button !== 0 || S.pickRoot || ev.target.closest('.drag'))) return;
   // a double click, counted here: the first click on a room selects it and draws the plan again, so the browser's
   // dblclick (both clicks on one element) does not come
   const now = performance.now(), twice = ev.button === 0 && last && now - last.t < 400 && Math.hypot(ev.clientX - last.x, ev.clientY - last.y) < 6;
   last = twice ? null : { t: now, x: ev.clientX, y: ev.clientY };
   if (twice && !ev.target.closest('.mk, .ru')) { S.planView = null; redraw(); return; }
   const v0 = S.planView || shown(); if (!v0) return;
   if (ev.button === 1) ev.preventDefault();
   const x0 = ev.clientX, y0 = ev.clientY; let moved = false;
   const move = e => { const dx = e.clientX - x0, dy = e.clientY - y0; if (!moved && Math.hypot(dx, dy) < 4) return;
    if (!moved) { moved = true; svg.setPointerCapture(ev.pointerId); svg.classList.add('panning'); }
    S.planView = { deck: S.deck, k: v0.k, minX: v0.minX - dx / v0.k, minY: v0.minY - dy / v0.k }; redraw(); };
   const up = () => { svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up); svg.classList.remove('panning'); panned = moved; };
   svg.addEventListener('pointermove', move); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  });
  // the click that ends a pan selects nothing
  svg.addEventListener('click', ev => { if (panned) { panned = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
  svg.addEventListener('auxclick', ev => { if (ev.button === 1) ev.preventDefault(); });
 }
 // PHG D as the detail editor of the plan in ④: its own screen; closing reads back what was changed there
 async function openEditor() {
  await loadPhg(); const key = curKey();
  if (key && S.projects[key]) { if (S.active !== key) await openKey(key); }
  else if (key) await sendPlan(key);
  S.phgEditor = true; say('PHG D 편집기 — 고친 뒤 "평면으로"를 누르면 결과를 읽어 옵니다');
 }
 // sections near a duct's own, each with the velocity it gives; "auto" lets PHG D size it again
 function sizeOptions(d) {
  const vel = a => a ? (d.flowCmh / 3600 / a).toFixed(1) : '—', opt = (v, label, sel) => `<option value='${esc(v)}' ${sel ? 'selected' : ''}>${label}</option>`;
  let out = opt('auto', `자동 (PHG D 계산)${d.manualSize ? '' : ' · 지금'}`, false);
  if (d.diameterMm) { for (const D of [...new Set([-100, -50, 0, 50, 100, 150].map(k => d.diameterMm + k))].filter(x => x >= 100)) out += opt(JSON.stringify({ diameterMm: D }), `Ø${D} · ${vel(Math.PI * (D / 2000) ** 2)} m/s${D === d.diameterMm ? ' · 지금' : ''}`, D === d.diameterMm); return out; }
  const sizes = []; for (const w of [-100, -50, 0, 50, 100, 150, 200].map(k => d.widthMm + k)) for (const h of [-50, 0, 50, 100].map(k => d.heightMm + k)) if (w >= 100 && h >= 100 && w >= h) sizes.push([w, h]);
  sizes.sort((x, y) => x[0] * x[1] - y[0] * y[1]);
  for (const [w, h] of sizes) out += opt(JSON.stringify({ widthMm: w, heightMm: h }), `${w}×${h} · ${vel(w * h / 1e6)} m/s${w === d.widthMm && h === d.heightMm ? ' · 지금' : ''}`, w === d.widthMm && h === d.heightMm);
  return out;
 }
 function closeEditor() { if (S.active && phg.loading) readBackIfEdited(); S.phgEditor = false; S.duct = null; }
 function readBack() { if (!S.active) throw new Error('PHG D에 열린 계통이 없습니다'); store(S.active, { edited: true }, { keepSig: true }); say('PHG D 결과를 읽었습니다'); }
 // leaving ④ with edits made in PHG D: read them back so ⑤ and the outputs show what is on screen
 function readBackIfEdited() { if (S.active && phg.loading && S.projects[S.active] && phg.changedSince(S.projects[S.active])) { readBack(); say(`${keyText(S.active)}: PHG D에서 고친 내용을 읽었습니다`); } }

 // ---------- project file and outputs ----------
 // the project file: the design data, PHG D work and BOX's own project (① ②) - taken from BOX when it holds a drawing,
 // else the one the opened file carried (F05)
 async function projectJson() {
  keepActive(); let carried = S.boxFile || null;
  if (box.loading && box.hasDrawing()) { const json = await box.projectJson().catch(() => null); if (json) carried = { format: 'BOX JSON', json, roomIds: box.roomIds() }; }
  S.boxFile = carried;
  return JSON.stringify(PJ.make({ contract: S.contract, projects: S.projects, results: S.results, geometry: S.geometry, box: carried }));
 }
 // does BOX show the drawing this design data was made from? (its room ids)
 const boxMatches = () => { const ids = new Set(box.roomIds()); return ids.size === S.contract.rooms.length && S.contract.rooms.every(r => ids.has(r.id)); };
 async function openProject(handle = null) {
  if (!(await keepsWork('프로젝트 열기'))) return;
  let f, h = handle;
  if (FS) {
   if (!h) { try { [h] = await window.showOpenFilePicker({ id: 'hvac-grid-project', startIn: 'documents', types: [{ description: 'HVAC Grid 프로젝트 · 설계 데이터', accept: { 'application/json': ['.json'] } }] }); } catch (e) { if (e.name === 'AbortError') return; throw e; } }
   if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error(`${h.name}: 파일 권한이 없습니다`);
   f = await h.getFile();
  } else f = await pickFile('.json');
  await loadProject(parseJson(await f.text(), f.name), f.name, h);
 }
 // a file that is not JSON: its name and the reason in Korean, not the parser's English (review 2026-10-21 G-2)
 function parseJson(text, name) {
  try { return JSON.parse(text.replace(/^﻿/, '')); }
  catch (e) { throw new Error(`${name}: JSON 형식이 아닙니다 — HVAC Grid 프로젝트·설계 데이터 파일이 아니거나 손상됨 (${e.message})`); }
 }
 // a project (or design data) read from a file: the design data, the PHG D work and the BOX drawing it carries
 async function loadProject(data, name, h = null) {
  const { project: pr, notes } = PJ.read(data), bare = data?.schema === K.SCHEMA, f = { name };
  setContract(pr.contract); Object.assign(S, { projects: pr.projects, results: pr.results, geometry: pr.geometry, active: null, dirty: false, file: bare ? null : { name: f.name, handle: h || null }, boxFile: pr.box || null });   // a contract file is not a save target for the project
  if (h && !bare) remember(h);
  // the BOX drawing saved with the project opens in BOX (① ②); without one, say when BOX shows another drawing (F05)
  if (pr.box) {
   await box.load(); box.closeCal(); box.calSig = null;
   const w = box.win, ask0 = w.confirm; w.confirm = () => true;
   try { box.setFile('jsonFile', new File([pr.box.json], 'project.box.json', { type: 'application/json' })); } finally { w.confirm = ask0; }
   // loaded when BOX shows the saved drawing's rooms (the drawing before it may have as many)
   const want = pr.box.roomIds, same = () => { const ids = box.roomIds(); return want.length ? ids.length === want.length && want.every(id => ids.includes(id)) : box.hasDrawing(); };
   await B.until(() => { try { return box.hasDrawing() && same(); } catch { return false; } }, 60000, 'BOX 도면').catch(() => notes.push('BOX 도면이 저장한 격실과 다르게 열림'));
   if (box.hasDrawing() && !boxMatches()) notes.push('BOX 도면의 격실이 설계 데이터와 다름');
   else if (box.hasDrawing()) notes.push('BOX 도면(①②)도 열림');
  } else if (box.loading && box.hasDrawing() && !boxMatches()) notes.push('파일에 BOX 도면 없음 — BOX 화면의 도면은 이 설계 데이터의 도면이 아님');
  if (S.step === 'room' || S.step === 'load') S.step = 'air';
  say(f.name + ' 열기' + (notes.length ? ' · ' + notes.join(' · ') : ''));
 }
 const outName = ext => `hvac-grid-${U.safeName(RP.PROJECT_NAME(S.contract) || 'project').slice(0, 30)}-${stamp()}.${ext}`;
 const OUT = {
  project: (as = false) => saveProject(as),
  xlsx: async () => { keepActive(); const f = await saveFile(outName('xlsx'), XL.xlsx(RP.sheets(project(), analysis()))); if (f) say('통합 XLSX (격실·계통·덕트망·수직 덕트·방화·관통·물량·검토)'); },
  dxf: async () => { const a = analysis(), f = await saveFile(outName('dxf'), DX.integratedDxf(S.contract, { diagrams: DG.systemDiagrams(S.contract, a), plans: a.plans, geometry: a.geometry, boundaries: a.solas.boundaries, penetrations: a.solas.penetrations, risers: a.risers })); if (f) say('통합 DXF (Deck별 격실·RU·덕트·공조기·수직 덕트·방화 경계·관통)'); },
  report: async () => { keepActive(); const f = await saveFile(outName('html'), RP.html(project(), analysis())); if (f) say(`보고서 (HTML, 인쇄용): ${f.name}`); },
  csv: async () => { const sh = RP.sheets(project(), analysis()).find(s => s.name === 'Deck 덕트망'); const f = await saveFile(outName('csv'), '﻿' + [sh.head, ...sh.rows].map(r => r.map(U.csvCell).join(',')).join('\r\n')); if (f) say(`요약 CSV (Deck·계통 덕트망 ${sh.rows.length}행): ${f.name}`); },
  contract: () => saveFile(`hvac-grid-contract-${stamp()}.json`, JSON.stringify(S.contract, null, 1), { id: 'contract' }),
  // 방화 등급도: SOLAS ratings written on every deck (lib/fire-plan.cjs) - a DXF of its own
  fireDxf: async () => { const f = await saveFile(outName('dxf').replace(/\.dxf$/, '-방화등급도.dxf'), FP.toDxf(fireModel())); if (f) say(`방화 등급도 DXF: ${f.name} — 등급별 레이어(FIRE_A60 …), 표기는 FIRE_TEXT_* 레이어`); } };
 // the fire-rating plan's model with the screen's choices (C ratings, outer walls); made again with the analysis (the
 // plan draws its layer on every zoom)
 let fireCache = null;
 const fireModel = () => {
  const a = analysis(), c = !!S.fpShowC, o = !!S.fpShowOuter;
  if (!fireCache || fireCache.a !== a || fireCache.c !== c || fireCache.o !== o) fireCache = { a, c, o, m: FP.model(S.contract, a.solas, { showC: c, showOuter: o }) };
  return fireCache.m;
 };
 // the project: to its file (Ctrl+S), or a new one (first time, Ctrl+Shift+S); true when saved
 async function saveProject(as = false) {
  if (!S.contract) throw new Error('저장할 설계 데이터가 없습니다');
  const f = await saveFile(!as && S.file?.name ? S.file.name : outName('json'), await projectJson(), { handle: as ? null : S.file?.handle, id: 'project' });
  if (!f) return false;
  S.file = f; S.dirty = false; if (f.handle) remember(f.handle);
  say(`프로젝트 저장: ${f.name}`); toast(`저장했습니다: ${f.name}`); status(); return true;
 }

 // ---------- commands ----------
 // labels are Korean; the old BOX / PHG D codes stay in the tooltip ("이전 단축") so existing users still find them
 const c = (ic, label, run, more = {}) => ({ icon: ic, label, run, ...more });
 const boxCmd = id => () => act(null, async () => { await box.load(); box.click(id); });
 // a command that replaces the BOX drawing: the app's question first (only over a drawing), BOX's confirm() then answered
 async function boxReplace(what, fn) {
  await box.load();
  if (box.hasDrawing() && (await ask(`${what}: 지금 BOX 도면(①)을 바꿉니다. 저장하지 않은 BOX 작업은 사라집니다. 계속할까요?`, [['ok', '계속', true], ['cancel', '취소']])) !== 'ok') return false;
  const w = box.win, c = w.confirm; w.confirm = () => true; try { await fn(); } finally { w.confirm = c; } return true;
 }
 const boxSample = (id, what) => () => act(null, () => boxReplace(what, () => box.click(id)));
 // a CAL command: CAL calculates in the background (its panel stays out of sight); tables open in their own window, the
 // commands that apply values say how it went on the status line
 const CAL_SAY = { K7: 'ISO 적용', 'C✓': 'LY 적용' };
 // ISO 적용 and LY 적용 change K values only: CAL's rooms are compared before and after, and the list says whether any
 // room's design conditions moved (they should not) and which loads and airflows did - ISO → LY under a title of its own
 const boxCal = code => () => act(CAL_SAY[code] ? CAL_SAY[code] + ' 중' : box.loading && box.calCurrent() ? null : 'BOX CAL 계산 중', async () => {
  await box.load(); const drawing = box.hasDrawing(), watch = !!CAL_SAY[code] && drawing, before = watch ? await box.calSnapshot() : null;
  const said = await box.cal(code);
  // K values and design conditions with no drawing: they are kept for the drawing opened next
  if (!drawing) say(`${CAL_SAY[code] ? CAL_SAY[code] + ': ' + (said ? said + ' · ' : '') : ''}도면 없음 — 이 K값·설계 조건은 다음에 여는 DXF에 적용 (예제·BOX 프로젝트는 자기 설정)`);
  else if (said) say(`${CAL_SAY[code]}: ${said}`);
  if (!before) return;
  const d = KCH.diff(before, await box.calSnapshot(), S.contract?.rules || {});
  const title = d.from === 'iso-standard' && d.to === 'calculated' ? 'ISO → LY 변경 사항' : `${CAL_SAY[code]} 변경 사항 (${d.fromName} → ${d.toName})`;
  showKChange(d, title);
  say(`${CAL_SAY[code]}: ${said ? said + ' · ' : ''}${d.toName} · 설계 조건 변경 ${d.inputs.length + d.conditions.length}건 · 부하가 바뀐 격실 ${d.rooms.length}/${d.totals.roomsTotal}`);
 });
 // the K change list (dialog), and as CSV
 let lastKChange = null;
 function showKChange(d, title) {
  lastKChange = { d, title }; $('kchgTitle').textContent = title; $('kchgBody').innerHTML = KCH.toHtml(d);
  const dlg = $('kchg'); if (!dlg.open) dlg.showModal();
 }
 async function kChangeCsv() {
  if (!lastKChange) return; const { d, title } = lastKChange;
  const rows = [[title], ['K 방식', d.fromName, d.toName], [], ['구분', 'Deck', '격실', '항목', '변경 전', '변경 후'],
   ...d.conditions.map(c => ['프로젝트 설계 조건', '', '', c.name, c.from, c.to]), ...d.inputs.map(c => ['격실 설계 조건', c.deck, c.room, c.name, c.from, c.to]),
   ...d.rooms.flatMap(r => [...KCH.LOADS.map(([k, n]) => ['부하 W', r.deck, r.room, n, r.loads[k][0], r.loads[k][1]]), ['급기 CMH', r.deck, r.room, '급기', r.supplyCmh[0], r.supplyCmh[1]]])];
  const f = await saveFile(`K값-변경-${stamp()}.csv`, '﻿' + rows.map(r => r.map(U.csvCell).join(',')).join('\r\n'), { id: 'kchange' });
  if (f) say(`K값 변경 목록 저장: ${f.name}`);
 }
 const boxFile = (id, accept) => () => act(null, async () => { const f = await pickFile(accept); await box.load(); box.setFile(id, f); say(f.name + ' → BOX'); });
 // ① DXF 열기. BOX sends a DXF of 16 MiB or more to its large-file engine, which makes no deck, and well below that its
 // room search stalls (wall panel pairs grow with the square of the lines: rooms fail from about 2 MB of drawing,
 // docs/REVIEW_2026-10-25_BIG_DXF.md). A big drawing is cleaned in SketchCAD first (docs/WORKFLOW_SKETCHCAD.md): its
 // "HVAC Grid용 DXF" holds the rooms, walls and room texts only. After the file goes in, BOX's own line says how it went.
 const DXF_STOP = 16 * 1024 * 1024, DXF_WARN = 2e6;
 const SKETCH_HINT = 'SketchCAD에서 열어 공조 탭 ① 계산용 정리 → ② 경계 지정 → ③ 실 자동 찾기 → 면적표의 "HVAC Grid용 DXF"로 저장한 뒤 그 파일을 여세요.';
 const openBoxDxf = () => act(null, async () => {
  const f = await pickFile('.dxf'), mb = (f.size / 1e6).toFixed(f.size < 1e7 ? 1 : 0);
  if (f.size >= DXF_STOP) { await ask(`${f.name}은 ${mb} MB입니다. 16 MiB(약 16.8 MB)가 넘는 도면은 BOX가 Deck·격실을 만들지 않아 HVAC Grid에서 바로 열 수 없습니다. ${SKETCH_HINT}`, [['ok', '확인', true]]); say(`${f.name}: 너무 큰 도면 — SketchCAD에서 정리한 뒤 여세요`, true); return; }
  if (f.size >= DXF_WARN && (await ask(`${f.name}은 ${mb} MB입니다. 가구·치수·해치가 든 큰 도면은 BOX가 격실을 찾지 못하거나 오래 멈출 수 있습니다. ${SKETCH_HINT}`, [['cancel', 'SketchCAD로 정리', true], ['open', '그래도 열기']])) !== 'open') { say(`${f.name}: 열지 않음 — SketchCAD에서 정리한 뒤 여세요`); return; }
  await box.load();
  const A = box.win.CAD_APP, decks = A.stack.decks.length, mode = box.doc.getElementById('modeText'), before = mode?.textContent;
  busy(`${f.name} 여는 중 (BOX)`);
  box.setFile('dxfFile', f);
  // BOX opens the file in a worker: a new deck, or its status line saying it failed (an alert() also tells the user)
  const done = await B.until(() => A.stack.decks.length > decks ? 'deck' : mode && mode.textContent !== before && /실패|중단|열 수 없|열지 못/.test(mode.textContent) ? 'fail' : null, 600000, 'DXF 열기').catch(() => 'time');
  const line = (mode?.textContent || '').trim();
  if (done === 'deck') say(`${f.name} → BOX${line ? ' · ' + line : ''}`, /실패/.test(line));
  else if (done === 'fail') say(`${f.name}: BOX가 열지 못함 — ${line}`, true);
  else say(`${f.name}: BOX가 10분 안에 Deck을 만들지 못함 — ${SKETCH_HINT}`, true);
 });
 const phgCmd = id => () => act(null, async () => { await loadPhg(); phg.click(id); });
 const phgText = t => () => act(null, async () => { await loadPhg(); phg.clickMenu(t); });
 const needContract = () => !S.contract;
 const field = html => ({ field: html });
 const seg = (name, value, options, onchange) => ({ field: `<div class="seg" role="radiogroup" aria-label="${esc(name)}" data-seg="${esc(name)}">${options.map(([v, l, n]) => `<button role="radio" data-v="${esc(v)}" aria-checked="${v === value}" ${n === 0 ? 'disabled' : ''}>${esc(l)}${n != null ? ` <small>${n}</small>` : ''}</button>`).join('')}</div>`, seg: onchange, segName: name });
 const kindSeg = () => seg('계통 종류', S.kind, PL.KINDS.map(k => [k, KL[k], deckPlans(k).length]), v => { S.kind = v; S.sys = null; pickSystem(); S.pickRoot = false; });
 const STEPS = [
  { id: 'room', name: '도면·격실', view: 'box', groups: () => [
   ['파일', [c('open', 'DXF 열기', openBoxDxf, { code: 'DXF' }), c('bg', '배경', boxFile('backgroundFile', ''), { code: 'BG' }), c('json', 'BOX 열기', boxFile('jsonFile', '.json'), { code: 'J↓', title: 'BOX 프로젝트 JSON 열기 (T3 시험선 같은 BOX 프로젝트 파일) — HVAC Grid 프로젝트는 머리줄 폴더 단추' }), c('save', 'BOX 저장', boxCmd('saveBtn'), { code: 'S' }), c('dxfOut', 'BOX DXF 출력', boxCmd('exportBtn'), { code: 'D↑' })]],
   ['보기', [c('fit', '전체 보기', boxCmd('fitBtn'), { code: '⌕' }), c('reset', '초기화', boxSample('newBtn', '초기화'), { code: '⟲' })]],
   ['격실', [c('ol', '하부 외곽선', boxCmd('outlineBtn'), { code: '하부 OL' }), c('olu', '상부 외곽선', boxCmd('outlineUpperBtn'), { code: '상부 OL' }), c('olv', '외곽선 검증', boxCmd('outlineVerifyBtn'), { code: 'OL 검증' }), c('vl', '가상선', boxCmd('hullLinkBtn'), { code: 'VL' }), c('area', '면적', boxCmd('measureBtn'), { code: 'AR' }), c('apoly', '면적 다각형', boxCmd('areaPolygonBtn'), { code: 'AP' }),
    c('roomNo', '실 번호', boxCmd('autoRoomNoBtn'), { code: 'RN' }), c('roomFix', '실 지정', boxCmd('manualRoomBtn'), { code: 'RM' }), c('list', '격실 목록', boxCmd('roomBtn'), { code: 'RL' }), c('face', '접한 면적', boxCmd('contactBtn'), { code: 'A6' })]],
   ['검사', [c('lines', '선 검사', boxCmd('lineCheckBtn'), { code: 'CK' }), c('geo', '도형 검사', boxCmd('l4GeometryCheckBtn'), { code: 'GX' }), c('cube', '3D 검사', boxCmd('l4MeshCheckBtn')), c('water', '흘수선', boxCmd('waterlineBtn'))]],
   ['예제', [c('sample', 'S5 예제', boxSample('s5ExampleBtn', 'S5 예제'), { code: 'S5', title: '5 Deck · 94 공간 · 12 × 8 m' }), c('sample', 'H5 예제', boxSample('h5ExampleBtn', 'H5 예제'), { code: 'H5', title: 'BOX 내장 H5 예제 — KCS 실선 치수' }),
    c('deck', 'T3 시험선', () => act('T3 시험선 여는 중', async () => { const t = await (await B.get('../samples/t3/T3.box.json')).text(); if (!(await boxReplace('T3 시험선', () => box.setFile('jsonFile', new File([t], 'T3.box.json', { type: 'application/json' }))))) return; say(`T3 시험선 → BOX (4 Deck · ${(t.match(/"roomNo"/g) || []).length}실)`); }), { title: 'HVAC Grid 시험선 BOX 프로젝트 (4 Deck · 79실 · 다층 계통)' })]]] },
  { id: 'load', name: '부하', view: 'box', groups: () => [
   ['격실', [c('cal', '격실 입력', boxCal('RL'), { code: 'RL', title: '격실 입력 · 실마다 계통(SUP·EXH·RET)·재실인원·최소신기·장비 발열·환기 횟수·ISO 구분·냉난방 온습도 (CAL 격실 리스트)' })]],
   ['조건', [c('cond', '설계 조건', boxCal('DC'), { code: 'DC' }), c('bound', '경계 조건', boxCal('BC'), { code: 'BC' })]],
   ['K값', [c('kIso', 'ISO 기준', boxCal('KD'), { code: 'KD' }), c('kApply', 'ISO 적용', boxCal('K7'), { code: 'K7', title: 'ISO 적용 · ISO 7547:2022 K값을 면별 경계에 적용' }), c('kLayer', 'LY', boxCal('KC'), { code: 'KC', title: 'LY · 구조 레이어(강판·단열·내장)로 계산한 K값 보기' }), c('check', 'LY 적용', boxCal('C✓'), { code: 'C✓', title: 'LY 적용 · 구조 레이어로 계산한 K값을 면별 경계에 적용' }), c('kUser', '사용자', boxCal('KU'), { code: 'KU' })]],
   ['부하', [c('load', '격실 부하', boxCal('LR'), { code: 'LR' }), c('oa', '신기 (OA)', boxCal('OA'), { code: 'OA' }), c('rh', '리히터', boxCal('RH'), { code: 'RH' })]],
   ['내보내기', [c('xlsxIso', 'ISO 시트', boxCal('I↑'), { code: 'I↑' }), c('xlsx', '미적용 시트', boxCal('N↑'), { code: 'N↑' }), c('sum', 'SUP 요약', boxCal('Σ↑'), { code: 'Σ↑' }), c('xlsxAll', '전체 XLSX', boxCal('LX'), { code: 'LX' }), c('sheet', '격실 시트', boxCal('R↑'), { code: 'R↑' }), c('face', '면적 시트', boxCal('A↑'), { code: 'A↑' })]],
   ['HVAC Grid', [c('contract', '설계 데이터 만들기', () => act('BOX 격실·부하 읽는 중', extractContract), { primary: true, title: 'BOX 격실·부하 → 격실 풍량·계통 (③ 풍량·계통으로 이동)' })]]] },
  { id: 'air', name: '풍량·계통', view: 'plan', groups: () => [
   ['풍량 규칙', [field(`<label class="field">급기 ΔT (K)<input id="dT" type="number" min="3" max="15" step="1" value="${fv('dT', S.contract?.rules.supplyDeltaTK ?? 10)}" ${fe('dT')}></label>`), field(`<label class="field" title="공조 구역 신기 ≥ 배기 + 가압">가압 (%)<input id="pPct" type="number" min="0" max="30" step="1" value="${fv('pPct', S.contract?.rules.pressurizationPct ?? 5)}" ${fe('pPct')} style="width:4em"></label>`), field(`<label class="field">가압 기준<select id="pBasis"><option value="exhaust" ${S.contract?.rules.pressurizationBasis !== 'supply' ? 'selected' : ''}>배기 대비</option><option value="supply" ${S.contract?.rules.pressurizationBasis === 'supply' ? 'selected' : ''}>급기 대비</option></select></label>`), field(`<label class="field" title="재순환 공조 구역의 신기 하한(선주 사양). 사양이 없으면 0">최소 신기 (%)<input id="minOa" type="number" min="0" max="100" step="1" value="${fv('minOa', S.contract?.rules.minOaPct ?? 25)}" ${fe('minOa')} style="width:4em"></label>`), c('rule', '적용', () => act(null, applyDeltaT), { disabled: needContract, title: '급기(SA) 풍량은 여름 기준 하나 = 10 CMH 올림(max(냉방 현열 W × 안전율 × 3 ÷ ΔT, 최소 신기)) — ISO 7547 6.2.1. 겨울은 같은 풍량에 난방 용량(공조기 히터·재열기), 급기 온도차가 22 K를 넘는 실은 보조 난방 확인(6.3)' })]],
   ['계통', [kindSeg(), sysField(false)]],
   ['공조기 · 수직 덕트', [c('pin', '위치 지정', () => { S.pickRoot = !S.pickRoot; say(S.pickRoot ? `평면에서 ${curPlan()?.isUnitDeck === false ? '수직 덕트(샤프트)' : '공조기'} 위치를 클릭하세요 (Esc 취소)` : ''); render(); }, { disabled: () => !curKey(), pressed: () => S.pickRoot, title: '공조기 Deck: 공조기·팬 위치 · 다른 Deck: 수직 덕트(샤프트) 위치' }), c('unpin', '지정 해제', () => act(null, clearRoot), { disabled: () => !S.contract?.roots?.[curKey()] }), unitDeckField()]],
   ['보기', [seg('평면 보기', S.overlay, [['air', '풍량'], ['fire', '방화']], v => { S.overlay = v; })]],
   ['설계 데이터', [c('open', '열기', () => act(null, openProject), { title: 'HVAC Grid 프로젝트 또는 설계 데이터 JSON' }), c('save', '설계 데이터 저장', () => act(null, OUT.contract), { disabled: needContract })]]] },
  { id: 'duct', name: 'RU·덕트', view: 'plan', groups: () => S.phgEditor ? [
   ['편집기', [c('back', '평면으로', () => act(null, closeEditor), { primary: true, title: 'PHG D에서 고친 내용을 읽고 HVAC Grid 평면으로 돌아갑니다' })]],
   ['HVAC Grid', [sysField(true), c('send', 'PHG D로 보내기', () => act('PHG D로 보내는 중', () => sendPlan()), { primary: true, disabled: () => !curKey(), title: 'Deck 격실 도면 + 공조기·수직 덕트 + 격실별 RU(풍량)' }), c('auto', '보내기 + AUTO', () => act('AUTO 계산 중', () => autoKey()), { disabled: () => !curKey(), title: 'AUTO → 첫 후보 → 덕트 지정 → 계산 → 압력' }), c('all', '모든 계통 AUTO', () => act('AUTO 계산 중', () => runAll()), { disabled: needContract, title: '모든 Deck·계통(급기·배기·환기)을 차례로 PHG D로 보내고 AUTO' }), c('refresh', '결과 읽기', () => act(null, readBack), { disabled: () => !S.active, title: 'PHG D에서 고친 결과를 HVAC Grid로' })]],
   ['계통', [c('root', '공조기', phgCmd('rootBtn'), { code: 'R', title: '공조기 · 계통 시작점 배치' }), c('ru', 'RU 배치', phgCmd('diffuserBtn'), { code: 'RU' }), c('ruAuto', 'RU 자동', phgCmd('autoDiffuserBtn')), c('flow', '풍량 초안', phgCmd('phgdFlowBtn'))]],
   ['자동 라우팅', [c('zone', '금지 영역', phgText('금지 영역')), c('auto', 'AUTO', phgCmd('autoRouteOpenBtn'), { title: 'AUTO · 편집 가능한 경로 객체 생성 · 덕트 지정으로 덕트화' }), c('cmp', '비교', phgCmd('phgdCompareBtn')), c('set', '설정', phgCmd('phgdAutoSettingsBtn'))]],
   ['덕트', [c('ml', '주 덕트', phgCmd('assignMainLineBtn'), { code: 'ML' }), c('br', '분기', phgCmd('assignBranchBtn'), { code: 'BR' }), c('sbr', '보조 분기', phgCmd('assignSubBranchBtn'), { code: 'SBR' }), c('ad', '덕트 지정', phgCmd('makeDuctBtn'), { code: 'AD' })]],
   ['계산', [c('lines', '선 검사', phgCmd('lineCheckBtn')), c('calc', '계산', phgCmd('calculateBtn'), { title: '풍량과 덕트 크기' }), c('noise', '소음', phgCmd('noiseCalcBtn')), c('press', '압력', phgCmd('pressureCalcBtn'))]],
   ['보기', [c('fit', '전체 보기', phgCmd('zoomAllBtn')), c('dockL', '왼쪽', () => act(null, async () => { await loadPhg(); phg.click('phgb-left-panel'); }), { pressed: () => phg.loading && S.phgDocked && phg.dockShown('left'), title: 'PHG D 도구·레이어 패널' }), c('dockR', '오른쪽', () => act(null, async () => { await loadPhg(); phg.click('phgb-right-panel'); }), { pressed: () => phg.loading && S.phgDocked && phg.dockShown('right'), title: 'PHG D 프로젝트 상태·검증 패널' })]]] : [
   ['HVAC Grid', [sysField(true), c('send', 'PHG D로 보내기', () => act('PHG D로 보내는 중', () => sendPlan()), { primary: true, disabled: () => !curKey(), title: 'Deck 격실 도면 + 공조기·수직 덕트 + 격실별 RU(풍량)' }), c('auto', '보내기 + AUTO', () => act('AUTO 계산 중', () => autoKey()), { disabled: () => !curKey(), title: 'AUTO → 첫 후보 → 덕트 지정 → 계산 → 압력' }), c('all', '모든 계통 AUTO', () => act('AUTO 계산 중', () => runAll()), { disabled: needContract, title: '모든 Deck·계통(급기·배기·환기)을 차례로 PHG D로 보내고 AUTO' })]],
   ['편집', [c('reroute', '다른 경로', () => act('다른 경로 찾는 중', () => reroute()), { disabled: () => !result(curKey())?.auto || result(curKey())?.candidates === 1, title: result(curKey())?.candidates === 1 ? 'PHG D가 찾은 경로가 하나뿐 — RU·공조기를 끌어서 옮기면 다른 경로가 나옵니다' : 'AUTO의 다음 후보 경로로 바꿉니다 (RU·공조기는 평면에서 끌어서 옮깁니다)' }), c('resetRu', 'RU 위치 초기화', () => act(S.dropAuto ? 'RU 위치 되돌리고 다시 AUTO' : null, () => resetRuMoves()), { disabled: () => !curPlan()?.rus.some(u => u.moved), title: '이 계통에서 옮긴 RU를 계획 위치로' }),
    c('auto', '놓으면 AUTO', () => { S.dropAuto = !S.dropAuto; saveLayers(); say(S.dropAuto ? 'RU·공조기를 놓으면 AUTO를 다시 돌립니다' : 'RU·공조기를 놓아도 AUTO는 돌리지 않습니다 — 덕트망에 "다시 AUTO" 표시'); render(); }, { pressed: () => !!S.dropAuto, title: '꺼짐(기본): RU·공조기를 끌어 놓으면 위치만 바뀌고 덕트망에 "다시 AUTO" 표시 — AUTO는 사용자가 실행. 켜면 놓을 때마다 AUTO' })]],
   ['보기', [seg('덕트 보기', S.ductShow || 'sys', [['sys', '이 계통'], ['kind', '같은 종류'], ['all', '모든 계통']], v => { S.ductShow = v; }), seg('덕트 글자', S.ductLabel || 'size', [['size', '크기'], ['vel', '풍속'], ['pa', '압력']], v => { S.ductLabel = v; })]],
   ['PHG D', [c('editor', 'PHG D 편집기', () => act('PHG D 여는 중', openEditor), { disabled: () => !curKey(), title: '세부 편집: 경로·RU·덕트를 PHG D 화면에서 직접 고칩니다. "평면으로"를 누르면 고친 내용을 읽어 옵니다' })]]] },
  { id: 'review', name: '검토·출력', view: 'plan', groups: () => [
   ['덕트망', [c('all', '모든 계통 AUTO', () => act('AUTO 계산 중', () => runAll()), { primary: true, disabled: needContract, title: '모든 Deck·계통(급기·배기·환기)을 차례로 PHG D로 보내고 AUTO' }), c('refresh', '남은 것만', () => act('AUTO 계산 중', () => runAll(undefined, { onlyNeeded: true })), { disabled: needContract, title: 'AUTO가 없거나 다시 보내야 하는 계통만' })]],
   ['방화 (SOLAS)', [field(`<label class="field">선종<select id="shipSel" ${S.contract ? '' : 'disabled'}>${Object.values(SO.DATA.ships).map(s => `<option value="${s.key}" ${s.key === (S.contract?.solas?.ship || SO.DEFAULT_SETTINGS.ship) ? 'selected' : ''}>${esc(s.label)} · ${s.tB}/${s.tD}</option>`).join('')}</select></label>`),
    field(`<label class="field">방화방식<select id="methodSel" ${S.contract && (S.contract.solas?.ship || 'CARG') === 'CARG' ? '' : 'disabled'}>${['IC', 'IIC', 'IIIC'].map(m => `<option ${m === (S.contract?.solas?.method || 'IC') ? 'selected' : ''}>${m}</option>`).join('')}</select></label>`),
    field(`<label class="field">최하층 아래<select id="belowSel" ${S.contract ? '' : 'disabled'}><option value="">미지정 (확인 필요)</option>${spaceOptions(S.contract?.solas?.lowestBelow || '', ['기관실 — A류', '보일러실', '화물창', '기타'])}</select></label>`),
    field(`<label class="field">스프링클러<select id="sprinklerSel" ${S.contract && S.contract.solas?.ship === 'P36M' ? '' : 'disabled'} title="여객선 36명 이하 Table 9.3/9.4: 양쪽 실 모두 스프링클러 설치이면 작은 값"><option value="">없음·한쪽</option><option value="1" ${S.contract?.solas?.sprinkler ? 'selected' : ''}>양쪽 설치</option></select></label>`)]],
   ['출력', [c('save', '프로젝트 저장', () => act(null, () => saveProject()), { disabled: needContract, title: '한 파일: 설계 데이터 + 모든 PHG D 덕트망 + 결과 (Ctrl+S)' }), c('save', '다른 이름으로', () => act(null, () => saveProject(true)), { disabled: needContract, title: '다른 이름·위치로 저장 (Ctrl+Shift+S)' }), c('xlsx', '통합 XLSX', () => act(null, OUT.xlsx), { disabled: needContract }), c('dxfOut', '방화 등급도 DXF', () => act(null, OUT.fireDxf), { disabled: needContract, title: 'SOLAS 등급을 글자로 적은 Deck 평면 (실 범주·격벽 등급·바닥·천장·관통) — 별도 DXF' }), c('dxfOut', '통합 DXF', () => act(null, OUT.dxf), { disabled: needContract }), c('report', '보고서', () => act(null, OUT.report), { disabled: needContract, title: 'HTML 보고서 (Deck 평면·계통·수직 덕트·방화·관통·물량)' }), c('csv', '요약 CSV', OUT.csv, { disabled: needContract }), c('contract', '설계 데이터 저장', OUT.contract, { disabled: needContract })]]] }];
 // the system of the deck: of the chosen kind (③), or every system of the deck with its kind (④)
 function sysField(allKinds) {
  const ps = allKinds ? deckPlans() : deckPlans(S.kind);
  return field(`<label class="field">${esc(deckName(S.deck) || 'Deck')} ${allKinds ? '' : KL[S.kind] + ' '}계통<select id="sysSel" ${ps.length ? '' : 'disabled'}>${ps.length ? ps.map(p => `<option value="${esc(p.systemKey)}" ${p.systemKey === S.sys ? 'selected' : ''}>${allKinds ? KL[p.kind] + ' · ' : ''}${esc(p.systemId)} · ${fmt(p.designCmh)} CMH${p.decks > 1 ? (p.isUnitDeck ? ' · 공조기' : ' · 수직') : ''}</option>`).join('') : '<option>계통 없음</option>'}</select></label>`);
 }
 // the deck of the unit of a system that serves several decks
 function unitDeckField() {
  const pl = curPlan(), ps = pl ? plans().filter(p => p.systemKey === pl.systemKey) : [];
  if (ps.length < 2) return field('<label class="field">공조기 Deck<select id="unitSel" disabled><option>한 Deck 계통</option></select></label>');
  return field(`<label class="field">공조기 Deck<select id="unitSel">${ps.map(p => `<option value="${esc(p.deckId)}" ${p.isUnitDeck ? 'selected' : ''}>${esc(deckName(p.deckId))}${p.isUnitDeck ? ` (${{ user: '지정', 'fan-room': '팬룸', 'most-air': '최대 풍량' }[p.unitDeckSource]})` : ''}</option>`).join('')}</select></label>`);
 }
 // SOLAS spaces of the ship type as <option>s, by category; `first` lists some at the top
 function spaceOptions(sel, first = []) {
  const shp = SO.DATA.ships[SO.settingsOf(S.contract).ship], ci = SO.DATA.catIndex[shp.cat], rows = SO.SPACES.filter(r => r[ci] != null);
  const top = first.map(n => rows.find(r => r[0] === n)).filter(Boolean), rest = rows.filter(r => !top.includes(r)).sort((x, y) => x[ci] - y[ci]);
  return [...top, ...rest].map(r => `<option value="${esc(r[0])}" ${r[0] === sel ? 'selected' : ''}>(${r[ci]}) ${esc(r[0])}</option>`).join('');
 }
 // open items grouped by level and field, in the order they come (failures first)
 const groups = items => { const m = new Map(); for (const [lv, area, text, at] of items) { const k = lv + '|' + area; if (!m.has(k)) m.set(k, [lv, area, []]); m.get(k)[2].push([text, at]); } return [...m.values()]; };
 // a ribbon field after a rejected entry: the value typed, marked, with the message as its tooltip
 const fv = (id, value) => S.fieldErr?.[id] ? S.fieldErr[id].value : value;
 const fe = id => S.fieldErr?.[id] ? `class="bad" aria-invalid="true" title="${esc(S.fieldErr[id].msg)}"` : '';
 const stepOf = id => STEPS.find(s => s.id === id);
 // the view a step shows: ④ is the shared HVAC Grid plan; PHG D only while its editor is open (S.phgEditor)
 const viewOf = id => id === 'duct' ? (S.phgEditor ? 'phg' : 'plan') : stepOf(id).view;
 // ① ② → ③ ④ ⑤: the deck BOX shows, the room picked in it, and BOX's view kept also when BOX shows only part of the
 // deck (plan() takes BOX's view by itself when it frames the deck; else it would fit the deck - a jump)
 function fromBox() {
  followBoxDeck();
  const picked = box.pickedRoom(new Set(S.contract.rooms.map(r => r.id)));
  if (picked) { S.room = picked; const d = S.contract.rooms.find(r => r.id === picked).deckId; if (d !== S.deck) { S.deck = d; pickSystem(); } }
  const v = box.view2d(), rooms = S.contract.rooms.filter(r => r.deckId === S.deck); if (!v || !rooms.length || box.win.CAD_APP.st.activeDeck !== S.deck) return;
  const xs = rooms.flatMap(r => r.polygon.map(p => p.x)), ys = rooms.flatMap(r => r.polygon.map(p => Y(p.y))), cr = $('center').getBoundingClientRect();
  if (boxView(xs, ys, cr)) return;
  const x1 = v.minX + v.rect.width / v.k, y1 = v.minY + v.rect.height / v.k;
  if (Math.max(...xs) > v.minX && Math.min(...xs) < x1 && Math.max(...ys) > v.minY && Math.min(...ys) < y1) S.planView = { deck: S.deck, k: v.k, minX: v.minX - v.rect.left / v.k, minY: v.minY - v.rect.top / v.k };
 }
 // ③ ④ ⑤ → ① ②: BOX on the deck and at the view the plan showed, the plan's room picked in BOX (as from its room list)
 function toBox() {
  try {
   if (!box.loading || !box.hasDrawing()) return;
   box.showDeck(S.deck);
   const v = S.planShown; if (v?.deck === S.deck) box.viewTo(v.minX, v.minY, v.k, $('center').getBoundingClientRect());
   box.highlight(S.contract.rooms.find(r => r.id === S.room) || null);
  } catch {}
 }
 // ③ opens on the deck BOX showed in ① ② - the same deck on the same canvas
 function followBoxDeck() { try { const a = box.loading && box.win.CAD_APP?.st?.activeDeck; if (a && S.contract?.decks.some(d => d.id === a) && S.deck !== a) { S.deck = a; S.room = null; pickSystem(); } } catch {} }
 async function go(id) {
  if (S.step === 'duct' && id !== 'duct') { if (S.phgEditor) readBackIfEdited(); S.phgEditor = false; }
  const from = viewOf(S.step), to = viewOf(id);
  if (from === 'box' && to === 'plan' && S.contract) fromBox();
  if (from === 'plan' && to === 'box' && S.contract) toBox();
  // ③ ④ ⑤ are one canvas: the view on screen stays (⑤'s dock takes the bottom of it; a double click fits the deck again)
  if (viewOf(S.step) === 'plan' && viewOf(id) === 'plan' && !S.planView && S.planShown?.deck === S.deck) S.planView = { ...S.planShown };
  S.step = id; S.pickRoot = false; render();
  const view = viewOf(id);
  if (view === 'box') await act(box.loading ? null : 'BOX CAL 여는 중', () => box.load());
  if (view === 'phg') await act(phg.loading ? null : 'PHG D 여는 중', async () => { await loadPhg(); const key = curKey(); if (key && S.projects[key] && S.active !== key) await openKey(key); });
 }
 // undo / redo go to the app on screen (each keeps its own history); in ③ and ⑤ to the HVAC Grid edits
 const frameOnScreen = () => ({ box: box.loading && box, phg: phg.loading && phg }[viewOf(S.step)] || null);

 // ---------- render ----------
 // tab badges: ✓ done, ● n warnings, ↻ n results to redo after a change upstream
 function stepBadge(id) {
  const C = S.contract; if (!C) return '';
  const ps = plans(), stale = ps.filter(p => result(p.key)?.stale).length, auto = ps.filter(p => result(p.key)?.auto && !result(p.key).stale).length;
  const pending = C.rooms.filter(r => !C.loads[r.id].complete).length, assumed = ps.filter(p => p.isUnitDeck && p.rootSource.startsWith('assumed')).length;
  const b = (cls, text, tip) => `<span class="badge ${cls}" title="${esc(tip)}">${text}</span>`;
  if (id === 'room') return b('done', '✓', 'BOX 격실을 설계 데이터로 만들었습니다');
  if (id === 'load') return pending ? b('warn', '● ' + pending, `부하 계산 미완료 격실 ${pending}개`) : b('done', '✓', '모든 격실 부하 계산 완료');
  if (id === 'air') return assumed ? b('warn', '● ' + assumed, `공조기 위치가 임시인 계통 ${assumed}개`) : b('done', '✓', '모든 계통 공조기 위치 확정 (지정·팬룸)');
  if (id === 'duct') return stale ? b('redo', '↻ ' + stale, `풍량·위치가 바뀌어 다시 보내야 하는 계획 ${stale}개`) : ps.length && auto === ps.length ? b('done', '✓', '모든 Deck·계통 AUTO 완료') : auto ? b('warn', `${auto}/${ps.length}`, `AUTO 완료 ${auto}/${ps.length}`) : '';
  if (id === 'review') { const n = analysis()?.count || {}; return n.fail ? b('fail', '✕ ' + n.fail, `검토 실패 ${n.fail} · 확인 필요 ${n.check}`) : n.check ? b('warn', '● ' + n.check, `확인 필요 ${n.check}개 항목`) : b('done', '✓', '검토 항목 모두 통과'); }
  return '';
 }
 function steps() {
  $('steps').innerHTML = STEPS.map((s, i) => `<button class="step" role="tab" data-step="${s.id}" aria-selected="${s.id === S.step}" title="${esc(s.name)} · Alt+${i + 1}"><b>${i + 1}</b>${s.name}${stepBadge(s.id)}</button>`).join('');
  const f = frameOnScreen(), name = f === box ? 'BOX' : f === phg ? 'PHG D' : 'HVAC Grid';
  $('undoBtn').disabled = !f && !S.undo.length; $('redoBtn').disabled = !f && !S.redo.length;
  $('undoBtn').title = `실행 취소 (${name} 편집 기록${!f && S.undo.length ? ': ' + S.undo.at(-1).label : ''}) · Ctrl+Z`; $('redoBtn').title = `다시 실행 (${name} 편집 기록${!f && S.redo.length ? ': ' + S.redo.at(-1).label : ''}) · Ctrl+Y`;
 }
 // the ribbon's ‹ › show while there is more of it to that side
 function ribbonMore() { const el = $('ribbon'), l = $('rbLeft'), r = $('rbRight'); if (!l || !r) return; l.hidden = el.scrollLeft <= 2; r.hidden = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2; }
 function ribbon() {
  const groups = stepOf(S.step).groups(); let n = 0; const runs = [], segs = {};
  $('ribbon').innerHTML = groups.map(([cap, items]) => `<div class="grp"><div class="btns">${items.map(it => {
   if (it.field) { if (it.seg) segs[it.segName] = it.seg; return it.field; }
   runs.push(it); const dis = typeof it.disabled === 'function' ? it.disabled() : it.disabled, pr = it.pressed?.();
   const tip = [it.title ? `${it.label} · ${it.title}` : it.label, it.code && `이전 단축: ${it.code}`].filter(Boolean).join('\n');
   return `<button class="cmd${it.primary ? ' primary' : ''}" data-i="${n++}" title="${esc(tip)}" ${dis ? 'disabled' : ''} ${pr != null ? `aria-pressed="${!!pr}"` : ''}>${icon(it.icon)}<span>${esc(it.label)}</span></button>`;
  }).join('')}</div><div class="cap">${esc(cap)}</div></div>`).join('');
  for (const [id, dir] of [['rbLeft', -1], ['rbRight', 1]]) $(id).onclick = () => $('ribbon').scrollBy({ left: dir * $('ribbon').clientWidth * 0.8, behavior: 'smooth' });
  ribbonMore();
  $('ribbon').querySelectorAll('.cmd').forEach(b => b.onclick = () => runs[+b.dataset.i].run());
  $('ribbon').querySelectorAll('.seg').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { segs[g.dataset.seg](b.dataset.v); render(); }));
  const sel = $('sysSel'); if (sel) sel.onchange = () => { S.sys = sel.value; const p = curPlan(); if (p) S.kind = p.kind; S.pickRoot = false; if (S.step === 'duct' && S.phgEditor) act(null, async () => { const k = curKey(); if (S.projects[k]) await openKey(k); }); else render(); };
  const unit = $('unitSel'); if (unit && !unit.disabled) unit.onchange = () => act(null, () => setUnitDeck(unit.value));
  const ship = $('shipSel'); if (ship) ship.onchange = () => act(null, () => { setSolas('ship', ship.value); say('SOLAS 선종: ' + SO.DATA.ships[ship.value].label); });
  const method = $('methodSel'); if (method) method.onchange = () => act(null, () => { setSolas('method', method.value); say('방화방식 ' + method.value); });
  const below = $('belowSel'); if (below) below.onchange = () => act(null, () => { setSolas('lowestBelow', below.value || null); say('최하층 아래: ' + (below.value || '미지정')); });
  const spr = $('sprinklerSel'); if (spr) spr.onchange = () => act(null, () => { setSolas('sprinkler', !!spr.value); say('스프링클러: ' + (spr.value ? '양쪽 설치' : '없음·한쪽')); });
 }
 // the value column follows the step: m² (rooms), W (loads), CMH of the chosen kind (③ on); system colours from ③ on
 const VALUE = { room: ['m²', r => r.areaM2 ? r.areaM2.toFixed(1) : ''], load: ['W', (r, C) => fmt(C.loads[r.id].coolingSensibleW)] };
 function tree() {
  if (!S.contract) {
   $('chips').innerHTML = ''; $('treeCount').textContent = '';
   $('tree').innerHTML = `<div class="hint">② 부하 단계에서 <b>설계 데이터 만들기</b>를 누르면 BOX의 Deck·격실이 여기에 나타납니다.<br><button class="btn" id="treeSample">S5 예제 열기 (도면 + 설계 데이터)</button><button class="btn" id="treeT3">T3 시험선 열기</button></div>`;
   $('treeSample').onclick = () => act('S5 예제 여는 중', () => openSample('s5')); $('treeT3').onclick = () => act('T3 시험선 여는 중', () => openSample('t3')); return;
  }
  const C = S.contract, q = $('q').value.trim().toLowerCase(), cls = analysis().solas.classes;
  const [unit, value] = VALUE[S.step] || ['CMH', r => C.airflow[r.id][FIELD[S.kind]] || ''], dots = !VALUE[S.step];
  const filters = { all: ['전체', () => true], sup: ['급기', r => r.systems.supply], exh: ['배기', r => r.systems.exhaust], ret: ['환기', r => r.systems.return], pending: ['부하 미완료', r => !C.loads[r.id].complete], solas: ['SOLAS 미분류', r => !cls[r.id]?.cat] };
  $('chips').innerHTML = Object.entries(filters).map(([k, [l, f]]) => { const n = C.rooms.filter(f).length; return (k === 'pending' || k === 'solas') && !n && S.filter !== k ? '' : `<button class="chip" data-f="${k}" aria-pressed="${S.filter === k}">${l} ${n}</button>`; }).join('');
  $('chips').querySelectorAll('button').forEach(b => b.onclick = () => { S.filter = b.dataset.f; render(); });
  let count = 0;
  $('tree').innerHTML = `<div class="colhead"><span>번호</span><span>실명</span><span>${unit}</span></div>` + [...C.decks].sort((a, b) => b.elevationMm - a.elevationMm).map(d => {
   const rooms = C.rooms.filter(r => r.deckId === d.id).filter(r => (!q || `${r.no} ${r.name}`.toLowerCase().includes(q)) && filters[S.filter][1](r));
   count += rooms.length; const open = d.id === S.deck || (q && rooms.length);
   return `<div class="deck"><button class="deckh" data-deck="${esc(d.id)}" aria-expanded="${!!open}">${open ? '▾' : '▸'} ${esc(d.name)} <small>Z ${fmt(d.elevationMm)} · ${rooms.length}실</small></button>${open ? rooms.map(r => { const sid = r.systems[S.kind];
    return `<button class="room" data-room="${esc(r.id)}" aria-selected="${r.id === S.room}" title="${esc(r.no)} ${esc(r.name)}${r.isoClass ? ' · ISO 분류 ' + esc(isoName(r.isoClass)) : ''} · SOLAS ${esc(cls[r.id]?.space || '미분류')}"><span class="no">${esc(r.no)}</span><span class="nm">${dots ? `<span class="dot" style="background:${sid ? sysColor(sid) : 'transparent'};${sid ? '' : 'border:1px solid var(--line)'}"></span>` : ''}${esc(r.name)}</span><span class="cmh">${value(r, C)}</span></button>`; }).join('') : ''}</div>`;
  }).join('');
  $('treeCount').textContent = count + '실';
  $('tree').querySelectorAll('.deckh').forEach(e => e.onclick = () => { S.deck = e.dataset.deck; S.room = null; pickSystem(); render(); if (S.step === 'duct' && S.phgEditor) act(null, async () => { const k = curKey(); if (k && S.projects[k]) await openKey(k); }); });
  $('tree').querySelectorAll('.room').forEach(e => e.onclick = () => selectRoom(e.dataset.room));
 }
 function selectRoom(id) {
  const r = S.contract.rooms.find(x => x.id === id); S.room = id; S.duct = null;
  if (r.deckId !== S.deck) { S.deck = r.deckId; pickSystem(); }
  const sid = r.systems[S.kind];
  if (sid && deckPlans(S.kind).some(p => p.systemId === sid) && !(S.step === 'duct' && S.active)) S.sys = deckPlans(S.kind).find(p => p.systemId === sid).systemKey;
  if (S.step === 'duct' && phg.loading && S.active?.startsWith(r.deckId + '__')) phg.zoomTo(r.polygon, 1500);
  render();
 }
 // the ③ ④ plan shows a deck as the ① ② canvas (BOX) does: BOX y runs down the screen. Y() turns a BOX y into the plan's
 // y and back (PHG D's duct points come with y already turned: app y = -BOX y)
 const Y = v => v;
 // ② → ③ without a jump: the plan shows the part of the deck BOX showed, at BOX's scale and on the same pixels, when BOX
 // holds this deck in 2D (its canvas lies on the same full-width area); null - the plan fits the deck itself
 function boxView(xs, ys, rc) {
  try {
   if (!box.loading || !box.hasDrawing()) return null;
   const d = box.doc, bs = d.getElementById('svg'); if (!bs || d.getElementById('canvas')?.classList.contains('iso')) return null;
   const m = bs.getScreenCTM(), fr = $('boxFrame').getBoundingClientRect();
   if (!m || !(m.a > 0) || Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9 || Math.abs(m.a - m.d) > 1e-6 * m.a) return null;   // 2D, y down, one scale
   const k = m.a, wx = sx => (sx - fr.left - m.e) / k, wy = sy => (sy - fr.top - m.f) / k, v = { minX: wx(rc.left), maxX: wx(rc.right), minY: wy(rc.top), maxY: wy(rc.bottom), k };
   // only when BOX frames this deck (another drawing, another deck far away: no)
   const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
   const ix = Math.max(0, Math.min(x1, v.maxX) - Math.max(x0, v.minX)), iy = Math.max(0, Math.min(y1, v.maxY) - Math.max(y0, v.minY));
   return ix * iy >= 0.9 * (x1 - x0) * (y1 - y0) ? v : null;
  } catch { return null; }
 }
 function plan() {
  // ① ②: the layers over BOX's own canvas - its view and its active deck; BOX takes every click (docs/PLAN.md H5 4)
  const over = viewOf(S.step) === 'box', bv2 = over ? box.view2d() : null;
  if (over) followBoxDeck();
  const C = S.contract, svg = $('plan'), rooms = C.rooms.filter(r => r.deckId === S.deck);
  svg.classList.toggle('over-box', over);
  // (over BOX in 3D or on a deck the design data has not got: nothing over BOX - the plan's own background would hide it)
  if (!rooms.length || (over && !bv2)) { svg.innerHTML = ''; if (over) { show(svg, false); layerPanel(layersOn(), rooms, curPlan(), analysis()); } return; }
  if (over) show(svg, true);
  const xs = rooms.flatMap(r => r.polygon.map(p => p.x)), ys = rooms.flatMap(r => r.polygon.map(p => Y(p.y)));
  let minX, minY, maxX, maxY, k, onBox;
  if (over) {
   Object.assign(svg.style, { left: bv2.rect.left + 'px', top: bv2.rect.top + 'px', width: bv2.rect.width + 'px', height: bv2.rect.height + 'px' });
   ({ minX, minY, k } = bv2); maxX = minX + bv2.rect.width / k; maxY = minY + bv2.rect.height / k; onBox = true;
  } else {
  svg.style.left = svg.style.top = svg.style.width = svg.style.height = '';
  // the ① ② canvas itself (BOX: its lines, room labels, grid and origin axes, at its resolution) is the background, the
  // chosen deck alone on it (box.solo); the plan draws only what BOX has not got - system colours, flows, units, RUs,
  // ducts, fire boundaries. Without BOX's drawing of this deck (or BOX in 3D) the plan draws the deck itself
  let boxDeck = false;
  if (box.loading) try { if (box.hasDrawing()) { box.showDeck(S.deck); boxDeck = box.win.CAD_APP.st.activeDeck === S.deck; } } catch {}
  const rc = svg.getBoundingClientRect();
  // the user's own view of this deck (wheel zoom, pan - planNav); another deck drops it, a double click fits again
  if (S.planView && S.planView.deck !== S.deck) S.planView = null;
  const nav = S.planView;
  let bv = nav || !boxDeck ? null : boxView(xs, ys, rc);
  // BOX's view with the deck under a floating panel (a narrow window): BOX's view moves so the deck sits between them
  if (bv && $('main').classList.contains('plan-view')) {
   const L = rc.left + $('left').offsetWidth, R = rc.right - $('right').offsetWidth, sx = x => rc.left + (x - bv.minX) * bv.k;
   if (sx(Math.min(...xs)) < L + 8 || sx(Math.max(...xs)) > R - 8) {
    const deck = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    if (box.fitDeck(deck, { left: L, right: R, top: rc.top, bottom: rc.bottom })) bv = boxView(xs, ys, rc);
   }
  }
  // the user's own view, BOX's view (② → ③ without a jump) or the deck fitted; BOX's canvas is moved to the plan's view
  // when the plan chose it
  if (nav) { ({ minX, minY, k } = nav); maxX = minX + rc.width / k; maxY = minY + rc.height / k; legendRoom = true; }
  // the legend opens by itself only where it does not cover the deck (on BOX's view it may not)
  else if (bv) { ({ minX, minY, maxX, maxY, k } = bv); const sideR = $('main').classList.contains('plan-view') ? $('right').offsetWidth : 0; legendRoom = rc.width - sideR - (Math.max(...xs) - minX) * k >= 320; }
  else { legendRoom = true;
   // the deck fits the free strip between the floating panels, and left of the legend (top right, ~300 px)
   const sideL = $('main').classList.contains('plan-view') ? $('left').offsetWidth : 0, sideR = $('main').classList.contains('plan-view') ? $('right').offsetWidth : 0;
   const legendPx = legendOpen() && rc.width - sideL - sideR > 900 ? 300 : 0, free = Math.max(200, rc.width - sideL - sideR - legendPx);
   const x0 = Math.min(...xs) - 900, x1 = Math.max(...xs) + 900, y0 = Math.min(...ys) - 900, y1 = Math.max(...ys) + 900;
   k = Math.min(free / (x1 - x0), rc.height / (y1 - y0)) || 0.08;
   minX = (x0 + x1) / 2 - (sideL + free / 2) / k; maxX = minX + rc.width / k;
   minY = (y0 + y1) / 2 - rc.height / 2 / k; maxY = minY + rc.height / k;
  }
  onBox = boxDeck && (!!bv || (() => { try { return box.viewTo(minX, minY, k, rc); } catch { return false; } })());
  $('boxFrame').style.visibility = onBox ? 'visible' : 'hidden'; $('boxFrame').classList.toggle('backdrop', onBox);
  S.planShown = { deck: S.deck, minX, minY, k }; planNav(svg);
  }
  svg.classList.toggle('on-box', onBox);
  svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`); svg.setAttribute('preserveAspectRatio', 'none');
  // sizes in screen px: k = px per mm of the plan; the layers on (the layer panel, LAYER_DEFAULT per step)
  const px = v => v / k, cur = curPlan(), ductMode = S.step === 'duct', review = S.step === 'review', a = analysis(), L = layersOn();
  if (!over) box.backdrop(onBox, ductMode, { labels: L.has('rooms') });
  let html = '', sel = '';
  // over BOX the rooms are BOX's (its pick, its labels): drawn only for a layer that colours or outlines them
  for (const r of over && !['rooms', 'sys', 'fire'].some(x => L.has(x)) ? [] : rooms) {
   const sid = r.systems[S.kind], bx = r.polygon.map(p => p.x), by = r.polygon.map(p => Y(p.y)), x0 = Math.min(...bx), y0 = Math.min(...by), wPx = (Math.max(...bx) - x0) * k, hPx = (Math.max(...by) - y0) * k;
   const pts = r.polygon.map(p => p.x + ',' + Y(p.y)).join(' '), cl = a.solas.classes[r.id], flow = C.airflow[r.id][FIELD[S.kind]], fireOnly = L.has('fire') && !L.has('sys'), uncls = L.has('fire') && !cl?.cat;
   const fill = L.has('sys') && sid ? sysColor(sid) + (sid === cur?.systemId ? (ductMode ? '1f' : '38') : (ductMode ? '0d' : '1a')) : uncls ? 'var(--warn-fill)' : 'transparent';
   // the room stays pickable with the 격실 layer off (its outline and labels go)
   html += `<polygon class="rm${uncls ? ' uncls' : ''}${L.has('rooms') ? '' : ' bare'}" data-room="${esc(r.id)}" points="${pts}" fill="${fill}"><title>${esc(r.no)} ${esc(r.name)} · ${fireOnly ? 'SOLAS ' + esc(cl?.space || '미분류') + (cl?.cat ? ` (${cl.cat}) ` + esc(SO.catName(a.solas.settings.ship, cl.cat)) : '') : `${KL[S.kind]} ${flow} CMH`}</title></polygon>`;
   // labels pinned to the top-left corner inside the room (RUs and the unit sit at the centre); an L-shaped room whose
   // corner is cut out gets them at its interior point; narrow rooms keep only the number
   if (wPx >= 28 && hPx >= 18) {
    let lx = x0 + px(6), ly = y0 + px(17);
    if (!PL.inside({ x: lx, y: Y(ly + px(15)) }, r.polygon) || !PL.inside({ x: lx + px(40), y: Y(ly - px(10)) }, r.polygon)) { const ip = PL.interiorPoint(r.polygon, 100, r.holes); lx = ip.x - px(20); ly = Y(ip.y) - px(18); }
    // on BOX's canvas BOX labels the room; drawn alone, the plan writes the number, and the name where it fits
    const own = !onBox && L.has('rooms'), named = own && wPx >= 64 && hPx >= 50;
    if (own) html += `<text class="lbl no" x="${lx}" y="${ly}" style="font-size:${px(12)}px">${esc(r.no)}</text>`;
    if (named) html += `<text class="lbl" x="${lx}" y="${ly + px(14)}" style="font-size:${px(11)}px">${esc(r.name)}</text>`;
    const sub = L.has('sys') ? (flow ? `${flow} CMH` : '') : L.has('fire') ? (cl?.cat ? `(${cl.cat})` : '미분류') : '';
    if (wPx >= 64 && hPx >= 36 && sub) html += `<text class="lbl${!L.has('sys') && uncls ? ' warnt' : ''}" x="${lx}" y="${!own ? ly : ly + px(named ? 28 : 15)}" style="font-size:${px(11)}px">${esc(sub)}</text>`;
   }
   if (r.id === S.room && !over) sel = `<polygon class="selhalo" points="${pts}"/><polygon class="selline" points="${pts}"/>`;
  }
  // the decks above and below, faint (deck filter)
  if (S.deckGhost) html += ghostDecks(px);
  // ducts PHG D made: ③ of the chosen kind, thin; ④ the chosen system's network strong and pickable, others of the deck
  // faint as asked; ⑤ every system of the deck, faint (the penetrations sit on them)
  // the current plan's forbidden zones for AUTO as PHG D gets them (lib/phg-plan.cjs: the restricted rooms it does not
  // serve, pulled in 50 mm; the outside of the deck) - AUTO may have run without some (zonesRelaxed, the panel says)
  if (L.has('zones') && cur) {
   html += `<defs><pattern id="zoneHatch" width="${px(7)}" height="${px(7)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${px(7)}" class="zh"/></pattern><pattern id="outHatch" width="${px(9)}" height="${px(9)}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="${px(9)}" class="oh"/></pattern></defs>`;
   for (const z of cur.outside || []) html += `<polygon class="zone out" points="${z.map(q => q.x + ',' + Y(q.y)).join(' ')}"><title>금지 영역: 선체 밖 (AUTO가 피함)</title></polygon>`;
   for (const z of (cur.avoid || []).filter(z => z.zone?.length > 2)) html += `<polygon class="zone" points="${z.zone.map(q => q.x + ',' + Y(q.y)).join(' ')}"><title>금지 영역: ${esc(z.no)} ${esc(z.name)} (${esc(z.space)}) — AUTO가 피함 (II-2/9.7.2)</title></polygon>`;
  }
  if (L.has('ducts')) {
   const show = S.ductShow || 'sys', ductPlans = ductMode ? deckPlans().filter(p => show === 'all' || (show === 'kind' ? p.kind === S.kind : p.key === cur?.key)) : review ? deckPlans() : deckPlans(S.kind);
   for (const p of ductPlans) (S.geometry[p.key]?.ducts || []).forEach((d, i) => {
    const on = p.key === cur?.key, w = ductMode ? (d.type === 'main' ? 4 : d.type === 'branch' ? 2.6 : 1.6) : (d.type === 'main' ? 2.5 : 1.5), pts = d.points.map(q => `${q.x},${Y(-q.y)}`).join(' ');
    if (ductMode && S.duct?.key === p.key && S.duct.i === i) html += `<polyline class="duct dsel" points="${pts}" stroke-width="${w + 7}"></polyline>`;
    html += `<polyline class="duct${ductMode ? ' pick' : ''}" data-key="${esc(p.key)}" data-i="${i}" points="${pts}" stroke="${sysColor(p.systemId)}" stroke-width="${w}" opacity="${ductMode ? (on ? .95 : .3) : review ? .4 : on ? .95 : .45}"><title>${KL[p.kind]} ${esc(p.systemId)} ${esc(d.displayName)} ${d.widthMm ? d.widthMm + '×' + d.heightMm : d.diameterMm ? 'Ø' + d.diameterMm : ''} · ${d.flowCmh} CMH</title></polyline>`;
   });
   // ④: the current network's ducts labelled where there is room (덕트 글자) - the main ducts' sizes, every duct's
   // velocity, or the loss from the Root to its end with each RU's path total (PHG D's pressure calculation, the index
   // RU in red)
   const lab = S.ductLabel || 'size', pr = ductMode && cur && lab === 'pa' ? pressureOf(cur.key) : null;
   if (ductMode && cur) for (const d of (S.geometry[cur.key]?.ducts || []).filter(d => d.points.length > 1 && (lab !== 'size' || d.type === 'main'))) {
    const [p0, p1] = [d.points[0], d.points.at(-1)], len = Math.hypot(p1.x - p0.x, p1.y - p0.y) * k; if (len < 70) continue;
    const area = d.widthMm ? d.widthMm * d.heightMm / 1e6 : d.diameterMm ? Math.PI * (d.diameterMm / 2000) ** 2 : 0;
    const text = lab === 'vel' ? (area ? (d.flowCmh / 3600 / area).toFixed(1) + ' m/s' : '') : lab === 'pa' ? (pr?.ducts[d.id] ? Math.round(pr.ducts[d.id].fromRootPa) + ' Pa' : '') : d.widthMm ? `${d.widthMm}×${d.heightMm}` : d.diameterMm ? `Ø${d.diameterMm}` : ''; if (!text) continue;
    const vert = Math.abs(p1.x - p0.x) < Math.abs(p1.y - p0.y), mx = (p0.x + p1.x) / 2, my = Y(-(p0.y + p1.y) / 2);
    html += `<text class="dsz" x="${mx + (vert ? px(6) : 0)}" y="${my - (vert ? 0 : px(6))}" text-anchor="${vert ? 'start' : 'middle'}" style="font-size:${px(10)}px">${text}</text>`;
   }
   if (pr) for (const u of pr.rus) html += `<text class="dsz ru-pa${u.id === pr.indexRu ? ' idx' : ''}" x="${u.x + px(7)}" y="${Y(u.y) - px(7)}" style="font-size:${px(10)}px">${Math.round(u.totalPa)} Pa<title>${esc(u.name)} ${fmt(u.flowCmh)} CMH: Root에서 이 RU까지 ${u.totalPa} Pa (RU 포함)${u.id === pr.indexRu ? ' — 최대(인덱스)' : ''}</title></text>`;
  }
  // fire boundaries: the restricted spaces a duct passes, the rated walls (the 방화 등급도's layer)
  if (L.has('fire')) {
   for (const p of a.solas.passages.filter(x => x.deckId === S.deck && x.roomId)) { const r = C.rooms.find(x => x.id === p.roomId); if (!r) continue;
    html += `<polygon class="pass ${p.level}" points="${r.polygon.map(q => q.x + ',' + Y(q.y)).join(' ')}"><title>${esc(p.systemId)}: ${esc(p.text)} (${esc(p.rule)})</title></polygon>`; }
   html += fireLayer(a, px, { pens: false });
  }
  // transfer air: a short arrow across the middle of the wall the two rooms share (where the door grille or transfer
  // duct goes), with its CMH; solid when the user chose the source, orange through an A-class boundary
  if (L.has('xfer')) for (const r of rooms) { const A = C.airflow[r.id], src = C.rooms.find(x => x.id === A.transferFrom); if (!src || !A.transferInCmh) continue;
   let seg = null; for (const e of GE.roomEdges(src)) for (const g of GE.roomEdges(r)) { const q = GE.sharedSegment(e, g, 400, 100); if (q && (!seg || q.lengthMm > seg.lengthMm)) seg = q; }
   let m, ux, uy;
   if (seg) { m = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 }; const sl = seg.lengthMm || 1; ux = -(seg.b.y - seg.a.y) / sl; uy = (seg.b.x - seg.a.x) / sl;
    const c = PL.interiorPoint(src.polygon, 100, src.holes); if ((c.x - m.x) * ux + (c.y - m.y) * uy > 0) { ux = -ux; uy = -uy; } }
   else { const p = PL.interiorPoint(src.polygon, 100, src.holes), q = PL.interiorPoint(r.polygon, 100, r.holes), sl = Math.hypot(q.x - p.x, q.y - p.y) || 1; ux = (q.x - p.x) / sl; uy = (q.y - p.y) / sl; m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; }
   const len = px(16), h = px(6), fx = m.x - ux * len, fy = m.y - uy * len, tx = m.x + ux * len, ty = m.y + uy * len;
   const bd = a.solas.boundaries.find(b => b.kind === 'bulkhead' && ((b.roomA === r.id && b.roomB === src.id) || (b.roomB === r.id && b.roomA === src.id))), aClass = /^A/.test(bd?.grade || '');
   // the label's halo is the CSS one, 3 screen px (non-scaling): a plan-unit stroke-width here, scaled as screen px,
   // drew white discs over the rooms' names (N3 captures 2026-10-22)
   html += `<g class="xfer${A.transferSet ? ' set' : ''}${aClass ? ' acls' : ''}"><line x1="${fx}" y1="${Y(fy)}" x2="${tx}" y2="${Y(ty)}"/><polygon points="${tx + ux * h},${Y(ty + uy * h)} ${tx - uy * h * .6},${Y(ty + ux * h * .6)} ${tx + uy * h * .6},${Y(ty - ux * h * .6)}"/>`
    + `<text x="${m.x - uy * px(9)}" y="${Y(m.y + ux * px(9)) + px(3)}" text-anchor="middle" style="font-size:${px(10)}px">${fmt(A.transferInCmh)}</text>`
    + `<title>전달 공기 ${fmt(A.transferInCmh)} CMH: ${esc(src.no)} ${esc(src.name)} → ${esc(r.no)} ${esc(r.name)}${bd?.grade ? ' · 경계 ' + esc(bd.grade) : ''}${A.transferSet ? ' (지정)' : ' (자동)'}</title></g>`; }
  if (L.has('pens')) html += fireLayer(a, px, { walls: false });
  // the current plan's RUs: supply circle, return diamond, exhaust square (shape and colour); dragged in ④
  if (L.has('rus') && cur) for (const u of cur.rus) {
   const x = u.x, y = Y(u.y), r = px(4.5), cls = `ru${ductMode ? ' drag' : ''}${u.moved ? ' moved' : ''}`, t = `<title>${esc(u.id)} · ${fmt(u.flowCmh)} CMH${u.moved ? ' · 옮김' : ''}${ductMode ? ' — 끌어서 옮기기' : ''}</title>`, dg = `data-key="${esc(cur.key)}" data-ru="${esc(u.id)}"`;
   html += cur.kind === 'supply' ? `<circle class="${cls}" ${dg} cx="${x}" cy="${y}" r="${r}" fill="${sysColor(cur.systemId)}">${t}</circle>`
    : cur.kind === 'return' ? `<path class="${cls}" ${dg} d="M${x} ${y - r * 1.2}L${x + r * 1.2} ${y}L${x} ${y + r * 1.2}L${x - r * 1.2} ${y}Z" fill="${sysColor(cur.systemId)}">${t}</path>`
    : `<rect class="${cls}" ${dg} x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${sysColor(cur.systemId)}">${t}</rect>`;
  }
  html += sel;
  // units (filled = set by the user, dashed = a guess) on the unit deck; vertical duct shafts (circles) on the other decks
  if (L.has('units')) for (const p of deckPlans(S.kind)) {
   const col = sysColor(p.systemId), on = p.key === cur?.key, user = p.rootSource === 'user', firm = user || /^(fan|shaft|own)-room|above-unit/.test(p.rootSource), s = px(on ? 22 : 18), cx = p.root.x, cy = Y(p.root.y);
   const tip = `${esc(p.systemId)} ${p.isUnitDeck ? (p.kind === 'supply' ? '공조기' : '팬') : '수직 덕트'} · ${esc(rootText(p.rootSource))}`;
   html += p.isUnitDeck ? `<g class="mk${ductMode && on ? ' drag' : ''}" data-key="${esc(p.key)}" opacity="${on ? 1 : .6}"><rect class="root${firm ? '' : ' guess'}" x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="${px(3)}" ${user ? `fill="${col}" stroke="${col}"` : `stroke="${col}"`}><title>${tip}</title></rect><text class="ahu${user ? '' : ' guess'}" x="${cx}" y="${cy + px(3)}" text-anchor="middle" style="font-size:${px(8)}px">${UNIT_WORD[p.kind]}</text></g>`
    : `<g class="mk${ductMode && on ? ' drag' : ''}" data-key="${esc(p.key)}" opacity="${on ? 1 : .6}"><circle class="root shaft${firm ? '' : ' guess'}" cx="${cx}" cy="${cy}" r="${s / 2}" ${user ? `fill="${col}" stroke="${col}"` : `stroke="${col}"`}><title>${tip}</title></circle><text class="ahu${user ? '' : ' guess'}" x="${cx}" y="${cy + px(4)}" text-anchor="middle" style="font-size:${px(11)}px">⇅</text></g>`;
  }
  // a place picked in ⑤ (a row of its tables): a ring that fades, along the wall for a wall
  if (S.focus && S.focus.deckId === S.deck) html += S.focus.a && S.focus.b ? `<line class="focus" x1="${S.focus.a.x}" y1="${Y(S.focus.a.y)}" x2="${S.focus.b.x}" y2="${Y(S.focus.b.y)}"/>` : `<circle class="focus" cx="${S.focus.x}" cy="${Y(S.focus.y)}" r="${px(18)}"/>`;
  // the origin axes as BOX draws them in ① ② (renderAxis2d): X to the right, Y up the screen, 0,0 - on BOX's canvas BOX's own
  const al = px(18), ah = px(3), ar = px(2), afs = px(8);
  if (!onBox) html += `<g class="axis"><line class="ax" x1="0" y1="0" x2="${al}" y2="0"/><polygon class="ax" points="${al},0 ${al - ah},${-ah * .55} ${al - ah},${ah * .55}"/>`
   + `<line class="ay" x1="0" y1="0" x2="0" y2="${-al}"/><polygon class="ay" points="0,${-al} ${-ah * .55},${-al + ah} ${ah * .55},${-al + ah}"/><circle class="at" cx="0" cy="0" r="${ar * 1.8}"/><circle class="ao" cx="0" cy="0" r="${ar}"/>`
   + `<text class="ax" x="${al + ah * .35}" y="${afs * .34}" style="font-size:${afs}px">X</text><text class="ay" x="${afs * .28}" y="${-al - ah * .18}" style="font-size:${afs}px">Y</text><text class="ao" x="${px(-13)}" y="${px(9)}" style="font-size:${afs * .82}px">0,0</text></g>`;
  svg.innerHTML = html; svg.classList.toggle('picking', S.pickRoot);
  svg.querySelectorAll('.rm').forEach(e => e.onclick = ev => { if (S.pickRoot) return; ev.stopPropagation(); selectRoom(e.dataset.room); });
  if (ductMode) planDrag(svg);
  svg.querySelectorAll('.mk').forEach(e => e.onclick = ev => { if (S.pickRoot) return; ev.stopPropagation(); if (e.dataset.dragged) { delete e.dataset.dragged; return; } S.sys = plans().find(p => p.key === e.dataset.key).systemKey; render(); });
  // ④: a duct picked on the plan (a duct of another system makes that system the current one)
  svg.querySelectorAll('.duct.pick').forEach(e => e.onclick = ev => { if (S.pickRoot) return; ev.stopPropagation(); const p = plans().find(x => x.key === e.dataset.key); if (p) { S.sys = p.systemKey; S.kind = p.kind; } S.duct = { key: e.dataset.key, i: +e.dataset.i }; S.room = null; render(); });
  svg.onclick = ev => { if (!S.pickRoot) return; const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); setRoot({ x: q.x, y: Y(q.y) }); render(); };
  if (ductMode) { const res = cur && result(cur.key);
   // a network made before the plan changed (air, unit, RUs): said on the canvas, with the way out
   let banner = $('staleBanner'); if (!banner) { banner = document.createElement('div'); banner.id = 'staleBanner'; banner.className = 'stale-banner'; $('center').appendChild(banner); }
   show(banner, !!res?.auto && !!res.stale && !S.phgEditor);
   if (res?.stale) { banner.innerHTML = `↻ 이 덕트망은 풍량·위치가 바뀌기 전 것입니다 <button class="btn primary">다시 AUTO</button>`; banner.querySelector('button').onclick = () => act('AUTO 계산 중', () => autoKey()); }
  }
  layerPanel(L, rooms, cur, a);
 }
 // ① ②: BOX redraws on its own pan, zoom and deck change and the user picks rooms in it - the layers over it and the
 // shell's deck and room follow (a frame's look at BOX's view, deck and pick; drawn again only on a change)
 let boxSeen = '', boxWatching = false;
 function watchBox() {
  if (viewOf(S.step) !== 'box' || !S.contract) { boxSeen = ''; boxWatching = false; return; }
  boxWatching = true;
  try {
   const v = box.view2d(), st = box.win.CAD_APP.st, ids = new Set(S.contract.rooms.map(r => r.id)), picked = box.pickedRoom(ids);
   const seen = JSON.stringify([v, st.activeDeck, picked]);
   if (seen !== boxSeen) {
    boxSeen = seen;
    if (picked && picked !== S.room) { S.room = picked; S.deck = S.contract.rooms.find(r => r.id === picked).deckId; pickSystem(); }
    plan(); status();
   }
  } catch {}
  requestAnimationFrame(watchBox);
 }
 // ---------- the plan's layers (③ ④ ⑤; ① ② later - docs/PLAN.md H5 4) ----------
 // one list for every step; a step opens with its own set on (③ by its 풍량 / 방화 보기), and what the user switches is
 // kept per step for the next start
 const LAYERS = [['rooms', '격실'], ['sys', '계통 색·풍량'], ['xfer', '전달 공기'], ['units', '공조기·수직 덕트'], ['zones', '금지 영역'], ['ducts', '덕트'], ['rus', 'RU'], ['fire', '방화 경계'], ['pens', '관통부']];
 const LAYER_DEFAULT = { room: [], load: [], 'air:air': ['rooms', 'sys', 'xfer', 'units', 'ducts'], 'air:fire': ['rooms', 'units', 'fire', 'pens'], duct: ['rooms', 'sys', 'units', 'zones', 'ducts', 'rus'], review: ['rooms', 'units', 'ducts', 'fire', 'pens'] };
 const layerKey = () => S.step === 'air' ? 'air:' + (S.overlay === 'fire' ? 'fire' : 'air') : S.step;
 const layersOn = () => new Set(S.layers[layerKey()] || LAYER_DEFAULT[layerKey()] || LAYER_DEFAULT.review);
 const saveLayers = () => { try { localStorage.setItem('hvac-grid-layers', JSON.stringify({ layers: S.layers, ghost: S.deckGhost, dropAuto: S.dropAuto })); } catch {} };
 function setLayer(id, on) { const s = layersOn(); if (on) s.add(id); else s.delete(id); S.layers = { ...S.layers, [layerKey()]: LAYERS.map(([x]) => x).filter(x => s.has(x)) }; saveLayers(); }
 // the decks just above and below (deck filter "위·아래 흐리게"), faint and dashed: their rooms, their ducts and their
 // units and shafts - where a vertical duct or a deck penetration lines up (③ ④ of the chosen kind, ⑤ every kind)
 function ghostDecks(px) {
  const ds = [...S.contract.decks].sort((x, y) => x.elevationMm - y.elevationMm), i = ds.findIndex(d => d.id === S.deck);
  return [[ds[i + 1], 'up', '위'], [ds[i - 1], 'down', '아래']].filter(([d]) => d).map(([d, cls, w]) => {
   let h = S.contract.rooms.filter(r => r.deckId === d.id).map(r => `<polygon points="${r.polygon.map(p => p.x + ',' + Y(p.y)).join(' ')}"/>`).join('');
   for (const p of plans().filter(x => x.deckId === d.id && (S.step === 'review' || x.kind === S.kind))) {
    for (const dc of S.geometry[p.key]?.ducts || []) h += `<polyline class="gd" points="${dc.points.map(q => `${q.x},${Y(-q.y)}`).join(' ')}"/>`;
    h += `<circle class="gu" cx="${p.root.x}" cy="${Y(p.root.y)}" r="${px(p.isUnitDeck ? 10 : 8)}"/>`;
   }
   return `<g class="ghost ${cls}" data-deck="${esc(d.id)}"><title>${w} Deck: ${esc(d.name)}</title>${h}</g>`;
  }).join('');
 }
 // the layer panel (top right of the plan, where the legend was): a switch per layer with its key under it while it is
 // on, and the deck filter
 function layerPanel(L, rooms, cur, a) {
  const C = S.contract, onDeck = x => x.deckId === S.deck, ln = (c, h = 3, o = 1) => `<span class="ln" style="background:${c};height:${h}px;opacity:${o}"></span>`;
  const bnd = a.solas.boundaries.filter(onDeck), cnt = g => bnd.filter(x => x.grade === g).length, pens = a.solas.penetrations.filter(onDeck);
  const sys = [...new Set(rooms.map(r => r.systems[S.kind]).filter(Boolean))].sort(), res = cur && result(cur.key);
  const keys = {
   sys: `${KL[S.kind]} 계통<br>${sys.map(id => `<span class="dot" style="background:${sysColor(id)}"></span>${esc(id)} · ${fmt(C.systems.find(s => s.id === id && s.kind === S.kind)?.designCmh)} CMH`).join('<br>') || '<span class="muted">이 Deck에 없음</span>'}`,
   xfer: rooms.some(r => C.airflow[r.id].transferInCmh && C.rooms.some(x => x.id === C.airflow[r.id].transferFrom)) ? '→ CMH (실선 = 지정 · 주황 = A급 경계)' : '<span class="muted">이 Deck에 없음</span>',
   units: `${UNIT_WORD[S.kind]} □ 공조기·팬 · ⇅ ○ 수직 덕트 · 채움 = 지정 · 점선 = 임시`,
   ducts: S.step === 'duct' ? (cur ? `<b>${KL[cur.kind]} ${esc(cur.systemId)}</b> ${res?.auto ? `덕트 ${res.ducts}개 · ${res.lengthM} m · 최대 ${res.indexPa ?? '—'} Pa${res.stale ? ' · <span class="warn">다시 보내기 필요</span>' : ''}` : '<span class="warn">덕트망 없음 — 보내기 + AUTO</span>'}<br>${ln(sysColor(cur.systemId), 4)}주 덕트 · ${ln(sysColor(cur.systemId), 2)}분기${deckPlans().filter(p => p.key !== cur.key && ((S.ductShow || 'sys') === 'all' || ((S.ductShow || 'sys') === 'kind' && p.kind === S.kind))).map(p => `<br>${ln(sysColor(p.systemId), 3, .6)}${KL[p.kind]} ${esc(p.systemId)}${result(p.key)?.auto ? '' : ' <span class="muted">(덕트망 없음)</span>'}`).join('')}<br><span class="muted">${{ vel: '글자 = 풍속 (풍량 ÷ 단면)', pa: '글자 = Root에서 그 덕트 끝까지 손실(덕트·이음) · RU 옆 = 그 RU까지 합계(RU 포함), 빨강 = 최대' }[S.ductLabel] || '글자 = 주 덕트 크기'} · 덕트를 누르면 크기·종류·압력</span>` : '<span class="muted">이 Deck에 계통이 없습니다</span>')
    : S.step === 'review' ? 'Deck의 모든 계통 (옅게)' : `${KL[S.kind]} 계통 (얇게)`,
   rus: `● 급기 · ◆ 환기 · ■ 배기${S.step === 'duct' ? `<br><span class="muted">RU·공조기는 끌어서 옮김 → ${S.dropAuto ? '놓으면 다시 AUTO' : '덕트망에 "다시 AUTO" 표시 (AUTO는 직접)'}</span>` : cur ? '' : ' <span class="muted">(계통을 고르면)</span>'}`,
   zones: cur ? `<span class="zk"></span>제한 구역 ${(cur.avoid || []).filter(z => z.zone?.length > 2).length} · <span class="zk out"></span>선체 밖 <span class="muted">(AUTO가 피함)</span>${res?.zonesRelaxed ? `<br><span class="warn">이 덕트망은 AUTO가 ${{ outside: '선체 밖', rooms: '제한 구역', all: '모든 금지 영역' }[res.zonesRelaxed === true ? 'all' : res.zonesRelaxed] || '금지 영역'}을 풀고 만든 것</span>` : ''}` : '<span class="muted">(계통을 고르면)</span>',
   fire: `<span class="muted">${esc(SO.DATA.ships[a.solas.settings.ship].label)}</span><br>${['A-60', 'A-30', 'A-15', 'A-0', 'B-15', 'B-0'].filter(cnt).map(g => `${ln(SVG.GRADE_COLORS[g], 4)}${g} · ${cnt(g)}`).join('<br>')}${bnd.some(x => !x.grade) ? `<br>${ln('#d97706', 3)}등급 미정` : ''}${a.solas.passages.some(onDeck) ? '<br><span class="err">▨ 제한 구역 통과</span>' : ''}<br>${a.solas.summary.unclassified.length ? `<span class="warn">미분류 실 ${a.solas.summary.unclassified.length} (전체) — 실 선택 후 오른쪽에서 지정</span>` : '<span class="muted">모든 실 분류됨</span>'}`,
   pens: `<span class="pd fd"></span>방화댐퍼 ${pens.filter(x => x.damper).length} · <span class="pd"></span>관통 ${pens.length} · <span class="pd dk"></span>갑판 관통` };
  const ds = [...C.decks].sort((x, y) => x.elevationMm - y.elevationMm), i = ds.findIndex(d => d.id === S.deck), up = ds[i + 1], down = ds[i - 1];
  $('legend').innerHTML = `<b>${esc(deckName(S.deck))} · 층</b><div class="layers">${LAYERS.map(([id, name]) => `<label class="ly"><input type="checkbox" data-layer="${id}" ${L.has(id) ? 'checked' : ''}> ${name}</label>${L.has(id) && keys[id] ? `<div class="ly-key">${keys[id]}</div>` : ''}`).join('')}</div>`
   + (up || down ? `<div class="seg ghost-seg" role="radiogroup" aria-label="Deck 필터"><button role="radio" data-ghost="0" aria-checked="${!S.deckGhost}">이 Deck만</button><button role="radio" data-ghost="1" aria-checked="${!!S.deckGhost}">위·아래 흐리게</button></div>${S.deckGhost ? `<div class="ly-key">${up ? `${ln('#7b5ea7', 2)}위 ${esc(up.name)}` : ''}${up && down ? ' · ' : ''}${down ? `${ln('#b5731f', 2)}아래 ${esc(down.name)}` : ''}</div>` : ''}` : '');
  // over BOX (① ②): at the top right of BOX's canvas, clear of its side columns
  const bv2 = viewOf(S.step) === 'box' ? box.view2d() : null, lg = $('legend');
  lg.style.top = bv2 ? bv2.rect.top + 12 + 'px' : ''; lg.style.right = bv2 ? $('center').clientWidth - bv2.rect.left - bv2.rect.width + 12 + 'px' : '';
  $('legend').querySelectorAll('[data-layer]').forEach(e => e.onchange = () => { setLayer(e.dataset.layer, e.checked); plan(); });
  $('legend').querySelectorAll('[data-ghost]').forEach(e => e.onclick = () => { S.deckGhost = e.dataset.ghost === '1'; saveLayers(); plan(); });
  legendFold();
 }
 // the deck's fire layer as the 방화 등급도 lays it out (lib/fire-plan.cjs layout - the report's and the DXF's drawing):
 // the wall runs in their rating's colour with the rating along them (등급 미정 and outer walls dashed; C and outer
 // walls as the 방화 등급도 tab's choices), the penetrations - circle, fire damper square with a slash, deck penetration (vertical duct)
 // diamond - with FD / SL beside them (the two are layers of their own). Strokes in screen px, as the rest of the plan
 function fireLayer(a, px, { walls = true, pens: withPens = true } = {}) {
  const d = fireModel().decks.find(x => x.id === S.deck); if (!d) return '';
  const L = FP.layout(d, { s: px }), bnd = new Map(a.solas.boundaries.map(b => [b.id, b])), pens = new Map(a.solas.penetrations.filter(p => p.deckId === S.deck).map(p => [p.no, p]));
  let lines = '', marks = '', labels = '';
  for (const w of walls ? L.walls : []) {
   const g = w.run.grade; if (g === '-' || (g === 'C' && !S.fpShowC) || (g === '*' && !S.fpShowOuter)) continue;
   const bs = w.run.ids.map(id => bnd.get(id)).filter(Boolean), pairs = [...new Set(bs.map(b => `${b.aSpace || '?'} ↔ ${b.bSpace || '?'}`))], checks = [...new Set(bs.flatMap(b => b.check || []))];
   lines += `<line class="fb${w.dash ? ' dash' : ''}" data-run="${w.i}" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${w.color}" stroke-width="${((FP.WIDTH[g] || 1.4) * 1.1).toFixed(2)}"><title>${esc(g || '등급 미정')} · ${(w.run.lengthMm / 1000).toFixed(1)} m · ${esc(pairs.slice(0, 3).join(', '))}${pairs.length > 3 ? ' …' : ''}${bs[0]?.table ? ` (Table ${esc(bs[0].table)})` : ''}${checks.length ? ' · ' + esc(checks.join(' / ')) : ''}</title></line>`;
   if (w.label) labels += `<text class="fpl" x="${w.label.x}" y="${w.label.y}" transform="rotate(${w.label.rot} ${w.label.x} ${w.label.y})" text-anchor="middle" dy="${w.label.dy}" style="font-size:${w.label.size}px" fill="${w.color}">${esc(w.label.text)}</text>`;
  }
  for (const { pen, x, y, label } of withPens ? L.pens : []) {
   const pn = pens.get(pen.no); if (!pn) continue;
   const r = px(pn.damper ? 6 : 4.5), cls = `pen${/SIZE|CHECK/.test(pn.code) || pn.note ? ' chk' : ''}`, tip = `<title>${esc(pn.no)} ${esc(pn.systemId)} ${esc(pn.duct)} · ${esc(pn.grade || '미정')} · ${esc(pn.size)} · ${esc(pn.text)}${pn.note ? ' · ' + esc(pn.note) : ''}</title>`;
   marks += pn.boundaryKind === 'deck' ? `<path class="${cls} dk${pn.damper ? ' fd' : ''}" d="M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z">${tip}</path>`
    : pn.damper ? `<g class="${cls} fd"><rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}"/><line x1="${x - r}" y1="${y + r}" x2="${x + r}" y2="${y - r}"/>${tip}</g>` : `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}">${tip}</circle>`;
   if (label) labels += `<text class="fpl pl" x="${label.x}" y="${label.y}" style="font-size:${label.size}px">${esc(label.text)}</text>`;
  }
  return lines + marks + labels;
 }
 // a place a row of ⑤ points at (RP.openItemsAt): its deck, the point to ring (a room's middle, a plan's unit or shaft,
 // a penetration, a wall), the room to select and the plan to make current
 function placeOf(at) {
  const C = S.contract; if (!at || !C) return null;
  const roomAt = id => { const r = C.rooms.find(x => x.id === id); if (!r) return null; const c = PL.interiorPoint(r.polygon, 100, r.holes); return { deckId: r.deckId, x: c.x, y: c.y, roomId: r.id }; };
  if (at.roomId) { const f = roomAt(at.roomId); return f && { ...f, key: at.key || null }; }
  if (at.boundary) { const b = analysis().solas.boundaries.find(x => x.id === at.boundary); if (!b) return null;
   return b.a && b.b ? { deckId: b.deckId, x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2, a: b.a, b: b.b } : roomAt(b.roomA || b.roomB); }
  if (at.key || at.systemId) {
   const ps = plans(), p = at.key ? ps.find(x => x.key === at.key) : ps.find(x => x.systemId === at.systemId && x.isUnitDeck && (!at.kind || x.kind === at.kind)) || ps.find(x => x.systemId === at.systemId && x.isUnitDeck);
   return p ? { deckId: p.deckId, x: p.root.x, y: p.root.y, key: p.key } : null;
  }
  return at.deckId && at.x != null ? { deckId: at.deckId, x: at.x, y: at.y } : null;
 }
 // ⑤: a row picked - its deck on the canvas, its room selected or its place ringed; moved into the middle of the canvas
 // (between the floating panels, above the dock) when it is off the part on screen; the zoom stays
 function showPlace(at) {
  const f = placeOf(at); if (!f || !S.contract.decks.some(d => d.id === f.deckId)) return false;
  if (f.deckId !== S.deck) { S.deck = f.deckId; S.planView = null; }
  S.room = f.roomId || null; S.duct = null;
  const p = f.key ? plans().find(x => x.key === f.key) : null, r = f.roomId ? S.contract.rooms.find(x => x.id === f.roomId) : null;
  if (p) { S.kind = p.kind; S.sys = p.systemKey; }
  else if (r?.systems[S.kind]) { const q = deckPlans(S.kind).find(x => x.systemId === r.systems[S.kind]); if (q) S.sys = q.systemKey; }
  pickSystem();
  const mark = S.focus = { deckId: f.deckId, x: f.x, y: f.y, a: f.a || null, b: f.b || null };
  render();
  const v = S.planShown, rc = $('plan').getBoundingClientRect();
  if (v && v.deck === S.deck && rc.width > 0) {
   const side = $('main').classList.contains('plan-view'), Lx = side ? $('left').offsetWidth : 0, Rx = rc.width - (side ? $('right').offsetWidth : 0);
   // a deck shown much smaller than the canvas (BOX's view of every deck): the deck fitted first
   const ps = S.contract.rooms.filter(r => r.deckId === S.deck).flatMap(r => r.polygon), x0 = Math.min(...ps.map(q => q.x)) - 900, x1 = Math.max(...ps.map(q => q.x)) + 900, y0 = Math.min(...ps.map(q => Y(q.y))) - 900, y1 = Math.max(...ps.map(q => Y(q.y))) + 900;
   const kFit = Math.min((Rx - Lx) / (x1 - x0), rc.height / (y1 - y0));
   if (v.k < kFit * 0.6) { S.planView = { deck: S.deck, k: kFit, minX: (x0 + x1) / 2 - (Lx + Rx) / 2 / kFit, minY: (y0 + y1) / 2 - rc.height / 2 / kFit }; plan(); }
   else {
    const sx = (f.x - v.minX) * v.k, sy = (Y(f.y) - v.minY) * v.k, mx = (Rx - Lx) * 0.15, my = rc.height * 0.15;
    if (sx < Lx + mx || sx > Rx - mx || sy < my || sy > rc.height - my) { S.planView = { deck: S.deck, k: v.k, minX: f.x - (Lx + Rx) / 2 / v.k, minY: Y(f.y) - rc.height / 2 / v.k }; plan(); }
   }
  }
  setTimeout(() => { if (S.focus === mark) { S.focus = null; if (viewOf(S.step) === 'plan' && S.contract) plan(); } }, 4000);
  return true;
 }
 // ⑤'s dock: its height (open: dragged, else 40 % of the canvas; folded: its tabs), and the plan above it
 function dockSize() {
  const on = S.step === 'review' && !!S.contract, d = $('dock'), cH = $('center').clientHeight;
  d.classList.toggle('folded', !S.dockOpen);
  let h = 0;
  if (on && S.dockOpen) { h = Math.round(Math.min(Math.max(S.dockH || cH * 0.4, 120), Math.max(120, cH - 160))); d.style.height = h + 'px'; }
  else { d.style.height = ''; if (on) h = d.offsetHeight; }
  $('center').style.setProperty('--dock-h', h + 'px');
 }
 $('dockGrip').onpointerdown = ev => {
  if (ev.button !== 0) return; ev.preventDefault();
  const g = ev.currentTarget, y0 = ev.clientY, h0 = $('dock').offsetHeight; let raf = 0;
  g.setPointerCapture(ev.pointerId); S.dockOpen = true;
  g.onpointermove = e => { S.dockH = h0 - (e.clientY - y0); if (!raf) raf = requestAnimationFrame(() => { raf = 0; dockSize(); if (S.contract) plan(); }); };
  g.onpointerup = g.onpointercancel = () => { g.onpointermove = g.onpointerup = g.onpointercancel = null; S.dockH = $('dock').offsetHeight; saveDock(); render(); };
 };
 // a row picked twice (counted here: the first pick draws the dock again, so the browser's dblclick does not come)
 let lastPick = null;
 // ⑤ review: tabs over the analysis
 const TABS =[['nets', '덕트망'], ['systems', '계통·수직 덕트'], ['diagram', '계통도'], ['fire', '방화 (SOLAS)'], ['fireplan', '방화 등급도'], ['checks', '검토']];
 const tableHtml = (sh, { keys, limit, cls, tip = '누르면 평면에서 보기 · 두 번 누르면 ④ RU·덕트에서 열기' } = {}) => `<div class="scrollx"><table><thead><tr>${sh.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sh.rows.slice(0, limit || sh.rows.length).map((r, i) => `<tr${keys && keys[i] != null ? ` data-key="${esc(keys[i])}" class="go${keys[i] === S.active ? ' active' : ''}" title="${esc(tip)}"` : ''}>${r.map((v, j) => `<td class="${typeof v === 'number' ? 'n ' : ''}${cls ? cls(r, j, i) : ''}">${esc(typeof v === 'number' ? v.toLocaleString() : v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${limit && sh.rows.length > limit ? `<p class="muted">… ${sh.rows.length - limit}행 더 — 통합 XLSX 참조</p>` : ''}`;
 // a sheet with one column moved forward (the status of a row first on a narrow screen; the XLSX keeps its order)
 const front = (sh, name, at) => { const i = sh.head.indexOf(name); if (i < 0) return sh; const mv = r => { const c = r.slice(); const [v] = c.splice(i, 1); c.splice(at, 0, v); return c; }; return { ...sh, head: mv(sh.head), rows: sh.rows.map(mv) }; };
 // the penetration list for the screen: what to do at each crossing first (the XLSX has every column)
 function penTable(pens) {
  const room = id => { const r = S.contract.rooms.find(x => x.id === id); return r ? `${r.no} ${r.name}` : '(외부)'; };
  return { head: ['번호', '등급', '조치', '경계', '계통 · 덕트', 'Deck', '크기 (mm)'], rows: pens.map(p => [p.no, p.grade || '미정', p.text + (p.note ? ' · ' + p.note : ''), `${room(p.roomA)} ↔ ${room(p.roomB)}`, `${KL[p.kind]} ${p.systemId} · ${p.duct}`, deckName(p.deckId), p.size]) };
 }
 function report() {
  const a = analysis(), sh = RP.sheets(project(), a), get = n => sh.find(s => s.name === n), C = S.contract, roomText = id => { const r = C.rooms.find(x => x.id === id); return r ? `${r.no} ${r.name}` : '(외부)'; };
  const LV = { fail: ['err', '✕ 실패'], check: ['warn', '● 확인'], ok: ['ok', '✓ 통과'] };
  // the places the rows point at (showPlace): row key "at:<n>"
  const places = [], at = p => p ? (places.push(p), 'at:' + (places.length - 1)) : null, GO = '누르면 평면에서 위치 보기';
  let body = '';
  if (S.tab === 'nets') {
   const nets = front(get('Deck 덕트망'), '상태', 3), last = 3;
   body = `<h3>Deck·계통별 PHG D 덕트망 <small class="muted">${a.done}/${a.total} AUTO 완료${a.stale ? ` · 다시 보내기 ${a.stale}` : ''} · 누르면 평면에서, 두 번 누르면 ④에서 엽니다</small></h3>${tableHtml(nets, { keys: a.plans.map(p => p.key), cls: (r, j) => j === last ? (r[j] === 'AUTO 완료' ? 'ok' : r[j] === '미생성' ? 'muted' : 'warn') : j === 5 && /임시/.test(r[j]) ? 'warn' : j === 7 && r[7] !== '' && r[7] !== r[8] ? 'warn' : '' })}`;
  } else if (S.tab === 'systems') {
   body = `<h3>공조 구역 풍량 수지 <small class="muted">신기 = max(최소 신기 합, 배기 합 + 가압 ${C.rules.pressurizationPct ?? 5} %(${C.rules.pressurizationBasis === 'supply' ? '급기' : '배기'} 대비), 급기 × ${C.rules.minOaPct ?? 25} %) · 환기 = 급기 − 신기 · 화장실 등은 이웃 실에서 전달 공기</small></h3>${tableHtml(get('구역 수지'), { cls: (r, j) => j === 11 ? (r[j] === '적합' ? 'ok' : 'err') : '' })}
    <h3>계통·팬 <small class="muted">덕트 외부 정압(ESP) = Deck 덕트망 최대 + 공조기에서 그 Deck까지 수직 덕트 · 팬 정압 추정 = ESP + 공조기 내부 + 루버</small></h3>${tableHtml(front(get('계통·팬'), '상태', 2), { cls: (r, j) => j === 2 && r[j] !== '계산 완료' ? 'warn' : '' })}
    <h3>수직 덕트 <small class="muted">공조기 Deck에서 다른 Deck으로 · 크기: 풍속 ≤ 10 m/s · 마찰 ≤ 2 Pa/m</small></h3>${a.risers.length ? tableHtml(get('수직 덕트')) : '<p class="muted">여러 Deck을 담당하는 계통이 없습니다.</p>'}`;
  } else if (S.tab === 'diagram') {
   // one schematic per AHU / fan system (lib/diagram.cjs): unit, vertical duct with sizes, every deck with its air and losses
   body = `<h3>계통도 <small class="muted">${a.systems.length}개 계통 · 공조기·팬 → 수직 덕트(크기·풍량·풍속·방화댐퍼) → Deck별 덕트망(풍량·RU·길이·손실) · 굵은 테두리 = 최대 손실 Deck(ESP) · Deck을 누르면 평면에서, 두 번 누르면 ④에서 엽니다</small></h3><div class="diagrams">${DG.systemDiagrams(C, a).map(d => `<figure class="dia">${DG.toSvg(d)}</figure>`).join('')}</div>`;
  } else if (S.tab === 'fireplan') {
   // SOLAS ratings written on the deck plan: a room's category and deck ratings, each wall run's rating, the penetrations
   const m = fireModel(), dk = m.decks.find(d => d.id === S.deck) || m.decks[m.decks.length - 1];
   const n = d => d.walls.filter(w => w.label).length;
   body = `<h3>방화 등급도 <small class="muted">위 평면에 같은 층 · 아래는 보고서·DXF의 그림 · ${esc(m.shipLabel)} · 방화방식 ${esc(m.method)}${m.lowestBelow ? ' · 최하층 아래 ' + esc(m.lowestBelow) : ' · 최하층 아래 미지정'} · 같은 등급이 한 줄로 이어진 벽은 한 번, ${(m.options.minLabelMm / 1000).toFixed(0)} m 미만은 표기 생략</small></h3>
    <div class="fp-bar"><span class="seg">${m.decks.slice().reverse().map(d => `<button data-fpdeck="${esc(d.id)}" aria-pressed="${d === dk}">${esc(d.name)} <small>${n(d)}</small></button>`).join('')}</span>
     <label><input type="checkbox" id="fpShowC" ${S.fpShowC ? 'checked' : ''}> C급 표기</label><label><input type="checkbox" id="fpShowOuter" ${S.fpShowOuter ? 'checked' : ''}> 외벽(*) 표기</label>
     <button class="btn" id="fpDxf">DXF 저장</button></div>
    ${FP.legendHtml(m)}<div class="fireplan-wrap">${dk ? FP.toSvg(m, dk.id, { width: Math.max(700, ($('report').clientWidth || 1100) - 40) }) : ''}</div>
    <p class="muted">실 안: 번호 이름 / (SOLAS 범주) 공간 / 바닥·천장 등급(A·B급, 아래·위 실이 여럿이면 가장 엄한 등급 "등"). 노란 빗금 = 미분류 실, 주황 점선 = 등급 미정 경계 — ⑤ 방화 (SOLAS) 탭에서 분류. 보고서·DXF에 같은 그림.</p>`;
  } else if (S.tab === 'fire') {
   const sum = a.solas.summary, shp = SO.DATA.ships[a.solas.settings.ship], unc = sum.unclassified.map(id => C.rooms.find(r => r.id === id));
   const roomChecks = Object.entries(a.solas.classes).filter(([, k]) => k.check);
   // grade chips filter the penetration list (and the dampers chip shows only fire dampers)
   const gf = S.gradeFilter, pens = a.solas.penetrations.filter(p => !gf || (gf === 'FD' ? p.damper : (p.grade || '미정') === gf));
   const pt = penTable(pens);
   body = `<h3>방화 경계 ${sum.boundaries}개 <small class="muted">${esc(shp.label)} · Table ${shp.tB}/${shp.tD} · 방화방식 ${esc(a.solas.settings.method)} · 최하층 아래 ${esc(a.solas.settings.lowestBelow || '미지정')} · 설계 보조 — 최종 판단 주관청·선급</small></h3>
    <p class="grades">${Object.entries(sum.byGrade).sort((x, y) => SO.rank(x[0]) - SO.rank(y[0])).map(([g, n]) => `<button class="gchip" data-grade="${esc(g)}" aria-pressed="${gf === g}" style="--g:${SVG.GRADE_COLORS[g] || '#999'}" title="이 등급의 관통만 보기">${esc(g)} <b>${n}</b></button>`).join('')}<button class="gchip" data-grade="FD" aria-pressed="${gf === 'FD'}" style="--g:#111" title="방화댐퍼 관통만 보기">방화댐퍼 <b>${sum.fireDampers}</b></button></p>
    ${unc.length ? `<h3 class="warn">미분류 실 ${unc.length}개 — 공간을 지정하면 경계·관통 판정이 바로 다시 계산됩니다</h3><table class="assign"><tbody>${unc.map(r => `<tr class="go" data-key="${at({ roomId: r.id })}" title="${GO}"><td>${esc(deckName(r.deckId))}</td><td>${esc(r.no)} ${esc(r.name)}</td><td><select data-solas="${esc(r.id)}" aria-label="${esc(r.no)} SOLAS 공간"><option value="">자동 분류</option>${spaceOptions('')}</select></td></tr>`).join('')}</tbody></table>` : '<p class="ok">✓ 모든 실이 SOLAS 공간으로 분류됨</p>'}
    ${roomChecks.length ? `<h3>분류 확인 ${roomChecks.length}실</h3><table class="assign"><tbody>${roomChecks.map(([id, k]) => `<tr class="go" data-key="${at({ roomId: id })}" title="${GO}"><td>${esc(roomText(id))}</td><td>${esc(k.space)}</td><td class="warn">${esc(k.check)}</td><td><select data-solas="${esc(id)}" aria-label="${esc(roomText(id))} SOLAS 공간"><option value="">자동 분류</option>${spaceOptions(C.solas?.rooms?.[id]?.space || '')}</select></td></tr>`).join('')}</tbody></table>` : ''}
    ${a.solas.passages.length ? `<h3 class="err">제한 구역 통과 ${a.solas.passages.length}건 (II-2/9.7.2)</h3>${tableHtml(get('제한 구역 통과'), { keys: a.solas.passages.map(p => at(p.roomId ? { roomId: p.roomId, key: p.planKey } : { key: p.planKey })), tip: GO, cls: (r, j) => j === 0 ? (r[0] === '실패' ? 'err' : 'warn') : '' })}` : '<p class="ok">✓ 제한 구역(A류 기관구역·조리실·CO₂실·계단 등)을 지나는 덕트 없음</p>'}
    <h3>SOLAS 점검표 <small class="muted">계통 분리 경고 · 조리실 배기(9.7.5) · 축전지실·CO₂실 · 통풍 정지·폐쇄(5.2)</small></h3>${tableHtml(get('SOLAS 점검표'), { keys: [...a.solas.warnings.map(w => at({ systemId: w.systemId, kind: w.kind })), ...a.solas.checklist.map(x => at(x.systemId ? { systemId: x.systemId } : null))], tip: GO, cls: (r, j) => j === 0 ? (r[0] === '실패' ? 'err' : 'warn') : '' })}
    <h3>덕트 관통 ${pens.length}${gf ? ` / ${sum.penetrations}` : ''}곳 <small class="muted">슬리브 ${Object.entries(sum.sleeves).map(([m, n]) => `${m} mm × ${n}`).join(', ') || '없음'} · 행을 누르면 평면에서 위치 표시${sum.penetrations && !Object.keys(S.geometry).length ? ' · Deck 덕트는 AUTO 후 판정 (지금은 수직 덕트만)' : ''}</small></h3>
    <div>${tableHtml(pt, { limit: 300, keys: pens.map(p => 'pen:' + p.no), tip: GO, cls: (r, j) => j === 1 && /^A-60/.test(r[1]) ? 'err' : j === 2 && /방화댐퍼|판정|확인|미정|샤프트/.test(r[2]) ? 'warn' : '' })}</div>`;
  } else {
   const items = RP.openItemsAt(project(), a);
   body = `<h3>검토 <small class="muted">실패 ${a.count.fail} · 확인 필요 ${a.count.check} · 통과 ${a.count.ok}</small></h3><table class="checks"><tbody>${['fail', 'check'].flatMap(lv => a.checks.filter(k => k.level === lv)).map(k => `<tr><td class="${LV[k.level][0]}">${LV[k.level][1]}</td><td>${esc(k.text)}</td></tr>`).join('')}</tbody></table>${a.count.ok ? `<details class="grp-items ok-items"><summary><span class="${LV.ok[0]}">${LV.ok[1]}</span> ${a.count.ok}건</summary><table class="checks"><tbody>${a.checks.filter(k => k.level === 'ok').map(k => `<tr><td class="${LV.ok[0]}">${LV.ok[1]}</td><td>${esc(k.text)}</td></tr>`).join('')}</tbody></table></details>` : ''}
    <h3>미해결 확인 사항 ${items.length}건</h3>${items.length ? groups(items).map(([lv, area, rows]) => `<details class="grp-items" ${lv === 'fail' || rows.length <= 5 ? 'open' : ''}><summary><span class="${LV[lv][0]}">${LV[lv][1]}</span> ${esc(area)} <span class="muted">${rows.length}건</span></summary><table class="checks wide grp-table"><tbody>${rows.slice(0, 200).map(([text, p]) => { const k = at(p); return `<tr${k ? ` class="go" data-key="${k}" title="${GO}"` : ''}><td>${esc(text)}</td></tr>`; }).join('')}</tbody></table>${rows.length > 200 ? `<p class="muted">… ${rows.length - 200}건 더 (XLSX 확인 사항 시트)</p>` : ''}</details>`).join('') : '<p class="ok">없음</p>'}
    <p class="muted">설계 보조 결과 — 최종 판단은 설계자·주관청·선급. 출력: 위 리본의 통합 XLSX·통합 DXF·보고서.</p>`;
  }
  const badge = id => id === 'fire' ? (a.solas.summary.passagesFail + a.solas.warnings.length + a.solas.summary.checklistFail ? ` <span class="badge fail" title="방화 실패 항목: 제한 구역 통과 ${a.solas.summary.passagesFail} · 계통 분리 경고 ${a.solas.warnings.length} · 점검표 위반 ${a.solas.summary.checklistFail} (검토 탭에서는 한 줄씩 묶여 셈)">✕ ${a.solas.summary.passagesFail + a.solas.warnings.length + a.solas.summary.checklistFail}</span>` : a.solas.summary.unclassified.length ? ` <span class="badge warn">● ${a.solas.summary.unclassified.length}</span>` : '')
   : id === 'checks' ? (a.count.fail ? ` <span class="badge fail" title="실패한 검토 항목 ${a.count.fail}줄 (한 줄에 여러 건이 묶일 수 있음)">✕ ${a.count.fail}</span>` : a.count.check ? ` <span class="badge warn">● ${a.count.check}</span>` : '') : id === 'systems' && a.zones.some(z => !z.ok) ? ' <span class="badge fail">✕</span>' : '';
  $('report').innerHTML = `<div class="tabs" role="tablist">${TABS.map(([id, l]) => `<button role="tab" data-tab="${id}" aria-selected="${S.tab === id}">${l}${badge(id)}</button>`).join('')}<button class="dock-fold" id="dockFold" aria-expanded="${S.dockOpen}" title="${S.dockOpen ? '표를 접고 평면을 넓게' : '표 펼치기'}">${S.dockOpen ? '▾ 접기' : '▴ 펼치기'}</button></div>${body}`;
  $('report').querySelectorAll('.tabs button[role=tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; if (!S.dockOpen) { S.dockOpen = true; saveDock(); } render(); });
  $('dockFold').onclick = () => { S.dockOpen = !S.dockOpen; saveDock(); render(); };
  // a row (or a deck box of 계통도) picked: its place on the plan; a plan's row picked twice opens it in ④
  $('report').onclick = ev => {
   const el = ev.target.closest('tbody tr[data-key], .deckbox[data-plan]'); if (!el || ev.target.closest('select, input, button, summary, a')) return;
   const key = el.dataset.key || el.dataset.plan, now = performance.now(), twice = lastPick?.key === key && now - lastPick.t < 450;
   lastPick = twice ? null : { key, t: now };
   if (key.startsWith('pen:')) { const p = a.solas.penetrations.find(x => x.no === key.slice(4)); if (p) showPlace({ deckId: p.deckId, x: p.x, y: p.y }); return; }
   if (key.startsWith('at:')) { showPlace(places[+key.slice(3)]); return; }
   const p = plans().find(x => x.key === key); if (!p) return;
   if (twice) { S.deck = p.deckId; S.sys = p.systemKey; S.kind = p.kind; go('duct'); } else showPlace({ key });
  };
  $('report').querySelectorAll('[data-fpdeck]').forEach(b => b.onclick = () => { S.deck = b.dataset.fpdeck; render(); });
  if ($('fpShowC')) { $('fpShowC').onchange = e => { S.fpShowC = e.target.checked; render(); }; $('fpShowOuter').onchange = e => { S.fpShowOuter = e.target.checked; render(); }; $('fpDxf').onclick = () => act(null, OUT.fireDxf); }
  $('report').querySelectorAll('.gchip[data-grade]').forEach(b => b.onclick = () => { S.gradeFilter = S.gradeFilter === b.dataset.grade ? null : b.dataset.grade; render(); });
  $('report').querySelectorAll('select[data-solas]').forEach(s => s.onchange = () => act(null, () => setSolasRoom(s.dataset.solas, s.value)));
 }
 function inspector() {
  const C = S.contract;
  if (!C) { $('inspTitle').textContent = '속성'; $('insp').innerHTML = `<div class="card"><h4>시작</h4><span class="muted">① BOX에서 도면을 열고(S5·T3 예제 포함) ② CAL로 부하를 계산한 뒤 <b>설계 데이터 만들기</b>를 누르세요. 저장한 HVAC Grid 프로젝트는 위쪽 열기 버튼으로 엽니다.</span></div>`; return; }
  const r = C.rooms.find(x => x.id === S.room), a = analysis();
  const dk = S.step === 'duct' && S.duct ? plans().find(p => p.key === S.duct.key) : null, d = dk && S.geometry[dk.key]?.ducts?.[S.duct.i];
  if (!r && d) {
   const area = d.widthMm ? d.widthMm * d.heightMm / 1e6 : d.diameterMm ? Math.PI * (d.diameterMm / 2000) ** 2 : 0, v = area ? d.flowCmh / 3600 / area : null;
   const L = d.points.slice(1).reduce((t, q, i) => t + Math.hypot(q.x - d.points[i].x, q.y - d.points[i].y), 0) / 1000, res = result(dk.key);
   $('inspTitle').innerHTML = `덕트 ${esc(d.displayName || d.id)}`;
   $('insp').innerHTML = `<div class="card now"><h4>${esc({ main: '주 덕트', branch: '분기', sub_branch: '보조 분기' }[d.type] || d.type || '덕트')}<span class="from">PHG D</span></h4><div class="kv">
     <span>계통</span><span><span class="dot" style="background:${sysColor(dk.systemId)}"></span>${KL[dk.kind]} ${esc(dk.systemId)}</span>
     <span>크기</span><span><b>${d.widthMm ? d.widthMm + ' × ' + d.heightMm : d.diameterMm ? 'Ø ' + d.diameterMm : '—'}</b> mm</span>
     <span>풍량</span><span><b>${fmt(d.flowCmh)}</b> CMH</span><span>풍속</span><span>${v ? v.toFixed(1) + ' m/s' : '—'}</span><span>길이</span><span>${L.toFixed(1)} m</span></div>${d.manualSize ? '<div class="muted" style="margin-top:6px">수동 크기 — PHG D가 다시 정하지 않음</div>' : ''}</div>`
    + (() => { const pq = pressureOf(dk.key), q = pq?.ducts?.[d.id];
     return `<div class="card"><h4>압력<span class="from">PHG D 계산</span></h4>${q ? `<div class="kv"><span>풍속</span><span>${q.velocityMps} m/s</span><span>마찰</span><span>${q.perMPa ?? '—'} Pa/m · ${q.frictionPa} Pa</span><span>곡관</span><span>${q.bendPa} Pa</span><span>분기</span><span>${q.branchPa} Pa</span><span>Root에서 끝까지</span><span><b>${q.fromRootPa}</b> Pa</span><span>계통 최대</span><span>${pq.indexPa ?? '—'} Pa</span></div>` : `<span class="muted">${pq ? '이 덕트는 RU로 가는 경로에 없음' : res?.auto ? 'PHG D에서 계산 중…' : '덕트망 없음'}</span>`}</div>`; })()
    + `<div class="card"><h4>덕트 종류<span class="from">PHG D 다시 계산</span></h4><label class="field">종류<select id="ductType">${[['main', '주 덕트'], ['branch', '분기'], ['sub_branch', '보조 분기']].map(([v, l]) => `<option value="${v}" ${v === d.type ? 'selected' : ''}>${l}${v === d.type ? ' · 지금' : ''}</option>`).join('')}</select></label><button class="btn" id="ductTypeApply" style="margin-top:8px;width:100%">적용 · 다시 계산</button><p class="muted" style="margin:6px 0 0">크기는 종류의 기준 풍속으로 다시 정해짐 (AUTO는 다시 돌리지 않음)</p></div>`
    + `<div class="card"><h4>덕트 크기<span class="from">PHG D 다시 계산</span></h4><label class="field">크기 (풍속)<select id="ductSize">${sizeOptions(d)}</select></label><button class="btn primary" id="ductSizeApply" style="margin-top:8px;width:100%">적용 · 다시 계산</button></div>`
    + `<div class="card"><h4>덕트망 · ${esc(deckName(dk.deckId))}<span class="from">PHG D</span></h4><div class="kv"><span>RU · 풍량</span><span>${res?.rus ?? '—'} · ${fmt(res?.flowCmh)} CMH</span><span>덕트 · 길이</span><span>${res?.ducts ?? '—'} · ${res?.lengthM ?? '—'} m</span><span>Deck 최대 손실</span><span>${res?.indexPa ?? '—'} Pa</span></div>
     <button class="btn" id="inspReroute" style="margin-top:10px;width:100%" ${res?.candidates === 1 ? 'disabled title="PHG D가 찾은 경로가 하나뿐 — RU·공조기를 옮기면 다른 경로가 나옵니다"' : ''}>다른 경로 (후보 ${(res?.pick ?? 0) + 1}/${res?.candidates ?? '?'})</button>
     <button class="btn" id="inspEditor" style="margin-top:6px;width:100%">PHG D 편집기에서 고치기</button><p class="muted" style="margin:6px 0 0">RU·공조기는 평면에서 끌어서 옮기고, 덕트의 크기·종류는 여기서 바꿉니다. 경로를 손으로 고칠 때는 편집기, "평면으로"로 돌아오면 반영됩니다.</p></div>`;
   $('inspEditor').onclick = () => act('PHG D 여는 중', openEditor);
   $('inspReroute').onclick = () => act('다른 경로 찾는 중', () => reroute(dk.key));
   const sz = $('ductSize'); $('ductSizeApply').onclick = () => act('덕트 크기 바꾸고 다시 계산', () => resizeDuct(dk.key, S.duct.i, sz.value === 'auto' ? null : JSON.parse(sz.value)));
   $('ductTypeApply').onclick = () => act('덕트 종류 바꾸고 다시 계산', () => setDuctType(dk.key, S.duct.i, $('ductType').value));
   return;
  }
  if (!r) {
   const rooms = C.rooms.filter(x => x.deckId === S.deck), sum = k => rooms.reduce((t, x) => t + (C.airflow[x.id][k] || 0), 0);
   $('inspTitle').textContent = 'Deck ' + deckName(S.deck);
   $('insp').innerHTML = `<div class="card"><h4>Deck 요약</h4><div class="kv"><span>격실</span><span>${rooms.length}</span><span>냉방 현열</span><span>${fmt(rooms.reduce((t, x) => t + C.loads[x.id].coolingSensibleW, 0))} W</span><span>급기(SA) 합계</span><span>${fmt(sum('supplyCmh'))} CMH</span><span>배기(EA) 합계</span><span>${fmt(sum('exhaustCmh'))} CMH</span><span>환기(RA) 합계</span><span>${fmt(sum('returnCmh'))} CMH</span></div></div>`
    + deckPlans().map(p => { const res = result(p.key), sys = a.systems.find(s => s.systemKey === p.systemKey), sd = sys?.decks.find(d => d.key === p.key);
     return `<div class="card${p.key === S.active ? ' active' : ''}${p.key === curKey() ? ' now' : ''}"><h4><span><span class="dot" style="background:${sysColor(p.systemId)}"></span>${KL[p.kind]} ${esc(p.systemId)}</span>${p.key === S.active ? '<span class="from">PHG D에 열림</span>' : ''}</h4><div class="kv"><span>설계 풍량</span><span>${fmt(p.designCmh)} CMH${p.decks > 1 ? ` <span class="muted">/ 팬 ${fmt(sys?.fanCmh)}</span>` : ''}</span><span>RU</span><span>${p.rus.length}개</span><span>${p.isUnitDeck ? (p.kind === 'supply' ? '공조기' : '팬') : '수직 덕트'}</span><span class="${p.isUnitDeck && p.rootSource.startsWith('assumed') ? 'warn' : ''}">${esc(rootText(p.rootSource))}</span>${p.decks > 1 ? `<span>공조기 Deck</span><span>${esc(deckName(p.unitDeckId))}</span>` : ''}${res?.at ? `<span>덕트</span><span>${res.ducts}개 · ${res.lengthM} m</span><span>Deck 최대 손실</span><span>${res.indexPa ?? '—'} Pa${sd?.damperPa ? ` + 방화댐퍼 ${sd.damperPa}` : ''}${sd && sd.riserPa ? ` + 수직 ${sd.riserPa}` : ''}</span><span>상태</span><span class="${res.stale ? 'warn' : 'ok'}">${res.stale ? '다시 보내기 필요' : res.auto ? 'AUTO 완료' : 'RU 배치'}</span>` : ''}</div></div>`; }).join('');
   return;
  }
  // fixed card order: 형상 → 부하 → 풍량 → 계통 → RU·덕트 → 방화; the card of the current step is marked
  const L = C.loads[r.id], A = C.airflow[r.id], cl = a.solas.classes[r.id], ship = a.solas.settings.ship, shp = SO.DATA.ships[ship];
  const rp = plans().filter(p => p.rus.some(u => u.roomId === r.id));
  const now = { room: 'geo', load: 'load', air: S.overlay === 'fire' ? 'fire' : 'air', duct: 'duct', review: S.tab === 'fire' ? 'fire' : 'duct' }[S.step], card = (id, title, from, body) => `<div class="card${id === now ? ' now' : ''}"><h4>${title}<span class="from">${from}</span></h4>${body}</div>`;
  const bnd = a.solas.boundaries.filter(b => b.roomA === r.id || b.roomB === r.id), worst = bnd.filter(b => b.grade).sort((x, y) => SO.rank(x.grade) - SO.rank(y.grade))[0];
  $('inspTitle').innerHTML = `${esc(r.no)} ${esc(r.name)}`;
  $('insp').innerHTML = card('geo', '형상', 'BOX', `<div class="kv"><span>면적</span><span>${r.areaM2.toFixed(1)} m²</span><span>체적</span><span>${r.volumeM3.toFixed(1)} m³</span><span>ISO 분류</span><span>${esc(isoName(r.isoClass))}</span></div>`)
   + card('load', '부하', 'BOX CAL', `<div class="big">${fmt(L.coolingSensibleW)} W</div><div class="muted">냉방 현열</div><div class="kv" style="margin-top:6px"><span>냉방 잠열</span><span>${fmt(L.coolingLatentW)} W</span><span>냉방 합계</span><span>${fmt(L.coolingW)} W</span><span>난방</span><span>${fmt(L.heatingW)} W</span><span>최소 신기(OA)</span><span>${fmt(L.minFreshAirCmh)} CMH</span><span>상태</span><span class="${L.complete ? 'ok' : 'warn'}">${esc(L.status || (L.complete ? '완료' : '미완료'))}</span></div>`)
   + card('air', '풍량', 'HVAC Grid', `<div class="kv"><span>급기(SA)</span><span><b>${fmt(A.supplyCmh)}</b> CMH</span><span>배기(EA)</span><span>${fmt(A.exhaustCmh)} CMH</span><span>환기(RA)</span><span>${fmt(A.returnCmh)} CMH</span>${A.transferInCmh ? `<span>전달 공기 받음</span><span>${fmt(A.transferInCmh)} CMH · ${A.transferFrom === 'own-inlet' ? '자체 흡입구' : A.transferFrom === 'outside' ? '이웃 급기 실 없음' : esc(roomName(A.transferFrom))}</span>` : ''}${A.transferOutCmh ? `<span>전달 공기 보냄</span><span>${fmt(A.transferOutCmh)} CMH</span>` : ''}${A.makeupCmh ? `<span>보충 급기</span><span>+${fmt(A.makeupCmh)} CMH</span>` : ''}</div>${A.transferInCmh && !/CO2|CO₂|소화제|배터리|축전지|BATTERY|페인트|PAINT/i.test(r.name || '') ? `<label class="field" style="margin-top:6px">전달 공기 출처<select id="xferSel"><option value="">자동 (${A.transferSet ? '—' : A.transferFrom === 'outside' ? '이웃 없음' : esc(roomName(A.transferFrom))})</option><option value="own-inlet" ${C.transfers?.[r.id] === 'own-inlet' ? 'selected' : ''}>자체 흡입구 (외기 그릴)</option>${C.rooms.filter(n => n !== r && n.deckId === r.deckId && GE.sharedLength(r, n) >= 300 && (a.solas.classes[n.id]?.space !== '계단격실' || C.transfers?.[r.id] === n.id)).map(n => `<option value="${esc(n.id)}" ${C.transfers?.[r.id] === n.id ? 'selected' : ''}>${esc(n.no)} ${esc(n.name)}</option>`).join('')}</select></label>` : ''}<div class="muted" style="margin-top:6px">급기 = 올림(max(냉방 현열 W × 안전율 ${K.marginOf(C).toFixed(2)} × 3 ÷ ΔT ${C.rules.supplyDeltaTK} K, 최소 신기))${A.basis ? ` — ${{ cooling: '냉방', freshAir: '최소 신기', makeup: '보충 급기' }[A.basis]} 기준` : ''}<br>배기 = 올림(환기 횟수 × 체적) · 환기 = 공조 구역 수지</div>${a.air.filter(x => x.roomId === r.id && x.level !== 'info').map(x => `<div class="${x.level === 'fail' ? 'err' : 'warn'}" style="margin-top:4px">${x.level === 'fail' ? '✕' : '●'} ${esc(x.text.split(': ').slice(1).join(': '))}</div>`).join('')}`)
   + card('sys', '계통', '', `<div class="kv">${PL.KINDS.map(k => `<span>${KL[k]}</span><span>${r.systems[k] ? `<span class="dot" style="background:${sysColor(r.systems[k])}"></span>${esc(r.systems[k])}` : '—'}</span>`).join('')}</div>`)
   + (rp.length ? card('duct', 'RU·덕트', 'PHG D', `<div class="kv">${rp.map(p => { const rus = p.rus.filter(u => u.roomId === r.id), res = result(p.key); return `<span>${KL[p.kind]} RU</span><span>${rus.length}개 · ${fmt(rus.reduce((t, u) => t + u.flowCmh, 0))} CMH${res?.at ? ` <span class="muted">· 계통 ${res.indexPa ?? '—'} Pa</span>` : ''}</span>`; }).join('')}</div>`) : '')
   + card('fire', '방화 (SOLAS)', shp.tB + '/' + shp.tD, `<div class="kv"><span>공간</span><span class="${cl?.cat ? '' : 'warn'}">${esc(cl?.space || '미분류')}</span><span>범주</span><span>${cl?.cat ? `(${cl.cat}) ${esc(SO.catName(ship, cl.cat))}` : '—'}</span><span>근거</span><span>${esc({ name: '실 이름', 'iso-class': 'BOX ISO 분류', user: '사용자 지정', unclassified: '—', 'no-category': '이 표에 범주 없음' }[cl?.source] || '')}</span><span>경계</span><span>${bnd.length}개${worst ? ` · 최대 ${esc(worst.grade)}` : ''}</span></div>${cl?.check ? `<div class="warn" style="margin-top:4px">● ${esc(cl.check)}</div>` : ''}
     <label class="field" style="margin-top:6px">공간 지정<select id="solasSel"><option value="">자동 분류</option>${spaceOptions(C.solas?.rooms?.[r.id]?.space || '')}</select></label>`);
  const ss = $('solasSel'); if (ss) ss.onchange = () => act(null, () => setSolasRoom(r.id, ss.value));
  const xs = $('xferSel'); if (xs) xs.onchange = () => act(null, () => setTransfer(r.id, xs.value));
 }
 function center() {
  const view = viewOf(S.step), noContract = !S.contract && (view === 'plan' || view === 'phg'), docked = S.step === 'review' && !!S.contract;
  $('boxFrame').style.visibility = view === 'box' ? 'visible' : 'hidden';
  if ($('staleBanner') && (S.step !== 'duct' || !S.contract)) show($('staleBanner'), false);
  // BOX's canvas is a background only in the plan (plan() decides); back in ① ② it is BOX again
  if (view !== 'plan') { $('boxFrame').classList.remove('backdrop'); if (box.loading) box.backdrop(false); }
  $('phgFrame').style.visibility = view === 'phg' && !noContract ? 'visible' : 'hidden';
  const layered = (view === 'plan' || view === 'box') && !!S.contract;
  show($('plan'), layered); show($('legend'), layered); show($('dock'), docked);
  show($('empty'), noContract);
  if (noContract) {
   $('empty').innerHTML = `<div><b>아직 설계 데이터가 없습니다</b>BOX의 격실·부하를 HVAC Grid 설계 데이터로 만들어야 풍량·계통과 덕트 단계를 쓸 수 있습니다.<br><button class="btn primary" id="emptyGo">② 부하에서 설계 데이터 만들기</button><button class="btn" id="emptySample">S5 예제 열기 (도면 + 설계 데이터)</button><button class="btn" id="emptyT3">T3 시험선 열기</button></div>`;
   $('emptyGo').onclick = () => go('load'); $('emptySample').onclick = () => act('S5 예제 여는 중', () => openSample('s5')); $('emptyT3').onclick = () => act('T3 시험선 여는 중', () => openSample('t3'));
  }
  // ⑤'s dock first: the plan measures the canvas above it
  if (docked) report();
  dockSize();
  if (layered) plan();
  if (view === 'box' && !boxWatching) watchBox();
  phgHint(view);
 }
 function status() {
  const C = S.contract, r = C?.rooms.find(x => x.id === S.room), ps = plans();
  const done = ps.filter(p => result(p.key)?.auto && !result(p.key).stale).length, n = k => C.systems.filter(s => s.kind === k).length;
  const [nextText, nextTo] = nextStep();
  // ②: what CAL holds - its panel is out of sight
  const calLine = S.step === 'load' && box.loading && box.hasDrawing() ? (!box.calSig ? '<span>CAL: 아직 계산 전 — ② 명령을 누르면 계산</span>' : box.calCurrent() ? `<span>CAL: 격실 <b>${box.calRooms || '—'}</b>개 계산됨</span>` : '<span class="warn">CAL: 도면이 바뀜 — 다음 CAL 명령 때 다시 계산</span>') : '';
  $('status').innerHTML = `<button class="next" id="nextBtn" title="다음에 할 일">다음: ${esc(nextText)}</button>` + calLine + (C && viewOf(S.step) === 'box' ? `<span>설계 데이터: Deck <b>${C.decks.length}</b> · 격실 <b>${C.rooms.length}</b> — ③부터 사용</span>` : C ? `<span>선박 전체: Deck <b>${C.decks.length}</b> · 격실 <b>${C.rooms.length}</b> · 계통 급기 <b>${n('supply')}</b> 배기 <b>${n('exhaust')}</b> 환기 <b>${n('return')}</b> · 급기 <b>${fmt(C.systems.filter(s => s.kind === 'supply').reduce((t, s) => t + s.designCmh, 0))}</b> CMH · 덕트망 <b>${done}</b>/${ps.length}</span><span>선택: <b>${esc(deckName(S.deck))}</b>${r ? ` · ${esc(r.no)} ${esc(r.name)}` : ''}</span>` : '<span>설계 데이터 없음 — ① 도면 → ② 부하 → 설계 데이터 만들기</span>')
   + (S.active ? `<span>PHG D: <b>${esc(keyText(S.active))}</b></span>` : '') + `<span class="msg${S.msgErr ? ' err' : ''}" role="status">${esc(S.msg)}</span>`;
  $('proj').textContent = C ? `${RP.PROJECT_NAME(C) || '설계 데이터'} · ${C.rooms.length}실` : '설계 데이터 없음';
  $('proj').title = S.file?.name ? `파일: ${S.file.name}${S.dirty ? ' (저장 안 한 변경 있음)' : ''}` : '아직 저장하지 않음';
  $('nextBtn').onclick = () => nextTo ? (nextTo === S.step && nextTo === 'review' ? (S.tab = 'checks', render()) : go(nextTo)) : act(null, () => saveProject());
  document.title = C ? `${RP.PROJECT_NAME(C) || '설계 데이터'}${S.dirty ? ' *' : ''} — HVAC Grid` : 'HVAC Grid';
 }
 // the layer panel (with the legend) opens and closes; it starts closed when the plan is narrow (it would cover rooms)
 let legendRoom = true;
 function legendOpen() { return S.legendOpen ?? (viewOf(S.step) !== 'box' && (legendRoom || (S.overlay === 'fire' && S.step === 'air') || S.step === 'review') && $('center').getBoundingClientRect().width > 1000); }
 function legendFold() {
  const lg = $('legend'), open = legendOpen();
  if (!open) lg.innerHTML = '<button class="lg-tog" title="층·범례 펼치기" aria-expanded="false">층 ▾</button>';
  else lg.insertAdjacentHTML('afterbegin', '<button class="lg-tog close" title="층·범례 접기" aria-expanded="true">×</button>');
  lg.classList.toggle('folded', !open); lg.querySelector('.lg-tog').onclick = () => { S.legendOpen = !open; render(); };
 }
 // ④ with a plan not in PHG D yet: what to do, over the empty canvas
 function phgHint(view) {
  const key = curKey(), on = S.step === 'duct' && !!S.contract && !!key && !busyNow() && !S.hintOff?.[key] && (S.phgEditor ? S.active !== key : !result(key)?.auto);
  const pl = on ? curPlan() : null;
  show($('phgHint'), !!pl); if (!pl) return;
  $('phgHint').innerHTML = `<div><b>${esc(deckName(pl.deckId))} · ${KL[pl.kind]} ${esc(pl.systemId)}는 아직 PHG D에 없습니다</b><p>격실 도면·공조기·RU(풍량)를 PHG D로 보내 AUTO로 덕트망을 만들고, 이 평면에 그립니다.</p>
   <button class="btn primary" data-a="auto">보내기 + AUTO</button><button class="btn" data-a="send">PHG D로 보내기만</button><button class="btn" data-a="all">모든 계통 AUTO</button><p class="phg-hint-off"><button class="linkbtn" data-a="off">닫고 PHG D에서 직접 그리기</button></p></div>`;
  $('phgHint').querySelectorAll('button').forEach(b => b.onclick = () => ({ auto: () => act('AUTO 계산 중', () => autoKey()), send: () => act('PHG D로 보내는 중', () => sendPlan()), all: () => act('AUTO 계산 중', () => runAll()), off: () => { S.hintOff = { ...(S.hintOff || {}), [key]: true }; show($('phgHint'), false); if (!S.phgEditor) act('PHG D 여는 중', openEditor); } })[b.dataset.a]());
 }
 const busyNow = () => !$('busy').hidden;
 // BOX's ISO 7547 room classes in words
 const ISO_NAME = { AC: '공조 격실', WHEELHOUSE: '조타실', ALLEY_SOUND: '방음 복도', ALLEY_NON_SOUND: '비방음 복도', ENGINE: '기관 공간', CONTROL: '기관제어실', BOILER: '보일러실', NON_AC: '비공조 공간' };
 const isoName = c => c ? (ISO_NAME[c] ? `${ISO_NAME[c]} (${c})` : c) : '—';
 // help (F1, ?)
 function help() { const d = $('help'); if (!d.open) d.showModal(); }
 // the folder button: open, recent projects, save, save as
 async function fileMenu() {
  const m = $('fileMenu'); if (!m.hidden) { show(m, false); return; }
  const recent = FS ? await recentFiles() : [], r = $('openProjectBtn').getBoundingClientRect();
  m.innerHTML = '<button data-a="open">열기…<kbd>Ctrl+O</kbd></button><button data-a="save" ' + (S.contract ? '' : 'disabled') + '>저장<kbd>Ctrl+S</kbd></button><button data-a="saveAs" ' + (S.contract ? '' : 'disabled') + '>다른 이름으로 저장…<kbd>Ctrl+Shift+S</kbd></button>'
   + (recent.length ? '<div class="menu-sep">최근 프로젝트</div>' + recent.map((x, i) => `<button data-a="recent" data-i="${i}" title="${esc(x.name)} · ${esc(U.localTime(x.at))}">${esc(x.name)}</button>`).join('') : '')
   + (FS ? '' : '<div class="menu-sep muted">이 브라우저는 다운로드로 저장합니다</div>');
  m.style.top = r.bottom + 4 + 'px'; m.style.right = innerWidth - r.right + 'px'; show(m, true);
  m.querySelectorAll('button').forEach(b => b.onclick = () => { show(m, false); const a = b.dataset.a;
   act(null, () => a === 'open' ? openProject() : a === 'save' ? saveProject() : a === 'saveAs' ? saveProject(true) : openProject(recent[+b.dataset.i].handle)); });
 }
 document.addEventListener('click', e => { if (!$('fileMenu').hidden && !$('fileMenu').contains(e.target)) show($('fileMenu'), false); });
 // what to do next, for the status bar
 function nextStep() {
  if (!S.contract) return ['② 부하에서 설계 데이터 만들기 (또는 ③에서 예제·T3 열기)', 'load'];
  if (!S.contract.systems.length) return ['② 격실 입력에서 실마다 계통(SUP·EXH·RET) 지정 → 설계 데이터 다시 만들기', 'load'];
  const a = analysis(), assumed = a.plans.filter(p => p.isUnitDeck && p.rootSource.startsWith('assumed')).length;
  if (assumed && a.done < a.total) return [`③ 공조기 위치 확인 (임시 ${assumed}개 계통)`, 'air'];
  if (a.done < a.total) return [`④ 모든 계통 AUTO (${a.done}/${a.total})`, 'duct'];
  if (a.count.fail) return [`⑤ 검토 실패 ${a.count.fail}건 확인`, 'review'];
  if (S.dirty) return ['프로젝트 저장 (Ctrl+S)', null];
  return ['⑤ 통합 XLSX·DXF·보고서 출력', 'review'];
 }
 // the layout first, so the plan measures the canvas it is drawn on
 function render() { const m = $('main'); m.classList.toggle('left-off', S.leftOff === true); m.classList.toggle('right-off', S.rightOff === true);
  // ① ② are BOX's own screens: the HVAC Grid tree and inspector (design data, from ③ on) step aside for the drawing;
  // ③ ④ ⑤ keep that full-width canvas, the tree and inspector float over its edges (⑤'s dock between them)
  m.classList.toggle('box-view', viewOf(S.step) === 'box'); m.classList.toggle('plan-view', viewOf(S.step) === 'plan');
  steps(); ribbon(); tree(); center(); inspector(); status(); }

 // ---------- wiring ----------
 $('steps').onclick = e => { const b = e.target.closest('.step'); if (b) go(b.dataset.step); };
 $('q').oninput = () => tree();
 $('leftToggle').onclick = () => { S.leftOff = !S.leftOff; render(); };
 $('rightToggle').onclick = () => { S.rightOff = !S.rightOff; render(); };
 $('undoBtn').onclick = () => act(null, () => { const f = frameOnScreen(); if (f) f.click('undoBtn'); else undoShell(); });
 $('redoBtn').onclick = () => act(null, () => { const f = frameOnScreen(); if (f) f.click('redoBtn'); else redoShell(); });
 $('resetBtn').onclick = () => act(null, newStart);
 $('openProjectBtn').onclick = e => { e.stopPropagation(); fileMenu(); };
 $('helpBtn').onclick = () => help();
 $('helpClose').onclick = () => $('help').close();
 $('kchgClose').onclick = () => $('kchg').close(); $('kchgCsv').onclick = () => act(null, kChangeCsv);
 $('saveProjectBtn').onclick = () => act(null, () => saveProject());
 $('themeBtn').onclick = () => { const d = document.documentElement, dark = d.dataset.theme !== 'dark'; d.dataset.theme = dark ? 'dark' : ''; B.themePopups(); box.theme(); try { localStorage.setItem('hvac-grid-theme', dark ? 'dark' : ''); } catch {} if (viewOf(S.step) === 'plan' && S.contract) plan(); };
 try { if (localStorage.getItem('hvac-grid-theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch {}
 // Alt+1..5 switch steps, also while the focus is inside a vendor frame; Ctrl+Z / Ctrl+Y undo HVAC Grid edits in ③ ⑤
 const onKey = e => {
  if (e.altKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); go(STEPS[+e.key - 1].id); return true; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && /^s$/i.test(e.key)) { e.preventDefault(); act(null, () => saveProject(e.shiftKey)); return true; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && /^o$/i.test(e.key)) { e.preventDefault(); act(null, () => openProject()); return true; }
  if (e.key === 'F1') { e.preventDefault(); help(); return true; }
  if (e.key === 'Escape' && S.pickRoot) { S.pickRoot = false; say(''); render(); return true; }
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && !typing && !frameOnScreen() && S.contract && /^[zy]$/i.test(e.key)) { e.preventDefault(); act(null, () => (e.key.toLowerCase() === 'y' || e.shiftKey) ? redoShell() : undoShell()); return true; }
  return false;
 };
 document.addEventListener('keydown', onKey); B.onFrameKey = e => (e.altKey && /^[1-5]$/.test(e.key)) || (e.key === 'Escape' && S.pickRoot) || ((e.ctrlKey || e.metaKey) && /^[so]$/i.test(e.key)) || ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key) && !frameOnScreen()) || e.key === 'F1' ? onKey(e) : false;
 window.addEventListener('resize', () => { if (viewOf(S.step) === 'plan' && S.contract) { dockSize(); plan(); } });
 window.HVACGrid = { S, box, phg, plans, analysis, project, result, go, parseJson, newStart: () => act(null, newStart), undo: () => act(null, undoShell), redo: () => act(null, redoShell), openEditor: () => act('PHG D 여는 중', openEditor), closeEditor: () => act(null, closeEditor), moveRu: (k, id, p) => act(S.dropAuto ? 'RU 옮기고 다시 AUTO' : null, () => moveRu(k, id, p)), setDuctType: (k, i, t) => act('덕트 종류 바꾸고 다시 계산', () => setDuctType(k, i, t)), resizeDuct: (k, i, sz) => act('덕트 크기 바꾸고 다시 계산', () => resizeDuct(k, i, sz)), reroute: k => act('다른 경로 찾는 중', () => reroute(k)), openSample, loadProject, setContract, extractContract, sendPlan, autoKey, readBack, projectJson, render, setSolasRoom, setUnitDeck, undoShell, redoShell, showPlace, OUT, LIB,
  runAll: (keys, opt) => act('AUTO 계산 중', () => runAll(keys, opt)) };   // with the busy overlay and error message, as from the ribbon
 render(); go('room');
})();
