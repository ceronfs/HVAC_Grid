// Ver 2.0 XLSX writer (V2-3.9 output): sheets of rows (text and numbers), a bold shaded header row frozen at the top,
// column widths and an auto filter, in a stored (uncompressed) ZIP - Excel and LibreOffice open it. No dependencies;
// Node and browser. New code (D7).
//   xlsx([{ name, head: [..], rows: [[..]], widths: [..] }]) → Uint8Array
'use strict';

const utf8 = s => new TextEncoder().encode(s);
const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

// a ZIP of stored entries [{ name, data }], dated 2026-01-01 00:00 so the same sheets give the same bytes
function zip(files) {
 const le = (v, n) => Array.from({ length: n }, (_, i) => (v >>> (8 * i)) & 0xFF), DATE = 0x5C21, parts = [], dir = []; let at = 0;
 for (const f of files) {
  const name = utf8(f.name), crc = crc32(f.data), n = f.data.length;
  const local = [...le(0x04034b50, 4), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(DATE, 2), ...le(crc, 4), ...le(n, 4), ...le(n, 4), ...le(name.length, 2), ...le(0, 2)];
  parts.push(new Uint8Array(local), name, f.data);
  dir.push(new Uint8Array([...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(DATE, 2), ...le(crc, 4), ...le(n, 4), ...le(n, 4), ...le(name.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(at, 4)]), name);
  at += local.length + name.length + n;
 }
 const dirSize = dir.reduce((t, p) => t + p.length, 0), end = new Uint8Array([...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(files.length, 2), ...le(files.length, 2), ...le(dirSize, 4), ...le(at, 4), ...le(0, 2)]);
 const all = [...parts, ...dir, end], out = new Uint8Array(all.reduce((t, p) => t + p.length, 0)); let k = 0;
 for (const p of all) { out.set(p, k); k += p.length; }
 return out;
}

// A, B, …, Z, AA, …
const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
function sheetXml(sh) {
 const rows = [sh.head, ...sh.rows], widths = sh.widths || sh.head.map(h => Math.max(8, Math.min(40, String(h).length * 2 + 2)));
 const cell = (v, r, c, head) => {
  if (v == null || v === '') return '';
  const ref = colName(c) + (r + 1), style = head ? ' s="1"' : '';
  return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"${style}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
 };
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
  + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>`
  + rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c, r === 0)).join('')}</row>`).join('')
  + `</sheetData>${sh.rows.length ? `<autoFilter ref="A1:${colName(sh.head.length - 1)}${rows.length}"/>` : ''}</worksheet>`;
}
// sheet names: at most 31 characters, none of []:*?/\, each once
function sheetNames(sheets) {
 const seen = new Set();
 return sheets.map(s => { let n = String(s.name).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet'; for (let k = 2; seen.has(n); k++) n = n.slice(0, 28) + ' ' + k; seen.add(n); return n; });
}
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', NS = 'http://schemas.openxmlformats.org', MAIN = `${NS}/spreadsheetml/2006/main`, REL = `${NS}/officeDocument/2006/relationships`, PKG = `${NS}/package/2006`;
const STYLES = `${HEAD}<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="10"/><name val="Malgun Gothic"/></font><font><b/><sz val="10"/><name val="Malgun Gothic"/></font></fonts>`
 + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF5"/><bgColor indexed="64"/></patternFill></fill></fills>'
 + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
 + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function xlsx(sheets) {
 const names = sheetNames(sheets), filter = (s, i) => s.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(names[i]).replace(/'/g, "''")}'!$A$1:$${colName(s.head.length - 1)}$${s.rows.length + 1}</definedName>` : '';
 const files = [
  ['[Content_Types].xml', `${HEAD}<Types xmlns="${PKG}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
   + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'],
  ['_rels/.rels', `${HEAD}<Relationships xmlns="${PKG}/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
  ['xl/workbook.xml', `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${sheets.map(filter).join('')}</definedNames></workbook>`],
  ['xl/_rels/workbook.xml.rels', `${HEAD}<Relationships xmlns="${PKG}/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
  ['xl/styles.xml', STYLES],
  ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)])];
 return zip(files.map(([name, text]) => ({ name, data: utf8(text) })));
}

module.exports = { xlsx, zip, crc32, colName, sheetNames };
