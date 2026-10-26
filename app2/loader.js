// HVAC Grid 2.0 - the libraries in the browser (V2-3.5): the CommonJS modules of lib/ (model, engines, duct engine) by
// their paths, fetched once, with require() resolving './x' and '../y' as Node does. No 1.0 lib file is on the list
// (D7) - test/app2.test.cjs checks the list holds everything the entries require and nothing of 1.0.
//   const L = await HG2Loader.load('../');   L('lib/model/run.cjs') → its exports
'use strict';
(function (root) {
 const FILES = ['lib/model/schema.cjs', 'lib/model/graph.cjs', 'lib/model/commands.cjs', 'lib/model/run.cjs', 'lib/io/v1.cjs', 'lib/engines/producers.cjs',
  'lib/engines/geometry/plan.cjs', 'lib/engines/fire/classify.cjs', 'lib/engines/fire/rate.cjs', 'lib/engines/fire/boundaries.cjs', 'lib/engines/fire/penetrations.cjs', 'lib/engines/fire/checks.cjs',
  'lib/engines/fire/names.json', 'lib/engines/fire/solas-data.json', 'lib/engines/airflow/airflow.cjs', 'lib/engines/airflow/names.json', 'lib/engines/systems/plans.cjs', 'lib/engines/systems/risers.cjs',
  'lib/engines/systems/names.json', 'lib/engines/review/air.cjs', 'lib/engines/review/review.cjs', 'lib/engines/output/text.cjs', 'lib/engines/output/xlsx.cjs', 'lib/engines/output/svg.cjs',
  'lib/engines/output/diagram.cjs', 'lib/engines/output/fireplan.cjs', 'lib/engines/output/dxf.cjs', 'lib/engines/output/report.cjs',
  'lib/duct/engine.cjs', 'lib/duct/input.cjs', 'lib/duct/route.cjs', 'lib/duct/assign.cjs', 'lib/duct/size.cjs', 'lib/duct/pressure.cjs', 'lib/duct/astar.cjs', 'lib/duct/network.cjs'];
 // a/b/../c → a/c
 function resolve(from, name) {
  const parts = (name.startsWith('.') ? from.split('/').slice(0, -1).concat(name.split('/')) : name.split('/')), out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  return out.join('/');
 }
 function make(texts) {
  const done = {};
  const req = (from, name) => {
   const f = resolve(from, name); if (f in done) return done[f];
   if (!(f in texts)) throw new Error('2.0 lib 모듈 없음: ' + f + ' (' + from + ')');
   if (f.endsWith('.json')) return (done[f] = JSON.parse(texts[f]));
   const module = { exports: {} }; done[f] = module.exports;
   new Function('module', 'exports', 'require', texts[f] + '\n//# sourceURL=' + f)(module, module.exports, n => req(f, n));
   return (done[f] = module.exports);
  };
  return path => req('', path);
 }
 // the texts: from the one-file copy's table when there is one, else from the server
 async function load(base = '../') {
  const table = root.HVACGridFiles, texts = {};
  await Promise.all(FILES.map(async f => { if (table?.[f] != null) { texts[f] = table[f]; return; } const r = await fetch(base + f); if (!r.ok) throw new Error(f + ' 읽기 실패 (' + r.status + ')'); texts[f] = await r.text(); }));
  return make(texts);
 }
 const api = { FILES, resolve, make, load };
 if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HG2Loader = api;
})(typeof self !== 'undefined' ? self : this);
