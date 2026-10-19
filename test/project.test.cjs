'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const PJ = require('../lib/project.cjs'), PL = require('../lib/phg-plan.cjs'), RP = require('../lib/report.cjs'), XL = require('../lib/xlsx.cjs'), DX = require('../lib/dxf-out.cjs');
const X = require('../lib/dxf-in.cjs'), { readWorkbook } = require('../lib/xlsx-read.cjs'), K = require('../lib/contract.cjs');
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8'));   // a fresh copy per test

// a fake PHG D result for every plan: one L-shaped duct from the Root to each RU, sized 400 x 200 (0.08 m², above the fire damper limit)
function fakeRun(contract) {
 const plans = PL.plan(contract), results = {}, geometry = {}, projects = {};
 for (const p of plans) {
  results[p.key] = { rus: p.rus.length, flowCmh: p.designCmh, ducts: p.rus.length, lengthM: 10, indexPa: 100, auto: true, unconnected: 0, at: 1, sig: PJ.planSig(p), stale: false };
  geometry[p.key] = { ducts: p.rus.map((u, i) => ({ displayName: 'D' + i, type: 'branch', widthMm: 400, heightMm: 200, flowCmh: u.flowCmh, points: [{ x: p.root.x, y: -p.root.y }, { x: u.x, y: -p.root.y }, { x: u.x, y: -u.y }] })) };
  projects[p.key] = '{"schemaVersion":"3.0.0"}';
 }
 return PJ.make({ contract, projects, results, geometry });
}

test('project file: round trip, legacy schema, bare contract, broken input', () => {
 const pr = fakeRun(load('t3.contract.json')), back = PJ.read(JSON.parse(JSON.stringify(pr)));
 assert.equal(back.project.schema, 'hvac-grid-project/1');
 assert.deepEqual(back.project.results, pr.results); assert.deepEqual(Object.fromEntries(Object.entries(back.project.geometry).map(([k, g]) => [k, g.ducts.map(d => d.points)])), Object.fromEntries(Object.entries(pr.geometry).map(([k, g]) => [k, g.ducts.map(d => d.points)]))); assert.deepEqual(Object.keys(back.project.projects), Object.keys(pr.projects));
 const legacy = PJ.read({ ...JSON.parse(JSON.stringify(pr)), schema: 'hvac-grid-project/0' });
 assert.ok(legacy.notes.some(n => /hvac-grid-project\/0/.test(n)));
 assert.equal(PJ.read(load('s5.contract.json')).project.contract.rooms.length, 94);
 // results of plans that no longer exist are dropped, not trusted
 const odd = JSON.parse(JSON.stringify(pr)); odd.projects['X__NOPE'] = '{}'; odd.results['X__NOPE'] = { auto: true };
 const r = PJ.read(odd); assert.ok(!('X__NOPE' in r.project.results)); assert.ok(r.notes.some(n => n.startsWith('X__NOPE')));
 assert.throws(() => PJ.read({ schema: 'something' }), /HVAC Grid/); assert.throws(() => PJ.read(null));
 const bad = JSON.parse(JSON.stringify(pr)); bad.contract.rooms[0].deckId = 'NOPE'; assert.throws(() => PJ.read(bad), /계약 검사/);
});

test('stale results: a changed plan (dT, unit location) marks only the affected results', () => {
 const pr = fakeRun(load('t3.contract.json'));
 assert.equal(PJ.analyze(pr).done, PJ.analyze(pr).total);
 const moved = { ...pr, contract: { ...pr.contract, roots: { 'D4__AHU-BRG': { x: 13000, y: 10000 } } } };
 const fr = PJ.freshResults(moved.contract, moved.results);
 assert.ok(fr['D4__AHU-BRG'].stale); assert.ok(!fr['D1__AHU-ACC'].stale);
 const dT = { ...pr, contract: K.applyRules(pr.contract, { supplyDeltaTK: 12 }) }, fd = PJ.freshResults(dT.contract, dT.results);
 assert.ok(fd['D1__AHU-ACC'].stale, 'supply airflow changed'); assert.ok(!fd['D1__EF-SAN'].stale, 'exhaust unchanged');
});

