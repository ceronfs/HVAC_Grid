// HVAC Grid 2.0 as ONE HTML file: dist/HVAC_Grid_2.0.html opens by double-click (file://) - no server, no Node.js, no
// network, no vendor app. Put together, nothing changed:
//  - app2/index.html with its style sheet, the logo and its scripts (ui, loader, canvas, the duct worker pool, the
//    modules, the shell) inline;
//  - window.HVACGridFiles: what the scripts read at run time, by the path they ask for - the 2.0 libraries
//    (app2/loader.js FILES), the duct worker (app/duct-worker.js, started from a blob) and the T3 and S5 samples.
//   node tools/make-single2.cjs [out=dist/HVAC_Grid_2.0.html]   (npm run make:single2)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const LD = require('../app2/loader.js');
const ROOT = path.join(__dirname, '..'), DEFAULT_OUT = path.join(ROOT, 'dist', 'HVAC_Grid_2.0.html');
const SCRIPTS = { 'ui.js': 'app2/ui.js', 'loader.js': 'app2/loader.js', 'canvas.js': 'app2/canvas.js', '../app/duct-pool.js': 'app/duct-pool.js', 'modules/rooms.js': 'app2/modules/rooms.js',
 'modules/airflow.js': 'app2/modules/airflow.js', 'modules/ducts.js': 'app2/modules/ducts.js', 'modules/review.js': 'app2/modules/review.js', 'shell.js': 'app2/shell.js' };
const EMBED = [...LD.FILES, 'app/duct-worker.js', 'samples/t3.contract.json', 'samples/s5.contract.json'];
const read = f => fs.readFileSync(path.join(ROOT, f));
const dataUrl = f => `data:image/png;base64,${read(f).toString('base64')}`;
// text inside <script> / <style>: "</script" would end it, "<!--" changes how the rest is read
const inScript = (s, f) => { if (/<!--/.test(s)) throw new Error(f + ': "<!--" in a script'); return s.replace(/<\/script/gi, '<\\/script'); };
const inStyle = (s, f) => { if (/<\/style|<!--/i.test(s)) throw new Error(f + ': "</style" or "<!--" in a style sheet'); return s; };

function html({ commit = '', builtAt = '' } = {}) {
 const files = {}, hashes = {};
 for (const f of EMBED) { const b = read(f); files[f] = b.toString('utf8'); hashes[f] = crypto.createHash('sha256').update(b).digest('hex').slice(0, 16); }
 let page = read('app2/index.html').toString('utf8');
 const swap = (re, to, what) => { const n = (page.match(re) || []).length; if (n !== 1) throw new Error(`app2/index.html: ${what} ${n}개`); page = page.replace(re, to); };
 swap(/<link rel="stylesheet" href="app\.css">/, () => `<style>\n${inStyle(read('app2/app.css').toString('utf8'), 'app.css')}</style>`, 'app.css');
 swap(/href="\.\.\/app\/logo-32\.png"/, () => `href="${dataUrl('app/logo-32.png')}"`, 'logo-32.png');
 swap(/src="\.\.\/app\/logo-128\.png"/, () => `src="${dataUrl('app/logo-128.png')}"`, 'logo-128.png');
 let first = true;
 for (const [src, f] of Object.entries(SCRIPTS)) swap(new RegExp(`<script src="${src.replace(/[.\/]/g, c => '\\' + c)}"><\\/script>`), () => {
  const table = first ? `<script>window.HVACGridFiles = ${JSON.stringify(files).replace(/</g, '\\u003c')};\nwindow.HVACGridBuild = ${JSON.stringify({ commit, builtAt, files: hashes }).replace(/</g, '\\u003c')};</script>\n` : '';
  first = false; return `${table}<script>\n${inScript(read(f).toString('utf8'), f)}</script>`;
 }, src);
 swap(/<meta charset="utf-8">/, () => `<meta charset="utf-8">\n<meta name="hvac-grid-build" content="${commit} ${builtAt.slice(0, 10)} · 2.0 한 파일 (tools/make-single2.cjs)">`, 'meta charset');
 const left = [...page.matchAll(/\s(?:src|href)="(?!data:|#)([^"]+)"/g)].map(m => m[1]);
 if (left.length) throw new Error('app2/index.html: 한 파일에 넣지 못한 참조 ' + left.join(', '));
 return page;
}

function build(out = DEFAULT_OUT) {
 let commit = ''; try { commit = require('child_process').execFileSync('git', ['-C', ROOT, 'describe', '--always', '--dirty'], { encoding: 'utf8' }).trim(); } catch {}
 const text = html({ commit, builtAt: new Date().toISOString() });
 fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, text);
 return { out, bytes: Buffer.byteLength(text), files: EMBED.length };
}

if (require.main === module) { const r = build(process.argv[2] ? path.resolve(process.argv[2]) : undefined); console.log(`${path.relative(ROOT, r.out)} · ${(r.bytes / 1e6).toFixed(2)} MB · 파일 ${r.files}개`); }
module.exports = { html, build, EMBED, SCRIPTS };
