// Test drawings: the N3 test ship - a 3-deck accommodation block drawn from scratch, to run HVAC Grid from the
// drawings the way a designer starts: general-arrangement DXFs (walls as LINEs, the room number and name as TEXT), no
// BOX project. One AHU serves all three decks through a duct trunk; the galley has its own supply and exhaust; the
// hospital, the laundry, the CO2 and battery rooms their own exhaust (ISO 7547 6.4.2, SOLAS II-2/9.7.5).
// A seed varies the layout (deck length, cabin count and width, which side the galley and the hospital are on, the
// corridor's place) so a daily run draws a ship it has not seen; the same seed gives the same files.
//   node tools/make-test-ship3.cjs [outDir=samples/n3] [seed=1]
// Writes N3_D1.dxf (R12, Korean text in code page ANSI_949 - as an older drawing comes), N3_D2.dxf and N3_D3.dxf
// (R2007, UTF-8), N3_ALL.dxf (the decks side by side) and N3.inputs.json: the decks (name, Z, height) and, per room,
// what the designer types in BOX's room list (systems, persons, equipment, ACH, ceiling, window, temperatures).
// Synthetic data, not a real ship.
'use strict';
const fs = require('fs'), path = require('path'), G = require('../lib/geom.cjs');

// a small deterministic generator (mulberry32)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// room data (BOX field names). Rooms with supply are conditioned at the project's 25 / 22 °C (ISO 7547:2022 4.2 b,
// 4.3 b); rooms without supply at Table 1's difference from them (sanitary +1 / 0 K private, +6 / 0 K public; stores,
// trunks, fan rooms +2 / -5 K; machinery +18 / -17 K). Persons and fresh air 28.8 CMH a person (4.4).
const BASE = { coolTemp: 25, coolingRh: 55, heatTemp: 22, heatingRh: 40, sup: '', exh: '', ret: '', lighting: 10, windowArea: 0, windowSolarMode: 'auto-double-interior-shade', people: 0, minimumFreshAir: 0, equipW: 0, minimumAch: 0, ceilingHeight: 2200 };
const USE = {
 cabin: { sup: 'AHU-1', ret: 'RA-1', people: 1, minimumFreshAir: 28.8, equipW: 200, windowArea: 0.8, lighting: 0 },
 officer: { sup: 'AHU-1', ret: 'RA-1', people: 2, minimumFreshAir: 57.6, equipW: 300, windowArea: 1.2, lighting: 0 },
 cabinWc: { exh: 'EF-SAN', minimumAch: 15, lighting: 8, coolTemp: 26 },
 wc: { exh: 'EF-SAN', minimumAch: 15, lighting: 8, coolTemp: 31 },
 changing: { sup: 'AHU-1', exh: 'EF-SAN', minimumAch: 10, lighting: 8 },
 corridor: { sup: 'AHU-1', ret: 'RA-1', lighting: 8 },
 stair: { sup: 'AHU-1', lighting: 8 },
 mess: { sup: 'AHU-1', ret: 'RA-1', ceilingHeight: 2300, m2PerPerson: 1.5, equipW: 800, windowArea: 2.4, lighting: 0 },
 day: { sup: 'AHU-1', ret: 'RA-1', m2PerPerson: 5, equipW: 600, windowArea: 2.4, lighting: 0 },
 office: { sup: 'AHU-1', ret: 'RA-1', people: 2, minimumFreshAir: 57.6, equipW: 900, windowArea: 1.2, lighting: 0 },
 gym: { sup: 'AHU-1', ret: 'RA-1', people: 4, minimumFreshAir: 115.2, equipW: 1200, lighting: 10 },
 hospital: { sup: 'AHU-1', exh: 'EF-HOS', people: 2, minimumFreshAir: 57.6, minimumAch: 12, equipW: 300, windowArea: 0.8, lighting: 0 },
 hospWc: { exh: 'EF-HOS', minimumAch: 15, lighting: 8, coolTemp: 26 },
 galley: { sup: 'SF-GAL', exh: 'EF-GAL', ceilingHeight: 2400, minimumAch: 45, people: 3, activity: 'light', equipW: 8000, lighting: 10 },
 pantry: { sup: 'AHU-1', exh: 'EF-SAN', minimumAch: 25, equipW: 1200 },
 laundry: { sup: 'AHU-1', exh: 'EF-LAU', minimumAch: 40, equipW: 2000 },
 co2: { exh: 'EF-CO2', minimumAch: 6, lighting: 5, coolTemp: 27, heatTemp: 17 },
 battery: { exh: 'EF-BAT', minimumAch: 12, lighting: 5, coolTemp: 27, heatTemp: 17 },
 store: { lighting: 5, ceilingHeight: 0, coolTemp: 27, heatTemp: 17 },
 none: { lighting: 5, ceilingHeight: 0, coolTemp: 27, heatTemp: 17 },
 casing: { lighting: 0, ceilingHeight: 0, coolTemp: 43, heatTemp: 5 },
 wheel: { sup: 'AHU-1', ret: 'RA-1', ceilingHeight: 2600, people: 4, minimumFreshAir: 115.2, equipW: 2000, windowArea: 16, lighting: 0 },
 radio: { sup: 'AHU-1', ret: 'RA-1', people: 1, minimumFreshAir: 28.8, equipW: 2500, windowArea: 0.8, lighting: 0 }};
