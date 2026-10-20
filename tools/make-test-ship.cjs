// Test drawings: the T3 test ship - a cargo ship accommodation block, 4 decks, 20 x 16 m (bridge deck 12 x 16 m).
// It exercises what S5 does not: systems over several decks with a duct trunk, L-shaped cabins with their own toilets,
// an engine casing on the corridor (A-60), a galley with its own supply / exhaust (SOLAS II-2/9.7.5), exhaust and return
// systems, transfer air, stairs stacked through all decks, CO2 and battery rooms with their own exhaust. v2 (after
// review 1): the AC room and the trunk open onto the corridor, so ducts need not pass the casing or the stair. v2.1
// (after review 2): laundry, changing and drying rooms on the corridor (their make-up air through a corridor door),
// a galley fan room next to the galley, room ceiling heights. v2.2: a cabin toilet is numbered cabin + 50 (211 -> 261),
// digits only - BOX reads only a digits-only DXF text as a room number, so "211T" became part of the name, no number.
//   node tools/make-test-ship.cjs [outDir=samples/t3]
// Writes T3.box.json (a BOX CAL project, the same format as BOX's own S5 example: deck outline LINEs and RECT / POLY
// rooms carrying the room data) and one general-arrangement DXF per deck (T3_<deck>.dxf: the walls as LINEs only - no
// polylines, no boxes, as a drawing has them - and the room number and name) + T3_ALL.dxf (all decks side by side).
// Synthetic data, not a real ship.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), G = require('../lib/geom.cjs');

const DECKS = [
 { id: 'D1', name: 'UPPER DK', z: 0 }, { id: 'D2', name: 'A DK', z: 2800 }, { id: 'D3', name: 'B DK', z: 5600 }, { id: 'D4', name: 'NAV BRG DK', z: 8400 }];
const HEIGHT = 2800;
// ship coordinates as BOX uses them: +x forward, +y port. y 0..7000 starboard side, 7000..9000 corridor, 9000..16000 port side
const OUTLINE = { D1: [0, 0, 20000, 16000], D2: [0, 0, 20000, 16000], D3: [0, 0, 20000, 16000], D4: [8000, 0, 20000, 16000] };

