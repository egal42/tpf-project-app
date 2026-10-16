/* Preserve v0.9.1b username/history keys. Tokens stay in memory, never storage. */
(function() {
  const memory = new Map();
  let storageFailed = false;
  const failedWrites = new Set();
  function read(key) { try { return failedWrites.has(key) ? memory.get(key) || null : localStorage.getItem(key); } catch { storageFailed = true; return memory.get(key) || null; } }
  function write(key,value) { memory.set(key,value); try { localStorage.setItem(key,value); failedWrites.delete(key); } catch { storageFailed = true; failedWrites.add(key); } }
  window.TPF = {
    sessionUsernameKey:'tpf_session_username',
    getUsername() { return this.username || ''; },
    saveSession(username) { this.username = username; try { sessionStorage.setItem(this.sessionUsernameKey, username); } catch {} },
    clearSession() { this.username = ''; try { sessionStorage.removeItem(this.sessionUsernameKey); } catch {} },
    historyKey(username) { return 'tpf_testnet_history_' + (username || this.getUsername()); },
    loadHistory(username) { try { const items = JSON.parse(read(this.historyKey(username)) || '[]'); return Array.isArray(items) ? items.filter(x => x && typeof x === 'object') : []; } catch { return []; } },
    addHistoryItem(item,username) {
      const items = this.loadHistory(username);
      // Completion callbacks can repeat. One payment must count only once.
      const previous = items.findIndex(x => x.paymentId === item.paymentId);
      if (previous >= 0) items[previous] = {...items[previous], ...item}; else items.unshift(item);
      write(this.historyKey(username), JSON.stringify(items));
    },
    clearHistory(username) { write(this.historyKey(username), '[]'); },
    storageFailed() { return storageFailed; },
    readCache:read, writeCache:write,
    escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  };
})();
