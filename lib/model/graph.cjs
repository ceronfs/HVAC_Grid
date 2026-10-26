// Ver 2.0 recompute table (V2-3.2): a result is up to date when the hash of what it was made from is the hash of what
// the model holds now. Producers are the modules' engines: what they read and write (parts of lib/model/schema.cjs). A
// change marks only the producers that read the changed part (rooms → loads → airflow → that system's ducts), and a
// producer whose input is still being worked out upstream waits for it.
//   hash(value)                          → 16 hex characters of the canonical JSON (keys sorted) - Node and browser
//   order(producers)                     → producers so that every writer comes before its readers (throws on a cycle)
//   status(model, producers)             → [{ id, key, result, state: 'fresh' | 'stale' | 'waiting', inputHash }]
//   stamp(model, producer, key, at)      → the command operation that records a result as made from the model now
// producer: { id, reads: [part], writes: [part], keys?(model) → [key], input?(model, key) → value }. A keyed producer
// (one result per plan) hashes input(model, key) only, so one deck's change leaves the other decks' networks fresh.
'use strict';

// canonical JSON: object keys sorted, undefined dropped, -0 as 0
function canon(v) {
 if (v === null || typeof v !== 'object') return typeof v === 'number' ? (Object.is(v, -0) ? '0' : JSON.stringify(v)) : JSON.stringify(v) ?? 'null';
 if (Array.isArray(v)) return '[' + v.map(x => x === undefined ? 'null' : canon(x)).join(',') + ']';
 return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
// two 32-bit FNV-1a lanes with different offsets: 64 bits are plenty for "is it the same input"
function hash(value) {
 const s = typeof value === 'string' ? value : canon(value);
 let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
 for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 13; }
 return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

const resultKey = (p, key) => key == null ? p.id : `${p.id}:${key}`;
const inputOf = (model, p, key) => p.input ? p.input(model, key) : Object.fromEntries(p.reads.map(r => [r, model[r]]));
const inputHash = (model, p, key) => hash(inputOf(model, p, key));

function order(producers) {
 const writer = new Map(); for (const p of producers) for (const w of p.writes) { if (writer.has(w)) throw new Error(`${w}: ${writer.get(w).id}·${p.id} 둘이 씀`); writer.set(w, p); }
 const out = [], mark = new Map();
 const visit = (p, path) => {
  if (mark.get(p) === 2) return; if (mark.get(p) === 1) throw new Error('다시 계산 순서가 돌아옴: ' + [...path, p.id].join(' → '));
  mark.set(p, 1); for (const r of p.reads) { const w = writer.get(r); if (w && w !== p) visit(w, [...path, p.id]); } mark.set(p, 2); out.push(p);
 };
 for (const p of producers) visit(p, []);
 return out;
}

function status(model, producers) {
 const sorted = order(producers), writer = new Map(sorted.flatMap(p => p.writes.map(w => [w, p]))), late = new Set(), out = [];
 for (const p of sorted) {
  const keys = p.keys ? p.keys(model) : [null], upstream = p.reads.some(r => late.has(writer.get(r)?.id));
  for (const key of keys) {
   const k = resultKey(p, key), h = inputHash(model, p, key), have = model.results?.[k];
   const state = upstream ? 'waiting' : have && have.inputHash === h ? 'fresh' : 'stale';
   if (state !== 'fresh') late.add(p.id);
   out.push({ id: p.id, key, result: k, state, inputHash: h });
  }
 }
 return out;
}

function stamp(model, p, key = null, at = new Date().toISOString()) {
 return { path: ['results', resultKey(p, key)], value: { inputHash: inputHash(model, p, key), at } };
}

module.exports = { canon, hash, order, status, stamp, inputHash, resultKey };
