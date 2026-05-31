/* TPF Support Page - Testnet Payment */
const FOREST_MESSAGES = [
  "The forest records your step.",
  "A root extends quietly.",
  "The soil remembers.",
  "Another signal reaches the forest.",
  "A small action enters the journey."
];

const sdkPaymentBtn = document.getElementById("sdkPaymentBtn");
const amountButtons = document.querySelectorAll(".amount-button");
const customAmount = document.getElementById("customAmount");
const selectedAmountLabel = document.getElementById("selectedAmountLabel");
const appStatusEl = document.getElementById("appStatus");
const testLog = document.getElementById("testLog");

let selectedAmount = 1;
let currentUser = null;
let currentAccessToken = null;
let activePayment = null;
let isAuthenticating = false;

function showAppStatus(message) {
  appStatusEl.textContent = message;
}

function logTest(message, data) {
  const time = new Date().toLocaleTimeString();
  let line = "[" + time + "] " + message;

  if (data !== undefined) {
    try {
      line += "\n" + JSON.stringify(data, null, 2);
    } catch (error) {
      line += "\n" + String(data);
    }
  }

  if (!testLog || testLog.textContent === "Test log will appear here.") {
    testLog.textContent = line;
  } else {
    testLog.textContent = line + "\n\n" + testLog.textContent;
  }
}

function isPiSdkAvailable() {
  return !!window.Pi;
}

function withTimeout(promise, milliseconds, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error(timeoutMessage));
      }, milliseconds);
    })
  ]);
}

function getPaymentId(paymentData) {
  if (typeof paymentData === "string") return paymentData;
  if (paymentData && paymentData.identifier) return paymentData.identifier;
  return paymentData;
}

function randomForestMessage() {
  return FOREST_MESSAGES[Math.floor(Math.random() * FOREST_MESSAGES.length)];
}

function setPaymentDisabled(disabled) {
  sdkPaymentBtn.disabled = disabled;
  amountButtons.forEach(function (button) {
    button.disabled = disabled;
  });
  customAmount.disabled = disabled;
}

function parseAmount() {
  const custom = String(customAmount.value || "").trim().replace(",", ".");

  if (custom) {
    const parsed = Number(custom);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 10000000) / 10000000;
  }

  return selectedAmount;
}

function updateSelectedAmountLabel() {
  const amount = parseAmount();
  selectedAmountLabel.textContent = amount === null
    ? "Invalid custom amount"
    : "Selected: " + amount + " Test Pi";
}

function selectAmount(button) {
  amountButtons.forEach(function (btn) {
    btn.classList.remove("active");
  });

  button.classList.add("active");
  selectedAmount = Number(button.getAttribute("data-amount"));
  customAmount.value = "";
  updateSelectedAmountLabel();
}

async function ensurePiAuth() {
  if (currentUser && currentUser.username) {
    return currentUser;
  }

  if (isAuthenticating) {
    throw new Error("Authentication already in progress.");
  }

  if (!window.Pi || typeof window.Pi.authenticate !== "function") {
    throw new Error("Pi SDK not available. Open this app inside Pi Browser.");
  }

  isAuthenticating = true;
  showAppStatus("Checking Pi login...");

  try {
    const initReady = await withTimeout(
      window.tpfPiReady || Promise.resolve(true),
      8000,
      "Pi SDK init timed out."
    );

    if (!initReady) {
      throw new Error("Pi SDK init failed. Please reload inside Pi Browser.");
    }

    const auth = await withTimeout(
      window.Pi.authenticate(
        ["username", "payments"],
        function onIncompletePaymentFound(payment) {
          console.log("Incomplete payment found:", payment);
          logTest("Incomplete payment found", payment);
        }
      ),
      12000,
      "Pi login timed out."
    );

    if (!auth || !auth.user || !auth.user.username) {
      throw new Error("Pi login did not return a username.");
    }

    currentUser = auth.user;
    currentAccessToken = auth.accessToken || null;

    window.TPF.saveSession(currentUser.username);

    logTest("Support page login ready", {
      username: currentUser.username,
      hasAccessToken: !!currentAccessToken
    });

    return currentUser;
  } finally {
    isAuthenticating = false;
  }
}

