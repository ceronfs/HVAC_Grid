// Markdown table of a run (out/<name>/project.json) for the result documents: every deck and system with its numbers.
//   node tools/result-table.cjs out/t3/project.json
'use strict';
const fs = require('fs'), PJ = require('../lib/project.cjs'), PL = require('../lib/phg-plan.cjs'), { ROOT_TEXT } = require('../lib/report.cjs');
const project = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), a = PJ.analyze(project), c = project.contract, res = project.results;
const deck = id => c.decks.find(d => d.id === id)?.name || id, n = v => v == null ? '—' : Number(v).toLocaleString('en-US');
const rows = a.plans.map(p => { const r = res[p.key] || {}, sd = a.systems.find(s => s.systemKey === p.systemKey)?.decks.find(d => d.key === p.key);
 return `| ${deck(p.deckId)} · ${PL.KIND_LABEL[p.kind]} ${p.systemId} | ${p.isUnitDeck ? '공조기·팬' : '수직 덕트'} · ${ROOT_TEXT(p.rootSource)} | ${r.rus ?? '—'} | ${n(r.flowCmh)} / ${n(p.designCmh)} | ${r.ducts ?? '—'} | ${r.lengthM ?? '—'} m | ${r.indexPa ?? '—'} Pa | ${sd?.riserPa ? sd.riserPa + ' Pa' : '—'} | ${r.seconds ?? '—'} s |`; });
console.log('| Deck · 계통 | 시작점 | RU | RU 풍량 / 설계 (CMH) | 덕트 | 길이 | Deck 최대 | 수직 덕트 | AUTO |\n|---|---|---|---|---|---|---|---|---|\n' + rows.join('\n'));
console.log('\n| 계통 | 종류 | 공조기 Deck | 팬 풍량 (CMH) | 수직 덕트 | 계통 최대 압력손실 |\n|---|---|---|---|---|---|');
for (const s of a.systems) console.log(`| ${s.systemId} | ${PL.KIND_LABEL[s.kind]} | ${deck(s.unitDeckId)} | ${n(s.fanCmh)} | ${s.risers.length ? s.risers.map(r => `${r.fromDeckId}→${r.toDeckId} ${r.widthMm}×${r.heightMm} ${n(r.flowCmh)} CMH ${r.totalPa} Pa`).join('<br>') : '—'} | ${s.indexPa ?? '—'} Pa (${deck(s.indexDeckId)}) |`);
const sum = a.solas.summary;
console.log(`\nSOLAS: 경계 ${sum.boundaries} (${Object.entries(sum.byGrade).map(([g, k]) => `${g} ${k}`).join(', ')}), 관통 ${sum.penetrations}, 방화댐퍼 ${sum.fireDampers}, 슬리브 ${Object.entries(sum.sleeves).map(([m, k]) => `${m} mm × ${k}`).join(', ')}, 미분류 ${sum.unclassified.length}`);
console.log('검토: ' + a.checks.map(k => (k.ok ? '✓ ' : '● ') + k.text).join(' · '));
