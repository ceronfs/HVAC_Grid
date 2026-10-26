// Ver 2.0 commands and one undo (V2-3.3). Every change to the model is a command: a label and operations
// { path: [part, key, …], value } (value undefined: delete). Applying gives a new model - the parts not on a path are the
// same objects (structural sharing), so a module's layer can tell by identity what changed - and the operations that
// undo it. The history keeps commands, not snapshots (1.x BOX kept JSON copies of the whole project).
//   apply(model, cmd, { writes })  → { model, undo: cmd } - writes: the parts the module may change (V2-3.6), else throws
//   createHistory({ limit })       → { run(model, cmd, opt), undo(model), redo(model), canUndo, canRedo, labels, clear }
'use strict';

const get = (o, path) => path.reduce((v, k) => v == null ? undefined : v[k], o);
// a copy of the containers along the path with the value put at its end (undefined deletes an object key)
function put(o, path, value) {
 if (!path.length) return value;
 const [k, ...rest] = path, base = o == null ? (typeof k === 'number' ? [] : {}) : o;
 const copy = Array.isArray(base) ? base.slice() : { ...base };
 const next = put(base[k], rest, value);
 // an array element is never deleted on its own (its undo could not put it back in place): replace the whole array
 if (next === undefined && !rest.length) { if (Array.isArray(copy)) throw new Error('배열 원소는 지울 수 없음 — 배열을 통째로 바꿈'); delete copy[k]; } else copy[k] = next;
 return copy;
}
const has = (o, path) => { const parent = get(o, path.slice(0, -1)); return parent != null && Object.prototype.hasOwnProperty.call(parent, path.at(-1)); };

function apply(model, cmd, { writes = null } = {}) {
 if (!cmd || !Array.isArray(cmd.ops) || !cmd.ops.length) throw new Error('명령에 바꿀 것이 없음');
 let m = model; const back = [];
 for (const op of cmd.ops) {
  if (!Array.isArray(op.path) || !op.path.length) throw new Error('명령 경로 없음');
  // a module writes only the parts it says it writes (module contract); results is the recompute table, written with them
  if (writes && op.path[0] !== 'results' && !writes.includes(op.path[0])) throw new Error(`${cmd.label || '명령'}: ${op.path[0]}에 쓸 수 없음 (writes: ${writes.join(', ')})`);
  const parent = get(m, op.path.slice(0, -1));
  if (Array.isArray(parent) && !(op.path.at(-1) < parent.length)) throw new Error('배열 끝 밖에 쓸 수 없음 — 배열을 통째로 바꿈');
  back.unshift({ path: op.path, value: has(m, op.path) ? get(m, op.path) : undefined });
  m = put(m, op.path, op.value);
 }
 return { model: m, undo: { label: cmd.label, ops: back } };
}

function createHistory({ limit = 200 } = {}) {
 let done = [], undone = [];
 return {
  run(model, cmd, opt) { const r = apply(model, cmd, opt); done.push({ cmd, undo: r.undo }); if (done.length > limit) done.shift(); undone = []; return r.model; },
  undo(model) { const e = done.pop(); if (!e) return model; undone.push(e); return apply(model, e.undo).model; },
  redo(model) { const e = undone.pop(); if (!e) return model; const r = apply(model, e.cmd); done.push({ cmd: e.cmd, undo: r.undo }); return r.model; },
  get canUndo() { return done.length > 0; }, get canRedo() { return undone.length > 0; },
  labels() { return { undo: done.at(-1)?.cmd.label || null, redo: undone.at(-1)?.cmd.label || null }; },
  clear() { done = []; undone = []; },
 };
}

module.exports = { apply, createHistory, get, put };