// room data defaults (BOX field names); USE picks the HVAC systems and the internal loads by room type
// ceilingHeight: the room's ceiling (mm) - BOX takes the volume (and the ACH air) from it; 0 = the deck height
// windowSolarMode: solar gain through a window as BOX's S5 example has it (ISO 7547:2022 5.3: clear double glass with an
// interior shade, Gs 240 W/m²). Without it BOX takes a manual coefficient, 0 by default - no sun through any window (v2.3)
// rooms at ISO 7547:2022's indoor design condition 4.2 b) 25 °C / 55 %, winter 4.3 b) 22 °C (v2.5: v2.4 had 27 / 50 % - wrongly
// taken for the standard's; 27 °C is only where Table 4 gives the heat from persons)
// lighting (5.5): none in a room with daylight (a window); else the rated W/m² (Table 5 LED where it has the room)
const BASE = { coolTemp: 25, coolingRh: 55, heatTemp: 22, heatingRh: 40, sup: '', exh: '', ret: '', lighting: 10, windowArea: 0, windowSolarMode: 'auto-double-interior-shade', people: 0, minimumFreshAir: 0, equipW: 0, minimumAch: 0, isoClass: 'AC', ceilingHeight: 2200 };
const USE = {
 cabin: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 1, minimumFreshAir: 28.8, equipW: 200, windowArea: 0.8, lighting: 0 },
 bigCabin: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 4, minimumFreshAir: 115.2, equipW: 400, windowArea: 1.6, lighting: 0 },
 // toilets: exhaust only, the make-up air comes from the cabin / corridor (transfer air, door grille)
 // rooms without supply at the temperature ISO 7547 Table 1 gives them against the 25 / 22 °C rooms (v2.5): BOX takes the
 // temperature difference to a neighbour from the two rooms' temperatures - #7 b) private sanitary not exposed +1 / 0 K,
 // #6 public sanitary +6 / 0 K, #8 store rooms, equipment rooms, trunks +2 / -5 K
 cabinWc: { exh: 'EF-SAN', minimumAch: 15, lighting: 8, coolTemp: 26 },
 wc: { exh: 'EF-SAN', minimumAch: 15, lighting: 8, coolTemp: 31 },
 locker: { exh: 'EF-SAN', minimumAch: 10, lighting: 5, coolTemp: 27, heatTemp: 17 },
 // drying room: 15 ACH at least (ISO 7547 6.4.1); from v2.5 supplied too - 15 ACH as transfer air from the corridor needs a
 // door grille over 0.05 m² (II-2/9.4.2) - exhaust above its supply (6.5)
 drying: { sup: 'AHU-ACC', exh: 'EF-SAN', minimumAch: 25, equipW: 1500, lighting: 5 },
 corridor: { sup: 'AHU-ACC', ret: 'RA-ACC', isoClass: 'ALLEY_SOUND', lighting: 8 },
 stair: { sup: 'AHU-ACC', lighting: 8 },
 mess: { sup: 'AHU-ACC', ret: 'RA-ACC', ceilingHeight: 2300, m2PerPerson: 1.5, equipW: 800, windowArea: 2.4, lighting: 0 },
 rec: { sup: 'AHU-ACC', ret: 'RA-ACC', m2PerPerson: 5, equipW: 600, windowArea: 2.4, lighting: 0 },
 office: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 2, minimumFreshAir: 57.6, equipW: 900, windowArea: 1.2, lighting: 0 },
 gym: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 4, minimumFreshAir: 115.2, equipW: 1200, lighting: 10 },
 // pantry, no cooking: not through the galley system; from v2.5 its own exhaust, apart from the sanitary (ISO 7547 6.4.2),
 // 20 % over its supply (6.4.1)
 pantry: { sup: 'AHU-ACC', exh: 'EF-PAN', minimumAch: 28, equipW: 1500 },
 // galley: own supply fan and exhaust (II-2/9.7.2.1, 9.7.5), exhaust > supply (the rest comes as transfer air); 50 ACH in
 // v2.3-2.4 (window sun and the safety factor raised its supply past 45 ACH), 48 from v2.5 - the make-up air through the
 // corridor door stays under a 0.05 m² grille (II-2/9.4.2) now that the daylit galley carries no lighting load
 galley: { sup: 'SF-GAL', exh: 'EF-GAL', ceilingHeight: 2400, minimumAch: 48, people: 3, equipW: 9000, lighting: 0, windowArea: 1.2 },
 laundry: { sup: 'AHU-ACC', exh: 'EF-LAU', minimumAch: 45, equipW: 2000 },   // 45 ACH since v2.4 (warmer neighbours raised its supply)
 changing: { sup: 'AHU-ACC', exh: 'EF-SAN', minimumAch: 10 },
 // CO2 room and battery room: each its own exhaust (FSS Code 5, class rules)
 co2: { exh: 'EF-CO2', minimumAch: 6, lighting: 5, coolTemp: 27, heatTemp: 17 },
 battery: { exh: 'EF-BAT', minimumAch: 12, lighting: 5, coolTemp: 27, heatTemp: 17 },
 // spaces no system serves (stores, fan rooms, the AC room, trunks): non-air-conditioned (ISO K 0.8 to them), at ISO 7547
 // Table 1 #8 +2 / -5 K, 27 / 17 °C (v2.5; v2.3-2.4 BOX's NON_AC preset 32 / 10 °C); the engine casing Table 1 #3 18 / 17 K,
 // 43 / 5 °C (v2.3 - they were 25 °C, as if air-conditioned)
 store: { lighting: 5, ceilingHeight: 0, isoClass: 'NON_AC', coolTemp: 27, heatTemp: 17 },
 none: { lighting: 5, ceilingHeight: 0, isoClass: 'NON_AC', coolTemp: 27, heatTemp: 17 },
 casing: { isoClass: 'ENGINE', lighting: 0, ceilingHeight: 0, coolTemp: 43, heatTemp: 5 },
 wheel: { sup: 'AHU-BRG', ret: 'RA-BRG', ceilingHeight: 2600, people: 5, minimumFreshAir: 144, equipW: 2000, windowArea: 20, isoClass: 'WHEELHOUSE', lighting: 0 },   // ISO 7547 D.2.2, D.3.3
 brgRoom: { sup: 'AHU-BRG', ret: 'RA-BRG', people: 1, minimumFreshAir: 28.8, equipW: 1500, windowArea: 0.8, lighting: 0 },
 radio: { sup: 'AHU-BRG', ret: 'RA-BRG', people: 1, minimumFreshAir: 28.8, equipW: 2500, windowArea: 0.8, lighting: 0 },   // radio cabin equipment 2.5 kW (5.5)
 brgEquip: { sup: 'AHU-BRG', ret: 'RA-BRG', equipW: 2500, lighting: 8 },
 brgCorr: { sup: 'AHU-BRG', ret: 'RA-BRG', isoClass: 'ALLEY_SOUND', lighting: 8 },
 brgStair: { sup: 'AHU-BRG', lighting: 8 },
 brgWc: { exh: 'EF-BRG', minimumAch: 15, lighting: 8, coolTemp: 31 },
 // a conference room: its seats (the area rule of 4.5 b) is for recreation rooms)
 conf: { sup: 'AHU-ACC', ret: 'RA-ACC', people: 8, minimumFreshAir: 230.4, equipW: 600, windowArea: 2.4, lighting: 0 }};
