// HVAC Grid 2.0 module ③ 풍량·계통 (V2-3.7): the airflow rules (F-1: one supply ΔT, the summer one - no winter airflow),
// room system assignment, transfer-air sources, the unit deck and the unit / shaft point of each system. Layers: rooms by
// system with their airflow, transfer-air arrows, units and shafts (dragged to move). The airflow itself is worked out by
// lib/engines/airflow (the recompute table runs it after every edit).
'use strict';
(function (root) {
 const UI = typeof require === 'function' && typeof module !== 'undefined' ? require('../ui.js') : root.HG2UI;
 const { esc, fmt, KIND_LABEL, KINDS, sysColor, button, group, select, number, card, kv, dot } = UI;
 const FIELD = { supply: 'supplyCmh', exhaust: 'exhaustCmh', return: 'returnCmh' };
 const label = r => r ? `${r.no ? r.no + ' ' : ''}${r.name || ''}`.trim() : '';
 const kindOf = ctx => ctx.state.kind || 'supply';
 // the systems of the chosen kind that serve the deck, and the one chosen (by its key)
 const systemsHere = ctx => ctx.model.systems.filter(s => s.kind === kindOf(ctx) && s.deckIds.includes(ctx.deck));
 const keyOf = (ctx, s) => ctx.L('lib/engines/systems/plans.cjs').systemKeys(ctx.model.systems)(s);
 const current = ctx => { const list = systemsHere(ctx); return list.find(s => keyOf(ctx, s) === ctx.state.sys) || list[0] || null; };
 const planOf = (ctx, s = current(ctx)) => s ? ctx.model.plans.find(p => p.deckId === ctx.deck && p.systemKey === keyOf(ctx, s)) : null;
 const snap = p => ({ x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 });

 const mod = {
  id: 'airflow', step: 3, title: '풍량·계통',
  reads: ['decks', 'rooms', 'loads', 'rules', 'assign', 'transfers', 'unitDecks', 'roots', 'classes', 'airflow', 'zones', 'systems', 'plans', 'review'],
  writes: ['rules', 'assign', 'transfers', 'unitDecks', 'roots'],
  layers: [
   { id: 'air', title: '풍량 (계통 색)', z: 20,
    draw(g, ctx) {
     const m = ctx.model, k = kindOf(ctx), PL = ctx.L('lib/engines/geometry/plan.cjs'), cur = current(ctx);
     for (const r of m.rooms) {
      const a = ctx.deckAlpha(r.deckId); if (a !== 1) continue;
      const sid = m.assign[r.id]?.[k], cmh = m.airflow[r.id]?.[FIELD[k]];
      if (!sid) continue;
      g.alpha(cur && sid !== cur.id ? 0.35 : 1, () => {
       g.poly(r.polygon, { fill: sysColor(sid) + '30', stroke: sysColor(sid), width: 1.2 });
       const b = PL.bounds(r.polygon), w = (b.maxX - b.minX) * g.view.s, h = (b.maxY - b.minY) * g.view.s;
       if (cmh && w > 34 && h > 34) g.text(PL.innerPoint(r), `${fmt(cmh)}`, { size: 10, align: 'center', dy: 26, color: sysColor(sid), bold: true });
      });
     }
    } },
   { id: 'transfer', title: '전달 공기', z: 25,
    draw(g, ctx) {
     const m = ctx.model, PL = ctx.L('lib/engines/geometry/plan.cjs'), byId = new Map(m.rooms.map(r => [r.id, r]));
     for (const r of m.rooms) {
      const a = m.airflow[r.id], src = byId.get(a?.transferFrom); if (!a?.transferInCmh || !src || ctx.deckAlpha(r.deckId) !== 1) continue;
      const p = PL.innerPoint(src), q = PL.innerPoint(r), d = Math.hypot(q.x - p.x, q.y - p.y) || 1, ux = (q.x - p.x) / d, uy = (q.y - p.y) / d, hd = g.px(8);
      g.line(p, q, { stroke: '#7a2b8a', width: 1.5, dash: [5, 3] });
      g.poly([q, { x: q.x - ux * hd - uy * hd / 2, y: q.y - uy * hd + ux * hd / 2 }, { x: q.x - ux * hd + uy * hd / 2, y: q.y - uy * hd - ux * hd / 2 }], { fill: '#7a2b8a' });
      g.text({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, `${fmt(a.transferInCmh)}`, { size: 9, color: '#7a2b8a', align: 'center' });
     }
    } },
   { id: 'units', title: '공조기·수직 덕트', z: 40,
    draw(g, ctx) {
     for (const p of ctx.model.plans) {
      if (p.deckId !== ctx.deck || p.kind !== kindOf(ctx)) continue;
      const col = sysColor(p.systemId), on = planOf(ctx)?.key === p.key;
      if (p.isUnitDeck) g.square(p.root, on ? 8 : 6, { fill: col, stroke: on ? '#111' : '#fff', width: 1.5 }); else g.circle(p.root, on ? 7 : 5, { fill: '#fff', stroke: col, width: 2.5 });
      g.text(p.root, p.systemId + (p.rootSource === 'user' ? '' : p.rootSource.startsWith('assumed') ? ' (임시)' : ''), { size: 10, dx: 10, dy: -8, color: col, bold: true });
     }
    },
    hit(ctx, pt, tol) { const p = ctx.model.plans.find(x => x.deckId === ctx.deck && x.kind === kindOf(ctx) && Math.hypot(x.root.x - pt.x, x.root.y - pt.y) <= tol * 1.5); return p ? { kind: 'root', id: p.key, draggable: true } : null; } }],

  ribbon(ctx) {
   const m = ctx.model, R = m.rules, k = kindOf(ctx), list = systemsHere(ctx), cur = current(ctx), plan = planOf(ctx);
   const decks = cur ? cur.deckIds.map(id => [id, m.decks.find(d => d.id === id)?.name || id]) : [];
   return group('풍량 규칙 (여름 하나 · F-1)', [
     number('rule', '급기 ΔT (K)', R.supplyDeltaTK, { v: 'supplyDeltaTK', min: 3, max: 15, title: '급기 = 올림(max(냉방 현열 W × 안전율 × 3 ÷ ΔT, 최소 신기)) — 겨울은 같은 풍량에 난방 용량' }),
     number('rule', '가압 (%)', R.pressurizationPct, { v: 'pressurizationPct', min: 0, max: 30, width: '3.5em' }),
     select('rule', '가압 기준', [['exhaust', '배기 대비'], ['supply', '급기 대비']], R.pressurizationBasis, { v: 'pressurizationBasis' }),
     number('rule', '최소 신기 (%)', R.minOaPct ?? 0, { v: 'minOaPct', min: 0, max: 100, width: '3.5em', title: '재순환 구역 신기 비율 하한 (선주 사양)' }),
     number('rule', '올림 (CMH)', R.roundCmh, { v: 'roundCmh', min: 1, max: 1000, width: '3.5em' })])
    + group('계통', [select('kind', '종류', KINDS.map(x => [x, KIND_LABEL[x]]), k), select('sys', '계통', list.length ? list.map(s => [keyOf(ctx, s), s.id]) : [['', '이 Deck에 없음']], cur ? keyOf(ctx, cur) : '', { disabled: !list.length })])
    + group('공조기 · 수직 덕트', [button('picking', '위치 지정', { pressed: !!ctx.state.picking, disabled: !plan, title: plan?.isUnitDeck === false ? '평면에서 수직 덕트(샤프트) 위치를 누르세요' : '평면에서 공조기·팬 위치를 누르세요' }),
     button('unroot', '지정 해제', { disabled: !plan || !m.roots[plan.key] }),
     select('unitDeck', '공조기 Deck', [['', '자동'], ...decks], cur ? m.unitDecks[keyOf(ctx, cur)] || '' : '', { disabled: !cur || decks.length < 2 })]);
  },

  inspector(ctx) {
   const m = ctx.model, r = ctx.sel?.kind === 'room' && m.rooms.find(x => x.id === ctx.sel.id);
   if (!r) {
    const rooms = m.rooms.filter(x => x.deckId === ctx.deck), sum = f => fmt(rooms.reduce((t, x) => t + (m.airflow[x.id]?.[f] || 0), 0));
    const zones = m.zones.filter(z => z.roomIds.some(id => rooms.some(x => x.id === id)));
    return card('Deck 풍량', kv([['격실', rooms.length], ['급기(SA)', `${sum('supplyCmh')} CMH`], ['배기(EA)', `${sum('exhaustCmh')} CMH`], ['환기(RA)', `${sum('returnCmh')} CMH`]]))
     + zones.map(z => card(`${dot(z.supplySystemId)}구역 ${esc(z.supplySystemId)}`, kv([['급기 SA', `${fmt(z.saCmh)} CMH`], ['배기 EA', `${fmt(z.eaCmh)} CMH`], ['신기 OA', `${fmt(z.oaCmh)} CMH (${z.oaPct} %)`], ['필요 신기', `${fmt(z.oaNeedCmh)} CMH`], ['환기 RA', `${fmt(z.raCmh)} CMH`], ['판정', z.ok ? '<span class="ok">적합</span>' : '<span class="fail">급기 부족</span>']]))).join('');
   }
   const L = m.loads[r.id] || {}, A = m.airflow[r.id] || {}, sys = m.assign[r.id] || {};
   const names = kind => [...new Set(m.systems.filter(s => s.kind === kind).map(s => s.id))].sort();
   const neighbours = m.rooms.filter(x => x.deckId === r.deckId && x !== r && m.assign[x.id]?.supply);
   const basis = { cooling: '냉방 현열', freshAir: '최소 신기', makeup: '전달 공기 보충' }[A.basis] || '—';
   return card('부하', kv([['냉방 현열', `${fmt(L.coolingSensibleW)} W`], ['난방', `${fmt(L.heatingW)} W`], ['최소 신기', `${fmt(L.minFreshAirCmh)} CMH`], ['상태', esc(L.status || (L.complete ? '완료' : '미완료'))]]), { from: '1.x (BOX CAL)' })
    + card('풍량', kv([['급기(SA)', `<b>${fmt(A.supplyCmh)}</b> CMH`], ['근거', basis], ['배기(EA)', `${fmt(A.exhaustCmh)} CMH`], ['환기(RA)', `${fmt(A.returnCmh)} CMH`],
      A.transferInCmh ? ['전달 공기 받음', `${fmt(A.transferInCmh)} CMH · ${A.transferFrom === 'own-inlet' ? '자체 흡입구' : A.transferFrom === 'outside' ? '이웃 급기 실 없음' : esc(label(m.rooms.find(x => x.id === A.transferFrom)))}`] : null,
      A.transferOutCmh ? ['전달 공기 보냄', `${fmt(A.transferOutCmh)} CMH`] : null]), { from: 'HVAC Grid', now: true })
    + card('계통', KINDS.map(k => select('assign', KIND_LABEL[k], [['', '없음'], ...names(k).map(n => [n, n])], sys[k] || '', { v: k })).join(''))
    + (A.transferInCmh || m.transfers[r.id] ? card('전달 공기 출처', select('transfer', '출처', [['', '자동'], ['own-inlet', '자체 흡입구'], ...neighbours.map(x => [x.id, label(x)])], m.transfers[r.id] || '')) : '');
  },

  act(ctx, name, arg, value) {
   const m = ctx.model;
   if (name === 'rule') {
    // only the summer rules there are (F-1: no winter airflow rule can be set from here)
    if (!(arg in ctx.L('lib/model/schema.cjs').RULES)) return { say: `알 수 없는 풍량 규칙: ${arg}`, error: true };
    const v = arg === 'pressurizationBasis' ? value : +value; if (arg !== 'pressurizationBasis' && !Number.isFinite(v)) return { say: '숫자가 아닙니다' };
    if (arg === 'supplyDeltaTK' && !(v >= 3 && v <= 15)) return { say: '급기 ΔT는 3–15 K (ISO 7547 6.3: 냉방 급기는 실온보다 15 K 넘게 낮을 수 없음)', error: true };
    return { cmd: { label: `풍량 규칙 ${arg} = ${v}`, ops: [{ path: ['rules', arg], value: arg === 'roundCmh' ? Math.round(v) : v }] }, run: 'light' };
   }
   if (name === 'kind') return { state: { kind: value, sys: null } };
   if (name === 'sys') return { state: { sys: value } };
   if (name === 'picking') return { state: { picking: !ctx.state.picking }, say: ctx.state.picking ? '' : '평면에서 위치를 누르세요 (Esc 취소)' };
   if (name === 'unroot') { const p = planOf(ctx); return p ? { cmd: { label: `${p.systemId} 위치 지정 해제`, ops: [{ path: ['roots', p.key], value: undefined }] }, run: 'light' } : null; }
   if (name === 'unitDeck') { const s = current(ctx); return s ? { cmd: { label: `${s.id} 공조기 Deck`, ops: [{ path: ['unitDecks', keyOf(ctx, s)], value: value || undefined }] }, run: 'light' } : null; }
   if (name === 'assign') { const id = ctx.sel?.id; if (!id) return null; return { cmd: { label: `${label(m.rooms.find(x => x.id === id))} ${KIND_LABEL[arg]} 계통`, ops: [{ path: ['assign', id], value: { supply: null, exhaust: null, return: null, ...m.assign[id], [arg]: value || null } }] }, run: 'light' }; }
   if (name === 'transfer') { const id = ctx.sel?.id; if (!id) return null; return { cmd: { label: '전달 공기 출처', ops: [{ path: ['transfers', id], value: value || undefined }] }, run: 'light' }; }
   return null;
  },
  pick(ctx, hit, pt) {
   if (ctx.state.picking) { const p = planOf(ctx); if (!p) return { state: { picking: false } }; return { cmd: { label: `${p.systemId} ${p.isUnitDeck ? '공조기' : '수직 덕트'} 위치`, ops: [{ path: ['roots', p.key], value: snap(pt) }] }, run: 'light', state: { picking: false } }; }
   if (hit?.kind === 'root') { const p = ctx.model.plans.find(x => x.key === hit.id); return { state: { sys: p.systemKey }, select: null }; }
   return { select: hit?.kind === 'room' ? { kind: 'room', id: hit.id } : null };
  },
  drag(ctx, hit, pt, phase) {
   if (hit.kind !== 'root' || phase !== 'end') return phase === 'move' ? { ghost: { at: pt } } : null;
   const p = ctx.model.plans.find(x => x.key === hit.id);
   return { cmd: { label: `${p.systemId} 위치 옮김`, ops: [{ path: ['roots', p.key], value: snap(pt) }] }, run: 'light' };
  },
  checks(ctx) { const air = ctx.model.review?.air || []; return [{ level: air.some(x => x.level === 'fail') ? 'fail' : air.some(x => x.level === 'check') ? 'check' : 'ok', text: `풍량 확인 ${air.filter(x => x.level === 'check').length} · 실패 ${air.filter(x => x.level === 'fail').length}` }]; },
 };
 if (typeof module !== 'undefined' && module.exports) module.exports = mod; else (root.HG2Modules = root.HG2Modules || []).push(mod);
})(typeof self !== 'undefined' ? self : this);
