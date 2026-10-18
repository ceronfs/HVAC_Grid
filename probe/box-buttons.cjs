const {launch,vendor}=require('../tools/browser.cjs');
(async()=>{const b=await launch(),p=await b.newPage({viewport:{width:1600,height:900}});p.on('dialog',d=>d.accept());
 await p.goto('file:///'+vendor('BOX_CAL_Enhance.html').split(String.fromCharCode(92)).join('/'));await p.waitForFunction(()=>window.CAD_APP&&document.querySelector('#s5ExampleBtn'),null,{timeout:120000});
 const r=await p.evaluate(()=>{const vis=e=>e.getClientRects().length;const pick=sel=>[...document.querySelectorAll(sel)].filter(vis).map(x=>[(x.textContent||'').trim().replace(/\s+/g,' ').slice(0,14),(x.title||x.getAttribute('aria-label')||'').slice(0,70),x.id].join(' | '));
  return {top:pick('.top button'),cal:pick('.cal-row button'),left:pick('.side:not(.right) button').slice(0,30),right:pick('.side.right button').slice(0,12)};});
 console.log(Object.entries(r).map(([k,v])=>'== '+k+'\n'+v.join('\n')).join('\n'));await b.close();})();
