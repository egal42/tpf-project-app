/* Served ONLY by the loopback preview server. Simulated Pi, real application handlers and disk persistence. */
const previewUser=()=>window.__previewUsername || 'preview-pioneer';
window.Pi={
 init:async()=>{},
 authenticate:async()=>({user:{username:previewUser(),uid:'local-'+previewUser()},accessToken:'local-preview:'+previewUser()}),
 createPayment:async(data,callbacks)=>{
  try {
   const r=await fetch('/__preview/create-payment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer local-preview:'+previewUser()},body:JSON.stringify({amount:data.amount})});
   if(!r.ok)throw Error('Local simulation could not start.');
   const {paymentId,txid}=await r.json();
   await callbacks.onReadyForServerApproval(paymentId);await callbacks.onReadyForServerCompletion(paymentId,txid);
  }catch(error){callbacks.onError(error);}
 }
};
