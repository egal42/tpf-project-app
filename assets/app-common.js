/* TPF App V0.8 Common Helpers */
(function () {
  const USERNAME_KEY = "tpf_username";
  const LOGIN_KEY = "tpf_last_login";
  const HISTORY_PREFIX = "tpf_testnet_history_";

  window.TPF = {
    usernameKey: USERNAME_KEY,
    loginKey: LOGIN_KEY,
    historyPrefix: HISTORY_PREFIX,

    getUsername() {
      return localStorage.getItem(USERNAME_KEY) || "";
    },

    isLoggedIn() {
      return !!localStorage.getItem(USERNAME_KEY);
    },

    saveSession(username) {
      if (!username) return;
      localStorage.setItem(USERNAME_KEY, username);
      localStorage.setItem(LOGIN_KEY, new Date().toISOString());
    },

    signOut() {
      localStorage.removeItem(USERNAME_KEY);
      localStorage.removeItem(LOGIN_KEY);
      window.location.href = "index.html";
    },

    historyKey(username) {
      return HISTORY_PREFIX + (username || this.getUsername() || "unknown");
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
