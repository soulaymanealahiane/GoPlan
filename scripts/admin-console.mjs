import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {adminRequest} from './analytics-client.mjs';
import {analyticsExport} from '../server/analytics-export.mjs';
const host='127.0.0.1',port=Number(process.env.GOPLAN_DASHBOARD_PORT)||4320,origin=`http://${host}:${port}`;
const files=new Map([['/',['index.html','text/html']],['/admin',['index.html','text/html']],['/admin/',['index.html','text/html']],['/admin/admin.js',['admin.js','text/javascript']],['/admin/admin.css',['admin.css','text/css']],['/privacy.html',['../dist/privacy.html','text/html']]]);
export function allowedRequest(req){return req.headers.host===`${host}:${port}`&&(!req.headers.origin||req.headers.origin===origin)&&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']));}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
 if(!allowedRequest(req)){res.writeHead(403);return res.end('Private local dashboard.');}
 try{
  const url=new URL(req.url,origin),options={local:process.argv.includes('--local')};
  if(url.pathname.startsWith('/api/admin/')){
   let route=url.pathname.slice('/api/admin/'.length);if(!['analytics','reports','review','export','students'].includes(route)){res.writeHead(404);return res.end();}
   if(route==='review'){
    if(req.method!=='POST'||req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json')){res.writeHead(403);return res.end();}
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>12000){res.writeHead(413);return res.end();}}options.body=JSON.parse(body);
   }else if(req.method!=='GET'){res.writeHead(405);return res.end();}
   if(route==='export'){
    const result=analyticsExport(await adminRequest('analytics?days='+Math.max(1,Math.min(90,Number(url.searchParams.get('days'))||30)),options),url.searchParams.get('channel')||'all',url.searchParams.get('format')||'csv');
    res.writeHead(200,result.headers);return res.end(result.text);
   }
   if(route==='analytics')route+='?days='+Math.max(1,Math.min(90,Number(url.searchParams.get('days'))||30));
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(await adminRequest(route,options)));
  }
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  const asset=files.get(url.pathname);if(!asset){res.writeHead(404);return res.end('Not found');}
  const data=await readFile(new URL('../admin/'+asset[0],import.meta.url));res.setHeader('Content-Type',asset[1]+'; charset=utf-8');res.end(data);
 }catch(e){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message||'Dashboard unavailable. Please retry.'}));}
});
server.listen(port,host,()=>console.log(`Private GoPlan dashboard: ${origin}\nReads ${process.argv.includes('--local')?'local':'live'} usage. Your administrator credential stays on this computer. Ctrl+C closes this console.`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'A dashboard is already running at '+origin:'Dashboard could not start.');process.exitCode=1;});