test('analysis: checks, systems with risers, SOLAS penetrations from the duct geometry', () => {
 const c = load('t3.contract.json'); c.solas = { rooms: Object.fromEntries(c.rooms.filter(r => /트렁크/.test(r.name)).map(r => [r.id, { space: '환기·공조 기계실' }])) };
 const a = PJ.analyze(fakeRun(c));
 assert.equal(a.done, a.total);
 for (const id of ['loads', 'zones', 'units', 'auto', 'connected', 'flow']) assert.equal(a.checks.find(k => k.id === id).level, 'ok', id);
 // the fake ducts run straight from the unit through any room: the restricted ones they pass are failures
 assert.equal(a.checks.find(k => k.id === 'solasPass').level, 'fail'); assert.ok(a.solas.passages.some(p => p.level === 'fail'));
 const acc = a.systems.find(s => s.systemKey === 'AHU-ACC');
 assert.equal(acc.decks.length, 3); assert.equal(acc.risers.length, 2); assert.equal(acc.indexDeckId, 'D3'); assert.ok(acc.indexPa > 100);
 assert.ok(a.solas.penetrations.length > 20); assert.ok(a.solas.summary.fireDampers > 0);
 assert.ok(a.solas.penetrations.every(p => p.no && Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('airflow checks: negative pressure rooms, pending loads', () => {
 const c = load('s5.contract.json'), r = c.rooms.find(x => x.systems.exhaust);
 c.airflow[r.id] = { ...c.airflow[r.id], supplyCmh: c.airflow[r.id].exhaustCmh + 50 }; r.systems.supply = r.systems.supply || 'X'; r.systems.return = null;
 assert.ok(PJ.airChecks(c).some(x => x.roomId === r.id && x.code === 'NEG_PRESSURE'));
 c.loads[c.rooms[0].id].complete = false;
 assert.ok(PJ.airChecks(c).some(x => x.code === 'LOAD_PENDING'));
});

test('integrated XLSX: every sheet readable, rooms and penetrations complete', () => {
 const pr = fakeRun(load('t3.contract.json')), a = PJ.analyze(pr), sheets = RP.sheets(pr, a), bytes = XL.xlsx(sheets);
 const wb = readWorkbook(Buffer.from(bytes));
 assert.deepEqual(Object.keys(wb), sheets.map(s => s.name));
 assert.equal(wb['격실'].length, pr.contract.rooms.length + 1); assert.equal(wb['격실'][0][0], 'Deck');
 assert.ok(['확인 사항', '구역 수지', '계통·팬', '제한 구역 통과', 'SOLAS 점검표'].every(n => n in wb));
 assert.equal(wb['관통 목록'].length, a.solas.penetrations.length + 1);
 assert.equal(wb['수직 덕트'].length, a.risers.length + 1);
 // numbers stay numbers; the summary carries the disclaimer
 assert.equal(typeof wb['계통·팬'][1][5], 'number');
 assert.ok(wb['요약'].some(r => /주관청/.test(r[1] || '')));
 // the same input gives the same bytes (fixed ZIP dates)
 assert.deepEqual(XL.xlsx(sheets), bytes);
});

test('integrated DXF and HTML report', () => {
 const pr = fakeRun(load('t3.contract.json')), a = PJ.analyze(pr);
 const dxf = DX.integratedDxf(pr.contract, { plans: a.plans, geometry: pr.geometry, boundaries: a.solas.boundaries, penetrations: a.solas.penetrations, risers: a.risers });
 assert.match(dxf, /AC1009/); assert.match(dxf, /\r\nEOF\r\n$/); assert.ok(!/LWPOLYLINE/.test(dxf) && !X.pairs(dxf).some(([c]) => c === 5), 'R12: POLYLINE, no handles');
 for (const layer of ['ROOM', 'DUCT_SUPPLY', 'DUCT_EXHAUST', 'DUCT_RETURN', 'RU_SUPPLY', 'UNIT_SUPPLY', 'RISER', 'FIRE_A60', 'FIRE_PEN']) assert.ok(dxf.includes('\r\n8\r\n' + layer + '\r\n'), layer);
 assert.ok(!/[^\x00-\x7F]/.test(dxf), 'text as \\U+ escapes only');
 // rooms read back from the integrated DXF: every room, Korean names restored
 const back = X.rooms(dxf, { roomLayers: /^ROOM$/ });
 assert.equal(back.length, pr.contract.rooms.length);
 const html = RP.html(pr, a);
 assert.match(html, /<svg/); assert.match(html, /주관청/); assert.equal((html.match(/<figure class="page">/g) || []).length, 4);
 assert.match(html, /Content-Security-Policy/); assert.ok(!/<script/i.test(html)); assert.match(html, /미해결 확인 사항/); assert.match(html, /선수 FWD/);
});

test('test drawings: every T3 deck DXF equals the contract (number, name, area)', () => {
 const c = load('t3.contract.json');
 for (const d of c.decks) {
  const r = X.compare(X.rooms(fs.readFileSync(path.join(__dirname, '..', 'samples', 't3', `T3_${d.id}.dxf`), 'utf8')), c, d.id);
  assert.ok(r.ok, `${d.id}: ${JSON.stringify(r).slice(0, 300)}`); assert.deepEqual(r.nameDiffs, []);
 }
 // the drawings HVAC Grid sends to PHG D read back the same, for S5 and T3
 for (const f of ['s5.contract.json', 't3.contract.json']) { const k = load(f); for (const d of k.decks) assert.ok(X.compare(X.rooms(PL.deckDxf(k, d.id)), k, d.id).ok, f + ' ' + d.id); }
});

test('test ship generator: deterministic, BOX format, L-shaped cabins', () => {
 const T = require('../tools/make-test-ship.cjs');
 assert.equal(T.rooms.length, 79); assert.equal(T.rooms.filter(r => r.poly).length, 14);
 const box = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 't3', 'T3.box.json'), 'utf8'));
 assert.equal(box.format, 'NODE-BOX-L4'); assert.equal(box.schemaVersion, 2); assert.equal(box.source.decks.length, 4);
 assert.equal(new Set(box.source.entities.map(e => e.persistentUuid)).size, box.source.entities.length);
 const c = load('t3.contract.json');
 assert.equal(c.rooms.length, 79); assert.ok(c.rooms.every(r => c.loads[r.id].complete), 'BOX computed every room');
 assert.deepEqual(K.validate(c), []);
});

test('review 1: a project file is input - markup in it never reaches the report or the shell as markup', () => {
 const pr = fakeRun(load('t3.contract.json')), k = Object.keys(pr.geometry)[0], evil = JSON.parse(JSON.stringify(pr));
 evil.geometry[k].ducts[0].widthMm = '<img src=x onerror=alert(1)>'; evil.geometry[k].ducts[0].displayName = '<script>x</script>'; evil.geometry[k].ducts[0].points[0].x = '"><svg onload=alert(1)>';
 evil.results[k].indexPa = '<b>1</b>'; evil.results[k].candidate = 'x'.repeat(10000);
 const { project } = PJ.read(evil), g = project.geometry[k].ducts[0];
 assert.equal(g.widthMm, 0); assert.ok(typeof g.points[0].x === 'number' || g.points.length < evil.geometry[k].ducts[0].points.length);
 assert.equal(project.results[k].indexPa, undefined); assert.ok(project.results[k].candidate.length <= 4000);
 const html = RP.html(project, PJ.analyze(project));
 assert.ok(!/<img src=x|<script>x|onload=alert/.test(html));
});

test('review 1: results without a signature are stale; a changed deck drawing makes its plans stale', () => {
 const pr = fakeRun(load('t3.contract.json')), noSig = JSON.parse(JSON.stringify(pr)); for (const r of Object.values(noSig.results)) delete r.sig;
 assert.equal(PJ.analyze(PJ.read({ ...noSig, schema: 'hvac-grid-project/0' }).project).done, 0);
 // move one room of D4 by 100 mm: the D4 plans go stale, the others stay current
 const moved = JSON.parse(JSON.stringify(pr)), r = moved.contract.rooms.find(x => x.deckId === 'D4' && x.no === '409'); r.polygon = r.polygon.map(p => ({ x: p.x, y: p.y - 100 }));
 const fr = PJ.freshResults(moved.contract, moved.results);
 assert.ok(Object.entries(fr).filter(([k]) => k.startsWith('D4__')).every(([, v]) => v.stale)); assert.ok(Object.entries(fr).filter(([k]) => k.startsWith('D1__')).every(([, v]) => !v.stale));
});

test('review 1: BOX reports rooms in ship coordinates (offset and rotated deck) - decks compare directly', () => {
 // fixture: BOX project with deck B moved by (10000, 2000) and turned 90 deg; BOX gave the rooms already transformed
 const c = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 'fixtures', 'offset-deck.contract.json'), 'utf8'));
 const b1 = c.rooms.find(r => r.no === 'B1'), G = require('../lib/geom.cjs').bbox(b1.polygon);
 assert.deepEqual([Math.round(G.minX), Math.round(G.minY), Math.round(G.maxX), Math.round(G.maxY)], [4000, 2000, 10000, 6000]);
 const SO = require('../lib/solas.cjs'), deck = SO.boundaries(c).boundaries.filter(x => x.kind === 'deck');
 assert.ok(deck.some(x => x.roomA === c.rooms.find(r => r.no === 'A2').id && x.roomB === b1.id), 'A2 under B1 in ship coordinates');
});

