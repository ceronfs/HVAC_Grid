// HVAC Grid 2.0 shell (V2-3.5-3.8): the model, one history, the recompute table, one canvas and the modules. The shell
// owns the DOM; a module draws through the canvas, fills the panels with HTML and answers with commands
// (app2/modules/README.md). No vendor window (G3): the duct engine runs in Web Workers (app/duct-pool.js).
//   window.HG2 (for tests and the console): { open(data, name), sample(name), model(), go(step), act(mod, name, arg, value), auto(), state }
'use strict';
(async function () {
 const $ = id => document.getElementById(id), UI = window.HG2UI;
 let L;
 try { L = await HG2Loader.load('../'); } catch (e) { $('empty').textContent = '라이브러리를 읽지 못했습니다: ' + e.message; return; }
 const V = L('lib/io/v1.cjs'), S = L('lib/model/schema.cjs'), C = L('lib/model/commands.cjs'), RUN = L('lib/model/run.cjs'), PL = L('lib/engines/geometry/plan.cjs');
 const MODS = Object.fromEntries((window.HG2Modules || []).map(m => [m.id, m]));
 const STEPS = [{ n: 1, id: 'rooms', name: '데크·격실' }, { n: 2, id: null, name: '부하', off: '부하 엔진은 V2-4 — 지금은 1.x 파일의 부하' }, { n: 3, id: 'airflow', name: '풍량·계통' }, { n: 4, id: 'ducts', name: 'RU·덕트' }, { n: 5, id: 'review', name: '검토·출력' }];
 // which layers each step shows (others can be switched on in the layer box)
 const SHOW = { 1: ['rooms'], 3: ['rooms', 'air', 'transfer', 'units'], 4: ['rooms', 'ducts', 'rus', 'units'], 5: ['rooms', 'fire', 'ducts', 'pens'] };
 const st = { model: null, name: '', step: 3, deck: null, filter: 'deck', sel: null, mstate: {}, status: [], layersOn: null, busy: false, msg: '', err: false, pool: null, history: C.createHistory() };
 const canvas = new HG2Canvas.Canvas($('canvas'), { onPick: (hit, pt) => pick(hit, pt), onDrag: (hit, pt, phase) => drag(hit, pt, phase), onView: () => {} });
 const layers = Object.values(MODS).flatMap(m => m.layers.map(l => ({ ...l, mod: m.id })));
 const mod = () => MODS[STEPS.find(s => s.n === st.step)?.id] || MODS.rooms;

 // ---------- context the modules see ----------
 const deckZ = id => st.model?.decks.find(d => d.id === id)?.z ?? 0;
 function deckAlpha(id) {
  if (id === st.deck) return 1; if (st.filter === 'deck') return 0;
  if (st.filter === 'all') return 0.3;
  const order = [...st.model.decks].sort((a, b) => a.z - b.z).map(d => d.id), i = order.indexOf(st.deck), j = order.indexOf(id);
  return Math.abs(i - j) === 1 ? 0.3 : 0;   // 'near': the decks right above and below
 }
 const ctxOf = m => ({ model: st.model, L, ui: UI, step: st.step, deck: st.deck, filter: st.filter, sel: st.sel, state: st.mstate[m.id] || (st.mstate[m.id] = {}), deckAlpha, status: st.status });

 // ---------- feedback ----------
 let toastT = 0;
 function say(text, err = false) { st.msg = text || ''; st.err = err; if (err && text) { const t = $('toast'); t.textContent = text; t.classList.toggle('err', true); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 5000); } status(); }
 function busy(text) { st.busy = !!text; $('busy').hidden = !text; $('busyText').textContent = text || ''; }

 // ---------- running results ----------
 async function recompute(kind, group) {
  if (!st.model || kind === 'none') return;
  const auto = kind === 'auto';
  if (auto && !st.pool && window.HVACGridDuct) { try { st.pool = await HVACGridDuct.createPool({ base: '../' }); } catch (e) { console.warn('워커 없이 계산', e); } }
  let done = 0, total = 0;
  const pool = auto && st.pool ? { run: jobs => { total = jobs.length; return st.pool.run(jobs, { onDone: () => busy(`AUTO ${++done}/${total} (워커 ${st.pool.threads}개)`) }); } } : null;
  const t0 = performance.now();
  busy(auto ? 'AUTO 계산 중' : '다시 계산 중');
  try {
   st.model = await RUN.recompute(st.model, { skip: auto ? [] : ['networks'], pool, history: st.history, group, onStep: s => busy(`${auto ? 'AUTO' : '다시 계산'}: ${s.id}${s.count > 1 ? ' ' + s.count : ''}`) });
   st.status = RUN.state(st.model);
   if (auto) say(`AUTO 끝 · ${total || 'CPU'}계획 · ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } finally { busy(null); }
 }

 // ---------- one answer of a module ----------
 async function apply(m, out) {
  if (!out) return render();
  if (out.error) { say(out.say, true); return render(); }
  if (out.state) Object.assign(st.mstate[m.id] || (st.mstate[m.id] = {}), out.state);
  if ('select' in out) st.sel = out.select;
  if (out.deck) { st.deck = out.deck; fitDeck(); }
  if (out.say != null) say(out.say);
  if (out.file === 'save') return save();
  if (out.download) download(out.download.name, out.download.data, out.download.type);
  const group = st.history.group();
  if (out.cmd) {
   // what would not change anything is not a command (a field's change event can come twice)
   const ops = out.cmd.ops.filter(op => JSON.stringify(C.get(st.model, op.path)) !== JSON.stringify(op.value));
   if (!ops.length && out.run !== 'auto') return render();
   if (ops.length) { st.model = st.history.run(st.model, { ...out.cmd, ops }, { writes: m.writes, group }); say(out.cmd.label); }
  }
  if (out.run) await recompute(out.run, group);
  render();
 }
 const guard = fn => async (...a) => { if (st.busy) return; try { await fn(...a); } catch (e) { console.error(e); busy(null); say(e.message || String(e), true); render(); } };
 const act = guard(async (id, name, arg, value) => { const m = id === 'shell' ? null : MODS[id]; if (!m) return shellAct(name, arg, value); await apply(m, m.act(ctxOf(m), name, arg, value)); });
 const pick = guard(async (hit, pt) => { const m = mod(); await apply(m, m.pick ? m.pick(ctxOf(m), hit, pt) : { select: hit?.kind === 'room' ? { kind: 'room', id: hit.id } : null }); });
 const drag = guard(async (hit, pt, phase) => { const m = mod(); if (!m.drag) return; const out = m.drag(ctxOf(m), hit, pt, phase); if (phase === 'end') await apply(m, out); });

 // ---------- files ----------
 function download(name, data, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
 async function open(data, name = '') {
  busy('여는 중');
  try {
   let m, notes = [];
   if (data?.schema === S.SCHEMA) ({ model: m, notes } = S.clean(data));
   else { ({ model: m, notes } = V.fromV1(data)); m = await RUN.recompute(m, { upTo: 'plans' }); m = RUN.adoptV1(m); }
   m = await RUN.recompute(m, { skip: ['networks'] });
   st.model = m; st.name = name; st.history.clear(); st.sel = null; st.status = RUN.state(m);
   st.deck = [...m.decks].sort((a, b) => a.z - b.z).find(d => m.rooms.some(r => r.deckId === d.id))?.id || null;
   const left = st.status.filter(s => s.id === 'networks' && s.state !== 'fresh').length;
   say(`${name || '모델'} · Deck ${m.decks.length} · 격실 ${m.rooms.length}${left ? ` · AUTO 필요 ${left}계획` : ''}${notes.length ? ' · ' + notes.join(' · ') : ''}`);
   if (st.step < 3) st.step = 3;
   render(); fitDeck();
  } finally { busy(null); }
 }
 function save() {
  const m = { ...st.model, savedAt: new Date().toISOString() };
  download(`${(st.name || 'HVAC_Grid').replace(/\.(box\.)?json$/i, '').replace(/\.hg2$/, '')}.hg2.json`, JSON.stringify(m));
  st.model = m; say('모델 저장 — HVAC Grid 2.0 (원본 DXF는 담지 않음)');
 }
 async function sample(name) { const r = await fetch(`../samples/${name}.contract.json`); if (!r.ok) throw new Error(name + ' 예제 없음'); await open(await r.json(), name.toUpperCase()); }
 async function shellAct(name, arg) {
  if (name === 'open') { $('file').click(); return; }
  if (name === 'sample') return sample(arg);
  if (name === 'save') return save();
  if (name === 'filter') { st.filter = arg; render(); }
 }
 $('file').onchange = guard(async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; let data; try { data = JSON.parse(await f.text()); } catch { throw new Error(f.name + ': JSON이 아닙니다'); } await open(data, f.name); });

 // ---------- view ----------
 // after the panels have their size (the ribbon changes height with the step)
 function fitDeck() { const rooms = st.model?.rooms.filter(r => r.deckId === st.deck) || []; if (rooms.length) requestAnimationFrame(() => { canvas.resize(); canvas.fit(PL.bounds(rooms.flatMap(r => r.polygon))); }); }
 function go(n) { if (!STEPS.find(s => s.n === n && !s.off)) return; st.step = n; st.layersOn = null; st.sel = st.sel?.kind === 'room' ? st.sel : null; render(); }
 const layerOn = l => (st.layersOn || SHOW[st.step] || []).includes(l.id);

 function render() {
  const m = st.model, cur = mod();
  $('steps').innerHTML = STEPS.map(s => `<button class="step" role="tab" data-step="${s.n}" aria-selected="${s.n === st.step}"${s.off ? ` disabled title="${UI.esc(s.off)}"` : ''}><b>${'①②③④⑤'[s.n - 1]}</b>${UI.esc(s.name)}</button>`).join('');
  $('proj').textContent = m ? `${st.name || '모델'} · ${m.decks.find(d => d.id === st.deck)?.name || ''}` : '모델 없음';
  const lbl = st.history.labels(); $('undo').disabled = !st.history.canUndo; $('redo').disabled = !st.history.canRedo; $('undo').title = `실행 취소${lbl.undo ? ': ' + lbl.undo : ''} (Ctrl+Z)`; $('redo').title = `다시 실행${lbl.redo ? ': ' + lbl.redo : ''} (Ctrl+Y)`;
  const file = UI.group('파일', [UI.button('open', '열기', { title: '1.x 프로젝트·설계 데이터 또는 2.0 모델 (JSON)' }), UI.button('sample', 'T3 시험선', { v: 't3' }), UI.button('sample', 'S5 예제', { v: 's5' }), UI.button('save', '저장', { disabled: !m })]);
  $('ribbon').innerHTML = `<div data-mod="shell" class="rg-wrap">${file}</div>` + (m ? `<div data-mod="${cur.id}" class="rg-wrap">${cur.ribbon ? cur.ribbon(ctxOf(cur)) : ''}</div>` : '');
  $('empty').hidden = !!m;
  if (!m) { $('tree').innerHTML = ''; $('insp').innerHTML = ''; $('layers').innerHTML = ''; $('dock').hidden = true; canvas.setLayers([]); status(); return; }
  $('tree').innerHTML = MODS.rooms.tree(ctxOf(MODS.rooms));
  $('inspTitle').textContent = cur.title; $('insp').innerHTML = `<div data-mod="${cur.id}">${cur.inspector ? cur.inspector(ctxOf(cur)) : ''}</div>`;
  const tbl = cur.table ? cur.table(ctxOf(cur)) : ''; $('dock').hidden = !tbl; $('table').innerHTML = `<div data-mod="${cur.id}">${tbl}</div>`;
  $('layers').innerHTML = `<div data-mod="shell"><select data-act="filter" title="다른 Deck">${[['deck', '이 Deck만'], ['near', '위·아래 Deck 흐리게'], ['all', '모든 Deck 흐리게']].map(([v, t]) => `<option value="${v}"${st.filter === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>`
   + layers.map(l => `<label><input type="checkbox" data-layer="${l.id}"${layerOn(l) ? ' checked' : ''}>${UI.esc(l.title)}</label>`).join('');
  canvas.setLayers(layers.map(l => ({ ...l, visible: layerOn(l), draw: (g, c) => l.draw(g, ctxOf(MODS[l.mod])), hit: l.hit ? (c, pt, tol) => l.hit(ctxOf(MODS[l.mod]), pt, tol) : null })));
  canvas.setContext({});
  status();
 }
 function status() {
  const m = st.model, checks = m ? Object.values(MODS).flatMap(x => x.checks ? x.checks(ctxOf(x)) : []) : [];
  // AUTO left is the ducts module's to say; anything else not up to date is a recompute that did not run
  const late = st.status.filter(s => s.state === 'stale' && s.id !== 'networks');
  $('status').innerHTML = `<span class="${st.err ? 'err' : 'msg'}">${UI.esc(st.msg)}</span>${checks.map(k => `<span class="lv-${k.level}">${UI.esc(k.text)}</span>`).join('')}${late.length ? `<span class="warn">다시 계산 필요: ${late.map(s => s.id).join(', ')}</span>` : ''}<span style="margin-left:auto">${canvas.drawMs != null ? `그리기 ${canvas.drawMs} ms` : ''}</span>`;
 }

 // ---------- events ----------
 const owner = el => el.closest('[data-mod]')?.dataset.mod;
 document.addEventListener('click', e => {
  const s = e.target.closest('.step'); if (s && !s.disabled) return go(+s.dataset.step);
  const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return;
  act(owner(b), b.dataset.act, b.dataset.arg ? JSON.parse(b.dataset.arg) : undefined);
 });
 document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.layer) { const on = new Set(st.layersOn || SHOW[st.step]); if (el.checked) on.add(el.dataset.layer); else on.delete(el.dataset.layer); st.layersOn = [...on]; return render(); }
  if (el.dataset.act) act(owner(el), el.dataset.act, el.dataset.arg ? JSON.parse(el.dataset.arg) : undefined, el.value);
 });
 $('q').oninput = e => { (st.mstate.rooms || (st.mstate.rooms = {})).q = e.target.value; render(); };
 const undo = guard(async () => { if (!st.history.canUndo) return; const l = st.history.labels().undo; st.model = st.history.undo(st.model); st.status = RUN.state(st.model); say('실행 취소: ' + (l || '')); render(); });
 const redo = guard(async () => { if (!st.history.canRedo) return; const l = st.history.labels().redo; st.model = st.history.redo(st.model); st.status = RUN.state(st.model); say('다시 실행: ' + (l || '')); render(); });
 $('undo').onclick = undo; $('redo').onclick = redo;
 addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (st.model) save(); }
  else if (e.altKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); go(+e.key); }
  else if (e.key === 'Escape') { for (const s of Object.values(st.mstate)) delete s.picking; st.sel = null; say(''); render(); }
 });

 window.HG2 = { open: guard(open), sample: guard(sample), model: () => st.model, go, act, auto: () => act('ducts', 'auto'), state: st, canvas, L, history: st.history };
 render();
})();
