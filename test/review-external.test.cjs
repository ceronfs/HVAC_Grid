'use strict';
// regressions for the external review of 2026-10-21 (docs/REVIEW_2026-10-21_EXTERNAL.md): F01 F03 F04 F06 F07 F08 F10, A01 A03
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const K = require('../lib/contract.cjs'), PJ = require('../lib/project.cjs'), PL = require('../lib/phg-plan.cjs');
const MO = require('../tools/make-offline.cjs');
const ROOT = path.join(__dirname, '..');
const t3 = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 't3.contract.json'), 'utf8'));

const R = (id, name, x0, y0, x1, y1, sys, l = {}) => ({ id, no: l.no ?? id, name, deckId: 'D', polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor: (x1 - x0) * (y1 - y0) / 1e6,
 volume: (x1 - x0) * (y1 - y0) * 2.8 / 1e6, sup: sys.s, exh: sys.e, ret: sys.r, coolingSensibleW: l.w || 0, minimumFreshAirCmh: l.oa || 0, ventilationAirCmh: l.achAir || 0, calculationComplete: true });
const make = rooms => K.buildContract({ source: {}, decks: [{ id: 'D', z: 0 }], rooms });

test('F01: the offline copy holds every file the app loads (T3 SOLAS settings, vendor versions)', () => {
 assert.deepEqual(MO.missingFiles(), []);
 for (const f of ['samples/t3/T3.solas.json', 'vendor/VERSIONS.json']) assert.ok(MO.FILES.includes(f), f);
});

