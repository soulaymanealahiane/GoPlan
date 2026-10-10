import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {localDatabase} from './server/local-db.mjs';
import {handleApi} from './server/api.mjs';
try{process.loadEnvFile(path.resolve(import.meta.dirname,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
const DB=localDatabase(path.resolve(import.meta.dirname,'.sites-runtime/feedback.sqlite'));
const port=Number(process.env.GOPLAN_PORT||4317);
const root=path.resolve(import.meta.dirname,'dist');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.xml':'application/xml','.apk':'application/vnd.android.package-archive'};
http.createServer(async(req,res)=>{try{
 const origin=`http://${req.headers.host==='localhost:'+port?'localhost':'127.0.0.1'}:${port}`,url=new URL(req.url,origin);
 if(url.pathname.startsWith('/api/')){
  const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
  const reply=await handleApi(request,{...process.env,DB},{clientAddress:req.socket.remoteAddress});
  const responseHeaders=Object.fromEntries(reply.headers);const setCookies=reply.headers.getSetCookie();if(setCookies.length)responseHeaders['set-cookie']=setCookies;res.writeHead(reply.status,responseHeaders);return res.end(Buffer.from(await reply.arrayBuffer()));
 }
 const rel=decodeURIComponent(url.pathname),file=path.resolve(root,'.'+(rel==='/'&&url.searchParams.has('workspace')?'/demo.html':rel==='/'?'/index.html':['/demo','/demo/','/demo/aui'].includes(rel)?'/demo.html':rel));
 if(!file.startsWith(root+path.sep)||/^\/(?:server|\.openai)\//.test(rel)){res.writeHead(403);return res.end();}
 const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`GoPlan ready: http://127.0.0.1:${port}`));
