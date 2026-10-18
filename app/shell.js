// HVAC Grid shell: one workflow over BOX CAL (rooms, loads) and PHG D (RUs, ducts) - docs/UI_REVIEW.md, UI_DESIGN_REVIEW.md.
// ① 도면·격실 and ② 부하 show BOX, ④ RU·덕트 shows PHG D, ③ 풍량·계통 and ⑤ 검토·출력 are the shell's own views over the
// HVAC Grid contract (lib/contract.cjs). The vendor apps are driven through app/bridge.js and never modified.
'use strict';
(async () => {
 const B = window.HVACGridBridge, $ = id => document.getElementById(id);
 const show = (el, on) => el.toggleAttribute('hidden', !on);   // works for the SVG plan too (no .hidden property on SVG elements)
 const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
 const fmt = v => v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString();
 const [K, PL] = await Promise.all([B.loadCjs('../lib/contract.cjs'), B.loadCjs('../lib/phg-plan.cjs')]);
 const box = new B.Box($('boxFrame')), phg = new B.Phg($('phgFrame'));
 const S = { step: 'room', contract: null, deck: null, room: null, sys: null, filter: 'all', projects: {}, results: {}, geometry: {}, active: null, pickRoot: false, msg: '', msgErr: false, phgDocked: false };
 let plansCache = null;
 const plans = () => plansCache || (plansCache = S.contract ? PL.plan(S.contract) : []);
 const keyOf = (deck, sys) => `${deck}__${sys}`;
 const curKey = () => S.deck && S.sys ? keyOf(S.deck, S.sys) : null;
 const deckPlans = () => plans().filter(p => p.deckId === S.deck);
 const deckName = id => S.contract?.decks.find(d => d.id === id)?.name || id;
 // system colours without the red / green of errors and OK, each >= 4.4:1 on white (docs/UI_DESIGN_REVIEW.md 7)
 const SYS_COLORS = ['#1f5fa8', '#c05a00', '#00796b', '#6a3d9a', '#a0307a', '#5f6f00', '#8c564b', '#0b7a9e', '#4f5b66', '#8a6d00'];
 const sysColor = id => { const ids = [...new Set((S.contract?.systems || []).filter(s => s.kind === 'supply').map(s => s.id))].sort(); return SYS_COLORS[ids.indexOf(id) % SYS_COLORS.length] || '#888'; };
 const rootText = src => !src ? '—' : src === 'user' ? '지정함' : src.startsWith('fan-room') ? '팬룸 ' + src.split(':')[1] : src.includes('corridor') ? '임시 (복도 ' + src.split(':').pop() + ' 끝)' : '임시 (Deck 모서리)';

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
  dockL: 'M3 4h14v12H3zM7 4v12', dockR: 'M3 4h14v12H3zM13 4v12' };
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
 function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
 }
 const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

 // ---------- contract ----------
 function setContract(c, { keepWork = false } = {}) {
  const problems = K.validate(c); if (problems.length) throw new Error('계약 검사 실패: ' + problems.slice(0, 3).join(', '));
  S.contract = c; plansCache = null;
  if (!keepWork) { S.projects = {}; S.results = {}; S.geometry = {}; S.active = null; }
  if (!c.decks.some(d => d.id === S.deck)) S.deck = (plans()[0] || {}).deckId || c.decks[0]?.id || null;
  S.room = null; pickSystem();
 }
 // the supply system shown for the deck: keep the current one if the deck has it
 function pickSystem() { const ids = deckPlans().map(p => p.systemId); if (!ids.includes(S.sys)) S.sys = ids[0] || null; }
 async function extractContract() {
  await box.load();
  const raw = await box.extract(); raw.source = { app: 'BOX CAL Enhance', file: 'vendor/BOX_CAL_Enhance.html', project: 'BOX 화면' };
  const old = S.contract; setContract(K.buildContract(raw, old?.rules || {}));
  if (old?.roots) S.contract.roots = old.roots;
  const sup = S.contract.systems.filter(s => s.kind === 'supply');
  say(`계약 만듦: Deck ${S.contract.decks.length} · 격실 ${S.contract.rooms.length} · 급기 계통 ${sup.length} · ${fmt(sup.reduce((t, s) => t + s.designCmh, 0))} CMH`);
  S.step = 'air';
 }
 async function openSample() { setContract(await (await fetch('../samples/s5.contract.json', { cache: 'no-store' })).json()); say('예제 계약(S5)을 열었습니다'); if (S.step === 'room' || S.step === 'load') S.step = 'air'; }
 function markStale() { for (const r of Object.values(S.results)) r.stale = true; }
 function applyDeltaT() {
  const v = +$('dT').value; if (!(v >= 3 && v <= 25)) throw new Error('급기 ΔT는 3–25 K');
  S.contract = K.applyRules(S.contract, { supplyDeltaTK: v }); plansCache = null; markStale();
  say(`급기 ΔT ${v} K 적용: 급기 합계 ${fmt(S.contract.systems.filter(s => s.kind === 'supply').reduce((t, s) => t + s.designCmh, 0))} CMH`);
 }
 function setRoot(p) {
  const key = curKey(); if (!key) return;
  S.contract.roots = { ...(S.contract.roots || {}), [key]: { x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 } };
  plansCache = null; if (S.results[key]) S.results[key].stale = true; S.pickRoot = false;
  say(`${S.sys} 공조기 위치 지정 (${deckName(S.deck)})`);
 }
 function clearRoot() { const key = curKey(); if (!S.contract.roots?.[key]) return; const { [key]: _, ...rest } = S.contract.roots; S.contract.roots = rest; plansCache = null; if (S.results[key]) S.results[key].stale = true; say('지정 해제 — 팬룸 또는 복도 끝을 씁니다'); }

 // ---------- PHG D projects (one per deck and supply system) ----------
 function keepActive() { if (S.active && phg.loading) S.projects[S.active] = phg.serialize(); }
 function store(key, extra = {}) {
  const pl = plans().find(p => p.key === key);
  S.projects[key] = phg.serialize(); S.geometry[key] = phg.geometry();
  S.results[key] = { ...(S.results[key] || {}), ...phg.result(), ...extra, rootSource: pl?.rootSource, designCmh: pl?.designCmh, stale: false, at: Date.now() };
 }
 async function loadPhg() {
  await phg.load();
  // the shell inspector shows the results, so PHG D's own right dock starts closed (패널 group in ④ opens it)
  if (!S.phgDocked) { S.phgDocked = true; if (phg.dockShown('right')) phg.click('phgb-right-panel'); }
 }
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
  say(`${deckName(pl.deckId)} · ${pl.systemId}: RU ${pl.rus.length}개 · ${fmt(pl.designCmh)} CMH를 PHG D로 보냄`);
 }
 async function autoKey(key = curKey()) {
  if (S.active !== key || !S.results[key] || S.results[key].stale) await sendPlan(key);
  const r = await phg.auto(); store(key, { auto: true, seconds: r.seconds, candidate: r.candidate, unconnected: r.unconnected });
  say(`${key.replace('__', ' · ')}: 덕트 ${r.ducts}개 · ${r.lengthM} m · 최대 ${r.indexPa ?? '—'} Pa · ${r.seconds} s`);
 }
 async function runAll(keys = plans().map(p => p.key)) {
  for (const [i, key] of keys.entries()) { busy(`${i + 1}/${keys.length} · ${key.replace('__', ' · ')} AUTO`); await autoKey(key); }
  const done = keys.filter(k => S.results[k]?.auto).length; say(`모든 계통 AUTO 완료: ${done}/${keys.length}`);
 }
 function readBack() { if (!S.active) throw new Error('PHG D에 열린 계통이 없습니다'); store(S.active); say('PHG D 결과를 읽었습니다'); }

 // ---------- project file ----------
 function projectJson() {
  keepActive();
  return JSON.stringify({ schema: 'hvac-grid-project/0', savedAt: new Date().toISOString(), contract: S.contract, projects: S.projects, results: S.results, geometry: S.geometry });
 }
 async function openProject() {
  const f = await pickFile('.json'), data = JSON.parse(await f.text());
  if (data.schema === 'hvac-grid-project/0') { setContract(data.contract); Object.assign(S, { projects: data.projects || {}, results: data.results || {}, geometry: data.geometry || {}, active: null }); }
  else if (data.schema === K.SCHEMA) setContract(data);
  else throw new Error('HVAC Grid 프로젝트·계약 파일이 아닙니다');
  if (S.step === 'room' || S.step === 'load') S.step = 'air';
  say(f.name + ' 열기');
 }
 function summaryRows() {
  return plans().map(p => { const r = S.results[p.key] || {};
   return [deckName(p.deckId), p.systemId, rootText(r.rootSource || p.rootSource), r.rus ?? p.rus.length, r.flowCmh ?? '', p.designCmh, r.ducts ?? '', r.lengthM ?? '', r.indexPa ?? '', r.seconds ?? '', !r.at ? '미생성' : r.stale ? '다시 보내기 필요' : r.auto ? 'AUTO 완료' : 'RU 배치']; });
 }
 const SUMMARY_HEAD = ['Deck', '계통', '공조기 위치', 'RU', 'RU 풍량 (CMH)', '설계 풍량 (CMH)', '덕트', '길이 (m)', '최대 압력손실 (Pa)', 'AUTO (s)', '상태'];

 // ---------- commands ----------
 // labels are Korean; the old BOX / PHG D codes stay in the tooltip ("이전 단축") so existing users still find them
 const c = (ic, label, run, more = {}) => ({ icon: ic, label, run, ...more });
 const boxCmd = id => () => act(null, async () => { await box.load(); box.click(id); });
 const boxCal = code => () => act(/^현재 격실/.test(box.loading ? box.calStatus() : '') ? null : 'BOX CAL 여는 중', async () => { await box.load(); await box.cal(code); });
 const boxFile = (id, accept) => () => act(null, async () => { const f = await pickFile(accept); await box.load(); box.setFile(id, f); say(f.name + ' → BOX'); });
 const phgCmd = id => () => act(null, async () => { await loadPhg(); phg.click(id); });
 const phgText = t => () => act(null, async () => { await loadPhg(); phg.clickMenu(t); });
 const needContract = () => !S.contract;
 const STEPS = [
  { id: 'room', name: '도면·격실', view: 'box', groups: () => [
   ['파일', [c('open', 'DXF 열기', boxFile('dxfFile', '.dxf'), { code: 'DXF' }), c('bg', '배경', boxFile('backgroundFile', ''), { code: 'BG' }), c('json', 'JSON 열기', boxFile('jsonFile', '.json'), { code: 'J↓' }), c('save', 'JSON 저장', boxCmd('saveBtn'), { code: 'S' }), c('dxfOut', 'DXF 출력', boxCmd('exportBtn'), { code: 'D↑' })]],
   ['보기', [c('fit', '전체 보기', boxCmd('fitBtn'), { code: '⌕' }), c('reset', '초기화', boxCmd('newBtn'), { code: '⟲' })]],
   ['격실', [c('ol', '하부 외곽선', boxCmd('outlineBtn'), { code: '하부 OL' }), c('olu', '상부 외곽선', boxCmd('outlineUpperBtn'), { code: '상부 OL' }), c('olv', '외곽선 검증', boxCmd('outlineVerifyBtn'), { code: 'OL 검증' }), c('vl', '가상선', boxCmd('hullLinkBtn'), { code: 'VL' }), c('area', '면적', boxCmd('measureBtn'), { code: 'AR' }), c('apoly', '면적 POLY', boxCmd('areaPolygonBtn'), { code: 'AP' }),
    c('roomNo', '실 번호', boxCmd('autoRoomNoBtn'), { code: 'RN' }), c('roomFix', '실 지정', boxCmd('manualRoomBtn'), { code: 'RM' }), c('list', '격실 목록', boxCmd('roomBtn'), { code: 'RL' }), c('face', '접한 면적', boxCmd('contactBtn'), { code: 'A6' })]],
   ['검사', [c('lines', '선 검사', boxCmd('lineCheckBtn'), { code: 'CK' }), c('geo', '도형 검사', boxCmd('l4GeometryCheckBtn'), { code: 'GX' }), c('cube', '3D 검사', boxCmd('l4MeshCheckBtn')), c('water', '흘수선', boxCmd('waterlineBtn'))]],
   ['예제', [c('sample', 'S5 예제', boxCmd('s5ExampleBtn'), { code: 'S5', title: '5 Deck · 94 공간 · 12 × 8 m' }), c('sample', 'H5 예제', boxCmd('h5ExampleBtn'), { code: 'H5', title: 'KCS 실선 치수 예제' })]]] },
  { id: 'load', name: '부하', view: 'box', groups: () => [
   ['계산', [c('cal', 'CAL 열기', () => act('BOX CAL 여는 중', async () => { await box.load(); await box.openCal(); }), { code: 'CAL', title: '설계 조건·K값·냉난방 부하·OA·AHU' })]],
   ['조건', [c('cond', '설계 조건', boxCal('DC'), { code: 'DC' }), c('bound', '경계 조건', boxCal('BC'), { code: 'BC' })]],
   ['K값', [c('kIso', 'ISO 기준', boxCal('KD'), { code: 'KD' }), c('kApply', 'ISO 적용', boxCal('K7'), { code: 'K7' }), c('kLayer', '구조 계산', boxCal('KC'), { code: 'KC' }), c('check', '구조 적용', boxCal('C✓'), { code: 'C✓' }), c('kUser', '사용자', boxCal('KU'), { code: 'KU' })]],
   ['부하', [c('load', '격실 부하', boxCal('LR'), { code: 'LR' }), c('oa', '신기 (OA)', boxCal('OA'), { code: 'OA' }), c('rh', '리히터', boxCal('RH'), { code: 'RH' })]],
   ['내보내기', [c('xlsxIso', 'ISO 시트', boxCal('I↑'), { code: 'I↑' }), c('xlsx', '미적용 시트', boxCal('N↑'), { code: 'N↑' }), c('sum', 'SUP 요약', boxCal('Σ↑'), { code: 'Σ↑' }), c('xlsxAll', '전체 XLSX', boxCal('LX'), { code: 'LX' }), c('sheet', '격실 시트', boxCal('R↑'), { code: 'R↑' }), c('face', '면적 시트', boxCal('A↑'), { code: 'A↑' })]],
   ['HVAC Grid', [c('contract', '계약 만들기', () => act('BOX 격실·부하 읽는 중', extractContract), { primary: true, title: 'BOX 격실·부하 → 격실 풍량·계통 (③ 풍량·계통으로 이동)' })]]] },
  { id: 'air', name: '풍량·계통', view: 'plan', groups: () => [
   ['풍량 규칙', [{ field: `<label class="field">급기 ΔT (K)<input id="dT" type="number" min="3" max="25" step="1" value="${S.contract?.rules.supplyDeltaTK ?? 10}"></label>` }, c('rule', '적용', () => act(null, applyDeltaT), { disabled: needContract, title: '급기(SA) 풍량 = 올림(냉방 현열 W × 3 ÷ ΔT)' })]],
   ['공조기 위치', [sysField(), c('pin', '위치 지정', () => { S.pickRoot = !S.pickRoot; say(S.pickRoot ? '평면에서 공조기 위치를 클릭하세요 (Esc 취소)' : ''); render(); }, { disabled: () => !curKey(), pressed: () => S.pickRoot }), c('unpin', '지정 해제', () => act(null, clearRoot), { disabled: () => !S.contract?.roots?.[curKey()] })]],
   ['계약', [c('sample', '예제 계약', () => act('예제 계약 여는 중', openSample)), c('open', '열기', () => act(null, openProject)), c('save', '계약 저장', () => download(`hvac-grid-contract-${stamp()}.json`, JSON.stringify(S.contract, null, 1)), { disabled: needContract })]]] },
  { id: 'duct', name: 'RU·덕트', view: 'phg', groups: () => [
   ['HVAC Grid', [sysField(), c('send', 'PHG D로 보내기', () => act('PHG D로 보내는 중', () => sendPlan()), { primary: true, disabled: () => !curKey(), title: 'Deck 격실 도면 + 공조기 + 격실별 RU(풍량)' }), c('auto', '보내기 + AUTO', () => act('AUTO 계산 중', () => autoKey()), { disabled: () => !curKey(), title: 'AUTO → 첫 후보 → 덕트 지정 → 계산 → 압력' }), c('refresh', '결과 읽기', () => act(null, readBack), { disabled: () => !S.active, title: 'PHG D에서 고친 결과를 HVAC Grid로' })]],
   ['계통', [c('root', '공조기', phgCmd('rootBtn'), { code: 'R', title: 'Root · 계통 시작점(공조기) 배치' }), c('ru', 'RU 배치', phgCmd('diffuserBtn'), { code: 'RU' }), c('ruAuto', 'RU 자동', phgCmd('autoDiffuserBtn')), c('flow', '풍량 초안', phgCmd('phgdFlowBtn'))]],
   ['자동 라우팅', [c('zone', '금지 영역', phgText('금지 영역')), c('auto', 'AUTO', phgCmd('autoRouteOpenBtn'), { title: 'AUTO · 편집 가능한 경로 객체 생성 · 덕트 지정으로 덕트화' }), c('cmp', '비교', phgCmd('phgdCompareBtn')), c('set', '설정', phgCmd('phgdAutoSettingsBtn'))]],
   ['덕트', [c('ml', '주 덕트', phgCmd('assignMainLineBtn'), { code: 'ML' }), c('br', '분기', phgCmd('assignBranchBtn'), { code: 'BR' }), c('sbr', '보조 분기', phgCmd('assignSubBranchBtn'), { code: 'SBR' }), c('ad', '덕트 지정', phgCmd('makeDuctBtn'), { code: 'AD' })]],
   ['계산', [c('lines', '선 검사', phgCmd('lineCheckBtn')), c('calc', '계산', phgCmd('calculateBtn'), { title: '풍량과 덕트 크기' }), c('noise', '소음', phgCmd('noiseCalcBtn')), c('press', '압력', phgCmd('pressureCalcBtn'))]],
   ['파일', [c('save', 'JSON 저장', phgCmd('saveJsonBtn')), c('dxfOut', 'DXF 출력', phgCmd('exportDxfBtn')), c('xlsx', 'XLSX', phgCmd('exportXlsxBtn')), c('fit', '전체 보기', phgCmd('zoomAllBtn'))]],
   ['패널', [c('dockL', '왼쪽', () => act(null, async () => { await loadPhg(); phg.click('phgb-left-panel'); }), { pressed: () => phg.loading && S.phgDocked && phg.dockShown('left'), title: 'PHG D 도구·레이어 패널' }), c('dockR', '오른쪽', () => act(null, async () => { await loadPhg(); phg.click('phgb-right-panel'); }), { pressed: () => phg.loading && S.phgDocked && phg.dockShown('right'), title: 'PHG D 프로젝트 상태·검증 패널' })]]] },
  { id: 'review', name: '검토·출력', view: 'report', groups: () => [
   ['덕트망', [c('all', '모든 계통 AUTO', () => act('AUTO 계산 중', () => runAll()), { primary: true, disabled: needContract, title: '모든 Deck·급기 계통을 차례로 PHG D로 보내고 AUTO' }), c('refresh', '결과 읽기', () => act(null, readBack), { disabled: () => !S.active })]],
   ['출력', [c('save', '프로젝트 저장', () => download(`hvac-grid-${stamp()}.json`, projectJson()), { disabled: needContract }), c('csv', '요약 CSV', () => download(`hvac-grid-summary-${stamp()}.csv`, '﻿' + [SUMMARY_HEAD, ...summaryRows()].map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\r\n'), 'text/csv'), { disabled: needContract }), c('contract', '계약 저장', () => download(`hvac-grid-contract-${stamp()}.json`, JSON.stringify(S.contract, null, 1)), { disabled: needContract })]]] }];
 function sysField() {
  const ps = deckPlans();
  return { field: `<label class="field">${esc(deckName(S.deck) || 'Deck')} 급기 계통<select id="sysSel" ${ps.length ? '' : 'disabled'}>${ps.length ? ps.map(p => `<option value="${esc(p.systemId)}" ${p.systemId === S.sys ? 'selected' : ''}>${esc(p.systemId)} · ${fmt(p.designCmh)} CMH</option>`).join('') : '<option>계통 없음</option>'}</select></label>` };
 }
 const stepOf = id => STEPS.find(s => s.id === id);
 async function go(id) {
  S.step = id; S.pickRoot = false; render();
  const view = stepOf(id).view;
  if (view === 'box') await act(box.loading ? null : 'BOX CAL 여는 중', () => box.load());
  if (view === 'phg') await act(phg.loading ? null : 'PHG D 여는 중', async () => { await loadPhg(); const key = curKey(); if (key && S.projects[key] && S.active !== key) await openKey(key); });
 }
 // undo / redo go to the app on screen (each keeps its own history)
 const frameOnScreen = () => ({ box: box.loading && box, phg: phg.loading && phg }[stepOf(S.step).view] || null);

 // ---------- render ----------
 // tab badges: ✓ done, ● n warnings, ↻ n results to redo after a change upstream
 function stepBadge(id) {
  const C = S.contract; if (!C) return '';
  const ps = plans(), stale = ps.filter(p => S.results[p.key]?.stale).length, auto = ps.filter(p => S.results[p.key]?.auto && !S.results[p.key].stale).length;
  const pending = C.rooms.filter(r => !C.loads[r.id].complete).length, assumed = ps.filter(p => p.rootSource.startsWith('assumed')).length;
  const b = (cls, text, tip) => `<span class="badge ${cls}" title="${esc(tip)}">${text}</span>`;
  if (id === 'room') return b('done', '✓', 'BOX 격실을 계약으로 만들었습니다');
  if (id === 'load') return pending ? b('warn', '● ' + pending, `부하 계산 미완료 격실 ${pending}개`) : b('done', '✓', '모든 격실 부하 계산 완료');
  if (id === 'air') return assumed ? b('warn', '● ' + assumed, `공조기 위치가 임시인 계통 ${assumed}개`) : b('done', '✓', '모든 계통 공조기 위치 지정');
  if (id === 'duct') return stale ? b('redo', '↻ ' + stale, `풍량·공조기 위치가 바뀌어 다시 보내야 하는 계통 ${stale}개`) : ps.length && auto === ps.length ? b('done', '✓', '모든 계통 AUTO 완료') : auto ? b('warn', `${auto}/${ps.length}`, `AUTO 완료 ${auto}/${ps.length} 계통`) : '';
  return '';
 }
 function steps() {
  $('steps').innerHTML = STEPS.map((s, i) => `<button class="step" role="tab" data-step="${s.id}" aria-selected="${s.id === S.step}" title="${esc(s.name)} · Alt+${i + 1}"><b>${i + 1}</b>${s.name}${stepBadge(s.id)}</button>`).join('');
  const f = frameOnScreen(), name = f === box ? 'BOX' : 'PHG D';
  $('undoBtn').disabled = $('redoBtn').disabled = !f;
  $('undoBtn').title = f ? `실행 취소 (${name} 편집 기록)` : '실행 취소 — 도면 단계(①②④)에서'; $('redoBtn').title = f ? `다시 실행 (${name} 편집 기록)` : '다시 실행 — 도면 단계(①②④)에서';
 }
 function ribbon() {
  const groups = stepOf(S.step).groups(); let n = 0; const runs = [];
  $('ribbon').innerHTML = groups.map(([cap, items]) => `<div class="grp"><div class="btns">${items.map(it => {
   if (it.field) return it.field;
   runs.push(it); const dis = typeof it.disabled === 'function' ? it.disabled() : it.disabled, pr = it.pressed?.();
   const tip = [it.title ? `${it.label} · ${it.title}` : it.label, it.code && `이전 단축: ${it.code}`].filter(Boolean).join('\n');
   return `<button class="cmd${it.primary ? ' primary' : ''}" data-i="${n++}" title="${esc(tip)}" ${dis ? 'disabled' : ''} ${pr != null ? `aria-pressed="${!!pr}"` : ''}>${icon(it.icon)}<span>${esc(it.label)}</span></button>`;
  }).join('')}</div><div class="cap">${esc(cap)}</div></div>`).join('');
  $('ribbon').querySelectorAll('.cmd').forEach(b => b.onclick = () => runs[+b.dataset.i].run());
  const sel = $('sysSel'); if (sel) sel.onchange = () => { S.sys = sel.value; S.pickRoot = false; if (S.step === 'duct') act(null, async () => { const k = curKey(); if (S.projects[k]) await openKey(k); }); else render(); };
 }
 // the value column follows the step: m² (rooms), W (loads), CMH (airflow onwards); system colours from ③ on
 const VALUE = { room: ['m²', (r, C) => r.areaM2 ? r.areaM2.toFixed(1) : ''], load: ['W', (r, C) => fmt(C.loads[r.id].coolingSensibleW)] }, CMH = ['CMH', (r, C) => C.airflow[r.id].supplyCmh || ''];
 function tree() {
  if (!S.contract) {
   $('chips').innerHTML = ''; $('treeCount').textContent = '';
   $('tree').innerHTML = `<div class="hint">② 부하 단계에서 <b>계약 만들기</b>를 누르면 BOX의 Deck·격실이 여기에 나타납니다.<br><button class="btn" id="treeSample">예제 계약 열기 (S5)</button></div>`;
   $('treeSample').onclick = () => act('예제 계약 여는 중', openSample); return;
  }
  const C = S.contract, q = $('q').value.trim().toLowerCase(), [unit, value] = VALUE[S.step] || CMH, dots = !VALUE[S.step];
  const filters = { all: ['전체', () => true], sup: ['급기', r => r.systems.supply], exh: ['배기', r => r.systems.exhaust], pending: ['부하 미완료', r => !C.loads[r.id].complete] };
  $('chips').innerHTML = Object.entries(filters).map(([k, [l, f]]) => `<button class="chip" data-f="${k}" aria-pressed="${S.filter === k}">${l} ${C.rooms.filter(f).length}</button>`).join('');
  $('chips').querySelectorAll('button').forEach(b => b.onclick = () => { S.filter = b.dataset.f; render(); });
  let count = 0;
  $('tree').innerHTML = `<div class="colhead"><span>번호</span><span>실명</span><span>${unit}</span></div>` + [...C.decks].reverse().map(d => {
   const rooms = C.rooms.filter(r => r.deckId === d.id).filter(r => (!q || `${r.no} ${r.name}`.toLowerCase().includes(q)) && filters[S.filter][1](r));
   count += rooms.length; const open = d.id === S.deck;
   return `<div class="deck"><button class="deckh" data-deck="${esc(d.id)}" aria-expanded="${open}">${open ? '▾' : '▸'} ${esc(d.name)} <small>Z ${fmt(d.elevationMm)} · ${rooms.length}실</small></button>${open ? rooms.map(r => `<button class="room" data-room="${esc(r.id)}" aria-selected="${r.id === S.room}" title="${esc(r.no)} ${esc(r.name)}${r.isoClass ? ' · ISO 분류 ' + esc(r.isoClass) : ''}"><span class="no">${esc(r.no)}</span><span class="nm">${dots ? `<span class="dot" style="background:${r.systems.supply ? sysColor(r.systems.supply) : 'transparent'};${r.systems.supply ? '' : 'border:1px solid var(--line)'}"></span>` : ''}${esc(r.name)}</span><span class="cmh">${value(r, C)}</span></button>`).join('') : ''}</div>`;
  }).join('');
  $('treeCount').textContent = count + '실';
  $('tree').querySelectorAll('.deckh').forEach(e => e.onclick = () => { S.deck = e.dataset.deck; S.room = null; pickSystem(); render(); if (S.step === 'duct') act(null, async () => { const k = curKey(); if (k && S.projects[k]) await openKey(k); }); });
  $('tree').querySelectorAll('.room').forEach(e => e.onclick = () => selectRoom(e.dataset.room));
 }
 function selectRoom(id) {
  const r = S.contract.rooms.find(x => x.id === id); S.room = id;
  if (r.systems.supply && deckPlans().some(p => p.systemId === r.systems.supply) && !(S.step === 'duct' && S.active)) S.sys = r.systems.supply;
  if (S.step === 'duct' && phg.loading && S.active?.startsWith(r.deckId + '__')) phg.zoomTo(r.polygon.map(p => ({ x: p.x, y: -p.y })), 1500);
  render();
 }
 function plan() {
  const C = S.contract, svg = $('plan'), rooms = C.rooms.filter(r => r.deckId === S.deck); if (!rooms.length) { svg.innerHTML = ''; return; }
  const xs = rooms.flatMap(r => r.polygon.map(p => p.x)), ys = rooms.flatMap(r => r.polygon.map(p => -p.y));
  const minX = Math.min(...xs) - 900, maxX = Math.max(...xs) + 900, minY = Math.min(...ys) - 900, maxY = Math.max(...ys) + 900;
  svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  // sizes in screen px: k = px per mm of the fitted plan
  const rc = svg.getBoundingClientRect(), k = Math.min(rc.width / (maxX - minX), rc.height / (maxY - minY)) || 0.08, px = v => v / k, cur = S.sys;
  let html = '', sel = '';
  for (const r of rooms) {
   const sup = r.systems.supply, bx = r.polygon.map(p => p.x), by = r.polygon.map(p => -p.y), x0 = Math.min(...bx), y0 = Math.min(...by), wPx = (Math.max(...bx) - x0) * k, hPx = (Math.max(...by) - y0) * k;
   const pts = r.polygon.map(p => p.x + ',' + -p.y).join(' '), fill = sup ? sysColor(sup) + (sup === cur ? '38' : '1a') : 'transparent';
   html += `<polygon class="rm" data-room="${esc(r.id)}" points="${pts}" fill="${fill}"><title>${esc(r.no)} ${esc(r.name)} · 급기 ${C.airflow[r.id].supplyCmh} CMH</title></polygon>`;
   // labels pinned to the top-left corner inside the room (RUs and the unit sit at the centre); narrow rooms keep only the number
   if (wPx >= 28 && hPx >= 18) {
    html += `<text class="lbl no" x="${x0 + px(6)}" y="${y0 + px(17)}" style="font-size:${px(12)}px">${esc(r.no)}</text>`;
    if (wPx >= 64 && hPx >= 36 && C.airflow[r.id].supplyCmh) html += `<text class="lbl" x="${x0 + px(6)}" y="${y0 + px(32)}" style="font-size:${px(11)}px">${C.airflow[r.id].supplyCmh} CMH</text>`;
   }
   if (r.id === S.room) sel = `<polygon class="selhalo" points="${pts}"/><polygon class="selline" points="${pts}"/>`;
  }
  html += sel;
  // air handling units: filled = set by the user, dashed = a guess (fan room / corridor end), fixed 20 px on screen
  for (const p of deckPlans()) {
   const col = sysColor(p.systemId), on = p.systemId === cur, user = p.rootSource === 'user', s = px(on ? 22 : 18), x = p.root.x - s / 2, y = -p.root.y - s / 2;
   html += `<g opacity="${on ? 1 : .6}"><rect class="root${user ? '' : ' guess'}" x="${x}" y="${y}" width="${s}" height="${s}" rx="${px(3)}" ${user ? `fill="${col}" stroke="${col}"` : `stroke="${col}"`}><title>${esc(p.systemId)} 공조기 · ${esc(rootText(p.rootSource))}</title></rect><text class="ahu${user ? '' : ' guess'}" x="${p.root.x}" y="${-p.root.y + px(3)}" text-anchor="middle" style="font-size:${px(8)}px">AHU</text></g>`;
  }
  svg.innerHTML = html; svg.classList.toggle('picking', S.pickRoot);
  svg.querySelectorAll('.rm').forEach(e => e.onclick = ev => { if (S.pickRoot) return; ev.stopPropagation(); selectRoom(e.dataset.room); });
  svg.onclick = ev => { if (!S.pickRoot) return; const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); setRoot({ x: q.x, y: -q.y }); render(); };
  const sys = [...new Set(rooms.map(r => r.systems.supply).filter(Boolean))].sort();
  $('legend').innerHTML = `<b>${esc(deckName(S.deck))} 급기 계통</b><br>${sys.map(id => `<span class="dot" style="background:${sysColor(id)}"></span>${esc(id)} · ${fmt(C.systems.find(s => s.id === id && s.kind === 'supply')?.designCmh)} CMH`).join('<br>')}<br><span class="muted">AHU 채움 = 지정 · 점선 = 임시 위치</span>`;
 }
 function report() {
  const rows = plans(), head = SUMMARY_HEAD.map(h => `<th>${esc(h)}</th>`).join(''), body = summaryRows().map((r, i) => { const k = rows[i].key, res = S.results[k] || {};
   const cls = !res.at ? 'muted' : res.stale ? 'warn' : res.auto ? 'ok' : '';
   return `<tr data-key="${esc(k)}" class="${k === S.active ? 'active' : ''}" title="두 번 클릭: ④ RU·덕트에서 열기">${r.map((v, j) => `<td class="${j === 10 ? cls : j === 4 && res.at && res.flowCmh !== rows[i].designCmh ? 'warn' : j === 2 && /임시/.test(v) ? 'warn' : ''}">${typeof v === 'number' ? fmt(v) : esc(v)}</td>`).join('')}</tr>`; }).join('');
  const C = S.contract, pending = C.rooms.filter(r => !C.loads[r.id].complete).length, assumed = rows.filter(p => p.rootSource.startsWith('assumed')).length;
  const unconnected = Object.values(S.results).reduce((t, r) => t + (r.unconnected || 0), 0), done = rows.filter(p => S.results[p.key]?.auto && !S.results[p.key].stale).length;
  const check = (ok, text) => `<tr><td class="${ok ? 'ok' : 'warn'}">${ok ? '✓' : '●'}</td><td>${text}</td></tr>`;
  $('report').innerHTML = `<h3>덕트망 요약 — Deck·급기 계통별 PHG D 프로젝트</h3><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
   <h3>검토</h3><table class="checks"><tbody>${check(!pending, `부하 계산 미완료 격실 ${pending}개`)}${check(!assumed, `공조기 위치 임시 ${assumed}/${rows.length} 계통 — ③ 풍량·계통에서 지정`)}${check(done === rows.length, `AUTO 완료 ${done}/${rows.length} 계통`)}${check(!unconnected, `연결 안 된 RU ${unconnected}개`)}${check(true, '방화 구획 관통(SOLAS) — 다음 단계(H4)')}</tbody></table>`;
  $('report').querySelectorAll('tbody tr[data-key]').forEach(tr => tr.ondblclick = () => { const p = rows.find(x => x.key === tr.dataset.key); S.deck = p.deckId; S.sys = p.systemId; go('duct'); });
 }
 function inspector() {
  const C = S.contract;
  if (!C) { $('inspTitle').textContent = '속성'; $('insp').innerHTML = `<div class="card"><h4>시작</h4><span class="muted">① BOX에서 도면을 열고(또는 S5 예제) ② CAL로 부하를 계산한 뒤 <b>계약 만들기</b>를 누르세요. 저장한 HVAC Grid 프로젝트는 위쪽 열기 버튼으로 엽니다.</span></div>`; return; }
  const r = C.rooms.find(x => x.id === S.room);
  if (!r) {
   const rooms = C.rooms.filter(x => x.deckId === S.deck), sum = k => rooms.reduce((t, x) => t + (C.airflow[x.id][k] || 0), 0);
   $('inspTitle').textContent = 'Deck ' + deckName(S.deck);
   $('insp').innerHTML = `<div class="card"><h4>Deck 요약</h4><div class="kv"><span>격실</span><span>${rooms.length}</span><span>냉방 현열</span><span>${fmt(rooms.reduce((t, x) => t + C.loads[x.id].coolingSensibleW, 0))} W</span><span>급기(SA) 합계</span><span>${fmt(sum('supplyCmh'))} CMH</span><span>배기(EA) 합계</span><span>${fmt(sum('exhaustCmh'))} CMH</span></div></div>`
    + deckPlans().map(p => { const res = S.results[p.key];
     return `<div class="card${p.key === S.active ? ' active' : ''}"><h4><span><span class="dot" style="background:${sysColor(p.systemId)}"></span>${esc(p.systemId)}</span>${p.key === S.active ? '<span class="from">PHG D에 열림</span>' : ''}</h4><div class="kv"><span>설계 풍량</span><span>${fmt(p.designCmh)} CMH</span><span>RU</span><span>${p.rus.length}개</span><span>공조기 위치</span><span class="${p.rootSource.startsWith('assumed') ? 'warn' : ''}">${esc(rootText(p.rootSource))}</span>${res?.at ? `<span>덕트</span><span>${res.ducts}개 · ${res.lengthM} m</span><span>최대 압력손실</span><span>${res.indexPa ?? '—'} Pa</span><span>상태</span><span class="${res.stale ? 'warn' : 'ok'}">${res.stale ? '다시 보내기 필요' : res.auto ? 'AUTO 완료' : 'RU 배치'}</span>` : ''}</div></div>`; }).join('');
   return;
  }
  // fixed card order: 형상 → 부하 → 풍량 → 계통 → RU·덕트; the card of the current step is marked
  const L = C.loads[r.id], A = C.airflow[r.id], pl = deckPlans().find(p => p.systemId === r.systems.supply), rus = pl ? pl.rus.filter(u => u.roomId === r.id) : [], res = pl && S.results[pl.key];
  const now = { room: 'geo', load: 'load', air: 'air', duct: 'duct', review: 'duct' }[S.step], card = (id, title, from, body) => `<div class="card${id === now ? ' now' : ''}"><h4>${title}<span class="from">${from}</span></h4>${body}</div>`;
  $('inspTitle').innerHTML = `${esc(r.no)} ${esc(r.name)}`;
  $('insp').innerHTML = card('geo', '형상', 'BOX', `<div class="kv"><span>면적</span><span>${r.areaM2.toFixed(1)} m²</span><span>체적</span><span>${r.volumeM3.toFixed(1)} m³</span><span>ISO 분류</span><span>${esc(r.isoClass || '—')}</span></div>`)
   + card('load', '부하', 'BOX CAL', `<div class="big">${fmt(L.coolingSensibleW)} W</div><div class="muted">냉방 현열</div><div class="kv" style="margin-top:6px"><span>냉방 잠열</span><span>${fmt(L.coolingLatentW)} W</span><span>냉방 합계</span><span>${fmt(L.coolingW)} W</span><span>난방</span><span>${fmt(L.heatingW)} W</span><span>최소 신기(OA)</span><span>${fmt(L.minFreshAirCmh)} CMH</span><span>상태</span><span class="${L.complete ? 'ok' : 'warn'}">${esc(L.status || (L.complete ? '완료' : '미완료'))}</span></div>`)
   + card('air', '풍량', 'HVAC Grid', `<div class="kv"><span>급기(SA)</span><span><b>${fmt(A.supplyCmh)}</b> CMH</span><span>배기(EA)</span><span>${fmt(A.exhaustCmh)} CMH</span><span>환기(RA)</span><span>${fmt(A.returnCmh)} CMH</span></div><div class="muted" style="margin-top:6px">급기 = 올림(냉방 현열 W × 3 ÷ ΔT ${C.rules.supplyDeltaTK} K)<br>배기 = 올림(환기 횟수 × 체적)</div>`)
   + card('sys', '계통', '', `<div class="kv"><span>급기(SA)</span><span>${r.systems.supply ? `<span class="dot" style="background:${sysColor(r.systems.supply)}"></span>${esc(r.systems.supply)}` : '—'}</span><span>배기(EA)</span><span>${esc(r.systems.exhaust || '—')}</span><span>환기(RA)</span><span>${esc(r.systems.return || '—')}</span></div>`)
   + (pl ? card('duct', 'RU·덕트', 'PHG D', `<div class="kv"><span>이 실의 RU</span><span>${rus.length}개 · ${fmt(rus.reduce((t, u) => t + u.flowCmh, 0))} CMH</span>${res?.at ? `<span>계통 덕트</span><span>${res.lengthM} m</span><span>계통 최대 압력손실</span><span>${res.indexPa ?? '—'} Pa</span>` : '<span>덕트</span><span class="muted">아직 없음</span>'}</div>`) : '');
 }
 function center() {
  const view = stepOf(S.step).view, noContract = !S.contract && (view === 'plan' || view === 'report' || view === 'phg');
  $('boxFrame').style.visibility = view === 'box' ? 'visible' : 'hidden';
  $('phgFrame').style.visibility = view === 'phg' && !noContract ? 'visible' : 'hidden';
  show($('plan'), view === 'plan' && !noContract); show($('legend'), view === 'plan' && !noContract); show($('report'), view === 'report' && !noContract);
  show($('empty'), noContract);
  if (noContract) {
   $('empty').innerHTML = `<div><b>아직 계약이 없습니다</b>BOX의 격실·부하를 HVAC Grid 계약으로 만들어야 풍량·계통과 덕트 단계를 쓸 수 있습니다.<br><button class="btn primary" id="emptyGo">② 부하에서 계약 만들기</button><button class="btn" id="emptySample">예제 계약 열기 (S5)</button></div>`;
   $('emptyGo').onclick = () => go('load'); $('emptySample').onclick = () => act('예제 계약 여는 중', openSample);
  }
  if (view === 'plan' && S.contract) plan();
  if (view === 'report' && S.contract) report();
 }
 function status() {
  const C = S.contract, sup = C ? C.systems.filter(s => s.kind === 'supply') : [], r = C?.rooms.find(x => x.id === S.room);
  const done = plans().filter(p => S.results[p.key]?.auto && !S.results[p.key].stale).length;
  $('status').innerHTML = (C ? `<span>선박 전체: Deck <b>${C.decks.length}</b> · 격실 <b>${C.rooms.length}</b> · 급기 <b>${sup.length}</b>계통 <b>${fmt(sup.reduce((t, s) => t + s.designCmh, 0))}</b> CMH · 덕트망 <b>${done}</b>/${plans().length}</span><span>선택: <b>${esc(deckName(S.deck))}</b>${r ? ` · ${esc(r.no)} ${esc(r.name)}` : ''}</span>` : '<span>계약 없음 — ① 도면 → ② 부하 → 계약 만들기</span>')
   + (S.active ? `<span>PHG D: <b>${esc(S.active.replace('__', ' · '))}</b></span>` : '') + `<span class="msg${S.msgErr ? ' err' : ''}" role="status">${esc(S.msg)}</span>`;
  $('proj').textContent = C ? `${C.source?.project || '계약'} · ${C.rooms.length}실` : '계약 없음';
 }
 function render() { steps(); ribbon(); tree(); center(); inspector(); status(); $('main').classList.toggle('left-off', S.leftOff === true); $('main').classList.toggle('right-off', S.rightOff === true); }

 // ---------- wiring ----------
 $('steps').onclick = e => { const b = e.target.closest('.step'); if (b) go(b.dataset.step); };
 $('q').oninput = () => tree();
 $('leftToggle').onclick = () => { S.leftOff = !S.leftOff; render(); };
 $('rightToggle').onclick = () => { S.rightOff = !S.rightOff; render(); };
 $('undoBtn').onclick = () => act(null, () => frameOnScreen()?.click('undoBtn'));
 $('redoBtn').onclick = () => act(null, () => frameOnScreen()?.click('redoBtn'));
 $('openProjectBtn').onclick = () => act(null, openProject);
 $('saveProjectBtn').onclick = () => S.contract ? download(`hvac-grid-${stamp()}.json`, projectJson()) : say('저장할 계약이 없습니다', true);
 $('themeBtn').onclick = () => { const d = document.documentElement, dark = d.dataset.theme !== 'dark'; d.dataset.theme = dark ? 'dark' : ''; try { localStorage.setItem('hvac-grid-theme', dark ? 'dark' : ''); } catch {} if (S.step === 'air') plan(); };
 try { if (localStorage.getItem('hvac-grid-theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch {}
 // Alt+1..5 switch steps, also while the focus is inside a vendor frame
 const onKey = e => {
  if (e.altKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); go(STEPS[+e.key - 1].id); return true; }
  if (e.key === 'Escape' && S.pickRoot) { S.pickRoot = false; say(''); render(); return true; }
  return false;
 };
 document.addEventListener('keydown', onKey); B.onFrameKey = onKey;
 window.addEventListener('resize', () => { if (S.step === 'air' && S.contract) plan(); });
 window.HVACGrid = { S, box, phg, plans, go, openSample, setContract, extractContract, sendPlan, autoKey, readBack, projectJson, render,
  runAll: keys => act('AUTO 계산 중', () => runAll(keys)) };   // with the busy overlay and error message, as from the ribbon
 render(); go('room');
})();
