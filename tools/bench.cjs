// How long the HVAC Grid pipeline takes on a large ship (review 2026-10-21 A04): a synthetic accommodation of
// <decks> decks x <rooms> rooms (cabins with en-suite toilets on two corridors, messes, stores), three systems a deck
// plus two over all decks, through every stage the shell runs - no browser, no PHG D.
//   node tools/bench.cjs [decks=5] [roomsPerDeck=100]
'use strict';
const K = require('../lib/contract.cjs'), PJ = require('../lib/project.cjs'), PL = require('../lib/phg-plan.cjs');

function ship(decks, perDeck) {
 const rooms = [], W = 3000, D = 6000, bays = Math.ceil(perDeck / 4);   // a bay: cabin + toilet on each side of the corridor
 for (let d = 0; d < decks; d++) {
  const deck = 'D' + (d + 1), R = (no, name, x0, y0, x1, y1, data) => rooms.push({ id: `${deck}_${no}`, no: String(no), name, deckId: deck,
   polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor: (x1 - x0) * (y1 - y0) / 1e6, volume: (x1 - x0) * (y1 - y0) * 2.4 / 1e6, calculationComplete: true, ...data });
  let n = (d + 1) * 1000;
  for (let b = 0; b < bays && rooms.filter(r => r.deckId === deck).length < perDeck; b++) {
   const x0 = b * W, x1 = x0 + W;
   for (const [y0, y1, wy0, wy1] of [[0, D - 2000, D - 2000, D], [D + 2000 + 2000, 2 * D + 2000, D + 2000, D + 4000]]) {
    const no = ++n;
    R(no, `선실 ${no}`, x0, y0, x1, y1, { sup: 'AHU-' + deck, ret: 'RA-' + deck, coolingSensibleW: 900 + (no % 7) * 60, heatingW: 600, minimumFreshAirCmh: 28.8, minimumAch: 0 });
    R(no + 500, `선실 ${no} 화장실`, x0, wy0, x0 + 1600, wy1, { exh: 'EF-SAN', ventilationAirCmh: 120, minimumAch: 15 });
   }
  }
  R(n + 1, '복도', 0, D, bays * W, D + 2000, { sup: 'AHU-' + deck, ret: 'RA-' + deck, coolingSensibleW: 3000, heatingW: 2500 });
  R(n + 2, '선원식당', bays * W, 0, bays * W + 6000, D, { sup: process.env.MESS_OA ? 'AHU-' + deck : 'AHU-ALL', ret: 'RA-' + deck, coolingSensibleW: 4000, heatingW: 1500, minimumFreshAirCmh: +(process.env.MESS_OA || 460) });
  R(n + 3, '창고', bays * W, D + 2000, bays * W + 6000, 2 * D + 2000, { coolingSensibleW: 200 });
 }
 return K.buildContract({ source: {}, decks: Array.from({ length: decks }, (_, d) => ({ id: 'D' + (d + 1), z: d * 2800, height: 2800 })), rooms });
}

if (require.main === module) {
 const decks = +process.argv[2] || 5, perDeck = +process.argv[3] || 100, t = {}, time = (k, f) => { const s = process.hrtime.bigint(); const r = f(); t[k] = Number(process.hrtime.bigint() - s) / 1e6; return r; };
 const c = time('buildContract', () => ship(decks, perDeck));
 time('applyRules', () => K.applyRules(c));
 time('validate', () => K.validate(c));
 const plans = time('PL.plan', () => PL.plan(c));
 time('airChecks', () => PJ.airChecks(c));
 const a = time('analyze (SOLAS, risers, checks)', () => PJ.analyze(PJ.make({ contract: c }), plans));
 const text = time('save (JSON)', () => JSON.stringify(PJ.make({ contract: c })));
 time('read', () => PJ.read(JSON.parse(text)));
 console.log(JSON.stringify({ decks, rooms: c.rooms.length, systems: c.systems.length, plans: plans.length, rus: plans.reduce((s, p) => s + p.rus.length, 0), boundaries: a.solas.boundaries.length, fileMB: Math.round(text.length / 1e5) / 10,
  ms: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)])) }, null, 1));
}
module.exports = { ship };
