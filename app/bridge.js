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

 // ---- BOX CAL Enhance ----
 const BOX_CSS = `header.top,.app>.summary{display:none!important}
.app{grid-template-rows:minmax(0,1fr)!important;border:0!important}`;
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
  hasDrawing() { const s = this.win.CAD_APP?.st; return !!(s && s.entities.length && s.decks.length); }
  calStatus() { return this.doc.querySelector('#calEnhancePanel [role=status]')?.textContent || ''; }
  calIdle() { const b = this.doc.querySelector('#calEnhancePanel .cal-enhance-busy'); return !b || b.hidden; }
  // BOX keeps its model revision private, so the shell fingerprints the drawing the CAL panel was loaded from
  drawingSig() {
   const s = this.win.CAD_APP.st, text = JSON.stringify([s.entities, s.decks, [...(s.roomOverrides || [])]]);
   let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
   return text.length + ':' + (h >>> 0);
  }
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
    this.calSig = this.drawingSig(); this.watchCalCommits();
   }
   const d = panel().querySelector('iframe').contentDocument, w = d.defaultView;
   // popups go through the shell window, which holds the user's click, so a popup blocker lets them through
   if (!w.__hvacGridOpen) { w.__hvacGridOpen = true; w.open = (...a) => window.open(...a); }
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
  async cal(code) {
   if (!this.hasDrawing()) throw new Error('BOX에 Deck·격실이 없습니다. 도면을 열거나 예제를 불러오세요.');
   const id = CAL_IDS[code], d = await this.openCal(), e = d.getElementById(id);
   if (!e) throw new Error('BOX CAL: 명령 ' + code + ' 없음'); e.click();
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

 window.HVACGridBridge = { wait, until, loadLibs, Box, Phg };
})();
