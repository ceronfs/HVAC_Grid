// The K that BOX CAL's LY 적용 (K mode "calculated") should give each boundary kind (vendor patch W): the kind's own
// insulation thickness from the CAL frame's K_STRUCTURE_DEFAULTS (the KD table), ISO 7547:2022 5.2.4 Formula (2) with
// α 80 / 8, steel 6 mm λ 50, insulation λ 0.04, air gap R 0.47, panel 25 mm λ 1.233 (wall) / 1.734 (ceiling),
// μ 1.45 (1.2 without insulation). Worked out here on its own, to check CAL's numbers against.
'use strict';
const fs = require('fs'), path = require('path');

function calFrame() {
 const html = fs.readFileSync(path.join(__dirname, '..', '..', 'vendor', 'BOX_CAL_Enhance.html'), 'utf8');
 return Buffer.from(html.match(/const CAL_ENHANCE_FRAME_BASE64 = '([A-Za-z0-9+/=]+)'/)[1], 'base64').toString('utf8');
}
// { WHEELHOUSE_ROOF: { external, insulationMm }, ... }
const boundaryKinds = (frame = calFrame()) => Object.fromEntries([...frame.matchAll(/^\s*(\w+): \{ label: "[^"]+", standardK: [\d.]+, external: (true|false), panel: "\w+", insulationMm: (\d+) \},$/gm)]
 .map(m => [m[1], { external: m[2] === 'true', insulationMm: +m[3] }]));
// panel: 'C' (deck, ceiling) or 'W' (wall)
function lyK(kinds, kind, panel) {
 const { external, insulationMm } = kinds[kind];
 const R = 0.006 / 50 + insulationMm / 1000 / 0.04 + 0.47 + 0.025 / (panel === 'C' ? 1.734 : 1.233);
 return 1 / ((external ? 1 / 80 : 1 / 8) + 1 / 8 + R / (insulationMm > 0 ? 1.45 : 1.2));
}
// [[kType, kValue]] of faces -> the LY ones, each checked; returns the LY K Types seen
function checkLyFaces(kinds, faces, assert) {
 const ly = faces.filter(([type]) => String(type).startsWith('LY-'));
 for (const [type, k] of ly) { const [, kind, panel] = type.match(/^LY-(\w+)-([CW])$/); assert.ok(Math.abs(k - lyK(kinds, kind, panel)) < 1e-9, `LY K ${type}: ${k}`); }
 return { count: ly.length, types: [...new Set(ly.map(([t]) => t))] };
}

module.exports = { calFrame, boundaryKinds, lyK, checkLyFaces };
