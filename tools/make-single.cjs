// HVAC Grid as ONE HTML file: dist/HVAC_Grid.html opens by double-click (file://) with no server, no Node.js and no
// network - the whole shell flow ① ~ ⑤ with BOX CAL and PHG D. Nothing is changed, only put together:
//  - app/index.html with its style sheet, icons and scripts (shell.css, logo-*.png, bridge.js, shell.js) inline;
//  - window.HVACGridFiles: every other file the shell reads, by the path it names (tools/make-offline.cjs FILES - the
//    list checked against the shell): the vendor apps (vendor/*.html, as they are; app/bridge.js opens them in srcdoc
//    frames, which are the page's own origin where file:// frames are not), lib/ (the shell's loader), samples/ (T3),
//    app/popup.css and the logo of the table windows (data: URL).
//   node tools/make-single.cjs [out=dist/HVAC_Grid.html]   (npm run make:single)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const MO = require('./make-offline.cjs');
const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'dist', 'HVAC_Grid.html');
const INLINE = ['app/index.html', 'app/shell.js', 'app/bridge.js', 'app/shell.css', 'app/logo-32.png', 'app/logo-128.png'];
// in the offline copy but never read by the shell (the vendor hashes go into window.HVACGridBuild instead)
const NOT_READ = ['vendor/VERSIONS.json', 'samples/s5.contract.json', 'samples/t3.contract.json'];
// the files the shell reads at run time; the key is the path the shell asks for (from app/)
const EMBED = MO.FILES.filter(f => /^(app|lib|vendor|samples)\//.test(f) && !INLINE.includes(f) && !NOT_READ.includes(f));
const key = f => f.startsWith('app/') ? f.slice(4) : '../' + f;
const read = f => fs.readFileSync(path.join(ROOT, f));
const dataUrl = f => `data:${{ '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(f)]};base64,${read(f).toString('base64')}`;

// text inside <script> or <style>: "</script" or "</style" would end the element and "<!--" changes how the rest is
// read. In script source "<\/" is the same text (strings, templates, regular expressions); a style sheet has neither
const inScript = (s, f) => { if (/<!--/.test(s)) throw new Error(f + ': "<!--" in a script'); return s.replace(/<\/script/gi, '<\\/script'); };
const inStyle = (s, f) => { if (/<\/style|<!--/i.test(s)) throw new Error(f + ': "</style" or "<!--" in a style sheet'); return s; };
// the embedded files as one JS object; every "<" written \u003c, so no text in it can end the script or start a comment
const filesScript = files => 'window.HVACGridFiles = ' + JSON.stringify(files).replace(/</g, '\\u003c') + ';';

function version() {
 let commit = ''; try { commit = require('child_process').execFileSync('git', ['-C', ROOT, 'describe', '--always', '--dirty'], { encoding: 'utf8' }).trim(); } catch { /* not a work tree */ }
 return { commit, builtAt: new Date().toISOString() };
}

function html({ commit = '', builtAt = '' } = {}) {
 const missing = MO.missingFiles(); if (missing.length) throw new Error('tools/make-offline.cjs FILES를 고치세요: ' + missing.join(', '));
 const files = {}, hashes = {};
 for (const f of EMBED) {
  const b = read(f); hashes[f] = crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
  files[key(f)] = /\.png$/.test(f) ? dataUrl(f) : b.toString('utf8');
 }
 let page = read('app/index.html').toString('utf8');
 const swap = (re, to, what) => { const n = (page.match(re) || []).length; if (n !== 1) throw new Error(`app/index.html: ${what} ${n}개`); page = page.replace(re, to); };
 swap(/<link rel="stylesheet" href="shell\.css">/, () => `<style>\n${inStyle(read('app/shell.css').toString('utf8'), 'shell.css')}</style>`, 'shell.css');
 for (const n of [32, 64]) swap(new RegExp(`href="logo-${n}\\.png"`), () => `href="${dataUrl(`app/logo-${n}.png`)}"`, `logo-${n}.png 아이콘`);
 swap(/src="logo-128\.png"/, () => `src="${dataUrl('app/logo-128.png')}"`, 'logo-128.png');
 const build = { commit, builtAt, files: hashes };
 swap(/<script src="bridge\.js"><\/script>/, () => `<script>${filesScript(files)}\nwindow.HVACGridBuild = ${JSON.stringify(build).replace(/</g, '\\u003c')};</script>\n<script>\n${inScript(read('app/bridge.js').toString('utf8'), 'bridge.js')}</script>`, 'bridge.js');
 swap(/<script src="shell\.js"><\/script>/, () => `<script>\n${inScript(read('app/shell.js').toString('utf8'), 'shell.js')}</script>`, 'shell.js');
 swap(/<meta charset="utf-8">/, () => `<meta charset="utf-8">\n<meta name="hvac-grid-build" content="${commit} ${builtAt.slice(0, 10)} · 한 파일 (tools/make-single.cjs)">`, 'meta charset');
 // nothing of the page may still point at a file beside it
 const left = [...page.matchAll(/\s(?:src|href)="(?!data:|#)([^"]+)"/g)].map(m => m[1]);
 if (left.length) throw new Error('app/index.html: 한 파일에 넣지 못한 참조 ' + left.join(', '));
 return page;
}

function build(out = DEFAULT_OUT) {
 const text = html(version());
 fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, text);
 return { out, bytes: Buffer.byteLength(text), files: EMBED.length + INLINE.length };
}

if (require.main === module) { const r = build(path.resolve(process.argv[2] || DEFAULT_OUT)); console.log(`${r.out}\n${(r.bytes / 1e6).toFixed(1)} MB · 파일 ${r.files}개를 한 파일로 · 서버·Node·인터넷 없이 더블클릭으로 열기`); }
module.exports = { EMBED, INLINE, key, html, build, DEFAULT_OUT };
