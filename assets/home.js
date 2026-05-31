/* TPF Home Page */
const FOREST_FACTS = [
  "🌳 Forests cover about 31% of Earth’s land area.",
  "🌧️ Forests help regulate rainfall, shade, and local water cycles.",
  "🦉 Healthy forests support most of the world’s land-based biodiversity.",
  "🍂 Fallen leaves return nutrients to the soil and feed the next cycle of life.",
  "🌿 Forests absorb a large share of human CO₂ emissions every year.",
  "🌱 Young forests grow fast, while old forests store deep memory in wood and soil.",
  "🌍 Reforestation is strongest when trees, people, soil, and transparency grow together.",
  "🪵 Dead wood is not wasted — it becomes shelter, food, and future soil.",
  "🌲 Forest roots help hold soil in place and reduce erosion.",
  "💧 Forests can help protect water sources by filtering and slowing rainfall."
];

const loginScreen = document.getElementById("loginScreen");
const homeScreen = document.getElementById("homeScreen");
const loginBtn = document.getElementById("loginBtn");
const statusEl = document.getElementById("status");
const browserWarning = document.getElementById("browserWarning");
const welcomeName = document.getElementById("welcomeName");
const forestFact = document.getElementById("forestFact");
const signOutBtn = document.getElementById("signOutBtn");

function showStatus(message) {
  statusEl.textContent = message;
}

function isPiSdkAvailable() {
  return !!window.Pi;
}

function showPiBrowserRequired() {
  browserWarning.classList.remove("hidden");
  showStatus("Pi SDK not available. Please open this app inside Pi Browser.");
  loginBtn.textContent = "Pi Browser required";
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

function showLoggedIn(username) {
  welcomeName.textContent = "Welcome back, @" + username + " 🌱";
  forestFact.textContent = FOREST_FACTS[Math.floor(Math.random() * FOREST_FACTS.length)];

  loginScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");

  if (signOutBtn) {
    signOutBtn.classList.remove("hidden");
  }
}

loginBtn.addEventListener("click", async function () {
  showStatus("Checking Pi login...");
  loginBtn.disabled = true;

  try {
    if (!window.Pi || typeof window.Pi.authenticate !== "function") {
      browserWarning.classList.remove("hidden");
      showStatus("Pi SDK not available. Please open this app inside Pi Browser.");
      loginBtn.textContent = "Pi Browser required";
      loginBtn.disabled = false;
      return;
    }

    const initReady = await withTimeout(window.tpfPiReady || Promise.resolve(true), 8000, "Pi SDK init timed out.");

    if (!initReady) {
      showStatus("Pi SDK init failed. Please reload inside Pi Browser.");
      loginBtn.disabled = false;
      return;
    }

    showStatus("Starting Pi login...");

    const auth = await withTimeout(
      window.Pi.authenticate(
        ["username", "payments"],
        function onIncompletePaymentFound(payment) {
          console.log("Incomplete payment found:", payment);
          showStatus("Incomplete payment found. Check logs before starting more tests.");
        }
      ),
      12000,
      "Pi login timed out."
    );

    if (!auth || !auth.user || !auth.user.username) {
      showStatus("Pi login did not return a username. Please try again inside Pi Browser.");
      loginBtn.disabled = false;
      return;
    }

    window.TPF.saveSession(auth.user.username);
    showLoggedIn(auth.user.username);
  } catch (error) {
    console.error("Pi login error:", error);
    browserWarning.classList.remove("hidden");
    showStatus("Pi login failed or timed out. Please open this app inside Pi Browser and try again.");
    loginBtn.textContent = "Enter with Pi Login";
    loginBtn.disabled = false;
  }
});

window.addEventListener("load", function () {
  const username = window.TPF.getUsername();

  if (username) {
    showLoggedIn(username);
  } else if (signOutBtn) {
    signOutBtn.classList.add("hidden");
  }

  setTimeout(function () {
    if (!isPiSdkAvailable()) {
      showPiBrowserRequired();
    }
  }, 1000);
});
