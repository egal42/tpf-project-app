const test=require('node:test'),assert=require('node:assert/strict');
const {createPiA2U}=require('../lib/pi-a2u');
async function setup(){
 const sdk=await import('@stellar/stellar-sdk'),app=sdk.Keypair.random(),user=sdk.Keypair.random();
 let chain=null,lost=false,wrongNetwork=false;const calls=[];
 const payment={identifier:'pi-a2u-payment',amount:0.2,user_uid:'pioneer',direction:'app_to_user',network:'Pi Testnet',from_address:app.publicKey(),to_address:user.publicKey(),metadata:{campaign:'test'},transaction:null};
 const fetch=async(url,options={})=>{
  calls.push({url,options});const p=new URL(url).pathname;
  let status=200,data={};
  if(url.startsWith('https://api.minepi.com/v2')){
   assert.equal(options.headers.Authorization,'Key fake-key');
   if(p==='/v2/payments'&&options.method==='POST'){assert.deepEqual(JSON.parse(options.body),{payment:{amount:0.2,uid:'pioneer',memo:'Reward',metadata:{}}});data=payment;}
   else if(p.endsWith('/incomplete_server_payments'))data={incomplete_server_payments:[payment]};else data=payment;
  }else{
   assert(url.startsWith('https://api.testnet.minepi.com'));
   if(p.startsWith('/accounts/'))data={account_id:p.split('/').pop(),sequence:'12'};
   else if(p==='/fee_stats')data={last_ledger_base_fee:'100'};
   else if(p==='/')data={network_passphrase:wrongNetwork?'Pi Network':'Pi Testnet'};
   else if(p==='/transactions'&&options.method==='POST'){
    const tx=sdk.TransactionBuilder.fromXDR(new URLSearchParams(options.body).get('tx'),'Pi Testnet');chain={hash:Buffer.from(tx.hash()).toString('hex'),successful:true};data=chain;if(lost){lost=false;throw Error('Lost response');}
   }else if(p.startsWith('/transactions/')){if(chain)data=chain;else status=404;}
   else throw Error('Unexpected URL '+url);
  }
  return {ok:status===200,status,json:async()=>data};
 };
 const config={apiKey:'fake-key',seed:app.secret(),publicKey:app.publicKey(),network:'Pi Testnet',fetch};
 const transport=await createPiA2U(config);
 return {sdk,app,user,payment,transport,calls,config,loseSubmit:()=>lost=true,wrongNetwork:()=>wrongNetwork=true};
}
test('Official A2U API envelope, Testnet signing, native amount and payment-ID memo',async()=>{
 const f=await setup();await f.transport.create({amount:0.2,uid:'pioneer',memo:'Reward',metadata:{}});assert.equal((await f.transport.incomplete()).length,1);
 const signed=await f.transport.build(f.payment),tx=f.sdk.TransactionBuilder.fromXDR(signed.xdr,'Pi Testnet');assert.equal(tx.source,f.app.publicKey());assert.equal(tx.operations[0].destination,f.user.publicKey());assert.equal(tx.operations[0].amount,'0.2000000');assert.equal(Buffer.from(tx.memo.value).toString(),'pi-a2u-payment');assert(f.app.verify(tx.hash(),tx.signatures[0].signature));assert.equal(signed.txid,Buffer.from(tx.hash()).toString('hex'));assert.match(signed.txid,/^[a-f0-9]{64}$/);
 await f.transport.settle(signed,f.payment);await f.transport.complete(f.payment.identifier,signed.txid);assert(!f.calls.some(c=>c.url.includes('mainnet')));
});
test('A2U adapter rejects missing/mismatched Testnet wallet and Mainnet configuration',async()=>{
 const f=await setup();for(const patch of [{network:'Pi Network'},{seed:''},{publicKey:f.user.publicKey()}])await assert.rejects(createPiA2U({...f.config,...patch}));
 f.wrongNetwork();await assert.rejects(f.transport.build(f.payment));
});
test('Transaction timeout uses chain hash to recover; repeat settle never builds or pays a second transaction',async()=>{
 const f=await setup(),signed=await f.transport.build(f.payment);f.loseSubmit();assert.equal(await f.transport.settle(signed,f.payment),signed.txid);await f.transport.settle(signed,f.payment);
 assert.equal(f.calls.filter(c=>new URL(c.url).pathname==='/transactions'&&c.options.method==='POST').length,1);
});
test('Already-linked or tampered transaction cannot be signed/submitted',async()=>{
 const f=await setup();await assert.rejects(f.transport.build({...f.payment,transaction:{txid:'already'}}));const signed=await f.transport.build(f.payment);
 await assert.rejects(f.transport.settle({...signed,txid:'wrong'},f.payment));await assert.rejects(f.transport.settle(signed,{...f.payment,to_address:f.app.publicKey()}));await assert.rejects(f.transport.settle(signed,{...f.payment,identifier:'other-memo'}));
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
});

test('An expired unconfirmed transaction is held for review without a replacement or broadcast',async()=>{
 const f=await setup(),signed=await f.transport.build(f.payment);
 await assert.rejects(f.transport.settle({...signed,expiresAt:1},f.payment),/validation failed|expired/);
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
});

