const test=require('node:test'),assert=require('node:assert/strict');
const {createRewardService,ROOT,CAMPAIGN}=require('../lib/welcome-reward');
const clone=x=>structuredClone(x),body=r=>JSON.parse(r.body);
function fixture(){
 let data=null,version=0,failPhase=null,silentPhase=null,createLost=false,submitLost=false,completeLost=false,buildWait=null;
 const payments=new Map(),calls={create:0,build:0,broadcast:0,complete:0},chain=new Set(),users=new Map();
 const store={async getWithMetadata(){return data?{data:clone(data),etag:String(version)}:null;},async setJSON(key,value,options){assert.equal(key,ROOT);if(options.onlyIfNew&&data||options.onlyIfMatch&&options.onlyIfMatch!==String(version))return {modified:false};if(value.claims.some(c=>c.phase===failPhase))throw Error('Store unavailable');if(value.claims.some(c=>c.phase===silentPhase))return {modified:true};data=clone(value);version++;return {modified:true};}};
 const transport={publicKey:'app-wallet',validRecipient:a=>a==='user-wallet',
  async create(p){calls.create++;const payment={identifier:'a2u-'+calls.create,user_uid:p.uid,amount:p.amount,metadata:p.metadata,network:'Pi Testnet',direction:'app_to_user',from_address:'app-wallet',to_address:'user-wallet',status:{developer_completed:false,transaction_verified:false,cancelled:false,user_cancelled:false},transaction:null};payments.set(payment.identifier,payment);if(createLost){createLost=false;throw Error('Lost create response');}return clone(payment);},
  async get(id){return clone(payments.get(id));},async incomplete(){return [...payments.values()].filter(p=>!p.status.developer_completed).map(clone);},
  async build(p){calls.build++;if(buildWait)await buildWait;return {xdr:'signed-'+p.identifier+'-'+calls.build,txid:'tx-'+p.identifier+'-'+calls.build,expiresAt:9999999999};},
  async settle(signed,p){if(!chain.has(signed.txid)){chain.add(signed.txid);calls.broadcast++;}const payment=payments.get(p.identifier);payment.transaction={txid:signed.txid,verified:true};payment.status.transaction_verified=true;if(submitLost){submitLost=false;throw Error('Lost submit response');}},
  async complete(id,txid){calls.complete++;const p=payments.get(id);assert.equal(p.transaction.txid,txid);p.status.developer_completed=true;if(completeLost){completeLost=false;throw Error('Lost complete response');}return clone(p);}
 };
 const request=async(url,options)=>{const name=options.headers.Authorization?.replace('Bearer ','');const user=users.get(name)||{uid:'uid-'+name,username:name,credentials:{scopes:['username','payments','wallet_address']}};return {ok:!!name&&name!=='invalid',json:async()=>user};};
 const service=options=>createRewardService({fetch:request,getStore:async()=>store,getTransport:async()=>transport,enabled:true,allowedContext:'production',...options});
 const event=(name='alice',method='POST',extra={})=>({httpMethod:method,headers:{Authorization:'Bearer '+name},body:method==='POST'?'{}':'',deployContext:'production',readId:'test-read',...extra});
 const run=(name,method,extra)=>service()(event(name,method,extra));
 return {store,transport,payments,calls,users,service,event,run,get data(){return clone(data);},fail:p=>{failPhase=p;},silent:p=>{silentPhase=p;},lostCreate:()=>{createLost=true;},lostSubmit:()=>{submitLost=true;},lostComplete:()=>{completeLost=true;},waitBuild:p=>{buildWait=p;}};
}
test('Reward requires verified Pi login; methods and client-selected payment fields are rejected',async()=>{
 const f=fixture();assert.equal((await f.run('invalid')).statusCode,401);assert.equal((await f.run('alice','DELETE')).statusCode,405);
 for(const bodyText of ['{"amount":9}','{"uid":"other"}','{"wallet":"GATTACK"}'])assert.equal((await f.run('alice','POST',{body:bodyText})).statusCode,400);
 assert.equal(f.calls.create,0);assert.equal(f.data,null);
});
test('Status is read-only, private, fresh-marked and claimable only when enabled in production',async()=>{
 const f=fixture();const status=await f.run('alice','GET');assert.equal(body(status).state,'eligible');assert.equal(body(status).readId,'test-read');assert.equal(f.data,null);assert.match(status.headers['Cache-Control'],/no-store/);
 const disabled=f.service({enabled:false});assert.equal(body(await disabled(f.event('alice','GET'))).state,'disabled');assert.equal((await disabled(f.event())).statusCode,503);
 assert.equal((await f.run('alice','POST',{deployContext:'deploy-preview'})).statusCode,503);assert.equal(f.calls.create,0);
});
test('Reward is exactly 0.2, completed only after Pi verification, and repeated claims never pay twice',async()=>{
 const f=fixture();const r=await f.run();assert.equal(r.statusCode,200);assert.equal(body(r).state,'claimed');assert.equal(body(r).record.amount,'0.2');assert.equal(body(r).successfulClaims,1);
 await f.run();await f.run('alice','GET');assert.equal(f.calls.create,1);assert.equal(f.calls.broadcast,1);assert(!r.body.includes('signed-'));assert(!r.body.includes('usernameId'));assert(!r.body.includes('accountId'));
});
test('Pi UID blocks renamed accounts and verified username blocks permission-revocation UID resets',async()=>{
 const f=fixture();await f.run();f.users.set('renamed',{uid:'uid-alice',username:'newname'});assert.equal(body(await f.run('renamed')).state,'claimed');
 f.users.set('reset',{uid:'replacement-uid',username:'alice'});assert.equal((await f.run('reset')).statusCode,409);assert.equal(body(await f.run('reset','GET')).record,null);assert.equal(f.calls.broadcast,1);
});
test('Cross-instance concurrent claims serialize the app wallet and cannot duplicate one Pioneer',async()=>{
 const f=fixture();await Promise.all(Array.from({length:15},()=>f.run()));const eventual=await f.run();assert.equal(body(eventual).state,'claimed');assert.equal(f.calls.create,1);assert.equal(f.calls.broadcast,1);
});
test('Initial cap is 20 successful rewards across users and survives service reconstruction',async()=>{
 const f=fixture();for(let n=0;n<20;n++){const r=await f.run('pioneer'+n);assert.equal(r.statusCode,200);assert.equal(body(r).successfulClaims,n+1);}
 const r=await f.run('pioneer21');assert.equal(r.statusCode,409);assert.equal(f.calls.broadcast,20);assert.equal(f.calls.create,20);assert.equal(body(await f.run('alice','GET')).state,'exhausted');assert.equal(body(await f.run('pioneer0')).state,'claimed');
});
test('Concurrent users at the final slot cannot exceed the campaign cap',async()=>{
 const f=fixture();for(let i=0;i<19;i++)await f.run('old'+i);
 await Promise.all(Array.from({length:12},(_,i)=>f.run('new'+i)));
 // A surviving pending claim may need one reconciliation request, but never a new payment.
 if(f.data.active){const c=f.data.claims.find(c=>c.id===f.data.active);for(let i=0;i<12;i++){const r=await f.run('new'+i);if(body(r).state==='claimed')break;}}
 assert.equal(f.data.claims.filter(c=>c.phase==='completed').length,20);assert.equal(f.calls.broadcast,20);
});
test('Failed or silently lost reservation writes cannot authorize a create or broadcast',async()=>{
 for(const kind of ['fail','silent']){const f=fixture();f[kind]('reserved');assert.notEqual((await f.run()).statusCode,200);assert.equal(f.calls.create,0);assert.equal(f.calls.broadcast,0);}
});
test('Create timeout reconciles the same official A2U payment through metadata, never creates another',async()=>{
 const f=fixture();f.lostCreate();assert.equal((await f.run()).statusCode,503);assert.equal(body(await f.run('alice','GET')).successfulClaims,0);assert.equal(body(await f.run('bob','GET')).state,'busy');assert.equal((await f.run('bob')).statusCode,409);
 assert.equal(body(await f.run()).state,'claimed');assert.equal(f.calls.create,1);assert.equal(f.calls.broadcast,1);
});
test('Unknown create outcome without recoverable payment remains pending instead of risking another payout',async()=>{
 const f=fixture();f.transport.create=async()=>{f.calls.create++;throw Error('Connection failed');};await f.run();await f.run();assert.equal(f.calls.create,1);assert.equal(f.calls.broadcast,0);assert.equal(body(await f.run('alice','GET')).state,'pending');
});
test('Signing journal failure prevents broadcast and a later retry can safely sign before first submission',async()=>{
 const f=fixture();f.fail('signed');assert.equal((await f.run()).statusCode,503);assert.equal(f.calls.broadcast,0);f.fail(null);assert.equal(body(await f.run()).state,'claimed');assert.equal(f.calls.create,1);assert.equal(f.calls.broadcast,1);
});
test('Lost broadcast and completion responses recover only the persisted transaction',async()=>{
 for(const loss of ['lostSubmit','lostComplete']){const f=fixture();f[loss]();const first=await f.run();assert.equal(first.statusCode,loss==='lostComplete'?200:503);const saved=f.data.claims[0].signed;assert.equal(body(await f.run()).state,'claimed');assert.equal(f.calls.broadcast,1);assert.equal(f.calls.create,1);assert.equal(f.calls.build,1);assert.deepEqual(f.data.claims[0].signed,saved);}
});
test('Final ledger failure preserves the transaction and retries without paying again',async()=>{
 const f=fixture();f.fail('completed');assert.equal((await f.run()).statusCode,503);assert.equal(f.calls.broadcast,1);f.fail(null);assert.equal(body(await f.run()).state,'claimed');assert.equal(f.calls.broadcast,1);assert.equal(f.calls.create,1);
});
test('Wrong owner, amount, direction, network, wallet or reward metadata cannot be signed',async()=>{
 for(const patch of [{user_uid:'other'},{amount:2},{direction:'user_to_app'},{network:'Pi Network'},{from_address:'another-app'},{to_address:'attacker'},{metadata:{campaign:'other'}}]){
  const f=fixture(),create=f.transport.create.bind(f.transport);f.transport.create=async p=>({...await create(p),...patch});assert.equal((await f.run()).statusCode,503);assert.equal(f.calls.build,0);assert.equal(f.calls.broadcast,0);
 }
});
test('A missing/incorrect final Pi confirmation never counts a successful claim',async()=>{
 const f=fixture();f.transport.complete=async()=>{};assert.equal((await f.run()).statusCode,503);assert.equal(body(await f.run('alice','GET')).successfulClaims,0);assert.equal(f.data.active,f.data.claims[0].id);
});
test('A stale signer is fenced before submission after another instance takes over building',async()=>{
 const f=fixture();let release;f.waitBuild(new Promise(r=>release=r));const first=f.run();
 while(f.calls.build<1)await new Promise(r=>setTimeout(r,1));f.waitBuild(null);const second=await f.run();release();await first;
 assert.equal(body(second).state,'claimed');assert.equal(f.calls.broadcast,1);assert.equal(f.calls.create,1);
});
test('Corrupt campaign data and unavailable storage fail closed without payment calls',async()=>{
 const f=fixture();await f.store.setJSON(ROOT,{schema:'wrong',claims:[],active:null},{onlyIfNew:true});assert.equal((await f.run()).statusCode,503);assert.equal(f.calls.create,0);
 const service=f.service({getStore:async()=>{throw Error('unavailable')}});assert.equal((await service(f.event())).statusCode,503);
});
test('Diagnostics expose only fixed stages and HTTP status, never transport secrets or bodies',async()=>{
 const f=fixture();f.transport.create=async()=>{throw Object.assign(Error('SECRET-SEED response body'),{httpStatus:403});};
 const result=await f.run();assert.deepEqual(body(result).diagnostic,{stage:'pi-create',httpStatus:403});assert(!result.body.includes('SECRET'));assert.equal(body(await f.run('alice','GET')).progressStage,'creating');
 const retry=await f.run();assert.match(body(retry).error,/0 matching incomplete payments/);assert.equal(body(retry).diagnostic.stage,'pi-incomplete');assert.equal(f.calls.broadcast,0);
});
test('Configuration diagnostics do not expose invalid seed values',async()=>{
 const f=fixture(),service=f.service({getTransport:async()=>{throw Error('invalid SECRET-SEED');}});
 const r=await service(f.event());assert.equal(body(r).diagnostic.stage,'wallet-configuration');assert(!r.body.includes('SECRET'));assert.equal(f.data,null);
});
test('Status diagnoses stuck creation against Pi without creating, signing, broadcasting or changing records',async()=>{
 const f=fixture();f.lostCreate();await f.run();const before=f.data,calls=clone(f.calls);
 const found=body(await f.run('alice','GET'));assert.match(found.statusDetail,/Pi payment found/);assert.deepEqual(f.calls,calls);assert.deepEqual(f.data,before);
 f.payments.clear();assert.match(body(await f.run('alice','GET')).statusDetail,/no matching incomplete payment/);assert.deepEqual(f.data,before);
 f.transport.incomplete=async()=>{throw Object.assign(Error('private error body'),{httpStatus:403});};
 const failed=await f.run('alice','GET');assert.deepEqual(body(failed).diagnostic,{stage:'pi-incomplete',httpStatus:403});assert(!failed.body.includes('private error body'));assert.deepEqual(f.data,before);assert.deepEqual(f.calls,calls);
});
test('Wallet consent is verified on the server before reserving or creating a reward',async()=>{
 const f=fixture();f.users.set('no-consent',{uid:'uid-noconsent',username:'no-consent',credentials:{scopes:['username','payments']}});
 const denied=await f.run('no-consent');assert.equal(denied.statusCode,403);assert.match(body(denied).error,/wallet-address permission/);assert.equal(f.data,null);assert.equal(f.calls.create,0);
 assert.match(body(await f.run('no-consent','GET')).statusDetail,/wallet-address permission/);
});
test('Definitive missing-scope rejection remains retryable and never becomes an unknown pending creation',async()=>{
 const f=fixture(),create=f.transport.create;
 f.transport.create=async()=>{throw Object.assign(Error('secret response'),{piCode:'missing_scope',httpStatus:401});};
 const r=await f.run();assert.match(body(r).error,/wallet-address permission/);assert.equal(f.data.claims[0].phase,'reserved');assert.equal(f.data.claims[0].lastRejection,'missing_scope');assert.equal(f.calls.broadcast,0);
 f.transport.create=create;assert.equal(body(await f.run()).state,'claimed');assert.equal(f.calls.broadcast,1);
});
test('Old unsigned creation with no Pi payment recovers the same claim once; concurrent retries cannot double-pay',async()=>{
 const f=fixture(),create=f.transport.create;f.transport.create=async()=>{f.calls.create++;throw Error('unknown outcome');};await f.run();const id=f.data.claims[0].id;
 f.transport.create=create;const future=new Date(Date.now()+180000).toISOString(),service=f.service({now:()=>future});
 await Promise.all(Array.from({length:10},()=>service(f.event())));
 const r=await service(f.event());assert.equal(body(r).state,'claimed');assert.equal(f.data.claims[0].id,id);assert.equal(f.data.claims[0].recoveryAttempts,1);assert.equal(f.calls.broadcast,1);assert.equal(f.calls.create,2);
});
test('Unknown creation recovery is bounded and cannot proceed if another Pi payment exists',async()=>{
 const f=fixture();f.transport.create=async()=>{f.calls.create++;throw Error('unknown');};await f.run();const future=new Date(Date.now()+180000).toISOString(),service=f.service({now:()=>future});
 f.payments.set('unrelated',{metadata:{},user_uid:'someone',status:{developer_completed:false}});await service(f.event());assert.equal(f.calls.create,1);
 f.payments.clear();await service(f.event());assert.equal(f.calls.create,2);
 const later=f.service({now:()=>new Date(Date.now()+360000).toISOString()});await later(f.event());assert.equal(f.calls.create,2);assert.equal(f.calls.broadcast,0);
});
test('A late old create response cannot replace the selected recovered payment or authorize a second transfer',async()=>{
 const f=fixture(),create=f.transport.create;let release,entered;const ready=new Promise(r=>entered=r);
 f.transport.create=async p=>{entered();await new Promise(r=>release=r);return create(p);};
 const first=f.run();await ready;f.transport.create=create;
 const service=f.service({now:()=>new Date(Date.now()+180000).toISOString()});assert.equal(body(await service(f.event())).state,'claimed');const selected=f.data.claims[0].paymentId;
 release();await first;assert.equal(f.data.claims[0].paymentId,selected);assert.equal(f.calls.broadcast,1);assert.equal(f.calls.build,1);
});
test('Signed repair is persisted with its original envelope before submission; failed repair writes prevent payout',async()=>{
 const f=fixture(),settle=f.transport.settle;f.transport.settle=async()=>{throw Error('submission blocked');};await f.run();assert.equal(f.data.claims[0].phase,'signed');const old=f.data.claims[0].signed;
 f.transport.repair=async s=>({...s,xdr:'repaired-'+s.xdr,txid:'repaired-'+s.txid});f.transport.settle=settle;f.fail('signed');await f.run();assert.equal(f.calls.broadcast,0);assert.deepEqual(f.data.claims[0].signed,old);
 f.fail(null);assert.equal(body(await f.run()).state,'claimed');assert.deepEqual(f.data.claims[0].signedHistory,[old]);assert.equal(f.calls.broadcast,1);assert.equal(f.calls.create,1);
});
