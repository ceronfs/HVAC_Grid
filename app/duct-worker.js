// Ver 2.0 duct engine in a Web Worker (V2-1.8): the page sends the lib/duct sources once ({ type: 'init', files }),
// then plans ({ id, job: { plan, rooms, opt } }); the answer is { id, network, result } or { id, error }. The sources come
// from the page, so the worker works from the local server and from the one-file copy alike. The loader is the shell's
// (app/bridge.js loadLibs): CommonJS modules by their file names.
'use strict';
let engine = null;
function load(texts) {
 const done = {};
 const req = name => {
  const f = name.replace(/^\.\//, ''); if (f in done) return done[f];
  if (!(f in texts)) throw new Error('lib/duct 모듈 없음: ' + name);
  const module = { exports: {} }; done[f] = module.exports;
  new Function('module', 'exports', 'require', texts[f] + '\n//# sourceURL=lib/duct/' + f)(module, module.exports, req);
  return (done[f] = module.exports);
 };
 return req('engine.cjs');
}
self.onmessage = e => {
 const m = e.data;
 if (m.type === 'init') { try { engine = load(m.files); self.postMessage({ type: 'ready' }); } catch (err) { self.postMessage({ type: 'ready', error: String(err.stack || err) }); } return; }
 try { const a = engine.auto(m.job.plan, m.job.rooms, m.job.opt || {}); self.postMessage({ id: m.id, network: a.network, result: a.result }); }
 catch (err) { self.postMessage({ id: m.id, error: String(err.stack || err) }); }
};
