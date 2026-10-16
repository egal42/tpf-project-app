import service from './my-forest.js';
import storage from './netlify-store.js';
export function handlerFor(action) {
  return async (request,context) => {
    // Read a bounded body before parsing; no token or payment payload is logged.
    if (Number(request.headers.get('content-length') || 0)>4096) return new Response(JSON.stringify({error:'Request too large.'}),{status:413,headers:{'Cache-Control':'no-store','Content-Type':'application/json'}});
    let body='';
    if (request.body) {
      const reader=request.body.getReader();const decoder=new TextDecoder();let size=0;
      while (true) {const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return new Response(JSON.stringify({error:'Request too large.'}),{status:413,headers:{'Cache-Control':'no-store','Content-Type':'application/json'}});}body+=decoder.decode(value,{stream:true});}
      body+=decoder.decode();
    }
    const result=await service.createService({getStore:storage.getAccountStore})(action,{httpMethod:request.method,headers:Object.fromEntries(request.headers),body,deployContext:context.deploy?.context,readId:new URL(request.url).searchParams.get('read')});
    return new Response(result.body,{status:result.statusCode,headers:result.headers});
  };
}
