// Test drawings: the T3 test ship - a cargo ship accommodation block, 4 decks, 20 x 16 m (bridge deck 12 x 16 m).
// It exercises what S5 does not: systems over several decks with a duct trunk, L-shaped cabins with their own toilets,
// an engine casing through the accommodation (A-60), a galley with its own supply / exhaust (SOLAS II-2/9.7.5),
// exhaust and return systems, rooms the SOLAS dictionary does not know.
//   node tools/make-test-ship.cjs [outDir=samples/t3]
// Writes T3.box.json (a BOX CAL project, the same format as BOX's own S5 example: deck outline LINEs and RECT / POLY
// rooms carrying the room data) and one general-arrangement DXF per deck (T3_<deck>.dxf: deck outline, closed room
// outlines, room number and name) + T3_ALL.dxf (all decks side by side). Synthetic data, not a real ship.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), G = require('../lib/phg-plan.cjs');

const DECKS = [
 { id: 'D1', name: 'UPPER DK', z: 0 }, { id: 'D2', name: 'A DK', z: 2800 }, { id: 'D3', name: 'B DK', z: 5600 }, { id: 'D4', name: 'NAV BRG DK', z: 8400 }];
const HEIGHT = 2800;
const OUTLINE = { D1: [0, 0, 20000, 16000], D2: [0, 0, 20000, 16000], D3: [0, 0, 20000, 16000], D4: [8000, 0, 20000, 16000] };

// room data defaults (BOX field names); use() picks the HVAC systems and the internal loads by room type
const BASE = { coolTemp: 25, coolingRh: 55, heatTemp: 22, heatingRh: 40, sup: '', exh: '', ret: '', lighting: 10, windowArea: 0, people: 0, minimumFreshAir: 0, equipW: 0, minimumAch: 0, isoClass: 'AC' };
const USE = {
 cabin: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 1, minimumFreshAir: 28.8, equipW: 200, windowArea: 0.8 },
 bigCabin: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 2, minimumFreshAir: 57.6, equipW: 400, windowArea: 1.6 },
 // toilets: exhaust only, the make-up air comes from the cabin / corridor (transfer air, door grille)
 cabinWc: { exh: 'EF-SAN', minimumAch: 15, lighting: 8 },
 wc: { exh: 'EF-SAN', minimumAch: 15, lighting: 8 },
 locker: { exh: 'EF-SAN', minimumAch: 10, lighting: 5 },
 corridor: { sup: 'AHU-ACC', ret: 'RA-ACC', isoClass: 'ALLEY_SOUND', lighting: 8 },
 stair: { sup: 'AHU-ACC', lighting: 8 },
 mess: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 16, minimumFreshAir: 460.8, equipW: 800, windowArea: 2.4, lighting: 12 },
 rec: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 8, minimumFreshAir: 230.4, equipW: 600, windowArea: 2.4, lighting: 12 },
 office: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 3, minimumFreshAir: 86.4, equipW: 900, windowArea: 1.2, lighting: 12 },
 gym: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 3, minimumFreshAir: 86.4, equipW: 1200, lighting: 12 },
 pantry: { sup: 'AHU-ACC', exh: 'EF-GAL', minimumAch: 15, equipW: 1500 },
 galley: { sup: 'SF-GAL', exh: 'EF-GAL', minimumAch: 40, people: 3, equipW: 9000, lighting: 15, windowArea: 1.2 },
 laundry: { exh: 'EF-LAU', minimumAch: 20, equipW: 4000 },
 changing: { sup: 'AHU-ACC', exh: 'EF-SAN', minimumAch: 10 },
 none: { lighting: 5 },
 casing: { isoClass: 'ENGINE', lighting: 0 },
 wheel: { sup: 'AHU-BRG', ret: 'RA-BRG', people: 3, minimumFreshAir: 86.4, equipW: 3000, windowArea: 12, isoClass: 'WHEELHOUSE', lighting: 8 },
 brgRoom: { sup: 'AHU-BRG', ret: 'RA-BRG', people: 1, minimumFreshAir: 28.8, equipW: 1500, windowArea: 0.8, lighting: 10 },
 brgEquip: { sup: 'AHU-BRG', ret: 'RA-BRG', equipW: 2500, lighting: 8 },
 brgCorr: { sup: 'AHU-BRG', ret: 'RA-BRG', isoClass: 'ALLEY_SOUND', lighting: 8 },
 brgStair: { sup: 'AHU-BRG', lighting: 8 },
 brgWc: { sup: 'AHU-BRG', exh: 'EF-BRG', minimumAch: 15, lighting: 8 },
 battery: { exh: 'EF-BRG', minimumAch: 12, lighting: 5 }};

