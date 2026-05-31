/* TPF App V0.8.2 Common Helpers
   Correct behavior:
   - We do NOT persist fake login state across reloads.
   - Pi Login is required each app session.
   - We keep only last username for local history lookup.
*/
(function () {
  const LAST_USERNAME_KEY = "tpf_last_username";
  const SESSION_USERNAME_KEY = "tpf_session_username";
  const HISTORY_PREFIX = "tpf_testnet_history_";

  window.TPF = {
    lastUsernameKey: LAST_USERNAME_KEY,
    sessionUsernameKey: SESSION_USERNAME_KEY,
    historyPrefix: HISTORY_PREFIX,

    getUsername() {
      return sessionStorage.getItem(SESSION_USERNAME_KEY) || "";
    },

    getLastUsername() {
      return localStorage.getItem(LAST_USERNAME_KEY) || "";
    },

    isLoggedIn() {
      return !!sessionStorage.getItem(SESSION_USERNAME_KEY);
    },

    saveSession(username) {
      if (!username) return;
      sessionStorage.setItem(SESSION_USERNAME_KEY, username);
      localStorage.setItem(LAST_USERNAME_KEY, username);
    },

    signOut() {
      sessionStorage.removeItem(SESSION_USERNAME_KEY);
      window.location.href = "index.html";
    },

    historyKey(username) {
      return HISTORY_PREFIX + (username || this.getUsername() || this.getLastUsername() || "unknown");
    },

    loadHistory(username) {
      try {
        return JSON.parse(localStorage.getItem(this.historyKey(username)) || "[]");
      } catch (error) {
        return [];
      }
    },

    saveHistory(items, username) {
      localStorage.setItem(this.historyKey(username), JSON.stringify(items.slice(0, 25)));
    },

    addHistoryItem(item, username) {
      const items = this.loadHistory(username);
      items.unshift(item);
      this.saveHistory(items, username);
    },

    escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },

    attachSignOut() {
      const btn = document.getElementById("signOutBtn");
      if (btn) btn.addEventListener("click", () => this.signOut());
    },

    requireLogin(messageTargetId) {
      if (this.isLoggedIn()) return true;

      const target = messageTargetId ? document.getElementById(messageTargetId) : null;
      if (target) {
        target.textContent = "Please login from the Home page first.";
      }

      return false;
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    window.TPF.attachSignOut();
  });
})();
