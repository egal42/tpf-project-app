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
    const tx=sdk.TransactionBuilder.fromXDR(new URLSearchParams(options.body).get('tx'),'Pi Testnet');chain={hash:tx.hash().toString('hex'),successful:true};data=chain;if(lost){lost=false;throw Error('Lost response');}
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
 const signed=await f.transport.build(f.payment),tx=f.sdk.TransactionBuilder.fromXDR(signed.xdr,'Pi Testnet');assert.equal(tx.source,f.app.publicKey());assert.equal(tx.operations[0].destination,f.user.publicKey());assert.equal(tx.operations[0].amount,'0.2000000');assert.equal(Buffer.from(tx.memo.value).toString(),'pi-a2u-payment');assert(f.app.verify(tx.hash(),tx.signatures[0].signature));assert.equal(signed.txid,tx.hash().toString('hex'));
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
 await assert.rejects(f.transport.settle({...signed,expiresAt:1},f.payment),/expired/);
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
});

test('Hosted reward handler rejects unauthenticated, unsupported and oversized requests without credentials',async()=>{
 const {default:handler}=await import('../netlify/functions/welcome-reward.mjs');
 assert.equal((await handler(new Request('https://example.test/welcome-reward'),{deploy:{context:'production'}})).status,401);
 assert.equal((await handler(new Request('https://example.test/welcome-reward',{method:'DELETE'}),{deploy:{context:'production'}})).status,405);
 assert.equal((await handler(new Request('https://example.test/welcome-reward',{method:'POST',body:'x'.repeat(5000)}),{deploy:{context:'production'}})).status,413);
});
