// HVAC Grid 2.0 module ⑤ 검토·출력 (V2-3.7): the review (lib/engines/review - every check with its level), SOLAS
// settings (ship type, method, the space below the lowest deck, sprinklers), a room's space and a wall's rating set by
// hand, the tables (systems and ESP, fire boundaries, penetrations, open items) and the outputs (XLSX, HTML report,
// integrated DXF, fire-rating plan DXF, the model file). Layers: fire boundaries by rating, penetrations. SOLAS values:
// 원문 미확인 (F-2).
'use strict';
(function (root) {
 const UI = typeof require === 'function' && typeof module !== 'undefined' ? require('../ui.js') : root.HG2UI;
 const { esc, fmt, KIND_LABEL, button, group, select, card, kv, dot, LEVEL } = UI;
 const COLORS = { 'A-60': '#b3261e', 'A-30': '#d4542b', 'A-15': '#e07b39', 'A-0': '#c99400', 'B-15': '#2f6fb3', 'B-0': '#5b8fd1', C: '#8a8f98', '*': '#b9bec6' };
 const GRADES = ['A-60', 'A-30', 'A-15', 'A-0', 'B-15', 'B-0', 'C', '*', '-'];
 const KIND = { bulkhead: '격벽', outer: '외벽', deck: '갑판', floor: '바닥', ceiling: '천장', void: '구멍' };
 const label = r => r ? `${r.no ? r.no + ' ' : ''}${r.name || ''}`.trim() : '(밖)';
 const rv = ctx => ctx.model.review;
 const full = ctx => ctx.L('lib/engines/producers.cjs').attach(ctx.model);
 const segHit = (a, b, pt, tol) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2)) : 0; return Math.hypot(pt.x - a.x - t * dx, pt.y - a.y - t * dy) <= tol; };
 const table = (head, rows, limit = 400) => `<table class="tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, limit).map(r => `<tr>${r.map(v => `<td${typeof v === 'number' ? ' class="n"' : ''}>${typeof v === 'number' ? fmt(v) : v}</td>`).join('')}</tr>`).join('')}</tbody></table>${rows.length > limit ? `<p class="muted">… ${rows.length - limit}행 더 — XLSX</p>` : ''}`;

 const mod = {
  id: 'review', step: 5, title: '검토·출력', reads: ['decks', 'rooms', 'solas', 'classes', 'systems', 'plans', 'networks', 'review'], writes: ['solas'],
  layers: [
   { id: 'fire', title: '방화 경계 (SOLAS)', z: 15,
    draw(g, ctx) {
     const b = rv(ctx)?.solas.boundaries || [], sel = ctx.sel?.kind === 'boundary' ? ctx.sel.id : null;
     for (const x of b) if (x.deckId === ctx.deck && x.a && x.b && x.grade && x.grade !== '-') g.line(x.a, x.b, { stroke: x.id === sel ? '#111' : COLORS[x.grade] || '#888', width: (/^A-60/.test(x.grade) ? 4 : /^A/.test(x.grade) ? 3 : /^B/.test(x.grade) ? 2 : 1) + (x.id === sel ? 1.5 : 0), dash: x.grade === '*' ? [4, 3] : null });
    },
    hit(ctx, pt, tol) { const x = (rv(ctx)?.solas.boundaries || []).find(b => b.deckId === ctx.deck && b.a && b.b && segHit(b.a, b.b, pt, tol)); return x ? { kind: 'boundary', id: x.id } : null; } },
   { id: 'pens', title: '관통부', z: 45,
    draw(g, ctx) {
     for (const p of rv(ctx)?.solas.penetrations || []) {
      if (p.deckId !== ctx.deck) continue; const on = ctx.sel?.kind === 'pen' && ctx.sel.id === p.no;
      if (p.boundaryKind === 'deck') g.diamond(p, on ? 7 : 5, { fill: p.damper ? '#111' : '#fff', stroke: '#333', width: 1.3 });
      else if (p.damper) { g.square(p, on ? 6 : 4.5, { fill: '#fff', stroke: '#111', width: 1.8 }); g.line({ x: p.x - g.px(4.5), y: p.y - g.px(4.5) }, { x: p.x + g.px(4.5), y: p.y + g.px(4.5) }, { stroke: '#111', width: 1.3 }); }
      else g.circle(p, on ? 5 : 3.5, { fill: '#fff', stroke: /SIZE|CHECK/.test(p.code) ? '#9a6700' : '#333', width: 1.2 });
     }
    },
    hit(ctx, pt, tol) { const p = (rv(ctx)?.solas.penetrations || []).find(x => x.deckId === ctx.deck && Math.hypot(x.x - pt.x, x.y - pt.y) <= tol * 1.4); return p ? { kind: 'pen', id: p.no } : null; } }],

  ribbon(ctx) {
   const s = ctx.model.solas || {}, C = ctx.L('lib/engines/fire/classify.cjs'), ship = C.settings(s).ship;
   const spaces = C.SPACES.map(r => [r[0], r[0]]);
   return group('방화 (SOLAS)', [select('solas', '선종', Object.values(C.DATA.ships).map(x => [x.key, `${x.label} · ${x.tB}/${x.tD}`]), ship, { v: 'ship' }),
     select('solas', '방화방식', ['IC', 'IIC', 'IIIC'].map(x => [x, x]), C.settings(s).method, { v: 'method', disabled: ship !== 'CARG' }),
     select('solas', '최하층 아래', [['', '미지정 (확인 필요)'], ...spaces], s.lowestBelow || '', { v: 'lowestBelow' }),
     select('solas', '스프링클러', [['', '없음·한쪽'], ['1', '양쪽 설치']], s.sprinkler ? '1' : '', { v: 'sprinkler', disabled: ship !== 'P36M', title: '여객선 36명 이하 Table 9.3/9.4: 양쪽 실 모두 스프링클러면 작은 값' })])
    + group('표', [select('tab', '보기', [['checks', '검토'], ['open', '확인 사항'], ['systems', '계통·ESP'], ['bounds', '방화 경계'], ['pens', '관통'], ['', '닫기']], ctx.state.tab ?? 'checks')])
    + group('출력', [button('save', '모델 저장', { primary: true, title: 'HVAC Grid 2.0 모델 (JSON) — 원본 DXF는 담지 않음' }), button('xlsx', '통합 XLSX'), button('html', '보고서'), button('dxf', '통합 DXF'), button('fireDxf', '방화 등급도 DXF')]);
  },

  // the table under the canvas
  table(ctx) {
   const r = rv(ctx); if (!r) return '<p class="muted">검토 전 — 다시 계산 중</p>';
   const m = ctx.model, room = id => label(m.rooms.find(x => x.id === id)), deck = id => m.decks.find(d => d.id === id)?.name || id, tab = ctx.state.tab ?? 'checks';
   if (tab === 'checks') return table(['판정', '항목'], r.checks.map(k => [`<span class="lv-${k.level}">${LEVEL[k.level]}</span>`, esc(k.text)]));
   if (tab === 'open') { const RP = ctx.L('lib/engines/output/report.cjs'), items = RP.openItems(m, full(ctx)); return table(['구분', '분야', '내용'], items.map(([lv, a, t]) => [`<span class="lv-${lv}">${LEVEL[lv]}</span>`, esc(a), esc(t)]), 300); }
   if (tab === 'systems') return table(['종류', '계통', 'Deck', '팬 풍량 (CMH)', '수직 덕트 (m)', 'ESP (Pa)', '최대 Deck', '팬 정압 추정 (Pa)', '상태'],
    r.systems.map(s => [KIND_LABEL[s.kind], `${dot(s.systemId)}${esc(s.systemId)}`, esc(s.decks.map(d => deck(d.deckId)).join(', ')), s.fanCmh, s.riserLengthM, s.indexPa ?? '—', esc(s.indexDeckId ? deck(s.indexDeckId) : ''), s.fanPa ?? '—', s.complete ? '계산 완료' : s.stale ? '다시 AUTO 필요' : 'AUTO 대기']));
   if (tab === 'bounds') return table(['구분', 'Deck', '실 A', '실 B', '등급', '표', '확인'], r.solas.boundaries.map(b => [KIND[b.kind], esc(deck(b.deckId)), esc(room(b.roomA)), esc(room(b.roomB)), b.grade ? `<b style="color:${COLORS[b.grade] || '#555'}">${esc(b.grade)}</b>` : '<span class="warn">미정</span>', esc(b.table || ''), esc(b.check.join(' / '))]));
   if (tab === 'pens') return table(['번호', 'Deck', '계통', '덕트', '등급', '크기', '조치', '방화댐퍼'], r.solas.penetrations.map(p => [esc(p.no), esc(deck(p.deckId)), esc(p.systemId), esc(p.duct), esc(p.grade || '미정'), esc(p.size), esc(p.text), p.damper ? 'FD' : '']));
   return '';
  },

  inspector(ctx) {
   const m = ctx.model, r = rv(ctx), sel = ctx.sel, C = ctx.L('lib/engines/fire/classify.cjs'), ship = C.settings(m.solas).ship;
   if (!r) return '';
   if (sel?.kind === 'room') {
    const x = m.rooms.find(y => y.id === sel.id), c = r.solas.classes[sel.id] || {}, bounds = r.solas.boundaries.filter(b => b.roomA === sel.id || b.roomB === sel.id);
    const worst = bounds.filter(b => b.grade).sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade))[0];
    return card('방화 (SOLAS)', kv([['공간', c.space ? esc(c.space) : '<span class="warn">미분류</span>'], ['범주', c.cat ? `(${c.cat}) ${esc(C.categoryName(ship, c.cat))}` : '—'], ['근거', esc({ name: '실 이름', 'iso-class': 'ISO 분류', user: '사용자 지정', unclassified: '—', 'no-category': '이 표에 범주 없음' }[c.source] || '')], ['경계', `${bounds.length}개${worst ? ` · 가장 엄격 ${esc(worst.grade)}` : ''}`], c.check ? ['확인', esc(c.check)] : null])
     + select('space', '공간 지정', [['', '자동 분류'], ...C.SPACES.map(s => [s[0], s[0]])], m.solas?.rooms?.[sel.id]?.space || ''), { from: label(x), now: true });
   }
   if (sel?.kind === 'boundary') {
    const b = r.solas.boundaries.find(x => x.id === sel.id); if (!b) return '';
    return card(`${KIND[b.kind]} ${b.grade ? esc(b.grade) : '미정'}`, kv([['실 A', esc(label(m.rooms.find(x => x.id === b.roomA)))], ['실 B', esc(label(m.rooms.find(x => x.id === b.roomB)))], ['공간', `${esc(b.aSpace || '미분류')} ↔ ${esc(b.bSpace || '미분류')}`], ['표', `${esc(b.table || '—')} ${b.raw ? '· ' + esc(b.raw) : ''}`], ['길이·면적', b.lengthMm != null ? `${(b.lengthMm / 1000).toFixed(1)} m` : `${b.areaM2} m²`], b.check.length ? ['확인', esc(b.check.join(' / '))] : null])
     + select('grade', '등급 지정', [['', '표대로'], ...GRADES.map(g => [g, g])], m.solas?.bounds?.[b.id]?.grade || '', { v: b.id }), { from: 'SOLAS II-2/9 (원문 미확인)', now: true });
   }
   if (sel?.kind === 'pen') { const p = r.solas.penetrations.find(x => x.no === sel.id); return p ? card(`관통 ${esc(p.no)}`, kv([['계통', esc(p.systemId)], ['덕트', esc(p.duct)], ['경계', `${esc(KIND[p.boundaryKind] || p.boundaryKind)} ${esc(p.grade || '미정')}`], ['크기', esc(p.size)], ['조치', esc(p.text)], p.note ? ['비고', esc(p.note)] : null]), { now: true }) : ''; }
   const sum = r.solas.summary;
   return card('검토', kv([['실패', `<b class="fail">${r.count.fail}</b>`], ['확인 필요', `<b class="warn">${r.count.check}</b>`], ['통과', r.count.ok], ['AUTO', `${r.done}/${r.total}`], ['방화 경계 · 관통 · 방화댐퍼', `${sum.boundaries} · ${sum.penetrations} · ${sum.fireDampers}`]]), { now: true })
    + r.checks.filter(k => k.level !== 'ok').map(k => `<div class="chk lv-${k.level}">${LEVEL[k.level]} · ${esc(k.text)}</div>`).join('');
  },

  act(ctx, name, arg, value) {
   const m = ctx.model, out = n => ctx.L('lib/engines/output/' + n);
   if (name === 'solas') { const v = arg === 'sprinkler' ? value === '1' : value || null; return { cmd: { label: `SOLAS ${arg}`, ops: [{ path: ['solas', arg], value: v ?? undefined }] }, run: 'light' }; }
   if (name === 'tab') return { state: { tab: value } };
   if (name === 'space') { const id = ctx.sel?.id; return id ? { cmd: { label: 'SOLAS 공간 지정', ops: [{ path: ['solas', 'rooms'], value: Object.fromEntries(Object.entries({ ...(m.solas.rooms || {}), [id]: value ? { space: value } : undefined }).filter(([, x]) => x)) }] }, run: 'light' } : null; }
   if (name === 'grade') return { cmd: { label: '방화 등급 지정', ops: [{ path: ['solas', 'bounds'], value: Object.fromEntries(Object.entries({ ...(m.solas.bounds || {}), [arg]: value ? { grade: value } : undefined }).filter(([, x]) => x)) }] }, run: 'light' };
   if (name === 'save') return { file: 'save' };
   const f = full(ctx), name0 = (m.source?.v1?.contractSource?.project || 'HVAC_Grid').replace(/\.(box\.)?json$/i, '');
   if (name === 'xlsx') return { download: { name: `${name0}_HVAC_Grid.xlsx`, data: out('xlsx.cjs').xlsx(out('report.cjs').sheets(m, f)), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } };
   if (name === 'html') return { download: { name: `${name0}_HVAC_Grid_보고서.html`, data: out('report.cjs').html(m, f), type: 'text/html' } };
   if (name === 'dxf') return { download: { name: `${name0}_HVAC_Grid.dxf`, data: out('dxf.cjs').integratedDxf(m, { diagrams: out('diagram.cjs').systemDiagrams(m, f), plans: f.plans, nets: f.nets, boundaries: f.solas.boundaries, penetrations: f.solas.penetrations, risers: f.risers }), type: 'application/dxf' } };
   if (name === 'fireDxf') return { download: { name: `${name0}_방화등급도.dxf`, data: out('fireplan.cjs').toDxf(out('fireplan.cjs').model(m, f.solas)), type: 'application/dxf' } };
   return null;
  },
  pick(ctx, hit) { return { select: hit ? { kind: hit.kind, id: hit.id } : null }; },
  checks(ctx) { const r = rv(ctx); return r ? [{ level: r.count.fail ? 'fail' : r.count.check ? 'check' : 'ok', text: `검토 실패 ${r.count.fail} · 확인 ${r.count.check}` }] : []; },
 };
 if (typeof module !== 'undefined' && module.exports) module.exports = mod; else (root.HG2Modules = root.HG2Modules || []).push(mod);
})(typeof self !== 'undefined' ? self : this);
