import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
const publicFiles=fs.readdirSync(dist,{withFileTypes:true}).filter(e=>e.isFile()&&/\.(html|js|css|svg|json|xml|png)$/.test(e.name));
const mime={png:'image/png',html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',xml:'application/xml',svg:'image/svg+xml',apk:'application/vnd.android.package-archive'};
// Self-contained Worker output works without provider-specific asset bindings.
const assets=Object.fromEntries(publicFiles.map(f=>['/'+f.name,{mime:mime[f.name.split('.').at(-1)],base64:fs.readFileSync(path.join(dist,f.name)).toString('base64')}]));
for(const f of ['index.html','admin.js','admin.css'])assets['/admin/'+f]={mime:mime[f.split('.').at(-1)],base64:fs.readFileSync(path.join(root,'admin',f)).toString('base64')};
const entry=`import {handleApi} from './server/api.mjs';
import {adminPageGate,privateHeaders} from './server/admin-auth.mjs';
const assets=${JSON.stringify(assets)};
export default {async fetch(request,env){
 const api=await handleApi(request,env);if(api)return api;
 const path=new URL(request.url).pathname,admin=path==='/admin'||path==='/admin/'||path==='/admin/index.html';
 if(admin){const gate=await adminPageGate(request,env);if(gate)return gate;}
 const asset=assets[admin?'/admin/index.html':path==='/'?'/index.html':path];
 if(!asset)return new Response('Not found',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset.mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff',...(admin?privateHeaders:{})}});
}};`;
fs.mkdirSync(path.join(dist,'server'),{recursive:true});fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'worker-entry.mjs'},outfile:path.join(dist,'server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
if(fs.existsSync(path.join(root,'.openai/hosting.json')))fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(dist,'.openai/hosting.json'));
console.log('Built GoPlan Worker with '+publicFiles.length+' public assets. No environment secrets included.');

fs.cpSync(path.join(root,'drizzle'),path.join(dist,'.openai/drizzle'),{recursive:true});
