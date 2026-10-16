const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tpf-account-browser-'));
let server,browser;
const impact={schema:'tpf_website_summary_v1',revision:'a'.repeat(64),publishedAt:'2026-10-08T21:53:50.843Z',impact:{trees:'1096',estimatedCo2Kg:'124290',asOf:'2026-10-08'}};
const result=[];
async function start(){server=spawn(process.execPath,['scripts/local-server.js','--preview'],{env:{...process.env,TPF_PREVIEW_DATA_DIR:temp},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>{if(code)reject(Error('Server exited '+code));});});}
async function stop(){await new Promise(resolve=>{server.once('exit',resolve);server.kill();});}
process.on('exit',()=>{server?.kill();});
async function scenario(name,fn){await fn();result.push(name);console.log('PASS '+name);}
async function pageFor(username,{authError=false,impactError=false}={}){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(name=>{window.__previewUsername=name;},username);
 const p=await context.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
 let sdk=fs.readFileSync('scripts/preview-sdk.js','utf8');
 sdk+=`\nconst realInit=Pi.init;Pi.init=async c=>{window.__config=c;return realInit(c)};
 const realAuth=Pi.authenticate;Pi.authenticate=async(s,c)=>{window.__scopes=s;${authError?"throw Error('Login rejected');":"return realAuth(s,c);"}};
 const realPayment=Pi.createPayment;Pi.createPayment=(data,cb)=>{window.__paymentCalls=(window.__paymentCalls||0)+1;window.__callbacks=cb;return realPayment(data,{...cb,onReadyForServerCompletion:async(id,tx)=>{window.__id=id;window.__tx=tx;return cb.onReadyForServerCompletion(id,tx);}});};`;
 await p.route('**/__preview/sdk.js',r=>r.fulfill({body:sdk,contentType:'text/javascript'}));
 await p.route('**/.netlify/functions/impact-summary',r=>r.fulfill({status:impactError?503:200,json:impactError?{error:'Unavailable'}:impact}));
 await p.goto('http://127.0.0.1:4173/');await p.locator('#screen-login:not(.hidden)').waitFor();return p;
}
async function login(p){await p.locator('#loginBtn').click();await p.locator('#app-shell:not(.hidden)').waitFor();}
async function section(p,name){await p.locator('.nav-button[data-screen-target="'+name+'"]').click();}
async function pay(p,amount='0.1'){await section(p,'support');await p.locator('#customAmount').fill(amount);await p.locator('#sdkPaymentBtn').click();await p.locator('[data-screen="myforest"].active').waitFor();}
(async()=>{
 await start();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || chromium.executablePath(),headless:true,args:['--no-sandbox']});fs.mkdirSync('tests/artifacts',{recursive:true});
 await scenario('Pi login gate, server verification, SDK settings and four sections',async()=>{
  const p=await pageFor('gate');assert.equal(await p.locator('#app-shell').isVisible(),false);await login(p);assert.deepEqual(await p.evaluate(()=>__config),{version:'2.0',sandbox:true});assert.deepEqual(await p.evaluate(()=>__scopes),['username','payments']);assert.deepEqual(await p.locator('.nav-button').allTextContents(),['Home','Support','My Forest','About']);
  for(const name of ['support','myforest','about','home']){await section(p,name);assert(await p.locator('[data-screen="'+name+'"].active').isVisible());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  assert.equal(await p.locator('#clearHistoryBtn').count(),0);assert.deepEqual(p.errors,[]);await p.context().close();
 });
 await scenario('Rejected login or unavailable account service cannot bypass authenticated entry',async()=>{
  let p=await pageFor('rejected',{authError:true});await p.locator('#loginBtn').click();assert.equal(await p.locator('#app-shell').isVisible(),false);await p.context().close();
  p=await pageFor('down');await p.route('**/.netlify/functions/my-forest',r=>r.fulfill({status:503,json:{error:'History unavailable'}}));await p.locator('#loginBtn').click();await p.waitForTimeout(100);assert.equal(await p.locator('#app-shell').isVisible(),false);assert.match(await p.locator('#status').innerText(),/unavailable/);await p.context().close();
 });
 await scenario('Confirmed payments survive new browser contexts, cleared browser storage and a server restart',async()=>{
  let p=await pageFor('persistent');await login(p);await pay(p,'0.0000001');assert.equal(await p.locator('#personalTotal').innerText(),'0.0000001');await p.context().clearCookies();await p.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await p.context().close();
  await stop();await start();p=await pageFor('persistent');await login(p);await section(p,'myforest');assert.equal(await p.locator('#personalCount').innerText(),'1');assert.equal(await p.locator('#personalTotal').innerText(),'0.0000001');assert.equal(await p.locator('.history-item').count(),1);await p.context().close();
 });
 await scenario('A different account sees none of the first account’s payments',async()=>{
  const p=await pageFor('different');await login(p);await section(p,'myforest');assert.equal(await p.locator('#personalCount').innerText(),'0');assert.equal(await p.locator('#personalTotal').innerText(),'0');assert(!await p.locator('#historyList').innerText().then(t=>t.includes('0.0000001')));await p.context().close();
 });
 await scenario('Repeated SDK completion callbacks do not duplicate persistent totals',async()=>{
  const p=await pageFor('duplicates');await login(p);await pay(p,'0.1');await p.evaluate(async()=>{await __callbacks.onReadyForServerCompletion(__id,__tx);await __callbacks.onReadyForServerCompletion(__id,__tx);});assert.equal(await p.locator('#personalCount').innerText(),'1');assert.equal(await p.locator('#personalTotal').innerText(),'0.1');await p.context().close();
 });
 await scenario('Failed completion is pending; retry confirms without creating another payment',async()=>{
  const p=await pageFor('retry');await login(p);await p.route('**/.netlify/functions/complete-payment',r=>r.fulfill({status:503,json:{error:'Record storage unavailable'}}));await section(p,'support');await p.locator('#sdkPaymentBtn').click();await p.locator('#pendingNotice:not(.hidden)').waitFor();await p.waitForFunction(()=>!document.getElementById('retryPaymentBtn').disabled);assert(await p.locator('#sdkPaymentBtn').isDisabled());await p.unroute('**/.netlify/functions/complete-payment');await p.locator('#retryPaymentBtn').click();await p.locator('[data-screen="myforest"].active').waitFor();assert.equal(await p.locator('#personalCount').innerText(),'1');assert.equal(await p.evaluate(()=>__paymentCalls),1);await p.context().close();
 });
 await scenario('Refresh failure keeps last known account totals with an explicit stale warning',async()=>{
  const p=await pageFor('stale');await login(p);await pay(p,'3');await p.route('**/.netlify/functions/my-forest',r=>r.fulfill({status:503,json:{error:'Account unavailable'}}));await p.locator('#refreshHistoryBtn').click();await p.waitForFunction(()=>document.getElementById('historyStatus').textContent.includes('out of date'));assert.equal(await p.locator('#personalTotal').innerText(),'3');await section(p,'home');await section(p,'myforest');assert.match(await p.locator('#historyStatus').innerText(),/out of date/);await p.context().close();
 });
 await scenario('Local legacy entries are not counted until Pi verifies them; original entries survive',async()=>{
  const p=await pageFor('legacy');await p.evaluate(()=>localStorage.setItem('tpf_testnet_history_legacy',JSON.stringify([{amount:900,status:'completed',type:'testnet_payment',paymentId:'unknown',txid:'unknown-tx'}])));await login(p);await section(p,'myforest');assert.equal(await p.locator('#personalTotal').innerText(),'0');assert(await p.locator('#legacyNotice').isVisible());await p.locator('#restoreLegacyBtn').click();await p.waitForFunction(()=>document.getElementById('legacyText').textContent.includes('could not be verified'));assert.equal(await p.locator('#personalTotal').innerText(),'0');assert(await p.evaluate(()=>localStorage.getItem('tpf_testnet_history_legacy').includes('900')));await p.context().close();
 });
 await scenario('Invalid amounts are blocked and Testnet payments never change real global impact',async()=>{
  const p=await pageFor('amounts');await login(p);await section(p,'support');for(const n of ['0','-1','1e3','0.00000001','abc']){await p.locator('#customAmount').fill(n);await p.locator('#sdkPaymentBtn').click();assert.equal(await p.evaluate(()=>window.__paymentCalls||0),0);}await pay(p,'0,2');assert.equal(await p.locator('#personalTotal').innerText(),'0.2');assert.equal(await p.locator('[data-global-trees]').last().innerText(),'1,096');await p.context().close();
 });
 await scenario('Sign out hides account data; tokens are never persisted in browser storage',async()=>{
  const p=await pageFor('privacy');await login(p);await pay(p,'1');assert.equal(await p.evaluate(()=>JSON.stringify(localStorage).includes('local-preview:')),false);await p.locator('#signOutBtn').click();assert.equal(await p.locator('#app-shell').isVisible(),false);assert.equal(await p.locator('#historyList').innerText(),'');await p.context().close();
 });
 await scenario('Account history works with localStorage and sessionStorage unavailable',async()=>{
  const p=await pageFor('no-storage');await p.evaluate(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}});Object.defineProperty(window,'sessionStorage',{get(){throw Error('blocked')}});});await login(p);await pay(p,'1');assert.equal(await p.locator('#personalCount').innerText(),'1');assert.deepEqual(p.errors,[]);await p.context().close();
 });
 await scenario('Public summary failures never invent zero impact and do not block account use',async()=>{
  const p=await pageFor('no-impact',{impactError:true});assert.equal(await p.locator('[data-global-trees]').first().innerText(),'—');await login(p);await section(p,'myforest');assert.equal(await p.locator('#personalCount').innerText(),'0');await p.context().close();
 });
 await scenario('Legal pages open before login, preserve approved wording and return without leaving the app',async()=>{
  const p=await pageFor('legal-reader');const approved=JSON.parse(fs.readFileSync('tests/approved-legal-text.json','utf8'));
  for(const name of ['privacy-policy','terms-of-service']){
   await p.locator('footer [data-open-legal="'+name+'"]').click();assert(await p.locator('#legal-screen').isVisible());assert.equal(await p.locator('#app-shell').isVisible(),false);
   const text=await p.locator('[data-legal-document="'+name+'"]').evaluate(el=>{const clone=el.cloneNode(true);clone.querySelector('h1').remove();const walker=document.createTreeWalker(clone,NodeFilter.SHOW_TEXT);const chunks=[];while(walker.nextNode())chunks.push(walker.currentNode.textContent);return chunks.join(' ').replace(/\s+/g,' ').trim();});
   assert.equal(text,approved[name]);await p.locator('#closeLegalBtn').click();await p.locator('#screen-login:not(.hidden)').waitFor();
  }
  await p.locator('footer [data-open-legal="terms-of-service"]').click();await p.locator('[data-legal-document="terms-of-service"] [data-open-legal="privacy-policy"]').click();assert(await p.locator('[data-legal-document="privacy-policy"]').isVisible());await p.goBack();await p.locator('#screen-login:not(.hidden)').waitFor();
  assert.equal(new URL(p.url()).origin,'http://127.0.0.1:4173');assert.deepEqual(p.errors,[]);await p.context().close();
 });
 await scenario('Legal return preserves My Forest, selected Support amount and the existing Pi session',async()=>{
  const p=await pageFor('legal-session');await login(p);await pay(p,'0.01');await p.locator('footer [data-open-legal="privacy-policy"]').click();await p.locator('#closeLegalBtn').click();await p.locator('#app-shell:not(.hidden)').waitFor();assert(await p.locator('[data-screen="myforest"].active').isVisible());assert.equal(await p.locator('#personalTotal').innerText(),'0.01');
  await section(p,'support');await p.locator('#customAmount').fill('0.5');await p.locator('footer [data-open-legal="terms-of-service"]').click();await p.locator('.legal-tabs [data-open-legal="transparency"]').click();await p.locator('#closeLegalBtn').click();await p.locator('#app-shell:not(.hidden)').waitFor();assert(await p.locator('[data-screen="support"].active').isVisible());assert.equal(await p.locator('#customAmount').inputValue(),'0.5');assert.equal(await p.evaluate(()=>__paymentCalls),1);
  const links=await p.locator('a[href]').evaluateAll(links=>links.map(a=>a.href));for(const link of links){assert(['fireside.pinet.com','blockexplorer.minepi.com'].includes(new URL(link).hostname));}assert.equal(await p.locator('a[target="_blank"]').count(),0);
  await p.setViewportSize({width:320,height:740});await p.locator('footer [data-open-legal="privacy-policy"]').click();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.context().close();
 });
 await scenario('A direct legal URL works without login and returns to the welcome screen',async()=>{
  const p=await pageFor('direct-legal');await p.goto('http://127.0.0.1:4173/#privacy-policy');await p.locator('#legal-screen:not(.hidden)').waitFor();assert(await p.locator('[data-legal-document="privacy-policy"]').isVisible());await p.locator('#closeLegalBtn').click();await p.locator('#screen-login:not(.hidden)').waitFor();assert.equal(await p.locator('#app-shell').isVisible(),false);await p.context().close();
 });
 await scenario('Legal information remains visible if Pi login completes while it is open',async()=>{
  const p=await pageFor('legal-login-race');await p.route('**/.netlify/functions/my-forest',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});await p.locator('#loginBtn').click();await p.locator('footer [data-open-legal="privacy-policy"]').click();await p.waitForTimeout(800);assert(await p.locator('#legal-screen').isVisible());assert.equal(await p.locator('#app-shell').isVisible(),false);await p.locator('#closeLegalBtn').click();await p.locator('#app-shell:not(.hidden)').waitFor();assert(await p.locator('[data-screen="home"].active').isVisible());await p.context().close();
 });
 const p=await pageFor('preview-review');await p.screenshot({path:'tests/artifacts/welcome-mobile.png',fullPage:true});await login(p);
 for(const name of ['home','support','myforest','about']){await section(p,name);if(name==='myforest')await pay(p,'0.01');await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:'tests/artifacts/'+name+'-mobile.png',fullPage:true});}
 await p.setViewportSize({width:1280,height:1000});await section(p,'home');await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:'tests/artifacts/home-desktop.png',fullPage:true});
 fs.writeFileSync('tests/artifacts/browser-results.json',JSON.stringify({passed:result.length,scenarios:result},null,2));
 await browser.close();await stop();fs.rmSync(temp,{recursive:true,force:true});
})().catch(e=>{console.error(e);server?.kill();process.exit(1);});
