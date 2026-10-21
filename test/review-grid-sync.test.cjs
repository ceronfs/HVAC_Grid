'use strict';
// regressions for the standalone tool's review brought to HVAC Grid (docs/REVIEW_2026-10-21_SOLAS_TOOL.md 5): G-1 decks
// over each other, G-3 SOLAS choices that no longer find their room or wall (G-2 is in test/e2e/project-box.e2e.cjs)
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const PJ = require('../lib/project.cjs'), SO = require('../lib/solas.cjs');
const ROOT = path.join(__dirname, '..');
const load = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', f), 'utf8'));
const kinds = c => { const k = {}; for (const x of SO.boundaries(c).boundaries) k[x.kind] = (k[x.kind] || 0) + 1; return k; };
// the top deck of T3 moved in plan, as a BOX deck offset set wrong would put it
function shifted(dx, dy) {
 const c = load('t3.contract.json'), top = [...c.decks].sort((a, b) => b.elevationMm - a.elevationMm)[0];
 const mv = p => ({ x: p.x + dx, y: p.y + dy });
 for (const r of c.rooms) if (r.deckId === top.id) { r.polygon = r.polygon.map(mv); r.holes = (r.holes || []).map(h => h.map(mv)); }
 return { c, top };
}

test('G-1: T3 and S5 decks stand over each other (no warning)', () => {
 for (const f of ['t3.contract.json', 's5.contract.json']) { const c = load(f); assert.deepEqual(PJ.deckAlignment(c, SO.boundaries(c).classes), [], f); }
 const a = PJ.analyze({ contract: load('t3.contract.json'), results: {}, geometry: {} }).checks.find(k => k.id === 'deckAlign');
 assert.equal(a.level, 'ok');
});

test('G-1: a deck 8 m off its place is found, with the move that puts it back', () => {
 const { c, top } = shifted(8000, -300), b = SO.boundaries(c);
 assert.notDeepEqual(kinds(c), kinds(load('t3.contract.json')), 'the shift changes the deck boundaries');
 const got = PJ.deckAlignment(c, b.classes);
 assert.equal(got.length, 1); assert.equal(got[0].upperDeckId, top.id); assert.deepEqual(got[0].moveMm, { x: -8000, y: 300 }); assert.deepEqual(got[0].kinds, ['계단격실']);
 const chk = PJ.analyze({ contract: c, results: {}, geometry: {} }).checks.find(k => k.id === 'deckAlign');
 assert.equal(chk.level, 'check'); assert.match(chk.text, /B DK→NAV BRG DK.*X -8000 · Y 300 mm/);
 // the move suggested gives T3's boundaries back
 const back = shifted(8000 + got[0].moveMm.x, -300 + got[0].moveMm.y).c; assert.deepEqual(kinds(back), kinds(load('t3.contract.json')));
});

test('G-1: decks with no shaft kind in common, or at one elevation, are not judged', () => {
 const { c: m } = shifted(8000, 0); for (const r of m.rooms) if (/계단|트렁크|케이싱/.test(r.name)) r.name = '창고';
 assert.deepEqual(PJ.deckAlignment(m, SO.boundaries(m).classes), []);
 const { c: z } = shifted(8000, 0), top = [...z.decks].sort((a, b) => b.elevationMm - a.elevationMm); top[0].elevationMm = top[1].elevationMm;
 assert.deepEqual(PJ.deckAlignment(z, SO.boundaries(z).classes), [], 'one elevation: the duplicate elevation check says it');
});

test('G-3: SOLAS choices whose room or wall is gone are counted and kept', () => {
 const c = load('t3.contract.json'), b = SO.boundaries(c), wall = b.boundaries.find(x => x.kind === 'bulkhead'), room = c.rooms[0];
 c.solas = { ...(c.solas || {}), rooms: { [room.id]: { space: '로커·창고 — 4㎡ 초과' }, GONE_ROOM: { space: '로커·창고 — 4㎡ 초과' } }, bounds: { [wall.id]: { grade: 'A-60' }, 'B:x|y|1,2': { grade: 'A-0' } } };
 assert.deepEqual(SO.staleSettings(c), { rooms: ['GONE_ROOM'], bounds: ['B:x|y|1,2'] });
 const chk = PJ.analyze({ contract: c, results: {}, geometry: {} }).checks.find(k => k.id === 'solasStale');
 assert.equal(chk.level, 'check'); assert.match(chk.text, /실 분류 1 · 벽·갑판 등급 1/);
 assert.equal(Object.keys(c.solas.bounds).length, 2, 'kept: the wall may come back');
 // nothing stale: no such check line
 delete c.solas.rooms.GONE_ROOM; delete c.solas.bounds['B:x|y|1,2'];
 assert.equal(PJ.analyze({ contract: c, results: {}, geometry: {} }).checks.find(k => k.id === 'solasStale'), undefined);
});
