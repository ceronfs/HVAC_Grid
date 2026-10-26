// HVAC Grid 2.0 module ① 데크·격실 - in V2-3 the rooms layer only (V2-3.8): the model's room outlines, numbers and
// names drawn straight from the model on every step, the deck and room tree, the room's shape. Finding rooms from a
// drawing comes with the drawing engine (V2-5); until then the rooms come from a 1.x file.
'use strict';
(function (root) {
 const UI = typeof require === 'function' && typeof module !== 'undefined' ? require('../ui.js') : root.HG2UI;
 const { esc, fmt, card, kv } = UI;
 const label = r => `${r.no ? r.no + ' ' : ''}${r.name || ''}`.trim();

 const mod = {
  id: 'rooms', step: 1, title: '데크·격실', reads: ['decks', 'rooms', 'assign'], writes: [],
  layers: [{
   id: 'rooms', title: '격실', z: 10,
   draw(g, ctx) {
    const PL = ctx.L('lib/engines/geometry/plan.cjs');
    for (const r of ctx.model.rooms) {
     const a = ctx.deckAlpha(r.deckId); if (!a) continue;
     const on = ctx.sel?.kind === 'room' && ctx.sel.id === r.id;
     g.alpha(a, () => {
      g.poly(r.polygon, { fill: on ? '#dbe7f6' : ctx.model.assign[r.id]?.supply ? '#f1f5fa' : '#f7f7f5', stroke: on ? '#1f5fa8' : '#7b828a', width: on ? 2 : 0.8 });
      for (const h of r.holes || []) g.poly(h, { fill: '#ffffff', stroke: '#7b828a', width: 0.8 });
      // the label where it fits: number from 18 px of room, the name from 60 px
      const b = PL.bounds(r.polygon), w = (b.maxX - b.minX) * g.view.s, h = (b.maxY - b.minY) * g.view.s;
      if (a === 1 && w > 18 && h > 12) { const c = PL.innerPoint(r); g.text(c, r.no || '', { size: 11, bold: true, align: 'center' }); if (w > 60 && h > 26) g.text(c, String(r.name || '').slice(0, Math.floor(w / 7)), { size: 10, align: 'center', dy: 13, color: '#4a5058' }); }
     });
    }
   },
   hit(ctx, pt) { const PL = ctx.L('lib/engines/geometry/plan.cjs'), r = ctx.model.rooms.find(x => ctx.deckAlpha(x.deckId) === 1 && PL.inRoom(pt, x)); return r ? { kind: 'room', id: r.id } : null; },
  }],
  // decks from the top, each with its rooms
  tree(ctx) {
   const m = ctx.model, q = (ctx.state.q || '').trim().toLowerCase();
   return [...m.decks].sort((a, b) => b.z - a.z).map(d => {
    const rooms = m.rooms.filter(r => r.deckId === d.id && (!q || label(r).toLowerCase().includes(q)));
    return `<div class="deck${d.id === ctx.deck ? ' on' : ''}"><button class="deck-h" data-act="deck" data-arg="${esc(JSON.stringify(d.id))}">${esc(d.name)} <small>Z ${fmt(d.z)} · ${rooms.length}실</small></button>${d.id === ctx.deck ? rooms.map(r => `<button class="room${ctx.sel?.kind === 'room' && ctx.sel.id === r.id ? ' on' : ''}" data-act="room" data-arg="${esc(JSON.stringify(r.id))}">${esc(label(r))}<small>${(r.areaM2 || 0).toFixed(1)} m²</small></button>`).join('') : ''}</div>`;
   }).join('');
  },
  inspector(ctx) {
   const m = ctx.model, r = ctx.sel?.kind === 'room' && m.rooms.find(x => x.id === ctx.sel.id);
   if (!r) { const d = m.decks.find(x => x.id === ctx.deck), rooms = m.rooms.filter(x => x.deckId === ctx.deck); return d ? card(`Deck ${esc(d.name)}`, kv([['높이 Z', `${fmt(d.z)} mm`], ['층고', d.height ? `${fmt(d.height)} mm` : '—'], ['격실', rooms.length], ['면적 합계', `${rooms.reduce((t, x) => t + (x.areaM2 || 0), 0).toFixed(1)} m²`]])) : ''; }
   return card('형상', kv([['면적', `${(r.areaM2 || 0).toFixed(1)} m²`], ['체적', `${(r.volumeM3 || 0).toFixed(1)} m³`], ['천장 높이', r.ceilingHeightMm ? `${fmt(r.ceilingHeightMm)} mm` : '—'], ['ISO 분류', esc(r.isoClass || '—')]]), { from: m.source?.from === 'v1' ? '1.x 설계 데이터' : '' });
  },
  act(ctx, name, arg) {
   if (name === 'deck') return { deck: arg, select: null };
   if (name === 'room') return { select: { kind: 'room', id: arg } };
   if (name === 'q') return { state: { q: arg } };
   return null;
  },
  checks() { return []; },
 };
 if (typeof module !== 'undefined' && module.exports) module.exports = mod; else (root.HG2Modules = root.HG2Modules || []).push(mod);
})(typeof self !== 'undefined' ? self : this);
