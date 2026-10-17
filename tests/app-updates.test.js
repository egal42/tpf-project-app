const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(version='0.9.12',url='https://tpf-project-app.netlify.app/index.html?example=keep#home'){
 const elements=Object.fromEntries(['updateNotice','updateMessage','reloadAppBtn'].map(id=>[id,{hidden:true,disabled:false,textContent:'',classList:{toggle(name,value){elements[id].hidden=value;}},addEventListener(name,fn){this[name]=fn;}}]));
 const events={},assigned=[];let busy=false,calls=0;
 const context={URL,AbortSignal,Date,window:{tpfUpdateBusy:()=>busy,addEventListener:(name,fn)=>events[name]=fn},location:{href:url,assign:value=>assigned.push(value)},document:{visibilityState:'visible',querySelector:()=>({content:'0.9.11'}),getElementById:id=>elements[id],addEventListener:(name,fn)=>events[name]=fn},fetch:async()=>{calls++;return {ok:true,json:async()=>({schema:'tpf_app_version_v1',version})};}};
 vm.runInNewContext(fs.readFileSync('assets/app-updates.js','utf8'),context);
 return {elements,events,assigned,setBusy:value=>{busy=value;events['tpf-action-state']();},calls:()=>calls,ready:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('Update is opt-in and reload retains origin, query and fragment with version and cache busting',async()=>{
 const a=setup();await a.ready();assert.equal(a.elements.updateNotice.hidden,false);assert.equal(a.assigned.length,0);
 a.elements.reloadAppBtn.click();const target=new URL(a.assigned[0]);assert.equal(target.origin,'https://tpf-project-app.netlify.app');assert.equal(target.pathname,'/index.html');assert.equal(target.searchParams.get('v'),'0.9.12');assert.equal(target.searchParams.get('example'),'keep');assert.equal(target.hash,'#home');assert(target.searchParams.get('reload'));
});
test('Active actions block reload and finishing an action enables it',async()=>{
 const a=setup();await a.ready();a.setBusy(true);assert(a.elements.reloadAppBtn.disabled);a.elements.reloadAppBtn.click();assert.equal(a.assigned.length,0);a.setBusy(false);assert.equal(a.elements.reloadAppBtn.disabled,false);a.elements.reloadAppBtn.click();assert.equal(a.assigned.length,1);
});
test('Current, older and invalid manifests remain unobtrusive; versions compare numerically',async()=>{
 for(const version of ['0.9.11','0.9.9','https://invalid.example/']){const a=setup(version);await a.ready();assert(a.elements.updateNotice.hidden);}
 const a=setup('0.10.0');await a.ready();assert.equal(a.elements.updateNotice.hidden,false);
});
test('Focus checks are throttled and stale cached entry reports recovery without reload loop',async()=>{
 const a=setup();await a.ready();a.events.focus();a.events.visibilitychange();await a.ready();assert.equal(a.calls(),1);
 const b=setup('0.9.12','https://tpf-project-app.netlify.app/index.html?v=0.9.12');await b.ready();assert.match(b.elements.updateMessage.textContent,/older copy/);assert(b.elements.reloadAppBtn.hidden);b.elements.reloadAppBtn.click();assert.equal(b.assigned.length,0);
});
