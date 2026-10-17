'use strict';
// Local simulation ONLY. No signing seed, real Pi API or blockchain traffic.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {createRewardService}=require('../lib/welcome-reward');
const root=path.resolve(process.env.TPF_PREVIEW_DATA_DIR||path.join(__dirname,'../.local-preview'),'welcome-reward');
const hash=s=>createHash('sha256').update(s).digest('hex');
async function read(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function write(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID();await fs.writeFile(temp,JSON.stringify(data));await fs.rename(temp,file);}
const ledger=path.join(root,'campaign.json');let queue=Promise.resolve();
const store={
 async getWithMetadata(){const data=await read(ledger);return data?{data,etag:hash(JSON.stringify(data))}:null;},
 async setJSON(key,data,options={}){
  const operation=queue.then(async()=>{const old=await this.getWithMetadata();if(options.onlyIfNew&&old||options.onlyIfMatch&&old?.etag!==options.onlyIfMatch)return {modified:false};await write(ledger,data);return {modified:true};});queue=operation.catch(()=>{});return operation;
 }
};
const file=id=>path.join(root,'pi',id+'.json');
const transport={
 publicKey:'SIMULATED-TESTNET-APP',validRecipient:a=>a==='SIMULATED-TESTNET-PIONEER',
 async create(payment){const id='LOCAL-A2U-'+randomUUID();const data={identifier:id,user_uid:payment.uid,amount:payment.amount,memo:payment.memo,metadata:payment.metadata,network:'Pi Testnet',direction:'app_to_user',from_address:this.publicKey,to_address:'SIMULATED-TESTNET-PIONEER',transaction:null,status:{developer_approved:true,developer_completed:false,transaction_verified:false,cancelled:false,user_cancelled:false}};await write(file(id),data);return data;},
 get:id=>read(file(id)),
 async incomplete(){let names;try{names=await fs.readdir(path.join(root,'pi'));}catch(e){if(e.code==='ENOENT')return [];throw e;}return (await Promise.all(names.map(n=>read(path.join(root,'pi',n))))).filter(p=>!p.status.developer_completed);},
 async build(p){return {xdr:'LOCAL-SIMULATED:'+p.identifier,txid:hash(p.identifier),expiresAt:Math.floor(Date.now()/1000)+300};},
 async settle(signed,payment){const p=await this.get(payment.identifier);p.transaction={txid:signed.txid,verified:true};p.status.transaction_verified=true;await write(file(p.identifier),p);},
 async complete(id,txid){const p=await this.get(id);if(p.transaction?.txid!==txid)throw Error('Simulation mismatch');p.status.developer_completed=true;await write(file(id),p);return p;}
};
const request=async(url,options)=>{const token=options.headers.Authorization||'';const match=/^Bearer local-preview:([a-z0-9_-]{1,40})$/.exec(token);return {ok:!!match,json:async()=>match?{uid:'local-'+match[1],username:match[1],credentials:{scopes:['username','payments','wallet_address']}}:{}};};
module.exports=createRewardService({fetch:request,getStore:async()=>store,getTransport:async()=>transport,enabled:true,allowedContext:'local-preview'});
