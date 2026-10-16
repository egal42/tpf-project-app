const test=require('node:test');
const assert=require('node:assert/strict');
const {createService,storeName,units,decimal,prefix}=require('../lib/my-forest');
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture() {
 const records=new Map(),payments=new Map(),calls=[];
 const users={alice:{uid:'uid-alice',username:'alice'},bob:{uid:'uid-bob',username:'bob'}};
 const store={
  async setJSON(key,data,{onlyIfNew}={}) {if(onlyIfNew&&records.has(key))return {modified:false};records.set(key,copy(data));return {modified:true};},
  async get(key){return copy(records.get(key)||null);},
  async list({prefix}){return {blobs:[...records.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}
 };
 let failComplete=false;
 async function fetch(url,options) {
  const route=new URL(url).pathname.replace('/v2','');calls.push({route,options});
  let status=200,data;
  if(route==='/me') {data=users[options.headers.Authorization?.replace('Bearer ','')];if(!data){status=401;data={error:'invalid'};}}
  else {
   assert.equal(options.headers.Authorization,'Key secret-test-key');
   const [,id,action]=/^\/payments\/([^/]+)(?:\/(.*))?$/.exec(route)||[];
   data=payments.get(id);
   if(!data){status=404;data={error:'not found'};}
   else if(action==='approve')data.status.developer_approved=true;
   else if(action==='complete'){if(failComplete){status=500;data={error:'transient'};}else data.status.developer_completed=true;}
  }
  return {ok:status===200,status,json:async()=>copy(data)};
 }
 function payment(id,patch={}) {
  const data={identifier:id,user_uid:'uid-alice',network:'Pi Testnet',direction:'user_to_app',amount:0.1,created_at:'2026-10-16T18:00:00.000Z',transaction:{txid:'tx-'+id,verified:true},status:{developer_approved:false,developer_completed:false,transaction_verified:true,cancelled:false,user_cancelled:false},...patch};payments.set(id,data);return data;
 }
 const service=(override={})=>createService({fetch,getStore:async()=>store,apiKey:'secret-test-key',...override});
 const event=(user='alice',body,method=body?'POST':'GET')=>({httpMethod:method,headers:{Authorization:'Bearer '+user},body:body?JSON.stringify(body):undefined});
 const complete=(id,user='alice',extra={})=>service()('complete-payment',event(user,{paymentId:id,txid:'tx-'+id,...extra}));
 const history=(user='alice')=>service()('my-forest',event(user));
 return {records,payments,calls,users,store,service,event,payment,complete,history,failComplete:()=>{failComplete=true;}};
}
const body=r=>JSON.parse(r.body);
test('Authentication required; invalid tokens and wrong methods cannot read/write records',async()=>{
 const f=fixture();assert.equal((await f.service()('my-forest',{httpMethod:'GET',headers:{}})).statusCode,401);assert.equal(f.calls.length,0);
 assert.equal((await f.history('invalid')).statusCode,401);assert.equal((await f.service()('complete-payment',f.event('alice',null,'GET'))).statusCode,405);
 const r=await f.history();assert.equal(r.statusCode,200);assert.deepEqual(body(r).totals,{testPi:'0',payments:0});assert.match(r.headers['Cache-Control'],/no-store/);assert.match(r.headers.Vary,/Authorization/);
});
test('Payment ownership, network and direction are checked before any acknowledgement or write',async()=>{
 for(const patch of [{user_uid:'uid-bob'},{network:'Pi Network'},{direction:'app_to_user'}]){
  const f=fixture();f.payment('wrong',patch);assert.equal((await f.complete('wrong')).statusCode,403);assert.equal(f.records.size,0);assert(!f.calls.some(c=>c.route.endsWith('/complete')));
 }
});
test('Cancelled, unverified or mismatched transactions never enter account totals',async()=>{
 for(const patch of [{status:{cancelled:true}},{status:{developer_completed:true,transaction_verified:false}},{transaction:{txid:'other',verified:true}},{status:{developer_completed:true,transaction_verified:true},transaction:{txid:'tx-bad',verified:false}}]){
  const f=fixture();f.payment('bad',patch);const r=await f.complete('bad');assert.notEqual(r.statusCode,200);assert.equal(body(await f.history()).totals.payments,0);
 }
});
test('Server derives amount, identity, date and network from Pi; spoofed body fields are ignored',async()=>{
 const f=fixture();f.payment('real',{amount:3});const r=await f.complete('real','alice',{username:'bob',amount:100000,uid:'uid-bob',network:'Pi Network'});assert.equal(r.statusCode,200);assert.equal(body(r).accountRecordSaved,true);
 const h=body(await f.history());assert.equal(h.totals.testPi,'3');assert.equal(h.account.uid,'uid-alice');assert.equal(h.items[0].network,'Pi Testnet');assert.equal(body(await f.history('bob')).totals.payments,0);
});
test('Repeated/concurrent completion callbacks count once; each payment has one immutable record',async()=>{
 const f=fixture();f.payment('repeat');const responses=await Promise.all(Array.from({length:15},()=>f.complete('repeat')));assert(responses.every(r=>r.statusCode===200));
 assert.equal(body(await f.history()).totals.payments,1);assert.equal(f.records.size,2);const posts=f.calls.filter(c=>c.route.endsWith('/complete')).length;await f.complete('repeat');assert.equal(f.calls.filter(c=>c.route.endsWith('/complete')).length,posts);
});
test('Concurrent different payments retain every record; totals use exact seven-place arithmetic',async()=>{
 const f=fixture();for(let i=0;i<40;i++)f.payment('p'+i,{amount:i===0?0.0000001:0.1});await Promise.all(Array.from({length:40},(_,i)=>f.complete('p'+i)));
 const h=body(await f.history());assert.equal(h.items.length,40);assert.equal(h.totals.testPi,'3.9000001');assert.equal(decimal(units(0.1)+units(0.2)),'0.3');
});
test('Changing browsers/service processes or Pi display name preserves account records by UID',async()=>{
 const f=fixture();f.payment('persist');await f.complete('persist');f.users.alice.username='renamed';const h=body(await f.service()('my-forest',f.event('alice')));assert.equal(h.account.username,'renamed');assert.equal(h.totals.payments,1);assert.equal(h.items[0].usernameAtPayment,'alice');
});
test('Recovery receipt is durable before Pi completion; failure prevents acknowledgement',async()=>{
 const f=fixture();f.payment('receipt');f.store.setJSON=async()=>{throw Error('offline');};const r=await f.complete('receipt');assert.equal(r.statusCode,503);assert(!f.calls.some(c=>c.route.endsWith('/complete')));assert.equal(f.payments.get('receipt').status.developer_completed,false);
});
test('Crash/storage failure after Pi completion recovers on the next login without another payment',async()=>{
 const f=fixture();f.payment('recover');const original=f.store.setJSON;f.store.setJSON=async(key,...args)=>{if(key.includes('/payments/'))throw Error('write unavailable');return original(key,...args);};
 const r=await f.complete('recover');assert.equal(r.statusCode,503);assert.equal(f.payments.get('recover').status.developer_completed,true);assert.match(body(r).error,/do not send another/);
 f.store.setJSON=original;const h=body(await f.history());assert.equal(h.totals.payments,1);assert.equal(h.items[0].paymentId,'recover');assert.equal(f.calls.filter(c=>c.route.endsWith('/complete')).length,1);
});
test('Pi completion failure returns recoverable pending receipt and never a false success',async()=>{
 const f=fixture();f.payment('pending');f.failComplete();assert.equal((await f.complete('pending')).statusCode,502);const h=body(await f.history());assert.equal(h.totals.payments,0);assert.equal(h.pending.length,1);assert.equal(h.pending[0].txid,'tx-pending');
});
test('Storage read failure is an error, not an empty zero-balance history',async()=>{
 const f=fixture();f.store.list=async()=>{throw Error('offline');};const r=await f.history();assert.equal(r.statusCode,503);assert.equal(body(r).totals,undefined);
});
test('Conditional write must be visible and match; existing payment records are never overwritten',async()=>{
 const f=fixture();f.payment('conflict');await f.complete('conflict');const key=[...f.records.keys()].find(k=>k.includes('/payments/'));const original=copy(f.records.get(key));f.payments.get('conflict').amount=9;assert.equal((await f.complete('conflict')).statusCode,503);assert.deepEqual(f.records.get(key),original);
});
test('Legacy payment can be imported only by its real owner with matching verified Pi transaction',async()=>{
 const f=fixture();f.payment('legacy',{status:{developer_completed:true,transaction_verified:true}});assert.equal((await f.complete('legacy','bob')).statusCode,403);assert.equal((await f.complete('legacy')).statusCode,200);assert.equal(body(await f.history()).totals.payments,1);assert(!f.calls.some(c=>c.route.endsWith('/complete')));
});
test('Production and preview namespaces are distinct and stable between deploys',()=>{
 assert.notEqual(storeName('production'),storeName('deploy-preview'));assert.equal(storeName('production'),'tpf-project-app-testnet-v1');assert.equal(storeName('branch-deploy'),storeName('deploy-preview'));assert(!prefix('uid-alice').includes('uid-alice'));
});
test('Input paths and oversized bodies are rejected without payment calls',async()=>{
 const f=fixture();const r=await f.service()('complete-payment',f.event('alice',{paymentId:'../../secret',txid:'tx'}));assert.equal(r.statusCode,400);const large=await f.service()('complete-payment',{httpMethod:'POST',headers:{},body:'x'.repeat(5000)});assert.equal(large.statusCode,413);assert(!f.calls.some(c=>c.route.startsWith('/payments/')));
});
test('Missing automatic Netlify storage context fails safely outside hosted functions',async()=>{
 const {getAccountStore}=require('../lib/netlify-store');await assert.rejects(()=>getAccountStore({}),/context/);
});

test('Modern function adapters retain endpoint behavior and reject oversize requests without API calls',async()=>{
 const {default:approve}=await import('../netlify/functions/approve-payment.mjs');
 const {default:history}=await import('../netlify/functions/my-forest.mjs');
 const wrong=await approve(new Request('https://example.test/.netlify/functions/approve-payment'),{deploy:{context:'production'}});assert.equal(wrong.status,405);assert.match(wrong.headers.get('Cache-Control'),/no-store/);
 const large=await history(new Request('https://example.test/.netlify/functions/my-forest',{method:'POST',body:'a'.repeat(5000)}),{deploy:{context:'production'}});assert.equal(large.status,413);
 const unauth=await history(new Request('https://example.test/.netlify/functions/my-forest'),{deploy:{context:'production'}});assert.equal(unauth.status,401);
});
test('A cancelled recovery receipt does not prevent reading the rest of the account',async()=>{
 const f=fixture();f.payment('cancel-later');f.failComplete();await f.complete('cancel-later');f.payments.get('cancel-later').status.cancelled=true;
 const r=await f.history();assert.equal(r.statusCode,200);assert.equal(body(r).totals.payments,0);assert.equal(body(r).pending.length,0);
});

test('Account comparison reference is stable by verified UID, differs by account and excludes raw UID/token',async()=>{
 const f=fixture();const a=body(await f.history());const b=body(await f.history('bob'));assert.match(a.connection.accountReference,/^[a-f0-9]{12}$/);assert.notEqual(a.connection.accountReference,b.connection.accountReference);
 f.users.alice.username='renamed';assert.equal(body(await f.history()).connection.accountReference,a.connection.accountReference);assert(!JSON.stringify(a.connection).includes('uid-alice'));assert(!JSON.stringify(a.connection).includes('secret-test-key'));
 const event={...f.event('alice'),deployContext:'production'};assert.equal(body(await f.service()('my-forest',event)).connection.recordEnvironment,'production');
});
