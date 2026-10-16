/* Standalone review artifact only, never loaded by the hosted app. No real account backend. */
(() => {
 const entries=new Map(),payments=new Map();
 let sequence=0;
 const account={uid:'local-preview-pioneer',username:'preview-pioneer'};
 const reply=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
 function sum(){return [...entries.values()].reduce((a,r)=>{const [w,f='']=r.amount.split('.');return a+BigInt(w)*10000000n+BigInt(f.padEnd(7,'0'));},0n);}
 function decimal(n){return String(n/10000000n)+(n%10000000n?'.'+String(n%10000000n).padStart(7,'0').replace(/0+$/,''):'');}
 window.fetch=async(input,options={})=>{
  const route=String(input).split('/').pop();
  if(route==='impact-summary')return reply(window.previewImpact);
  if(options.headers?.Authorization!=='Bearer local-preview:preview-pioneer')return reply({error:'Simulated login required.'},401);
  if(route==='my-forest')return reply({schema:'tpf_my_forest_v1',network:'Pi Testnet',account,items:[...entries.values()].reverse(),pending:[],totals:{testPi:decimal(sum()),payments:entries.size},updatedAt:new Date().toISOString()});
  const body=JSON.parse(options.body||'{}');
  if(route==='create-payment'){
   const id='OFFLINE-'+(++sequence),txid='SIMULATED-'+sequence;
   payments.set(id,{identifier:id,amount:body.amount,user_uid:account.uid,created_at:new Date().toISOString(),status:{developer_completed:false,transaction_verified:true}});
   return reply({paymentId:id,txid});
  }
  const data=payments.get(body.paymentId);if(!data)return reply({error:'No matching simulated payment.'},404);
  if(route==='complete-payment'){
   data.status.developer_completed=true;
   const record={schema:'tpf_testnet_payment_v1',network:'Pi Testnet',amount:Number(data.amount).toFixed(7).replace(/\.?0+$/,''),paymentId:body.paymentId,txid:body.txid,dateIso:data.created_at,status:'completed'};
   entries.set(body.paymentId,record);return reply({...data,accountRecordSaved:true,record});
  }
  if(route==='approve-payment')return reply(data);
  return reply({error:'Offline preview endpoint unavailable.'},404);
 };
})();
