// Copy for a closed network: only the files HVAC Grid needs to run, and the Node.js that runs this script
// (runtime\node.exe, picked up by HVAC_Grid.bat), so the target PC needs Windows and Edge (or Chrome) only.
// Nothing is loaded from the internet: the vendor apps carry their workers inside, the shell loads lib/ and samples/
// from the local server.
//   node tools/make-offline.cjs [folder]   (default dist/HVAC_Grid_offline; the folder is replaced)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'HVAC_Grid_offline'));

// the launcher, the local server, the shell, the libraries the shell loads (app/shell.js LIB list), the two vendor
// apps in their frames, and the sample files the ribbon opens (③ S5 예제, ① and ③ T3 시험선)
const FILES = [
 'HVAC_Grid.bat', 'tools/start-hidden.vbs', 'tools/launch.cjs', 'tools/serve.cjs',
 'app/index.html', 'app/shell.js', 'app/bridge.js', 'app/shell.css', 'app/popup.css', 'app/logo-32.png', 'app/logo-64.png', 'app/logo-128.png',
 ...['util.cjs', 'geom.cjs', 'solas-data.json', 'solas.cjs', 'contract.cjs', 'phg-plan.cjs', 'ducts.cjs', 'risers.cjs', 'project.cjs', 'xlsx.cjs', 'plan-svg.cjs', 'diagram.cjs', 'dxf-out.cjs', 'report.cjs'].map(f => 'lib/' + f),
 'vendor/BOX_CAL_Enhance.html', 'vendor/DuctConcept_PHG_D.html',
 'samples/s5.contract.json', 'samples/t3.contract.json', 'samples/t3/T3.box.json'];

// the list must match what the shell loads, or the copy fails on the closed network where nobody can fix it
const shell = fs.readFileSync(path.join(ROOT, 'app', 'shell.js'), 'utf8');
const libs = JSON.parse(shell.match(/loadLibs\('\.\.\/lib\/', (\[[^\]]*\])\)/)[1].replace(/'/g, '"'));
const missing = libs.map(f => 'lib/' + f).filter(f => !FILES.includes(f)).concat(FILES.filter(f => !fs.existsSync(path.join(ROOT, f))));
if (missing.length) throw new Error('파일 목록을 고치세요: ' + missing.join(', '));

if (fs.existsSync(OUT)) {
 if (!fs.existsSync(path.join(OUT, 'HVAC_Grid.bat'))) throw new Error('HVAC Grid 복사본이 아닌 폴더는 지우지 않습니다: ' + OUT);
 fs.rmSync(OUT, { recursive: true, force: true });
}
let bytes = 0;
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); bytes += fs.statSync(to).size; };
for (const f of FILES) copy(path.join(ROOT, f), path.join(OUT, f));
copy(process.execPath, path.join(OUT, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'));
console.log(`${OUT}\n파일 ${FILES.length + 1}개 · ${(bytes / 1e6).toFixed(1)} MB (Node.js ${process.version} 포함)`);
