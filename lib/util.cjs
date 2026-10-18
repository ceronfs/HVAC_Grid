// Small helpers shared by the shell, the outputs and the tools (pure).
'use strict';

// HTML text / attribute value
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// a finite number or the fallback (never a string that could carry markup)
const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const round = (v, d = 0) => { const f = 10 ** d; return Math.round(num(v) * f) / f; };
// a file name part from free text (system names come from BOX): no path separators, no Windows reserved characters
const safeName = s => String(s ?? '').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^\.+/, '_').slice(0, 80) || '_';
// local date-time for file names and reports: 202610190811 / 2026-10-19 08:11
const pad = n => String(n).padStart(2, '0');
const localStamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
const localTime = v => { const d = v ? new Date(v) : new Date(); return Number.isNaN(+d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// CSV cell: quoted when needed, and text that a spreadsheet would run as a formula (= + - @ tab CR) prefixed with '
function csvCell(v) {
 if (typeof v === 'number') return String(v);
 let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
 return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// DXF text value: one line (a line break would end the group-code pair), non-ASCII as \U+XXXX when `unicode` is set
const dxfText = (s, unicode = false) => { const one = String(s ?? '').replace(/[\r\n\t]+/g, ' '); return unicode ? one.replace(/[^\x20-\x7E]/g, ch => '\\U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')) : one; };
// length of a polyline (same units as the points)
const pathLength = pts => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0);

module.exports = { esc, num, round, safeName, localStamp, localTime, csvCell, dxfText, pathLength };
