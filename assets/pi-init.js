/* TPF Pi SDK Init - Testnet only */
window.tpfPiReady = Promise.resolve(false);

try {
  if (window.Pi && typeof window.Pi.init === "function") {
    window.tpfPiReady = Promise.resolve(
      window.Pi.init({
        version: "2.0",
        sandbox: true
      })
    ).then(function () {
      return true;
    }).catch(function (error) {
      console.error("Pi init error:", error);
      return false;
    });
  }
} catch (error) {
  console.error("Pi init setup error:", error);
}
