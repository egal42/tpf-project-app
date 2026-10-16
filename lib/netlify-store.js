'use strict';
const {storeName}=require('./my-forest');
async function getAccountStore(event) {
  if (!['production','deploy-preview','branch-deploy','dev'].includes(event.deployContext)) throw new Error('Netlify deploy context is required for account storage.');
  const {getStore}=await import('@netlify/blobs');
  // Modern Functions provide the full automatic Blobs context (including strong-read URLs).
  return getStore({name:storeName(event.deployContext),consistency:'strong'});
}
module.exports={getAccountStore};
