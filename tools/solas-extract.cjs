// SOLAS fire rating tables -> lib/solas-data.json. The single source is the user's tool (vendor/SOLAS_fire_rating.html,
// a frozen copy): its data blocks (Tables 9.1-9.8, notes, categories, ship types, space dictionary) are cut out and
// evaluated in a sandbox, nothing else of the page runs. A block that is missing stops the extraction.
//   node tools/solas-extract.cjs [--check]   (--check: fail when lib/solas-data.json differs from the tool)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const SRC = path.join(__dirname, '..', 'vendor', 'SOLAS_fire_rating.html'), OUT = path.join(__dirname, '..', 'lib', 'solas-data.json');
const BLOCKS = ['T91', 'T92', 'T93', 'T94', 'T95', 'T96', 'T97', 'T98', 'N_9192', 'N_9394', 'N_9596', 'N_9798', 'N_STAR', 'CATS', 'SHIPS', 'SPACES'];

function extract(html) {
 // each block is "const NAME = <literal>;" ending at the first ";" that closes the bracket depth
 let code = '';
 for (const name of BLOCKS) {
  const at = html.indexOf(`const ${name} =`); if (at < 0) throw new Error('SOLAS 원본에서 ' + name + ' 블록을 찾지 못했습니다');
  let depth = 0, inStr = null, i = html.indexOf('=', at) + 1;
  for (; i < html.length; i++) { const c = html[i];
   if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
   if (c === '"' || c === "'" || c === '`') inStr = c; else if ('[{('.includes(c)) depth++; else if (']})'.includes(c)) depth--; else if (c === ';' && depth === 0) break; }
  code += html.slice(at, i + 1) + '\n';
 }
 const box = {}; vm.runInNewContext(code + `\n__out = { ${BLOCKS.join(', ')} };`, box, { timeout: 2000 });
 const o = box.__out, ships = {};
 // SHIPS refers to the tables by object; keep the table names instead
 const table = t => BLOCKS.find(n => n.startsWith('T') && o[n] === t), notes = n => BLOCKS.find(k => k.startsWith('N_') && o[k] === n);
 for (const [k, s] of Object.entries(o.SHIPS)) ships[k] = { key: s.key, label: s.label, cat: s.cat, B: table(s.B), D: table(s.D), tB: s.tB, tD: s.tD, notes: notes(s.notes), altRule: s.altRule };
 return JSON.parse(JSON.stringify({ source: 'vendor/SOLAS_fire_rating.html', sha256: crypto.createHash('sha256').update(html).digest('hex').slice(0, 16),
  tables: Object.fromEntries(BLOCKS.filter(n => /^T9/.test(n)).map(n => [n, o[n]])), notes: Object.fromEntries(BLOCKS.filter(n => /^N_9/.test(n)).map(n => [n, o[n]])),
  star: o.N_STAR, cats: o.CATS, ships, spaces: o.SPACES, catIndex: { p14: 2, p11: 3, c11: 4, t10: 5 } }));
}

if (require.main === module) {
 const data = extract(fs.readFileSync(SRC, 'utf8')), text = JSON.stringify(data, null, 1) + '\n';
 if (process.argv.includes('--check')) { const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === text; console.log(same ? 'solas-data.json OK' : 'solas-data.json differs from the tool'); process.exit(same ? 0 : 1); }
 fs.writeFileSync(OUT, text);
 console.log(JSON.stringify({ out: OUT, tables: Object.keys(data.tables).length, spaces: data.spaces.length, sha256: data.sha256 }));
}
module.exports = { extract };
