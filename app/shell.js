// HVAC Grid shell: one workflow over BOX CAL (rooms, loads) and PHG D (RUs, ducts) - docs/UI_REVIEW.md, UI_DESIGN_REVIEW.md.
// ① 도면·격실 and ② 부하 show BOX, ④ RU·덕트 shows PHG D, ③ 풍량·계통 and ⑤ 검토·출력 are the shell's own views over the
// HVAC Grid project (lib/*.cjs: contract, plans per deck and system, vertical ducts, SOLAS, outputs). The vendor apps
// are driven through app/bridge.js and never modified.
'use strict';
(async () => {
 const B = window.HVACGridBridge, $ = id => document.getElementById(id);
 const show = (el, on) => el.toggleAttribute('hidden', !on);   // works for the SVG plan too (no .hidden property on SVG elements)
 const LIB = await B.loadLibs('../lib/', ['util.cjs', 'geom.cjs', 'solas-data.json', 'solas.cjs', 'contract.cjs', 'phg-plan.cjs', 'ducts.cjs', 'risers.cjs', 'project.cjs', 'xlsx.cjs', 'plan-svg.cjs', 'dxf-out.cjs', 'report.cjs']);
 const K = LIB.contract, PL = LIB['phg-plan'], PJ = LIB.project, SO = LIB.solas, XL = LIB.xlsx, DX = LIB['dxf-out'], RP = LIB.report, SVG = LIB['plan-svg'], U = LIB.util, GE = LIB.geom;
 const esc = U.esc, fmt = v => v == null || v === '' || Number.isNaN(+v) ? '—' : Math.round(v).toLocaleString();
 const box = new B.Box($('boxFrame')), phg = new B.Phg($('phgFrame'));
 const S = { step: 'room', contract: null, deck: null, room: null, kind: 'supply', sys: null, filter: 'all', overlay: 'air', tab: 'nets', gradeFilter: null, focus: null, projects: {}, results: {}, geometry: {}, active: null,
  pickRoot: false, msg: '', msgErr: false, phgDocked: false, undo: [], redo: [] };
 let plansCache = null, analysisCache = null;
 const invalidate = () => { plansCache = null; analysisCache = null; };
 const plans = () => plansCache || (plansCache = S.contract ? PL.plan(S.contract) : []);
 const project = () => PJ.make({ contract: S.contract, projects: S.projects, results: S.results, geometry: S.geometry });
 const analysis = () => analysisCache || (analysisCache = S.contract ? PJ.analyze(project(), plans()) : null);
 // a result is current only while its plan is what it was made from (no signature = an old file = stale)
 const result = key => { const r = S.results[key]; if (!r) return null; const p = plans().find(x => x.key === key); return { ...r, stale: !p || !r.sig || r.sig !== PJ.planSig(p) }; };
 const keyOf = (deck, sys) => `${deck}__${sys}`;
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
 function say(text, err = false) { S.msg = text; S.msgErr = err; status(); }
 function busy(text) { show($('busy'), !!text); $('busyText').textContent = text || ''; }
 async function act(label, fn) {
  try { if (label) busy(label); await fn(); } catch (e) { console.error(e); say(e.message || String(e), true); } finally { busy(null); render(); }
 }
 function pickFile(accept) {
  return new Promise(resolve => { const input = $('pick'); input.value = ''; input.accept = accept || ''; input.onchange = () => input.files[0] && resolve(input.files[0]); input.click(); });
 }
 function download(name, data, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
 }
 const stamp = () => U.localStamp();
 // work that would be lost (PHG D results) - ask first
 const keepsWork = what => !Object.keys(S.results).length || confirm(`${what}: 지금 PHG D 결과 ${Object.keys(S.results).length}개와 실행 취소 기록이 사라집니다. 계속할까요?\n(필요하면 먼저 프로젝트 저장)`);

 // ---------- contract edits (undo / redo in the shell's own views) ----------
 function edit(label, fn) {
  const before = JSON.stringify(S.contract); fn(); invalidate();
  S.undo.push({ label, contract: before }); if (S.undo.length > 60) S.undo.shift(); S.redo = [];
 }
 function stepHistory(from, to, verb) {
  const u = from.pop(); if (!u) { say(verb + '할 HVAC Grid 편집이 없습니다'); return; }
  to.push({ label: u.label, contract: JSON.stringify(S.contract) }); S.contract = JSON.parse(u.contract); invalidate(); pickSystem();
  say(`${verb}: ${u.label}`);
 }
 const undoShell = () => stepHistory(S.undo, S.redo, '실행 취소'), redoShell = () => stepHistory(S.redo, S.undo, '다시 실행');

 // ---------- contract ----------
 function setContract(c, { keepWork = false } = {}) {
  const problems = K.validate(c); if (problems.length) throw new Error('계약 검사 실패: ' + problems.slice(0, 3).join(', '));
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
  // made again after a change in BOX: the user's settings stay, and so do the PHG D results - only the plans that changed
  // become "다시 보내기 필요" (their signatures no longer match), results of plans that are gone are dropped
  const old = S.contract, next = K.buildContract(raw, old?.rules || {});
  for (const k of ['roots', 'unitDecks', 'solas']) if (old?.[k]) next[k] = old[k];
  setContract(next, { keepWork: true });
  const keys = new Set(plans().map(p => p.key)), gone = Object.keys(S.results).filter(k => !keys.has(k));
  for (const k of gone) { delete S.results[k]; delete S.projects[k]; delete S.geometry[k]; } if (gone.includes(S.active)) S.active = null;
  const sup = S.contract.systems.filter(s => s.kind === 'supply'), stale = Object.keys(S.results).filter(k => result(k)?.stale).length;
  say(`계약 만듦: Deck ${S.contract.decks.length} · 격실 ${S.contract.rooms.length} · 계통 ${S.contract.systems.length} (급기 ${sup.length}) · 급기 ${fmt(sup.reduce((t, s) => t + s.designCmh, 0))} CMH${Object.keys(S.results).length ? ` · PHG D 결과 유지, 다시 보내기 ${stale}` : ''}`);
  S.step = 'air';
 }
 async function openSample(name = 's5') {
  if (!keepsWork('예제 계약 열기')) return;
  setContract(await (await fetch(`../samples/${name}.contract.json`, { cache: 'no-store' })).json());
  say(name === 't3' ? 'T3 시험선 계약을 열었습니다 (4 Deck · 다층 계통)' : '예제 계약(S5)을 열었습니다'); if (S.step === 'room' || S.step === 'load') S.step = 'air';
 }
 function applyDeltaT() {
  const v = +$('dT').value; if (!(v >= 3 && v <= 25)) throw new Error('급기 ΔT는 3–25 K');
  const pp = +$('pPct').value, pb = $('pBasis').value; if (!(pp >= 0 && pp <= 30)) throw new Error('가압은 0–30 %');
  edit(`급기 ΔT ${v} K · 가압 ${pp} %`, () => { S.contract = K.applyRules(S.contract, { supplyDeltaTK: v, pressurizationPct: pp, pressurizationBasis: pb }); });
  say(`급기 ΔT ${v} K · 가압 ${pb === 'supply' ? '급기' : '배기'}의 ${pp} % 적용: 급기 합계 ${fmt(S.contract.systems.filter(s => s.kind === 'supply').reduce((t, s) => t + s.designCmh, 0))} CMH`);
 }
 function setRoot(p) {
  const key = curKey(), pl = curPlan(); if (!key) return;
  // a unit or a shaft stands in a room of its deck
  const q = { x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 }, room = S.contract.rooms.find(r => r.deckId === S.deck && GE.inRoom(q, r));
  if (!room) { say('실 밖입니다 — 공조기·수직 덕트 위치는 실 안을 클릭하세요', true); return; }
  edit(`${S.sys} ${pl?.isUnitDeck ? '공조기' : '수직 덕트'} 위치`, () => { S.contract.roots = { ...(S.contract.roots || {}), [key]: { x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 } }; });
  S.pickRoot = false; say(`${S.sys} ${pl?.isUnitDeck ? '공조기' : '수직 덕트'} 위치 지정 (${deckName(S.deck)})`);
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
  if (!S.phgDocked) { S.phgDocked = true; if (phg.dockShown('right')) phg.click('phgb-right-panel'); if (innerWidth < 1440 && phg.dockShown('left')) phg.click('phgb-left-panel'); }
 }
 // the window narrowed below 1440 px with PHG D open: its left dock closes (the shell's tree is already on the left)
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
  await phg.loadPlan(pl);
  S.results[key] = {}; store(key);
  say(`${deckName(pl.deckId)} · ${KL[pl.kind]} ${pl.systemId}: RU ${pl.rus.length}개 · ${fmt(pl.designCmh)} CMH를 PHG D로 보냄`);
 }
 async function autoKey(key = curKey()) {
  const r0 = result(key); if (S.active !== key || !r0 || r0.stale) await sendPlan(key);
  const r = await phg.auto(); store(key, { auto: true, seconds: r.seconds, candidate: r.candidate, unconnected: r.unconnected, zonesRelaxed: r.zonesRelaxed, edited: false });
  say(`${key.replace('__', ' · ')}: 덕트 ${r.ducts}개 · ${r.lengthM} m · 최대 ${r.indexPa ?? '—'} Pa · ${r.seconds} s${r.zonesRelaxed ? ({ all: ' · 금지 영역과 선체 밖 영역을 모두 해제해야 경로가 나옴 — 경로 검토', rooms: ' · 제한 구역을 지키는 경로가 없어 해제(선체 밖은 유지) — 경로 검토', outside: ' · 선체 밖 금지 영역을 풀어야 모든 RU에 닿음(제한 구역은 유지) — 실 밖 덕트 검토' }[r.zonesRelaxed] || '') : ''}`, !!r.zonesRelaxed);
 }
 async function runAll(keys = plans().map(p => p.key), { onlyNeeded = false } = {}) {
  const todo = onlyNeeded ? keys.filter(k => { const r = result(k); return !r?.auto || r.stale; }) : keys;
  for (const [i, key] of todo.entries()) { busy(`${i + 1}/${todo.length} · ${key.replace('__', ' · ')} AUTO`); await autoKey(key); }
  const done = keys.filter(k => result(k)?.auto && !result(k).stale).length; say(`AUTO 완료: ${done}/${keys.length} (이번에 ${todo.length}개)`);
 }
 function readBack() { if (!S.active) throw new Error('PHG D에 열린 계통이 없습니다'); store(S.active, { edited: true }, { keepSig: true }); say('PHG D 결과를 읽었습니다'); }
 // leaving ④ with edits made in PHG D: read them back so ⑤ and the outputs show what is on screen
 function readBackIfEdited() { if (S.active && phg.loading && S.projects[S.active] && phg.changedSince(S.projects[S.active])) { readBack(); say(`${S.active.replace('__', ' · ')}: PHG D에서 고친 내용을 읽었습니다`); } }

 // ---------- project file and outputs ----------
 function projectJson() { keepActive(); return JSON.stringify(project()); }
 async function openProject() {
  if (!keepsWork('프로젝트 열기')) return;
  const f = await pickFile('.json'), { project: pr, notes } = PJ.read(JSON.parse(await f.text()));
  setContract(pr.contract); Object.assign(S, { projects: pr.projects, results: pr.results, geometry: pr.geometry, active: null });
  if (S.step === 'room' || S.step === 'load') S.step = 'air';
  say(f.name + ' 열기' + (notes.length ? ' · ' + notes.join(' · ') : ''));
 }
 const outName = ext => `hvac-grid-${U.safeName(RP.PROJECT_NAME(S.contract) || 'project').slice(0, 30)}-${stamp()}.${ext}`;
 const OUT = {
  project: () => download(outName('json'), projectJson()),
  xlsx: () => { keepActive(); download(outName('xlsx'), XL.xlsx(RP.sheets(project(), analysis())), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); say('통합 XLSX (격실·계통·덕트망·수직 덕트·방화·관통·물량·검토)'); },
  dxf: () => { const a = analysis(); download(outName('dxf'), DX.integratedDxf(S.contract, { plans: a.plans, geometry: S.geometry, boundaries: a.solas.boundaries, penetrations: a.solas.penetrations, risers: a.risers }), 'application/dxf'); say('통합 DXF (Deck별 격실·RU·덕트·공조기·수직 덕트·방화 경계·관통)'); },
  report: () => { keepActive(); download(outName('html'), RP.html(project(), analysis()), 'text/html'); say('보고서 (HTML, 인쇄용)'); },
  csv: () => { const sh = RP.sheets(project(), analysis()).find(s => s.name === 'Deck 덕트망'); download(outName('csv'), '﻿' + [sh.head, ...sh.rows].map(r => r.map(U.csvCell).join(',')).join('\r\n'), 'text/csv'); },
  contract: () => download(`hvac-grid-contract-${stamp()}.json`, JSON.stringify(S.contract, null, 1)) };

 // ---------- commands ----------
 // labels are Korean; the old BOX / PHG D codes stay in the tooltip ("이전 단축") so existing users still find them
 const c = (ic, label, run, more = {}) => ({ icon: ic, label, run, ...more });
 const boxCmd = id => () => act(null, async () => { await box.load(); box.click(id); });
 const boxCal = code => () => act(/^현재 격실/.test(box.loading ? box.calStatus() : '') ? null : 'BOX CAL 여는 중', async () => { await box.load(); await box.cal(code); });
 const boxFile = (id, accept) => () => act(null, async () => { const f = await pickFile(accept); await box.load(); box.setFile(id, f); say(f.name + ' → BOX'); });
 const phgCmd = id => () => act(null, async () => { await loadPhg(); phg.click(id); });
 const phgText = t => () => act(null, async () => { await loadPhg(); phg.clickMenu(t); });
 const needContract = () => !S.contract;
 const field = html => ({ field: html });
 const seg = (name, value, options, onchange) => ({ field: `<div class="seg" role="radiogroup" aria-label="${esc(name)}" data-seg="${esc(name)}">${options.map(([v, l, n]) => `<button role="radio" data-v="${esc(v)}" aria-checked="${v === value}" ${n === 0 ? 'disabled' : ''}>${esc(l)}${n != null ? ` <small>${n}</small>` : ''}</button>`).join('')}</div>`, seg: onchange, segName: name });
 const kindSeg = () => seg('계통 종류', S.kind, PL.KINDS.map(k => [k, KL[k], deckPlans(k).length]), v => { S.kind = v; S.sys = null; pickSystem(); S.pickRoot = false; });
 const SAMPLES = [c('sample', 'S5 예제 계약', () => act('예제 계약 여는 중', () => openSample('s5')), { title: 'BOX 내장 S5 예제 (5 Deck · 94실)' }), c('deck', 'T3 시험선', () => act('T3 시험선 여는 중', () => openSample('t3')), { title: '4 Deck 화물선 거주구 · 다층 급기·배기·환기 · 케이싱·조리실 (samples/t3)' })];
 const STEPS = [
  { id: 'room', name: '도면·격실', view: 'box', groups: () => [
   ['파일', [c('open', 'DXF 열기', boxFile('dxfFile', '.dxf'), { code: 'DXF' }), c('bg', '배경', boxFile('backgroundFile', ''), { code: 'BG' }), c('json', 'JSON 열기', boxFile('jsonFile', '.json'), { code: 'J↓', title: 'BOX 프로젝트 (samples/t3/T3.box.json 시험선 포함)' }), c('save', 'JSON 저장', boxCmd('saveBtn'), { code: 'S' }), c('dxfOut', 'DXF 출력', boxCmd('exportBtn'), { code: 'D↑' })]],
   ['보기', [c('fit', '전체 보기', boxCmd('fitBtn'), { code: '⌕' }), c('reset', '초기화', boxCmd('newBtn'), { code: '⟲' })]],
   ['격실', [c('ol', '하부 외곽선', boxCmd('outlineBtn'), { code: '하부 OL' }), c('olu', '상부 외곽선', boxCmd('outlineUpperBtn'), { code: '상부 OL' }), c('olv', '외곽선 검증', boxCmd('outlineVerifyBtn'), { code: 'OL 검증' }), c('vl', '가상선', boxCmd('hullLinkBtn'), { code: 'VL' }), c('area', '면적', boxCmd('measureBtn'), { code: 'AR' }), c('apoly', '면적 POLY', boxCmd('areaPolygonBtn'), { code: 'AP' }),
    c('roomNo', '실 번호', boxCmd('autoRoomNoBtn'), { code: 'RN' }), c('roomFix', '실 지정', boxCmd('manualRoomBtn'), { code: 'RM' }), c('list', '격실 목록', boxCmd('roomBtn'), { code: 'RL' }), c('face', '접한 면적', boxCmd('contactBtn'), { code: 'A6' })]],
   ['검사', [c('lines', '선 검사', boxCmd('lineCheckBtn'), { code: 'CK' }), c('geo', '도형 검사', boxCmd('l4GeometryCheckBtn'), { code: 'GX' }), c('cube', '3D 검사', boxCmd('l4MeshCheckBtn')), c('water', '흘수선', boxCmd('waterlineBtn'))]],
   ['예제', [c('sample', 'S5 예제', boxCmd('s5ExampleBtn'), { code: 'S5', title: '5 Deck · 94 공간 · 12 × 8 m' }), c('sample', 'H5 예제', boxCmd('h5ExampleBtn'), { code: 'H5', title: 'KCS 실선 치수 예제' }),
    c('deck', 'T3 시험선', () => act('T3 시험선 여는 중', async () => { const t = await (await fetch('../samples/t3/T3.box.json', { cache: 'no-store' })).text(); await box.load(); box.setFile('jsonFile', new File([t], 'T3.box.json', { type: 'application/json' })); say('T3 시험선 → BOX (4 Deck · 73실)'); }), { title: 'HVAC Grid 시험선 BOX 프로젝트 (samples/t3/T3.box.json)' })]]] },
  { id: 'load', name: '부하', view: 'box', groups: () => [
   ['계산', [c('cal', 'CAL 열기', () => act('BOX CAL 여는 중', async () => { await box.load(); await box.openCal(); }), { code: 'CAL', title: '설계 조건·K값·냉난방 부하·OA·AHU' })]],
   ['조건', [c('cond', '설계 조건', boxCal('DC'), { code: 'DC' }), c('bound', '경계 조건', boxCal('BC'), { code: 'BC' })]],
   ['K값', [c('kIso', 'ISO 기준', boxCal('KD'), { code: 'KD' }), c('kApply', 'ISO 적용', boxCal('K7'), { code: 'K7' }), c('kLayer', '구조 계산', boxCal('KC'), { code: 'KC' }), c('check', '구조 적용', boxCal('C✓'), { code: 'C✓' }), c('kUser', '사용자', boxCal('KU'), { code: 'KU' })]],
   ['부하', [c('load', '격실 부하', boxCal('LR'), { code: 'LR' }), c('oa', '신기 (OA)', boxCal('OA'), { code: 'OA' }), c('rh', '리히터', boxCal('RH'), { code: 'RH' })]],
   ['내보내기', [c('xlsxIso', 'ISO 시트', boxCal('I↑'), { code: 'I↑' }), c('xlsx', '미적용 시트', boxCal('N↑'), { code: 'N↑' }), c('sum', 'SUP 요약', boxCal('Σ↑'), { code: 'Σ↑' }), c('xlsxAll', '전체 XLSX', boxCal('LX'), { code: 'LX' }), c('sheet', '격실 시트', boxCal('R↑'), { code: 'R↑' }), c('face', '면적 시트', boxCal('A↑'), { code: 'A↑' })]],
   ['HVAC Grid', [c('contract', '계약 만들기', () => act('BOX 격실·부하 읽는 중', extractContract), { primary: true, title: 'BOX 격실·부하 → 격실 풍량·계통 (③ 풍량·계통으로 이동)' })]]] },
  { id: 'air', name: '풍량·계통', view: 'plan', groups: () => [
   ['풍량 규칙', [field(`<label class="field">급기 ΔT (K)<input id="dT" type="number" min="3" max="25" step="1" value="${S.contract?.rules.supplyDeltaTK ?? 10}"></label>`), field(`<label class="field" title="공조 구역 신기 ≥ 배기 + 가압">가압 (%)<input id="pPct" type="number" min="0" max="30" step="1" value="${S.contract?.rules.pressurizationPct ?? 5}" style="width:4em"></label>`), field(`<label class="field">가압 기준<select id="pBasis"><option value="exhaust" ${S.contract?.rules.pressurizationBasis !== 'supply' ? 'selected' : ''}>배기 대비</option><option value="supply" ${S.contract?.rules.pressurizationBasis === 'supply' ? 'selected' : ''}>급기 대비</option></select></label>`), c('rule', '적용', () => act(null, applyDeltaT), { disabled: needContract, title: '급기(SA) 풍량 = 올림(냉방 현열 W × 3 ÷ ΔT)' })]],
   ['계통', [kindSeg(), sysField(false)]],
   ['공조기 · 수직 덕트', [c('pin', '위치 지정', () => { S.pickRoot = !S.pickRoot; say(S.pickRoot ? `평면에서 ${curPlan()?.isUnitDeck === false ? '수직 덕트(샤프트)' : '공조기'} 위치를 클릭하세요 (Esc 취소)` : ''); render(); }, { disabled: () => !curKey(), pressed: () => S.pickRoot, title: '공조기 Deck: 공조기·팬 위치 · 다른 Deck: 수직 덕트(샤프트) 위치' }), c('unpin', '지정 해제', () => act(null, clearRoot), { disabled: () => !S.contract?.roots?.[curKey()] }), unitDeckField()]],
   ['보기', [seg('평면 보기', S.overlay, [['air', '풍량'], ['fire', '방화']], v => { S.overlay = v; })]],
   ['계약', [...SAMPLES, c('open', '열기', () => act(null, openProject), { title: 'HVAC Grid 프로젝트 또는 계약 JSON' }), c('save', '계약 저장', OUT.contract, { disabled: needContract })]]] },
  { id: 'duct', name: 'RU·덕트', view: 'phg', groups: () => [
   ['HVAC Grid', [sysField(true), c('send', 'PHG D로 보내기', () => act('PHG D로 보내는 중', () => sendPlan()), { primary: true, disabled: () => !curKey(), title: 'Deck 격실 도면 + 공조기·수직 덕트 + 격실별 RU(풍량)' }), c('auto', '보내기 + AUTO', () => act('AUTO 계산 중', () => autoKey()), { disabled: () => !curKey(), title: 'AUTO → 첫 후보 → 덕트 지정 → 계산 → 압력' }), c('refresh', '결과 읽기', () => act(null, readBack), { disabled: () => !S.active, title: 'PHG D에서 고친 결과를 HVAC Grid로' })]],
   ['계통', [c('root', '공조기', phgCmd('rootBtn'), { code: 'R', title: 'Root · 계통 시작점(공조기) 배치' }), c('ru', 'RU 배치', phgCmd('diffuserBtn'), { code: 'RU' }), c('ruAuto', 'RU 자동', phgCmd('autoDiffuserBtn')), c('flow', '풍량 초안', phgCmd('phgdFlowBtn'))]],
   ['자동 라우팅', [c('zone', '금지 영역', phgText('금지 영역')), c('auto', 'AUTO', phgCmd('autoRouteOpenBtn'), { title: 'AUTO · 편집 가능한 경로 객체 생성 · 덕트 지정으로 덕트화' }), c('cmp', '비교', phgCmd('phgdCompareBtn')), c('set', '설정', phgCmd('phgdAutoSettingsBtn'))]],
   ['덕트', [c('ml', '주 덕트', phgCmd('assignMainLineBtn'), { code: 'ML' }), c('br', '분기', phgCmd('assignBranchBtn'), { code: 'BR' }), c('sbr', '보조 분기', phgCmd('assignSubBranchBtn'), { code: 'SBR' }), c('ad', '덕트 지정', phgCmd('makeDuctBtn'), { code: 'AD' })]],
   ['계산', [c('lines', '선 검사', phgCmd('lineCheckBtn')), c('calc', '계산', phgCmd('calculateBtn'), { title: '풍량과 덕트 크기' }), c('noise', '소음', phgCmd('noiseCalcBtn')), c('press', '압력', phgCmd('pressureCalcBtn'))]],
   ['파일', [c('save', 'JSON 저장', phgCmd('saveJsonBtn')), c('dxfOut', 'DXF 출력', phgCmd('exportDxfBtn')), c('xlsx', 'XLSX', phgCmd('exportXlsxBtn')), c('fit', '전체 보기', phgCmd('zoomAllBtn'))]],
   ['패널', [c('dockL', '왼쪽', () => act(null, async () => { await loadPhg(); phg.click('phgb-left-panel'); }), { pressed: () => phg.loading && S.phgDocked && phg.dockShown('left'), title: 'PHG D 도구·레이어 패널' }), c('dockR', '오른쪽', () => act(null, async () => { await loadPhg(); phg.click('phgb-right-panel'); }), { pressed: () => phg.loading && S.phgDocked && phg.dockShown('right'), title: 'PHG D 프로젝트 상태·검증 패널' })]]] },
  { id: 'review', name: '검토·출력', view: 'report', groups: () => [
   ['덕트망', [c('all', '모든 계통 AUTO', () => act('AUTO 계산 중', () => runAll()), { primary: true, disabled: needContract, title: '모든 Deck·계통(급기·배기·환기)을 차례로 PHG D로 보내고 AUTO' }), c('refresh', '남은 것만', () => act('AUTO 계산 중', () => runAll(undefined, { onlyNeeded: true })), { disabled: needContract, title: 'AUTO가 없거나 다시 보내야 하는 계통만' })]],
   ['방화 (SOLAS)', [field(`<label class="field">선종<select id="shipSel" ${S.contract ? '' : 'disabled'}>${Object.values(SO.DATA.ships).map(s => `<option value="${s.key}" ${s.key === (S.contract?.solas?.ship || SO.DEFAULT_SETTINGS.ship) ? 'selected' : ''}>${esc(s.label)} · ${s.tB}/${s.tD}</option>`).join('')}</select></label>`),
    field(`<label class="field">방화방식<select id="methodSel" ${S.contract && (S.contract.solas?.ship || 'CARG') === 'CARG' ? '' : 'disabled'}>${['IC', 'IIC', 'IIIC'].map(m => `<option ${m === (S.contract?.solas?.method || 'IC') ? 'selected' : ''}>${m}</option>`).join('')}</select></label>`),
    field(`<label class="field">최하층 아래<select id="belowSel" ${S.contract ? '' : 'disabled'}><option value="">미지정 (확인 필요)</option>${spaceOptions(S.contract?.solas?.lowestBelow || '', ['기관실 — A류', '보일러실', '화물창', '기타'])}</select></label>`),
    field(`<label class="field">스프링클러<select id="sprinklerSel" ${S.contract && S.contract.solas?.ship === 'P36M' ? '' : 'disabled'} title="여객선 36명 이하 Table 9.3/9.4: 양쪽 실 모두 스프링클러 설치이면 작은 값"><option value="">없음·한쪽</option><option value="1" ${S.contract?.solas?.sprinkler ? 'selected' : ''}>양쪽 설치</option></select></label>`)]],
   ['출력', [c('save', '프로젝트 저장', OUT.project, { disabled: needContract, title: '한 파일: 계약 + 모든 PHG D 덕트망 + 결과 (hvac-grid-project/1)' }), c('xlsx', '통합 XLSX', () => act(null, OUT.xlsx), { disabled: needContract }), c('dxfOut', '통합 DXF', () => act(null, OUT.dxf), { disabled: needContract }), c('report', '보고서', () => act(null, OUT.report), { disabled: needContract, title: 'HTML 보고서 (Deck 평면·계통·수직 덕트·방화·관통·물량)' }), c('csv', '요약 CSV', OUT.csv, { disabled: needContract }), c('contract', '계약 저장', OUT.contract, { disabled: needContract })]]] }];
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
 const groups = items => { const m = new Map(); for (const [lv, area, text] of items) { const k = lv + '|' + area; if (!m.has(k)) m.set(k, [lv, area, []]); m.get(k)[2].push(text); } return [...m.values()]; };
 const stepOf = id => STEPS.find(s => s.id === id);
 async function go(id) {
  if (S.step === 'duct' && id !== 'duct') readBackIfEdited();
  S.step = id; S.pickRoot = false; render();
  const view = stepOf(id).view;
  if (view === 'box') await act(box.loading ? null : 'BOX CAL 여는 중', () => box.load());
  if (view === 'phg') await act(phg.loading ? null : 'PHG D 여는 중', async () => { await loadPhg(); const key = curKey(); if (key && S.projects[key] && S.active !== key) await openKey(key); });
 }
 // undo / redo go to the app on screen (each keeps its own history); in ③ and ⑤ to the HVAC Grid edits
 const frameOnScreen = () => ({ box: box.loading && box, phg: phg.loading && phg }[stepOf(S.step).view] || null);

 // ---------- render ----------
 // tab badges: ✓ done, ● n warnings, ↻ n results to redo after a change upstream
 function stepBadge(id) {
  const C = S.contract; if (!C) return '';
  const ps = plans(), stale = ps.filter(p => result(p.key)?.stale).length, auto = ps.filter(p => result(p.key)?.auto && !result(p.key).stale).length;
  const pending = C.rooms.filter(r => !C.loads[r.id].complete).length, assumed = ps.filter(p => p.isUnitDeck && p.rootSource.startsWith('assumed')).length;
  const b = (cls, text, tip) => `<span class="badge ${cls}" title="${esc(tip)}">${text}</span>`;
  if (id === 'room') return b('done', '✓', 'BOX 격실을 계약으로 만들었습니다');
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
 function ribbonMore() { const el = $('ribbon'), l = el.querySelector('.rb-more.left'), r = el.querySelector('.rb-more.right'); if (!l || !r) return; l.hidden = el.scrollLeft <= 2; r.hidden = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2; }
 function ribbon() {
  const groups = stepOf(S.step).groups(); let n = 0; const runs = [], segs = {};
  $('ribbon').innerHTML = groups.map(([cap, items]) => `<div class="grp"><div class="btns">${items.map(it => {
   if (it.field) { if (it.seg) segs[it.segName] = it.seg; return it.field; }
   runs.push(it); const dis = typeof it.disabled === 'function' ? it.disabled() : it.disabled, pr = it.pressed?.();
   const tip = [it.title ? `${it.label} · ${it.title}` : it.label, it.code && `이전 단축: ${it.code}`].filter(Boolean).join('\n');
   return `<button class="cmd${it.primary ? ' primary' : ''}" data-i="${n++}" title="${esc(tip)}" ${dis ? 'disabled' : ''} ${pr != null ? `aria-pressed="${!!pr}"` : ''}>${icon(it.icon)}<span>${esc(it.label)}</span></button>`;
  }).join('')}</div><div class="cap">${esc(cap)}</div></div>`).join('');
  $('ribbon').insertAdjacentHTML('afterbegin', '<button class="rb-more left" aria-label="리본 왼쪽" hidden>‹</button>'); $('ribbon').insertAdjacentHTML('beforeend', '<button class="rb-more right" aria-label="리본 더 보기" hidden>›</button>');
  $('ribbon').querySelectorAll('.rb-more').forEach(b => b.onclick = () => $('ribbon').scrollBy({ left: (b.classList.contains('left') ? -1 : 1) * $('ribbon').clientWidth * 0.6, behavior: 'smooth' }));
  ribbonMore();
  $('ribbon').querySelectorAll('.cmd').forEach(b => b.onclick = () => runs[+b.dataset.i].run());
  $('ribbon').querySelectorAll('.seg').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { segs[g.dataset.seg](b.dataset.v); render(); }));
  const sel = $('sysSel'); if (sel) sel.onchange = () => { S.sys = sel.value; const p = curPlan(); if (p) S.kind = p.kind; S.pickRoot = false; if (S.step === 'duct') act(null, async () => { const k = curKey(); if (S.projects[k]) await openKey(k); }); else render(); };
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
   $('tree').innerHTML = `<div class="hint">② 부하 단계에서 <b>계약 만들기</b>를 누르면 BOX의 Deck·격실이 여기에 나타납니다.<br><button class="btn" id="treeSample">예제 계약 열기 (S5)</button><button class="btn" id="treeT3">T3 시험선 열기</button></div>`;
   $('treeSample').onclick = () => act('예제 계약 여는 중', () => openSample('s5')); $('treeT3').onclick = () => act('T3 시험선 여는 중', () => openSample('t3')); return;
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
    return `<button class="room" data-room="${esc(r.id)}" aria-selected="${r.id === S.room}" title="${esc(r.no)} ${esc(r.name)}${r.isoClass ? ' · ISO 분류 ' + esc(r.isoClass) : ''} · SOLAS ${esc(cls[r.id]?.space || '미분류')}"><span class="no">${esc(r.no)}</span><span class="nm">${dots ? `<span class="dot" style="background:${sid ? sysColor(sid) : 'transparent'};${sid ? '' : 'border:1px solid var(--line)'}"></span>` : ''}${esc(r.name)}</span><span class="cmh">${value(r, C)}</span></button>`; }).join('') : ''}</div>`;
  }).join('');
  $('treeCount').textContent = count + '실';
  $('tree').querySelectorAll('.deckh').forEach(e => e.onclick = () => { S.deck = e.dataset.deck; S.room = null; pickSystem(); render(); if (S.step === 'duct') act(null, async () => { const k = curKey(); if (k && S.projects[k]) await openKey(k); }); });
  $('tree').querySelectorAll('.room').forEach(e => e.onclick = () => selectRoom(e.dataset.room));
 }
 function selectRoom(id) {
  const r = S.contract.rooms.find(x => x.id === id); S.room = id;
  if (r.deckId !== S.deck) { S.deck = r.deckId; pickSystem(); }
  const sid = r.systems[S.kind];
  if (sid && deckPlans(S.kind).some(p => p.systemId === sid) && !(S.step === 'duct' && S.active)) S.sys = deckPlans(S.kind).find(p => p.systemId === sid).systemKey;
  if (S.step === 'duct' && phg.loading && S.active?.startsWith(r.deckId + '__')) phg.zoomTo(r.polygon.map(p => ({ x: p.x, y: -p.y })), 1500);
  render();
 }
 function plan() {
  const C = S.contract, svg = $('plan'), rooms = C.rooms.filter(r => r.deckId === S.deck); if (!rooms.length) { svg.innerHTML = ''; return; }
  const xs = rooms.flatMap(r => r.polygon.map(p => p.x)), ys = rooms.flatMap(r => r.polygon.map(p => -p.y));
  // the legend (top right, ~300 px) gets its own strip right of the deck so it never covers rooms
  const rc = svg.getBoundingClientRect(), legendPx = rc.width > 900 ? 300 : 0, minX = Math.min(...xs) - 900, minY = Math.min(...ys) - 900, maxY = Math.max(...ys) + 900;
  let maxX = Math.max(...xs) + 900; const k0 = Math.min((rc.width - legendPx) / (maxX - minX), rc.height / (maxY - minY)); if (k0 > 0 && legendPx) maxX += legendPx / k0;
  svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`); svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  // sizes in screen px: k = px per mm of the fitted plan
  const k = Math.min(rc.width / (maxX - minX), rc.height / (maxY - minY)) || 0.08, px = v => v / k, cur = curPlan(), fire = S.overlay === 'fire', a = analysis();
  let html = '', sel = '';
  for (const r of rooms) {
   const sid = r.systems[S.kind], bx = r.polygon.map(p => p.x), by = r.polygon.map(p => -p.y), x0 = Math.min(...bx), y0 = Math.min(...by), wPx = (Math.max(...bx) - x0) * k, hPx = (Math.max(...by) - y0) * k;
   const pts = r.polygon.map(p => p.x + ',' + -p.y).join(' '), cl = a.solas.classes[r.id], flow = C.airflow[r.id][FIELD[S.kind]];
   const fill = fire ? (cl?.cat ? 'transparent' : 'var(--warn-fill)') : sid ? sysColor(sid) + (sid === cur?.systemId ? '38' : '1a') : 'transparent';
   html += `<polygon class="rm${fire && !cl?.cat ? ' uncls' : ''}" data-room="${esc(r.id)}" points="${pts}" fill="${fill}"><title>${esc(r.no)} ${esc(r.name)} · ${fire ? 'SOLAS ' + esc(cl?.space || '미분류') + (cl?.cat ? ` (${cl.cat}) ` + esc(SO.catName(a.solas.settings.ship, cl.cat)) : '') : `${KL[S.kind]} ${flow} CMH`}</title></polygon>`;
   // labels pinned to the top-left corner inside the room (RUs and the unit sit at the centre); an L-shaped room whose
   // corner is cut out gets them at its interior point; narrow rooms keep only the number
   if (wPx >= 28 && hPx >= 18) {
    let lx = x0 + px(6), ly = y0 + px(17);
    if (!PL.inside({ x: lx, y: -(ly + px(15)) }, r.polygon) || !PL.inside({ x: lx + px(40), y: -(ly - px(10)) }, r.polygon)) { const ip = PL.interiorPoint(r.polygon, 100, r.holes); lx = ip.x - px(20); ly = -ip.y - px(18); }
    html += `<text class="lbl no" x="${lx}" y="${ly}" style="font-size:${px(12)}px">${esc(r.no)}</text>`;
    const sub = fire ? (cl?.cat ? `(${cl.cat})` : '미분류') : flow ? `${flow} CMH` : '';
    if (wPx >= 64 && hPx >= 36 && sub) html += `<text class="lbl${fire && !cl?.cat ? ' warnt' : ''}" x="${lx}" y="${ly + px(15)}" style="font-size:${px(11)}px">${esc(sub)}</text>`;
   }
   if (r.id === S.room) sel = `<polygon class="selhalo" points="${pts}"/><polygon class="selline" points="${pts}"/>`;
  }
  if (fire) {
   for (const b of a.solas.boundaries.filter(x => x.deckId === S.deck && x.a && x.b && x.grade && !['-', '*', 'C'].includes(x.grade)))
    html += `<line class="fb" x1="${b.a.x}" y1="${-b.a.y}" x2="${b.b.x}" y2="${-b.b.y}" stroke="${SVG.GRADE_COLORS[b.grade]}" stroke-width="${/^A-60/.test(b.grade) ? 4 : /^A/.test(b.grade) ? 3 : 2}"><title>${esc(b.grade)} · ${esc(b.aSpace || '?')} ↔ ${esc(b.bSpace || '?')} (Table ${esc(b.table)})${b.check.length ? ' · ' + esc(b.check.join(' / ')) : ''}</title></line>`;
   // penetrations: circle; fire damper = square with a slash; deck penetration (vertical duct) = diamond
   for (const pn of a.solas.penetrations.filter(x => x.deckId === S.deck)) {
    const x = pn.x, y = -pn.y, r = px(pn.damper ? 6 : 4.5), cls = `pen${/SIZE|CHECK/.test(pn.code) || pn.note ? ' chk' : ''}`, tip = `<title>${esc(pn.no)} ${esc(pn.systemId)} ${esc(pn.duct)} · ${esc(pn.grade || '미정')} · ${esc(pn.size)} · ${esc(pn.text)}${pn.note ? ' · ' + esc(pn.note) : ''}</title>`;
    html += pn.boundaryKind === 'deck' ? `<path class="${cls} dk${pn.damper ? ' fd' : ''}" d="M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z">${tip}</path>`
     : pn.damper ? `<g class="${cls} fd"><rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}"/><line x1="${x - r}" y1="${y + r}" x2="${x + r}" y2="${y - r}"/>${tip}</g>` : `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}">${tip}</circle>`;
   }
   for (const p of a.solas.passages.filter(x => x.deckId === S.deck && x.roomId)) { const r = C.rooms.find(x => x.id === p.roomId); if (!r) continue;
    html += `<polygon class="pass ${p.level}" points="${r.polygon.map(q => q.x + ',' + -q.y).join(' ')}"><title>${esc(p.systemId)}: ${esc(p.text)} (${esc(p.rule)})</title></polygon>`; }
  } else {
   // transfer air: a short arrow across the middle of the wall the two rooms share (where the door grille or transfer
   // duct goes), with its CMH; solid when the user chose the source, orange through an A-class boundary
   for (const r of rooms) { const A = C.airflow[r.id], src = C.rooms.find(x => x.id === A.transferFrom); if (!src || !A.transferInCmh) continue;
    let seg = null; for (const e of GE.roomEdges(src)) for (const g of GE.roomEdges(r)) { const q = GE.sharedSegment(e, g, 400, 100); if (q && (!seg || q.lengthMm > seg.lengthMm)) seg = q; }
    let m, ux, uy;
    if (seg) { m = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 }; const L = seg.lengthMm || 1; ux = -(seg.b.y - seg.a.y) / L; uy = (seg.b.x - seg.a.x) / L;
     const c = PL.interiorPoint(src.polygon, 100, src.holes); if ((c.x - m.x) * ux + (c.y - m.y) * uy > 0) { ux = -ux; uy = -uy; } }
    else { const p = PL.interiorPoint(src.polygon, 100, src.holes), q = PL.interiorPoint(r.polygon, 100, r.holes), L = Math.hypot(q.x - p.x, q.y - p.y) || 1; ux = (q.x - p.x) / L; uy = (q.y - p.y) / L; m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; }
    const len = px(16), h = px(6), fx = m.x - ux * len, fy = m.y - uy * len, tx = m.x + ux * len, ty = m.y + uy * len;
    const bd = a.solas.boundaries.find(b => b.kind === 'bulkhead' && ((b.roomA === r.id && b.roomB === src.id) || (b.roomB === r.id && b.roomA === src.id))), aClass = /^A/.test(bd?.grade || '');
    html += `<g class="xfer${A.transferSet ? ' set' : ''}${aClass ? ' acls' : ''}"><line x1="${fx}" y1="${-fy}" x2="${tx}" y2="${-ty}"/><polygon points="${tx + ux * h},${-(ty + uy * h)} ${tx - uy * h * .6},${-(ty + ux * h * .6)} ${tx + uy * h * .6},${-(ty - ux * h * .6)}"/>`
     + `<text x="${tx + ux * h + px(3)}" y="${-(ty + uy * h) - px(3)}" style="font-size:${px(10)}px">${fmt(A.transferInCmh)}</text>`
     + `<title>전달 공기 ${fmt(A.transferInCmh)} CMH: ${esc(src.no)} ${esc(src.name)} → ${esc(r.no)} ${esc(r.name)}${bd?.grade ? ' · 경계 ' + esc(bd.grade) : ''}${A.transferSet ? ' (지정)' : ' (자동)'}</title></g>`; }
   // ducts of the chosen kind that PHG D made, thin, under the markers
   for (const p of deckPlans(S.kind)) for (const d of S.geometry[p.key]?.ducts || [])
    html += `<polyline class="duct" points="${d.points.map(q => `${q.x},${q.y}`).join(' ')}" stroke="${sysColor(p.systemId)}" stroke-width="${d.type === 'main' ? 2.5 : 1.5}" opacity="${p.key === cur?.key ? .9 : .45}"><title>${esc(p.systemId)} ${esc(d.displayName)} ${d.widthMm ? d.widthMm + '×' + d.heightMm : ''} · ${d.flowCmh} CMH</title></polyline>`;
  }
  html += sel;
  // units (filled = set by the user, dashed = a guess) on the unit deck; vertical duct shafts (circles) on the other decks
  for (const p of deckPlans(S.kind)) {
   const col = sysColor(p.systemId), on = p.key === cur?.key, user = p.rootSource === 'user', firm = user || /^(fan|shaft|own)-room|above-unit/.test(p.rootSource), s = px(on ? 22 : 18), cx = p.root.x, cy = -p.root.y;
   const tip = `${esc(p.systemId)} ${p.isUnitDeck ? (p.kind === 'supply' ? '공조기' : '팬') : '수직 덕트'} · ${esc(rootText(p.rootSource))}`;
   html += p.isUnitDeck ? `<g class="mk" data-key="${esc(p.key)}" opacity="${on ? 1 : .6}"><rect class="root${firm ? '' : ' guess'}" x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="${px(3)}" ${user ? `fill="${col}" stroke="${col}"` : `stroke="${col}"`}><title>${tip}</title></rect><text class="ahu${user ? '' : ' guess'}" x="${cx}" y="${cy + px(3)}" text-anchor="middle" style="font-size:${px(8)}px">${UNIT_WORD[p.kind]}</text></g>`
    : `<g class="mk" data-key="${esc(p.key)}" opacity="${on ? 1 : .6}"><circle class="root shaft${firm ? '' : ' guess'}" cx="${cx}" cy="${cy}" r="${s / 2}" ${user ? `fill="${col}" stroke="${col}"` : `stroke="${col}"`}><title>${tip}</title></circle><text class="ahu${user ? '' : ' guess'}" x="${cx}" y="${cy + px(4)}" text-anchor="middle" style="font-size:${px(11)}px">⇅</text></g>`;
  }
  // a place picked in ⑤ (penetration row): a ring that fades
  if (S.focus && S.focus.deckId === S.deck) html += `<circle class="focus" cx="${S.focus.x}" cy="${-S.focus.y}" r="${px(18)}"/>`;
  // ship directions: +x forward, +y port (BOX)
  const ox = minX + px(24), oy = maxY - px(24);
  html += `<g class="dir" style="font-size:${px(11)}px"><line x1="${ox}" y1="${oy}" x2="${ox + px(46)}" y2="${oy}"/><path d="M${ox + px(46)} ${oy - px(4)}L${ox + px(54)} ${oy}L${ox + px(46)} ${oy + px(4)}Z"/><text x="${ox + px(58)}" y="${oy + px(4)}">선수 FWD</text><line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - px(40)}"/><path d="M${ox - px(4)} ${oy - px(40)}L${ox} ${oy - px(48)}L${ox + px(4)} ${oy - px(40)}Z"/><text x="${ox + px(6)}" y="${oy - px(40)}">좌현 P</text></g>`;
  svg.innerHTML = html; svg.classList.toggle('picking', S.pickRoot);
  svg.querySelectorAll('.rm').forEach(e => e.onclick = ev => { if (S.pickRoot) return; ev.stopPropagation(); selectRoom(e.dataset.room); });
  svg.querySelectorAll('.mk').forEach(e => e.onclick = ev => { if (S.pickRoot) return; ev.stopPropagation(); S.sys = plans().find(p => p.key === e.dataset.key).systemKey; render(); });
  svg.onclick = ev => { if (!S.pickRoot) return; const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); setRoot({ x: q.x, y: -q.y }); render(); };
  if (fire) {
   const sum = a.solas.summary, on = a.solas.boundaries.filter(x => x.deckId === S.deck), cnt = g => on.filter(x => x.grade === g).length;
   $('legend').innerHTML = `<b>${esc(deckName(S.deck))} 방화 경계</b> <span class="muted">${esc(SO.DATA.ships[a.solas.settings.ship].label)}</span><br>${['A-60', 'A-30', 'A-15', 'A-0', 'B-15', 'B-0'].filter(cnt).map(g => `<span class="ln" style="background:${SVG.GRADE_COLORS[g]}"></span>${g} · ${cnt(g)}`).join('<br>')}<br><span class="pd fd"></span>방화댐퍼 ${a.solas.penetrations.filter(x => x.deckId === S.deck && x.damper).length} · <span class="pd"></span>관통 ${a.solas.penetrations.filter(x => x.deckId === S.deck).length} · <span class="pd dk"></span>갑판 관통<br>${a.solas.passages.some(x => x.deckId === S.deck) ? '<span class="err">▨ 제한 구역 통과</span><br>' : ''}${sum.unclassified.length ? `<span class="warn">미분류 실 ${sum.unclassified.length} (전체) — 실 선택 후 오른쪽에서 지정</span>` : '<span class="muted">모든 실 분류됨</span>'}`;
  } else {
   const sys = [...new Set(rooms.map(r => r.systems[S.kind]).filter(Boolean))].sort();
   $('legend').innerHTML = `<b>${esc(deckName(S.deck))} ${KL[S.kind]} 계통</b><br>${sys.map(id => `<span class="dot" style="background:${sysColor(id)}"></span>${esc(id)} · ${fmt(C.systems.find(s => s.id === id && s.kind === S.kind)?.designCmh)} CMH`).join('<br>') || '<span class="muted">이 Deck에 없음</span>'}<br><span class="muted">${UNIT_WORD[S.kind]} □ 공조기·팬 · ⇅ ○ 수직 덕트 · 채움 = 지정 · 점선 = 임시</span>${C.rooms.some(r => r.deckId === S.deck && C.airflow[r.id].transferInCmh && C.rooms.some(x => x.id === C.airflow[r.id].transferFrom)) ? '<br><span class="muted">→ 전달 공기 CMH (실선 = 지정 · 주황 = A급 경계)</span>' : ''}`;
  }
 }
 // ⑤ review: tabs over the analysis
 const TABS = [['nets', '덕트망'], ['systems', '계통·수직 덕트'], ['fire', '방화 (SOLAS)'], ['checks', '검토']];
 const tableHtml = (sh, { keys, limit, cls, tip = '두 번 클릭: ④ RU·덕트에서 열기' } = {}) => `<table><thead><tr>${sh.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sh.rows.slice(0, limit || sh.rows.length).map((r, i) => `<tr${keys ? ` data-key="${esc(keys[i])}" class="${keys[i] === S.active ? 'active' : ''}" title="${esc(tip)}"` : ''}>${r.map((v, j) => `<td class="${typeof v === 'number' ? 'n ' : ''}${cls ? cls(r, j, i) : ''}">${esc(typeof v === 'number' ? v.toLocaleString() : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>${limit && sh.rows.length > limit ? `<p class="muted">… ${sh.rows.length - limit}행 더 — 통합 XLSX 참조</p>` : ''}`;
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
  let body = '';
  if (S.tab === 'nets') {
   const nets = front(get('Deck 덕트망'), '상태', 3), last = 3;
   body = `<h3>Deck·계통별 PHG D 덕트망 <small class="muted">${a.done}/${a.total} AUTO 완료${a.stale ? ` · 다시 보내기 ${a.stale}` : ''} · 두 번 클릭하면 ④에서 엽니다</small></h3>${tableHtml(nets, { keys: a.plans.map(p => p.key), cls: (r, j) => j === last ? (r[j] === 'AUTO 완료' ? 'ok' : r[j] === '미생성' ? 'muted' : 'warn') : j === 5 && /임시/.test(r[j]) ? 'warn' : j === 7 && r[7] !== '' && r[7] !== r[8] ? 'warn' : '' })}`;
  } else if (S.tab === 'systems') {
   body = `<h3>공조 구역 풍량 수지 <small class="muted">신기 = max(최소 신기 합, 배기 합 + 가압 ${C.rules.pressurizationPct ?? 5} %(${C.rules.pressurizationBasis === 'supply' ? '급기' : '배기'} 대비), 급기 × ${C.rules.minOaPct ?? 25} %) · 환기 = 급기 − 신기 · 화장실 등은 이웃 실에서 전달 공기</small></h3>${tableHtml(get('구역 수지'), { cls: (r, j) => j === 10 ? (r[j] === '적합' ? 'ok' : 'err') : '' })}
    <h3>계통·팬 <small class="muted">덕트 외부 정압(ESP) = Deck 덕트망 최대 + 공조기에서 그 Deck까지 수직 덕트 · 팬 정압 추정 = ESP + 공조기 내부 + 루버</small></h3>${tableHtml(front(get('계통·팬'), '상태', 2), { cls: (r, j) => j === 2 && r[j] !== '계산 완료' ? 'warn' : '' })}
    <h3>수직 덕트 <small class="muted">공조기 Deck에서 다른 Deck으로 · 크기: 풍속 ≤ 10 m/s · 마찰 ≤ 2 Pa/m</small></h3>${a.risers.length ? tableHtml(get('수직 덕트')) : '<p class="muted">여러 Deck을 담당하는 계통이 없습니다.</p>'}`;
  } else if (S.tab === 'fire') {
   const sum = a.solas.summary, shp = SO.DATA.ships[a.solas.settings.ship], unc = sum.unclassified.map(id => C.rooms.find(r => r.id === id));
   const roomChecks = Object.entries(a.solas.classes).filter(([, k]) => k.check);
   // grade chips filter the penetration list (and the dampers chip shows only fire dampers)
   const gf = S.gradeFilter, pens = a.solas.penetrations.filter(p => !gf || (gf === 'FD' ? p.damper : (p.grade || '미정') === gf));
   const pt = penTable(pens);
   body = `<h3>방화 경계 ${sum.boundaries}개 <small class="muted">${esc(shp.label)} · Table ${shp.tB}/${shp.tD} · 방화방식 ${esc(a.solas.settings.method)} · 최하층 아래 ${esc(a.solas.settings.lowestBelow || '미지정')} · 설계 보조 — 최종 판단 주관청·선급</small></h3>
    <p class="grades">${Object.entries(sum.byGrade).sort((x, y) => SO.rank(x[0]) - SO.rank(y[0])).map(([g, n]) => `<button class="gchip" data-grade="${esc(g)}" aria-pressed="${gf === g}" style="--g:${SVG.GRADE_COLORS[g] || '#999'}" title="이 등급의 관통만 보기">${esc(g)} <b>${n}</b></button>`).join('')}<button class="gchip" data-grade="FD" aria-pressed="${gf === 'FD'}" style="--g:#111" title="방화댐퍼 관통만 보기">방화댐퍼 <b>${sum.fireDampers}</b></button></p>
    ${unc.length ? `<h3 class="warn">미분류 실 ${unc.length}개 — 공간을 지정하면 경계·관통 판정이 바로 다시 계산됩니다</h3><table class="assign"><tbody>${unc.map(r => `<tr><td>${esc(deckName(r.deckId))}</td><td>${esc(r.no)} ${esc(r.name)}</td><td><select data-solas="${esc(r.id)}" aria-label="${esc(r.no)} SOLAS 공간"><option value="">자동 분류</option>${spaceOptions('')}</select></td></tr>`).join('')}</tbody></table>` : '<p class="ok">✓ 모든 실이 SOLAS 공간으로 분류됨</p>'}
    ${roomChecks.length ? `<h3>분류 확인 ${roomChecks.length}실</h3><table class="assign"><tbody>${roomChecks.map(([id, k]) => `<tr><td>${esc(roomText(id))}</td><td>${esc(k.space)}</td><td class="warn">${esc(k.check)}</td><td><select data-solas="${esc(id)}" aria-label="${esc(roomText(id))} SOLAS 공간"><option value="">자동 분류</option>${spaceOptions(C.solas?.rooms?.[id]?.space || '')}</select></td></tr>`).join('')}</tbody></table>` : ''}
    ${a.solas.passages.length ? `<h3 class="err">제한 구역 통과 ${a.solas.passages.length}건 (II-2/9.7.2)</h3>${tableHtml(get('제한 구역 통과'), { cls: (r, j) => j === 0 ? (r[0] === '실패' ? 'err' : 'warn') : '' })}` : '<p class="ok">✓ 제한 구역(A류 기관구역·조리실·CO₂실·계단 등)을 지나는 덕트 없음</p>'}
    <h3>SOLAS 점검표 <small class="muted">계통 분리 경고 · 조리실 배기(9.7.5) · 축전지실·CO₂실 · 통풍 정지·폐쇄(5.2)</small></h3>${tableHtml(get('SOLAS 점검표'), { cls: (r, j) => j === 0 ? (r[0] === '실패' ? 'err' : 'warn') : '' })}
    <h3>덕트 관통 ${pens.length}${gf ? ` / ${sum.penetrations}` : ''}곳 <small class="muted">슬리브 ${Object.entries(sum.sleeves).map(([m, n]) => `${m} mm × ${n}`).join(', ') || '없음'} · 행을 누르면 ③ 방화 보기에서 위치 표시${sum.penetrations && !Object.keys(S.geometry).length ? ' · Deck 덕트는 AUTO 후 판정 (지금은 수직 덕트만)' : ''}</small></h3>
    <div class="scrollx">${tableHtml(pt, { limit: 300, keys: pens.map(p => 'pen:' + p.no), tip: '눌러서 ③ 방화 보기에서 위치 보기', cls: (r, j) => j === 1 && /^A-60/.test(r[1]) ? 'err' : j === 2 && /방화댐퍼|판정|확인|미정|샤프트/.test(r[2]) ? 'warn' : '' })}</div>`;
  } else {
   const items = RP.openItems(project(), a);
   body = `<h3>검토 <small class="muted">실패 ${a.count.fail} · 확인 필요 ${a.count.check} · 통과 ${a.count.ok}</small></h3><table class="checks"><tbody>${a.checks.map(k => `<tr><td class="${LV[k.level][0]}">${LV[k.level][1]}</td><td>${esc(k.text)}</td></tr>`).join('')}</tbody></table>
    <h3>미해결 확인 사항 ${items.length}건</h3>${items.length ? groups(items).map(([lv, area, rows]) => `<details class="grp-items" ${lv === 'fail' || rows.length <= 5 ? 'open' : ''}><summary><span class="${LV[lv][0]}">${LV[lv][1]}</span> ${esc(area)} <span class="muted">${rows.length}건</span></summary><table class="checks wide"><tbody>${rows.slice(0, 200).map(text => `<tr><td>${esc(text)}</td></tr>`).join('')}</tbody></table>${rows.length > 200 ? `<p class="muted">… ${rows.length - 200}건 더 (XLSX 확인 사항 시트)</p>` : ''}</details>`).join('') : '<p class="ok">없음</p>'}
    <p class="muted">설계 보조 결과 — 최종 판단은 설계자·주관청·선급. 출력: 위 리본의 통합 XLSX·통합 DXF·보고서.</p>`;
  }
  const badge = id => id === 'fire' ? (a.solas.summary.passagesFail + a.solas.warnings.length + a.solas.summary.checklistFail ? ` <span class="badge fail">✕ ${a.solas.summary.passagesFail + a.solas.warnings.length + a.solas.summary.checklistFail}</span>` : a.solas.summary.unclassified.length ? ` <span class="badge warn">● ${a.solas.summary.unclassified.length}</span>` : '')
   : id === 'checks' ? (a.count.fail ? ` <span class="badge fail">✕ ${a.count.fail}</span>` : a.count.check ? ` <span class="badge warn">● ${a.count.check}</span>` : '') : id === 'systems' && a.zones.some(z => !z.ok) ? ' <span class="badge fail">✕</span>' : '';
  $('report').innerHTML = `<div class="tabs" role="tablist">${TABS.map(([id, l]) => `<button role="tab" data-tab="${id}" aria-selected="${S.tab === id}">${l}${badge(id)}</button>`).join('')}</div>${body}`;
  $('report').querySelectorAll('.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; render(); });
  $('report').querySelectorAll('tbody tr[data-key]').forEach(tr => {
   if (tr.dataset.key.startsWith('pen:')) tr.onclick = () => { const p = a.solas.penetrations.find(x => x.no === tr.dataset.key.slice(4)); S.focus = { deckId: p.deckId, x: p.x, y: p.y }; S.deck = p.deckId; S.overlay = 'fire'; pickSystem(); go('air'); setTimeout(() => { S.focus = null; if (S.step === 'air') plan(); }, 4000); };
   else tr.ondblclick = () => { const p = plans().find(x => x.key === tr.dataset.key); S.deck = p.deckId; S.sys = p.systemKey; S.kind = p.kind; go('duct'); };
  });
  $('report').querySelectorAll('.gchip[data-grade]').forEach(b => b.onclick = () => { S.gradeFilter = S.gradeFilter === b.dataset.grade ? null : b.dataset.grade; render(); });
  $('report').querySelectorAll('select[data-solas]').forEach(s => s.onchange = () => act(null, () => setSolasRoom(s.dataset.solas, s.value)));
 }
 function inspector() {
  const C = S.contract;
  if (!C) { $('inspTitle').textContent = '속성'; $('insp').innerHTML = `<div class="card"><h4>시작</h4><span class="muted">① BOX에서 도면을 열고(S5·T3 예제 포함) ② CAL로 부하를 계산한 뒤 <b>계약 만들기</b>를 누르세요. 저장한 HVAC Grid 프로젝트는 위쪽 열기 버튼으로 엽니다.</span></div>`; return; }
  const r = C.rooms.find(x => x.id === S.room), a = analysis();
  if (!r) {
   const rooms = C.rooms.filter(x => x.deckId === S.deck), sum = k => rooms.reduce((t, x) => t + (C.airflow[x.id][k] || 0), 0);
   $('inspTitle').textContent = 'Deck ' + deckName(S.deck);
   $('insp').innerHTML = `<div class="card"><h4>Deck 요약</h4><div class="kv"><span>격실</span><span>${rooms.length}</span><span>냉방 현열</span><span>${fmt(rooms.reduce((t, x) => t + C.loads[x.id].coolingSensibleW, 0))} W</span><span>급기(SA) 합계</span><span>${fmt(sum('supplyCmh'))} CMH</span><span>배기(EA) 합계</span><span>${fmt(sum('exhaustCmh'))} CMH</span><span>환기(RA) 합계</span><span>${fmt(sum('returnCmh'))} CMH</span></div></div>`
    + deckPlans().map(p => { const res = result(p.key), sys = a.systems.find(s => s.systemKey === p.systemKey), sd = sys?.decks.find(d => d.key === p.key);
     return `<div class="card${p.key === S.active ? ' active' : ''}${p.key === curKey() ? ' now' : ''}"><h4><span><span class="dot" style="background:${sysColor(p.systemId)}"></span>${KL[p.kind]} ${esc(p.systemId)}</span>${p.key === S.active ? '<span class="from">PHG D에 열림</span>' : ''}</h4><div class="kv"><span>설계 풍량</span><span>${fmt(p.designCmh)} CMH${p.decks > 1 ? ` <span class="muted">/ 팬 ${fmt(sys?.fanCmh)}</span>` : ''}</span><span>RU</span><span>${p.rus.length}개</span><span>${p.isUnitDeck ? (p.kind === 'supply' ? '공조기' : '팬') : '수직 덕트'}</span><span class="${p.isUnitDeck && p.rootSource.startsWith('assumed') ? 'warn' : ''}">${esc(rootText(p.rootSource))}</span>${p.decks > 1 ? `<span>공조기 Deck</span><span>${esc(deckName(p.unitDeckId))}</span>` : ''}${res?.at ? `<span>덕트</span><span>${res.ducts}개 · ${res.lengthM} m</span><span>Deck 최대 손실</span><span>${res.indexPa ?? '—'} Pa${sd && sd.riserPa ? ` + 수직 ${sd.riserPa}` : ''}</span><span>상태</span><span class="${res.stale ? 'warn' : 'ok'}">${res.stale ? '다시 보내기 필요' : res.auto ? 'AUTO 완료' : 'RU 배치'}</span>` : ''}</div></div>`; }).join('');
   return;
  }
  // fixed card order: 형상 → 부하 → 풍량 → 계통 → RU·덕트 → 방화; the card of the current step is marked
  const L = C.loads[r.id], A = C.airflow[r.id], cl = a.solas.classes[r.id], ship = a.solas.settings.ship, shp = SO.DATA.ships[ship];
  const rp = plans().filter(p => p.rus.some(u => u.roomId === r.id));
  const now = { room: 'geo', load: 'load', air: S.overlay === 'fire' ? 'fire' : 'air', duct: 'duct', review: S.tab === 'fire' ? 'fire' : 'duct' }[S.step], card = (id, title, from, body) => `<div class="card${id === now ? ' now' : ''}"><h4>${title}<span class="from">${from}</span></h4>${body}</div>`;
  const bnd = a.solas.boundaries.filter(b => b.roomA === r.id || b.roomB === r.id), worst = bnd.filter(b => b.grade).sort((x, y) => SO.rank(x.grade) - SO.rank(y.grade))[0];
  $('inspTitle').innerHTML = `${esc(r.no)} ${esc(r.name)}`;
  $('insp').innerHTML = card('geo', '형상', 'BOX', `<div class="kv"><span>면적</span><span>${r.areaM2.toFixed(1)} m²</span><span>체적</span><span>${r.volumeM3.toFixed(1)} m³</span><span>ISO 분류</span><span>${esc(r.isoClass || '—')}</span></div>`)
   + card('load', '부하', 'BOX CAL', `<div class="big">${fmt(L.coolingSensibleW)} W</div><div class="muted">냉방 현열</div><div class="kv" style="margin-top:6px"><span>냉방 잠열</span><span>${fmt(L.coolingLatentW)} W</span><span>냉방 합계</span><span>${fmt(L.coolingW)} W</span><span>난방</span><span>${fmt(L.heatingW)} W</span><span>최소 신기(OA)</span><span>${fmt(L.minFreshAirCmh)} CMH</span><span>상태</span><span class="${L.complete ? 'ok' : 'warn'}">${esc(L.status || (L.complete ? '완료' : '미완료'))}</span></div>`)
   + card('air', '풍량', 'HVAC Grid', `<div class="kv"><span>급기(SA)</span><span><b>${fmt(A.supplyCmh)}</b> CMH</span><span>배기(EA)</span><span>${fmt(A.exhaustCmh)} CMH</span><span>환기(RA)</span><span>${fmt(A.returnCmh)} CMH</span>${A.transferInCmh ? `<span>전달 공기 받음</span><span>${fmt(A.transferInCmh)} CMH · ${A.transferFrom === 'own-inlet' ? '자체 흡입구' : A.transferFrom === 'outside' ? '이웃 급기 실 없음' : esc(roomName(A.transferFrom))}</span>` : ''}${A.transferOutCmh ? `<span>전달 공기 보냄</span><span>${fmt(A.transferOutCmh)} CMH</span>` : ''}${A.makeupCmh ? `<span>보충 급기</span><span>+${fmt(A.makeupCmh)} CMH</span>` : ''}</div>${A.transferInCmh && !/CO2|CO₂|소화제|배터리|축전지|BATTERY|페인트|PAINT/i.test(r.name || '') ? `<label class="field" style="margin-top:6px">전달 공기 출처<select id="xferSel"><option value="">자동 (${A.transferSet ? '—' : A.transferFrom === 'outside' ? '이웃 없음' : esc(roomName(A.transferFrom))})</option><option value="own-inlet" ${C.transfers?.[r.id] === 'own-inlet' ? 'selected' : ''}>자체 흡입구 (외기 그릴)</option>${C.rooms.filter(n => n !== r && n.deckId === r.deckId && GE.sharedLength(r, n) >= 300).map(n => `<option value="${esc(n.id)}" ${C.transfers?.[r.id] === n.id ? 'selected' : ''}>${esc(n.no)} ${esc(n.name)}</option>`).join('')}</select></label>` : ''}<div class="muted" style="margin-top:6px">급기 = 올림(냉방 현열 W × 3 ÷ ΔT ${C.rules.supplyDeltaTK} K), 최소 신기 이상<br>배기 = 올림(환기 횟수 × 체적) · 환기 = 공조 구역 수지</div>${a.air.filter(x => x.roomId === r.id && x.level !== 'info').map(x => `<div class="${x.level === 'fail' ? 'err' : 'warn'}" style="margin-top:4px">${x.level === 'fail' ? '✕' : '●'} ${esc(x.text.split(': ').slice(1).join(': '))}</div>`).join('')}`)
   + card('sys', '계통', '', `<div class="kv">${PL.KINDS.map(k => `<span>${KL[k]}</span><span>${r.systems[k] ? `<span class="dot" style="background:${sysColor(r.systems[k])}"></span>${esc(r.systems[k])}` : '—'}</span>`).join('')}</div>`)
   + (rp.length ? card('duct', 'RU·덕트', 'PHG D', `<div class="kv">${rp.map(p => { const rus = p.rus.filter(u => u.roomId === r.id), res = result(p.key); return `<span>${KL[p.kind]} RU</span><span>${rus.length}개 · ${fmt(rus.reduce((t, u) => t + u.flowCmh, 0))} CMH${res?.at ? ` <span class="muted">· 계통 ${res.indexPa ?? '—'} Pa</span>` : ''}</span>`; }).join('')}</div>`) : '')
   + card('fire', '방화 (SOLAS)', shp.tB + '/' + shp.tD, `<div class="kv"><span>공간</span><span class="${cl?.cat ? '' : 'warn'}">${esc(cl?.space || '미분류')}</span><span>범주</span><span>${cl?.cat ? `(${cl.cat}) ${esc(SO.catName(ship, cl.cat))}` : '—'}</span><span>근거</span><span>${esc({ name: '실 이름', 'iso-class': 'BOX ISO 분류', user: '사용자 지정', unclassified: '—', 'no-category': '이 표에 범주 없음' }[cl?.source] || '')}</span><span>경계</span><span>${bnd.length}개${worst ? ` · 최대 ${esc(worst.grade)}` : ''}</span></div>${cl?.check ? `<div class="warn" style="margin-top:4px">● ${esc(cl.check)}</div>` : ''}
     <label class="field" style="margin-top:6px">공간 지정<select id="solasSel"><option value="">자동 분류</option>${spaceOptions(C.solas?.rooms?.[r.id]?.space || '')}</select></label>`);
  const ss = $('solasSel'); if (ss) ss.onchange = () => act(null, () => setSolasRoom(r.id, ss.value));
  const xs = $('xferSel'); if (xs) xs.onchange = () => act(null, () => setTransfer(r.id, xs.value));
 }
 function center() {
  const view = stepOf(S.step).view, noContract = !S.contract && (view === 'plan' || view === 'report' || view === 'phg');
  $('boxFrame').style.visibility = view === 'box' ? 'visible' : 'hidden';
  $('phgFrame').style.visibility = view === 'phg' && !noContract ? 'visible' : 'hidden';
  show($('plan'), view === 'plan' && !noContract); show($('legend'), view === 'plan' && !noContract); show($('report'), view === 'report' && !noContract);
  show($('empty'), noContract);
  if (noContract) {
   $('empty').innerHTML = `<div><b>아직 계약이 없습니다</b>BOX의 격실·부하를 HVAC Grid 계약으로 만들어야 풍량·계통과 덕트 단계를 쓸 수 있습니다.<br><button class="btn primary" id="emptyGo">② 부하에서 계약 만들기</button><button class="btn" id="emptySample">예제 계약 열기 (S5)</button><button class="btn" id="emptyT3">T3 시험선 열기</button></div>`;
   $('emptyGo').onclick = () => go('load'); $('emptySample').onclick = () => act('예제 계약 여는 중', () => openSample('s5')); $('emptyT3').onclick = () => act('T3 시험선 여는 중', () => openSample('t3'));
  }
  if (view === 'plan' && S.contract) plan();
  if (view === 'report' && S.contract) report();
 }
 function status() {
  const C = S.contract, r = C?.rooms.find(x => x.id === S.room), ps = plans();
  const done = ps.filter(p => result(p.key)?.auto && !result(p.key).stale).length, n = k => C.systems.filter(s => s.kind === k).length;
  $('status').innerHTML = (C ? `<span>선박 전체: Deck <b>${C.decks.length}</b> · 격실 <b>${C.rooms.length}</b> · 계통 급기 <b>${n('supply')}</b> 배기 <b>${n('exhaust')}</b> 환기 <b>${n('return')}</b> · 급기 <b>${fmt(C.systems.filter(s => s.kind === 'supply').reduce((t, s) => t + s.designCmh, 0))}</b> CMH · 덕트망 <b>${done}</b>/${ps.length}</span><span>선택: <b>${esc(deckName(S.deck))}</b>${r ? ` · ${esc(r.no)} ${esc(r.name)}` : ''}</span>` : '<span>계약 없음 — ① 도면 → ② 부하 → 계약 만들기</span>')
   + (S.active ? `<span>PHG D: <b>${esc(S.active.replace('__', ' · '))}</b></span>` : '') + `<span class="msg${S.msgErr ? ' err' : ''}" role="status">${esc(S.msg)}</span>`;
  $('proj').textContent = C ? `${RP.PROJECT_NAME(C) || '계약'} · ${C.rooms.length}실` : '계약 없음';
 }
 function render() { steps(); ribbon(); tree(); center(); inspector(); status(); $('main').classList.toggle('left-off', S.leftOff === true); $('main').classList.toggle('right-off', S.rightOff === true); }

 // ---------- wiring ----------
 $('steps').onclick = e => { const b = e.target.closest('.step'); if (b) go(b.dataset.step); };
 $('q').oninput = () => tree();
 $('leftToggle').onclick = () => { S.leftOff = !S.leftOff; render(); };
 $('rightToggle').onclick = () => { S.rightOff = !S.rightOff; render(); };
 $('undoBtn').onclick = () => act(null, () => { const f = frameOnScreen(); if (f) f.click('undoBtn'); else undoShell(); });
 $('redoBtn').onclick = () => act(null, () => { const f = frameOnScreen(); if (f) f.click('redoBtn'); else redoShell(); });
 $('openProjectBtn').onclick = () => act(null, openProject);
 $('saveProjectBtn').onclick = () => S.contract ? OUT.project() : say('저장할 계약이 없습니다', true);
 $('themeBtn').onclick = () => { const d = document.documentElement, dark = d.dataset.theme !== 'dark'; d.dataset.theme = dark ? 'dark' : ''; try { localStorage.setItem('hvac-grid-theme', dark ? 'dark' : ''); } catch {} if (S.step === 'air' && S.contract) plan(); };
 try { if (localStorage.getItem('hvac-grid-theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch {}
 // Alt+1..5 switch steps, also while the focus is inside a vendor frame; Ctrl+Z / Ctrl+Y undo HVAC Grid edits in ③ ⑤
 const onKey = e => {
  if (e.altKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); go(STEPS[+e.key - 1].id); return true; }
  if (e.key === 'Escape' && S.pickRoot) { S.pickRoot = false; say(''); render(); return true; }
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && !typing && !frameOnScreen() && S.contract && /^[zy]$/i.test(e.key)) { e.preventDefault(); act(null, () => (e.key.toLowerCase() === 'y' || e.shiftKey) ? redoShell() : undoShell()); return true; }
  return false;
 };
 document.addEventListener('keydown', onKey); B.onFrameKey = e => (e.altKey && /^[1-5]$/.test(e.key)) || (e.key === 'Escape' && S.pickRoot) ? onKey(e) : false;
 window.addEventListener('resize', () => { if (S.step === 'air' && S.contract) plan(); });
 window.HVACGrid = { S, box, phg, plans, analysis, project, result, go, openSample, setContract, extractContract, sendPlan, autoKey, readBack, projectJson, render, setSolasRoom, setUnitDeck, undoShell, redoShell, OUT, LIB,
  runAll: (keys, opt) => act('AUTO 계산 중', () => runAll(keys, opt)) };   // with the busy overlay and error message, as from the ribbon
 render(); go('room');
})();
