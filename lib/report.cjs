// Outputs over one project and its review (lib/project.cjs analyze): the integrated XLSX sheets (rooms, systems,
// deck networks, ducts, vertical ducts, RUs, fire boundaries, penetrations, material, review) and a printable HTML
// report with the deck plans. Pure - the shell downloads them, tools/hvac-report.cjs writes them.
'use strict';
const PL = require('./phg-plan.cjs'), SO = require('./solas.cjs'), SVG = require('./plan-svg.cjs');

const r1 = v => v == null || !Number.isFinite(+v) ? '' : Math.round(v * 10) / 10;
const r0 = v => v == null || !Number.isFinite(+v) ? '' : Math.round(v);
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROOT_TEXT = src => !src ? '' : src === 'user' ? '지정' : src.startsWith('fan-room') ? '팬룸 ' + src.split(':')[1] : src.startsWith('shaft-room') ? '샤프트 ' + src.split(':')[1] : src === 'above-unit' ? '공조기 수직 위·아래' : src.includes('corridor') ? '임시 (복도 ' + src.split(':').pop() + ' 끝)' : '임시 (Deck 모서리)';
const STATUS = r => !r?.at ? '미생성' : r.stale ? '다시 보내기 필요' : r.auto ? 'AUTO 완료' : 'RU 배치';
const len = d => d.points.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - d.points[i].x, q.y - d.points[i].y), 0) / 1000;

