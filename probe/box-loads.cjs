// Probe: S5 example -> CAL frame -> report() loads and ahu() flows.
const {launch}=require('C:/Users/HK/Desktop/PHG/tools/env.cjs');
const BOX='file:///C:/Users/HK/OneDrive/CAL_Enhance/04_CAL_Enhance_fixed.html';
(async()=>{const b=await launch(),p=await b.newPage({viewport:{width:1600,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(BOX);await p.waitForFunction(()=>window.CAD_APP&&document.querySelector('#s5ExampleBtn'),null,{timeout:120000});
 await p.click('#s5ExampleBtn');await p.waitForFunction(()=>CAD_APP.st.entities.length>100,null,{timeout:120000});await new Promise(r=>setTimeout(r,1000));
 const t0=Date.now();await p.click('#calEnhanceBtn');
 await p.waitForFunction(()=>/^현재 격실/.test(document.querySelector('#calEnhancePanel [role=status]')?.textContent||''),null,{timeout:180000});
 const r=await p.evaluate(()=>{const C=document.querySelector('#calEnhancePanel iframe').contentWindow.CAL_ENHANCE;const t=performance.now();const rep=C.report();const t1=performance.now();
  const cfg=window.CAD_APP.st.persistencePassthrough?.ahuHeatingConfig||{};const ahu=C.ahu(cfg);const t2=performance.now();
  window.__rows=rep.loads.map(x=>[x.deckId,x.no,x.name,x.isoClass,x.sup,x.exh,x.ret,Math.round(x.coolingSensibleW),Math.round(x.coolingLatentW),Math.round(x.heatingW),x.minimumFreshAirCmh,x.ventilationCmh,x.ventilationAirCmh,x.minimumAch,x.floor,Math.round(x.volume*10)/10,x.ceilingHeight,x.polygon?.length].join(' | '));const L=rep.loads[0];return {rows:window.__rows.filter((_,i)=>i%6===0),reportMs:Math.round(t1-t),ahuMs:Math.round(t2-t1),loads:rep.loads.length,loadKeys:Object.keys(L||{}),loadSample:JSON.stringify(L,(k,v)=>Array.isArray(v)&&v.length>4?'['+v.length+']':v).slice(0,1600),
   ahuSystems:ahu.systems.map(s=>({ahu:s.ahu,valid:s.valid,flow:s.flowCmh,oa:s.oaCmh,warn:s.warnings})),ahuRoom:JSON.stringify(ahu.rooms[0]),
   sups:[...new Set(rep.loads.map(x=>x.sup))],complete:rep.loads.filter(x=>x.calculationComplete).length};});
 console.log('openMs',Date.now()-t0);console.log(JSON.stringify(r,null,1));console.log('errors',errors.slice(0,5));await b.close();})();