// occupancy (ISO 7547 4.5, no purchaser's numbers): m2PerPerson - messes 1.5 m², recreation rooms 5 m² a person; offices 2,
// gymnasium 4, captain's and chief engineer's day-rooms 4 (bigCabin), wheelhouse 5 (D.2.2); fresh air 28.8 CMH a person (4.4)
const occupancy = (data, r) => { if (!data.m2PerPerson) return data; const [x0, y0, x1, y1] = r.rect, people = Math.ceil((x1 - x0) * (y1 - y0) / 1e6 / data.m2PerPerson - 1e-9);
 const { m2PerPerson, ...rest } = data; return { ...rest, people, minimumFreshAir: Math.round(people * 28.8 * 10) / 10 }; };

const rooms = [];   // { deck, no, name, use, rect:[x0,y0,x1,y1] } or { ..., poly:[[x,y]...] }
const R = (deck, no, name, use, x0, y0, x1, y1) => rooms.push({ deck, no, name, use, rect: [x0, y0, x1, y1] });
const P = (deck, no, name, use, pts) => rooms.push({ deck, no, name, use, poly: pts });
// a cabin bay: L-shaped cabin + its toilet on the corridor side (wcW x wcD); the toilet number is the cabin's + 50
function bay(deck, no, name, use, x0, x1, side, wcW = 1600, wcD = 2000) {
 const wc = String(+no + 50);
 if (side === 'stbd') {                       // y 0 (ship side) .. 7000 (corridor)
  P(deck, no, name, use, [[x0, 0], [x1, 0], [x1, 7000], [x0 + wcW, 7000], [x0 + wcW, 7000 - wcD], [x0, 7000 - wcD]]);
  R(deck, wc, name + ' 화장실', 'cabinWc', x0, 7000 - wcD, x0 + wcW, 7000);
 } else {                                     // y 9000 (corridor) .. 16000 (ship side)
  P(deck, no, name, use, [[x0, 9000 + wcD], [x0 + wcW, 9000 + wcD], [x0 + wcW, 9000], [x1, 9000], [x1, 16000], [x0, 16000]]);
  R(deck, wc, name + ' 화장실', 'cabinWc', x0, 9000, x0 + wcW, 9000 + wcD);
 }
}
// the core every accommodation deck shares: the engine casing on the corridor (A-60), the corridor the full length,
// the stair (stacked with the bridge stair), the duct trunk and the public toilet on the corridor
function core(deck, n, locker) {
 R(deck, n + '01', '기관실 케이싱', 'casing', 0, 3000, 4000, 7000);
 R(deck, n + '02', '복도', 'corridor', 0, 7000, 20000, 9000);
 R(deck, n + '03', '계단실', 'stair', 8000, 9000, 10500, 11500);
 R(deck, n + '04', '덕트 트렁크', 'none', 4000, 9000, 5500, 10500);
 R(deck, n + '05', locker, 'locker', 4000, 10500, 5500, 12000);
 R(deck, n + '06', '공용화장실', 'wc', 5500, 9000, 8000, 12000);
}
// D1 UPPER DK: galley, messes, laundry, CO2 room, AC room (AHU-ACC, the galley fans, the sanitary, laundry, CO2 fans)
core('D1', '1', '청소도구실');
R('D1', '111', 'CO2실', 'co2', 0, 0, 4000, 3000);
R('D1', '109', '세제·린넨 창고', 'store', 4000, 0, 9000, 3500);
R('D1', '110', '세탁실', 'laundry', 4000, 3500, 6500, 7000);
R('D1', '112', '탈의실', 'changing', 6500, 3500, 9000, 7000);
R('D1', '113', '선원식당', 'mess', 9000, 0, 12000, 7000);
R('D1', '114', '조리실', 'galley', 12000, 0, 16500, 7000);
R('D1', '115', '건식식품창고', 'store', 16500, 0, 20000, 3500);
R('D1', '116', '조리실 팬룸', 'none', 16500, 3500, 20000, 7000);
R('D1', '120', '공조기실', 'none', 0, 9000, 4000, 16000);
R('D1', '107', '사관휴게실', 'rec', 4000, 12000, 8000, 16000);
R('D1', '108', '갑판사무실', 'office', 8000, 11500, 10500, 16000);
R('D1', '121', '사관식당', 'mess', 10500, 9000, 14000, 16000);
R('D1', '122', '배식실', 'pantry', 14000, 9000, 16000, 16000);
R('D1', '123', '선원휴게실', 'rec', 16000, 9000, 20000, 16000);
// D2 A DK: crew cabins (5 starboard, 3 port), gym, linen store, hobby room, drying room
core('D2', '2', '청소도구실');
R('D2', '210', '체육실', 'gym', 0, 0, 4000, 3000);
R('D2', '220', '건조실', 'drying', 0, 9000, 4000, 12000);
R('D2', '226', '린넨창고', 'store', 0, 12000, 4000, 16000);
R('D2', '207', '취미실', 'rec', 4000, 12000, 8000, 16000);
R('D2', '208', '선원휴게실', 'rec', 8000, 11500, 10500, 16000);
for (let k = 0; k < 5; k++) bay('D2', String(211 + k), `선원침실 ${String(k + 1).padStart(2, '0')}`, 'cabin', 4000 + 3200 * k, 7200 + 3200 * k, 'stbd');
[[10500, 13700], [13700, 16900], [16900, 20000]].forEach(([x0, x1], k) => bay('D2', String(221 + k), `선원침실 ${String(k + 6).padStart(2, '0')}`, 'cabin', x0, x1, 'port'));
// D3 B DK: officers
core('D3', '3', '린넨로커');
R('D3', '310', '선박사무실', 'office', 0, 0, 4000, 3000);
R('D3', '320', '회의실', 'conf', 0, 9000, 4000, 16000);
R('D3', '307', '문서보관실', 'store', 4000, 12000, 8000, 16000);
R('D3', '308', '선원사무실', 'office', 8000, 11500, 10500, 16000);
bay('D3', '311', '선장실', 'bigCabin', 4000, 10000, 'stbd'); bay('D3', '312', '기관장실', 'bigCabin', 10000, 16000, 'stbd'); bay('D3', '313', '일등항해사실', 'cabin', 16000, 20000, 'stbd');
[[10500, 13700], [13700, 16900], [16900, 20000]].forEach(([x0, x1], k) => bay('D3', String(321 + k), ['일등기관사실', '이등항해사실', '이등기관사실'][k], 'cabin', x0, x1, 'port'));
// D4 NAV BRG DK: wheelhouse and bridge rooms, its own AHU in the bridge fan room, the stair over the accommodation stair
R('D4', '401', '조타실', 'wheel', 14000, 0, 20000, 16000);
R('D4', '402', '복도', 'brgCorr', 8000, 7000, 14000, 9000);
R('D4', '403', '계단실', 'brgStair', 8000, 9000, 10500, 11500);
R('D4', '404', '선교화장실', 'brgWc', 8000, 11500, 10500, 13500);
R('D4', '405', '선교팬룸', 'none', 10500, 9000, 14000, 13500);
R('D4', '406', '배터리실', 'battery', 8000, 0, 11000, 3000);
R('D4', '407', '무선실', 'radio', 8000, 3000, 11000, 7000);
R('D4', '408', '해도실', 'brgRoom', 11000, 0, 14000, 7000);
R('D4', '409', '도선사실', 'brgRoom', 8000, 13500, 11000, 16000);
R('D4', '410', '항해장비실', 'brgEquip', 11000, 13500, 14000, 16000);

