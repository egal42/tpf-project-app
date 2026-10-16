// Read-only bridge: the website's existing public endpoint has no CORS header.
// CDN caching + warm-process caching + coalescing keep database reads infrequent.
const { validSummary } = require('../../assets/impact-contract.js');
const SOURCE = 'https://thepioneerforest.org/api/website-data';
const TTL = 6 * 60 * 60 * 1000;
let saved = null, pending = null;
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'public, max-age=3600',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=21600, stale-while-revalidate=3600'
};
exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') return { statusCode:405, headers:{Allow:'GET'}, body:'Method not allowed' };
  try {
    if (!saved || Date.now() - saved.at >= TTL) {
      if (!pending) pending = (async () => {
        const response = await fetch(SOURCE, { signal:AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Public summary unavailable');
        const data = await response.json();
        if (!validSummary(data)) throw new Error('Invalid public summary');
        saved = { at:Date.now(), data:{schema:data.schema,revision:data.revision,publishedAt:data.publishedAt,impact:data.impact} };
      })().finally(() => { pending = null; });
      await pending;
    }
    // A warm-process result may already be hours old: never renew its full CDN lifetime.
    const remaining = Math.max(1,Math.ceil((TTL - (Date.now()-saved.at))/1000));
    const cacheHeaders = {...headers,'Cache-Control':'public, max-age='+Math.min(3600,remaining),'Netlify-CDN-Cache-Control':'public, durable, s-maxage='+remaining};
    return { statusCode:200, headers:cacheHeaders, body:JSON.stringify({ ...saved.data, fetchedAt:new Date(saved.at).toISOString(), source:SOURCE }) };
  } catch {
    // Do not silently mark stale server data as fresh. The client labels its saved fallback.
    return { statusCode:503, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body:JSON.stringify({error:'Public impact summary temporarily unavailable'}) };
  }
};
