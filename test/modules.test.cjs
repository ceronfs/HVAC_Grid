// Ver 2.0 screen (V2-3.5-3.8): the browser loader holds every library the 2.0 code requires and nothing of 1.0 lib (D7);
// the modules keep their contract (app2/modules/README.md) - they read and write parts of the model, write only through
// commands within `writes`, call no other module - and every layer, panel and action runs on T3 in Node. F-1: the
// airflow module sets the summer rules only.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), LD = require('../app2/loader.js'), CV = require('../app2/canvas.js'), UI = require('../app2/ui.js');
const S = require('../lib/model/schema.cjs'), C = require('../lib/model/commands.cjs'), RUN = require('../lib/model/run.cjs'), V = require('../lib/io/v1.cjs');
const MODS = ['rooms', 'airflow', 'ducts', 'review'].map(id => ({ id, file: path.join(ROOT, 'app2', 'modules', id + '.js'), mod: require(`../app2/modules/${id}.js`) }));

test('loader: the 2.0 libraries are all on the list, none of them 1.0 lib (D7)', () => {
 const seen = new Set(), todo = ['lib/model/run.cjs', 'lib/io/v1.cjs', 'lib/engines/output/report.cjs', 'lib/engines/output/xlsx.cjs', 'lib/engines/output/dxf.cjs', 'lib/engines/output/diagram.cjs', 'lib/engines/output/fireplan.cjs'];
 while (todo.length) {
  const f = todo.pop(); if (seen.has(f)) continue; seen.add(f);
  if (f.endsWith('.json')) continue;
  for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/require\('(\.[^']+)'\)/g)) todo.push(LD.resolve(f, m[1]));
 }
 for (const f of seen) assert.ok(LD.FILES.includes(f), 'not on the loader list: ' + f);
 // 1.0 lib files sit at lib/*.cjs (and lib/solas-data.json); 2.0 lives in lib/model, lib/io, lib/engines, lib/duct
 assert.deepEqual([...seen].filter(f => /^lib\/[^/]+$/.test(f)), [], '2.0 requires 1.0 lib');
 assert.deepEqual(LD.FILES.filter(f => /^lib\/[^/]+$/.test(f)), []);
 // the loader runs the libraries as the browser does
 const texts = Object.fromEntries(LD.FILES.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')])), L = LD.make(texts);
 assert.equal(typeof L('lib/model/run.cjs').recompute, 'function'); assert.equal(L('lib/engines/fire/classify.cjs').SHIPS.length, 4);
});

let model;
const t3 = async () => model || (model = await (async () => { let m = V.fromV1(JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 't3.contract.json'), 'utf8'))).model; m = await RUN.recompute(m, { upTo: 'plans' }); return RUN.recompute(m); })());
const L = p => require(path.join(ROOT, p));
const ctxOf = (m, over = {}) => ({ model: m, L, ui: UI, step: 3, deck: 'D1', filter: 'deck', sel: null, state: {}, deckAlpha: id => id === 'D1' ? 1 : 0, status: RUN.state(m), ...over });

for (const { id, file, mod } of MODS) test(`module ${id}: the contract - parts, no other module, layers and panels run`, async () => {
 const parts = Object.keys(S.PARTS);
 assert.ok(mod.reads.every(p => parts.includes(p)), 'reads: ' + mod.reads.filter(p => !parts.includes(p)));
 assert.ok(mod.writes.every(p => parts.includes(p) && S.PARTS[p].kind === 'input'), 'writes only inputs: ' + mod.writes);
 const src = fs.readFileSync(file, 'utf8');
 assert.equal(src.split('\n').filter(l => l.includes('HG2Modules')).length, 1, 'HG2Modules only on the line that registers it');
 assert.deepEqual([...src.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]).filter(r => r !== '../ui.js'), [], 'requires only app2/ui.js');
 for (const other of MODS) if (other.id !== id) assert.ok(!src.includes(`modules/${other.id}`), 'reads another module');
 const m = await t3(), ctx = ctxOf(m, { step: mod.step });
 for (const l of mod.layers) { const g = CV.recorder(); l.draw(g, ctx); if (l.hit) l.hit(ctx, { x: 0, y: 0 }, 50); }
 for (const k of ['ribbon', 'tree', 'inspector', 'table']) if (mod[k]) assert.equal(typeof mod[k](ctx), 'string', k);
});