const rooms = [];   // { deck, no, name, use, rect:[x0,y0,x1,y1] } or { ..., poly:[[x,y]...] }
const R = (deck, no, name, use, x0, y0, x1, y1) => rooms.push({ deck, no, name, use, rect: [x0, y0, x1, y1] });
const P = (deck, no, name, use, pts) => rooms.push({ deck, no, name, use, poly: pts });
// a cabin bay: L-shaped cabin + its toilet (on the corridor side, wcW x wcD)
function bay(deck, no, name, use, x0, x1, side, wcW = 1600, wcD = 2000) {
 if (side === 'port') {                       // y 0 (ship side) .. 7000 (corridor)
  P(deck, no, name, use, [[x0, 0], [x1, 0], [x1, 7000], [x0 + wcW, 7000], [x0 + wcW, 7000 - wcD], [x0, 7000 - wcD]]);
  R(deck, no + 'T', name + ' 화장실', 'cabinWc', x0, 7000 - wcD, x0 + wcW, 7000);
 } else {                                     // y 9000 (corridor) .. 16000 (ship side)
  P(deck, no, name, use, [[x0, 9000 + wcD], [x0 + wcW, 9000 + wcD], [x0 + wcW, 9000], [x1, 9000], [x1, 16000], [x0, 16000]]);
  R(deck, no + 'T', name + ' 화장실', 'cabinWc', x0, 9000, x0 + wcW, 9000 + wcD);
 }
}
// the core every accommodation deck shares: engine casing, corridor, stair, duct trunk, public toilet
function core(deck, n) {
 R(deck, n + '01', '기관실 케이싱', 'casing', 0, 5500, 4000, 10500);
 R(deck, n + '02', '복도', 'corridor', 4000, 7000, 20000, 9000);
 R(deck, n + '03', '계단실', 'stair', 4000, 9000, 6500, 11500);
 R(deck, n + '04', '덕트 트렁크', 'none', 4000, 11500, 5500, 13000);
 R(deck, n + '06', '공용화장실', 'wc', 4000, 13000, 6500, 16000);
}
// D1 UPPER DK: galley, messes, laundry, CO2 room, AC room (the AHU and the galley fans)
core('D1', '1');
R('D1', '105', '청소도구실', 'locker', 5500, 11500, 6500, 13000);
R('D1', '110', '세탁실', 'laundry', 0, 0, 4000, 3000);
R('D1', '111', 'CO2실', 'none', 0, 3000, 4000, 5500);
R('D1', '112', '탈의실', 'changing', 4000, 0, 6500, 7000);
R('D1', '113', '선원식당', 'mess', 6500, 0, 12000, 7000);
R('D1', '114', '조리실', 'galley', 12000, 0, 16500, 7000);
R('D1', '115', '건식식품창고', 'none', 16500, 0, 20000, 3500);
R('D1', '116', '냉장고', 'none', 16500, 3500, 20000, 7000);
R('D1', '120', '공조기실', 'none', 0, 10500, 4000, 16000);
R('D1', '121', '사관식당', 'mess', 6500, 9000, 12000, 16000);
R('D1', '122', '배식실', 'pantry', 12000, 9000, 14500, 16000);
R('D1', '123', '선원휴게실', 'rec', 14500, 9000, 20000, 16000);
// D2 A DK: crew cabins (5 port, 4 starboard), gym, linen store
core('D2', '2');
R('D2', '205', '청소도구실', 'locker', 5500, 11500, 6500, 13000);
R('D2', '210', '체육실', 'gym', 0, 0, 4000, 5500);
R('D2', '220', '린넨창고', 'none', 0, 10500, 4000, 16000);
for (let k = 0; k < 5; k++) bay('D2', String(211 + k), `선원침실 ${String(k + 1).padStart(2, '0')}`, 'cabin', 4000 + 3200 * k, 7200 + 3200 * k, 'port');
for (let k = 0; k < 4; k++) bay('D2', String(221 + k), `선원침실 ${String(k + 6).padStart(2, '0')}`, 'cabin', 6500 + 3375 * k, 9875 + 3375 * k, 'stbd');
// D3 B DK: officers
core('D3', '3');
R('D3', '305', '린넨로커', 'locker', 5500, 11500, 6500, 13000);
R('D3', '310', '선박사무실', 'office', 0, 0, 4000, 5500);
R('D3', '320', '회의실', 'rec', 0, 10500, 4000, 16000);
bay('D3', '311', '선장실', 'bigCabin', 4000, 10000, 'port'); bay('D3', '312', '기관장실', 'bigCabin', 10000, 16000, 'port'); bay('D3', '313', '일등항해사실', 'cabin', 16000, 20000, 'port');
bay('D3', '321', '일등기관사실', 'cabin', 6500, 11000, 'stbd'); bay('D3', '322', '이등항해사실', 'cabin', 11000, 15500, 'stbd'); bay('D3', '323', '이등기관사실', 'cabin', 15500, 20000, 'stbd');
// D4 NAV BRG DK: wheelhouse and bridge rooms, its own AHU in the bridge fan room
R('D4', '401', '조타실', 'wheel', 14000, 0, 20000, 16000);
R('D4', '402', '복도', 'brgCorr', 8000, 7000, 14000, 9000);
R('D4', '403', '계단실', 'brgStair', 8000, 9000, 10500, 11500);
R('D4', '404', '선교화장실', 'brgWc', 10500, 9000, 12000, 11500);
R('D4', '405', '선교팬룸', 'none', 12000, 9000, 14000, 11500);
R('D4', '406', '배터리실', 'battery', 8000, 0, 11000, 3000);
R('D4', '407', '무선실', 'brgRoom', 8000, 3000, 11000, 7000);
R('D4', '408', '해도실', 'brgRoom', 11000, 0, 14000, 7000);
R('D4', '409', '도선사실', 'cabin', 8000, 11500, 11000, 16000);
R('D4', '410', '항해장비실', 'brgEquip', 11000, 11500, 14000, 16000);
for (const r of rooms) if (r.deck === 'D4' && r.use === 'cabin') r.use = 'brgRoom';

