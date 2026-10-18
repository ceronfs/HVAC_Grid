// docs/ui/mockup.template.html + S5 data (contract, generated PHG D networks for deck S3) -> docs/ui/mockup.html.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), c = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 's5.contract.json'), 'utf8'));
const outDir = path.join(ROOT, 'out', 's5'), summary = fs.existsSync(path.join(outDir, 'summary.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'summary.json'), 'utf8')) : [];
const DEMO_DECKS = (process.env.MOCKUP_DECKS || 'S3').split(',');
const networks = summary.filter(s => DEMO_DECKS.includes(s.deck)).map(s => {
 const p = JSON.parse(fs.readFileSync(path.join(outDir, s.key + '.phg.json'), 'utf8')), doc = p.network || {};
 const ducts = (doc.ducts || []).map(d => ({ type: d.type, points: d.points.map(q => ({ x: Math.round(q.x), y: Math.round(q.y) })) }));
 const nodes = doc.nodes || [], diffusers = doc.diffusers || [];
 const root = nodes.find(n => n.type === 'root');
 const rus = diffusers.map(d => { const room = c.rooms.find(r => r.deckId === s.deck && insidePoly({ x: d.x, y: -d.y }, r.polygon)); return { x: d.x, y: d.y, flowCmh: d.flowCmh, roomId: room?.id || null }; });
 return { deckId: s.deck, systemId: s.system, rootSource: s.rootSource, root: { x: root.x, y: root.y }, ducts, rus, lengthM: s.auto?.lengthM, indexPa: s.auto?.indexPa };
});
function insidePoly(p, poly) { let k = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) k = !k; } return k; }
const data = { project: 'S5 · 5 Deck 예제 (BOX CAL)', rules: c.rules, decks: c.decks, systems: c.systems.map(({ roomIds, ...s }) => s),
 rooms: c.rooms.map(r => ({ id: r.id, no: r.no, name: r.name, deckId: r.deckId, isoClass: r.isoClass, polygon: r.polygon, areaM2: r.areaM2, volumeM3: r.volumeM3, systems: r.systems })),
 loads: c.loads, airflow: c.airflow, networks };
const tpl = fs.readFileSync(path.join(ROOT, 'docs', 'ui', 'mockup.template.html'), 'utf8');
fs.writeFileSync(path.join(ROOT, 'docs', 'ui', 'mockup.html'), tpl.replace('/*DATA*/null', JSON.stringify(data)));
console.log('mockup', Math.round(JSON.stringify(data).length / 1024) + ' KB data,', networks.length, 'networks');
