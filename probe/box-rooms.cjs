// Probe: open BOX CAL Enhance (latest), load the built-in S5 example, print the room/deck data shape.
const path=require('path');const {launch}=require('../tools/browser.cjs');
const BOX='file:///'+require('../tools/browser.cjs').vendor('BOX_CAL_Enhance.html').split(String.fromCharCode(92)).join('/');
(async()=>{const b=await launch(),p=await b.newPage({viewport:{width:1600,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 p.on('dialog',d=>d.accept());
 await p.goto(BOX);await p.waitForFunction(()=>window.CAD_APP&&document.querySelector('#s5ExampleBtn'),null,{timeout:120000});
 await p.click('#s5ExampleBtn');await p.waitForFunction(()=>CAD_APP.st.entities.length>100,null,{timeout:120000});await new Promise(r=>setTimeout(r,1500));
 const r=await p.evaluate(()=>{const rooms=typeof CAD_APP.rooms==='function'?CAD_APP.rooms():CAD_APP.rooms;const arr=Array.isArray(rooms)?rooms:rooms?.rooms||[];
  const one=arr[0];return {type:typeof CAD_APP.rooms,count:arr.length,keys:one?Object.keys(one):[],sample:JSON.stringify(one,(k,v)=>Array.isArray(v)&&v.length>6?[...v.slice(0,3),'…'+v.length]:v).slice(0,1500),
   decks:CAD_APP.stack.decks.map(d=>d.id+':'+d.name+'@'+d.z),stKeys:Object.keys(CAD_APP.st).slice(0,60)};});
 console.log(JSON.stringify(r,null,1));console.log('errors',errors.slice(0,5));await b.close();})();
