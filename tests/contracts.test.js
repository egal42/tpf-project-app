const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {validSummary} = require('../assets/impact-contract.js');
const summary = {schema:'tpf_website_summary_v1',revision:'a'.repeat(64),publishedAt:'2026-10-08T21:53:50.843Z',impact:{trees:'1096',estimatedCo2Kg:'124290',asOf:'2026-10-08'}};
test('Only valid reviewed impact is accepted, including legitimate zero totals',()=>{
 assert(validSummary(summary)); assert(validSummary({...summary,impact:{...summary.impact,trees:'0',estimatedCo2Kg:'0'}}));
 for(const patch of [{trees:'NaN'},{trees:'1.5'},{estimatedCo2Kg:'-1'},{asOf:'2026-02-30'},{asOf:'2999-01-01'},{trees:'99999999999999999999'}])assert.equal(validSummary({...summary,impact:{...summary.impact,...patch}}),false);
 assert.equal(validSummary({...summary,revision:'not-reviewed'}),false);
 assert.equal(validSummary({}),false);
});
test('Impact reader coalesces concurrent reads, caches for six hours, rejects methods and errors',async()=>{
 const file = require.resolve('../netlify/functions/impact-summary.js');delete require.cache[file];
 const old = global.fetch;let reads=0;
 global.fetch=async()=>{reads++;await new Promise(r=>setTimeout(r,5));return {ok:true,json:async()=>summary};};
 try {
  const {handler}=require(file);
  const responses=await Promise.all(Array.from({length:8},()=>handler({httpMethod:'GET'})));
  assert(responses.every(r=>r.statusCode===200));assert.equal(reads,1);
  assert.match(responses[0].headers['Netlify-CDN-Cache-Control'],/durable.*21600/);
  await handler({httpMethod:'GET'});assert.equal(reads,1);
  const originalNow=Date.now;const now=Date.now();Date.now=()=>now+5*60*60*1000;
  try {const aged=await handler({httpMethod:'GET'});const ttl=Number(aged.headers['Netlify-CDN-Cache-Control'].split('s-maxage=')[1]);assert(ttl>3590 && ttl<=3600);assert.equal(reads,1);} finally {Date.now=originalNow;}
  assert.equal((await handler({httpMethod:'POST'})).statusCode,405);
  delete require.cache[file];global.fetch=async()=>({ok:false});assert.equal((await require(file).handler({httpMethod:'GET'})).statusCode,503);
  delete require.cache[file];global.fetch=async()=>({ok:true,json:async()=>({})});assert.equal((await require(file).handler({httpMethod:'GET'})).statusCode,503);
 } finally {global.fetch=old;delete require.cache[file];}
});
test('History compatibility, repeat completion, malformed storage, isolation',()=>{
 const store=new Map();const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const context={window:{},localStorage:storage,sessionStorage:storage};vm.createContext(context);vm.runInContext(fs.readFileSync('assets/app-common-092.js','utf8'),context);
 const t=context.window.TPF;store.set('tpf_testnet_history_egal42','[{"paymentId":"old","amount":3}]');assert.equal(t.loadHistory('egal42').length,1);
 t.addHistoryItem({paymentId:'new',amount:1},'egal42');t.addHistoryItem({paymentId:'new',amount:1},'egal42');assert.equal(t.loadHistory('egal42').length,2);assert.equal(t.loadHistory('other').length,0);
 store.set('tpf_testnet_history_other','{"bad":true}');assert.equal(t.loadHistory('other').length,0);
 t.clearHistory('other');assert.equal(t.loadHistory('egal42').length,2);
});

test('Quota failure retains new history in memory and reports storage limitation',()=>{
 const storage={getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded');},removeItem:()=>{}};
 const context={window:{},localStorage:storage,sessionStorage:storage};vm.createContext(context);vm.runInContext(fs.readFileSync('assets/app-common-092.js','utf8'),context);
 const t=context.window.TPF;t.addHistoryItem({paymentId:'retained',amount:1},'egal42');assert.equal(t.loadHistory('egal42').length,1);assert(t.storageFailed());
});