// every action a module offers in its HTML, run on T3: a command it gives is applied within its writes
test('modules: every action in the ribbon and panels writes only its parts', async () => {
 const m0 = await t3(), room = m0.rooms.find(r => r.deckId === 'D1' && m0.airflow[r.id].transferInCmh), plan = m0.plans.find(p => p.deckId === 'D1'), done = [];
 for (const { id, mod } of MODS) for (const sel of [null, { kind: 'room', id: room.id }]) {
  const ctx = ctxOf(m0, { step: mod.step, sel }), html = ['ribbon', 'inspector', 'table', 'tree'].map(k => mod[k] ? mod[k](ctx) : '').join('');
  for (const a of html.matchAll(/data-act="([^"]+)"(?: data-arg="([^"]*)")?/g)) {
   const name = a[1], arg = a[2] ? JSON.parse(a[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : undefined;
   if (['save', 'xlsx', 'html', 'dxf', 'fireDxf'].includes(name)) continue;   // outputs: below
   const value = name === 'rule' ? (arg === 'pressurizationBasis' ? 'supply' : '8') : name === 'kind' ? 'exhaust' : name === 'solas' ? (arg === 'ship' ? 'TANK' : arg === 'sprinkler' ? '1' : 'IIC') : '';
   const out = mod.act(ctx, name, arg, value); done.push(`${id}:${name}`);
   if (out?.cmd?.ops.length) C.apply(m0, out.cmd, { writes: mod.writes });
  }
 }
 for (const need of ['airflow:rule', 'airflow:assign', 'airflow:transfer', 'ducts:auto', 'ducts:autoAll', 'review:solas', 'review:space', 'rooms:deck']) assert.ok(done.includes(need), need + ' not offered');
 // outputs from the review module: real files
 const R = MODS.find(x => x.id === 'review').mod, full = { ...m0 };
 for (const k of ['xlsx', 'html', 'dxf', 'fireDxf']) { const out = R.act(ctxOf(full, { step: 5 }), k); assert.ok(out.download.data.length > 1000, k); }
 // picking a root and dragging an RU are commands too
 const A = MODS.find(x => x.id === 'airflow').mod, Dm = MODS.find(x => x.id === 'ducts').mod;
 const pk = A.pick(ctxOf(m0, { state: { picking: true, kind: plan.kind, sys: plan.systemKey } }), null, { x: plan.root.x + 120, y: plan.root.y });
 assert.deepEqual(C.apply(m0, pk.cmd, { writes: A.writes }).model.roots[plan.key], { x: plan.root.x + 100, y: plan.root.y });
 const ru = plan.rus[0], dg = Dm.drag(ctxOf(m0, { step: 4 }), { kind: 'ru', key: plan.key, id: ru.id }, { x: ru.x + 260, y: ru.y }, 'end');
 assert.deepEqual(C.apply(m0, dg.cmd, { writes: Dm.writes }).model.ruMoves[ru.id], { x: ru.x + 300, y: ru.y });
});

test('modules F-1: the airflow module sets the summer rules only - no winter airflow rule can be put in', async () => {
 const m = await t3(), A = MODS.find(x => x.id === 'airflow').mod, html = A.ribbon(ctxOf(m));
 assert.ok(!/heating|winter|겨울 풍량/i.test(html.replace(/겨울은 같은 풍량에 난방 용량/g, '')), 'no winter airflow field');
 assert.equal(A.act(ctxOf(m), 'rule', 'heatingSupplyDeltaTK', '22').error, true);
 assert.equal(A.act(ctxOf(m), 'rule', 'supplyDeltaTK', '20').error, true, 'ΔT above 15 K refused (ISO 7547 6.3)');
});

test('one-file copy (tools/make-single2.cjs): every script and library inside, nothing pointing beside it', () => {
 const M = require('../tools/make-single2.cjs'), page = M.html({ commit: 'test', builtAt: '2026-10-26T00:00:00Z' });
 assert.ok(!/\s(?:src|href)="(?!data:|#)/.test(page));
 for (const f of LD.FILES) assert.ok(page.includes(JSON.stringify(f)), f);
 assert.ok(page.length < 3e6, `${page.length} bytes`);
});
