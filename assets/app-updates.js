/* Static version checks only. No automatic reloads, timers or payment requests. */
(() => {
  'use strict';
  const current=document.querySelector('meta[name="tpf-version"]').content;
  const notice=document.getElementById('updateNotice'),message=document.getElementById('updateMessage'),button=document.getElementById('reloadAppBtn');
  const valid=v=>typeof v==='string'&&/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(v);
  const newer=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;};
  const requested=new URL(location.href).searchParams.get('v');
  const stale=valid(requested)&&newer(requested,current);
  let latest=null,lastCheck=0,inFlight=false;
  function render(){
    const busy=window.tpfUpdateBusy?.()===true;
    notice.classList.toggle('hidden',!latest&&!stale);
    message.textContent=stale?'This browser loaded an older copy of the app. Close this tab and open the app again.':latest?'An update is available (v'+latest+'). Reload when you’re ready. You may need to sign in again.':'';
    button.classList.toggle('hidden',!latest||stale);
    button.disabled=busy;
    if(busy&&latest&&!stale)message.textContent='An update is available. Finish your current action before reloading.';
  }
  async function check(){
    if(document.visibilityState==='hidden'||inFlight||(lastCheck&&Date.now()-lastCheck<3600000))return;
    lastCheck=Date.now();inFlight=true;
    try{
      const response=await fetch('app-version.json?check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)return;
      const data=await response.json();
      if(data.schema!=='tpf_app_version_v1'||!valid(data.version))return;
      if(newer(data.version,current))latest=data.version;
      render();
    }catch{/* Offline or failed checks never interrupt the app. */}
    finally{inFlight=false;}
  }
  button.addEventListener('click',()=>{
    if(!latest||stale||window.tpfUpdateBusy?.()===true){render();return;}
    const target=new URL(location.href);target.pathname=target.pathname.replace(/[^/]*$/,'index.html');
    target.searchParams.set('v',latest);target.searchParams.set('reload',String(Date.now()));
    location.assign(target.href);
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
  window.addEventListener('focus',check);
  window.addEventListener('tpf-action-state',render);
  render();check();
})();
