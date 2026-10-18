// Minimal XLSX reader for node (tests and tools): the cell values of every sheet, by sheet name. Uses zlib for deflated
// entries. Shared strings and inline strings, numbers as numbers. Not for the browser.
'use strict';
const zlib = require('zlib');

function unzip(buf) {
 const files = {}, eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
 if (eocd < 0) throw new Error('ZIP 끝 레코드 없음');
 let at = buf.readUInt32LE(eocd + 16); const n = buf.readUInt16LE(eocd + 10);
 for (let i = 0; i < n; i++) {
  const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20), nl = buf.readUInt16LE(at + 28), xl = buf.readUInt16LE(at + 30), cl = buf.readUInt16LE(at + 32), off = buf.readUInt32LE(at + 42);
  const name = buf.toString('utf8', at + 46, at + 46 + nl), lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28), data = buf.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + size);
  files[name] = method === 8 ? zlib.inflateRawSync(data) : data; at += 46 + nl + xl + cl;
 }
 return files;
}
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const col = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

// { sheetName: [[row cells...]] } (0-based arrays, empty cells null)
function readWorkbook(buf) {
 const f = unzip(buf), text = k => f[k] ? f[k].toString('utf8') : '';
 const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
 const rels = Object.fromEntries([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
 const out = {};
 for (const m of text('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
  const target = 'xl/' + rels[m[2]].replace(/^\/?xl\//, ''), rows = [];
  for (const r of text(target).matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
   const row = [];
   for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const t = (c[2].match(/t="(\w+)"/) || [])[1], v = (c[3] || '').match(/<v>([\s\S]*?)<\/v>/), is = (c[3] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/);
    row[col(c[1])] = t === 's' ? shared[+v[1]] : t === 'inlineStr' ? unxml(is ? is[1] : '') : t === 'str' ? unxml(v ? v[1] : '') : v ? (Number.isFinite(+v[1]) ? +v[1] : v[1]) : null;
   }
   rows[+r[1] - 1] = Array.from(row, x => x ?? null);
  }
  out[unxml(m[1])] = Array.from(rows, x => x || []);
 }
 return out;
}

module.exports = { unzip, readWorkbook };
