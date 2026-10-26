// HVAC Grid 2.0 canvas core (V2-3.5): one view of the ship for every step - world mm, y up (+x forward, +y port as the
// deck drawings are read), pan, wheel zoom at the cursor, fit; the layers the modules register, drawn in z order; picking
// (the top layer that hits), dragging what a layer says is draggable. The canvas knows nothing of the design: the
// modules draw through `g` and answer hits. Canvas2D; a layer is redrawn only when the frame is.
//   const cv = new HG2Canvas.Canvas(canvasEl, { onPick(hit, pt), onDrag(hit, pt, phase), onHover(hit, pt), onView(view) })
//   cv.setLayers([{ id, z, draw(g, ctx), hit(ctx, pt, tolMm) }]); cv.setContext(ctx); cv.fit(bounds); cv.redraw()
//   g: poly(pts, style), polyline(pts, style), line(a, b, style), circle(p, rPx, style), square(p, halfPx, style),
//      diamond(p, halfPx, style), text(p, s, style), alpha(a, fn); style: { fill, stroke, width (px), dash ([px]), font }
'use strict';
(function (root) {
 // the drawing API over a Canvas2D context and a view (world mm → screen px)
 function graphics(c2d, view, size) {
  const X = x => (x - view.cx) * view.s + size.w / 2, Y = y => -(y - view.cy) * view.s + size.h / 2;
  const stroke = st => { if (!st.stroke) return; c2d.strokeStyle = st.stroke; c2d.lineWidth = st.width || 1; c2d.setLineDash(st.dash || []); c2d.stroke(); };
  const path = (pts, close) => { c2d.beginPath(); pts.forEach((p, i) => i ? c2d.lineTo(X(p.x), Y(p.y)) : c2d.moveTo(X(p.x), Y(p.y))); if (close) c2d.closePath(); };
  return {
   view, size, X, Y, px: n => n / view.s,   // px(n): n screen px in mm
   poly(pts, st = {}) { if (pts.length < 2) return; path(pts, true); if (st.fill) { c2d.fillStyle = st.fill; c2d.fill('evenodd'); } stroke(st); },
   polyline(pts, st = {}) { if (pts.length < 2) return; path(pts, false); stroke(st); },
   line(a, b, st = {}) { path([a, b], false); stroke(st); },
   circle(p, r, st = {}) { c2d.beginPath(); c2d.arc(X(p.x), Y(p.y), r, 0, 2 * Math.PI); if (st.fill) { c2d.fillStyle = st.fill; c2d.fill(); } stroke(st); },
   square(p, h, st = {}) { c2d.beginPath(); c2d.rect(X(p.x) - h, Y(p.y) - h, 2 * h, 2 * h); if (st.fill) { c2d.fillStyle = st.fill; c2d.fill(); } stroke(st); },
   diamond(p, h, st = {}) { const x = X(p.x), y = Y(p.y); c2d.beginPath(); c2d.moveTo(x, y - h); c2d.lineTo(x + h, y); c2d.lineTo(x, y + h); c2d.lineTo(x - h, y); c2d.closePath(); if (st.fill) { c2d.fillStyle = st.fill; c2d.fill(); } stroke(st); },
   text(p, s, st = {}) {
    c2d.font = st.font || `${st.bold ? '600 ' : ''}${st.size || 11}px "Malgun Gothic","Noto Sans KR",system-ui,sans-serif`; c2d.textAlign = st.align || 'left'; c2d.textBaseline = st.baseline || 'alphabetic';
    const x = X(p.x) + (st.dx || 0), y = Y(p.y) + (st.dy || 0);
    if (st.halo !== false) { c2d.lineWidth = 3; c2d.strokeStyle = st.haloColor || 'rgba(255,255,255,.9)'; c2d.setLineDash([]); c2d.strokeText(String(s), x, y); }
    c2d.fillStyle = st.color || '#222'; c2d.fillText(String(s), x, y);
   },
   alpha(a, fn) { const was = c2d.globalAlpha; c2d.globalAlpha = was * a; try { fn(); } finally { c2d.globalAlpha = was; } },
  };
 }
 // the same API recording what is drawn (tests, Node): [{ op, … }]
 function recorder(view = { cx: 0, cy: 0, s: 0.05 }, size = { w: 1000, h: 800 }) {
  const ops = [], g = { view, size, ops, px: n => n / view.s, X: x => x, Y: y => y };
  for (const op of ['poly', 'polyline', 'line', 'circle', 'square', 'diamond', 'text']) g[op] = (...args) => ops.push({ op, args });
  g.alpha = (a, fn) => fn();
  return g;
 }

 class Canvas {
  constructor(el, on = {}) {
   this.el = el; this.on = on; this.layers = []; this.ctx = {}; this.view = { cx: 0, cy: 0, s: 0.05 }; this.dirty = false; this.size = { w: 1, h: 1 };
   this.c2d = el.getContext('2d');
   new ResizeObserver(() => this.resize()).observe(el); this.resize();
   let down = null, panning = false, dragging = null, space = false;
   addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) { space = true; el.style.cursor = 'grab'; } });
   addEventListener('keyup', e => { if (e.code === 'Space') { space = false; el.style.cursor = ''; } });
   el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    const pt = this.world(e), hit = e.button === 0 && !space ? this.hit(pt) : null;
    down = { x: e.clientX, y: e.clientY, pt, hit, view: { ...this.view }, moved: false };
    panning = e.button === 1 || space || (e.button === 0 && !hit?.draggable);
    dragging = !panning && hit?.draggable ? hit : null;
   });
   el.addEventListener('pointermove', e => {
    const pt = this.world(e);
    if (!down) { this.on.onHover?.(this.hit(pt), pt); return; }
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 3) down.moved = true;
    if (!down.moved) return;
    if (panning) { this.view.cx = down.view.cx - (e.clientX - down.x) / this.view.s; this.view.cy = down.view.cy + (e.clientY - down.y) / this.view.s; this.changed(); }
    else if (dragging) { if (!dragging.started) { dragging.started = true; this.on.onDrag?.(dragging, pt, 'start'); } this.on.onDrag?.(dragging, pt, 'move'); }
   });
   el.addEventListener('pointerup', e => {
    if (!down) return; const pt = this.world(e);
    if (!down.moved) this.on.onPick?.(down.hit, pt, e);
    else if (dragging?.started) this.on.onDrag?.(dragging, pt, 'end');
    down = null; dragging = null; panning = false;
   });
   el.addEventListener('wheel', e => { e.preventDefault(); const pt = this.world(e), k = Math.exp(-e.deltaY * 0.0015), s = Math.min(5, Math.max(0.0005, this.view.s * k));
    // the point under the cursor stays where it is
    this.view.cx = pt.x - (e.offsetX - this.size.w / 2) / s; this.view.cy = pt.y + (e.offsetY - this.size.h / 2) / s; this.view.s = s; this.changed(); }, { passive: false });
   el.addEventListener('dblclick', () => this.fit());
  }
  resize() { const r = this.el.getBoundingClientRect(), dpr = devicePixelRatio || 1; this.size = { w: Math.max(1, r.width), h: Math.max(1, r.height) }; this.el.width = Math.round(this.size.w * dpr); this.el.height = Math.round(this.size.h * dpr); this.dpr = dpr; this.redraw(); }
  world(e) { const r = this.el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return { x: this.view.cx + (x - this.size.w / 2) / this.view.s, y: this.view.cy - (y - this.size.h / 2) / this.view.s }; }
  changed() { this.on.onView?.(this.view); this.redraw(); }
  setLayers(list) { this.layers = [...list].sort((a, b) => a.z - b.z); this.redraw(); }
  setContext(ctx) { this.ctx = ctx; this.redraw(); }
  // the top visible layer that hits (within 6 px)
  hit(pt) { for (const l of [...this.layers].reverse()) { if (l.visible === false || !l.hit) continue; const h = l.hit(this.ctx, pt, 6 / this.view.s); if (h) return { layer: l.id, ...h }; } return null; }
  fit(b = this.bounds) {
   if (!b || !(b.maxX > b.minX)) return; this.bounds = b;
   const pad = 0.06, s = Math.min(this.size.w / ((b.maxX - b.minX) * (1 + 2 * pad)), this.size.h / ((b.maxY - b.minY) * (1 + 2 * pad)));
   this.view = { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, s }; this.changed();
  }
  redraw() { if (this.dirty) return; this.dirty = true; requestAnimationFrame(() => { this.dirty = false; this.draw(); }); }
  draw() {
   const c = this.c2d, t0 = performance.now(); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.size.w, this.size.h);
   const g = graphics(c, this.view, this.size); this.times = {};
   for (const l of this.layers) { if (l.visible === false) continue; const t = performance.now(); c.save(); try { l.draw(g, this.ctx); } catch (err) { console.error(l.id, err); } c.restore(); this.times[l.id] = Math.round((performance.now() - t) * 10) / 10; }
   this.drawMs = Math.round((performance.now() - t0) * 10) / 10;
  }
 }

 const api = { Canvas, graphics, recorder };
 if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HG2Canvas = api;
})(typeof self !== 'undefined' ? self : this);
