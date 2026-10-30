import {rosterSummary,replaceRoster,appendRoster} from './university-access.mjs';
import {ownerIdentity,privateHeaders} from './admin-auth.mjs';
import {isAnalyticsAdmin,analyticsSnapshot} from './analytics.mjs';
import {analyticsExport} from './analytics-export.mjs';
import {studentDirectory} from './accounts.mjs';
import {resetStudentTest,undoStudentTestReset} from './test-reset.mjs';
import {notifyPartnership} from './partnership-mail.mjs';
export async function adminEndpoint(request,env,options={}){
 const url=new URL(request.url),origin=request.headers.get('Origin');
 const json=(body,status=200)=>Response.json(body,{status,headers:privateHeaders});
 if(origin&&origin!==url.origin)return json({error:'Use the dashboard on this website.'},403);
 const owner=await ownerIdentity(request,env),service=isAnalyticsAdmin(request,env);
 if(!owner&&!service)return json({error:'Owner sign-in required.',code:'OWNER_REQUIRED'},401);
 if(!['/api/admin/analytics','/api/admin/export'].includes(url.pathname)&&!owner&&(!env.FEEDBACK_REVIEW_KEY||request.headers.get('Authorization')!=='Bearer '+env.FEEDBACK_REVIEW_KEY))return json({error:'Owner access required.'},403);
 try{
  if(url.pathname==='/api/admin/partnerships/retry-email'){
   if(!owner)return json({error:'Owner access required.'},403);
   if(request.method!=='POST'||origin!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Open this action from GoPlan.'},403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Use JSON.'},415);
   const raw=await request.text();if(raw.length>100)return json({error:'Request too large.'},413);
   let data;try{data=JSON.parse(raw);}catch{return json({error:'Invalid request.'},400);}
   if(!/^[a-f0-9-]{36}$/i.test(data?.id||''))return json({error:'Choose an inquiry.'},400);
   return json(await notifyPartnership(data.id,env,options));
  }
  if(['/api/admin/students/reset-test','/api/admin/students/undo-reset'].includes(url.pathname)){
   if(!owner)return json({error:'Owner sign-in required.'},403);
   if(request.method!=='POST'||origin!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Open this action from GoPlan.'},403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Use JSON.'},415);
   const reader=request.body?.getReader();if(!reader)return json({error:'Missing request.'},400);let chunks=[],size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();return json({error:'Request too large.'},413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid request.'},400);}
   if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'Invalid request.'},400);
   return json(await (url.pathname.endsWith('/undo-reset')?undoStudentTestReset:resetStudentTest)(env,owner,data));
  }
  if(['/api/admin/roster','/api/admin/partnerships'].includes(url.pathname)){
   if(!owner)return json({error:'Owner sign-in required.'},403);
   if(url.pathname.endsWith('/partnerships')&&request.method==='GET'){await env.DB.prepare('DELETE FROM partnership_inquiries WHERE created_at<?').bind(Date.now()-180*86400000).run();return json({inquiries:(await env.DB.prepare('SELECT id,name,email,university,message,created_at,offer_json,email_state,email_attempts,email_updated_at,email_error FROM partnership_inquiries ORDER BY created_at DESC LIMIT 200').all()).results});}
   if(url.pathname.endsWith('/roster')&&request.method==='GET')return json(await rosterSummary(env));
   if(url.pathname.endsWith('/roster')&&request.method==='POST'){if(origin!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Open this action from GoPlan.'},403);if(!request.headers.get('Content-Type')?.startsWith('text/plain'))return json({error:'Upload a plain email list.'},415);const reader=request.body?.getReader();let bytes=0,chunks=[];if(!reader)return json({error:'Missing email list.'},400);while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>500000){await reader.cancel();return json({error:'Email list too large.'},413);}chunks.push(value);}const all=new Uint8Array(bytes);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}const mode=url.searchParams.get('mode')||'replace';if(!['append','replace'].includes(mode))return json({error:'Choose append or replace.'},400);return json(await (mode==='append'?appendRoster:replaceRoster)(new TextDecoder().decode(all),env));}
   return json({error:'Unsupported request.'},405);
  }
  if(url.pathname==='/api/admin/analytics'&&request.method==='GET')return json(await analyticsSnapshot(env,url.searchParams.get('days')));
  if(url.pathname==='/api/admin/students'&&request.method==='GET')return json(await studentDirectory(env));
  if(url.pathname==='/api/admin/export'&&request.method==='GET'){
   const result=analyticsExport(await analyticsSnapshot(env,url.searchParams.get('days')),url.searchParams.get('channel')||'all',url.searchParams.get('format')||'csv');
   return new Response(result.text,{headers:{...privateHeaders,...result.headers}});
  }
  if(['/api/admin/reports','/api/admin/review'].includes(url.pathname))return json({error:'Mistake reporting is no longer available.',code:'FEATURE_REMOVED'},410);
  return json({error:'Unsupported dashboard request.'},405);
 }catch(e){return json({error:e.status?e.message:'The dashboard could not load this data. Please retry.'},e.status||503);}
}
