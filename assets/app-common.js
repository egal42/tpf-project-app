(function(){
  const LAST='tpf_last_username', SESSION='tpf_session_username', HP='tpf_testnet_history_';
  window.TPF={
    lastUsernameKey:LAST, sessionUsernameKey:SESSION, historyPrefix:HP,
    getUsername(){return sessionStorage.getItem(SESSION)||'';},
    getLastUsername(){return localStorage.getItem(LAST)||'';},
    isLoggedIn(){return !!sessionStorage.getItem(SESSION);},
    saveSession(username){if(!username)return; sessionStorage.setItem(SESSION,username); localStorage.setItem(LAST,username);},
    signOut(){sessionStorage.removeItem(SESSION); window.location.reload();},
    historyKey(username){return HP+(username||this.getUsername()||this.getLastUsername()||'unknown');},
    loadHistory(username){try{return JSON.parse(localStorage.getItem(this.historyKey(username))||'[]');}catch(e){return[];}},
    saveHistory(items,username){localStorage.setItem(this.historyKey(username),JSON.stringify(items.slice(0,25)));},
    addHistoryItem(item,username){const items=this.loadHistory(username);items.unshift(item);this.saveHistory(items,username);},
    escapeHtml(value){return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  };
})();
