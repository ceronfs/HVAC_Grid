'use strict';
// 방화 등급도 (lib/fire-plan.cjs): SOLAS ratings written on the deck plans - model, SVG, DXF - on T3 and a small layout
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const FP = require('../lib/fire-plan.cjs'), PJ = require('../lib/project.cjs'), K = require('../lib/contract.cjs'), SO = require('../lib/solas.cjs'), X = require('../lib/dxf-in.cjs');
const t3 = () => { const c = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 't3.contract.json'), 'utf8')); c.solas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 't3', 'T3.solas.json'), 'utf8')); return c; };
const solasOf = c => PJ.analyze(PJ.make({ contract: c })).solas;

test('rooms: category, space and the strictest deck rating under and over', () => {
 const c = t3(), m = FP.model(c, solasOf(c)), d1 = m.decks.find(d => d.id === 'D1'), mess = d1.rooms.find(r => r.no === '113');
 assert.equal(m.decks.length, 4); assert.deepEqual(m.decks.map(d => d.rooms.length), [20, 27, 22, 10]);
 assert.equal(mess.cat, 3); assert.equal(mess.space, '식당');
 assert.equal(mess.floor.grade, 'A-60');                                // the engine room under the lowest deck (T3.solas.json)
 assert.deepEqual(FP.roomLines(mess), ['113 선원식당', '(3) 식당', '바닥 A-60']);
 // every category used is in the legend, by the ship's own names
 assert.ok(m.cats.length >= 6 && m.cats.every(([n, name]) => name === SO.catName(m.ship, n)));
});

test('walls: pieces of one rating on one line are one run; short runs and C / outer walls get no label', () => {
 const c = t3(), s = solasOf(c), m = FP.model(c, s), d2 = m.decks.find(d => d.id === 'D2');
 const pieces = s.boundaries.filter(b => b.deckId === 'D2' && ['bulkhead', 'outer', 'void'].includes(b.kind)).length;
 assert.ok(d2.walls.length < pieces, `${d2.walls.length} runs from ${pieces} pieces`);
 // the long corridor bulkhead (y 9000, B-0 along the cabins) is labelled; no label on a run under 1 m or on C / *
 assert.ok(d2.walls.some(w => w.grade === 'B-0' && w.label && Math.abs(w.a.y - 9000) < 1 && w.lengthMm >= 5000));
 assert.ok(d2.walls.filter(w => w.label).every(w => w.lengthMm >= 1000 && w.grade !== 'C' && w.grade !== '*'));
 const withC = FP.model(c, s, { showC: true }).decks.find(d => d.id === 'D2');
 assert.ok(withC.walls.some(w => w.grade === 'C' && w.label));
 // a run is the length of its pieces (no gap counted twice)
 for (const w of d2.walls) assert.ok(Math.abs(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) - w.lengthMm) <= 1);
});

test('two collinear pieces of one rating join, a gap or another rating keeps them apart', () => {
 const R = (id, name, x0, y0, x1, y1) => ({ id, no: id, name, deckId: 'D', polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor: (x1 - x0) * (y1 - y0) / 1e6, volume: 1, calculationComplete: true });
 // two cabins over a corridor: the corridor wall is one B-0 run of 8 m (two pieces), the cabins' party wall C
 const c = K.buildContract({ source: {}, decks: [{ id: 'D', z: 0 }], rooms: [R('a', '선실 A', 0, 2000, 4000, 6000), R('b', '선실 B', 4000, 2000, 8000, 6000), R('cor', '복도', 0, 0, 8000, 2000)] });
 const m = FP.model(c, solasOf(c)), runs = m.decks[0].walls.filter(w => w.grade === 'B-0');
 assert.equal(runs.length, 1); assert.equal(runs[0].lengthMm, 8000); assert.equal(runs[0].ids.length, 2);
});

test('SVG: rating labels on the walls, room labels, the legend', () => {
 const c = t3(), m = FP.model(c, solasOf(c)), svg = FP.toSvg(m, 'D1', { width: 1200 });
 assert.match(svg, /^<svg[^>]+class="fireplan" data-deck="D1"/); assert.ok(svg.endsWith('</svg>'));
 const labels = [...svg.matchAll(/font-weight="700"[^>]*>([^<]+)<\/text>/g)].map(x => x[1]);
 assert.equal(labels.length, m.decks.find(d => d.id === 'D1').walls.filter(w => w.label).length);
 assert.ok(labels.includes('A-60') && labels.includes('A-0') && labels.includes('B-0'));
 assert.match(svg, />\(3\) 식당</); assert.match(svg, />바닥 A-60</);
 const legend = FP.legendHtml(m); assert.match(legend, /A-60/); assert.match(legend, /\(3\) /); assert.match(legend, /방화방식 IC/);
 assert.ok(!/<script/i.test(svg + legend));
});

test('DXF: R12, a layer per rating for lines and labels, Korean text restored, every room', () => {
 const c = t3(), m = FP.model(c, solasOf(c)), dxf = FP.toDxf(m), ents = X.entities(dxf);
 assert.match(dxf, /\$ACADVER\r\n1\r\nAC1009/); assert.ok(dxf.endsWith('EOF\r\n'));
 const texts = ents.filter(e => e.type === 'TEXT').map(e => ({ ...e, text: X.decode(e.text) })), labels = texts.filter(e => /^FIRE_TEXT_/.test(e.layer));
 assert.equal(labels.length, m.decks.reduce((t, d) => t + d.walls.filter(w => w.label).length, 0));
 assert.ok(labels.every(e => e.layer === 'FIRE_TEXT_' + FP.gradeKey(e.text)));
 assert.ok(ents.filter(e => e.type === 'LINE' && /^FIRE_(A|B|C|STAR|NONE)/.test(e.layer)).length >= m.decks.reduce((t, d) => t + d.walls.length, 0));
 assert.ok(texts.some(e => e.layer === 'FIRE_CAT' && e.text === '(3) 식당'));
 assert.ok(texts.some(e => e.layer === 'DECK_TITLE' && /^방화 등급도 — UPPER DK/.test(e.text)));
 assert.equal(X.rooms(dxf, { roomLayers: /^ROOM$/ }).length, c.rooms.length);
});
