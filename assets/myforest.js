/* TPF My Forest Page */
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const profileName = document.getElementById("profileName");

function renderHistory() {
  const username = window.TPF.getUsername();

  if (username) {
    profileName.textContent = "Welcome @" + username + " 🌱";
  } else {
    profileName.textContent = "Please login first 🌱";
    historyList.innerHTML = '<div class="history-item">Go Home and login with Pi to view your local activity.</div>';
    return;
  }

  const items = window.TPF.loadHistory(username);

  if (!items.length) {
    historyList.innerHTML = '<div class="history-item">No local activity yet.</div>';
    return;
  }

  historyList.innerHTML = items.map(function (item) {
    const txLine = item.txid ? '<br /><strong>TX ID:</strong> ' + window.TPF.escapeHtml(item.txid) : "";
    const paymentLine = item.paymentId ? '<br /><strong>Payment ID:</strong> ' + window.TPF.escapeHtml(item.paymentId) : "";
    const details = paymentLine || txLine
      ? '<details><summary>Payment details</summary><p class="tiny">' + paymentLine + txLine + '</p></details>'
      : "";

    return '<div class="history-item">' +
      '<span class="history-message">🌱 ' + window.TPF.escapeHtml(item.message) + '</span>' +
      '<div class="history-topline">' +
      '<span class="history-amount">' + window.TPF.escapeHtml(item.amount) + ' Test Pi</span>' +
      '<span class="history-date">' + window.TPF.escapeHtml(item.dateLabel) + '</span>' +
      '</div>' +
      details +
      '</div>';
  }).join("");
}

clearHistoryBtn.addEventListener("click", function () {
  const username = window.TPF.getUsername();
  if (!username) return;
  localStorage.removeItem(window.TPF.historyKey(username));
  renderHistory();
});

renderHistory();
