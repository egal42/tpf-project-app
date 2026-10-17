/* Local only. No deployment, no secrets, no calls to Pi payment APIs. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const preview = process.argv.includes('--preview');
const port = Number(process.env.PORT || 4173);
const impact = require('../netlify/functions/impact-summary.js');
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.json':'application/json'};
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  res.setHeader('Cache-Control','no-store');
  if (url.pathname === '/.netlify/functions/impact-summary') {
    const result = await impact.handler({httpMethod:req.method});
    res.writeHead(result.statusCode,result.headers); res.end(result.body); return;
  }
  const action=url.pathname.split('/').pop();
  if (preview && ((url.pathname.startsWith('/.netlify/functions/') && ['my-forest','approve-payment','complete-payment','welcome-reward'].includes(action)) || url.pathname==='/__preview/create-payment')) {
    try {
      let body='';
      for await (const part of req) {body+=part;if(body.length>4096){res.writeHead(413);res.end();return;}}
      const event={httpMethod:req.method,headers:req.headers,body,readId:url.searchParams.get('read'),deployContext:'local-preview'};
      const result=action==='welcome-reward'?await require('./preview-reward')(event):await require('./preview-backend').handle(action,event);
      res.writeHead(result.statusCode,{...result.headers,'Cache-Control':'no-store'});res.end(result.body);
    }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Local preview storage is unavailable.'}));}
    return;
  }
  if (url.pathname.startsWith('/.netlify/functions/')) {
    res.writeHead(409,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'Use the local simulated preview, or the configured Pi environment. This local server does not connect to real Pi accounts.'})); return;
  }
  if (url.pathname === '/__preview/sdk.js' && preview) {
    res.setHeader('Content-Type','text/javascript');
    res.end(fs.readFileSync(path.join(__dirname,'preview-sdk.js'))); return;
  }
  let relative;
  try { relative = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  const file = path.resolve(root,'.'+(relative === '/' ? '/index.html' : relative));
  const allowed = relative === '/' || relative === '/index.html' || relative === '/manifest.json' || /^\/assets\/[a-zA-Z0-9._-]+$/.test(relative);
  if (!allowed || !file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
  let content = fs.readFileSync(file);
  if (preview && file.endsWith('index.html')) {
    content = content.toString().replace('https://sdk.minepi.com/pi-sdk.js','/__preview/sdk.js').replace('<body>','<body><aside class="preview-banner" role="note">LOCAL SIMULATION · Login and Test Pi payments are simulated. Account records persist on this computer. No Pi transfer occurs. Impact figures use the real public TPF summary.</aside>');
  }
  res.end(content);
});
server.listen(port,'127.0.0.1',() => console.log('TPF '+(preview ? 'SIMULATED preview' : 'SDK integration view')+' at http://127.0.0.1:'+port+' — local only, no deployment.'));
