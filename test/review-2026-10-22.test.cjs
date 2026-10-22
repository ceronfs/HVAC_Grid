'use strict';
// review 2026-10-22 (HVAC_Grid_review_2026-10-22.md): Grid defects #1-#4, #6, #9 and the vendor BOX copy patches N2 / O2
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const K = require('../lib/contract.cjs'), PJ = require('../lib/project.cjs'), PL = require('../lib/phg-plan.cjs'), RP = require('../lib/report.cjs');

const ROOT = path.join(__dirname, '..'), load = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', f), 'utf8'));
const R = (id, name, x0, y0, x1, y1, sys, l = {}) => ({ id, no: id, name, deckId: l.deck || 'D', isoClass: 'AC', polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor: (x1 - x0) * (y1 - y0) / 1e6,
 volume: (x1 - x0) * (y1 - y0) * 2.8 / 1e6, sup: sys.s, exh: sys.e, ret: sys.r, coolingSensibleW: l.w || 0, minimumFreshAirCmh: l.oa || 0, ventilationAirCmh: l.achAir || 0, calculationComplete: l.complete ?? true });
const make = (rooms, decks = [{ id: 'D', z: 0 }]) => K.buildContract({ source: {}, decks, rooms });

// one L-shaped 400 x 200 duct from the Root to each RU (as test/project.test.cjs)
function fakeRun(contract) {
 const plans = PL.plan(contract), results = {}, geometry = {};
 for (const p of plans) {
  results[p.key] = { rus: p.rus.length, flowCmh: p.designCmh, ducts: p.rus.length, lengthM: 10, indexPa: 100, auto: true, unconnected: 0, at: 1, sig: PJ.planSig(p) };
  geometry[p.key] = { ducts: p.rus.map((u, i) => ({ displayName: 'D' + i, type: 'branch', widthMm: 400, heightMm: 200, flowCmh: u.flowCmh, points: [{ x: p.root.x, y: -p.root.y }, { x: u.x, y: -p.root.y }, { x: u.x, y: -u.y }] })) };
 }
 return PJ.make({ contract, results, geometry });
}

test('#1: a stale plan\'s old duct network is left out of penetrations, dampers, passages and the outputs', () => {
 const pr = fakeRun(load('t3.contract.json')), a0 = PJ.analyze(pr);
 const key = Object.keys(pr.geometry).find(k => a0.solas.penetrations.filter(p => p.planKey === k && p.damper).length > 0);
 const pens = a0.solas.penetrations.filter(p => p.planKey === key).length, fd = a0.solas.summary.fireDampers;
 pr.results[key].sig = 'changed';   // the plan has changed since (ΔT, unit location ...)
 const a = PJ.analyze(pr);
 assert.equal(a.results[key].stale, true);
 assert.deepEqual(a.staleNets, [key]);
 assert.equal(a.solas.penetrations.filter(p => p.planKey === key).length, 0);
 assert.equal(a.solas.penetrations.length, a0.solas.penetrations.length - pens);
 assert.ok(a.solas.summary.fireDampers < fd);
 assert.ok(a.solas.passages.every(p => p.planKey !== key && !(p.deckId === a.plans.find(x => x.key === key).deckId && p.systemId === a.plans.find(x => x.key === key).systemId)));
 assert.equal(a.geometry[key], undefined); assert.ok(pr.geometry[key], 'the project keeps it - sent again it counts');
 assert.match(a.checks.find(k => k.id === 'auto').text, /옛 덕트망 1개는 관통·방화댐퍼/);
 const ducts = RP.sheets(pr, a).find(s => s.name === '덕트').rows, p = a.plans.find(x => x.key === key);
 assert.equal(ducts.filter(r => r[2] === p.systemId && r[0] === pr.contract.decks.find(d => d.id === p.deckId).name).length, 0);
});

test('#2: a deck id with "__" in it - a unit set inside a room is not "outside"', () => {
 const c = make([R('r1', '선실', 0, 0, 6000, 4000, { s: 'AHU' }, { w: 1500, deck: 'A__B' })], [{ id: 'A__B', z: 0 }]);
 const p = PL.plan(c)[0]; c.roots = { [p.key]: { x: 3000, y: 2000 } };
 const a = PJ.analyze({ contract: c, results: {}, geometry: {} });
 assert.deepEqual(a.rootsOutside, []);
 c.roots = { [p.key]: { x: 30000, y: 2000 } };
 assert.deepEqual(PJ.analyze({ contract: c, results: {}, geometry: {} }).rootsOutside, [p.key]);
});

