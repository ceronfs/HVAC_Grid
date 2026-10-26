// HVAC Grid 2.0 UI helpers the modules share (V2-3.6): escaping, numbers, system colours, the HTML of ribbon groups,
// fields and cards. Not a module - modules may use it, it calls none of them. Node and browser.
//   Actions: an element with data-act="name" (and data-arg="JSON") is a command of the module that drew it - a button on
//   click, an input or select on change (its value goes along). The shell (app2/shell.js) delivers them to module.act().
'use strict';
(function (root) {
 const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
 const fmt = v => v == null || !Number.isFinite(+v) ? '—' : Math.round(+v).toLocaleString('ko-KR');
 const KIND_LABEL = { supply: '급기(SA)', exhaust: '배기(EA)', return: '환기(RA)' }, KINDS = ['supply', 'exhaust', 'return'];
 const COLORS = ['#1f5fa8', '#c05a00', '#00796b', '#6a3d9a', '#a0307a', '#5f6f00', '#8c564b', '#0b7a9e', '#4f5b66', '#8a6d00'];
 // one colour per system name, the same every time
 const sysColor = id => { let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
 const arg = v => v === undefined ? '' : ` data-arg="${esc(JSON.stringify(v))}"`;
 const button = (act, label, { v, title = '', primary = false, disabled = false, pressed = false } = {}) => `<button class="rb${primary ? ' primary' : ''}${pressed ? ' on' : ''}" data-act="${esc(act)}"${arg(v)}${title ? ` title="${esc(title)}"` : ''}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
 const group = (title, items) => `<div class="rg"><div class="rg-items">${items.join('')}</div><div class="rg-title">${esc(title)}</div></div>`;
 const select = (act, label, options, value, { v, title = '', disabled = false } = {}) => `<label class="field"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}<select data-act="${esc(act)}"${arg(v)}${disabled ? ' disabled' : ''}>${options.map(([val, text]) => `<option value="${esc(val)}"${String(val) === String(value ?? '') ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
 const number = (act, label, value, { v, min, max, step = 1, title = '', width = '4.5em' } = {}) => `<label class="field"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}<input type="number" data-act="${esc(act)}"${arg(v)} value="${esc(value)}"${min != null ? ` min="${min}"` : ''}${max != null ? ` max="${max}"` : ''} step="${step}" style="width:${width}"></label>`;
 const card = (title, body, { from = '', now = false } = {}) => `<div class="card${now ? ' now' : ''}"><h4>${title}${from ? `<span class="from">${esc(from)}</span>` : ''}</h4>${body}</div>`;
 const kv = rows => `<div class="kv">${rows.filter(Boolean).map(([k, v]) => `<span>${esc(k)}</span><span>${v}</span>`).join('')}</div>`;
 const dot = id => `<span class="dot" style="background:${sysColor(id)}"></span>`;
 const LEVEL = { fail: '실패', check: '확인 필요', ok: '통과', info: '참고' };

 const api = { esc, fmt, KIND_LABEL, KINDS, COLORS, sysColor, button, group, select, number, card, kv, dot, LEVEL };
 if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HG2UI = api;
})(typeof self !== 'undefined' ? self : this);
