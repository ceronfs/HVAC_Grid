// PHG D D9 (2026-10-23, HVAC Grid request "GRID, PHG 모두 수정"): AUTO of one system knows the ducts of the other systems
// of the deck, and a host may steer the main into a band of its own.
//  - settings.phgdForeignDucts [{ id, systemId, points, widthMm, heightMm, diameterMm }] (app coordinates) +
//    settings.phgdForeignCrossing { layerMm, gapMm, parallelGapMm, insulationMm, ownHeightMm, mode, crossingCost }:
//    a right-angle crossing is allowed when both heights and the gap fit the duct layer (it costs like a crossing),
//    else blocked; a parallel run nearer than both half envelopes is a plan overlap and blocked; mode 'soft' makes
//    both a cost. Candidate scores count the crossings; a spine candidate breaking the hard rule is dropped.
//  - settings.phgdRouteZones [{ id, zoneType: 'PREFERRED' | 'RESTRICTED', polygon }]: engine route zones for this run
//    (PREFERRED turns the engine's corridor preference on).
//  - settings.phgdMainCorridors [{ name, polygon }]: the corridors the main should follow, instead of the ones found by
//    room name.
// Without these settings PHG D routes as before. Every anchor must match exactly once.
'use strict';
module.exports=function(html){
const edits = [
 // 1. the section AUTO assumes for a flow, with its height (a crossing stacks the heights)
 ['function phgdPlanWidth(flow,role,env){const set=env.sizing?.[role]||env.sizing?.branch||{},v=set.velocityMps||8;',
  'function phgdPlanWidth(flow,role,env){return phgdPlanSection(flow,role,env).w;}\n  // PHG D D9: the section (plan width w, height h) AUTO assumes for a flow - the height is what a crossing stacks\n  function phgdPlanSection(flow,role,env){const set=env.sizing?.[role]||env.sizing?.branch||{},v=set.velocityMps||8;'],
 ['find(D=>flow/(Math.PI*D*D/4e6*3600)<=v+1e-9);if(d)return d;}', 'find(D=>flow/(Math.PI*D*D/4e6*3600)<=v+1e-9);if(d)return {w:d,h:d};}'],
 ['if(!best||score<best.s)best={s:score,w};}', 'if(!best||score<best.s)best={s:score,w,h};}'],
 ['return best?best.w:Math.max(100,Math.ceil(Math.sqrt(base)/50)*50);}', 'return best?{w:best.w,h:best.h}:{w:Math.max(100,Math.ceil(Math.sqrt(base)/50)*50),h:minH};}'],
 // 2. ducts of other systems: pair rule, whole-network conflicts, per-edge sections
 ['  globalThis.PHGDEnvelope=Object.freeze({planWidth:phgdPlanWidth,half:phgdHalf,edgeHalves:phgdEdgeHalves,check:phgdEnvelopeCheck,segmentClear:phgdSegmentClear});',
  `  globalThis.PHGDEnvelope=Object.freeze({planWidth:phgdPlanWidth,half:phgdHalf,edgeHalves:phgdEdgeHalves,check:phgdEnvelopeCheck,segmentClear:phgdSegmentClear});
  // PHG D D9 (HVAC Grid 2026-10-23): the ducts of the other systems of the deck, routed before this one
  // (routingSettings.foreign = { ducts: [{ id, systemId, points, halfMm, heightMm }], layerMm, gapMm, parallelGapMm,
  // ownHeightMm, mode: 'hard' | 'soft', crossingCost }). A crossing at right angles is allowed when both heights and the
  // gap fit the duct layer under the ceiling (layerMm), else it is blocked; a parallel run nearer than both half
  // envelopes (+ parallelGapMm) is a plan overlap and blocked. mode 'soft': both cost instead, for a deck where the hard
  // rules leave no route. A crossing costs crossingCost (default the engine's crossing weight, 2500 mm of duct).
  function phgdForeignSegs(f){if(!f||!Array.isArray(f.ducts)||!f.ducts.length)return null;if(f.__segs)return f.__segs;const segs=[];
    for(const d of f.ducts)for(let i=1;i<(d.points||[]).length;i++){const a=d.points[i-1],b=d.points[i];if(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<EPS)continue;segs.push({a,b,id:d.id,systemId:d.systemId,half:Math.max(0,+d.halfMm||0),h:Math.max(0,+d.heightMm||0)});}
    Object.defineProperty(f,'__segs',{value:segs,enumerable:false,configurable:true});Object.defineProperty(f,'__maxHalf',{value:segs.reduce((m,s)=>Math.max(m,s.half),0),enumerable:false,configurable:true});return segs;}
  function phgdForeignPair(a,b,ownHalf,ownH,s,f,grid){const hz=Math.abs(a.y-b.y)<EPS,vt=Math.abs(a.x-b.x)<EPS,shz=Math.abs(s.a.y-s.b.y)<EPS,svt=Math.abs(s.a.x-s.b.x)<EPS,gap=Math.max(0,+f.gapMm||0),pg=Math.max(0,+f.parallelGapMm||0);
    if((hz&&shz)||(vt&&svt)){const ax=hz?'x':'y',off=hz?Math.abs(a.y-s.a.y):Math.abs(a.x-s.a.x),ov=Math.min(Math.max(a[ax],b[ax]),Math.max(s.a[ax],s.b[ax]))-Math.max(Math.min(a[ax],b[ax]),Math.min(s.a[ax],s.b[ax]));
      if(ov<=EPS)return null;const need=ownHalf+s.half+pg;if(off<need-EPS)return {type:'FOREIGN_PARALLEL',lengthMm:ov,id:s.id};return off<need+grid?{type:'NEAR',lengthMm:ov}:null;}
    if(!(hz||vt)||!(shz||svt))return segmentDistance(a,b,s.a,s.b)<ownHalf+s.half+pg-EPS?{type:'FOREIGN_PARALLEL',lengthMm:0,id:s.id}:null;
    const p=perpendicularIntersection(a,b,s.a,s.b);if(!p||eq(p,b))return null;
    const stack=ownH+s.h+gap;return f.layerMm>0&&stack>f.layerMm+EPS?{type:'FOREIGN_STACK',stackMm:stack,point:p,id:s.id}:{type:'CROSSING',stackMm:stack,point:p,id:s.id};}
  // half envelope and height of every edge from the flows downstream of it (as phgdEdgeHalves)
  function phgdEdgeSections(project){const env=project.routingSettings?.ductEnvelope,out=new Map();if(!env)return out;const flows=env.flows||{},nodes=new Map(project.nodes.map(n=>[n.id,n])),adj=new Map(),seen=new Set();
    for(const e of project.edges)for(const [a,b] of [[e.fromNodeId,e.toNodeId],[e.toNodeId,e.fromNodeId]]){if(!adj.has(a))adj.set(a,[]);adj.get(a).push([b,e]);}
    const down=(n,via)=>{seen.add(n);let f=nodes.get(n)?.type==='TERMINAL'?(Number(flows[n])||0):0;for(const [m,e] of adj.get(n)||[]){if(e===via||seen.has(m))continue;const sub=down(m,e);
      const role=[e.fromNodeId,e.toNodeId].some(id=>nodes.get(id)?.type==='TERMINAL')?'sub_branch':e.routeRole==='MAIN'?'main':'branch';out.set(e.id,{half:phgdHalf(sub,role,env),h:sub>0?phgdPlanSection(sub,role,env).h:0});f+=sub;}return f;};
    for(const s of project.systems||[])if(s.rootNodeId&&!seen.has(s.rootNodeId))down(s.rootNodeId,null);return out;}
  function phgdForeignConflicts(project){const f=project.routingSettings?.foreign,segs=phgdForeignSegs(f);if(!segs)return null;const grid=project.canvas?.routingGrid||100,secs=phgdEdgeSections(project),out={crossings:0,overlaps:[],stacks:[],maxStackMm:0};
    const index=new SpatialIndex(2000);for(const s of segs)index.add({a:s.a,b:s.b,s});
    for(const e of project.edges){const sec=secs.get(e.id)||{half:0,h:+f.ownHeightMm||0};for(let i=1;i<e.points.length;i++){const a=e.points[i-1],b=e.points[i];
      for(const {s} of index.query(a,b,sec.half+f.__maxHalf+(+f.parallelGapMm||0)+grid)){const r=phgdForeignPair(a,b,sec.half,sec.h,s,f,grid);if(!r||r.type==='NEAR')continue;
        if(r.type==='FOREIGN_PARALLEL')out.overlaps.push({edgeId:e.id,with:s.id,lengthMm:Math.round(r.lengthMm)});else{out.crossings++;out.maxStackMm=Math.max(out.maxStackMm,r.stackMm);if(r.type==='FOREIGN_STACK')out.stacks.push({edgeId:e.id,with:s.id,stackMm:r.stackMm,point:r.point});}}}}
    return out;}
  globalThis.PHGDForeign=Object.freeze({segs:phgdForeignSegs,pair:phgdForeignPair,conflicts:phgdForeignConflicts,sections:phgdEdgeSections,section:phgdPlanSection});`],
 // 3. the search: the foreign ducts in their own index, checked on every step
 ["s.preferredCorridors?.includes(z.id)))]));}\n    routeEnvelope(){",
  "s.preferredCorridors?.includes(z.id)))]));\n      this.foreign=phgdForeignSegs(project.routingSettings.foreign)?project.routingSettings.foreign:null;if(this.foreign){this.foreignIndex=new SpatialIndex(2000);for(const s of phgdForeignSegs(this.foreign))this.foreignIndex.add({a:s.a,b:s.b,s});}}\n" +
  "    // PHG D D9: half envelope and height of the route searched now (its RUs' flow), for the foreign-duct rule\n" +
  "    routeSection(){const env=this.project.routingSettings.ductEnvelope,f=this.foreign;if(!env||!this.activeTerminalIds?.size)return {half:0,h:Math.max(0,+f?.ownHeightMm||0)};if(this._secRef===this.activeTerminalIds)return this._secVal;\n" +
  "      let flow=0;for(const id of this.activeTerminalIds)flow+=Number(env.flows?.[id])||0;const all=this.project.nodes.filter(n=>n.type==='TERMINAL').length,k=this.activeTerminalIds.size,role=k>1&&k>=all?'main':k>1?'branch':'sub_branch';\n" +
  "      this._secRef=this.activeTerminalIds;this._secVal={half:this.routeEnvelope(),h:flow>0?phgdPlanSection(flow,role,env).h:Math.max(0,+f.ownHeightMm||0)};return this._secVal;}\n    routeEnvelope(){"],
 ["      if(envW){const inst=this.project.routingSettings.ductEnvelope.installClearanceMm||0,hz=a.y===b.y,",
  "      if(this.foreignIndex){const f=this.foreign,sec=this.routeSection(),soft=f.mode==='soft';\n" +
  "        for(const {s} of this.foreignIndex.query(a,b,sec.half+f.__maxHalf+(+f.parallelGapMm||0)+this.grid)){const r=phgdForeignPair(a,b,sec.half,sec.h,s,f,this.grid);if(!r)continue;\n" +
  "          if(r.type==='NEAR'){parallel+=WEIGHTS.parallel*r.lengthMm;continue;}if(r.type==='CROSSING'){crossings+=(+f.crossingCost||WEIGHTS.crossing)/WEIGHTS.crossing;continue;}\n" +
  "          if(!soft){this.lastFailure={reasonCode:r.type,blockage:{type:'FOREIGN_DUCT',id:s.id}};return null;}nearClearance+=r.type==='FOREIGN_STACK'?20000:20*Math.max(100,r.lengthMm);}}\n" +
  "      if(envW){const inst=this.project.routingSettings.ductEnvelope.installClearanceMm||0,hz=a.y===b.y,"],
 // 4. candidate choice: foreign crossings and conflicts in the weighted cost; a spine candidate breaking the hard rule is dropped
 ['    const corridorMain = globalThis.PHGDCorridor?.metrics?.(project) || null, corridorCost = corridorMain ? corridorMain.outsideMm * (weights.main?.length ?? 1) * corridorMain.penalty : 0;\n    return { total: Object.values(roles).reduce((s, r) => s + r.total, 0) + envelopeConflicts * 20000 + corridorCost, envelopeConflicts, corridorCost,',
  '    const corridorMain = globalThis.PHGDCorridor?.metrics?.(project) || null, corridorCost = corridorMain ? corridorMain.outsideMm * (weights.main?.length ?? 1) * corridorMain.penalty : 0;\n' +
  '    // PHG D D9: crossings with the other systems\' ducts, and their plan overlaps / stacks over the duct layer\n' +
  '    const foreign = globalThis.PHGDForeign?.conflicts?.(project) || null, foreignCost = foreign ? foreign.crossings * (+project.routingSettings?.foreign?.crossingCost || 2500) + (foreign.overlaps.length + foreign.stacks.length) * 20000 : 0;\n' +
  '    return { total: Object.values(roles).reduce((s, r) => s + r.total, 0) + envelopeConflicts * 20000 + corridorCost + foreignCost, envelopeConflicts, corridorCost, foreign, foreignCost,'],
 ['        result.validation=Duct.Validator.validate(p);if(!result.validation.pass)continue;',
  "        result.validation=Duct.Validator.validate(p);if(!result.validation.pass)continue;\n        {const F=globalThis.PHGDForeign?.conflicts?.({...p,routingSettings:p.routingSettings||raw.routingSettings});if(F&&raw.routingSettings.foreign?.mode!=='soft'&&(F.overlaps.length||F.stacks.length))continue;}   // PHG D D9"],
 // 5. the routing model: foreign ducts, extra route zones (a preferred band, a restricted corridor) and the main's corridors from the host
 ["      routingZones: forbiddenZones.map(z => ({id:'USER-ZONE-'+z.id,zoneType:'FORBIDDEN',polygon:z.polygon.map(transform)})),",
  "      routingZones: forbiddenZones.map(z => ({id:'USER-ZONE-'+z.id,zoneType:'FORBIDDEN',polygon:z.polygon.map(transform)}))\n" +
  "        // PHG D D9: zones a host gives for this run (settings.phgdRouteZones): PREFERRED (cheaper inside, the rest costs more) or RESTRICTED (twice the cost)\n" +
  "        .concat((Array.isArray(s.settings?.phgdRouteZones) ? s.settings.phgdRouteZones : []).filter(z => ['PREFERRED', 'RESTRICTED'].includes(z?.zoneType) && Array.isArray(z.polygon) && z.polygon.length > 2)\n" +
  "          .map((z, i) => ({ id: 'HOST-ZONE-' + (z.id || i + 1), zoneType: z.zoneType, polygon: z.polygon.map(transform), ...(z.zoneType === 'PREFERRED' ? { preferredSystems: ['SYS'] } : { restrictedSystems: ['SYS'] }) }))),"],
 ["        corridorMain: s.settings?.phgdCorridorMain === false || !scope.PHGDCorridors ? null : (() => { const list = scope.PHGDCorridors(s.entities, s.settings?.phgdCorridorWords);",
  "        // PHG D D9: the host may give the main's corridors (settings.phgdMainCorridors: [{ name, polygon }]) instead of the corridors found by room name\n" +
  "        corridorMain: s.settings?.phgdCorridorMain === false || !scope.PHGDCorridors ? null : (() => { const given = Array.isArray(s.settings?.phgdMainCorridors) ? s.settings.phgdMainCorridors.filter(c => Array.isArray(c?.polygon) && c.polygon.length > 2) : [],\n" +
  "          list = given.length ? given.map((c, i) => ({ name: String(c.name || 'HOST ' + (i + 1)), source: 'host', polygon: c.polygon })) : scope.PHGDCorridors(s.entities, s.settings?.phgdCorridorWords);"],
 ["        crossingPolicy: 'FORBIDDEN',\n        clearanceDefault: 0,",
  "        // PHG D D9: ducts of other systems of the deck (settings.phgdForeignDucts, app coordinates) and how they may be crossed (settings.phgdForeignCrossing)\n" +
  "        foreign: (() => { const F = s.settings?.phgdForeignDucts; if (!Array.isArray(F) || !F.length) return null; const c = s.settings?.phgdForeignCrossing || {}, n = (v, d = 0) => Number.isFinite(+v) && +v >= 0 ? +v : d;\n" +
  "          const ducts = F.filter(d => Array.isArray(d?.points) && d.points.length > 1 && d.points.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))).map(d => ({ id: String(d.id ?? ''), systemId: String(d.systemId ?? ''), points: d.points.map(transform),\n" +
  "            halfMm: n(d.widthMm || d.diameterMm) / 2 + n(c.insulationMm), heightMm: n(d.heightMm || d.diameterMm) + 2 * n(c.insulationMm) }));\n" +
  "          return ducts.length ? { ducts, layerMm: n(c.layerMm), gapMm: n(c.gapMm, 50), parallelGapMm: n(c.parallelGapMm), ownHeightMm: n(c.ownHeightMm), mode: c.mode === 'soft' ? 'soft' : 'hard', crossingCost: n(c.crossingCost) || undefined } : null; })(),\n" +
  "        crossingPolicy: 'FORBIDDEN',\n        clearanceDefault: 0,"],
 ["        useCorridors: false,\n        useCongestion: false,",
  "        useCorridors: (Array.isArray(s.settings?.phgdRouteZones) ? s.settings.phgdRouteZones : []).some(z => z?.zoneType === 'PREFERRED'),   // PHG D D9: on with a host band\n        useCongestion: false,"]
];

 for (const [a] of edits) { const n = html.split(a).length - 1; if (n !== 1) throw Error('foreign-ducts anchor x' + n + ': ' + a.slice(0, 90)); }
 for (const [a, b] of edits) html = html.replace(a, () => b);
 return html;
};
