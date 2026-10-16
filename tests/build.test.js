const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
test('Publish bundle fingerprints every local script/style and excludes private/local source',()=>{
 execFileSync(process.execPath,['scripts/build.js']);
 const html=fs.readFileSync('dist/index.html','utf8');
 const urls=[...html.matchAll(/(?:src|href)="(assets\/[^"?]+\.(?:js|css))(?:\?v=([^"#]+))?"/g)];assert(urls.length>=4);
 for(const [,file,version] of urls){assert.equal(version,createHash('sha256').update(fs.readFileSync(path.join('dist',file))).digest('hex').slice(0,16));}
 for(const name of ['lib','scripts','tests','node_modules','.local-preview'])assert.equal(fs.existsSync(path.join('dist',name)),false);
 assert.deepEqual(fs.readFileSync('dist/validation-key.txt'),fs.readFileSync('validation-key.txt'));
 assert(html.includes('content="'+require('../package.json').version+'"'));
});