function sheets(project, a) {
 const c = project.contract, res = project.results || {}, deck = id => c.decks.find(d => d.id === id)?.name || id, room = id => c.rooms.find(r => r.id === id);
 const roomText = id => { const r = room(id); return r ? `${r.no} ${r.name}` : ''; };
 const S = SO.DEFAULT_SETTINGS, ship = a.solas.settings.ship || S.ship;
 const out = [];
 out.push({ name: '요약', head: ['항목', '값'], widths: [34, 60], rows: [
  ['프로젝트', c.source?.project || ''], ['BOX 원본', `${c.source?.app || ''} ${c.source?.sha256 || ''}`], ['저장', project.savedAt || ''],
  ['Deck', c.decks.length], ['격실', c.rooms.length], ['급기 ΔT (K)', c.rules.supplyDeltaTK],
  ...PL.KINDS.map(k => [`${PL.KIND_LABEL[k]} 계통 / 풍량 (CMH)`, `${c.systems.filter(s => s.kind === k).length} / ${c.systems.filter(s => s.kind === k).reduce((t, s) => t + s.designCmh, 0)}`]),
  ['Deck·계통 덕트망', `${a.done}/${a.total} AUTO 완료`], ['수직 덕트', `${a.risers.length}개 · ${r1(a.risers.reduce((t, r) => t + r.lengthM, 0))} m`],
  ['SOLAS 선종 / 방화방식', `${SO.DATA.ships[ship].label} (Table ${SO.DATA.ships[ship].tB}/${SO.DATA.ships[ship].tD}) / ${a.solas.settings.method}`],
  ['방화 경계', a.solas.summary.boundaries], ['덕트 관통', `${a.solas.summary.penetrations}곳 · 방화댐퍼 ${a.solas.summary.fireDampers}개`],
  ...a.checks.map(k => [k.ok ? '✓ 검토' : '● 검토', k.text]), ['주의', '설계 보조 결과 — 최종 판단은 설계자·주관청·선급']] });
 out.push({ name: '격실', head: ['Deck', '번호', '실명', 'ISO 분류', 'SOLAS 공간', '범주', '면적 (m²)', '체적 (m³)', '냉방 현열 (W)', '냉방 잠열 (W)', '냉방 합계 (W)', '난방 (W)', '최소 신기 (CMH)', '급기 계통', '급기 (CMH)', '배기 계통', '배기 (CMH)', '환기 계통', '환기 (CMH)', '부하 상태'],
  widths: [10, 8, 20, 14, 26, 6, 10, 10, 12, 12, 12, 10, 12, 12, 10, 12, 10, 12, 10, 18],
  rows: c.rooms.map(r => { const L = c.loads[r.id], A = c.airflow[r.id], k = a.solas.classes[r.id] || {};
   return [deck(r.deckId), r.no, r.name, r.isoClass || '', k.space || '미분류', k.cat || '', r1(r.areaM2), r1(r.volumeM3), r0(L.coolingSensibleW), r0(L.coolingLatentW), r0(L.coolingW), r0(L.heatingW), r1(L.minFreshAirCmh), r.systems.supply || '', A.supplyCmh, r.systems.exhaust || '', A.exhaustCmh, r.systems.return || '', A.returnCmh, L.status || (L.complete ? '완료' : '미완료')]; }) });
 out.push({ name: '계통', head: ['종류', '계통', 'Deck', '공조기 Deck', '공조기 위치', '팬 풍량 (CMH)', '수직 덕트 (m)', '계통 최대 압력손실 (Pa)', '최대 Deck', '상태'], widths: [8, 14, 18, 12, 22, 12, 12, 20, 10, 14],
  rows: a.systems.map(s => [PL.KIND_LABEL[s.kind], s.systemId, s.decks.map(d => deck(d.deckId)).join(', '), deck(s.unitDeckId), ROOT_TEXT(s.unitSource), s.fanCmh, s.riserLengthM, s.indexPa ?? '', s.indexDeckId ? deck(s.indexDeckId) : '', s.complete ? '계산 완료' : 'PHG D 결과 대기']) });
 out.push({ name: 'Deck 덕트망', head: ['Deck', '종류', '계통', '시작점', '시작점 위치', 'RU', 'RU 풍량 (CMH)', '설계 풍량 (CMH)', '덕트', '덕트 길이 (m)', 'Deck 최대 압력손실 (Pa)', '수직 덕트 손실 (Pa)', '합계 (Pa)', 'AUTO (s)', '상태'],
  widths: [10, 6, 14, 10, 22, 6, 12, 12, 6, 12, 18, 16, 10, 8, 16],
  rows: a.plans.map(p => { const r = res[p.key] || {}, sd = a.systems.find(s => s.systemKey === p.systemKey)?.decks.find(d => d.key === p.key);
   return [deck(p.deckId), PL.KIND_LABEL[p.kind], p.systemId, p.isUnitDeck ? '공조기·팬' : '수직 덕트', ROOT_TEXT(p.rootSource), r.rus ?? p.rus.length, r.flowCmh ?? '', p.designCmh, r.ducts ?? '', r.lengthM ?? '', r.indexPa ?? '', sd ? sd.riserPa : '', sd?.totalPa ?? '', r.seconds ?? '', STATUS(r)]; }) });
 const ductRows = [];
 for (const p of a.plans) for (const d of project.geometry?.[p.key]?.ducts || [])
  ductRows.push([deck(p.deckId), PL.KIND_LABEL[p.kind], p.systemId, d.displayName || '', { main: '주 덕트', branch: '분기', sub_branch: '보조 분기' }[d.type] || d.type || '', r0(d.flowCmh), d.diameterMm ? `Ø${d.diameterMm}` : d.widthMm ? `${d.widthMm}×${d.heightMm}` : '', r1(d.widthMm && d.heightMm ? d.flowCmh / 3600 / (d.widthMm * d.heightMm / 1e6) : d.diameterMm ? d.flowCmh / 3600 / (Math.PI * (d.diameterMm / 1000) ** 2 / 4) : null), Math.round(len(d) * 100) / 100]);
 out.push({ name: '덕트', head: ['Deck', '종류', '계통', '덕트', '구분', '풍량 (CMH)', '크기 (mm)', '풍속 (m/s)', '길이 (m)'], widths: [10, 6, 14, 12, 10, 10, 12, 10, 10], rows: ductRows });
 out.push({ name: '수직 덕트', head: ['종류', '계통', '구간', '풍량 (CMH)', '크기 (mm)', '수직 (m)', '수평 (m)', '길이 (m)', '엘보', '풍속 (m/s)', '마찰 (Pa)', '엘보 (Pa)', '합계 (Pa)', '통과 Deck (실 없음)'], widths: [6, 14, 16, 10, 12, 8, 8, 8, 6, 10, 10, 10, 10, 18],
  rows: a.risers.map(r => [PL.KIND_LABEL[r.kind], r.systemId, `${deck(r.fromDeckId)} → ${deck(r.toDeckId)}`, r.flowCmh, `${r.widthMm}×${r.heightMm}`, r.verticalM, r.offsetM, r.lengthM, r.elbows, r.velocityMps, r.frictionPa, r.elbowPa, r.totalPa, r.through.map(deck).join(', ')]) });
 out.push({ name: 'RU', head: ['Deck', '종류', '계통', 'RU', '실', '풍량 (CMH)', 'X (mm)', 'Y (mm)'], widths: [10, 6, 14, 22, 22, 10, 10, 10],
  rows: a.plans.flatMap(p => p.rus.map(u => [deck(p.deckId), PL.KIND_LABEL[p.kind], p.systemId, u.id, roomText(u.roomId), u.flowCmh, u.x, u.y])) });
 out.push({ name: '방화 경계', head: ['구분', 'Deck', '실 A (아래)', '공간 A', '범주 A', '실 B (위)', '공간 B', '범주 B', '표', '표 원문', '최소 등급', '길이 (m) / 면적 (m²)', '확인 사항', '주석'],
  widths: [8, 10, 20, 22, 6, 20, 22, 6, 6, 12, 8, 14, 40, 8],
  rows: a.solas.boundaries.map(b => [{ bulkhead: '격벽', outer: '외벽', deck: '갑판' }[b.kind], deck(b.deckId), roomText(b.roomA), b.aSpace || '미분류', b.aCat || '', b.roomB ? roomText(b.roomB) : '(외부)', b.bSpace || '미분류', b.bCat || '', b.table || '', b.raw || '', b.grade || '미정', b.kind === 'deck' ? b.areaM2 : Math.round(b.lengthMm / 100) / 10, b.check.join(' / '), b.notes.map(n => n.key).join(' ')]) });
 out.push({ name: '관통 목록', head: ['번호', 'Deck', '종류', '계통', '덕트', '경계', '실 A', '실 B', '등급', '크기 (mm)', '면적 (m²)', '풍량 (CMH)', '조치', '슬리브 (mm)', '방화댐퍼', 'X (mm)', 'Y (mm)'],
  widths: [8, 10, 6, 14, 18, 6, 20, 20, 8, 12, 10, 10, 44, 10, 8, 10, 10],
  rows: a.solas.penetrations.map(p => [p.no, deck(p.deckId), PL.KIND_LABEL[p.kind], p.systemId, p.duct, { bulkhead: '격벽', outer: '외벽', deck: '갑판' }[p.boundaryKind], roomText(p.roomA), p.roomB ? roomText(p.roomB) : '(외부)', p.grade || '미정', p.size, p.areaM2, r0(p.flowCmh), p.text, p.sleeveMm || '', p.damper ? 'FD' : '', p.x, p.y]) });
 const sum = a.solas.summary;
 out.push({ name: '물량', head: ['품목', '규격', '수량', '비고'], widths: [16, 16, 8, 50], rows: [
  ...Object.entries(sum.sleeves).map(([mm, n]) => ['강재 슬리브 3t', `L ${mm}`, n, mm === '900' ? 'A급 > 0.02 m² (경계와 같은 등급 단열) · B급 > 0.02 m²' : 'A급 ≤ 0.02 m²']),
  ...Object.entries(sum.dampers).map(([size, n]) => ['자동 방화댐퍼', size, n, 'A급 경계 · 덕트 > 0.075 m² — 양쪽 수동 폐쇄·개폐 표시·점검구']),
  ...a.risers.map(r => ['수직 덕트', `${r.widthMm}×${r.heightMm}`, r.lengthM, `${r.systemId} ${deck(r.fromDeckId)}→${deck(r.toDeckId)} (m)`])] });
 out.push({ name: '검토', head: ['구분', '상태', '내용'], widths: [12, 8, 90], rows: [
  ...a.checks.map(k => ['검토', k.ok ? '✓' : '●', k.text]), ...a.air.map(x => ['풍량', x.level === 'warn' ? '●' : '·', x.text]),
  ...a.solas.warnings.map(w => ['SOLAS 계통', '●', `${w.text} (${w.rule})`]),
  ...sum.unclassified.map(id => ['SOLAS 실', '●', `${roomText(id)}: 미분류 — 공간 지정 필요`])] });
 return out;
}

