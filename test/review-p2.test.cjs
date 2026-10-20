// Review 2026-10-20 P2: every room's own fresh air, units / shafts in spaces that cannot take them, T3 boundaries
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const PJ = require('../lib/project.cjs');
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8'));

test('room fresh air: a room getting less than its own minimum from the zone OA share is a check', () => {
 const s5 = load('s5.contract.json'), items = PJ.airChecks(s5).filter(k => k.code === 'ROOM_OA');
 assert.ok(items.length > 0);
 for (const k of items) {
  const z = s5.zones.find(x => x.roomIds.includes(k.roomId)), a = s5.airflow[k.roomId], need = s5.loads[k.roomId].minFreshAirCmh;
  assert.ok(z.recirculating && a.supplyCmh * z.oaPct / 100 < need, k.text); assert.equal(k.level, 'check');
 }
 // the mess (311) needs 115 CMH; at the zone share it gets far less - and the text says what would do
 const mess = items.find(k => /^311 /.test(k.text)); assert.match(mess.text, /최소 신기 115 CMH — 급기 \d+ CMH 이상 또는 AHU-AC-01 신기 비율 \d+ % 이상/);
 // a room that meets its minimum is not listed
 const ok = s5.rooms.filter(r => r.systems.supply).find(r => { const z = s5.zones.find(x => x.roomIds.includes(r.id)); return z && s5.airflow[r.id].supplyCmh * z.oaPct / 100 >= s5.loads[r.id].minFreshAirCmh; });
 assert.ok(ok && !items.some(k => k.roomId === ok.id));
});

test('a unit set in a stairway (or CO2 room, galley, machinery) is a check; in a corridor it is not', () => {
 const s5 = load('s5.contract.json'), at = no => { const r = s5.rooms.find(x => x.no === no), xs = r.polygon.map(p => p.x), ys = r.polygon.map(p => p.y); return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }; };
 s5.roots = { 'S3__AHU-AC-01': at('302') };
 let a = PJ.analyze(PJ.make({ contract: s5 }));
 assert.deepEqual(a.rootsBadRoom.map(b => [b.key, b.space]), [['S3__AHU-AC-01', '계단격실']]);
 assert.match(a.checks.find(k => k.id === 'units').text, /둘 수 없는 실 1개\(AHU-AC-01 → 302 계단실 · 계단격실\)/);
 s5.roots = { 'S3__AHU-AC-01': at('308') };
 a = PJ.analyze(PJ.make({ contract: s5 })); assert.deepEqual(a.rootsBadRoom, []);
});

test('T3 v2.4: the lowest floor over the engine room, the casing warm, unserved rooms non-AC; negative pressure kept', () => {
 const box = load('t3/T3.box.json'), t3 = load('t3.contract.json');
 const fo = box.overrides.faceBoundaryOverrides, d1 = t3.rooms.filter(r => r.deckId === 'D1');
 assert.equal(Object.keys(fo).length, d1.length); assert.ok(Object.values(fo).every(v => v.type === 'NON_AC' && v.coolingTemp === 43 && v.heatingTemp === 5));
 const data = new Map(box.overrides.roomOverrides.map(([, d]) => [d.roomName, d]));
 assert.deepEqual([data.get('기관실 케이싱').coolTemp, data.get('기관실 케이싱').heatTemp], [43, 5]);
 assert.equal(data.get('공조기실').isoClass, 'NON_AC');
 assert.ok([...data.values()].filter(d => d.windowArea > 0).every(d => d.windowSolarMode === 'auto-double-interior-shade'));
 assert.deepEqual(PJ.airChecks(t3).filter(k => k.code === 'NEG_PRESSURE'), []);
});
