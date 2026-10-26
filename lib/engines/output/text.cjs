// Ver 2.0 output helpers (V2-3.9 output): text for HTML, DXF and file names, local time, polyline length. New code (D7).
'use strict';

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// a finite number or the fallback - never a string that could carry markup
const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const two = n => String(n).padStart(2, '0');
// 2026-10-19 08:11 in local time ('' for a date that is not one)
const localTime = v => { const d = v ? new Date(v) : new Date(); return Number.isNaN(+d) ? '' : `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };
// a DXF value on one line (a line break ends a group-code pair); `unicode`: everything past ASCII as \U+XXXX, which
// AutoCAD reads whatever the drawing's code page
const dxfText = (s, unicode = false) => { const line = String(s ?? '').replace(/[\r\n\t]+/g, ' '); return unicode ? line.replace(/[^\x20-\x7E]/g, ch => '\\U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')) : line; };
const pathLength = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
const r1 = v => v == null || !Number.isFinite(+v) ? '' : Math.round(v * 10) / 10;
const r0 = v => v == null || !Number.isFinite(+v) ? '' : Math.round(v);

module.exports = { esc, num, localTime, dxfText, pathLength, r1, r0 };
