// Ver 2.0 SOLAS II-2 space of every room (V2-3.9 fire): the user's choice, else the room name, else the ISO 7547 room
// class; the space gives the fire category of the ship type (Tables 9.1-9.8 rows). New code; the name dictionary and the
// SOLAS tables are data moved from 1.x (names.json, solas-data.json - D20). SOLAS values: 원문 미확인 (F-2).
//   settings(solas)              → { ship, method, sprinkler, wallToleranceMm, minOverlapMm, lowestBelow } with defaults
//   classify(room, settings, user) → { space, cat, source: 'user'|'name'|'iso-class'|'no-category'|'unclassified', check }
//   classes(rooms, solas)        → { [roomId]: classify(...) } - the model part `fire.classes` other engines read
'use strict';
const DATA = require('./solas-data.json'), NAMES = require('./names.json');

const DEFAULTS = Object.freeze({ ship: 'CARG', method: 'IC', sprinkler: false, wallToleranceMm: 400, minOverlapMm: 100, lowestBelow: null });
const SHIPS = Object.keys(DATA.ships), METHODS = ['IC', 'IIC', 'IIIC'];
const SPACES = [...DATA.spaces, ...NAMES.extraSpaces];
const RULES = NAMES.names.map(([source, flags, space], i) => ({ re: new RegExp(source, flags.includes('g') ? flags : flags + 'g'), space, i }));

function settings(solas = {}) {
 const s = { ...DEFAULTS, ...solas };
 if (!SHIPS.includes(s.ship)) s.ship = DEFAULTS.ship;
 if (!METHODS.includes(s.method)) s.method = DEFAULTS.method;
 return s;
}
const category = (ship, space) => { const row = SPACES.find(r => r[0] === space); return row ? row[DATA.catIndex[DATA.ships[ship].cat]] : null; };
const categoryName = (ship, cat) => cat ? DATA.cats[DATA.ships[SHIPS.includes(ship) ? ship : 'CARG'].cat][cat - 1] : null;

// Korean compound names end with the word that tells the use (선교화장실 is a toilet): of all dictionary hits the one
// that ends last wins, then the longer hit, then the earlier entry
function byName(text) {
 let best = null;
 for (const r of RULES) {
  r.re.lastIndex = 0; let m;
  while ((m = r.re.exec(text))) {
   if (!m[0]) { r.re.lastIndex++; continue; }
   const end = m.index + m[0].length;
   if (!best || end > best.end || (end === best.end && m[0].length > best.len)) best = { space: r.space, end, len: m[0].length };
  }
 }
 return best?.space || null;
}
// a dictionary entry that depends on the floor area (@public, @laundry, @drying, @store)
function byArea(space, areaM2) {
 const rule = NAMES.areaRules[space]; if (!rule) return space;
 const [limit, small, large, mode] = rule;
 return (mode === 'lt' ? areaM2 < limit : areaM2 <= limit) ? small : large;
}

function classify(room, solas = {}, user = {}) {
 const s = settings(solas), u = user[room.id];
 if (u?.cat) return { space: u.space || null, cat: u.cat, source: 'user', check: null };
 let space = u?.space || null, source = space ? 'user' : null;
 if (!space) { space = byName(room.name || ''); if (space) source = 'name'; }
 if (!space && NAMES.isoClassSpace[room.isoClass]) { space = NAMES.isoClassSpace[room.isoClass]; source = 'iso-class'; }
 if (!space) return { space: null, cat: null, source: 'unclassified', check: null };
 space = byArea(space, room.areaM2 || 0);
 const cat = category(s.ship, space);
 return { space, cat, source: cat == null ? 'no-category' : source, check: source === 'user' ? null : NAMES.checks[space] || null };
}

const classes = (rooms, solas = {}) => Object.fromEntries(rooms.map(r => [r.id, classify(r, solas, solas.rooms || {})]));

module.exports = { DATA, DEFAULTS, SHIPS, SPACES, settings, category, categoryName, byName, classify, classes };
