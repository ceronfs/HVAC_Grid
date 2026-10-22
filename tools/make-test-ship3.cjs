// Test drawings: the N3 test ship - a 3-deck accommodation block drawn from scratch, to run HVAC Grid from the
// drawings the way a designer starts: general-arrangement DXFs (walls as LINEs, the room number and name as TEXT), no
// BOX project. One AHU serves all three decks through a duct trunk; the galley has its own supply and exhaust; the
// hospital, the laundry, the CO2 and the battery room their own exhaust (ISO 7547 6.4.2, SOLAS II-2/9.7.5).
// A seed varies the layout (deck length, cabin widths, the side of the galley and of the hospital, the corridor's place)
// so a daily run draws a ship it has not seen; the same seed gives the same files.
//   node tools/make-test-ship3.cjs [outDir=samples/n3] [seed=1]
// Writes N3_D1.dxf (R12, Korean text in code page ANSI_949 - as an older drawing comes), N3_D2.dxf and N3_D3.dxf
// (R2007, UTF-8), N3_ALL.dxf (the decks side by side) and N3.inputs.json: the decks (name, Z, height) and, per room,
// what the designer types in BOX's room list (systems, persons, equipment, ACH, ceiling, window, temperatures).
// Synthetic data, not a real ship.
'use strict';
const fs = require('fs'), path = require('path'), G = require('../lib/geom.cjs');

