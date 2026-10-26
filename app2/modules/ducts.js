// HVAC Grid 2.0 module ④ RU·덕트 (V2-3.7): AUTO by the 2.0 duct engine (lib/duct, every plan in workers), another
// route (the next candidate), RUs dragged to move, a duct's size by hand - each an edit of the model (ruMoves, ductEdits)
// that the recompute table turns into that plan's network again. Layers: ducts with sizes, RUs. No PHG D window (D1,
// D12: the editor exchange comes after 2.0).
'use strict';
(function (root) {
 const UI = typeof require === 'function' && typeof module !== 'undefined' ? require('../ui.js') : root.HG2UI;
 const { esc, fmt, KIND_LABEL, KINDS, sysColor, button, group, select, card, kv, dot } = UI;
 const TYPE = { main: '주 덕트', branch: '분기', sub_branch: '보조 분기' };
 const kindOf = ctx => ctx.state.kind || 'supply';
 const plansHere = ctx => ctx.model.plans.filter(p => p.deckId === ctx.deck);
 const current = ctx => { const list = plansHere(ctx).filter(p => p.kind === kindOf(ctx)); return list.find(p => p.key === ctx.state.key) || list[0] || null; };
 const shown = ctx => { const show = ctx.state.show || 'kind', cur = current(ctx); return plansHere(ctx).filter(p => show === 'all' || (show === 'kind' ? p.kind === kindOf(ctx) : p.key === cur?.key)); };
 const staleKeys = ctx => new Set((ctx.status || []).filter(s => s.id === 'networks' && s.state !== 'fresh').map(s => s.key));
 const area = d => d.diameterMm ? Math.PI * (d.diameterMm / 2000) ** 2 : (d.widthMm || 0) * (d.heightMm || 0) / 1e6;
 const sizeText = d => d.diameterMm ? `Ø${d.diameterMm}` : d.widthMm ? `${d.widthMm}×${d.heightMm}` : '—';
 const len = pts => pts.slice(1).reduce((t, q, i) => t + Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0);
 const snap = p => ({ x: Math.round(p.x / 100) * 100, y: Math.round(p.y / 100) * 100 });
 // rectangles near the duct's air: 50 mm steps, W ≥ H, W/H ≤ 3, 2-15 m/s, the twelve nearest its present section
 function sizes(d) {
  const out = [], a0 = area(d) || 0.05;
  for (let h = 100; h <= 800; h += 50) for (let w = h; w <= Math.min(2000, 3 * h); w += 50) { const v = d.flowCmh / 3600 / (w * h / 1e6); if (v >= 2 && v <= 15) out.push({ w, h, v, k: Math.abs(Math.log(w * h / 1e6 / a0)) }); }
  return out.sort((a, b) => a.k - b.k).slice(0, 12).sort((a, b) => a.w * a.h - b.w * b.h);
 }
 const segHit = (pts, pt, tol) => { for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2)) : 0; if (Math.hypot(pt.x - a.x - t * dx, pt.y - a.y - t * dy) <= tol) return true; } return false; };

 const mod = {
  id: 'ducts', step: 4, title: 'RU·덕트', reads: ['decks', 'rooms', 'plans', 'networks', 'ruMoves', 'ductEdits', 'review'], writes: ['ruMoves', 'ductEdits'],
  layers: [
   { id: 'ducts', title: '덕트', z: 30,
    draw(g, ctx) {
     const stale = staleKeys(ctx), sel = ctx.sel?.kind === 'duct' ? ctx.sel : null;
     for (const p of shown(ctx)) {
      const n = ctx.model.networks[p.key], col = sysColor(p.systemId), old = stale.has(p.key); if (!n?.ducts?.length) continue;
      for (const d of n.ducts) {
       const on = sel && sel.key === p.key && sel.id === d.id;
       g.polyline(d.points, { stroke: on ? '#111' : old ? '#9aa1a9' : col, width: (d.type === 'main' ? 4 : d.type === 'branch' ? 2.6 : 1.8) + (on ? 1.5 : 0), dash: old ? [6, 4] : null });
       // the size where the piece is long enough on screen
       if (len(d.points) * g.view.s > 70 && d.points.length > 1) { const a = d.points[0], b = d.points[1]; g.text({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, sizeText(d), { size: 9, color: old ? '#9aa1a9' : col, align: 'center', dy: -4 }); }
      }
     }
    },
    hit(ctx, pt, tol) { for (const p of shown(ctx)) for (const d of ctx.model.networks[p.key]?.ducts || []) if (segHit(d.points, pt, tol)) return { kind: 'duct', key: p.key, id: d.id }; return null; } },
   { id: 'rus', title: 'RU', z: 35,
    draw(g, ctx) {
     for (const p of shown(ctx)) { const col = sysColor(p.systemId); for (const u of p.rus) { const on = ctx.sel?.kind === 'ru' && ctx.sel.id === u.id; g.square(u, on ? 6 : 4, { fill: on ? col : '#fff', stroke: col, width: u.moved ? 2.2 : 1.4 }); } }
    },
    hit(ctx, pt, tol) { for (const p of shown(ctx)) for (const u of p.rus) if (Math.hypot(u.x - pt.x, u.y - pt.y) <= tol * 1.4) return { kind: 'ru', key: p.key, id: u.id, roomId: u.roomId, draggable: true }; return null; } }],

  ribbon(ctx) {
   const cur = current(ctx), n = cur && ctx.model.networks[cur.key], r = n?.result, stale = staleKeys(ctx), list = plansHere(ctx).filter(p => p.kind === kindOf(ctx));
   const left = ctx.model.plans.filter(p => stale.has(p.key)).length;
   return group('AUTO (HVAC Grid 덕트 엔진)', [button('auto', left ? `AUTO · 남은 ${left}` : 'AUTO 완료', { primary: !!left, disabled: !left, title: '다시 계산이 필요한 Deck·계통만 (워커에서 병렬)' }),
     button('autoAll', '모두 다시', { title: '모든 Deck·계통을 새 엔진으로 다시 AUTO' }), button('autoOne', '이 계통', { disabled: !cur })])
    + group('계통', [select('kind', '종류', KINDS.map(x => [x, KIND_LABEL[x]]), kindOf(ctx)), select('plan', '계통', list.length ? list.map(p => [p.key, p.systemId]) : [['', '이 Deck에 없음']], cur?.key || '', { disabled: !list.length })])
    + group('편집', [button('reroute', `다른 경로${r?.candidates ? ` (${(r.pick || 0) + 1}/${r.candidates})` : ''}`, { disabled: !r || !(r.candidates > 1), title: 'AUTO의 다음 후보 경로' }),
     button('resetRu', 'RU 위치 초기화', { disabled: !cur?.rus.some(u => u.moved) })])
    + group('보기', [select('show', '덕트', [['sys', '이 계통'], ['kind', '같은 종류'], ['all', '모든 계통']], ctx.state.show || 'kind')]);
  },

  inspector(ctx) {
   const m = ctx.model, sel = ctx.sel;
   if (sel?.kind === 'duct') {
    const p = m.plans.find(x => x.key === sel.key), n = m.networks[sel.key], d = n?.ducts.find(x => x.id === sel.id); if (!d) return '';
    const a = area(d), v = a ? d.flowCmh / 3600 / a : null, manual = (m.ductEdits[sel.key]?.manual || []).some(x => x.key === d.key);
    return card(`${esc(TYPE[d.type] || d.type)} ${esc(d.displayName || d.id)}`, kv([['계통', `${dot(p.systemId)}${KIND_LABEL[p.kind]} ${esc(p.systemId)}`], ['크기', `<b>${sizeText(d)}</b> mm`], ['풍량', `${fmt(d.flowCmh)} CMH`], ['풍속', v ? `${v.toFixed(1)} m/s` : '—'], ['길이', `${(len(d.points) / 1000).toFixed(1)} m`]])
      + (manual ? '<div class="muted">수동 크기 — 다시 AUTO 해도 지킴</div>' : ''), { from: n.source === 'v1' ? '1.0 PHG D' : 'HVAC Grid', now: true })
     + card('덕트 크기', select('size', '크기 (풍속)', [['', '자동'], ...sizes(d).map(s => [`${s.w}x${s.h}`, `${s.w}×${s.h} · ${s.v.toFixed(1)} m/s`])], manual && d.widthMm ? `${d.widthMm}x${d.heightMm}` : ''));
   }
   if (sel?.kind === 'ru') {
    const p = m.plans.find(x => x.key === sel.key), u = p?.rus.find(x => x.id === sel.id); if (!u) return '';
    const r = m.rooms.find(x => x.id === u.roomId);
    return card(`RU ${esc(u.id)}`, kv([['실', esc(`${r?.no || ''} ${r?.name || ''}`)], ['풍량', `${fmt(u.flowCmh)} CMH`], ['위치', `${fmt(u.x)}, ${fmt(u.y)}`], ['옮김', u.moved ? '예' : '아니오']]) + (m.ruMoves[u.id] ? button('unmove', '원위치', { v: u.id }) : '<div class="muted">평면에서 끌어서 옮깁니다 (실 안에서만)</div>'), { now: true });
   }
   const stale = staleKeys(ctx);
   return plansHere(ctx).map(p => { const n = m.networks[p.key], r = n?.result;
    return card(`${dot(p.systemId)}${KIND_LABEL[p.kind]} ${esc(p.systemId)}`, kv([['설계 풍량', `${fmt(p.designCmh)} CMH`], ['RU', `${p.rus.length}개`], ['덕트망', !r ? '없음' : stale.has(p.key) ? '<span class="warn">다시 AUTO 필요</span>' : `${r.ducts}개 · ${r.lengthM} m`], ['Deck 최대 손실', r?.indexPa != null ? `${r.indexPa} Pa` : '—'],
     r?.zonesRelaxed ? ['금지 영역', `<span class="warn">완화 (${esc(r.zonesRelaxed)})</span>`] : null, r?.unconnected ? ['연결 안 된 RU', `<span class="fail">${r.unconnected}</span>`] : null]), { from: n?.source === 'v1' ? '1.0 PHG D' : n ? 'HVAC Grid' : '', now: p.key === current(ctx)?.key }); }).join('');
  },

  act(ctx, name, arg, value) {
   const m = ctx.model, cur = current(ctx), drop = keys => keys.map(k => ({ path: ['results', 'networks:' + k], value: undefined }));
   if (name === 'auto') return { run: 'auto' };
   if (name === 'autoAll') return { cmd: { label: '모든 계통 다시 AUTO', ops: drop(m.plans.map(p => p.key).filter(k => m.results['networks:' + k])) }, run: 'auto' };
   if (name === 'autoOne') return cur ? { cmd: { label: `${cur.systemId} 다시 AUTO`, ops: drop(m.results['networks:' + cur.key] ? [cur.key] : []) }, run: 'auto' } : null;
   if (name === 'kind') return { state: { kind: value, key: null } };
   if (name === 'plan') return { state: { key: value } };
   if (name === 'show') return { state: { show: value } };
   if (name === 'reroute') { const r = m.networks[cur?.key]?.result; if (!r?.candidates) return null; const e = m.ductEdits[cur.key] || { pick: 0, manual: [] }; return { cmd: { label: `${cur.systemId} 다른 경로`, ops: [{ path: ['ductEdits', cur.key], value: { ...e, pick: ((e.pick || 0) + 1) % r.candidates } }] }, run: 'auto' }; }
   if (name === 'resetRu') { const ids = cur.rus.filter(u => m.ruMoves[u.id]).map(u => u.id); return { cmd: { label: `${cur.systemId} RU 위치 초기화`, ops: ids.map(id => ({ path: ['ruMoves', id], value: undefined })) }, run: 'auto' }; }
   if (name === 'unmove') return { cmd: { label: `RU ${arg} 원위치`, ops: [{ path: ['ruMoves', arg], value: undefined }] }, run: 'auto' };
   if (name === 'size') {
    const sel = ctx.sel, d = m.networks[sel?.key]?.ducts.find(x => x.id === sel.id); if (!d) return null;
    const e = m.ductEdits[sel.key] || { pick: 0, manual: [] }, rest = (e.manual || []).filter(x => x.key !== d.key), [w, h] = String(value).split('x').map(Number);
    return { cmd: { label: `덕트 ${d.displayName || d.id} 크기 ${value ? value.replace('x', '×') : '자동'}`, ops: [{ path: ['ductEdits', sel.key], value: { ...e, manual: value ? [...rest, { key: d.key, size: { widthMm: w, heightMm: h } }] : rest } }] }, run: 'auto' };
   }
   return null;
  },
  pick(ctx, hit) {
   if (!hit) return { select: null };
   if (hit.kind === 'duct' || hit.kind === 'ru') { const p = ctx.model.plans.find(x => x.key === hit.key); return { select: { kind: hit.kind, key: hit.key, id: hit.id }, state: { key: p.key, kind: p.kind } }; }
   return { select: hit.kind === 'room' ? { kind: 'room', id: hit.id } : null };
  },
  drag(ctx, hit, pt, phase) {
   if (hit.kind !== 'ru') return null;
   if (phase !== 'end') return { ghost: { at: pt } };
   return { cmd: { label: `RU ${hit.id} 옮김`, ops: [{ path: ['ruMoves', hit.id], value: snap(pt) }] }, run: 'auto', select: { kind: 'ru', key: hit.key, id: hit.id } };
  },
  checks(ctx) {
   const rv = ctx.model.review, stale = staleKeys(ctx).size;
   return [{ level: stale ? 'check' : 'ok', text: `AUTO ${rv ? rv.done : 0}/${ctx.model.plans.length}${stale ? ` · 남은 ${stale}` : ''}` }];
  },
 };
 if (typeof module !== 'undefined' && module.exports) module.exports = mod; else (root.HG2Modules = root.HG2Modules || []).push(mod);
})(typeof self !== 'undefined' ? self : this);
