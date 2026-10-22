// HVAC Grid shell <-> vendor apps. Both apps run unmodified (vendor/ copies) in same-origin frames; this file hides their
// own command bars, runs their native commands, moves data between them and reads results back. Needs the local server
// (tools/serve.cjs): browsers do not let a page script into file:// frames.
'use strict';
(() => {
 const wait = ms => new Promise(r => setTimeout(r, ms));
 async function until(test, timeoutMs = 60000, what = '응답') {
  const t = performance.now();
  for (;;) { let v; try { v = test(); } catch { v = null; } if (v) return v; if (performance.now() - t > timeoutMs) throw new Error(what + ' 대기 시간 초과'); await wait(100); }
 }

 // lib/*.cjs are CommonJS for node tests; the shell runs the same files through this small loader. All files are
 // fetched first, then require('./x.cjs' | './x.json') resolves among them (evaluated once, on first use).
 async function loadLibs(base, files) {
  const texts = Object.fromEntries(await Promise.all(files.map(async f => {
   const r = await fetch(base + f, { cache: 'no-store' }); if (!r.ok) throw new Error(f + ' 읽기 실패 (' + r.status + ')'); return [f, await r.text()]; })));
  const done = {};
  const require = name => {
   const f = name.replace(/^\.\//, ''); if (f in done) return done[f];
   if (!(f in texts)) throw new Error('lib 모듈 없음: ' + name);
   if (f.endsWith('.json')) return (done[f] = JSON.parse(texts[f]));
   const module = { exports: {} }; done[f] = module.exports;
   new Function('module', 'exports', 'require', texts[f] + '\n//# sourceURL=' + base + f)(module, module.exports, require);
   return (done[f] = module.exports);
  };
  return Object.fromEntries(files.filter(f => f.endsWith('.cjs')).map(f => [f.replace('.cjs', ''), require(f)]));
 }

 // JSON with sorted keys and without time stamps (save and calculation times), for comparing two saves of one project
 const canonical = v => JSON.stringify(v, (k, x) => typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(x) ? undefined : x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(n => [n, x[n]])) : x);
 class VendorFrame {
  constructor(frame, { url, css, ready }) { Object.assign(this, { frame, url, css, readyTest: ready }); this.loading = null; }
  get win() { return this.frame.contentWindow; }
  get doc() { return this.frame.contentDocument; }
  // loads the app once; later calls return the same promise
  load() {
   if (this.loading) return this.loading;
   this.loading = new Promise((resolve, reject) => {
    this.frame.addEventListener('load', async () => {
     try {
      const style = this.doc.createElement('style'); style.id = 'hvac-grid-embed'; style.textContent = this.css; this.doc.head.appendChild(style);
      // the app's own short buttons get Korean tooltips (the app keeps its labels and code)
      try { this.tips?.(this.doc); } catch {}
      await until(() => this.readyTest(this.win), 180000, this.frame.title + ' 로딩');
      // shell shortcuts (Alt+1..5, Esc) keep working while the focus is inside the app
      this.doc.addEventListener('keydown', e => { if (window.HVACGridBridge.onFrameKey?.(e)) e.stopPropagation(); }, true);
      resolve(this);
     } catch (e) { reject(e); }
    }, { once: true });
    this.frame.src = this.url;
   });
   return this.loading;
  }
  // native command by element id, or by the button text inside a container
  click(id) { const e = this.doc.getElementById(id); if (!e) throw new Error(`${this.frame.title}: 명령 ${id} 없음`); e.click(); }
  clickText(selector, text) {
   const e = [...this.doc.querySelectorAll(selector)].find(b => b.textContent.trim() === text);
   if (!e) throw new Error(`${this.frame.title}: 명령 ${text} 없음`); e.click();
  }
  // a file picked in the shell goes into the app's own file input, as if the user had picked it there
  setFile(inputId, file) {
   const input = this.doc.getElementById(inputId), dt = new this.win.DataTransfer();
   dt.items.add(new this.win.File([file], file.name, { type: file.type, lastModified: file.lastModified }));
   input.files = dt.files; input.dispatchEvent(new this.win.Event('change', { bubbles: true }));
  }
 }

 // ---- BOX and CAL table windows ----
 // BOX writes every table (격실 목록, 설계 조건, K값, 격실 부하, …) into one window of its own ("loadcal-table"). The shell
 // opens that window - so a popup blocker lets the user's click through - and dresses it like the app: app/popup.css,
 // the logo, the shell's theme, Korean titles and button labels. BOX reads the title and the RST / ↻ button text, so
 // those are relabelled on screen (data-hg-*), never rewritten.
 const POPUP_TITLES = [[/^Face Area Table$/, () => '접한 면적'], [/^격실 리스트/, t => t.replace('격실 리스트', '격실 입력')], [/^격실 목록/, t => t],
  [/^설계조건$/, () => '설계 조건'], [/^BC · /, t => t.replace('BC · ', '경계 조건 · ')], [/^ISO 7547 K DATA$/, () => 'ISO 기준 K값 · ISO 7547'],
  [/^KC 구조 계산 DATA$/, () => 'LY · 구조 레이어 K값'], [/^사용자 K DATA$/, () => '사용자 K값'], [/^개별 격실 부하계산 결과$/, () => '격실 부하'],
  [/^SUP별 시스템 신기량/, t => '신기 (OA) · ' + t], [/^LOAD · AHU Main Heater \/ 격실 Reheater$/, () => '리히터 · AHU 메인 히터 / 격실 리히터']];
 const POPUP_BUTTONS = { RST: ['새로 고침', '표를 지금 도면·조건으로 다시 읽기'], '↻': ['새로 고침', '표를 지금 도면·조건으로 다시 읽기'], NEW: ['새로 작성', '새 사용자 K 구조 작성'], XLSX: ['XLSX 저장', '이 표를 XLSX 파일로 저장'], '×': [null, '닫기 (Esc)'],
  FIT: ['맞춤', '표를 창 폭에 맞춤'], '⛶': ['전체 화면', '창 최대화 / 복원'] };
 // the body BOX draws (and draws again on every filter or room change): long notes fold, figures line up
 const NOTES = '.table-notes,.k-data-notes,.design-grid-intro', NUMBER = /^[-+]?[\d,]*\.?\d+\s*(%|㎡|㎥|m²|m³|mm|m|W\/㎡|W\/m²|W\/CMH|W|kW|CMH|Pa|℃|°C|K|h)?$/;
 function dressBody(d) {
  for (const n of d.querySelectorAll(NOTES)) {
   // only plain notes fold: one with inputs or a table in it (창호 일사 조건 in 격실 부하) stays open
   if (n.dataset.hgFold || n.scrollHeight < 40 || n.querySelector('input,select,textarea,table,button')) continue;
   n.dataset.hgFold = '1'; n.classList.add('hg-fold');
   const b = d.createElement('button'); b.type = 'button'; b.className = 'hg-more'; b.textContent = '자세히 ▾';
   b.onclick = () => { const open = n.classList.toggle('hg-open'); b.textContent = open ? '접기 ▴' : '자세히 ▾'; };
   n.after(b);
  }
  // a number - typed in an input or not - sits right, as in a spreadsheet
  for (const td of d.querySelectorAll('table.popup-table td:not([data-hg-n])')) {
   td.dataset.hgN = ''; const f = td.querySelector('input:not([type=checkbox]):not([type=radio]),select');
   if (f ? f.tagName === 'INPUT' && NUMBER.test(String(f.value).trim()) : NUMBER.test(td.textContent.trim())) td.classList.add('hg-num');
  }
 }
 const popups = new Set(); let popupCss = null;
 function dressPopup(w) {
  let d; try { d = w.document; } catch { return false; }
  const title = d?.getElementById('modalTitle'), head = d?.querySelector('.detached-head');
  if (!title || !head) return false;
  if (!d.getElementById('hvac-grid-popup')) { const s = d.createElement('style'); s.id = 'hvac-grid-popup'; s.textContent = popupCss || ''; d.head.appendChild(s); }
  d.documentElement.dataset.theme = document.documentElement.dataset.theme || '';
  if (!head.querySelector('.hg-logo')) { const img = d.createElement('img'); img.className = 'hg-logo'; img.alt = ''; img.src = new URL('logo-64.png', location.href).href; title.before(img); }
  const relabel = () => {
   const t = title.textContent.trim(), m = POPUP_TITLES.find(([re]) => re.test(t)), shown = m ? m[1](t) : t;
   if (shown !== t) title.dataset.hgLabel = shown; else delete title.dataset.hgLabel;
   d.title = `${shown || '표'} — HVAC Grid`;
   for (const b of head.querySelectorAll('.btn')) { const l = POPUP_BUTTONS[b.textContent.trim()]; if (l?.[0]) b.dataset.hgLabel = l[0]; else delete b.dataset.hgLabel; if (l?.[1]) b.title = l[1]; }
  };
  relabel();
  if (!head.__hgObserved) { head.__hgObserved = true; new w.MutationObserver(relabel).observe(head, { subtree: true, childList: true, characterData: true }); }
  const body = d.getElementById('modalBody');
  if (body && !body.__hgObserved) {
   body.__hgObserved = true; let queued = false;
   new w.MutationObserver(() => { if (queued) return; queued = true; w.requestAnimationFrame(() => { queued = false; dressBody(d); }); }).observe(body, { subtree: true, childList: true });
   // Esc closes (not while typing), Ctrl+F goes to the table's search
   d.addEventListener('keydown', e => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(d.activeElement?.tagName || '');
    if (e.key === 'Escape' && !typing) { e.preventDefault(); d.getElementById('modalClose')?.click(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { const q = d.querySelector('.excel-toolbar input'); if (q) { e.preventDefault(); q.focus(); q.select(); } }
   });
  }
  dressBody(d);
  return true;
 }
 function openPopup(...a) {
  const w = window.open(...a); if (!w) return w;
  popups.add(w);
  // BOX writes the window right after it opens; it is dressed once its head is there
  const t0 = performance.now(), dress = () => { if (w.closed || dressPopup(w) || performance.now() - t0 > 8000) return; setTimeout(dress, 40); };
  (popupCss != null ? Promise.resolve() : fetch('popup.css', { cache: 'no-store' }).then(r => r.text()).then(t => { popupCss = t; }, () => { popupCss = ''; })).then(() => setTimeout(dress, 0));
  return w;
 }
 // the shell's theme changed: the open table windows follow
 function themePopups() { for (const w of popups) { if (w.closed) { popups.delete(w); continue; } try { w.document.documentElement.dataset.theme = document.documentElement.dataset.theme || ''; } catch {} } }

 // ---- BOX CAL Enhance ----
 // CAL runs in BOX's CAL panel; the shell keeps that panel out of sight - every command of it is on the ② ribbon and its
 // tables open in their own window - and shows its status itself
 const BOX_CSS = `header.top,.app>.summary{display:none!important}
.app{grid-template-rows:minmax(0,1fr)!important;border:0!important}
#calEnhancePanel{visibility:hidden!important;pointer-events:none!important}
/* ③ ④: BOX's canvas is the background of the HVAC Grid layer - the walls and BOX's room labels stay, BOX's room
   fills, selection, tools and status step aside (the side columns keep their width so the canvas does not move) */
html.hg-bg #roomZoneLayer,html.hg-bg #roomHighlightLayer,html.hg-bg #gripLayer,html.hg-bg #previewLayer,html.hg-bg #osnapLayer,
html.hg-bg #olWorkflowOverlay,html.hg-bg #l4DiagnosticsOverlay{display:none!important}
html.hg-bg .main>.side,html.hg-bg #canvas>.viewbar,html.hg-bg #canvas>.status{visibility:hidden!important}
html.hg-bg.hg-duct #roomLabelLayer{opacity:.4}
html.hg-bg #gridRect,html.hg-bg #gridMajorRect{display:none!important}`;
 const CAL_APPLY = new Set(['K7', 'C✓']);
 // CAL commands on CAL's settings alone - the K values (ISO 기준, ISO 적용, LY, LY 적용, 사용자) and the design conditions
 // (project K): they open with no drawing too. CAL then has no rooms; BOX keeps the settings for the drawing opened next
 // (a DXF keeps them, an example or a BOX project brings its own)
 const CAL_SETTINGS = new Set(['DC', 'KD', 'K7', 'KC', 'C✓', 'KU']);
 const CAL_IDS = { RL: 'roomBtn', A6: 'contactBtn', DC: 'designConditionsBtn', BC: 'faceBoundaryBtn', KD: 'kDataBtn', K7: 'iso7547KBtn', KC: 'calculatedKBtn', 'C✓': 'calculatedKApplyBtn', KU: 'userKBtn',
  LR: 'roomLoadResultBtn', OA: 'systemFreshAirBtn', RH: 'ahuHeatingBtn', 'R↑': 'exportRoomSheetBtn', 'A↑': 'exportFaceSheetBtn', 'I↑': 'exportRoomLoadSheetBtn', 'N↑': 'exportNonIsoRoomLoadSheetBtn', 'Σ↑': 'exportSystemSummaryBtn', LX: 'loadSheetBtn' };
 class Box extends VendorFrame {
  constructor(frame) { super(frame, { url: '../vendor/BOX_CAL_Enhance.html', css: BOX_CSS, ready: w => w.CAD_APP && w.document.getElementById('s5ExampleBtn') }); }
  tips(doc) {
   const set = (sel, t) => doc.querySelectorAll(sel).forEach(e => { e.title = t; e.setAttribute('aria-label', t); });
   for (const [tool, t] of Object.entries({ text: 'TX · 문자 입력·수정', select: '선택', move: 'MV · 이동', trim: 'TR · 자르기 (기준선 클릭 → 자를 선 클릭)', extend: 'EX · 연장 (기준선 클릭 → 늘일 선 클릭)', split: 'SP · 나누기 (기준선 클릭 → 나눌 선 클릭)' })) set(`[data-tool="${tool}"]`, t);
   for (const [id, t] of Object.entries({ gripBtn: 'GP · 끝점 잡기(그립) 표시', deleteBtn: '삭제', lineCheckBtn: 'CK · 선·폐합 검사', osnapBtn: 'OS · 객체 스냅: 끝점·중점·중심·교점·수직 (F3)', orthoBtn: '직교 모드 (F8)', gridBtn: '격자 맞춤 (F9)', gridSizeBtn: 'GS · 격자 크기',
    clearBtn: 'CL · 선택 해제', hideBtn: 'HD · 선택 객체 숨기기', restoreBtn: 'RS · 숨긴 객체 복원', zoomBtn: 'ZT · 선택 객체 확대', showLayers: 'SA · 모든 레이어 표시', hideLayers: 'HA · 모든 레이어 숨기기', stackTransformCanvas: 'MV · 캔버스 기준점 이동 다시 시작' })) set('#' + id, t);
  }
  // BOX's own table windows (격실 목록, 접한 면적) open through the shell too, dressed like the app
  async load() { await super.load(); this.theme(); if (!this.win.__hvacGridOpen) { this.win.__hvacGridOpen = true; this.win.open = (...a) => openPopup(...a); } return this; }
  hasDrawing() { const s = this.win.CAD_APP?.st; return !!(s && s.entities.length && s.decks.length); }
  // BOX's own project JSON (drawing, decks, room data, CAL settings, backgrounds), made by BOX's "Save JSON" with the
  // file picker answered in the frame - the HVAC Grid project carries it so ① ② open again with the project
  // (review 2026-10-21 F05). null without a drawing
  async projectJson() {
   await this.load(); if (!this.hasDrawing()) return null;
   const w = this.win, pick = w.showSaveFilePicker, button = this.doc.getElementById('saveBtn'); let text = null, closed = false;
   w.showSaveFilePicker = async () => ({ createWritable: async () => ({ write: async s => { text = (text || '') + (typeof s === 'string' ? s : await new w.Blob([s]).text()); }, close: async () => { closed = true; }, abort: async () => {} }) });
   try { button.click(); await until(() => closed && !button.disabled, 60000, 'BOX JSON'); } finally { w.showSaveFilePicker = pick; }
   return text;
  }
  // the room ids of the BOX drawing (to tell whether it is the drawing a contract was made from)
  roomIds() { try { return this.win.CAD_APP.rooms().map(r => String(r.id)); } catch { return []; } }
  // BOX's own light / dark follows the shell
  theme() { try { this.doc.documentElement.dataset.theme = document.documentElement.dataset.theme || ''; } catch {} }
  // BOX's canvas as the background of ③ ④ (BOX_CSS hg-bg); BOX itself is not changed
  backdrop(on, duct = false) { try { const c = this.doc.documentElement.classList; c.toggle('hg-bg', !!on); c.toggle('hg-duct', !!on && duct); } catch {} }
  // BOX's 2D view moved so a deck (world box) sits inside a strip of the shell's screen (the canvas between the floating
  // panels); zoomed out only, never in. A view change, as a pan / zoom in BOX - the same view in ① ② afterwards
  fitDeck(b, strip, pad = 24) {
   try {
    const A = this.win.CAD_APP, svg = this.doc.getElementById('svg'), r = svg.getBoundingClientRect(), fr = this.frame.getBoundingClientRect(), m = svg.getScreenCTM();
    if (!A || !m || !(r.width > 0)) return false;
    const dw = b.maxX - b.minX, dh = b.maxY - b.minY, k = Math.min(m.a, (strip.right - strip.left - 2 * pad) / dw, (strip.bottom - strip.top - 2 * pad) / dh);
    if (!(k > 0)) return false;
    const cx = (strip.left + strip.right) / 2 - fr.left - r.left, cy = (strip.top + strip.bottom) / 2 - fr.top - r.top;
    Object.assign(A.st.view, { w: r.width / k, h: r.height / k, x: (b.minX + b.maxX) / 2 - cx / k, y: (b.minY + b.maxY) / 2 - cy / k });
    A.render(); return true;
   } catch { return false; }
  }
  // the deck BOX shows - a view change, as a click on BOX's deck card (not selectDeck, which selects the deck's objects)
  showDeck(id) { const A = this.win?.CAD_APP; if (!A || A.st.activeDeck === id || !A.st.decks.some(d => d.id === id)) return false; A.st.activeDeck = id; A.render(); return true; }
  calStatus() { return this.doc.querySelector('#calEnhancePanel [role=status]')?.textContent || ''; }
  calIdle() { const b = this.doc.querySelector('#calEnhancePanel .cal-enhance-busy'); return !b || b.hidden; }
  // BOX keeps its model revision private, so the shell fingerprints the drawing the CAL panel was loaded from
  drawingSig() {
   const s = this.win.CAD_APP.st, text = JSON.stringify([s.entities, s.decks, [...(s.roomOverrides || [])]]);
   let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
   return text.length + ':' + (h >>> 0);
  }
  closeCal() { const p = this.doc?.getElementById('calEnhancePanel'); if (p && this.calIdle()) p.hidden = true; }
  // CAL is open on the drawing BOX holds now
  calCurrent() { const p = this.doc.getElementById('calEnhancePanel'); return !!p && !p.hidden && this.calIdle() && /^(현재 격실|계산 조건 반영)/.test(this.calStatus()) && this.calSig === this.drawingSig(); }
  // the CAL panel is a nested app in its own frame; its commands (LR, OA, ...) open their tables as popup windows.
  // BOX loads the drawing into CAL only when the panel opens, so a panel still open on an earlier drawing (another
  // file, the S5 example after a DXF, an edit in ①) is closed and opened again instead of showing the old rooms
  async openCal() {
   const panel = () => this.doc.getElementById('calEnhancePanel');
   await until(() => this.calIdle(), 180000, 'BOX CAL 계산');
   if (!this.calCurrent()) {
    if (panel()) panel().hidden = true;
    this.calSig = null; this.click('calEnhanceBtn');
    await until(() => this.calIdle(), 180000, 'BOX CAL 계산');
    if (!/^현재 격실/.test(this.calStatus())) throw new Error('BOX CAL: ' + (this.calStatus() || '열지 못했습니다'));
    this.calSig = this.drawingSig(); this.calRooms = +(/^현재 격실 (\d+)개/.exec(this.calStatus())?.[1] || 0); this.watchCalCommits();
   }
   const d = panel().querySelector('iframe').contentDocument, w = d.defaultView;
   // popups go through the shell window, which holds the user's click, so a popup blocker lets them through
   if (!w.__hvacGridOpen) { w.__hvacGridOpen = true; w.open = (...a) => openPopup(...a); }
   return d;
  }
  // a change made inside CAL (conditions, K values) is written back into the drawing; that is not a new drawing
  watchCalCommits() {
   const host = this.win.CAL_ENHANCE_HOST;
   if (!host || host.__hvacGrid) return; host.__hvacGrid = true;
   const commit = host.commit;
   host.commit = (...a) => {
    const same = this.calSig && this.calSig === this.drawingSig(), r = commit.apply(host, a);
    if (same) Promise.resolve(r).then(ok => { if (ok !== false) this.calSig = this.drawingSig(); }, () => {});
    return r;
   };
  }
  // a CAL command; the ones that apply values (K7, C✓) open no window and say how it went only on the hidden CAL
  // status line - that text is returned for the shell to show
  calNeedsDrawing(code) { return !CAL_SETTINGS.has(code); }
  async cal(code) {
   if (!this.hasDrawing() && this.calNeedsDrawing(code)) throw new Error('BOX에 Deck·격실이 없습니다. 도면을 열거나 예제를 불러오세요.');
   const id = CAL_IDS[code], d = await this.openCal(), e = d.getElementById(id);
   if (!e) throw new Error('BOX CAL: 명령 ' + code + ' 없음');
   if (!CAL_APPLY.has(code)) { e.click(); return null; }
   const line = this.doc.querySelector('#calEnhancePanel [role=status]'), before = line.textContent;
   line.textContent = ''; e.click();
   // "… 갱신 중…" first, then how it ended
   const said = await until(() => { const t = line.textContent.trim(); return t && !t.endsWith('…') ? t : null; }, 30000, 'CAL 적용').catch(() => line.textContent.trim() || null);
   if (!said) line.textContent = before;
   return said || '적용함';
  }
  // CAL's rooms for comparing a K change (lib/k-change.cjs): the K mode, the design conditions, each room's design
  // conditions and loads - taken before and after ISO 적용 / LY 적용
  async calSnapshot() {
   await this.openCal();
   const rep = this.doc.querySelector('#calEnhancePanel iframe').contentWindow.CAL_ENHANCE.report(), clone = v => JSON.parse(JSON.stringify(v ?? null));
   const keep = ['id', 'no', 'name', 'deck', 'deckId', 'isoClass', 'polygon', 'holes', 'floor', 'volume', 'ceilingHeight', 'sup', 'exh', 'ret',
    'coolTemp', 'coolingRh', 'heatTemp', 'heatingRh', 'people', 'activity', 'lighting', 'equipW', 'minimumFreshAir', 'loadIncluded', 'windowType', 'windowArea', 'windowK',
    'coolingTransmissionW', 'heatingTransmissionW', 'solarTransmissionW', 'coolingSensibleW', 'coolingLatentW', 'coolingW', 'heatingW', 'minimumFreshAirCmh', 'minimumAch', 'ventilationAirCmh', 'calculationComplete', 'calculationStatus'];
   return { kMode: rep.kMode ?? null, conditions: clone(rep.conditions), decks: clone(this.win.CAD_APP.stack.decks), rooms: rep.loads.map(x => Object.fromEntries(keep.map(k => [k, clone(x[k])]))) };
  }
  // the raw BOX data the contract is built from (the same fields as tools/box-extract.cjs)
  async extract() {
   if (!this.hasDrawing()) throw new Error('BOX에 Deck·격실이 없습니다. 도면을 열거나 예제를 불러오세요.');
   await this.openCal();
   const C = this.doc.querySelector('#calEnhancePanel iframe').contentWindow.CAL_ENHANCE, rep = C.report();
   const keep = ['id', 'no', 'name', 'deck', 'deckId', 'isoClass', 'polygon', 'holes', 'floor', 'volume', 'ceilingHeight', 'sup', 'exh', 'ret',
    'coolingSensibleW', 'coolingLatentW', 'coolingW', 'heatingW', 'minimumFreshAirCmh', 'minimumAch', 'ventilationAirCmh', 'calculationComplete', 'calculationStatus'];
   const clone = v => JSON.parse(JSON.stringify(v));
   return { decks: clone(this.win.CAD_APP.stack.decks), conditions: clone(rep.conditions), rooms: rep.loads.map(x => Object.fromEntries(keep.map(k => [k, clone(x[k] ?? null)]))) };
  }
 }

 // ---- PHG D ----
 const PHG_CSS = `.app>header.topbar,.app>.summary{display:none!important}`;
 class Phg extends VendorFrame {
  constructor(frame) {
   super(frame, { url: '../vendor/DuctConcept_PHG_D.html', css: PHG_CSS, ready: w => w.DuctConceptRouting?.ready && w.LineDesignV2 });
   this.blank = null;
  }
  async load() { await super.load(); this.doc.getElementById('autosaveRecoveryBar')?.remove(); if (!this.blank) this.blank = this.serialize(); this.tips(this.doc); return this; }
  tips(doc) {
   const t = { ORTHO: '직교 그리기 (가로·세로만)', GRID: '격자에 맞춤', GRIP: '끝점 잡기(그립)' };
   doc.querySelectorAll('button').forEach(b => { const k = b.textContent.trim(); if (t[k]) b.title = t[k]; });
  }
  clickMenu(text) { this.clickText('header.topbar button', text); }
  serialize() { return JSON.stringify(this.win.LineDesignV2.serializeTypedProject()); }
  // opened: what PHG D made of a stored project right after loading it (it fills in defaults), the base for changedSince
  open(text, name) { this.win.LineDesignV2.loadTypedProjectJson(text, name); this.win.LineDesignLegacy.renderEverything(); this.fit(); try { this.opened = { text, base: this.serialize() }; } catch { this.opened = null; } }
  fit() { try { this.click('zoomAllBtn'); } catch {} }
  // one deck + supply system from lib/phg-plan.cjs: empty project, room drawing as background, Root and RUs.
  // PHG D shows DXF y upward as screen y downward: app y = -DXF y
  async loadPlan(pl) {
   const w = this.win, L = w.LineDesignLegacy, R = w.DuctConceptRouting;
   this.open(this.blank, pl.key);
   L.setProjectIdentity?.(pl.key, pl.key + '.dxf');
   this.setFile('fileInput', new File([pl.dxf], pl.key + '.dxf', { type: 'application/dxf' }));
   const dialog = await until(() => { const d = this.doc.getElementById('dxfImportOptionsDialog'); return d?.open && d; }, 30000, 'DXF 가져오기 창');
   dialog.querySelector('button[type=submit]').click();
   await until(() => !dialog.open && L.getState().entities.length > 0, 120000, 'DXF 가져오기');
   R.placeRoot({ x: pl.root.x, y: -pl.root.y });
   // exhaust and return networks: PHG D's pressure calculation takes converging (exhaust) fittings from the Root
   const root = L.getState().nodes.find(n => n.type === 'root'); if (root) { root.pressureFlowMode = pl.flowMode || 'supply'; root.memo = `HVAC Grid ${pl.systemId} ${pl.isUnitDeck === false ? '수직 덕트' : '공조기'}`; }
   for (const u of pl.rus) {
    R.placeRu({ x: u.x, y: -u.y, flowCmh: u.flowCmh });
    const s = L.getState(), node = s.nodes.at(-1), ru = s.diffusers.find(d => d.connectedNodeId === node.id);
    if (ru) ru.memo = 'HVAC Grid ' + u.id;
   }
   // restricted rooms the plan does not serve (machinery casing, galley, CO2 room, stair, ...) are PHG D forbidden zones
   // for AUTO (II-2/9.7.2): their outline pulled in 50 mm so a duct may still run along their walls
   L.getState().settings.routingForbiddenZones = (pl.avoid || []).filter(z => z.zone?.length > 2).map((z, i) => ({ id: `HG-${i + 1}`, name: `${z.no} ${z.name} (${z.space})`.slice(0, 80),
    polygon: z.zone.map(p => ({ x: p.x, y: -p.y })), clearanceMm: 0, enabled: true, visible: true, source: 'DRAWN' }))
    // the outside of the deck (open deck, notches, a 10 m frame round the rooms): a duct never leaves the accommodation
    .concat((pl.outside || []).map((z, i) => ({ id: `HG-OUT-${i + 1}`, name: '선체 밖', polygon: z.map(p => ({ x: p.x, y: -p.y })), clearanceMm: 0, enabled: true, visible: false, source: 'DRAWN' })));
   L.renderEverything(); this.fit();
   return this.result();
  }
  // AUTO -> first candidate -> duct assignment -> sizing -> pressure (the same chain as tools/hvac-run.cjs). When no
  // route reaches every RU inside the forbidden zones, AUTO runs again without the outside of the deck (restricted rooms
  // kept; a duct that then strays outside fails the passage check), then with only the outside, then without any, and the
  // result says so (zonesRelaxed: 'outside' | 'rooms' | 'all').
  // pick: which of the good candidates (0 = PHG D's first) - "다른 경로" on the plan steps through them
  async auto({ pick = 0 } = {}) {
   const w = this.win, R = w.DuctConceptRouting, L = w.LineDesignLegacy, t = performance.now(), st = L.getState();
   // a candidate is good when it reaches every RU; the first good one of the three tries wins, else the first one at all
   const zones = st.settings.routingForbiddenZones || [], outer = zones.filter(z => z.id.startsWith('HG-OUT-')), rooms = zones.filter(z => !outer.includes(z));
   const tries = [[zones, false], [rooms, 'outside'], [outer, 'rooms'], [[], 'all']].filter(([z], i) => i === 0 || z.length < zones.length).filter(([z, r], i, all) => i === 0 || r === 'all' || z.length > 0);
   const good = pv => pv?.candidates?.[0] && !pv.candidates[0].unconnectedRuIds?.length;
   let zonesRelaxed = false, pv = null, first = null;
   for (const [z, relaxed] of tries) {
    st.settings.routingForbiddenZones = z;
    try { pv = await R.preview({ timeoutMs: 120000 }); } catch (e) { pv = { reason: e.message }; }
    if (!first && pv.candidates?.[0]) first = { pv, z, relaxed };
    if (good(pv)) { zonesRelaxed = relaxed; break; }
   }
   if (!good(pv) && first) { st.settings.routingForbiddenZones = first.z; zonesRelaxed = first.relaxed; pv = await R.preview({ timeoutMs: 120000 }); }
   const all = pv.candidates || [], goodOnes = all.filter(x => !x.unconnectedRuIds?.length), pool = goodOnes.length ? goodOnes : all, c = pool[pick % Math.max(1, pool.length)];
   if (!c) throw new Error('AUTO 후보 없음: ' + (pv.reason || pv.message || ''));
   await R.applyPreview(c.id);
   st.selectedEntityIds.clear(); for (const e of st.entities) if (e.autoRoute) st.selectedEntityIds.add(e.id); L.renderEverything();
   // duct assignment: ducts appear, or the conversion dialog asks first
   this.click('makeDuctBtn');
   await until(() => st.ducts.length > 0 || this.doc.getElementById('phgb-conversion')?.open, 30000, '덕트 지정');
   const conv = this.doc.getElementById('phgb-conversion'); if (conv?.open) { this.doc.getElementById('phgb-conversion-apply').click(); await until(() => st.ducts.length > 0 && !conv.open, 30000, '덕트 변환'); }
   // sizing: every duct gets a section
   this.click('calculateBtn'); await until(() => st.ducts.every(d => +d.widthMm > 0 || +d.diameterMm > 0), 30000, '덕트 계산');
   st.selectedEntityIds.clear(); L.renderEverything(); this.fit();
   return { ...this.result(), seconds: Math.round((performance.now() - t) / 100) / 10, candidate: c.label, candidates: pool.length, pick: pick % Math.max(1, pool.length), unconnected: c.unconnectedRuIds?.length || 0, zonesRelaxed };
  }
  // a duct's section set by hand (PHG D keeps a manualSize duct as it is when it sizes the rest); null = sized again by
  // PHG D. The network is calculated again (flows, the other sizes, pressure).
  async setDuctSize(ductId, size) {
   const w = this.win, L = w.LineDesignLegacy, st = L.getState(), d = st.ducts.find(x => x.id === ductId);
   if (!d) throw new Error('PHG D에 덕트 ' + ductId + '가 없습니다');
   if (size) Object.assign(d, { manualSize: true, shape: size.diameterMm ? 'round' : 'rect', widthMm: size.widthMm || 0, heightMm: size.heightMm || 0, diameterMm: size.diameterMm || 0 });
   else d.manualSize = false;
   await w.LineDesignV2.calculateTypedNetwork('');
   L.renderEverything();
   return this.result();
  }
  // the project open in PHG D differs from the stored text (edited in PHG D since)
  // content changed since text (a saved project)? PHG D writes keys in another order, new time stamps and default fields
  // when it reloads a project: a project opened from text is compared with what PHG D made of it, in a canonical form
  changedSince(text) { try { const base = this.opened?.text === text ? this.opened.base : text; return canonical(JSON.parse(this.serialize())) !== canonical(JSON.parse(base)); } catch { return false; } }
  // what the inspector and the review table show for the project now open in PHG D
  result() {
   const w = this.win, st = w.LineDesignLegacy.getState(), len = d => d.points.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - d.points[i].x, q.y - d.points[i].y), 0);
   let indexPa = null;
   if (st.ducts.length) try { const paths = w.LineDesignV2.calculateSimplePressure({})?.paths || []; if (paths.length) indexPa = Math.round(Math.max(...paths.map(p => p.totalPressureLossPa))); } catch {}
   return { rus: st.diffusers.length, flowCmh: st.diffusers.reduce((t, d) => t + (+d.flowCmh || 0), 0), roots: st.nodes.filter(n => n.type === 'root').length,
    ducts: st.ducts.length, lengthM: Math.round(st.ducts.reduce((s, d) => s + len(d), 0) / 100) / 10, indexPa,
    ductTypes: st.ducts.reduce((o, d) => (o[d.type] = (o[d.type] || 0) + 1, o), {}) };
  }
  dockShown(side) { const d = this.doc.getElementById(`phgb-${side}-dock`); return !!d && d.getBoundingClientRect().width > 20; }
  // show an area (app coordinates) with a margin in mm
  zoomTo(points, pad = 1000) {
   const w = this.win, v = w.LineDesignLegacy.getState().view, svg = this.doc.getElementById('svg'), rc = svg.getBoundingClientRect(), xs = points.map(p => p.x), ys = points.map(p => p.y);
   const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
   const wd = Math.max(maxX - minX, (maxY - minY) * rc.width / rc.height), h = wd * rc.height / rc.width;
   Object.assign(v, { x: (minX + maxX) / 2 - wd / 2, y: (minY + maxY) / 2 - h / 2, w: wd, h }); svg.setAttribute('viewBox', `${v.x} ${v.y} ${wd} ${h}`); w.LineDesignLegacy.renderEverything();
  }
  // ducts (with their size and airflow), RUs and Root in app coordinates (y down) for the shell's plan view, the SOLAS
  // penetration check and the outputs
  geometry() {
   const s = this.win.LineDesignLegacy.getState(), r = s.nodes.find(n => n.type === 'root'), num = v => Number.isFinite(+v) && +v > 0 ? Math.round(+v) : 0;
   return { root: r ? { x: r.x, y: r.y } : null, rus: s.diffusers.map(d => ({ x: d.x, y: d.y, flowCmh: d.flowCmh })),
    ducts: s.ducts.map(d => ({ id: d.id, displayName: d.displayName || d.id, type: d.type, shape: d.shape, widthMm: d.shape === 'round' ? 0 : num(d.widthMm), heightMm: d.shape === 'round' ? 0 : num(d.heightMm),
     diameterMm: d.shape === 'round' ? num(d.diameterMm) : 0, flowCmh: Math.round(+d.flowCmh || 0), ...(d.manualSize ? { manualSize: true } : {}), points: d.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) })) };
  }
 }

 window.HVACGridBridge = { wait, until, loadLibs, Box, Phg, themePopups };
})();