// a small deterministic generator (mulberry32)
function rng(seed) { let a = Math.imul(seed >>> 0, 0x9E3779B1) ^ 0x5BD1E995; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// room data (BOX field names). Rooms with supply are conditioned at the project's 25 / 22 °C (ISO 7547:2022 4.2 b,
// 4.3 b); rooms without supply at Table 1's difference from them (private sanitary +1 / 0 K, public +6 / 0 K; stores,
// trunks, fan rooms +2 / -5 K; the engine casing +18 / -17 K). Fresh air 28.8 CMH a person (4.4); messes 1.5 m², day
// rooms 5 m² a person (4.5). No ISO class is set: BOX takes it from the room name, as a designer would leave it.
const BASE = { coolTemp: 25, coolingRh: 55, heatTemp: 22, heatingRh: 40, sup: '', exh: '', ret: '', lighting: 10, windowArea: 0, windowSolarMode: 'auto-double-interior-shade', people: 0, minimumFreshAir: 0, equipW: 0, minimumAch: 0, ceilingHeight: 2200 };
const USE = {
 cabin: { sup: 'AHU-1', ret: 'RA-1', people: 1, equipW: 200, windowArea: 0.8, lighting: 0 },
 officer: { sup: 'AHU-1', ret: 'RA-1', people: 2, equipW: 300, windowArea: 1.2, lighting: 0 },
 cabinWc: { exh: 'EF-SAN', minimumAch: 15, lighting: 8, coolTemp: 26 },
 wc: { exh: 'EF-SAN', minimumAch: 15, lighting: 8, coolTemp: 31 },
 changing: { sup: 'AHU-1', exh: 'EF-SAN', minimumAch: 15, lighting: 8 },
 corridor: { sup: 'AHU-1', ret: 'RA-1', lighting: 8 },
 stair: { sup: 'AHU-1', lighting: 8 },
 mess: { sup: 'AHU-1', ret: 'RA-1', ceilingHeight: 2300, m2PerPerson: 1.5, equipW: 800, windowArea: 2.4, lighting: 0 },
 day: { sup: 'AHU-1', ret: 'RA-1', m2PerPerson: 5, equipW: 600, windowArea: 2.4, lighting: 0 },
 radio: { sup: 'AHU-1', ret: 'RA-1', people: 1, equipW: 2500, windowArea: 0.8, lighting: 0 },
 gym: { sup: 'AHU-1', ret: 'RA-1', people: 4, equipW: 1200, lighting: 10 },
 hospital: { sup: 'AHU-1', exh: 'EF-HOS', people: 2, minimumAch: 12, equipW: 300, windowArea: 0.8, lighting: 0 },
 hospWc: { exh: 'EF-HOS', minimumAch: 15, lighting: 8, coolTemp: 26 },
 galley: { sup: 'SF-GAL', exh: 'EF-GAL', ceilingHeight: 2400, minimumAch: 50, people: 3, activity: 'light', equipW: 8000, equipLatentW: 1500, lighting: 10 },
 pantry: { sup: 'AHU-1', exh: 'EF-PAN', minimumAch: 25, equipW: 1200 },   // its own exhaust (6.4.2)
 laundry: { sup: 'AHU-1', exh: 'EF-LAU', minimumAch: 25, equipW: 2000 },
 locker: { exh: 'EF-SAN', minimumAch: 10, lighting: 5, coolTemp: 27, heatTemp: 17 },   // cleaning lockers 10 ACH (6.4.1)
 co2: { exh: 'EF-CO2', minimumAch: 6, lighting: 5, coolTemp: 27, heatTemp: 17 },
 battery: { exh: 'EF-BAT', minimumAch: 12, lighting: 5, coolTemp: 27, heatTemp: 17 },
 store: { lighting: 5, ceilingHeight: 0, coolTemp: 27, heatTemp: 17 },
 casing: { lighting: 0, ceilingHeight: 0, coolTemp: 43, heatTemp: 5 },
 wheel: { sup: 'AHU-1', ret: 'RA-1', ceilingHeight: 2600, people: 4, equipW: 2000, windowArea: 16, lighting: 0 }};

const rect = ([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const area = pts => Math.abs(pts.reduce((t, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return t + x * v - u * y; }, 0)) / 2 / 1e6;

function ship(seed = 1) {
 const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
 const L = 22000 + 1000 * Math.floor(r() * 5), B = 14000, cy = pick([6000, 6500]), cw = 2000, py = cy + cw;   // corridor y cy..py
 const galleyPort = r() < 0.5, hospPort = r() < 0.5, wh = L - pick([6000, 7000]);
 const decks = [{ id: 'D1', name: 'MAIN DK', z: 0 }, { id: 'D2', name: 'CREW DK', z: 2900 }, { id: 'D3', name: 'BRIDGE DK', z: 5800 }];
 const rooms = [], R = (deck, no, name, use, x0, y0, x1, y1) => rooms.push({ deck, no: String(no), name, use, pts: rect([x0, y0, x1, y1]) });
 const band = port => port ? [py, B] : [0, cy];
 // the aft core on every deck: engine casing (starboard); on the port side the toilet and the duct trunk on the
 // corridor, a locker behind the toilet, the AC / fan / battery room behind the trunk, the stair and a store over it
 const core = (deck, n, wc, beside) => {
  R(deck, n + '01', '기관실 케이싱', 'casing', 0, 0, 3500, cy);
  R(deck, n + '02', '복도', 'corridor', 0, cy, deck === 'D3' ? wh : L, py);
  R(deck, n + '03', '계단실', 'stair', 3500, py, 6000, py + 3000);
  R(deck, n + '05', wc, 'wc', 0, py, 1500, py + 2000);
  R(deck, n + '04', '덕트 트렁크', 'store', 1500, py, 3500, py + 1500);
  R(deck, n + '08', '청소도구실', 'locker', 0, py + 2000, 1500, B);
  R(deck, n + '06', ...beside, 1500, py + 1500, 3500, B);
  R(deck, n + '07', '창고', 'store', 3500, py + 3000, 6000, B);
 };
 // a row of cabins from x0 to x1 on one side, each an L around its toilet in the corridor corner (number + 50)
 const cabins = (deck, port, x0, x1, w, n, name, use) => {
  const [y0, y1] = band(port), k = Math.max(1, Math.floor((x1 - x0) / w));
  for (let i = 0; i < k; i++) {
   const a = x0 + i * w, b = i === k - 1 ? x1 : a + w, no = n + i, nm = name(i);
   const wcy = port ? [y0, y0 + 1800] : [y1 - 1800, y1];
   rooms.push({ deck, no: String(no), name: nm, use, pts: port ? [[a, y0 + 1800], [a + 1500, y0 + 1800], [a + 1500, y0], [b, y0], [b, y1], [a, y1]] : [[a, y0], [b, y0], [b, y1], [a + 1500, y1], [a + 1500, y1 - 1800], [a, y1 - 1800]] });
   R(deck, no + 50, nm + ' 화장실', use === 'officer' ? 'cabinWc' : 'cabinWc', a, wcy[0], a + 1500, wcy[1]);
  }
 };
 // D1 MAIN DK: CO2 room, changing room, laundry aft; galley + pantry + stores on one side, the messes on the other
 core('D1', '1', '공용화장실', ['공조기실', 'store']);
 R('D1', '111', 'CO2실', 'co2', 3500, 0, 6000, 2500);
 R('D1', '112', '탈의실', 'changing', 3500, 2500, 6000, cy);
 R('D1', '113', '세탁실', 'laundry', 6000, 0, 9000, cy);
 R('D1', '124', '조리실 팬룸', 'store', 6000, py, 9000, B);
 const [g0, g1] = band(galleyPort), [m0, m1] = band(!galleyPort);
 R('D1', '114', '조리실', 'galley', 9000, g0, 13500, g1);
 R('D1', '115', '배식실', 'pantry', 13500, g0, 15500, g1);
 R('D1', '116', '식료품창고', 'store', 15500, g0, L - 3000, g1);
 R('D1', '117', '냉장고', 'store', L - 3000, g0, L, g1);
 R('D1', '121', '선원식당', 'mess', 9000, m0, 14500, m1);
 R('D1', '122', '사관식당', 'mess', 14500, m0, 19000, m1);
 R('D1', '123', '휴게실', 'day', 19000, m0, L, m1);
 // D2 CREW DK: gym, hospital with its toilet, hobby room, crew cabins forward on both sides
 core('D2', '2', '공용화장실', ['린넨로커', 'store']);
 R('D2', '210', '체육실', 'gym', 3500, 0, 7000, cy);
 const [h0, h1] = band(hospPort), hx = hospPort ? 6000 : 7000;
 R('D2', '230', '의무실', 'hospital', hx, h0, 10500, h1);
 R('D2', '231', '의무실 화장실', 'hospWc', 10500, hospPort ? h0 : h1 - 2000, 12000, hospPort ? h0 + 2000 : h1);
 R('D2', '232', '린넨창고', 'store', 10500, hospPort ? h0 + 2000 : h0, 12000, hospPort ? h1 : h1 - 2000);
 const [o0, o1] = band(!hospPort);
 R('D2', '240', '취미실', 'day', hospPort ? 7000 : 6000, o0, 12000, o1);
 const cw2 = pick([3000, 3200, 3500]);
 cabins('D2', false, 12000, L, cw2, 211, i => `선원침실 ${String(i + 1).padStart(2, '0')}`, 'cabin');
 cabins('D2', true, 12000, L, cw2, 241, i => `선원침실 ${String(i + 21)}`, 'cabin');
 // D3 BRIDGE DK: radio room, officers' cabins, the wheelhouse forward over the full breadth
 core('D3', '3', '선교화장실', ['배터리실', 'battery']);
 R('D3', '310', '무선실', 'radio', 3500, 0, 6500, cy);
 const ow = pick([4000, 4500]), names = ['선장실', '기관장실', '일등항해사실', '일등기관사실', '이등항해사실', '이등기관사실', '삼등항해사실', '삼등기관사실'];
 cabins('D3', false, 6500, wh, ow, 311, i => names[i] || `사관실 ${i + 1}`, 'officer');
 cabins('D3', true, 6000, wh, ow, 321, i => names[i + 4] || `사관실 ${i + 5}`, 'officer');
 R('D3', '330', '조타실', 'wheel', wh, 0, L, B);
 return { seed, L, B, decks, height: 2900, rooms };
}

// ---------- room input sheet: what the designer types in BOX's room list ----------
function inputs(s) {
 return { ship: 'N3', seed: s.seed, lengthMm: s.L, breadthMm: s.B, note: 'HVAC Grid synthetic test ship (3 decks). Not a real design.', decks: s.decks.map(d => ({ ...d, height: s.height })),
  rooms: s.rooms.map(r => { const d = { ...BASE, ...USE[r.use] }, n = d.m2PerPerson ? Math.ceil(area(r.pts) / d.m2PerPerson - 1e-9) : d.people; delete d.m2PerPerson;
   return { deck: r.deck, no: r.no, name: r.name, use: r.use, points: r.pts, ...d, people: n, minimumFreshAir: Math.round(n * 28.8 * 10) / 10 }; }) };
}

// ---------- general-arrangement DXF ----------
// each wall once, a LINE (a wall along several rooms is one line the others meet in a T); the hull side on DECK_OUTLINE
function walls(s, id) {
 const H = new Map(), V = new Map(), out = [];
 const put = (m, k, a, b) => { if (!m.has(k)) m.set(k, []); m.get(k).push([Math.min(a, b), Math.max(a, b)]); };
 const ring = pts => pts.forEach(([ax, ay], i) => { const [bx, by] = pts[(i + 1) % pts.length]; if (ay === by) put(H, ay, ax, bx); else if (ax === bx) put(V, ax, ay, by); else throw new Error('직교가 아닌 벽: ' + id); });
 ring(rect([0, 0, s.L, s.B]));
 for (const r of s.rooms.filter(k => k.deck === id)) ring(r.pts);
 for (const [m, horizontal] of [[H, true], [V, false]]) for (const [k, iv] of [...m].sort((a, b) => a[0] - b[0])) {
  iv.sort((a, b) => a[0] - b[0]); let [a0, e] = iv[0];
  for (const [a, b] of [...iv.slice(1), [Infinity, Infinity]]) {
   if (a <= e) { e = Math.max(e, b); continue; }
   const layer = (horizontal ? k === 0 || k === s.B : k === 0 || k === s.L) ? 'DECK_OUTLINE' : 'ROOM';
   out.push(horizontal ? { layer, x1: a0, y1: k, x2: e, y2: k } : { layer, x1: k, y1: a0, x2: k, y2: e }); [a0, e] = [a, b];
  }
 }
 return out;
}
// r12: AutoCAD R12 in code page ANSI_949 (the caller writes the EUC-KR bytes); else R2007, UTF-8
function dxf(s, deckIds, layout = {}, r12 = false) {
 const out = [], add = (...kv) => { for (let i = 0; i < kv.length; i += 2) out.push(String(kv[i]), String(kv[i + 1])); };
 let handle = 0x100; const hd = () => (handle++).toString(16).toUpperCase(), sub = (...k) => r12 ? [] : k;
 const layers = [['DECK_OUTLINE', 7], ['ROOM', 3], ['ROOM_NO', 1], ['ROOM_NAME', 5], ['TITLE', 2]];
 add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, r12 ? 'AC1009' : 'AC1021', 9, '$DWGCODEPAGE', 3, r12 ? 'ANSI_949' : 'ANSI_1252', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
 add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', ...sub(5, hd(), 100, 'AcDbSymbolTable'), 70, layers.length);
 for (const [n, c] of layers) add(0, 'LAYER', ...sub(5, hd(), 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord'), 2, n, 70, 0, 62, c, 6, 'CONTINUOUS');
 add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
 const line = (w, dx) => add(0, 'LINE', ...sub(5, hd(), 100, 'AcDbEntity'), 8, w.layer, ...sub(100, 'AcDbLine'), 10, w.x1 + dx, 20, w.y1, 30, 0, 11, w.x2 + dx, 21, w.y2, 31, 0);
 const text = (layer, x, y, size, t) => add(0, 'TEXT', ...sub(5, hd(), 100, 'AcDbEntity'), 8, layer, ...sub(100, 'AcDbText'), 10, x, 20, y, 30, 0, 40, size, 1, t, ...sub(100, 'AcDbText'));
 for (const id of deckIds) {
  const dx = layout[id] || 0, d = s.decks.find(k => k.id === id);
  for (const w of walls(s, id)) line(w, dx);
  text('TITLE', dx, s.B + 800, 500, `N3 ${d.name} (Z ${d.z})`);
  for (const r of s.rooms.filter(k => k.deck === id)) {
   // the number and name left of the room's interior point, small enough for a 1.5 m toilet
   const c = G.interiorPoint(r.pts.map(([x, y]) => ({ x, y }))), xs = r.pts.map(p => p[0]), size = 150;
   const x = Math.max(Math.min(...xs) + 100, c.x - 600);
   text('ROOM_NO', x + dx, c.y + 150, size, r.no);
   text('ROOM_NAME', x + dx, c.y - 150, size, r.name);
  }
 }
 add(0, 'ENDSEC', 0, 'EOF');
 return out.join('\r\n') + '\r\n';
}
// EUC-KR bytes for an R12 file: Node has no EUC-KR encoder, so the decoder's table is turned round once
let euckr = null;
function eucKr(text) {
 if (!euckr) { euckr = new Map(); const dec = new TextDecoder('euc-kr');
  for (let a = 0xA1; a <= 0xFE; a++) for (let b = 0xA1; b <= 0xFE; b++) { const ch = dec.decode(Uint8Array.of(a, b)); if (ch.length === 1 && ch !== '�' && !euckr.has(ch)) euckr.set(ch, [a, b]); } }
 const bytes = [];
 for (const ch of text) { const c = ch.codePointAt(0); if (c < 0x80) bytes.push(c); else { const e = euckr.get(ch); if (!e) throw new Error('EUC-KR에 없는 글자: ' + ch); bytes.push(...e); } }
 return Buffer.from(bytes);
}

function write(out, seed = 1) {
 const s = ship(seed);
 fs.mkdirSync(out, { recursive: true });
 fs.writeFileSync(path.join(out, 'N3.inputs.json'), JSON.stringify(inputs(s), null, 1));
 fs.writeFileSync(path.join(out, 'N3_D1.dxf'), eucKr(dxf(s, ['D1'], {}, true)));
 for (const id of ['D2', 'D3']) fs.writeFileSync(path.join(out, `N3_${id}.dxf`), dxf(s, [id]));
 fs.writeFileSync(path.join(out, 'N3_ALL.dxf'), dxf(s, ['D1', 'D2', 'D3'], { D2: s.L + 6000, D3: 2 * (s.L + 6000) }));
 return { out, seed, lengthMm: s.L, rooms: s.rooms.length, perDeck: s.decks.map(d => `${d.id} ${s.rooms.filter(r => r.deck === d.id).length}`).join(', ') };
}
if (require.main === module) console.log(JSON.stringify(write(process.argv[2] || path.join('samples', 'n3'), +(process.argv[3] || 1))));
module.exports = { ship, inputs, dxf, walls, write, eucKr, area };