// no isoClass is set: BOX takes it from the room name (vendor patch B2) - the class a designer would not type

function ship(seed = 1) {
 const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
 const L = 22000 + 1000 * Math.floor(r() * 5), B = 14000;   // 22..26 m long, 14 m wide
 const cy = pick([6000, 6500]), cw = 2000;                  // corridor y cy..cy+cw (starboard below, port above)
 const galleyPort = r() < 0.5, hospPort = r() < 0.5;
 const decks = [{ id: 'D1', name: 'MAIN DK', z: 0 }, { id: 'D2', name: 'CREW DK', z: 2900 }, { id: 'D3', name: 'BRIDGE DK', z: 5800 }];
 const rooms = [], R = (deck, no, name, use, x0, y0, x1, y1) => rooms.push({ deck, no: String(no), name, use, rect: [x0, y0, x1, y1] });
 const S = [0, cy], C = [cy, cy + cw], P = [cy + cw, B];      // starboard, corridor and port bands (y)
 const band = port => port ? P : S;
 // the core on every deck at the aft end: engine casing, the stair, the duct trunk next to the AC room, public toilet
 const core = (deck, n) => {
  R(deck, n + '01', '기관실 케이싱', 'casing', 0, 0, 3500, cy);
  R(deck, n + '02', '복도', 'corridor', 0, cy, L, cy + cw);
  R(deck, n + '03', '계단실', 'stair', 3500, cy + cw, 6000, cy + cw + 3000);
  R(deck, n + '04', '덕트 트렁크', 'none', 0, cy + cw, 1500, cy + cw + 2000);
 };
 // cabins with their toilet in the corridor corner: a row from x0 to x1 on one side, width w, number from n
 const cabins = (deck, side, x0, x1, w, n, name, use) => {
  const [y0, y1] = band(side), k = Math.floor((x1 - x0) / w), out = [];
  for (let i = 0; i < k; i++) {
   const a = x0 + i * w, b = i === k - 1 ? x1 : a + w, no = n + i, nm = typeof name === 'function' ? name(i) : `${name} ${String(i + 1).padStart(2, '0')}`;
   const wcY = side ? [y0, y0 + 1800] : [y1 - 1800, y1];
   // the cabin wraps its toilet (an L): the cabin is drawn as two rectangles' union - here as the cabin rectangle
   // beside the toilet strip, so the walls stay orthogonal
   R(deck, no, nm, use, a + 1500, y0, b, y1);
   R(deck, no + 50, nm + ' 화장실', 'cabinWc', a, wcY[0], a + 1500, wcY[1]);
   R(deck, no + 70, nm + ' 옷장', 'store', a, side ? y0 + 1800 : y0, a + 1500, side ? y1 : y1 - 1800);
   out.push(no);
  }
  return out;
 };
 // D1 MAIN DK
 core('D1', '1');
 R('D1', '120', '공조기실', 'none', 1500, cy + cw, 3500, B);
 R('D1', '105', '공용화장실', 'wc', 1500, cy + cw + 2000, 0, B).rect = undefined; rooms.pop();
 R('D1', '105', '공용화장실', 'wc', 0, cy + cw + 2000, 1500, B);
 R('D1', '111', 'CO2실', 'co2', 3500, 0, 6000, 2500);
 R('D1', '112', '탈의실', 'changing', 3500, 2500, 6000, cy);
 R('D1', '113', '세탁실', 'laundry', 6000, 0, 9000, cy);
 const g = band(galleyPort), m = band(!galleyPort);
 R('D1', '114', '조리실', 'galley', 9000, g[0], 13500, g[1]);
 R('D1', '115', '배식실', 'pantry', 13500, g[0], 15500, g[1]);
 R('D1', '116', '식료품창고', 'store', 15500, g[0], L - 3000, g[1]);
 R('D1', '117', '냉장고', 'store', L - 3000, g[0], L, g[1]);
 R('D1', '121', '선원식당', 'mess', 9000, m[0], 14500, m[1]);
 R('D1', '122', '사관식당', 'mess', 14500, m[0], 19000, m[1]);
 R('D1', '123', '휴게실', 'day', 19000, m[0], L, m[1]);
 if (galleyPort) R('D1', '124', '조리실 팬룸', 'none', 6000, cy + cw, 9000, B); else R('D1', '124', '조리실 팬룸', 'none', 6000, cy + cw, 9000, B);
 // D2 CREW DK
 core('D2', '2');
 R('D2', '220', '건조실', 'changing', 1500, cy + cw, 3500, B);
 R('D2', '205', '공용화장실', 'wc', 0, cy + cw + 2000, 1500, B);
 R('D2', '210', '체육실', 'gym', 3500, 0, 7000, cy);
 const h = band(hospPort);
 R('D2', '230', '의무실', 'hospital', 6000, h === P ? cy + cw : 0, 9500, h === P ? B : cy);
 R('D2', '231', '의무실 화장실', 'hospWc', 9500, h === P ? cy + cw : cy - 2000, 11000, h === P ? cy + cw + 2000 : cy);
 R('D2', '232', '린넨창고', 'store', 9500, h === P ? cy + cw + 2000 : 0, 11000, h === P ? B : cy - 2000);
 const cw2 = pick([3000, 3200, 3500]);
 cabins('D2', !hospPort, hospPort ? 7000 : 11000, L, cw2, 211, '선원침실', 'cabin');
 if (hospPort) cabins('D2', true, 11000, L, cw2, 241, k => `선원침실 ${String(k + 21)}`, 'cabin');
 else { R('D2', '240', '취미실', 'day', 7000, 0, 11000, cy); cabins('D2', true, 11000, L, cw2, 241, k => `선원침실 ${String(k + 21)}`, 'cabin'); }
 if (hospPort) R('D2', '240', '취미실', 'day', 6000, cy + cw, 6000, B), rooms.pop();
 // D3 BRIDGE DK: officers aft, the wheelhouse forward over the full breadth
 core('D3', '3');
 R('D3', '305', '선교화장실', 'wc', 0, cy + cw + 2000, 1500, B);
 R('D3', '306', '배터리실', 'battery', 1500, cy + cw, 3500, B);
 R('D3', '310', '무선실', 'radio', 3500, 0, 6500, cy);
 const wh = L - 7000;
 cabins('D3', false, 6500, wh, pick([4000, 4500]), 311, k => ['선장실', '기관장실', '일등항해사실', '일등기관사실'][k] || `사관실 ${k + 1}`, 'officer');
 cabins('D3', true, 6000, wh, pick([4000, 4500]), 321, k => ['이등항해사실', '이등기관사실', '삼등항해사실', '삼등기관사실'][k] || `사관실 ${k + 5}`, 'officer');
 R('D3', '301', '조타실', 'wheel', wh, 0, L, B);
 // the corridor stops at the wheelhouse
 const corr = rooms.find(x => x.deck === 'D3' && x.no === '302'); corr.rect[2] = wh;
 return { seed, L, B, decks, height: 2900, rooms };
}