// ---------- BOX project ----------
const uuid = s => { const h = crypto.createHash('sha1').update('hvac-grid-t3:' + s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
function boxProject(template) {
 const ents = [];
 for (const d of DECKS) { const [x0, y0, x1, y1] = OUTLINE[d.id], c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  c.forEach((a, i) => { const b = c[(i + 1) % 4]; ents.push({ type: 'LINE', x1: a[0], y1: a[1], x2: b[0], y2: b[1], deck: d.id, layer: 'DECK-OUTLINE', id: `T3_${d.id}_OL${i + 1}`, persistentUuid: uuid(d.id + 'OL' + i) }); }); }
 for (const r of rooms) {
  const data = { ...BASE, ...USE[r.use] }, layer = r.use === 'corridor' || r.use === 'brgCorr' ? 'CORRIDOR' : /stair/i.test(r.use) ? 'STAIR' : 'ROOM';
  const geo = r.rect ? { type: 'RECT', x: r.rect[0], y: r.rect[1], w: r.rect[2] - r.rect[0], h: r.rect[3] - r.rect[1] } : { type: 'POLY', points: r.poly.map(([x, y]) => ({ x, y })), closed: true };
  ents.push({ ...geo, roomNo: r.no, roomName: r.name, ...data, deck: r.deck, layer, id: `T3_${r.deck}_${r.no}`, persistentUuid: uuid(r.deck + r.no) });
 }
 const deckTpl = template.source.decks[0];
 return { ...template, source: { ...template.source, entities: ents, decks: DECKS.map(d => ({ ...deckTpl, id: d.id, name: d.name, z: d.z, height: HEIGHT })), backgrounds: [] },
  view: { ...template.view, activeDeck: 'D1', hidden: [], hiddenRooms: [], hiddenDeckLayers: [] },
  extensions: { format: 'CAD-2', selected: [], t3: { id: 'HVAC-GRID-T3-v1', note: 'HVAC Grid synthetic test ship (cargo ship accommodation, 4 decks). Not a real design.' } } };
}

// ---------- general arrangement DXF ----------
function dxf(deckIds, layout) {
 const L = [], add = (...kv) => { for (let i = 0; i < kv.length; i += 2) L.push(String(kv[i]), String(kv[i + 1])); };
 let handle = 0x100; const h = () => (handle++).toString(16).toUpperCase();
 const layers = [['DECK_OUTLINE', 7], ['ROOM', 3], ['ROOM_NO', 1], ['ROOM_NAME', 5], ['TITLE', 2]];
 add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 4, 9, '$DWGCODEPAGE', 3, 'ANSI_949', 0, 'ENDSEC');
 add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, layers.length);
 for (const [n, c] of layers) add(0, 'LAYER', 2, n, 70, 0, 62, c, 6, 'CONTINUOUS');
 add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
 const poly = (layer, pts, dx) => { add(0, 'LWPOLYLINE', 5, h(), 8, layer, 90, pts.length, 70, 1); for (const [x, y] of pts) add(10, x + dx, 20, y); };
 const text = (layer, x, y, size, s) => add(0, 'TEXT', 5, h(), 8, layer, 10, x, 20, y, 30, 0, 40, size, 1, s);
 for (const id of deckIds) {
  const dx = layout[id] || 0, [x0, y0, x1, y1] = OUTLINE[id], d = DECKS.find(k => k.id === id);
  poly('DECK_OUTLINE', [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dx);
  text('TITLE', x0 + dx, y1 + 800, 500, `T3 ${d.name} (Z ${d.z})`);
  for (const r of rooms.filter(k => k.deck === id)) {
   const pts = r.rect ? [[r.rect[0], r.rect[1]], [r.rect[2], r.rect[1]], [r.rect[2], r.rect[3]], [r.rect[0], r.rect[3]]] : r.poly;
   poly('ROOM', pts, dx);
   // labels at the top-left corner when that corner is inside the room (not in the toilet of an L-shaped cabin),
   // else at the room's interior point
   const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), size = 180, outline = pts.map(([x, y]) => ({ x, y }));
   let at = { x: Math.min(...xs) + 150, y: Math.max(...ys) - 350 };
   if (!G.inside(at, outline) || !G.inside({ x: at.x, y: at.y - size * 1.7 }, outline)) { const c = G.interiorPoint(outline); at = { x: c.x - 600, y: c.y + 200 }; }
   text('ROOM_NO', at.x + dx, at.y, size, r.no);
   text('ROOM_NAME', at.x + dx, at.y - size * 1.7, size, r.name);
  }
 }
 add(0, 'ENDSEC', 0, 'EOF');
 return L.join('\r\n') + '\r\n';
}