test('F10: make-offline replaces only a copy it made', () => {
 assert.throws(() => MO.guardOut(ROOT, ROOT), /원본 폴더/);
 assert.throws(() => MO.guardOut(path.dirname(ROOT), ROOT), /원본 폴더/);
 const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-out-'));
 try {
  assert.equal(MO.guardOut(path.join(tmp, 'new'), ROOT), 'new');
  assert.equal(MO.guardOut(tmp, ROOT), 'empty');
  fs.writeFileSync(path.join(tmp, 'HVAC_Grid.bat'), '');
  assert.throws(() => MO.guardOut(tmp, ROOT), /MANIFEST/);                       // a launcher alone does not make a copy
  fs.writeFileSync(path.join(tmp, MO.MANIFEST), JSON.stringify({ kind: MO.KIND }));
  assert.equal(MO.guardOut(tmp, ROOT), 'replace');
  fs.mkdirSync(path.join(tmp, '.git'));
  assert.throws(() => MO.guardOut(tmp, ROOT), /저장소/);                         // never a git work tree
 } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('F03: load numbers must be finite and in range; PJ.read checks what it works out', () => {
 for (const [k, v] of [['coolingSensibleW', 'bad'], ['coolingSensibleW', 1e308], ['heatingW', Infinity], ['minFreshAirCmh', -1], ['achAirCmh', 2e7]]) {
  const c = t3(); const id = c.rooms[0].id; c.loads[id][k] = v;
  assert.ok(K.validate(c).some(p => p.includes(`room ${id}: load ${k}`)), `${k} ${v}`);
  assert.throws(() => PJ.read(c), /설계 데이터 검사 실패/);
 }
 const ok = t3(); ok.loads[ok.rooms[0].id].coolingSensibleW = -120;     // a room colder than its design: allowed
 assert.deepEqual(K.validate(ok), []);
});

test('F04: systems are made from the rooms, not taken from the file', () => {
 const c = t3(), acc = c.systems.find(s => s.id === 'AHU-ACC' && s.kind === 'supply'), sum = acc.designCmh;
 acc.roomIds = []; c.systems.push({ id: 'GHOST', kind: 'supply', deckIds: ['D1'], roomIds: [c.rooms[0].id], designCmh: 999 });
 assert.deepEqual(K.validate(c), []);
 const { project, notes } = PJ.read(c), again = project.contract.systems.find(s => s.id === 'AHU-ACC' && s.kind === 'supply');
 assert.equal(again.designCmh, sum); assert.ok(again.roomIds.length > 0);
 assert.ok(!project.contract.systems.some(s => s.id === 'GHOST'));
 assert.ok(notes.some(n => n.includes('계통 목록')));
 assert.equal(PL.plan(project.contract).length, PL.plan(t3()).length);
});

test('F06: made again from BOX, transfer sources and RU moves carry over for rooms still there', () => {
 const rooms = () => [R('cab', '선실', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 1500 }), R('cor', '복도', 0, 4000, 8000, 6000, { s: 'AHU', r: 'RA' }, { w: 900 }),
  R('wc', '공용화장실', 4000, 0, 6000, 2000, { e: 'EF' }, { achAir: 170 })];
 const old = { ...make(rooms()), transfers: { wc: 'cab' }, ruMoves: { 'AHU/cab/1': { x: 1000, y: 1000 } }, roots: { 'D__supply:AHU': { x: 100, y: 100 } } };
 const next = K.carrySettings(K.applyRules(old), make(rooms()));
 assert.deepEqual(next.transfers, { wc: 'cab' }); assert.equal(next.airflow.wc.transferFrom, 'cab');
 assert.deepEqual(next.ruMoves, old.ruMoves); assert.deepEqual(next.roots, old.roots); assert.deepEqual(K.validate(next), []);
 // the toilet is gone in BOX: its transfer source goes with it
 const fewer = K.carrySettings(old, make(rooms().slice(0, 2)));
 assert.deepEqual(fewer.transfers, {}); assert.deepEqual(K.validate(fewer), []);
});

test('F07: a long plan signature is kept whole; F08: rooms sharing a number get distinct RU ids', () => {
 const long = 'x'.repeat(10000); assert.equal(PJ.cleanResult({ sig: long }).sig.length, 10000);
 const c = t3(), p = PL.plan(c)[0], { project } = PJ.read(PJ.make({ contract: c, results: { [p.key]: { auto: true, sig: PJ.planSig(p) } } }));
 assert.equal(PJ.freshResults(project.contract, project.results)[p.key].stale, false);
 // two rooms numbered 401 on one deck
 const d = make([R('a', '선실', 0, 0, 4000, 4000, { s: 'AHU', r: 'RA' }, { w: 1500, no: '401' }), R('b', '선실', 4000, 0, 8000, 4000, { s: 'AHU', r: 'RA' }, { w: 1500, no: '401' }),
  R('c', '선실', 8000, 0, 12000, 4000, { s: 'AHU', r: 'RA' }, { w: 1500, no: '402' })]);
 const ids = PL.plan(d).flatMap(x => x.rus.map(u => u.id));
 assert.equal(new Set(ids).size, ids.length); assert.ok(ids.some(i => i.includes('/402/')));   // unique numbers keep their ids
});

test('A01: a result whose geometry had to be cut is stale, also after saving again', () => {
 const c = t3(), p = PL.plan(c)[0], pts = Array.from({ length: 501 }, (_, i) => ({ x: i * 10, y: 0 }));
 const file = PJ.make({ contract: c, results: { [p.key]: { auto: true, sig: PJ.planSig(p) } }, geometry: { [p.key]: { root: { x: 0, y: 0 }, rus: [], ducts: [{ id: 'd1', points: pts }] } } });
 const { project, notes } = PJ.read(JSON.parse(JSON.stringify(file)));
 assert.ok(notes.some(n => n.includes('다시 보내기 필요')));
 assert.equal(PJ.freshResults(project.contract, project.results)[p.key].stale, true);
 const again = PJ.read(JSON.parse(JSON.stringify(project))).project;
 assert.equal(PJ.freshResults(again.contract, again.results)[p.key].stale, true);
});

test('A03: the alive / bye endpoints refuse other sites; the server names itself', async () => {
 const { start } = require('../tools/serve.cjs'); let alive = 0, bye = 0;
 const s = await start(0, { onAlive: () => alive++, onBye: () => bye++ });
 try {
  const post = (p, headers = {}) => fetch(s.url + p, { method: 'POST', headers });
  assert.equal((await post('/__alive', { Origin: s.url })).status, 204);
  assert.equal((await post('/__bye', { Origin: 'http://example.com' })).status, 403);
  assert.equal((await post('/__bye', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal(alive, 1); assert.equal(bye, 0);
  assert.equal((await fetch(s.url + '/app/')).headers.get('x-hvac-grid'), '1');
 } finally { await s.close(); }
});
