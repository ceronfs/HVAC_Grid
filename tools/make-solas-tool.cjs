// SOLAS 방화 등급 표기 - the fire-rating plan as a program of its own: ONE HTML file that runs from a disk on a closed
// network (double-click, file://; nothing loaded from anywhere). The page is tools/solas-tool/app.html; the modules it
// needs (lib/: SOLAS tables and rules, the room reader for DXF drawings, the fire-rating plan) are put inside it with a
// small require(), and the T3 test ship's deck drawings as the example.
//   node tools/make-solas-tool.cjs [out=dist/SOLAS_방화등급표기.html]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'dist', 'SOLAS_방화등급표기.html');
// in load order of their own requires (any order works - require() runs them on first use)
const MODULES = ['util.cjs', 'geom.cjs', 'solas-data.json', 'solas.cjs', 'contract.cjs', 'phg-plan.cjs', 'plan-svg.cjs', 'fire-plan.cjs', 'dxf-in.cjs'];
const SAMPLE = { decks: [['UPPER DK', 0, 'T3_D1.dxf'], ['A DK', 2800, 'T3_D2.dxf'], ['B DK', 5600, 'T3_D3.dxf'], ['NAV BRG DK', 8400, 'T3_D4.dxf']], solas: 'T3.solas.json' };

// a script may not contain "</script" anywhere (it would end the element); "<\/" is the same text in JS strings and
// regular expressions
const safe = s => s.replace(/<\/script/gi, '<\\/script');

function html(version) {
 const page = fs.readFileSync(path.join(__dirname, 'solas-tool', 'app.html'), 'utf8');
 const mods = MODULES.map(f => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', f), 'utf8');
  return f.endsWith('.json') ? `${JSON.stringify(f)}: function (module) { module.exports = ${src.trim()}; }`
   : `${JSON.stringify(f)}: function (module, exports, require) {\n${src}\n}`;
 });
 const modules = `const __defs = {\n${mods.join(',\n')}\n}, __cache = {};\nfunction require(n) { n = String(n).replace(/^\\.\\//, ''); if (__cache[n]) return __cache[n].exports; if (!__defs[n]) throw new Error('module ' + n); const m = __cache[n] = { exports: {} }; __defs[n](m, m.exports, require); return m.exports; }`;
 const t3 = path.join(ROOT, 'samples', 't3'), solas = JSON.parse(fs.readFileSync(path.join(t3, SAMPLE.solas), 'utf8'));
 const samples = `const SAMPLES = { t3: { lowestBelow: ${JSON.stringify(solas.lowestBelow || '')}, decks: [\n${SAMPLE.decks.map(([n, z, f]) => `[${JSON.stringify(n)}, ${z}, ${JSON.stringify(fs.readFileSync(path.join(t3, f), 'utf8'))}]`).join(',\n')}] } };`;
 for (const k of ['/*@@MODULES@@*/', '/*@@SAMPLES@@*/', '@@VERSION@@']) if (page.split(k).length !== 2) throw new Error('page placeholder ' + k);
 return page.replace('/*@@MODULES@@*/', () => safe(modules)).replace('/*@@SAMPLES@@*/', () => safe(samples)).replace('@@VERSION@@', () => version);
}

function version() {
 let commit = ''; try { commit = require('child_process').execFileSync('git', ['-C', ROOT, 'describe', '--always', '--dirty'], { encoding: 'utf8' }).trim(); } catch { /* not a work tree */ }
 return `HVAC Grid ${commit} · ${new Date().toISOString().slice(0, 10)}`;
}

function build(out = DEFAULT_OUT) {
 const text = html(version());
 fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, text);
 return { out, bytes: Buffer.byteLength(text) };
}

if (require.main === module) { const r = build(path.resolve(process.argv[2] || DEFAULT_OUT)); console.log(`${r.out}\n${(r.bytes / 1024).toFixed(0)} KB · 한 파일, 인터넷 없이 동작 (더블클릭으로 열기)`); }
module.exports = { MODULES, html, build, DEFAULT_OUT };
