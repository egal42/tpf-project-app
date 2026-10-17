// Publish only browser assets. Server libraries, previews and test data stay out of the site root.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(dist);
for(const name of ['index.html','manifest.json','validation-key.txt','assets'])fs.cpSync(path.join(root,name),path.join(dist,name),{recursive:true});
// Fingerprint script/style URLs so a previously cached mobile asset cannot mask an update.
const {createHash}=require('node:crypto');
const index=path.join(dist,'index.html');
const html=fs.readFileSync(index,'utf8').replace(/(src|href)="(assets\/[^"?]+\.(?:js|css))"/g,(_,attribute,file)=>{
  const version=createHash('sha256').update(fs.readFileSync(path.join(dist,file))).digest('hex').slice(0,16);
  return attribute+'="'+file+'?v='+version+'"';
});
fs.writeFileSync(index,html);
const version=require('../package.json').version;
if(!html.includes('name="tpf-version" content="'+version+'"'))throw Error('App and package versions differ');
fs.writeFileSync(path.join(dist,'app-version.json'),JSON.stringify({schema:'tpf_app_version_v1',version}));
console.log('Static app prepared in dist/. Netlify packages functions separately.');