if (require.main === module) {
 const out = process.argv[2] || path.join('samples', 't3');
 fs.mkdirSync(out, { recursive: true });
 // BOX settings (design conditions, geometry profile, ...) come from BOX's own S5 example project, read from the vendor copy
 const html = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'BOX_CAL_Enhance.html'), 'utf8'), m = html.match(/const S5_EXAMPLE_JSON = ("(?:[^"\\]|\\.)*");/);
 if (!m) throw new Error('BOX S5 예제 설정을 찾지 못했습니다');
 const template = JSON.parse(JSON.parse(m[1])); delete template.extensions.s5Preset;
 fs.writeFileSync(path.join(out, 'T3.box.json'), JSON.stringify(boxProject(template), null, 1));
 for (const d of DECKS) fs.writeFileSync(path.join(out, `T3_${d.id}.dxf`), dxf([d.id], {}));
 fs.writeFileSync(path.join(out, 'T3_ALL.dxf'), dxf(DECKS.map(d => d.id), Object.fromEntries(DECKS.map((d, i) => [d.id, i * 25000]))));
 const count = DECKS.map(d => `${d.id} ${rooms.filter(r => r.deck === d.id).length}`).join(', ');
 console.log(JSON.stringify({ out, rooms: rooms.length, perDeck: count, l: rooms.filter(r => r.poly).length }));
}
module.exports = { DECKS, OUTLINE, rooms, HEIGHT };