// ---------- BOX project ----------
const uuid = s => { const h = crypto.createHash('sha1').update('hvac-grid-t3:' + s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
function boxProject(template) {
 const ents = [];
 for (const d of DECKS) { const [x0, y0, x1, y1] = OUTLINE[d.id], c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  c.forEach((a, i) => { const b = c[(i + 1) % 4]; ents.push({ type: 'LINE', x1: a[0], y1: a[1], x2: b[0], y2: b[1], deck: d.id, layer: 'DECK-OUTLINE', id: `T3_${d.id}_OL${i + 1}`, persistentUuid: uuid(d.id + 'OL' + i) }); }); }
 for (const r of rooms) {
  const data = occupancy({ ...BASE, ...USE[r.use] }, r), layer = r.use === 'corridor' || r.use === 'brgCorr' ? 'CORRIDOR' : /stair/i.test(r.use) ? 'STAIR' : 'ROOM';
  const geo = r.rect ? { type: 'RECT', x: r.rect[0], y: r.rect[1], w: r.rect[2] - r.rect[0], h: r.rect[3] - r.rect[1] } : { type: 'POLY', points: r.poly.map(([x, y]) => ({ x, y })), closed: true };
  ents.push({ ...geo, roomNo: r.no, roomName: r.name, ...data, deck: r.deck, layer, id: `T3_${r.deck}_${r.no}`, persistentUuid: uuid(r.deck + r.no) });
 }
 const deckTpl = template.source.decks[0];
 // fresh-air latent load from the psychrometric (humidity) model of BOX, not the fixed 7.5 W per CMH (about a third low)
 // and the project's indoor summer condition at ISO 7547 4.2 b) (S5 carries 27 °C / 50 %; v2.5)
 const settings = { ...template.settings, designConditions: { ...template.settings.designConditions, latentModel: 'humidity', indoorCoolTemp: 25, indoorCoolRh: 55 } };
 return { ...template, settings, source: { ...template.source, entities: ents, decks: DECKS.map(d => ({ ...deckTpl, id: d.id, name: d.name, z: d.z, height: HEIGHT })), backgrounds: [] },
  view: { ...template.view, activeDeck: 'D1', hidden: [], hiddenRooms: [], hiddenDeckLayers: [] },
  extensions: { format: 'CAD-2', selected: [], t3: { id: 'HVAC-GRID-T3-v2.5', note: 'HVAC Grid synthetic test ship (cargo ship accommodation, 4 decks). Not a real design.' } } };
}

// ---------- general arrangement DXF ----------
const roomPts = r => r.rect ? [[r.rect[0], r.rect[1]], [r.rect[2], r.rect[1]], [r.rect[2], r.rect[3]], [r.rect[0], r.rect[3]]] : r.poly;
// the walls of a deck as a drawing has them: each wall once, a LINE - a wall along several rooms is one line that other
// walls meet in a T (no polylines, no boxes, no wall twice); the hull side on DECK_OUTLINE, the rest on ROOM
function walls(id) {
 const [x0, y0, x1, y1] = OUTLINE[id], H = new Map(), V = new Map(), out = [];
 const put = (m, k, a, b) => { if (!m.has(k)) m.set(k, []); m.get(k).push([Math.min(a, b), Math.max(a, b)]); };
 const ring = pts => pts.forEach(([ax, ay], i) => { const [bx, by] = pts[(i + 1) % pts.length]; if (ay === by) put(H, ay, ax, bx); else if (ax === bx) put(V, ax, ay, by); else throw new Error('직교가 아닌 벽: ' + id); });
 ring([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
 for (const r of rooms.filter(k => k.deck === id)) ring(roomPts(r));
 for (const [m, horizontal] of [[H, true], [V, false]]) for (const [k, iv] of [...m].sort((a, b) => a[0] - b[0])) {
  iv.sort((a, b) => a[0] - b[0]);
  let [s, e] = iv[0];
  for (const [a, b] of [...iv.slice(1), [Infinity, Infinity]]) {
   if (a <= e) { e = Math.max(e, b); continue; }
   const layer = (horizontal ? k === y0 || k === y1 : k === x0 || k === x1) ? 'DECK_OUTLINE' : 'ROOM';
   out.push(horizontal ? { layer, x1: s, y1: k, x2: e, y2: k } : { layer, x1: k, y1: s, x2: k, y2: e });
   [s, e] = [a, b];
  }
 }
 return out;
}
function dxf(deckIds, layout) {
 const L = [], add = (...kv) => { for (let i = 0; i < kv.length; i += 2) L.push(String(kv[i]), String(kv[i + 1])); };
 let handle = 0x100; const h = () => (handle++).toString(16).toUpperCase();
 const layers = [['DECK_OUTLINE', 7], ['ROOM', 3], ['ROOM_NO', 1], ['ROOM_NAME', 5], ['TITLE', 2]];
 add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1021', 9, '$DWGCODEPAGE', 3, 'ANSI_1252', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');   // DXF 2007: text is UTF-8 whatever the code page
 add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 5, h(), 100, 'AcDbSymbolTable', 70, layers.length);
 for (const [n, c] of layers) add(0, 'LAYER', 5, h(), 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, n, 70, 0, 62, c, 6, 'CONTINUOUS');
 add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
 const line = (w, dx) => add(0, 'LINE', 5, h(), 100, 'AcDbEntity', 8, w.layer, 100, 'AcDbLine', 10, w.x1 + dx, 20, w.y1, 30, 0, 11, w.x2 + dx, 21, w.y2, 31, 0);
 const text = (layer, x, y, size, s) => add(0, 'TEXT', 5, h(), 100, 'AcDbEntity', 8, layer, 100, 'AcDbText', 10, x, 20, y, 30, 0, 40, size, 1, s, 100, 'AcDbText');
 for (const id of deckIds) {
  const dx = layout[id] || 0, [x0, y0, x1, y1] = OUTLINE[id], d = DECKS.find(k => k.id === id);
  for (const w of walls(id)) line(w, dx);
  text('TITLE', x0 + dx, y1 + 800, 500, `T3 ${d.name} (Z ${d.z})`);
  for (const r of rooms.filter(k => k.deck === id)) {
   const pts = roomPts(r);
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
module.exports = { DECKS, OUTLINE, rooms, HEIGHT, walls };
