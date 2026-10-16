// Publish only browser assets. Server libraries, previews and test data stay out of the site root.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(dist);
for(const name of ['index.html','manifest.json','validation-key.txt','assets'])fs.cpSync(path.join(root,name),path.join(dist,name),{recursive:true});
console.log('Static app prepared in dist/. Netlify packages functions separately.');
