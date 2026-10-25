// The single file (tools/make-single.cjs): every file the shell reads is inside it by the path the shell names, the
// vendor apps exactly as vendor/ holds them (their patches kept, docs/VENDOR_PATCHES.md), nothing points at a file beside
// it, and no embedded text can end its script. The file in a browser: test/e2e/single.e2e.cjs.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const SINGLE = require('../tools/make-single.cjs'), MO = require('../tools/make-offline.cjs');
const ROOT = path.join(__dirname, '..');
const page = SINGLE.html({ commit: 'test', builtAt: '2026-10-25T00:00:00Z' });
const embedded = () => JSON.parse(page.match(/window\.HVACGridFiles = (\{.*?\});\nwindow\.HVACGridBuild/s)[1]);

test('single file: the files the shell reads, by the path it names', () => {
 const files = embedded(), shell = fs.readFileSync(path.join(ROOT, 'app', 'shell.js'), 'utf8'), bridge = fs.readFileSync(path.join(ROOT, 'app', 'bridge.js'), 'utf8');
 const libs = JSON.parse(shell.match(/loadLibs\('\.\.\/lib\/', (\[[^\]]*\])\)/)[1].replace(/'/g, '"')).map(f => '../lib/' + f);
 const named = [...(shell + bridge).matchAll(/['`](\.\.\/(?:lib|samples|vendor)\/[^'`$]+)['`]/g)].map(m => m[1]);
 for (const k of [...libs, ...named, 'popup.css', 'logo-64.png']) assert.ok(k in files, 'embedded: ' + k);
 assert.match(files['logo-64.png'], /^data:image\/png;base64,/);
 // every file of the offline copy that the shell reads (make-offline checks its list against the shell)
 for (const f of SINGLE.EMBED) assert.ok(MO.FILES.includes(f));
});

test('single file: vendor apps and samples exactly as in the repository', () => {
 const files = embedded(), versions = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor', 'VERSIONS.json'), 'utf8'));
 for (const f of ['BOX_CAL_Enhance.html', 'DuctConcept_PHG_D.html']) {
  const text = files['../vendor/' + f]; assert.equal(text, fs.readFileSync(path.join(ROOT, 'vendor', f), 'utf8'), f);
  assert.equal(crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').slice(0, 16), versions[f].sha256_16, f + ' = vendor/VERSIONS.json');
 }
 assert.equal(files['../samples/t3/T3.box.json'], fs.readFileSync(path.join(ROOT, 'samples', 't3', 'T3.box.json'), 'utf8'));
 assert.equal(files['../lib/contract.cjs'], fs.readFileSync(path.join(ROOT, 'lib', 'contract.cjs'), 'utf8'));
});

test('single file: one page, nothing beside it, no script ended early', () => {
 assert.deepEqual([...page.matchAll(/\s(?:src|href)="(?!data:|#)([^"]+)"/g)].map(m => m[1]), []);
 assert.doesNotMatch(page, /<link rel="stylesheet"/);
 // the page's own script elements only (files, bridge, shell): no "</script" inside the embedded text or the scripts
 assert.equal((page.match(/\n<script>/g) || []).length, 3); assert.equal((page.match(/<\/script/gi) || []).length, 3);
 assert.equal((page.match(/<!--/g) || []).length, (fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8').match(/<!--/g) || []).length);
 assert.match(page, /<meta name="hvac-grid-build" content="test 2026-10-25/);
});
