'use strict';
// one canvas (docs/PLAN.md H5): ⑤ draws the 방화 등급도's own layer on the plan (lib/fire-plan.cjs layout) and its rows
// point at places (lib/report.cjs openItemsAt) - the outputs stay as they were (test/v1-golden.test.cjs: the HTML hash)
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const FP = require('../lib/fire-plan.cjs'), PJ = require('../lib/project.cjs'), RP = require('../lib/report.cjs'), K = require('../lib/contract.cjs');
const t3 = () => { const c = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 't3.contract.json'), 'utf8')); c.solas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 't3', 'T3.solas.json'), 'utf8')); return c; };

test('fire layer: the same runs and penetrations for the report (y up) and the plan (y down as BOX)', () => {
 const c = t3(), a = PJ.analyze(PJ.make({ contract: c })), m = FP.model(c, a.solas), d = m.decks.find(x => x.id === 'D2'), s = v => v / 0.05;
 const up = FP.layout(d, { s, flip: true }), down = FP.layout(d, { s });
 assert.equal(up.walls.length, d.walls.length); assert.equal(down.pens.length, d.pens.length);
 for (const [i, w] of down.walls.entries()) {
  const u = up.walls[i];
  assert.deepEqual([w.x1, w.x2], [u.x1, u.x2]); assert.deepEqual([w.y1, w.y2], [-u.y1, -u.y2]);   // the plan's y is BOX y
  assert.equal(w.y1, d.walls[i].a.y); assert.equal(w.color, u.color);
  if (w.label) assert.equal(w.label.rot, -u.label.rot);   // along the wall both ways
 }
 // the report's drawing is made from the layer: every run and labelled penetration in it
 const svg = FP.toSvg(m, 'D2');
 assert.equal((svg.match(/<line data-run=/g) || []).length, d.walls.length);
 assert.equal((svg.match(/<text data-run=/g) || []).length, up.walls.filter(w => w.label).length);
 for (const p of up.pens.filter(p => p.label)) assert.ok(svg.includes(`>${p.label.text}</text>`), p.label.text);
});

test('open items: each with the place it is about; openItems is the same list without them', () => {
 const c = t3(), pj = PJ.make({ contract: K.applyRules(c) }), a = PJ.analyze(pj), at = RP.openItemsAt(pj, a);
 assert.deepEqual(RP.openItems(pj, a), at.map(([lv, area, text]) => [lv, area, text]));
 assert.ok(at.length > 5);
 const rooms = new Set(c.rooms.map(r => r.id)), keys = new Set(a.plans.map(p => p.key)), bnd = new Set(a.solas.boundaries.map(b => b.id)), decks = new Set(c.decks.map(d => d.id));
 for (const [, area, text, p] of at) {
  if (!p) continue;
  const ok = (p.roomId && rooms.has(p.roomId)) || (p.key && keys.has(p.key)) || (p.boundary && bnd.has(p.boundary)) || (p.systemId && a.plans.some(x => x.systemId === p.systemId)) || (decks.has(p.deckId) && Number.isFinite(p.x));
  assert.ok(ok, `${area}: ${text} → ${JSON.stringify(p)}`);
 }
 // no network yet: every plan's "AUTO 결과 없음" points at the plan
 assert.equal(at.filter(([, area, , p]) => area === 'AUTO' && p?.key).length, a.plans.length);
 assert.ok(at.some(([, area, , p]) => area === '방화 경계' && p?.boundary) || !a.solas.boundaries.some(b => b.check.length), 'a wall to check points at its wall');
});
