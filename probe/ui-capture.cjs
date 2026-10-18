// UI review captures of the two apps (vendor copies): BOX CAL Enhance with S5 (2D, 3D, CAL load window) and PHG D
// with an S5 deck system from out/s5 (ribbon, settings). Writes docs/ui/*.png and a DOM summary.
const fs=require('fs'),path=require('path'),{launch,vendor}=require('../tools/browser.cjs');
const OUT=path.join(__dirname,'..','docs','ui'),url=f=>'file:///'+vendor(f).split(String.fromCharCode(92)).join('/'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await launch(),report={};
 // BOX
 let p=await b.newPage({viewport:{width:1600,height:900}});p.on('dialog',d=>d.accept());
 await p.goto(url('BOX_CAL_Enhance.html'));await p.waitForFunction(()=>window.CAD_APP&&document.querySelector('#s5ExampleBtn'),null,{timeout:120000});
 await p.screenshot({path:path.join(OUT,'box-1-empty.png')});
 await p.click('#s5ExampleBtn');await p.waitForFunction(()=>CAD_APP.st.entities.length>100,null,{timeout:120000});await sleep(1200);
 await p.screenshot({path:path.join(OUT,'box-2-s5-2d.png')});
 report.box=await p.evaluate(()=>{const vis=e=>e&&e.getClientRects().length;const top=document.querySelector('.top');
  const btns=[...document.querySelectorAll('.top button, .top .btn, .cal-row button')].filter(vis).map(x=>(x.textContent||x.title||'').trim().replace(/\s+/g,' ').slice(0,18));
  const cs=getComputedStyle(document.body);return {title:document.title,buttons:btns.length,sample:btns.slice(0,60),font:cs.fontFamily+' '+cs.fontSize,
   vars:['--bg','--panel','--line','--text','--muted','--blue','--soft','--red'].map(v=>v+':'+getComputedStyle(document.documentElement).getPropertyValue(v).trim()),
   panels:[...document.querySelectorAll('aside, .side, .panel, [class*=panel]')].filter(vis).slice(0,8).map(e=>(e.id||e.className).toString().slice(0,40)+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))};});
 try{await p.evaluate(()=>CAD_APP.view3d.show());await sleep(2500);await p.screenshot({path:path.join(OUT,'box-3-s5-3d.png')});await p.evaluate(()=>CAD_APP.view3d.hide());}catch(e){report.box3d=e.message;}
 await p.click('#calEnhanceBtn');await p.waitForFunction(()=>/^현재 격실/.test(document.querySelector('#calEnhancePanel [role=status]')?.textContent||''),null,{timeout:180000});await sleep(1200);
 await p.screenshot({path:path.join(OUT,'box-4-cal.png')});
 try{await p.evaluate(()=>document.querySelector('#calEnhancePanel iframe').contentWindow.CAL_ENHANCE.showRoomLoads());await sleep(2500);await p.screenshot({path:path.join(OUT,'box-5-room-loads.png')});}catch(e){report.boxLoads=e.message;}
 await p.close();
 // PHG D with a generated S5 system project
 p=await b.newPage({viewport:{width:1600,height:900}});p.on('dialog',d=>d.accept());
 await p.goto(url('DuctConcept_PHG_D.html'));await p.waitForFunction(()=>window.DuctConceptRouting?.ready);
 await p.screenshot({path:path.join(OUT,'phg-1-empty.png')});
 const proj=fs.readFileSync(path.join(__dirname,'..','out','s5','S3__AHU-AC-01.phg.json'),'utf8');
 await p.evaluate(t=>LineDesignV2.loadTypedProjectJson(t,'S3__AHU-AC-01'),proj);await sleep(800);
 await p.evaluate(()=>{const v=LineDesignLegacy.getState().view,svg=document.getElementById('svg'),xs=[],ys=[];for(const e of LineDesignLegacy.getState().entities)for(const q of e.points||[]){xs.push(q.x);ys.push(q.y);}
  const minX=Math.min(...xs)-800,maxX=Math.max(...xs)+800,minY=Math.min(...ys)-800,maxY=Math.max(...ys)+800,rc=svg.getBoundingClientRect(),w=Math.max(maxX-minX,(maxY-minY)*rc.width/rc.height),h=w*rc.height/rc.width;
  Object.assign(v,{x:(minX+maxX)/2-w/2,y:(minY+maxY)/2-h/2,w,h});svg.setAttribute('viewBox',`${v.x} ${v.y} ${w} ${h}`);LineDesignLegacy.renderEverything();});await sleep(500);
 await p.screenshot({path:path.join(OUT,'phg-2-s3-system.png')});
 report.phg=await p.evaluate(()=>{const vis=e=>e&&e.getClientRects().length;const cs=getComputedStyle(document.body);
  return {title:document.title,groups:[...document.querySelectorAll('.phgd-group')].map(g=>g.dataset.phgdName+':'+g.querySelectorAll('.btn.icon-command').length),font:cs.fontFamily+' '+cs.fontSize,
   vars:['--bg','--panel','--line','--text','--muted','--accent','--phgd-accent'].map(v=>v+':'+getComputedStyle(document.documentElement).getPropertyValue(v).trim()),
   docks:[...document.querySelectorAll('aside')].filter(vis).map(e=>(e.className||e.id).toString().slice(0,30)+' '+Math.round(e.getBoundingClientRect().width))};});
 await p.click('#phgdWarmBtn');await sleep(300);await p.screenshot({path:path.join(OUT,'phg-3-warm.png')});await p.click('#phgdWarmBtn');
 await p.close();await b.close();fs.writeFileSync(path.join(OUT,'ui-report.json'),JSON.stringify(report,null,1));console.log(JSON.stringify(report,null,1).slice(0,3500));})();
