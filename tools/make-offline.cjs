// Copy for a closed network: only the files HVAC Grid needs to run, and the Node.js that runs this script
// (runtime\node.exe, picked up by HVAC_Grid.bat), so the target PC needs Windows and Edge (or Chrome) only.
// Nothing is loaded from the internet: the vendor apps carry their workers inside, the shell loads lib/ and samples/
// from the local server.
//   node tools/make-offline.cjs [folder]   (default dist/HVAC_Grid_offline; the folder is replaced)
// The folder is replaced only when it is a copy this script made (its MANIFEST.json) - never the source folder, a
// folder above it, a git work tree or a folder of other files (review 2026-10-21 F10). MANIFEST.json records the
// commit, the Node.js and every file's SHA-256, so a copy on the closed network says what it is (A07). The copy also holds
// SOLAS_방화등급표기.html, the fire-rating plan as a program of its own (tools/make-solas-tool.cjs).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'dist', 'HVAC_Grid_offline');
const MANIFEST = 'MANIFEST.json', KIND = 'HVAC Grid offline copy';

// the launcher, the local server, the shell, the libraries the shell loads (app/shell.js LIB list), the two vendor
// apps in their frames and their versions, and the sample files the ribbon opens (③ S5 예제, ① and ③ T3 시험선 with
// its SOLAS settings)
const FILES = [
 'HVAC_Grid.bat', 'tools/start-hidden.vbs', 'tools/launch.cjs', 'tools/serve.cjs',
 'app/index.html', 'app/shell.js', 'app/bridge.js', 'app/shell.css', 'app/popup.css', 'app/logo-32.png', 'app/logo-64.png', 'app/logo-128.png',
 ...['util.cjs', 'geom.cjs', 'solas-data.json', 'solas.cjs', 'contract.cjs', 'duct-layer.cjs', 'phg-plan.cjs', 'clash.cjs', 'ducts.cjs', 'risers.cjs', 'project.cjs', 'xlsx.cjs', 'plan-svg.cjs', 'diagram.cjs', 'dxf-out.cjs', 'fire-plan.cjs', 'report.cjs', 'k-change.cjs'].map(f => 'lib/' + f),
 'vendor/BOX_CAL_Enhance.html', 'vendor/DuctConcept_PHG_D.html', 'vendor/VERSIONS.json',
 'samples/s5.contract.json', 'samples/t3.contract.json', 'samples/t3/T3.box.json', 'samples/t3/T3.solas.json'];

// the list must match what the app loads, or the copy fails on the closed network where nobody can fix it: the
// shell's library list and every '../lib|samples|vendor/...' path the shell and the bridge name
function missingFiles(root = ROOT) {
 const read = f => fs.readFileSync(path.join(root, 'app', f), 'utf8'), shell = read('shell.js'), bridge = read('bridge.js');
 const libs = JSON.parse(shell.match(/loadLibs\('\.\.\/lib\/', (\[[^\]]*\])\)/)[1].replace(/'/g, '"')).map(f => 'lib/' + f);
 const named = [...(shell + bridge).matchAll(/['`]\.\.\/((?:lib|samples|vendor)\/[^'`$]+)['`]/g)].map(m => m[1]);
 return [...new Set([...libs, ...named])].filter(f => !FILES.includes(f)).concat(FILES.filter(f => !fs.existsSync(path.join(root, f))));
}

// may this folder be replaced? Throws when not: the source folder or one above it, a git work tree or a source
// checkout, a folder that is not empty and not a copy made here. The copy made before MANIFEST.json existed (the
// default folder with HVAC_Grid.bat) is replaced once.
function guardOut(out, root = ROOT) {
 const real = p => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
 const o = real(out), r = real(root), lower = s => process.platform === 'win32' ? s.toLowerCase() : s;
 if (lower(o) === lower(r) || lower(r).startsWith(lower(o).replace(/[\\/]+$/, '') + path.sep)) throw new Error('원본 폴더나 그 상위 폴더에는 만들 수 없습니다: ' + out);
 if (!fs.existsSync(o)) return 'new';
 if (!fs.statSync(o).isDirectory()) throw new Error('폴더가 아닙니다: ' + out);
 if (['.git', 'package.json', 'tools/make-offline.cjs'].some(f => fs.existsSync(path.join(o, f)))) throw new Error('원본·저장소 폴더는 지우지 않습니다: ' + out);
 if (!fs.readdirSync(o).length) return 'empty';
 let m = null; try { m = JSON.parse(fs.readFileSync(path.join(o, MANIFEST), 'utf8')); } catch { /* none */ }
 if (m?.kind === KIND) return 'replace';
 if (lower(o) === lower(real(DEFAULT_OUT)) && fs.existsSync(path.join(o, 'HVAC_Grid.bat'))) return 'replace';
 throw new Error('이 도구가 만든 복사본(MANIFEST.json)이 아닌 폴더는 지우지 않습니다: ' + out);
}

function build(out = DEFAULT_OUT) {
 const missing = missingFiles(); if (missing.length) throw new Error('파일 목록을 고치세요: ' + missing.join(', '));
 const state = guardOut(out);
 if (state === 'replace') fs.rmSync(out, { recursive: true, force: true });
 let bytes = 0; const hashes = {};
 const copy = (from, to, rel) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); const b = fs.readFileSync(to); bytes += b.length; hashes[rel] = crypto.createHash('sha256').update(b).digest('hex'); };
 for (const f of FILES) copy(path.join(ROOT, f), path.join(out, f), f);
 const node = 'runtime/' + (process.platform === 'win32' ? 'node.exe' : 'node');
 copy(process.execPath, path.join(out, node), node);
 // the standalone SOLAS 방화 등급 표기 (one HTML file, opened by double-click) beside the launcher
 const tool = 'SOLAS_방화등급표기.html'; require('./make-solas-tool.cjs').build(path.join(out, tool));
 { const b = fs.readFileSync(path.join(out, tool)); bytes += b.length; hashes[tool] = crypto.createHash('sha256').update(b).digest('hex'); }
 let commit = null; try { commit = require('child_process').execFileSync('git', ['-C', ROOT, 'describe', '--always', '--dirty'], { encoding: 'utf8' }).trim(); } catch { /* not a work tree */ }
 fs.writeFileSync(path.join(out, MANIFEST), JSON.stringify({ kind: KIND, builtAt: new Date().toISOString(), commit, node: process.version, files: hashes }, null, 1) + '\n');
 return { out, files: FILES.length + 1, bytes };
}

if (require.main === module) {
 const r = build(path.resolve(process.argv[2] || DEFAULT_OUT));
 console.log(`${r.out}\n파일 ${r.files}개 · ${(r.bytes / 1e6).toFixed(1)} MB (Node.js ${process.version} 포함) · ${MANIFEST}`);
}
module.exports = { FILES, MANIFEST, KIND, DEFAULT_OUT, missingFiles, guardOut, build };
