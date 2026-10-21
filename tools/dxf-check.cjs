// Check a room drawing (DXF) against a contract: every room of the deck in the drawing, same number, name and area. The
// rooms are read the way that names the most (lib/dxf-in.cjs bestRooms: outlines, wall lines, or - an architectural
// drawing - the areas round the room texts, whose outline is the walls' inner face: areas come out smaller).
//   node tools/dxf-check.cjs <drawing.dxf> <contract.json> <deckId>
'use strict';
const fs = require('fs'), X = require('../lib/dxf-in.cjs');
const [file, contractFile, deckId] = process.argv.slice(2);
if (!file || !contractFile || !deckId) { console.error('사용법: node tools/dxf-check.cjs <drawing.dxf> <contract.json> <deckId>'); process.exit(2); }
const { rooms, how } = X.bestRooms(fs.readFileSync(file, 'utf8')), r = X.compare(rooms, JSON.parse(fs.readFileSync(contractFile, 'utf8')), deckId);
console.log(JSON.stringify({ read: how, drawingRooms: rooms.length, matched: r.matched.length, missingInDrawing: r.missingInDrawing, extraInDrawing: r.extraInDrawing, areaDiffs: r.areaDiffs, nameDiffs: r.nameDiffs, ok: r.ok }, null, 1));
process.exit(r.ok ? 0 : 1);
