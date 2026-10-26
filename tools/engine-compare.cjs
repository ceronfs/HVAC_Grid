// V2-1.7 the new duct engine (lib/duct/engine.cjs) against 1.0 (PHG D) on every plan of S5, T3 and N3 - from the
// golden values (test/fixtures/phg-golden: the plans 1.0 sent, PHG D's results; v1-golden: the rooms). D8: the same
// function, not the same numbers - this lists the differences (docs/v2/STUDY_PHG.md 7).
//   node tools/engine-compare.cjs [--select=cost|pressure] [--md=<file>] [--json=<file>]
// Columns: RUs joined, zones relaxed, length (m), ducts (straight pieces), main length (m), index pressure (Pa), seconds.
'use strict';
const fs = require('fs'), path = require('path');
const P = require('./phg-golden.cjs'), G = require('./v1-golden.cjs'), E = require('../lib/duct/engine.cjs');
const ROOT = path.join(__dirname, '..');

const len = ds => ds.reduce((t, d) => t + Math.abs(d.points[0].x - d.points.at(-1).x) + Math.abs(d.points[0].y - d.points.at(-1).y), 0) / 1000;
const lenOf = (ds, type) => len(ds.filter(d => d.type === type));

function compare({ select = 'pressure' } = {}) {
 const rows = [];
 for (const ship of ['s5', 't3', 'n3']) {
  const dir = path.join(P.FIXTURES, ship), index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), rooms = G.read(path.join(G.FIXTURES, ship), 'project').contract.rooms;
  for (const key of index.order) {
   const e = P.ungz(path.join(dir, P.safe(key) + '.json.gz')), w = e.auto.result, t0 = Date.now(), a = E.auto(e.plan, rooms, { select }), g = a.result;
   rows.push({ ship, key, kind: e.plan.kind, rus: g.rus, joined: g.rus - g.unconnected, zones: g.zonesRelaxed, zones1: w.zonesRelaxed, relaxedRus: g.relaxedRus.length,
    lengthM: +len(a.network.ducts).toFixed(1), lengthM1: w.lengthM, ducts: g.ducts, ducts1: w.ducts, mainM: +lenOf(a.network.ducts, 'main').toFixed(1), mainM1: +lenOf(e.auto.ducts, 'main').toFixed(1),
    indexPa: g.indexPa, indexPa1: w.indexPa, spine: g.spine, seconds: (Date.now() - t0) / 1000 });
  }
 }
 const ratio = (a, b) => rows.filter(r => r[b] > 0).map(r => r[a] / r[b]).sort((x, y) => x - y), q = v => ({ min: +v[0].toFixed(2), median: +v[v.length >> 1].toFixed(2), max: +v.at(-1).toFixed(2) });
 const within = (a, b, p) => rows.filter(r => r[b] > 0 && Math.abs(r[a] / r[b] - 1) <= p).length;
 const summary = { select, plans: rows.length, joined: rows.reduce((t, r) => t + r.joined, 0), rus: rows.reduce((t, r) => t + r.rus, 0), zonesSame: rows.filter(r => r.zones === r.zones1).length,
  length: q(ratio('lengthM', 'lengthM1')), indexPa: q(ratio('indexPa', 'indexPa1')), lengthWithin15: within('lengthM', 'lengthM1', 0.15), paWithin15: within('indexPa', 'indexPa1', 0.15),
  seconds: +rows.reduce((t, r) => t + r.seconds, 0).toFixed(1) };
 return { rows, summary };
}

function markdown({ rows, summary }) {
 const L = [`| 배 | 계획 | RU 연결 | 금지 구역 완화 (새 / 1.0) | 길이 m (새 / 1.0) | 덕트 조각 | 주관 m | 지수 압력 Pa (새 / 1.0) | 척추 | s |`, '|---|---|---|---|---|---|---|---|---|---|'];
 for (const r of rows) L.push(`| ${r.ship.toUpperCase()} | ${r.key} | ${r.joined}/${r.rus}${r.relaxedRus ? ` (규칙 완화 ${r.relaxedRus})` : ''} | ${r.zones || '-'} / ${r.zones1 || '-'} | ${r.lengthM} / ${r.lengthM1} | ${r.ducts} / ${r.ducts1} | ${r.mainM} / ${r.mainM1} | ${r.indexPa} / ${r.indexPa1} | ${r.spine || '-'} | ${r.seconds.toFixed(1)} |`);
 const s = summary;
 return [`선택 기준 \`${s.select}\` · 계획 ${s.plans} · RU 연결 ${s.joined}/${s.rus} · 금지 구역 완화 같음 ${s.zonesSame}/${s.plans} · 길이 비 ${s.length.min}/${s.length.median}/${s.length.max} (최소/중앙/최대), ±15 % 안 ${s.lengthWithin15} · 지수 압력 비 ${s.indexPa.min}/${s.indexPa.median}/${s.indexPa.max}, ±15 % 안 ${s.paWithin15} · 계산 ${s.seconds} s(한 스레드)`, '', ...L].join('\n');
}

if (require.main === module) {
 const args = process.argv.slice(2), opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || null;
 const r = compare({ select: opt('select') || 'pressure' });
 console.log(JSON.stringify(r.summary));
 if (opt('md')) fs.writeFileSync(path.resolve(ROOT, opt('md')), markdown(r) + '\n');
 if (opt('json')) fs.writeFileSync(path.resolve(ROOT, opt('json')), JSON.stringify(r, null, 1));
}

module.exports = { compare, markdown };
