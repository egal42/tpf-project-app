'use strict';
const {createHash,randomUUID}=require('node:crypto');
const CAMPAIGN='tpf-welcome-testnet-v1',AMOUNT='0.2',LIMIT=20,ROOT='welcome/campaign-v1';
const hash=s=>createHash('sha256').update(s).digest('hex');
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Netlify-CDN-Cache-Control':'no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff'};
class RewardError extends Error{constructor(status,message){super(message);this.status=status;}}
const pending=cause=>Object.assign(new RewardError(503,'Your reward is pending confirmation. Use Check reward to continue the same claim; no second reward will be created.'),{httpStatus:cause?.httpStatus});
const reply=(statusCode,data)=>({statusCode,headers,body:JSON.stringify(data)});
function createRewardService({fetch:request=global.fetch,getStore,getTransport,enabled=false,allowedContext='production',now=()=>new Date().toISOString()}={}){
 async function authenticate(event){
  const auth=event.headers?.authorization||event.headers?.Authorization;
  if(typeof auth!=='string'||!/^Bearer [^\s]{1,4096}$/.test(auth))throw new RewardError(401,'Pi login is required.');
  let response;try{response=await request('https://api.minepi.com/v2/me',{headers:{Authorization:auth},signal:AbortSignal.timeout(10000)});}catch{throw new RewardError(503,'Pi login verification is unavailable.');}
  if(!response.ok)throw new RewardError(401,'Please log in to Pi again.');
  const user=await response.json();
  if(typeof user.uid!=='string'||!user.uid||user.uid.length>200||typeof user.username!=='string'||!user.username||user.username.length>200)throw new RewardError(401,'Pi did not verify your account.');
  return user;
 }
 async function read(store){
  const entry=await store.getWithMetadata(ROOT,{type:'json',consistency:'strong'});
  if(!entry)return {data:{schema:CAMPAIGN,claims:[],active:null},etag:null};
  const s=entry.data;
  if(!entry.etag||s?.schema!==CAMPAIGN||!Array.isArray(s.claims)||s.claims.length>LIMIT||s.claims.filter(c=>c.phase==='completed').length>LIMIT||s.claims.filter(c=>c.phase!=='completed').length>1||s.claims.some(c=>!c.id||!c.accountId||!c.usernameId||!['reserved','creating','created','building','signed','completed'].includes(c.phase))||(s.active&&!s.claims.some(c=>c.id===s.active&&c.phase!=='completed'))||(!s.active&&s.claims.some(c=>c.phase!=='completed')))throw new RewardError(503,'Reward records require review. Claims are paused.');
  return entry;
 }
 async function save(store,previous,data){
  data.writeId=randomUUID();
  const result=await store.setJSON(ROOT,data,previous.etag?{onlyIfMatch:previous.etag}:{onlyIfNew:true});
  if(!result.modified)return false;
  // Also read back: a failed or ambiguous conditional write must never authorize a payout.
  const confirmed=await read(store);
  return confirmed.data.writeId===data.writeId;
 }
 function own(state,user){return state.claims.find(c=>c.accountId===hash(user.uid)||c.usernameId===hash(user.username.toLowerCase()));}
 function present(state,user,available){
  const claim=own(state,user),completed=state.claims.filter(c=>c.phase==='completed').length;
  const matches=claim?.accountId===hash(user.uid);
  return {schema:'tpf_welcome_reward_v1',network:'Pi Testnet',campaign:CAMPAIGN,amount:AMOUNT,limit:LIMIT,successfulClaims:completed,
   state:claim?(matches?(claim.phase==='completed'?'claimed':'pending'):'identity_review'):completed>=LIMIT?'exhausted':!available?'disabled':state.active?'busy':'eligible',
   progressStage:matches&&claim?claim.phase:null,
   record:matches&&claim?.phase==='completed'?claim.record:null};
 }
 async function change(store,id,guard,mutate){
  for(let n=0;n<6;n++){
   const previous=await read(store),data=structuredClone(previous.data),c=data.claims.find(c=>c.id===id);
   if(!c||!guard(c))return null;
   mutate(c,data);c.updatedAt=now();
   if(await save(store,previous,data))return c;
  }
  throw pending();
 }
 function validate(payment,claim,user,transport){
  if(!payment||payment.identifier!==claim.paymentId||payment.user_uid!==user.uid||payment.network!=='Pi Testnet'||payment.direction!=='app_to_user'||String(payment.amount)!==AMOUNT||payment.metadata?.campaign!==CAMPAIGN||payment.metadata?.claimId!==claim.id||payment.from_address!==transport.publicKey||!transport.validRecipient(payment.to_address))throw new RewardError(503,'Reward payment details do not match this claim. Claims are paused for review.');
  if(payment.status?.cancelled||payment.status?.user_cancelled)throw new RewardError(503,'This reward payment was cancelled. Its claim is retained for review; no replacement payment will be created automatically.');
  return payment;
 }
 async function progress(store,claim,user,transport){
  // 'creating' is written before POST /payments. A timeout can only reconcile, never POST another payment.
  if(claim.phase==='reserved'){
   const advanced=await change(store,claim.id,c=>c.phase==='reserved',c=>{c.phase='creating';});
   if(!advanced)throw pending();claim=advanced;
   let payment;
   try{payment=await transport.create({amount:Number(AMOUNT),memo:'TPF Testnet Welcome Reward',metadata:{campaign:CAMPAIGN,claimId:claim.id},uid:user.uid});}catch(error){throw pending(error);}
   const candidate={...claim,paymentId:payment.identifier};validate(payment,candidate,user,transport);
   await change(store,claim.id,c=>c.phase==='creating'&&!c.paymentId,c=>{c.phase='created';c.paymentId=payment.identifier;});
  }
  claim=own((await read(store)).data,user);
  if(claim.phase==='creating'){
   const incomplete=await transport.incomplete();
   const matches=incomplete.filter(p=>p.metadata?.campaign===CAMPAIGN&&p.metadata?.claimId===claim.id&&p.user_uid===user.uid);
   if(matches.length!==1)throw new RewardError(503,'Pi returned '+matches.length+' matching incomplete payments. This claim is paused for review; no replacement payment will be created.');
   const p=matches[0];validate(p,{...claim,paymentId:p.identifier},user,transport);
   await change(store,claim.id,c=>c.phase==='creating'&&!c.paymentId,c=>{c.phase='created';c.paymentId=p.identifier;});
  }
  claim=own((await read(store)).data,user);
  if(claim.phase==='completed')return;
  let payment=validate(await transport.get(claim.paymentId),claim,user,transport);
  if(claim.phase==='created'||claim.phase==='building'){
   // Fencing token: an interrupted signer may finish later, but cannot overwrite another signer.
   const owner=randomUUID();
   const acquired=await change(store,claim.id,c=>['created','building'].includes(c.phase),c=>{c.phase='building';c.buildOwner=owner;});
   if(!acquired)throw pending();
   const signed=await transport.build(payment);
   if(!signed?.xdr||!signed?.txid)throw pending();
   const persisted=await change(store,claim.id,c=>c.phase==='building'&&c.buildOwner===owner,c=>{c.phase='signed';c.signed=signed;delete c.buildOwner;});
   if(!persisted)throw pending();
  }
  claim=own((await read(store)).data,user);
  if(claim.phase==='completed')return;
  if(claim.phase!=='signed')throw pending();
  // Every retry broadcasts byte-identical signed XDR; it cannot create another blockchain transfer.
  await transport.settle(claim.signed,payment);
  if(!payment.status?.developer_completed){
   try{await transport.complete(claim.paymentId,claim.signed.txid);}catch{
    // Completion may have succeeded even if the HTTP response was lost. Read Pi before retrying.
    payment=validate(await transport.get(claim.paymentId),claim,user,transport);
    if(payment.status?.developer_completed!==true)throw pending();
   }
  }
  payment=validate(await transport.get(claim.paymentId),claim,user,transport);
  if(payment.status?.developer_completed!==true||payment.status?.transaction_verified!==true||payment.transaction?.verified!==true||payment.transaction?.txid!==claim.signed.txid)throw pending();
  await change(store,claim.id,c=>c.phase==='signed',(c,state)=>{
   c.phase='completed';c.record={schema:'tpf_welcome_reward_record_v1',campaign:CAMPAIGN,network:'Pi Testnet',direction:'app_to_user',amount:AMOUNT,paymentId:c.paymentId,txid:c.signed.txid,dateIso:now(),status:'completed'};
   // Keep signed transaction and all claim metadata private for recovery/audit; never return them to clients.
   state.active=null;
  });
 }
 return async event=>{
  let stage='request';
  try{
   if(!['GET','POST'].includes(event.httpMethod))return {...reply(405,{error:'Method not allowed.'}),headers:{...headers,Allow:'GET, POST'}};
   if(event.body&&event.body.length>4096)throw new RewardError(413,'Request too large.');
   stage='login';const user=await authenticate(event);stage='storage';const store=await getStore(event),available=enabled&&event.deployContext===allowedContext;
   let previous=await read(store);
   if(event.httpMethod==='POST'){
    if(!available)throw new RewardError(503,'The Testnet welcome reward is not enabled.');
    if(event.body&&event.body!=='{}')throw new RewardError(400,'The reward amount and recipient are set by the server; no payment fields are accepted.');
    let claim=own(previous.data,user);
    if(claim&&claim.accountId!==hash(user.uid))throw new RewardError(409,'A welcome claim already exists for this Pi username. Account identity needs review.');
    if(claim?.phase==='completed')return reply(200,{...present(previous.data,user,available),readId:event.readId});
    stage='wallet-configuration';const rawTransport=await getTransport();
    // Only fixed operation names and numeric HTTP status are exposed; never raw errors, credentials or API bodies.
    const transport={...rawTransport};
    for(const name of ['create','get','incomplete','build','settle','complete'])transport[name]=async(...args)=>{stage='pi-'+name;return rawTransport[name](...args);}; // Validate Testnet wallet configuration before reserving anything.
    if(!claim){
     if(previous.data.claims.filter(c=>c.phase==='completed').length>=LIMIT)throw new RewardError(409,'All 20 welcome rewards have been claimed.');
     if(previous.data.active)throw new RewardError(409,'Another welcome reward is being confirmed. Please try again later.');
     claim={id:randomUUID(),accountId:hash(user.uid),usernameId:hash(user.username.toLowerCase()),phase:'reserved',createdAt:now(),updatedAt:now()};
     const data=structuredClone(previous.data);data.claims.push(claim);data.active=claim.id;
     if(!await save(store,previous,data))throw new RewardError(409,'Another reward request is being processed. Check your reward before trying again.');
    }
    await progress(store,claim,user,transport);stage='storage';previous=await read(store);
   }
   return reply(200,{...present(previous.data,user,available),readId:event.readId});
  }catch(error){return reply(error instanceof RewardError?error.status:503,{error:(error instanceof RewardError?error.message:'Reward confirmation is temporarily unavailable. Your claim is retained; use Check reward to retry safely.')+' [Step: '+stage+(Number.isInteger(error.httpStatus)?'; HTTP '+error.httpStatus:'')+']',diagnostic:{stage,...(Number.isInteger(error.httpStatus)?{httpStatus:error.httpStatus}:{})}});}
 };
}
module.exports={createRewardService,CAMPAIGN,AMOUNT,LIMIT,ROOT};
