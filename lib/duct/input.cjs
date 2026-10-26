// Ver 2.0 duct engine - route input (V2-1.1, docs/v2/STUDY_PHG.md 3.1). A plan (one deck × system: the unit or shaft
// point, the RUs with their room and summer airflow - F-1, the restricted rooms to keep out of, the outside of the deck)
// and the rooms of that deck become what the router works on. Coordinates are BOX y (PLAN_V2.md principle 7) - the
// router never turns y. Written anew (D7); the rule values are PHG D's program defaults, not values of a standard.
'use strict';

const RULES = {
 gridMm: 200,                 // routing grid
 ruRunoutMm: 800,             // an RU's duct runs straight this far before it turns
 minSubBranchMm: 300,         // a new RU end duct at least this long
 minDuctPieceMm: 500,         // main / branch pieces between fittings at least this long
 minElbowRunMm: 500,          // a straight between two elbows at least this long
 autoGroupSpacingMm: 2000,    // RUs this close share a branch
 roomGroupMaxMm: 8000,        // RUs of one room share a branch up to this far apart
 insulationMm: 25, installClearanceMm: 25,   // added round the estimated duct width when keeping clear
 costWeights: { main: { length: 1.3, bend: 3000 }, branch: { length: 1.1, bend: 1500 }, subBranch: { length: 1, bend: 600 } },
 corridorPenalty: 1,          // weighted cost per mm of main outside a corridor (× main length weight)
 maxCells: 400000,            // grid cells over the routing area at most (the grid grows past that)
};
const GRIDS = [200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000];
// corridors: by name or by ISO class (lib/contract.cjs has the same rule for 1.0)
const CORRIDOR = /복도|통로|\bALLEY|CORRIDOR|PASSAGE/i;
const isCorridor = r => r.isoClass === 'ALLEY_SOUND' || r.isoClass === 'ALLEY_NON_SOUND' || CORRIDOR.test(r.name || '');

const pt = p => ({ x: +p.x || 0, y: +p.y || 0 });
function bbox(points) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of points) { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); } return { minX: a, minY: b, maxX: c, maxY: d }; }

// rooms: the deck's rooms { id, no, name, isoClass, polygon, holes } (the plan's deck)
function routeInput(plan, rooms = [], options = {}) {
 const rules = { ...RULES, ...options, costWeights: { ...RULES.costWeights, ...(options.costWeights || {}) } };
 const byId = new Map(rooms.map(r => [r.id, r]));
 const root = pt(plan.root);
 const terminals = (plan.rus || []).map((u, i) => ({ id: `T${i + 1}`, ruId: u.id, roomId: u.roomId || null, x: +u.x, y: +u.y, flowCmh: +u.flowCmh || 0, leadMm: rules.ruRunoutMm }));
 const forbidden = [
  ...(plan.avoid || []).filter(z => z.zone?.length > 2).map((z, i) => ({ id: `HG-${i + 1}`, kind: 'room', roomId: z.roomId || null, name: `${z.no ?? ''} ${z.name ?? ''} (${z.space ?? ''})`.trim(), polygon: z.zone.map(pt) })),
  ...(plan.outside || []).filter(z => z.length > 2).map((z, i) => ({ id: `HG-OUT-${i + 1}`, kind: 'outside', polygon: z.map(pt) }))];
 // the deck's corridors (the main prefers to run in them) and the RUs' rooms (RUs of one room may share a branch; a
 // branch is not taken off a duct inside another RU's room)
 const deckRooms = (plan.rooms || []).map(id => byId.get(id)).filter(Boolean);
 const corridors = deckRooms.filter(isCorridor).map(r => ({ roomId: r.id, name: r.name, polygon: r.polygon.map(pt) }));
 const ruRooms = {};
 for (const t of terminals) { const r = byId.get(t.roomId); if (r && !ruRooms[r.id]) ruRooms[r.id] = { corridor: isCorridor(r), polygon: r.polygon.map(pt), holes: (r.holes || []).map(h => h.map(pt)) }; }
 // the routing area: everything above and a margin; the grid grows when the area holds too many cells
 const b = bbox([root, ...terminals, ...forbidden.flatMap(z => z.polygon), ...corridors.flatMap(c => c.polygon)]);
 let grid = rules.gridMm, margin = Math.max(3 * grid, rules.ruRunoutMm + grid);
 const cells = g => ((b.maxX - b.minX + 2 * Math.max(3 * g, rules.ruRunoutMm + g)) / g) * ((b.maxY - b.minY + 2 * Math.max(3 * g, rules.ruRunoutMm + g)) / g);
 if (cells(grid) > rules.maxCells) { grid = GRIDS.find(g => g >= grid && cells(g) <= rules.maxCells) || GRIDS.at(-1); margin = Math.max(3 * grid, rules.ruRunoutMm + grid); }
 const area = { minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin };
 return { key: plan.key, deckId: plan.deckId, systemId: plan.systemId, kind: plan.kind, flowMode: plan.flowMode || (plan.kind === 'supply' ? 'supply' : 'exhaust'),
  root, rootSource: plan.rootSource || null, rootRoomId: plan.rootRoomId || null, terminals, forbidden, corridors, ruRooms, area, grid, rules, designCmh: plan.designCmh ?? terminals.reduce((t, u) => t + u.flowCmh, 0) };
}

// the same input without some forbidden zones: AUTO's steps when no route keeps out of all of them (1.0 Phg.auto):
// all zones; the outside dropped ('outside'); the restricted rooms dropped ('rooms'); none ('all'). A step that drops
// nothing is left out.
function relaxSteps(input) {
 const all = input.forbidden, outside = all.filter(z => z.kind === 'outside'), rooms = all.filter(z => z.kind !== 'outside');
 const steps = [[all, false], [rooms, 'outside'], [outside, 'rooms'], [[], 'all']];
 return steps.filter(([z], i) => i === 0 || z.length < all.length).filter(([z, r], i) => i === 0 || r === 'all' || z.length > 0).map(([forbidden, zonesRelaxed]) => ({ input: { ...input, forbidden }, zonesRelaxed }));
}

module.exports = { RULES, GRIDS, isCorridor, routeInput, relaxSteps };