test('review 1: vendor copies match vendor/VERSIONS.json', () => {
 const crypto = require('crypto'), V = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vendor', 'VERSIONS.json'), 'utf8'));
 for (const [name, v] of Object.entries(V)) if (v && v.sha256_16) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'vendor', name))).digest('hex').slice(0, 16), v.sha256_16, name);
});

test('review 1: the local server serves only the shell folders, survives bad requests, checks the host', async () => {
 const http = require('http'), { start } = require('../tools/serve.cjs'), s = await start();
 const get = (p, host) => new Promise(r => { const q = http.get({ host: '127.0.0.1', port: s.port, path: p, headers: host ? { Host: host } : {} }, res => { res.resume(); r(res.statusCode); }); q.on('error', e => r('ERR ' + e.code)); });
 try {
  assert.equal(await get('/app/'), 200); assert.equal(await get('/%00'), 400); assert.equal(await get('/.git/config'), 404); assert.equal(await get('/out/t3/project.json'), 404);
  assert.equal(await get('/app/%2e%2e/package.json'), 404); assert.equal(await get('/app/', 'evil.example:' + s.port), 421); assert.equal(await get('/lib/geom.cjs'), 200);
 } finally { await s.close(); }
});

test('review 1: CSV cells, safe file names, one-line DXF text', () => {
 const U = require('../lib/util.cjs');
 assert.equal(U.csvCell('=1+2'), "'=1+2"); assert.equal(U.csvCell('a,b'), '"a,b"'); assert.equal(U.csvCell('x\ry'), '"x\ry"'); assert.equal(U.csvCell(12), '12');
 assert.equal(U.safeName('D4__../../EVIL'), 'D4__.._.._EVIL'); assert.ok(!/[\\/:*?"<>|]/.test(U.safeName('a:b*c?"d<e>|f/g\\h')));
 assert.equal(U.dxfText('a\r\nb'), 'a b'); assert.equal(U.dxfText('가', true), '\\U+AC00');
});
