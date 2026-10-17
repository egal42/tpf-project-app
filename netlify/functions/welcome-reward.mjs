import {createRewardService} from '../../lib/welcome-reward.js';
import {createPiA2U} from '../../lib/pi-a2u.js';
import {getAccountStore} from '../../lib/netlify-store.js';
export default async (request,context)=>{
 // Isolate reward data from the existing contribution ledger within the context-isolated store.
 const config=process.env.TPF_WELCOME_REWARD_ENABLED==='true'&&process.env.PI_A2U_NETWORK==='Pi Testnet'&&!!process.env.PI_API_KEY&&!!process.env.PI_A2U_TESTNET_SEED&&!!process.env.PI_A2U_TESTNET_PUBLIC_KEY;
 const service=createRewardService({getStore:getAccountStore,getTransport:createPiA2U,enabled:config});
 if(Number(request.headers.get('content-length')||0)>4096)return new Response('{"error":"Request too large."}',{status:413,headers:{'Cache-Control':'no-store','Content-Type':'application/json'}});
 let body='';
 if(request.body){const reader=request.body.getReader();let size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return new Response('{"error":"Request too large."}',{status:413,headers:{'Cache-Control':'no-store','Content-Type':'application/json'}});}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}
 const result=await service({httpMethod:request.method,headers:Object.fromEntries(request.headers),body,deployContext:context.deploy?.context,readId:new URL(request.url).searchParams.get('read')});
 return new Response(result.body,{status:result.statusCode,headers:result.headers});
};
