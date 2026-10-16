/* v0.9.4: same Pi SDK sandbox, scopes, payment payload and server endpoints as v0.9.1b. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const screens = ['home','support','myforest','about'];
  const IMPACT_KEY = 'tpf_app_public_impact_v1', IMPACT_TTL = 6 * 60 * 60 * 1000;
  let currentUser = null, currentAccessToken = null, accountHistory = null, historyLoading = false, selectedAmount = 1, authenticating = false, paymentBusy = false, pendingPayment = null;
  let retryBusy = false, historyError = null, lastHistoryRead = 0;
  const format = n => Number(n).toLocaleString(undefined,{maximumFractionDigits:3});
  const date = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString() : 'Date unavailable'; };
  const status = message => { $('status').textContent = message; };
  const paymentStatus = message => { $('appStatus').textContent = message; };
  async function withTimeout(promise,ms,message) {
    let timer;
    try { return await Promise.race([promise,new Promise((_,reject) => { timer = setTimeout(() => reject(new Error(message)),ms); })]); }
    finally { clearTimeout(timer); }
  }
  function showScreen(name, focus = true) {
    if (!currentUser || !screens.includes(name)) return;
    document.querySelectorAll('.app-screen').forEach(el => el.classList.toggle('active',el.dataset.screen === name));
    document.querySelectorAll('.nav-button').forEach(el => {
      const active = el.dataset.screenTarget === name;
      el.classList.toggle('active',active);
      if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    if (name === 'myforest') {renderHistory();if(Date.now()-lastHistoryRead>60000)loadAccountHistory();}
    if (focus && !legalOrigin) document.querySelector('[data-screen="'+name+'"] h1').focus();
  }
  let legalOrigin=null;
  const legalPages=['privacy-policy','terms-of-service','transparency'];
  function legalHash(){return location.hash.slice(1);}
  function openLegal(name,push=true) {
    if(!legalPages.includes(name))return;
    const alreadyOpen=!!legalOrigin;
    if(!legalOrigin)legalOrigin={scroll:window.scrollY,focus:document.activeElement};
    $('screen-login').classList.add('hidden');$('app-shell').classList.add('hidden');$('legal-screen').classList.remove('hidden');
    document.querySelectorAll('[data-legal-document]').forEach(el=>el.classList.toggle('hidden',el.dataset.legalDocument!==name));
    document.querySelectorAll('.legal-tabs [data-open-legal]').forEach(el=>{if(el.dataset.openLegal===name)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    if(push){const method=alreadyOpen?'replaceState':'pushState';history[method]({tpfLegal:true},'', '#'+name);}
    window.scrollTo(0,0);document.querySelector('[data-legal-document="'+name+'"] h1').focus({preventScroll:true});
  }
  function restoreApp() {
    const origin=legalOrigin;legalOrigin=null;
    $('legal-screen').classList.add('hidden');
    $('screen-login').classList.toggle('hidden',!!currentUser);$('app-shell').classList.toggle('hidden',!currentUser);
    if(origin?.focus?.isConnected)origin.focus.focus({preventScroll:true});
    window.scrollTo(0,origin?.scroll || 0);
  }
  function closeLegal() {
    if(history.state?.tpfLegal)history.back();
    else {history.replaceState(null,'',location.pathname+location.search);restoreApp();}
  }
  function log(message,detail) {
    // Never log the auth token or SDK authentication response.
    const line = '['+new Date().toLocaleTimeString()+'] '+message+(detail ? '\n'+JSON.stringify(detail) : '');
    $('testLog').textContent = (line+'\n\n'+$('testLog').textContent).slice(0,6000);
  }
  function setPaymentBusy(busy) {
    paymentBusy = busy;
    $('sdkPaymentBtn').disabled = busy || !!pendingPayment;
    $('signOutBtn').disabled = busy || retryBusy;
    document.querySelectorAll('.amount-button').forEach(el => { el.disabled = busy || !!pendingPayment; });
    $('customAmount').disabled = busy || !!pendingPayment;
  }
  function showPending() {
    $('pendingNotice').classList.toggle('hidden',!pendingPayment);
    $('retryPaymentBtn').disabled = !pendingPayment?.txid || retryBusy;
    if (pendingPayment) $('pendingText').textContent = pendingPayment.txid
      ? 'A submitted Testnet payment needs server confirmation. Retry confirmation; do not send a second payment.'
      : 'An incomplete payment was reported without a transaction ID. Finish or cancel it in Pi Wallet before trying another payment.';
    setPaymentBusy(paymentBusy);
  }
  function onIncompletePaymentFound(payment) {
    pendingPayment = { paymentId:payment.identifier, txid:payment.transaction?.txid, amount:payment.amount, userUid:payment.user_uid, startedAt:payment.created_at || new Date().toISOString() };
    log('Incomplete payment reported',{paymentId:pendingPayment.paymentId});
    showPending();
  }
  async function handleLogin() {
    if (authenticating) return;
    authenticating = true; $('loginBtn').disabled = true; status('Checking Pi login…');
    try {
      if (!window.Pi || typeof window.Pi.authenticate !== 'function') throw new Error('Open this app in Pi Browser or its configured Pi Sandbox to log in.');
      if (!await withTimeout(window.tpfPiReady,8000,'Pi SDK initialization timed out. Please reload.')) throw new Error('Pi SDK could not initialize. Please reload in Pi Browser.');
      const auth = await withTimeout(window.Pi.authenticate(['username','payments'],onIncompletePaymentFound),12000,'Pi login timed out. Please try again.');
      if (!auth?.user?.username || !auth.accessToken) throw new Error('Pi login did not return a valid session. Please try again.');
      currentAccessToken = auth.accessToken;
      const verified = await accountRequest('my-forest');
      if (!verified.account?.uid || verified.account.uid !== auth.user.uid) throw new Error('The verified Pi account does not match the login session.');
      currentUser = verified.account;
      accountHistory = verified;lastHistoryRead=Date.now();
      if(!pendingPayment && verified.pending?.length) pendingPayment=verified.pending[0];
      TPF.saveSession(currentUser.username);
      $('welcomeName').textContent = 'Welcome, @'+currentUser.username+'.';
      $('screen-login').classList.add('hidden'); $('app-shell').classList.toggle('hidden',!!legalOrigin);
      $('browserWarning').classList.add('hidden');
      showScreen(pendingPayment ? 'support' : 'home'); showPending();
    } catch (error) { currentUser=null; currentAccessToken=null; accountHistory=null; status(error.message || 'Pi login failed. Please try again.'); $('browserWarning').classList.remove('hidden'); }
    finally { authenticating = false; $('loginBtn').disabled = false; }
  }
  function parseAmount() {
    const input = $('customAmount').value.trim().replace(',','.');
    if (!input) return selectedAmount;
    if (!/^\d+(\.\d{1,7})?$/.test(input)) return null;
    const amount = Number(input);
    return Number.isFinite(amount) && amount > 0 && amount <= Number.MAX_SAFE_INTEGER / 1e7 ? amount : null;
  }
  function updateAmount() {
    const amount = parseAmount();
    $('selectedAmountLabel').textContent = amount === null ? 'Enter a positive amount with at most 7 decimal places.' : 'Selected: '+amount+' Test Pi';
    $('customAmount').setAttribute('aria-invalid',amount === null ? 'true' : 'false');
  }
  function paymentId(value) {
    const id = typeof value === 'string' ? value : value?.identifier;
    if (!id || typeof id !== 'string') throw new Error('Pi did not return a payment ID.');
    return id;
  }
  async function accountRequest(endpoint,body) {
    const response = await fetch('/.netlify/functions/'+endpoint,{method:body ? 'POST' : 'GET',headers:{...(body ? {'Content-Type':'application/json'} : {}),Authorization:'Bearer '+currentAccessToken},...(body ? {body:JSON.stringify(body)} : {}),cache:'no-store',signal:AbortSignal.timeout(20000)});
    let data;
    try { data = await response.json(); } catch { throw new Error('Payment server returned an unreadable response.'); }
    if (!response.ok || data.error) throw new Error(data.error || 'Account records are temporarily unavailable. Please retry.');
    return data;
  }
  async function completePayment(record) {
    if (!currentUser) throw new Error('Please log in before confirming a payment.');
    if (record.userUid && currentUser.uid && record.userUid !== currentUser.uid) throw new Error('This payment belongs to a different Pi session.');
    const username = currentUser.username;
    paymentStatus('Confirming Testnet payment on the server…');
    const data = await accountRequest('complete-payment',{paymentId:record.paymentId,txid:record.txid,amount:record.amount,username});
    if (data.identifier !== record.paymentId || data.status?.developer_completed !== true || data.status?.transaction_verified !== true) throw new Error('The server has not confirmed a completed, verified transaction yet. Retry confirmation shortly.');
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('The server returned an invalid payment amount.');
    if (data.user_uid && currentUser.uid && data.user_uid !== currentUser.uid) throw new Error('The payment confirmation does not match this Pi session.');
    if (data.accountRecordSaved !== true) throw new Error('The account record has not been saved. Retry confirmation; do not send another payment.');
    pendingPayment = null; setPaymentBusy(false); showPending();
    paymentStatus('Testnet payment confirmed. No real-world planting impact was created.');
    log('Server confirmed Testnet payment',{paymentId:record.paymentId});
    await loadAccountHistory();
    showScreen('myforest');
  }
  async function createPayment() {
    if (!currentUser) { status('Please log in with Pi first.'); return; }
    if (paymentBusy || pendingPayment) return;
    const amount = parseAmount();
    if (amount === null) { paymentStatus('Enter a valid positive Test Pi amount, with at most 7 decimal places.'); return; }
    const username = currentUser.username, startedAt = new Date().toISOString();
    setPaymentBusy(true); paymentStatus('Opening Pi Wallet for '+amount+' Test Pi…');
    try {
      window.Pi.createPayment({amount,memo:'TPF Testnet',metadata:{app:'The Pioneer Forest Project',type:'testnet_payment_history_lab',paymentMode:'sdk_user_to_app',username,selectedAmount:amount}}, {
        onReadyForServerApproval: async value => {
          try {
            const id = paymentId(value);
            paymentStatus('Approving Testnet payment on the server…');
            await accountRequest('approve-payment',{paymentId:id,amount,username});
            log('Server approval returned',{paymentId:id});
          } catch (error) { paymentStatus(error.message+' Pi Wallet may retry; you can cancel there.'); log('Approval failed',{message:error.message}); }
        },
        onReadyForServerCompletion: async (value,txid) => {
          try {
            pendingPayment = {paymentId:paymentId(value),txid,amount,startedAt};
            showPending();
            await completePayment(pendingPayment);
          } catch (error) {
            setPaymentBusy(false); showPending(); paymentStatus(error.message); log('Completion pending',{message:error.message});
          }
        },
        onCancel: () => { if (!pendingPayment) { setPaymentBusy(false); paymentStatus('Payment cancelled. No completed payment was recorded.'); } },
        onError: error => { setPaymentBusy(false); showPending(); paymentStatus('Pi payment error: '+(error?.message || 'Please check Pi Wallet and try again.')); log('SDK payment error',{message:error?.message}); }
      });
    } catch (error) { setPaymentBusy(false); paymentStatus(error.message || 'Could not open Pi payment.'); }
  }
  async function retryPayment() {
    if (!pendingPayment?.txid || retryBusy || paymentBusy) return;
    retryBusy = true; showPending();
    try { await completePayment(pendingPayment); } catch (error) { paymentStatus(error.message); }
    finally { retryBusy = false; showPending(); }
  }
  async function loadAccountHistory() {
    if (!currentUser || historyLoading) return;
    const token=currentAccessToken;
    historyError=null; historyLoading=true; $('refreshHistoryBtn').disabled=true;
    $('historyStatus').textContent='Loading your account records…';
    try {
      const data=await accountRequest('my-forest');
      if(token!==currentAccessToken)return;
      if(data.account?.uid!==currentUser.uid || data.network!=='Pi Testnet' || !Array.isArray(data.items) || !data.totals) throw new Error('Account history response could not be verified.');
      accountHistory=data;lastHistoryRead=Date.now(); if(!pendingPayment && data.pending?.length){pendingPayment=data.pending[0];showPending();} renderHistory();
    } catch(error) {
      if(token===currentAccessToken){historyError=error.message;renderHistory();}
    } finally {historyLoading=false; $('refreshHistoryBtn').disabled=false;}
  }
  function renderHistory() {
    if (!currentUser) return;
    $('profileName').textContent='@'+currentUser.username+' · your Testnet account';
    const data=accountHistory;
    $('personalTotal').textContent=data ? data.totals.testPi : '—';
    $('personalCount').textContent=data ? String(data.totals.payments) : '—';
    $('accountConnection').textContent='App '+document.querySelector('meta[name="tpf-version"]').content+' · @'+currentUser.username+' · Account '+(data?.connection?.accountReference || 'not available')+' · '+(data?.connection?.recordEnvironment || 'unknown environment')+' · Pi Testnet';
    const items=data?.items || [];
    $('personalLatest').textContent=items.length ? 'Latest confirmed payment: '+date(items[0].dateIso) : 'No confirmed payments recorded yet.';
    const escape=TPF.escapeHtml;
    $('historyList').innerHTML=items.length ? items.map(item=>'<article class="history-item"><div class="history-topline"><strong class="history-amount">'+escape(item.amount)+' Test Pi</strong><span class="history-date">'+escape(date(item.dateIso))+'</span></div><p class="tiny">Confirmed account record · Testnet only</p><details><summary>Payment details</summary><p class="tiny">Payment ID: '+escape(item.paymentId)+'<br />Transaction ID: '+escape(item.txid)+'</p></details></article>').join('') : '<div class="history-item">No confirmed Testnet payments recorded for this account yet.</div>';
    $('historyStatus').textContent=historyError ? historyError+(data ? ' Showing the last loaded records; totals may be out of date.' : ' Account records have not loaded.') : data ? 'Account records loaded '+date(data.updatedAt)+'. Available after Pi login on your other devices.' : 'Account records have not loaded yet.';
    const legacy=TPF.loadHistory(currentUser.username);
    const ids=new Set(items.map(item=>item.paymentId));
    const remaining=legacy.filter(item=>!item.paymentId || !ids.has(item.paymentId));
    $('legacyNotice').classList.toggle('hidden',!remaining.length);
    $('legacyText').textContent=remaining.length+' older browser records are not yet verified in your account history. Only payments verified by Pi can be added.';
  }
  async function restoreLegacy() {
    if(!currentUser || historyLoading)return;
    $('restoreLegacyBtn').disabled=true;
    let restored=0,unverified=0;
    const ids=new Set((accountHistory?.items || []).map(item=>item.paymentId));
    const legacy=TPF.loadHistory(currentUser.username).filter(item=>!item.paymentId || !ids.has(item.paymentId));
    for(const item of legacy) {
      if(!item.paymentId || !item.txid){unverified++;continue;}
      try {const result=await accountRequest('complete-payment',{paymentId:item.paymentId,txid:item.txid});if(result.accountRecordSaved)restored++;else unverified++;} catch {unverified++;}
    }
    await loadAccountHistory();
    $('legacyText').textContent=restored+' older payments verified and saved. '+unverified+' could not be verified; the original browser records are preserved.';
    $('legacyNotice').classList.remove('hidden'); $('restoreLegacyBtn').disabled=false;
  }
  function renderImpact(data,kind) {
    const impact = data?.impact;
    document.querySelectorAll('[data-global-trees]').forEach(el => { el.textContent = impact ? format(impact.trees) : '—'; });
    document.querySelectorAll('[data-global-co2]').forEach(el => { el.textContent = impact ? format(impact.estimatedCo2Kg) : '—'; });
    document.querySelectorAll('[data-impact-status]').forEach(el => {
      el.textContent = impact ? 'Records checked through '+impact.asOf+'. '+(kind === 'stale' ? 'Latest summary unavailable; showing the last saved figures.' : 'From the public TPF summary; updates can take up to 6 hours to appear here.') : (kind === 'unpublished' ? 'Reviewed impact totals have not been published yet.' : 'Public impact totals are unavailable right now. You can still read the impact and transparency information.');
    });
  }
  async function loadImpact() {
    let cached;
    try { const candidate = JSON.parse(TPF.readCache(IMPACT_KEY)); if (TPFImpact.validSummary(candidate?.data) && Number.isFinite(candidate.savedAt)) cached = candidate; } catch {}
    if (cached) renderImpact(cached.data,'stale');
    if (cached && Date.now() >= cached.savedAt && Date.now()-cached.savedAt < IMPACT_TTL) { renderImpact(cached.data,'cached'); return; }
    try {
      const response = await fetch('/.netlify/functions/impact-summary',{signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      if (!TPFImpact.validSummary(data)) throw new Error('Invalid summary');
      TPF.writeCache(IMPACT_KEY,JSON.stringify({data,savedAt:Number.isFinite(Date.parse(data.fetchedAt)) ? Math.min(Date.now(),Date.parse(data.fetchedAt)) : Date.now()}));
      renderImpact(data,data.impact ? 'fresh' : 'unpublished');
    } catch { renderImpact(cached?.data,'stale'); }
  }
  function init() {
    TPF.clearSession(); // A stored username is never used as authentication.
    $('loginBtn').addEventListener('click',handleLogin);
    document.querySelectorAll('[data-open-legal]').forEach(el=>el.addEventListener('click',()=>openLegal(el.dataset.openLegal)));
    $('closeLegalBtn').addEventListener('click',closeLegal);
    window.addEventListener('popstate',()=>{if(legalPages.includes(legalHash()))openLegal(legalHash(),false);else restoreApp();});
    $('signOutBtn').addEventListener('click',() => {
      if (paymentBusy || retryBusy) return;
      currentUser = null; currentAccessToken = null; accountHistory = null; historyError = null; pendingPayment = null; TPF.clearSession();
      $('app-shell').classList.add('hidden'); $('screen-login').classList.remove('hidden');
      $('historyList').replaceChildren(); showPending(); status('Signed out. Pi login is required to enter.'); $('loginBtn').focus();
    });
    document.querySelectorAll('[data-screen-target]').forEach(el => el.addEventListener('click',() => showScreen(el.dataset.screenTarget)));
    document.querySelectorAll('.amount-button').forEach(el => el.addEventListener('click',() => {
      selectedAmount = Number(el.dataset.amount); $('customAmount').value = '';
      document.querySelectorAll('.amount-button').forEach(button => { const active = el === button; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); }); updateAmount();
    }));
    $('customAmount').addEventListener('input',updateAmount);
    $('sdkPaymentBtn').addEventListener('click',createPayment); $('retryPaymentBtn').addEventListener('click',retryPayment);
    $('refreshHistoryBtn').addEventListener('click',loadAccountHistory);
    $('restoreLegacyBtn').addEventListener('click',restoreLegacy);
    loadImpact();
    // Short visual transition only; never waits for the network or for Pi login.
    setTimeout(() => { $('loading-screen').classList.add('hidden'); if(legalPages.includes(legalHash()))openLegal(legalHash(),false);else if(!legalOrigin)$('screen-login').classList.remove('hidden'); },550);
  }
  init();
})();
