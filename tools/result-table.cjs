// Markdown tables of a run (out/<name>/project.json) for the result documents: every deck and system, the systems with
// their vertical ducts and pressures, the air handling zones, the SOLAS counts and the review.
//   node tools/result-table.cjs out/t3/project.json
'use strict';
const fs = require('fs'), PJ = require('../lib/project.cjs'), PL = require('../lib/phg-plan.cjs'), { ROOT_TEXT } = require('../lib/report.cjs');
const project = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), a = PJ.analyze(project), c = project.contract, res = project.results;
const deck = id => c.decks.find(d => d.id === id)?.name || id, n = v => v == null ? '—' : Number(v).toLocaleString('en-US');
const out = [];
out.push('| Deck · 계통 | 시작점 | RU | RU 풍량 / 설계 (CMH) | 덕트 | 길이 | Deck 최대 | 수직 덕트 | AUTO |', '|---|---|---|---|---|---|---|---|---|');
for (const p of a.plans) { const r = res[p.key] || {}, sd = a.systems.find(s => s.systemKey === p.systemKey)?.decks.find(d => d.key === p.key);
 out.push(`| ${deck(p.deckId)} · ${PL.KIND_LABEL[p.kind]} ${p.systemId} | ${p.isUnitDeck ? '공조기·팬' : '수직 덕트'} · ${ROOT_TEXT(p.rootSource)} | ${r.rus ?? '—'} | ${n(r.flowCmh)} / ${n(p.designCmh)} | ${r.ducts ?? '—'} | ${r.lengthM ?? '—'} m | ${r.indexPa ?? '—'} Pa | ${sd?.riserPa ? sd.riserPa + ' Pa' : '—'} | ${r.seconds ?? '—'} s |`); }
out.push('', '| 계통 | 종류 | 공조기 Deck | 팬 풍량 (CMH) | 수직 덕트 | 덕트 외부 정압 ESP | 팬 정압 추정 |', '|---|---|---|---|---|---|---|');
for (const s of a.systems) out.push(`| ${s.systemId} | ${PL.KIND_LABEL[s.kind]} | ${deck(s.unitDeckId)} | ${n(s.fanCmh)} | ${s.risers.length ? s.risers.map(r => `${r.fromDeckId}→${r.toDeckId} ${r.widthMm}×${r.heightMm} ${n(r.flowCmh)} CMH ${r.totalPa} Pa`).join('<br>') : '—'} | ${s.indexPa ?? '—'} Pa (${deck(s.indexDeckId)}) | ${s.fanPa ?? '—'} Pa |`);
out.push('', '| 공조 구역 | 급기 SA | 배기 EA | 신기 OA | 환기 RA | 신기 % | 판정 |', '|---|---|---|---|---|---|---|');
for (const z of a.zones) out.push(`| ${z.supplySystemId} | ${n(z.saCmh)} | ${n(z.eaCmh)} | ${n(z.oaCmh)} | ${n(z.raCmh)} | ${z.oaPct} | ${z.ok ? '적합' : '급기 부족'} |`);
const sum = a.solas.summary;
out.push('', `SOLAS: 경계 ${sum.boundaries} (${Object.entries(sum.byGrade).map(([g, k]) => `${g} ${k}`).join(', ')}), 관통 ${sum.penetrations}, 방화댐퍼 ${sum.fireDampers}, 슬리브 ${Object.entries(sum.sleeves).map(([m, k]) => `${m} mm × ${k}`).join(', ')}, 미분류 ${sum.unclassified.length}, 제한 구역 통과 금지 ${sum.passagesFail} · 확인 ${sum.passagesCheck}`);
out.push('', '검토: ' + a.checks.map(k => ({ ok: '✓ ', check: '● ', fail: '✕ ' }[k.level]) + k.text).join(' · '));
console.log(out.join('\n'));
