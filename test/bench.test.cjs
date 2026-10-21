'use strict';
// a large ship stays quick (review 2026-10-21 A04): tools/bench.cjs's synthetic accommodation, its messes short of their
// own fresh air in the cabin zones - the ROOM_OA suggestion once balanced the whole ship again per step (99 s on 2,030
// rooms), now only the zone
const test = require('node:test'), assert = require('node:assert/strict');
const K = require('../lib/contract.cjs'), PJ = require('../lib/project.cjs');

test('A04: 515 rooms, 5 rooms short of fresh air - the checks in well under a second', () => {
 process.env.MESS_OA = '1500';
 try {
  const c = require('../tools/bench.cjs').ship(5, 100), t0 = Date.now(), checks = PJ.airChecks(c), ms = Date.now() - t0;
  assert.equal(checks.filter(x => x.code === 'ROOM_OA').length, 5);
  assert.ok(ms < 2000, `${ms} ms`);
  assert.deepEqual(K.validate(c), []);
 } finally { delete process.env.MESS_OA; }
});
