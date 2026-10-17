'use strict';
// Official Pi A2U protocol: https://github.com/pi-apps/pi-sdk-integration-guide
// Build with the same Stellar primitives as Pi's Node SDK, but persist XDR before broadcast.
const HORIZON='https://api.testnet.minepi.com',PLATFORM='https://api.minepi.com/v2',NETWORK='Pi Testnet';
async function createPiA2U({apiKey=process.env.PI_API_KEY,seed=process.env.PI_A2U_TESTNET_SEED,publicKey=process.env.PI_A2U_TESTNET_PUBLIC_KEY,network=process.env.PI_A2U_NETWORK,fetch:request=global.fetch}={}){
 if(network!==NETWORK||!apiKey||!seed||!publicKey)throw Error('Testnet A2U configuration is incomplete.');
 const sdk=await import('@stellar/stellar-sdk');
 const pair=sdk.Keypair.fromSecret(seed);
 if(pair.publicKey()!==publicKey)throw Error('The Testnet app-wallet signing seed does not match its configured public key.');
 async function json(url,options={}){
  const r=await request(url,{...options,cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!r.ok){const error=Error('Pi A2U request could not be confirmed.');error.httpStatus=r.status;
   // Whitelist official rejection codes; never expose the API body or error_message.
   if(url.startsWith(PLATFORM+'/')){try{const body=await r.json();if(['missing_scope','missing_wallet','feature_not_available','user_not_found','invalid_amount','invalid_arguments','invalid_metadata','invalid_address','ongoing_payment_found'].includes(body.error))error.piCode=body.error;}catch{}}
   if(url.startsWith(HORIZON+'/')){try{const body=await r.json(),codes=body.extras?.result_codes;const allowed=['tx_failed','tx_bad_seq','tx_bad_auth','tx_bad_auth_extra','tx_too_early','tx_too_late','tx_insufficient_fee','tx_insufficient_balance','tx_no_source_account','tx_malformed','op_underfunded','op_no_destination','op_low_reserve','op_bad_auth'];const found=[codes?.transaction,...(Array.isArray(codes?.operations)?codes.operations:[])].filter(c=>allowed.includes(c));if(found.length)error.chainCode=found.join('/');}catch{}}
   throw error;}
  return r.json();
 }
 const api=(path,body)=>json(PLATFORM+path,{method:body?'POST':'GET',headers:{Authorization:'Key '+apiKey,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const transaction=hash=>json(HORIZON+'/transactions/'+encodeURIComponent(hash));
 function inspect(signed,payment){
  const tx=sdk.TransactionBuilder.fromXDR(signed.xdr,NETWORK),hash=Buffer.from(tx.hash()).toString('hex');
  const legacy=Array.from(tx.hash()).join(',');
  if(![hash,legacy].includes(signed.txid)||tx.source!==publicKey||tx.operations.length!==1||tx.operations[0].type!=='payment'||tx.operations[0].amount!=='0.2000000'||!tx.operations[0].asset.isNative()||tx.operations[0].destination!==payment.to_address||tx.memo.type!=='text'||Buffer.from(tx.memo.value).toString('utf8')!==payment.identifier||tx.signatures.length!==1||!pair.verify(tx.hash(),tx.signatures[0].signature)||Number(tx.timeBounds?.maxTime)!==signed.expiresAt)throw Error('Stored transaction validation failed.');
  return {tx,hash,isLegacy:signed.txid!==hash};
 }
 const transport={
  publicKey,
  validRecipient:address=>sdk.StrKey.isValidEd25519PublicKey(address),
  create:payment=>api('/payments',{payment}),
  get:id=>api('/payments/'+encodeURIComponent(id)),
  incomplete:async()=>{const data=await api('/payments/incomplete_server_payments');if(!Array.isArray(data.incomplete_server_payments))throw Error('Invalid A2U recovery response');return data.incomplete_server_payments;},
  complete:(id,txid)=>api('/payments/'+encodeURIComponent(id)+'/complete',{txid}),
  async build(payment){
   if(payment.network!==NETWORK||payment.direction!=='app_to_user'||payment.from_address!==publicKey||String(payment.amount)!=='0.2'||payment.transaction?.txid)throw Error('Testnet reward transaction requires review.');
   // Re-read both live blockchain accounts. Never accept a recipient address from the browser.
   const [account,recipient,fees,root]=await Promise.all([json(HORIZON+'/accounts/'+publicKey),json(HORIZON+'/accounts/'+payment.to_address),json(HORIZON+'/fee_stats'),json(HORIZON)]);
   if(account.account_id!==publicKey||recipient.account_id!==payment.to_address||root.network_passphrase!==NETWORK)throw Error('Testnet blockchain identity mismatch.');
   const base=Number(fees.last_ledger_base_fee);
   if(!Number.isSafeInteger(base)||base<=0||base>100000)throw Error('Unexpected Testnet transaction fee.');
   // Signed transaction has a fixed expiry. Never rebuild it automatically after a submission attempt.
   const expiresAt=Math.floor(Date.now()/1000)+300;
   const tx=new sdk.TransactionBuilder(new sdk.Account(publicKey,account.sequence),{fee:String(base),networkPassphrase:NETWORK,timebounds:{minTime:'0',maxTime:String(expiresAt)}})
    .addOperation(sdk.Operation.payment({destination:payment.to_address,asset:sdk.Asset.native(),amount:'0.2'}))
    .addMemo(sdk.Memo.text(payment.identifier)).build();
   tx.sign(pair);
   return {xdr:tx.toXDR(),txid:Buffer.from(tx.hash()).toString('hex'),expiresAt};
  },
  async repair(signed,payment){
   const {hash,isLegacy}=inspect(signed,payment);
   const fixed={...signed,txid:hash,...(isLegacy?{legacyHashRepair:true}:{})};
   if(Math.floor(Date.now()/1000)<=signed.expiresAt)return fixed;
   // Ordinary expired payments still pause. This one-time repair is restricted to the
   // known byte-array hash bug, and requires proof that the old signed envelope cannot land.
   if(!fixed.legacyHashRepair||(signed.renewals||0)>=1)return fixed;
   const [root,ledgers]=await Promise.all([json(HORIZON),json(HORIZON+'/ledgers?order=desc&limit=1')]);
   const ledger=ledgers?._embedded?.records?.[0];
   if(root.network_passphrase!==NETWORK||!ledger||Number(ledger.sequence)!==Number(root.history_latest_ledger)||Number(root.history_latest_ledger)<Number(root.core_latest_ledger)||!Number.isFinite(Date.parse(ledger.closed_at))||Date.parse(ledger.closed_at)/1000<=signed.expiresAt)throw Error('Waiting for fully indexed Testnet ledgers past the original transaction expiry.');
   // Lookup AFTER the fully indexed closed ledger proof; errors other than absence fail closed.
   try{const found=await transaction(hash);if(found.hash!==hash||found.successful!==true)throw Error('Original transaction requires review.');return fixed;}catch(error){if(error.httpStatus!==404)throw error;}
   if(payment.transaction?.txid)throw Error('Pi already linked a transaction; replacement is blocked.');
   const renewed=await transport.build(payment);
   return {...renewed,legacyHashRepair:true,renewals:1};
  },
  async settle(signed,payment){
   const {hash}=inspect(signed,payment);if(signed.txid!==hash)throw Error('Stored hash requires repair before submission.');
   let found;
   try{found=await transaction(signed.txid);}catch(error){if(error.httpStatus!==404)throw error;}
   if(!found){
    if(Math.floor(Date.now()/1000)>signed.expiresAt)throw Error('The original signed transaction expired and requires review; it will not be replaced automatically.');
    try{await json(HORIZON+'/transactions',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({tx:signed.xdr}).toString()});}
    catch(error){
     // Submission may have reached the chain despite a timeout or bad-sequence response on replay.
     try{found=await transaction(signed.txid);}catch{throw error;}
    }
    found=await transaction(signed.txid);
   }
   if(found.hash!==signed.txid||found.successful!==true)throw Error('The Testnet transaction is not confirmed.');
   return signed.txid;
  }
 };
 return transport;
}
module.exports={createPiA2U};
