'use strict';
const {createHash} = require('node:crypto');
const NETWORK = 'Pi Testnet';
const SCHEMA = 'tpf_testnet_payment_v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const prefix = uid => 'accounts/'+hash(uid)+'/payments/';
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Netlify-CDN-Cache-Control':'no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'};
class Problem extends Error { constructor(status,message) {super(message);this.status=status;} }
const result = (statusCode,data) => ({statusCode,headers,body:JSON.stringify(data)});
function identifier(value,label='payment ID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new Problem(400,'Invalid '+label+'.');
  return value;
}
// Decimal integer arithmetic: seven decimal places, no floating-point accumulation.
function units(value) {
  const text=typeof value==='number' && Number.isFinite(value) && value>=1e-7 && value<=Number.MAX_SAFE_INTEGER/1e7 && Number(value.toFixed(7))===value ? value.toFixed(7) : String(value);
  if (!/^\d+(\.\d{1,7})?$/.test(text)) throw new Problem(502,'Pi returned an invalid amount.');
  const [whole,fraction='']=text.split('.');
  const n=BigInt(whole)*10000000n+BigInt(fraction.padEnd(7,'0'));
  if (n<=0n) throw new Problem(502,'Pi returned an invalid amount.');
  return n;
}
function decimal(value) {return (value/10000000n).toString()+((value%10000000n)?'.'+(value%10000000n).toString().padStart(7,'0').replace(/0+$/,''):'');}
function storeName(context) {
  // Production Testnet records survive redeploys. All preview contexts use another namespace.
  return context === 'production' ? 'tpf-project-app-testnet-v1' : 'tpf-project-app-testnet-preview-v1';
}
function createService({fetch:request=global.fetch,getStore,apiKey=process.env.PI_API_KEY}={}) {
  async function pi(path,authorization,options={}) {
    let response;
    try {response=await request('https://api.minepi.com/v2'+path,{...options,headers:{...options.headers,Authorization:authorization},signal:AbortSignal.timeout(12000)});} catch {throw new Problem(503,'Pi verification is temporarily unavailable. Please retry.');}
    if (!response.ok) throw new Problem(response.status===401||response.status===403?401:502,response.status===401||response.status===403?'Pi session or server credentials could not be verified. Please log in again.':'Pi could not confirm this payment step. Please retry.');
    try {return await response.json();} catch {throw new Problem(502,'Pi returned an unreadable response.');}
  }
  async function authenticate(event) {
    const auth=event.headers?.authorization || event.headers?.Authorization;
    if (typeof auth!=='string' || !/^Bearer [^\s]{1,4096}$/.test(auth)) throw new Problem(401,'Pi login is required.');
    const user=await pi('/me',auth);
    if (typeof user.uid!=='string' || !user.uid || user.uid.length>200 || typeof user.username!=='string' || !user.username) throw new Problem(401,'Pi did not verify your account. Please log in again.');
    return {uid:user.uid,username:user.username};
  }
  async function payment(id,user,completed=false,txid,allowCancelled=false) {
    if (!apiKey) throw new Problem(503,'The Pi payment server is not configured.');
    const data=await pi('/payments/'+encodeURIComponent(id),'Key '+apiKey);
    validate(data,id,user,completed,txid,allowCancelled);
    return data;
  }
  function validate(data,id,user,completed=false,txid,allowCancelled=false) {
    if (data.identifier!==id || data.user_uid!==user.uid) throw new Problem(403,'This payment does not belong to your Pi account.');
    if (data.network!==NETWORK || data.direction!=='user_to_app') throw new Problem(403,'Only this app’s user-to-app Pi Testnet payments are accepted.');
    if (!allowCancelled && (data.status?.cancelled || data.status?.user_cancelled)) throw new Problem(409,'This payment was cancelled.');
    units(data.amount);
    if (txid && data.transaction?.txid!==txid) throw new Problem(409,'The transaction ID does not match Pi’s payment record.');
    if (completed && (data.status?.developer_completed!==true || data.status?.transaction_verified!==true || data.transaction?.verified!==true || !data.transaction.txid)) throw new Problem(409,'Pi has not confirmed the completed transaction yet.');
  }
  async function persist(store,data,user) {
    const createdAt=new Date(data.created_at);
    if (!Number.isFinite(createdAt.getTime())) throw new Problem(502,'Pi returned an invalid payment date.');
    const record={schema:SCHEMA,network:NETWORK,accountId:hash(user.uid),usernameAtPayment:user.username,paymentId:data.identifier,txid:data.transaction.txid,amount:decimal(units(data.amount)),dateIso:createdAt.toISOString(),status:'completed'};
    const key=prefix(user.uid)+hash(record.paymentId);
    try {
      await store.setJSON(key,record,{onlyIfNew:true});
      // Verify write visibility even when the SDK reports an unsuccessful conditional write.
      const saved=await store.get(key,{type:'json',consistency:'strong'});
      if (!saved || ['schema','network','accountId','paymentId','txid','amount','dateIso','status'].some(k=>saved[k]!==record[k])) throw new Error('Payment record mismatch');
      return saved;
    } catch {throw new Problem(503,'Pi confirmed the transaction, but its account record could not be saved. Retry confirmation; do not send another payment.');}
  }
  async function journal(store,data,user,txid) {
    const key='accounts/'+hash(user.uid)+'/receipts/'+hash(data.identifier);
    const receipt={paymentId:data.identifier,txid,accountId:hash(user.uid)};
    try {
      await store.setJSON(key,receipt,{onlyIfNew:true});
      const saved=await store.get(key,{type:'json',consistency:'strong'});
      if(!saved || saved.paymentId!==receipt.paymentId || saved.txid!==receipt.txid || saved.accountId!==receipt.accountId) throw Error('Receipt mismatch');
    }catch {throw new Problem(503,'The payment recovery record could not be saved. Retry confirmation; do not send another payment.');}
  }
  async function history(store,user,deployContext) {
    const pending=[];
    // A durable receipt precedes /complete. On next login recover an acknowledged payment
    // even if the process died between Pi completion and the final ledger write.
    const receipts=await store.list({prefix:'accounts/'+hash(user.uid)+'/receipts/'});
    for(const blob of receipts.blobs) {
      const receipt=await store.get(blob.key,{type:'json',consistency:'strong'});
      if(!receipt || receipt.accountId!==hash(user.uid)) throw new Problem(503,'Payment recovery records could not be read.');
      if(await store.get(prefix(user.uid)+hash(receipt.paymentId),{type:'json',consistency:'strong'})) continue;
      const data=await payment(identifier(receipt.paymentId),user,false,receipt.txid,true);
      if(data.status?.cancelled || data.status?.user_cancelled) continue;
      if(data.status.developer_completed) {validate(data,receipt.paymentId,user,true,receipt.txid);await persist(store,data,user);}
      else pending.push({paymentId:receipt.paymentId,txid:receipt.txid,amount:decimal(units(data.amount)),userUid:user.uid});
    }
    const listing=await store.list({prefix:prefix(user.uid)});
    const items=[];
    // No shared balance/counter to lose updates: totals are derived from immutable payment records.
    for (let i=0;i<listing.blobs.length;i+=8) {
      const batch=await Promise.all(listing.blobs.slice(i,i+8).map(blob=>store.get(blob.key,{type:'json',consistency:'strong'})));
      for (const item of batch) {
        if (!item || item.schema!==SCHEMA || item.accountId!==hash(user.uid) || item.network!==NETWORK || item.status!=='completed') throw new Problem(503,'Account history could not be read completely. Please retry.');
        units(item.amount);items.push(item);
      }
    }
    items.sort((a,b)=>b.dateIso.localeCompare(a.dateIso)||a.paymentId.localeCompare(b.paymentId));
    return {schema:'tpf_my_forest_v1',network:NETWORK,account:user,connection:{accountReference:hash(user.uid).slice(0,12),recordEnvironment:deployContext || 'local-preview'},items,pending,totals:{testPi:decimal(items.reduce((sum,item)=>sum+units(item.amount),0n)),payments:items.length},updatedAt:new Date().toISOString()};
  }
  return async function handle(action,event) {
    try {
      const method=action==='my-forest'?'GET':'POST';
      if (event.httpMethod!==method) return {...result(405,{error:'Method not allowed.'}),headers:{...headers,Allow:method}};
      if (event.body && event.body.length>4096) throw new Problem(413,'Request too large.');
      const user=await authenticate(event);
      if (action==='my-forest') {
        const store=await getStore(event);
        return result(200,await history(store,user,event.deployContext));
      }
      let body;try {body=JSON.parse(event.body||'{}');}catch {throw new Problem(400,'Invalid JSON.');}
      const id=identifier(body.paymentId);
      const txid=action==='complete-payment'?identifier(body.txid,'transaction ID'):undefined;
      let data=await payment(id,user,false,txid);
      if (action==='approve-payment') {
        if (!data.status?.developer_approved) {
          data=await pi('/payments/'+encodeURIComponent(id)+'/approve','Key '+apiKey,{method:'POST',headers:{'Content-Type':'application/json'}});
          validate(data,id,user);
        }
        return result(200,data);
      }
      if (action!=='complete-payment') throw new Problem(404,'Unknown operation.');
      const store=await getStore(event); // Check storage setup before acknowledging a new completion.
      if(data.status?.developer_completed) validate(data,id,user,true,txid);
      await journal(store,data,user,txid);
      if (!data.status?.developer_completed) {
        try {await pi('/payments/'+encodeURIComponent(id)+'/complete','Key '+apiKey,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({txid}).toString()});}
        catch(error) {try {data=await payment(id,user,true,txid);}catch{throw error;}}
        // Read Pi's authoritative record again; never trust client fields or a partial POST response.
        data=await payment(id,user,true,txid);
      } else validate(data,id,user,true,txid);
      const record=await persist(store,data,user);
      return result(200,{...data,accountRecordSaved:true,record});
    } catch(error) {
      return result(error instanceof Problem?error.status:503,{error:error instanceof Problem?error.message:'Account records are temporarily unavailable. Please retry.'});
    }
  };
}
module.exports={createService,storeName,units,decimal,prefix};