test('Hosted reward handler rejects unauthenticated, unsupported and oversized requests without credentials',async()=>{
 const {default:handler}=await import('../netlify/functions/welcome-reward.mjs');
 assert.equal((await handler(new Request('https://example.test/welcome-reward'),{deploy:{context:'production'}})).status,401);
 assert.equal((await handler(new Request('https://example.test/welcome-reward',{method:'DELETE'}),{deploy:{context:'production'}})).status,405);
 assert.equal((await handler(new Request('https://example.test/welcome-reward',{method:'POST',body:'x'.repeat(5000)}),{deploy:{context:'production'}})).status,413);
});
test('Only recognized Pi rejection codes survive transport errors, never private response details',async()=>{
 const f=await setup();
 for(const code of ['missing_scope','SECRET-SEED']){
  const transport=await createPiA2U({...f.config,fetch:async()=>({ok:false,status:401,json:async()=>({error:code,error_message:'SECRET-SEED'})})});
  await assert.rejects(()=>transport.create({}),e=>e.httpStatus===401&&e.piCode===(code==='missing_scope'?code:undefined)&&!e.message.includes('SECRET'));
 }
});
function expiredLegacy(f){
 const tx=new f.sdk.TransactionBuilder(new f.sdk.Account(f.app.publicKey(),'12'),{fee:'100',networkPassphrase:'Pi Testnet',timebounds:{minTime:'0',maxTime:'10'}}).addOperation(f.sdk.Operation.payment({destination:f.user.publicKey(),asset:f.sdk.Asset.native(),amount:'0.2'})).addMemo(f.sdk.Memo.text(f.payment.identifier)).build();tx.sign(f.app);
 return {xdr:tx.toXDR(),txid:Array.from(tx.hash()).join(','),expiresAt:10};
}
async function repairFixture(options={}){
 const f=await setup(),old=expiredLegacy(f);let submits=0;
 const transport=await createPiA2U({...f.config,fetch:async(url,opts={})=>{
  if(url.endsWith('/transactions')&&opts.method==='POST')submits++;
  if(url.replace(/\/$/,'')==='https://api.testnet.minepi.com')return {ok:true,json:async()=>({network_passphrase:'Pi Testnet',history_latest_ledger:7,core_latest_ledger:options.lag?8:7})};
  if(url.includes('/ledgers?'))return {ok:true,json:async()=>({_embedded:{records:[{sequence:7,closed_at:new Date(options.early?5000:20000).toISOString()}]}})};
  if(url.includes('/transactions/')&&options.lookupError)return {ok:false,status:503,json:async()=>({})};
  if(url.includes('/transactions/')&&options.confirmed)return {ok:true,json:async()=>({hash:Buffer.from(f.sdk.TransactionBuilder.fromXDR(old.xdr,'Pi Testnet').hash()).toString('hex'),successful:true})};
  return f.config.fetch(url,opts);
 }});
 return {...f,transport,old,get submits(){return submits;}};
}
test('Legacy byte-array hash repairs to exactly 64 hex characters without changing signed bytes',async()=>{
 const f=await setup(),signed=await f.transport.build(f.payment),tx=f.sdk.TransactionBuilder.fromXDR(signed.xdr,'Pi Testnet');
 const legacy={...signed,txid:Array.from(tx.hash()).join(',')};assert(legacy.txid.includes(','));
 const fixed=await f.transport.repair(legacy,f.payment);assert.equal(fixed.xdr,legacy.xdr);assert.match(fixed.txid,/^[0-9a-f]{64}$/);assert.equal(fixed.txid,signed.txid);
 await f.transport.settle(fixed,f.payment);assert(f.calls.filter(c=>c.url.includes('/transactions/')).every(c=>/\/transactions\/[0-9a-f]{64}$/.test(c.url)));
});
test('Expired legacy envelope renews once only after complete ledger indexing past expiry and hash absence; repair itself never submits',async()=>{
 const f=await repairFixture();const fixed=await f.transport.repair(f.old,f.payment);assert.notEqual(fixed.xdr,f.old.xdr);assert.match(fixed.txid,/^[0-9a-f]{64}$/);assert.equal(fixed.renewals,1);assert.equal(f.submits,0);
 const oldCanonical={...f.old,txid:Buffer.from(f.sdk.TransactionBuilder.fromXDR(f.old.xdr,'Pi Testnet').hash()).toString('hex'),legacyHashRepair:true,renewals:1};
 assert.equal((await f.transport.repair(oldCanonical,f.payment)).xdr,oldCanonical.xdr);
});
test('Renewal fails closed for ledger lag, before expiry, lookup errors, linked payment or tampered envelope',async()=>{
 for(const options of [{lag:true},{early:true},{lookupError:true}]){const f=await repairFixture(options);await assert.rejects(f.transport.repair(f.old,f.payment));assert.equal(f.submits,0);assert(!f.calls.some(c=>new URL(c.url).pathname.startsWith('/accounts/')));}
 const f=await repairFixture();await assert.rejects(f.transport.repair(f.old,{...f.payment,transaction:{txid:'linked'}}));await assert.rejects(f.transport.repair({...f.old,txid:'wrong'},f.payment));assert.equal(f.submits,0);
});
test('Confirmed original legacy transaction is reconciled without renewing or submitting',async()=>{
 const f=await repairFixture({confirmed:true});const fixed=await f.transport.repair(f.old,f.payment);assert.equal(fixed.xdr,f.old.xdr);assert.match(fixed.txid,/^[0-9a-f]{64}$/);assert.equal(fixed.renewals,undefined);assert.equal(await f.transport.settle(fixed,f.payment),fixed.txid);assert.equal(f.submits,0);
});
test('Blockchain rejection reports only whitelisted transaction result codes',async()=>{
 const f=await setup(),signed=await f.transport.build(f.payment);
 const transport=await createPiA2U({...f.config,fetch:async(url,opts)=>url.includes('/transactions/')?{ok:false,status:404,json:async()=>({})}:{ok:false,status:400,json:async()=>({extras:{result_codes:{transaction:'tx_failed',operations:['op_underfunded','SECRET']},envelope_xdr:'SECRET'},detail:'SECRET'})}});
 await assert.rejects(transport.settle(signed,f.payment),e=>e.chainCode==='tx_failed/op_underfunded'&&!e.message.includes('SECRET'));
});
