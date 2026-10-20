// System diagrams (계통도): lib/diagram.cjs on the T3 test ship, to SVG and into the integrated DXF
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const PJ = require('../lib/project.cjs'), DG = require('../lib/diagram.cjs'), DX = require('../lib/dxf-out.cjs'), X = require('../lib/dxf-in.cjs');
const t3 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 't3.contract.json'), 'utf8'));

test('one diagram per system: unit, risers with their sizes, a box for every deck served', () => {
 const a = PJ.analyze(PJ.make({ contract: t3 })), ds = DG.systemDiagrams(t3, a);
 assert.equal(ds.length, a.systems.length);
 assert.deepEqual(ds.slice(0, 3).map(d => d.kind), ['supply', 'supply', 'supply'], 'supply first');
 const acc = ds.find(d => d.systemId === 'AHU-ACC'), sys = a.systems.find(s => s.systemId === 'AHU-ACC');
 const texts = acc.items.filter(i => i.t === 'text').map(i => i.s);
 assert.ok(texts.some(s => s.startsWith('AHU-ACC · 급기(SA)')));
 for (const r of sys.risers) assert.ok(texts.includes(`${r.widthMm}×${r.heightMm}`), r.id);
 assert.equal(acc.items.filter(i => i.t === 'rect' && i.key).length, sys.decks.length, 'a box per deck served');
 assert.ok(texts.includes('공조기'));
 // no AUTO yet: every deck box says so
 assert.equal(texts.filter(s => s.startsWith('AUTO 전')).length, sys.decks.length);
 const svg = DG.toSvg(acc); assert.match(svg, /^<svg[^>]+class="sysdia"/); assert.equal((svg.match(/data-plan=/g) || []).length, sys.decks.length);
 // a one-deck exhaust fan: no shaft, the arrow points to the fan
 const bat = ds.find(d => d.systemId === 'EF-BAT'); assert.equal(bat.items.filter(i => i.t === 'circle').length, 0);
});

test('the integrated DXF carries the diagrams on their own layers, under the decks', () => {
 const a = PJ.analyze(PJ.make({ contract: t3 })), ds = DG.systemDiagrams(t3, a);
 const txt = DX.integratedDxf(t3, { plans: a.plans, geometry: {}, diagrams: ds }), ents = X.entities(txt);
 const dia = ents.filter(e => /^DIAGRAM_/.test(e.layer)), rooms = ents.filter(e => e.layer === 'ROOM');
 assert.ok(dia.length > 100); assert.ok(dia.some(e => e.layer === 'DIAGRAM_SUPPLY') && dia.some(e => e.layer === 'DIAGRAM_EXHAUST') && dia.some(e => e.layer === 'DIAGRAM_RETURN'));
 const roomMinY = Math.min(...rooms.flatMap(e => e.pts.map(p => p.y)).filter(Number.isFinite)), diaMaxY = Math.max(...dia.flatMap(e => e.pts.length ? e.pts.map(p => p.y) : [e.y]).filter(Number.isFinite));   // R12 POLYLINE: the points are its vertices
 assert.ok(diaMaxY < roomMinY, 'diagrams below the decks');
 assert.ok(dia.some(e => e.type === 'TEXT' && /AHU-ACC/.test(X.decode(e.text))));
});
