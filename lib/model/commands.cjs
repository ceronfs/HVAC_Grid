// Ver 2.0 commands and one undo (V2-3.3). Every change to the model is a command: a label and operations
// { path: [part, key, …], value } (value undefined: delete). Applying gives a new model - the parts not on a path are the
// same objects (structural sharing), so a module's layer can tell by identity what changed - and the operations that
// undo it. The history keeps commands, not snapshots (1.0 BOX kept JSON copies of the whole project).
//   apply(model, cmd, { writes })  → { model, undo: cmd } - writes: the parts the module may change (V2-3.6), else throws
//   createHistory({ limit })       → { run(model, cmd, opt), undo(model), redo(model), canUndo, canRedo, labels, clear }
//     opt.group: commands run with one group undo and redo together (a person's edit and the recompute it led to)
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
 let done = [], undone = [], next = 1;
 // the first command of a group names it
 const label = list => { const top = list.at(-1); if (!top) return null; let k = list.length - 1; while (k > 0 && top.group != null && list[k - 1].group === top.group) k--; return list[k].cmd.label || null; };
 return {
  run(model, cmd, opt = {}) { const r = apply(model, cmd, opt); done.push({ cmd, undo: r.undo, group: opt.group ?? null }); while (done.length > limit) done.shift(); undone = []; return r.model; },
  group() { return next++; },
  undo(model) { const top = done.at(-1); if (!top) return model; do { const e = done.pop(); undone.push(e); model = apply(model, e.undo).model; } while (top.group != null && done.at(-1)?.group === top.group); return model; },
  redo(model) { const top = undone.at(-1); if (!top) return model; do { const e = undone.pop(); const r = apply(model, e.cmd); done.push({ cmd: e.cmd, undo: r.undo, group: e.group }); model = r.model; } while (top.group != null && undone.at(-1)?.group === top.group); return model; },
  get canUndo() { return done.length > 0; }, get canRedo() { return undone.length > 0; },
  labels() { return { undo: label(done), redo: undone.at(-1)?.cmd.label || null }; },   // redo starts with the group's first command
  clear() { done = []; undone = []; },
 };
}

module.exports = { apply, createHistory, get, put };