// ---------- room input sheet ----------
function inputs(s) {
 const people = (d, area) => d.m2PerPerson ? Math.ceil(area / d.m2PerPerson - 1e-9) : d.people;
 return { ship: 'N3', seed: s.seed, note: 'HVAC Grid synthetic test ship (3 decks). Not a real design.', decks: s.decks.map(d => ({ ...d, height: s.height })),
  rooms: s.rooms.map(r => { const [x0, y0, x1, y1] = r.rect, area = (x1 - x0) * (y1 - y0) / 1e6, d = { ...BASE, ...USE[r.use] }, n = people(d, area); delete d.m2PerPerson;
   return { deck: r.deck, no: r.no, name: r.name, use: r.use, rect: r.rect, ...d, people: n, minimumFreshAir: n ? Math.round(n * 28.8 * 10) / 10 : d.minimumFreshAir }; }) };
}

// ---------- general-arrangement DXF ----------
// each wall once, a LINE; the hull side on DECK_OUTLINE, the rest on ROOM; the number and name as TEXT inside the room
function walls(s, id) {
 const H = new Map(), V = new Map(), out = [];
 const put = (m, k, a, b) => { if (!m.has(k)) m.set(k, []); m.get(k).push([Math.min(a, b), Math.max(a, b)]); };
 const ring = ([x0, y0, x1, y1]) => { put(H, y0, x0, x1); put(H, y1, x0, x1); put(V, x0, y0, y1); put(V, x1, y0, y1); };
 ring([0, 0, s.L, s.B]);
 for (const r of s.rooms.filter(k => k.deck === id)) ring(r.rect);
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
// r12: AutoCAD R12 with Korean text in the code page ANSI_949 (EUC-KR bytes, written by the caller); else R2007 UTF-8
function dxf(s, deckIds, layout = {}, r12 = false) {
 const out = [], add = (...kv) => { for (let i = 0; i < kv.length; i += 2) out.push(String(kv[i]), String(kv[i + 1])); };
 let handle = 0x100; const hd = () => (handle++).toString(16).toUpperCase();
 const layers = [['DECK_OUTLINE', 7], ['ROOM', 3], ['ROOM_NO', 1], ['ROOM_NAME', 5], ['TITLE', 2]];
 add(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, r12 ? 'AC1009' : 'AC1021', 9, '$DWGCODEPAGE', 3, r12 ? 'ANSI_949' : 'ANSI_1252', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
 add(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', ...(r12 ? [] : [5, hd(), 100, 'AcDbSymbolTable']), 70, layers.length);
 for (const [n, c] of layers) add(0, 'LAYER', ...(r12 ? [] : [5, hd(), 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord']), 2, n, 70, 0, 62, c, 6, 'CONTINUOUS');
 add(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
 const sub = (...k) => r12 ? [] : k;
 const line = (w, dx) => add(0, 'LINE', ...sub(5, hd(), 100, 'AcDbEntity'), 8, w.layer, ...sub(100, 'AcDbLine'), 10, w.x1 + dx, 20, w.y1, 30, 0, 11, w.x2 + dx, 21, w.y2, 31, 0);
 const text = (layer, x, y, size, t) => add(0, 'TEXT', ...sub(5, hd(), 100, 'AcDbEntity'), 8, layer, ...sub(100, 'AcDbText'), 10, x, 20, y, 30, 0, 40, size, 1, t, ...sub(100, 'AcDbText'));
 for (const id of deckIds) {
  const dx = layout[id] || 0, d = s.decks.find(k => k.id === id);
  for (const w of walls(s, id)) line(w, dx);
  text('TITLE', dx, s.B + 800, 500, `N3 ${d.name} (Z ${d.z})`);
  for (const r of s.rooms.filter(k => k.deck === id)) {
   const [x0, y0, x1, y1] = r.rect, size = Math.min(180, (x1 - x0) / 9), c = G.interiorPoint([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => ({ x, y })));
   text('ROOM_NO', x0 + 120, Math.min(y1 - 300, c.y + 200), size, r.no);
   text('ROOM_NAME', x0 + 120, Math.min(y1 - 300, c.y + 200) - size * 1.7, size, r.name);
  }
 }
 add(0, 'ENDSEC', 0, 'EOF');
 return out.join('\r\n') + '\r\n';
}
// EUC-KR bytes for the Korean text of an R12 file: Node has no EUC-KR encoder, so the decoder's table is inverted once
let euckr = null;
function eucKr(text) {
 if (!euckr) { euckr = new Map(); const dec = new TextDecoder('euc-kr');
  for (let a = 0xA1; a <= 0xFE; a++) for (let b = 0xA1; b <= 0xFE; b++) { const ch = dec.decode(Uint8Array.of(a, b)); if (ch.length === 1 && ch !== '�' && !euckr.has(ch)) euckr.set(ch, [a, b]); } }
 const bytes = [];
 for (const ch of text) { const c = ch.codePointAt(0); if (c < 0x80) bytes.push(c); else { const e = euckr.get(ch); if (!e) throw new Error('EUC-KR에 없는 글자: ' + ch); bytes.push(...e); } }
 return Buffer.from(bytes);
}

function write(out, seed) {
 const s = ship(seed);
 fs.mkdirSync(out, { recursive: true });
 fs.writeFileSync(path.join(out, 'N3.inputs.json'), JSON.stringify(inputs(s), null, 1));
 fs.writeFileSync(path.join(out, 'N3_D1.dxf'), eucKr(dxf(s, ['D1'], {}, true)));
 for (const id of ['D2', 'D3']) fs.writeFileSync(path.join(out, `N3_${id}.dxf`), dxf(s, [id]));
 fs.writeFileSync(path.join(out, 'N3_ALL.dxf'), dxf(s, ['D1', 'D2', 'D3'], { D1: 0, D2: s.L + 6000, D3: 2 * (s.L + 6000) }));
 return { out, seed, lengthMm: s.L, rooms: s.rooms.length, perDeck: s.decks.map(d => `${d.id} ${s.rooms.filter(r => r.deck === d.id).length}`).join(', ') };
}
if (require.main === module) console.log(JSON.stringify(write(process.argv[2] || path.join('samples', 'n3'), +(process.argv[3] || 1))));
module.exports = { ship, inputs, dxf, walls, write, eucKr };
