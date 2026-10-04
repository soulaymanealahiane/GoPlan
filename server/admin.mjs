import {ownerIdentity,privateHeaders} from './admin-auth.mjs';
import {isAnalyticsAdmin,analyticsSnapshot} from './analytics.mjs';
import {listFeedback,reviewFeedback} from './feedback.mjs';
import {analyticsExport} from './analytics-export.mjs';
import {studentDirectory} from './accounts.mjs';
export async function adminEndpoint(request,env){
 const url=new URL(request.url),origin=request.headers.get('Origin');
 const json=(body,status=200)=>Response.json(body,{status,headers:privateHeaders});
 if(origin&&origin!==url.origin)return json({error:'Use the dashboard on this website.'},403);
 const owner=await ownerIdentity(request,env),service=isAnalyticsAdmin(request,env);
 if(!owner&&!service)return json({error:'Owner sign-in required.',code:'OWNER_REQUIRED'},401);
 if(!['/api/admin/analytics','/api/admin/export'].includes(url.pathname)&&!owner&&(!env.FEEDBACK_REVIEW_KEY||request.headers.get('Authorization')!=='Bearer '+env.FEEDBACK_REVIEW_KEY))return json({error:'Report reviewer access required.'},403);
 try{
  if(url.pathname==='/api/admin/analytics'&&request.method==='GET')return json(await analyticsSnapshot(env,url.searchParams.get('days')));
  if(url.pathname==='/api/admin/students'&&request.method==='GET')return json(await studentDirectory(env));
  if(url.pathname==='/api/admin/export'&&request.method==='GET'){
   const result=analyticsExport(await analyticsSnapshot(env,url.searchParams.get('days')),url.searchParams.get('channel')||'all',url.searchParams.get('format')||'csv');
   return new Response(result.text,{headers:{...privateHeaders,...result.headers}});
  }
  if(url.pathname==='/api/admin/reports'&&request.method==='GET')return json(await listFeedback(env));
  if(url.pathname==='/api/admin/review'&&request.method==='POST'){
   // Same-origin browser writes, or a credential-bearing local operator client.
   if(!service&&(origin!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return json({error:'Open the review from your dashboard.'},403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Use JSON.'},415);
   const reader=request.body?.getReader();if(!reader)return json({error:'Missing review.'},400);
   let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12000){await reader.cancel();return json({error:'Review too large.'},413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
   let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid review.'},400);}
   // The server assigns the reviewer; a client cannot impersonate someone else.
   return json(await reviewFeedback({...data,reviewer:owner||'GoPlan private owner console'},env));
  }
  return json({error:'Unsupported dashboard request.'},405);
 }catch(e){return json({error:e.status?e.message:'The dashboard could not load this data. Please retry.'},e.status||503);}
}