test('#3: rules.roundCmh must be a positive whole step - named in the message', () => {
 const c = make([R('r1', '선실', 0, 0, 6000, 4000, { s: 'AHU' }, { w: 1500 })]);
 assert.deepEqual(K.validate(c), []);
 for (const v of [0, -10, 2.5, '10']) assert.ok(K.validate({ ...c, rules: { ...c.rules, roundCmh: v } }).some(m => /rules\.roundCmh/.test(m)), String(v));
 assert.throws(() => PJ.read({ ...c, rules: { ...c.rules, roundCmh: 0 } }), /rules\.roundCmh/);
});

test('#4: the examples record the BOX copy they were made from', () => {
 const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'vendor', 'BOX_CAL_Enhance.html'))).digest('hex').slice(0, 16);
 for (const f of ['s5.contract.json', 't3.contract.json']) assert.equal(load(f).source.sha256, sha, `${f}: npm run extract:s5 / make:t3 after a vendor patch`);
});

test('#6: a room whose load is not finished shows no partial load in the 격실 sheet', () => {
 const c = make([R('r1', '선실', 0, 0, 6000, 4000, { s: 'AHU' }, { w: 1500 }), R('r2', '선실 2', 6000, 0, 12000, 4000, { s: 'AHU' }, { w: 900, complete: false })]);
 const pr = PJ.make({ contract: c }), rows = RP.sheets(pr, PJ.analyze(pr)).find(s => s.name === '격실').rows;
 assert.equal(rows[0][8], 1500); assert.deepEqual(rows[1].slice(8, 12), ['', '', '', '']);
});

test('#9: a cabin toilet with its own supply is a private sanitary room (ISO 7547 6.4.1)', () => {
 // named after the cabin it belongs to; supplied for its own load, so it takes no transfer air (the balance does not
 // mark it en-suite)
 const rooms = [R('cab', '선실', 0, 0, 6000, 4000, { s: 'AHU', r: 'RA' }, { w: 2000 }), R('wc', '선실 화장실', 6000, 0, 8000, 2000, { s: 'AHU', e: 'EF' }, { w: 1500, achAir: 60 }),
  R('cor', '복도', 0, 4000, 8000, 6000, { s: 'AHU', r: 'RA' }, { w: 300 })];
 const c = make(rooms);
 assert.equal(c.airflow.wc.transferInCmh, 0);
 const x = PJ.airChecks(c).find(x => x.roomId === 'wc' && x.code === 'EXHAUST_ISO');
 assert.match(x.text, /개인 위생실 max\(72 CMH, 10회\/h\) 112/);   // 11.2 m³: 10 ACH = 112; common 15 ACH would be 168
});

// the vendor BOX copy's CAL frame (base64 in the host page)
const frame = (() => { const html = fs.readFileSync(path.join(ROOT, 'vendor', 'BOX_CAL_Enhance.html'), 'utf8');
 return Buffer.from(html.match(/const CAL_ENHANCE_FRAME_BASE64 = '([A-Za-z0-9+/=]+)'/)[1], 'base64').toString('utf8'); })();

test('N2: the CAL workbook\'s winter minimum airflow uses 22 K, as the screen does (ISO 7547 6.3)', () => {
 assert.ok(frame.includes('r.valid?f(`D${row}/(0.000335*22)`,r.winterMin)'));
 assert.ok(!frame.includes('0.000335*23'));
});

test('O2: ISO 7547 Table 1 temperatures only for rooms without supply (5.2.2: conditioned vs non-air-conditioned)', () => {
 const at = frame.indexOf('  function roomDesignConditions('), end = frame.indexOf('\n  }\n', at);
 const DC = { indoorCoolTemp: 25, indoorCoolRh: 55, indoorHeatTemp: 21 };
 const rdc = new Function('DC', frame.slice(at, end + 4) + '\nreturn roomDesignConditions;')(DC);
 const iso = { coolTemp: 25, coolingRh: 55, heatTemp: 21, heatingRh: 40 };
 for (const n of ['복도', '세탁실', '탈의실', '공용 화장실', '선원침실 화장실', '계단실']) assert.deepEqual(rdc(n, true), iso, n);
 assert.equal(rdc('복도').coolTemp, 27); assert.equal(rdc('복도').heatTemp, 16);   // +2 / -5 K without supply
 assert.equal(rdc('세탁실').coolTemp, 36); assert.equal(rdc('공용 화장실').coolTemp, 31);
 // machinery and stores keep Table 1 also when ventilated: their supply is ventilation, not air conditioning
 assert.equal(rdc('보일러실', true).coolTemp, 53); assert.equal(rdc('주기관실', true).coolTemp, 43); assert.equal(rdc('창고', true).coolTemp, 27);
 assert.equal(frame.split('roomDesignConditions(').length - 1, 3, 'definition and two callers');
 assert.ok(frame.includes('design = roomDesignConditions(roomName, !!String(o.sup || "").trim()),'));
 assert.ok(frame.includes("design=roomDesignConditions(o.roomName||room.name||'',!!String(o.sup??room.sup??'').trim());"));
});