function html(project, a, opt = {}) {
 const c = project.contract, deck = id => c.decks.find(d => d.id === id)?.name || id, room = id => c.rooms.find(r => r.id === id), roomText = id => { const r = room(id); return r ? `${r.no} ${r.name}` : ''; };
 // cells stay on one line; long text columns (measures, notes, deck lists) wrap
 const wide = h => /조치|확인|주석|^Deck$|통과|비고|내용/.test(h);
 const sh = sheets(project, a), table = (s, limit) => `<table><thead><tr>${s.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.rows.slice(0, limit || s.rows.length).map(r => `<tr>${r.map((v, j) => `<td${typeof v === 'number' ? ' class="n"' : wide(s.head[j]) ? ' class="w"' : ''}>${esc(typeof v === 'number' ? v.toLocaleString('ko-KR') : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>${limit && s.rows.length > limit ? `<p class="muted">… ${s.rows.length - limit}행 더 — XLSX 참조</p>` : ''}`;
 const sum = a.solas.summary, sup = c.systems.filter(s => s.kind === 'supply');
 const kpi = (v, l) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
 const plans = c.decks.slice().sort((x, y) => y.elevationMm - x.elevationMm).map(d => {
  const svg = SVG.deckSvg(c, d.id, { plans: a.plans, geometry: project.geometry, boundaries: a.solas.boundaries, penetrations: a.solas.penetrations, width: 860 });
  return svg ? `<figure><figcaption>${esc(d.name)} · Z ${d.elevationMm} mm</figcaption>${svg}</figure>` : ''; }).join('');
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>HVAC Grid 보고서 — ${esc(c.source?.project || '')}</title><style>
 body{font:13px/1.5 "Malgun Gothic",system-ui,sans-serif;color:#1d2228;margin:24px auto;max-width:1100px;padding:0 16px;background:#fff}
 h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:2px solid #1f5fa8;padding-bottom:4px}.muted{color:#66707a}
 .kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:14px 0}.kpi{border:1px solid #d7dce2;border-radius:6px;padding:8px 10px}.kpi b{display:block;font-size:18px}.kpi span{color:#66707a;font-size:12px}
 table{border-collapse:collapse;width:100%;font-size:11.5px;margin:6px 0}th,td{border:1px solid #d7dce2;padding:3px 6px;text-align:left;vertical-align:top;white-space:nowrap}td.w{white-space:normal;min-width:160px}th{background:#e8eef5}td.n{text-align:right;font-variant-numeric:tabular-nums}
 .ok{color:#1b7a3d}.warn{color:#b3261e}figure{margin:12px 0;break-inside:avoid}figcaption{font-weight:600;margin-bottom:4px}svg{max-width:100%;height:auto;border:1px solid #d7dce2}
 .legend span{display:inline-block;margin-right:12px}.legend i{display:inline-block;width:18px;height:4px;vertical-align:middle;margin-right:4px}
 .note{border-left:4px solid #c99400;background:#fff8e1;padding:8px 12px;margin:12px 0}@media print{body{margin:0;max-width:none}h2{break-after:avoid}table{break-inside:auto}}
 </style></head><body>
 <h1>HVAC Grid 설계 보고서</h1><div class="muted">${esc(c.source?.project || '')} · ${esc(project.savedAt || '')} · 급기 ΔT ${c.rules.supplyDeltaTK} K · ${esc(SO.DATA.ships[a.solas.settings.ship].label)} / ${esc(a.solas.settings.method)}</div>
 <div class="note">설계 보조 결과입니다. 부하·풍량·덕트·방화 판정은 설계자가 확인하고, 최종 판단은 주관청·선급에 따릅니다.</div>
 <div class="kpis">${kpi(c.decks.length, 'Deck')}${kpi(c.rooms.length, '격실')}${kpi(sup.reduce((t, s) => t + s.designCmh, 0).toLocaleString('ko-KR') + ' CMH', `급기 ${sup.length}계통`)}${kpi(`${a.done}/${a.total}`, 'Deck·계통 AUTO')}${kpi(a.risers.length, '수직 덕트')}${kpi(sum.penetrations, '덕트 관통')}${kpi(sum.fireDampers, '방화댐퍼')}${kpi(sum.unclassified.length, 'SOLAS 미분류 실')}</div>
 <h2>검토</h2><table><tbody>${a.checks.map(k => `<tr><td class="${k.ok ? 'ok' : 'warn'}" style="width:24px">${k.ok ? '✓' : '●'}</td><td>${esc(k.text)}</td></tr>`).join('')}${a.solas.warnings.map(w => `<tr><td class="warn">●</td><td>${esc(w.text)} (${esc(w.rule)})</td></tr>`).join('')}${a.air.filter(x => x.level === 'warn').map(x => `<tr><td class="warn">●</td><td>${esc(x.text)}</td></tr>`).join('')}</tbody></table>
 <h2>계통</h2>${table(sh.find(s => s.name === '계통'))}
 <h2>수직 덕트</h2>${a.risers.length ? table(sh.find(s => s.name === '수직 덕트')) : '<p class="muted">여러 Deck을 담당하는 계통이 없습니다.</p>'}
 <h2>Deck 덕트망</h2>${table(sh.find(s => s.name === 'Deck 덕트망'))}
 <h2>Deck 평면</h2><div class="legend"><span><i style="background:#1f5fa8"></i>급기</span><span><i style="background:#a0307a"></i>배기</span><span><i style="background:#00796b"></i>환기</span><span><i style="background:#b3261e"></i>A-60</span><span><i style="background:#c99400"></i>A-0</span><span><i style="background:#5b8fd1"></i>B급</span><span>■ 공조기·팬 ○ 수직 덕트 ● 방화댐퍼 관통</span></div>${plans}
 <h2>방화 (SOLAS II-2) — 경계 ${sum.boundaries}개</h2><p>${Object.entries(sum.byGrade).sort((x, y) => SO.rank(x[0]) - SO.rank(y[0])).map(([g, n]) => `${esc(g)} ${n}`).join(' · ')}</p>
 ${sum.unclassified.length ? `<p class="warn">미분류 실 ${sum.unclassified.length}개: ${sum.unclassified.map(id => esc(roomText(id))).join(', ')} — 경계 판정 보류</p>` : ''}
 <h2>덕트 관통 ${sum.penetrations}곳</h2>${table(sh.find(s => s.name === '관통 목록'), opt.penetrationRows || 400)}
 <h2>물량</h2>${table(sh.find(s => s.name === '물량'))}
 <h2>격실</h2>${table(sh.find(s => s.name === '격실'), opt.roomRows || 400)}
 <p class="muted">HVAC Grid · BOX CAL ${esc(c.source?.sha256 || '')} · SOLAS 표 ${esc(SO.DATA.sha256)}</p></body></html>`;
}

module.exports = { sheets, html, ROOT_TEXT };
