/* Identical SDK version/sandbox settings to v0.9.1b; do not block the welcome screen on SDK download. */
window.tpfPiReady = new Promise(resolve => {
  let started = false;
  const timeout = setTimeout(() => resolve(false),8000);
  function initialize() {
    if (started || !window.Pi) return;
    started = true;
    Promise.resolve().then(() => window.Pi.init({version:'2.0',sandbox:true}))
      .then(() => {clearTimeout(timeout);resolve(true);})
      .catch(() => {clearTimeout(timeout);resolve(false);});
  }
  if (window.Pi) initialize();
  else {
    document.getElementById('pi-sdk').addEventListener('load',initialize,{once:true});
    document.getElementById('pi-sdk').addEventListener('error',() => {clearTimeout(timeout);resolve(false);},{once:true});
  }
});
