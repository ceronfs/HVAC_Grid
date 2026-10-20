// T3 BOX project drawn with LINEs: samples/t3/T3.box.json (written by tools/make-test-ship.cjs with RECT / POLY rooms that
// carry the room data) -> the same project with the walls as LINEs only (the walls of the T3 DXFs: each wall once, T-
// junctions) and the room number and name as TEXT; the room data goes to BOX's room overrides. BOX finds rooms drawn
// with lines itself and names them, so BOX is in the loop: load the line drawing, read the room id BOX gives each room
// (by deck and number), attach the data to that id, load again and check every room got its number and its data.
//   node tools/t3-box-lines.cjs [samples/t3/T3.box.json]   (npm run make:t3 runs it after make-test-ship)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const G = require('../lib/geom.cjs'), T = require('./make-test-ship.cjs');
const { launch } = require('./browser.cjs'), { start } = require('./serve.cjs');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'samples', 't3', 'T3.box.json'));

const uuid = s => { const h = crypto.createHash('sha1').update('hvac-grid-t3-lines:' + s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const GEOMETRY = new Set(['type', 'x', 'y', 'w', 'h', 'points', 'closed', 'deck', 'layer', 'id', 'persistentUuid']);

// the room shapes of the RECT / POLY project -> walls, texts and the data of each room
function lineProject(src) {
 const shapes = src.source.entities.filter(e => (e.type === 'RECT' || e.type === 'POLY') && e.roomNo);
 if (!shapes.length) throw new Error('RECT / POLY 실이 없습니다 - make-test-ship.cjs가 쓴 파일이어야 합니다');
 const ents = [], data = new Map();
 for (const d of T.DECKS) {
  T.walls(d.id).forEach((w, i) => ents.push({ type: 'LINE', x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, deck: d.id, layer: w.layer === 'DECK_OUTLINE' ? 'DECK-OUTLINE' : 'ROOM', id: `T3_${d.id}_W${i + 1}`, persistentUuid: uuid(d.id + 'W' + i) }));
  for (const e of shapes.filter(s => s.deck === d.id)) {
   const pts = e.type === 'RECT' ? [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]] : e.points.map(p => [p.x, p.y]);
   const poly = pts.map(([x, y]) => ({ x, y })), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), size = 180;
   // number and name at the top-left corner when it is inside the room (BOX draws y down), else at its interior point
   let at = { x: Math.min(...xs) + 150, y: Math.min(...ys) + 350 };
   if (!G.inside(at, poly) || !G.inside({ x: at.x, y: at.y + size * 1.7 }, poly)) { const c = G.interiorPoint(poly); at = { x: c.x - 600, y: c.y - 200 }; }
   for (const [k, text, y] of [['N', e.roomNo, at.y], ['M', e.roomName, at.y + size * 1.7]])
    ents.push({ type: 'TEXT', x: at.x, y, text, height: size, deck: d.id, layer: k === 'N' ? 'ROOM_NO' : 'ROOM_NAME', id: `T3_${d.id}_${e.roomNo}_${k}`, persistentUuid: uuid(d.id + e.roomNo + k) });
   data.set(`${d.id}|${e.roomNo}`, Object.fromEntries(Object.entries(e).filter(([k]) => !GEOMETRY.has(k))));
  }
 }
 const out = structuredClone(src);
 out.source.entities = ents;
 out.overrides = { ...(out.overrides || {}), roomOverrides: [] };
 out.extensions = { ...out.extensions, t3: { ...(out.extensions?.t3 || {}), drawing: 'LINE walls + TEXT number/name; room data in overrides.roomOverrides by BOX room id' } };
 return { project: out, data, rooms: shapes.length };
}

module.exports = { lineProject };
if (require.main === module) (async () => {
 const src = JSON.parse(fs.readFileSync(FILE, 'utf8'));
 const { project, data, rooms } = lineProject(src);
 const s = await start(0), b = await launch();
 const load = async json => {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } }); p.on('dialog', d => d.accept());
  await p.goto(s.url + '/app/');
  await p.waitForFunction(() => window.HVACGrid && HVACGrid.box.loading, null, { timeout: 60000 });
  await p.waitForFunction(() => HVACGrid.box.readyTest(HVACGrid.box.win), null, { timeout: 180000 });
  await p.evaluate(t => HVACGrid.box.setFile('jsonFile', new File([t], 'T3.box.json', { type: 'application/json' })), JSON.stringify(json));
  await p.waitForFunction(n => HVACGrid.box.hasDrawing() && HVACGrid.box.win.CAD_APP.rooms().length >= n, rooms, { timeout: 180000 }); await p.waitForTimeout(1000);
  const list = await p.evaluate(() => HVACGrid.box.win.CAD_APP.rooms().map(r => ({ id: r.id, no: r.no, deck: r.deckId, name: r.name, sup: r.sup ?? null })));
  await p.close(); return list;
 };
 try {
  // 1 the line drawing alone: the ids BOX gives its rooms
  const first = await load(project);
  const missing = [...data.keys()].filter(k => !first.some(r => `${r.deck}|${r.no}` === k));
  if (first.length !== rooms || missing.length) throw new Error(`BOX가 찾은 실 ${first.length}/${rooms} · 번호 없음 ${missing.slice(0, 5).join(', ')}`);
  project.overrides.roomOverrides = first.map(r => [r.id, data.get(`${r.deck}|${r.no}`)]);
  // the floor of the lowest deck: the engine room below (as T3.solas.json says), not the outside air BOX takes for a floor
  // with no deck under it - BOX's legacy face key room id :: 하 :: OUT
  const lowest = T.DECKS[0].id, key = id => [id, '하', 'OUT'].map(encodeURIComponent).join('::');
  project.overrides.faceBoundaryOverrides = Object.fromEntries(first.filter(r => r.deck === lowest).map(r => [key(r.id), { type: 'NON_AC', label: '최하층 아래 기관실', coolingTemp: 43, heatingTemp: 5 }]));
  // 2 again, with the data: the same ids, every room numbered and named
  const second = await load(project);
  const same = second.length === rooms && second.every(r => first.some(f => f.id === r.id && f.no === r.no && f.deck === r.deck));
  if (!same) throw new Error('다시 읽으면 BOX 실 id가 바뀝니다 - 실 데이터를 붙일 수 없습니다');
  fs.writeFileSync(FILE, JSON.stringify(project, null, 1));
  const types = {}; for (const e of project.source.entities) types[e.type] = (types[e.type] || 0) + 1;
  console.log(JSON.stringify({ out: path.relative(process.cwd(), FILE), rooms: second.length, entities: types, overrides: project.overrides.roomOverrides.length }));
 } finally { await b.close(); await s.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
