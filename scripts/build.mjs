import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
const publicFiles=fs.readdirSync(dist,{withFileTypes:true}).filter(e=>e.isFile()&&/\.(html|js|css|svg|json|xml|png|jpg|mp4|vtt)$/.test(e.name));
const mime={jpg:'image/jpeg',mp4:'video/mp4',vtt:'text/vtt; charset=utf-8',png:'image/png',html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',xml:'application/xml',svg:'image/svg+xml',apk:'application/vnd.android.package-archive'};
// Self-contained Worker output works without provider-specific asset bindings.
const assets=Object.fromEntries(publicFiles.map(f=>['/'+f.name,{mime:mime[f.name.split('.').at(-1)],base64:fs.readFileSync(path.join(dist,f.name)).toString('base64')}]));
for(const f of ['index.html','admin.js','admin.css','pilots.js'])assets['/admin/'+f]={mime:mime[f.split('.').at(-1)],base64:fs.readFileSync(path.join(root,'admin',f)).toString('base64')};
const entry=`import {handleApi} from './server/api.mjs';
import {adminPageGate,privateHeaders} from './server/admin-auth.mjs';
const assets=${JSON.stringify(assets)};
export default {async fetch(request,env){
 const api=await handleApi(request,env);if(api)return api;
 const url=new URL(request.url),path=url.pathname;
 if(path==='/'&&url.searchParams.has('workspace')){const target=new URL('/demo',url);target.search=url.search;return Response.redirect(target.href,302);}
 const admin=path==='/admin'||path==='/admin/'||path==='/admin/index.html';
 if(admin){const gate=await adminPageGate(request,env);if(gate)return gate;}
 const asset=assets[admin?'/admin/index.html':path==='/'?'/index.html':['/demo','/demo/','/demo/aui'].includes(path)?'/demo.html':path];
 if(!asset)return new Response('Not found',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const bytes=Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0));
 const headers={'Content-Type':asset.mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Length':String(bytes.length),...(admin?privateHeaders:{})};
 if(asset.mime==='video/mp4'){
  headers['Accept-Ranges']='bytes';const range=request.headers.get('Range');
  if(range&&request.method==='GET'){
   const match=/^bytes=([0-9]*)-([0-9]*)$/.exec(range);
   let start=match&&match[1]?Number(match[1]):match&&match[2]?Math.max(0,bytes.length-Number(match[2])):NaN;
   let end=match&&match[1]&&match[2]?Math.min(bytes.length-1,Number(match[2])):bytes.length-1;
   if(!Number.isFinite(start)||start>=bytes.length||start>end)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.length}});
   headers['Content-Range']='bytes '+start+'-'+end+'/'+bytes.length;headers['Content-Length']=String(end-start+1);
   return new Response(bytes.slice(start,end+1),{status:206,headers});
  }
 }
 return new Response(request.method==='HEAD'?null:bytes,{headers});
}};`;
fs.mkdirSync(path.join(dist,'server'),{recursive:true});fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'worker-entry.mjs'},outfile:path.join(dist,'server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
if(fs.existsSync(path.join(root,'.openai/hosting.json')))fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(dist,'.openai/hosting.json'));
console.log('Built GoPlan Worker with '+publicFiles.length+' public assets. No environment secrets included.');

fs.cpSync(path.join(root,'drizzle'),path.join(dist,'.openai/drizzle'),{recursive:true});
