/* Local simulation only. This module is never imported by deployed functions. */
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createService}=require('../lib/my-forest');
const dataRoot=path.resolve(process.env.TPF_PREVIEW_DATA_DIR || path.join(__dirname,'../.local-preview'));
const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
async function json(file) {try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function file(key){if(!/^[a-zA-Z0-9/_-]+$/.test(key))throw Error('Invalid key');return path.join(dataRoot,key+'.json');}
async function write(key,data,onlyIfNew=false){const f=file(key);await fs.mkdir(path.dirname(f),{recursive:true});try{await fs.writeFile(f,JSON.stringify(data),{flag:onlyIfNew?'wx':'w'});return {modified:true};}catch(e){if(e.code==='EEXIST')return {modified:false};throw e;}}
const store={
 setJSON:(key,value,options)=>write('ledger/'+key,value,options?.onlyIfNew),
 get:(key)=>json(file('ledger/'+key)),
 async list({prefix}){
  const folder=path.dirname(file('ledger/'+prefix+'placeholder'));
  let names;try{names=await fs.readdir(folder);}catch(e){if(e.code==='ENOENT')return {blobs:[]};throw e;}
  return {blobs:names.filter(n=>n.endsWith('.json')).map(n=>({key:prefix+n.slice(0,-5)}))};
 }
};
function userFor(headers){const auth=headers?.Authorization || headers?.authorization || '';const match=/^Bearer local-preview:([a-z0-9_-]{1,40})$/.exec(auth);return match?{uid:'local-'+match[1],username:match[1]}:null;}
async function fakePi(url,options={}) {
 const route=new URL(url).pathname.replace('/v2','');
 if(route==='/me'){const user=userFor(options.headers);return response(user?200:401,user||{error:'Invalid local preview token'});}
 if(options.headers?.Authorization!=='Key local-preview-key')return response(401,{});
 const match=/^\/payments\/([A-Za-z0-9_-]+)(?:\/(approve|complete))?$/.exec(route);
 if(!match)return response(404,{});
 const key='pi/'+match[1];const data=await json(file(key));if(!data)return response(404,{});
 if(match[2]==='approve'){data.status.developer_approved=true;await write(key,data);}
 if(match[2]==='complete'){data.status.developer_completed=true;await write(key,data);}
 return response(200,data);
}
const service=createService({fetch:fakePi,getStore:async()=>store,apiKey:'local-preview-key'});
exports.handle=async(action,event)=>{
 if(action!=='create-payment')return service(action,event);
 const user=userFor(event.headers);if(!user)return {statusCode:401,body:JSON.stringify({error:'Preview login required'})};
 let body;try{body=JSON.parse(event.body);}catch{return {statusCode:400,body:'{}'};}
 const id='LOCAL-'+require('node:crypto').randomUUID();const txid='SIMULATED-'+require('node:crypto').randomUUID();
 const data={identifier:id,user_uid:user.uid,amount:body.amount,network:'Pi Testnet',direction:'user_to_app',created_at:new Date().toISOString(),transaction:{txid,verified:true},status:{developer_approved:false,developer_completed:false,transaction_verified:true,cancelled:false,user_cancelled:false}};
 await write('pi/'+id,data);
 return {statusCode:200,headers:{'Content-Type':'application/json'},body:JSON.stringify({paymentId:id,txid})};
};