async function createSdkPayment() {
  if (!isPiSdkAvailable()) {
    showAppStatus("Pi SDK not available. Please open this app inside Pi Browser.");
    return;
  }

  const amount = parseAmount();

  if (amount === null) {
    showAppStatus("Please enter a valid amount.");
    return;
  }

  if (!window.TPF.isLoggedIn()) {
    showAppStatus("Please login from the Home page first.");
    return;
  }

  try {
    const user = await ensurePiAuth();
    const username = user.username;

    activePayment = {
      amount: amount,
      username: username,
      startedAt: new Date().toISOString()
    };

    setPaymentDisabled(true);
    showAppStatus("Opening Testnet payment: " + amount + " Test Pi");
    logTest("Starting SDK payment", activePayment);

    const paymentData = {
      amount: amount,
      memo: "TPF Testnet",
      metadata: {
        app: "The Pioneer Forest Project",
        type: "testnet_payment_history_lab",
        paymentMode: "sdk_user_to_app",
        username: username,
        selectedAmount: amount
      }
    };

    const paymentCallbacks = {
      onReadyForServerApproval: async function (paymentDTO) {
        const paymentId = getPaymentId(paymentDTO);

        showAppStatus("Approving payment on server...");
        logTest("onReadyForServerApproval", {
          paymentId: paymentId,
          rawPaymentDTO: paymentDTO,
          activePayment: activePayment
        });

        const response = await fetch("/.netlify/functions/approve-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId: paymentId,
            amount: amount,
            username: username
          })
        });

        const data = await response.json();
        console.log("Approval response:", data);
        logTest("Approval response", data);
      },

      onReadyForServerCompletion: async function (paymentDTO, txid) {
        const paymentId = getPaymentId(paymentDTO);

        showAppStatus("Completing payment on server...");
        logTest("onReadyForServerCompletion", {
          paymentId: paymentId,
          txid: txid,
          rawPaymentDTO: paymentDTO,
          activePayment: activePayment
        });

        const response = await fetch("/.netlify/functions/complete-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId: paymentId,
            txid: txid,
            amount: amount,
            username: username
          })
        });

        const data = await response.json();
        console.log("Completion response:", data);
        logTest("Completion response", data);

        window.TPF.addHistoryItem({
          type: "testnet_payment",
          username: username,
          amount: amount,
          paymentId: paymentId,
          txid: txid,
          status: "completed",
          message: randomForestMessage(),
          dateIso: new Date().toISOString(),
          dateLabel: new Date().toLocaleString()
        }, username);

        showAppStatus("Thank you. Your local activity was updated.");
        setPaymentDisabled(false);
        window.location.href = "myforest.html";
      },

      onCancel: function (paymentDTO) {
        console.log("Payment cancelled:", paymentDTO);
        logTest("Payment cancelled", paymentDTO);
        showAppStatus("Payment cancelled.");
        setPaymentDisabled(false);
      },

      onError: function (error, paymentDTO) {
        console.error("Payment error:", error, paymentDTO);
        logTest("Payment error", {
          error: error && error.message ? error.message : error,
          paymentDTO: paymentDTO,
          activePayment: activePayment
        });
        showAppStatus("Payment error. Check logs.");
        setPaymentDisabled(false);
      }
    };

    window.Pi.createPayment(paymentData, paymentCallbacks);
  } catch (error) {
    console.error("Payment setup error:", error);
    logTest("Payment setup failed", error && error.message ? error.message : error);
    showAppStatus(error && error.message ? error.message : "Could not create payment.");
    setPaymentDisabled(false);
  }
}

amountButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    selectAmount(button);
  });
});

customAmount.addEventListener("input", updateSelectedAmountLabel);
sdkPaymentBtn.addEventListener("click", createSdkPayment);
updateSelectedAmountLabel();

window.addEventListener("load", function () {
  const storedUsername = window.TPF.getUsername();

  if (storedUsername) {
    showAppStatus("Logged in as @" + storedUsername + ". Choose an amount, then send Test Pi.");
  } else {
    showAppStatus("Please login from the Home page first.");
  }

  setTimeout(function () {
    if (!isPiSdkAvailable()) {
      showAppStatus("Pi SDK not available. Please open this app inside Pi Browser.");
    }
  }, 1000);
});
