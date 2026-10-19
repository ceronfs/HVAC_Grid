// Minimal XLSX writer (no dependencies, runs in node and in the browser): sheets of rows with strings and numbers,
// a bold header row, column widths, a frozen header. Stored (uncompressed) ZIP - Excel and LibreOffice open it.
//   const bytes = xlsx([{ name: '격실', head: ['번호', '면적'], rows: [['101', 24.5]], widths: [10, 12] }])  -> Uint8Array
'use strict';

const enc = s => new TextEncoder().encode(s);
const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

// ZIP with stored entries; files: [{ name, data: Uint8Array }]
function zip(files) {
 const parts = [], central = []; let offset = 0;
 const u16 = v => [v & 0xFF, (v >>> 8) & 0xFF], u32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
 for (const f of files) {
  const name = enc(f.name), crc = crc32(f.data), size = f.data.length;
  // DOS date 2026-01-01 00:00 (fixed, so the same input gives the same bytes)
  const head = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5C21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)];
  parts.push(new Uint8Array(head), name, f.data);
  central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5C21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
  offset += head.length + name.length + size;
 }
 const cdSize = central.reduce((t, p) => t + p.length, 0);
 const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
 const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((t, p) => t + p.length, 0)); let at = 0;
 for (const p of all) { out.set(p, at); at += p.length; }
 return out;
}

const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function sheetXml(sh) {
 const rows = [sh.head, ...sh.rows], widths = sh.widths || sh.head.map(h => Math.max(8, Math.min(40, String(h).length * 2 + 2)));
 const cell = (v, r, c, bold) => { const ref = colName(c) + (r + 1), st = bold ? ' s="1"' : '';
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xml(v)}</t></is></c>`; };
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
  + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>`
  + rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c, r === 0)).join('')}</row>`).join('')
  + `</sheetData>${sh.rows.length ? `<autoFilter ref="A1:${colName(sh.head.length - 1)}${rows.length}"/>` : ''}</worksheet>`;
}

// sheet names: <= 31 chars, no []:*?/\ , unique
function safeNames(sheets) { const seen = new Set();
 return sheets.map(s => { let n = String(s.name).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet'; let k = 2; while (seen.has(n)) n = n.slice(0, 28) + ' ' + k++; seen.add(n); return n; }); }

function xlsx(sheets) {
 const names = safeNames(sheets);
 const files = [
  ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
   + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'],
  ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
   + names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>'
   + `<definedNames>${sheets.map((s, i) => s.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(names[i]).replace(/'/g, "''")}'!$A$1:$${colName(s.head.length - 1)}$${s.rows.length + 1}</definedName>` : '').join('')}</definedNames></workbook>`],
  ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
   + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
   + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Malgun Gothic"/></font><font><b/><sz val="10"/><name val="Malgun Gothic"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
  ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)])];
 return zip(files.map(([name, text]) => ({ name, data: enc(text) })));
}

// read back the cell text of a sheet written by xlsx() (tests): stored ZIP only
function readSheet(bytes, index = 1) {
 const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder(); let at = 0;
 while (at + 30 <= bytes.length && dv.getUint32(at, true) === 0x04034b50) {
  const size = dv.getUint32(at + 18, true), nl = dv.getUint16(at + 26, true), xl = dv.getUint16(at + 28, true), name = dec.decode(bytes.subarray(at + 30, at + 30 + nl)), data = bytes.subarray(at + 30 + nl + xl, at + 30 + nl + xl + size);
  if (name === `xl/worksheets/sheet${index}.xml`) {
   const text = dec.decode(data), rows = [];
   for (const m of text.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)) rows.push([...m[2].matchAll(/<c r="[A-Z]+\d+"[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)<\/c>/g)].map(c => c[1] != null ? +c[1] : c[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')));
   return rows;
  }
  at += 30 + nl + xl + size;
 }
 return null;
}

module.exports = { xlsx, zip, crc32, readSheet, colName };
