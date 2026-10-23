// PHG D patch D9 on the vendor copy (the PHG original applies the same module in PHG_D_Build/foreign-ducts.cjs).
//   node tools/patch-phgd-d9.cjs [file]      (default vendor/DuctConcept_PHG_D.html; a second run finds D9 and stops)
'use strict';
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'vendor', 'DuctConcept_PHG_D.html');
const text = fs.readFileSync(file, 'utf8');
if (text.includes('PHG D D9')) { console.log('D9 already in', file); process.exit(0); }
fs.writeFileSync(file, require('./phgd-d9.cjs')(text));
console.log('D9 applied to', file);
