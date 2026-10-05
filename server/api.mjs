import {authEndpoint,accountIdentity} from './auth.mjs';
import {advise} from './advisor.mjs';
import {feedbackEndpoint,approvedCorrections} from './feedback.mjs';
import {EVENTS,channelFor,recordSafely,isAnalyticsAdmin,analyticsSnapshot} from './analytics.mjs';
import {adminEndpoint} from './admin.mjs';
import {accountEndpoint} from './accounts.mjs';

const pending=new Map(),recent=new Map(),activeSessions=new Map();
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const LIVE='https://goplan-aui-demo-k7m9.salahiane9.chatgpt.site';
const CUSTOM='https://planwithgoplan.com';
const acceptedOrigins=new Set([LIVE,CUSTOM,'https://app.goplan.local','http://127.0.0.1:4317','http://localhost:4317']);
function reply(body,status=200,origin=''){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(acceptedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});}
export async function handleApi(request,env,options={}){
 const path=new URL(request.url).pathname,origin=request.headers.get('Origin')||'';
 if(!path.startsWith('/api/'))return null;
 if(path.startsWith('/api/auth/'))return authEndpoint(request,env,options);
 if(path==='/api/account'||path.startsWith('/api/account/'))return accountEndpoint(request,env);
 if(path.startsWith('/api/admin/'))return adminEndpoint(request,env);
 if(origin&&!acceptedOrigins.has(origin))return reply({error:'This origin cannot use the GoPlan adviser.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-GoPlan-Access, X-GoPlan-Session','Access-Control-Max-Age':'600','Vary':'Origin'}});
 let signedIn;try{signedIn=await accountIdentity(request,env);}catch{return reply({error:'Account connection unavailable. Please retry.'},503,origin);}
 if(signedIn&&!['GET','HEAD'].includes(request.method)&&origin!==new URL(request.url).origin)return reply({error:'Open this action from GoPlan.'},403,origin);
 if(path==='/api/status'&&request.method==='GET')return reply({available:!!(env.GROQ_API_KEY&&(signedIn||env.AI_ACCESS_CODE)),provider:'groq',model:env.GROQ_MODEL||'openai/gpt-oss-120b',requiresAccess:!signedIn,feedbackAvailable:!!env.DB},200,origin);
 const isFeedback=path==='/api/feedback'||path.startsWith('/api/feedback/')||path.startsWith('/api/review/');
 const isEvent=path==='/api/usage';
 if(path!=='/api/advice'&&!isFeedback&&!isEvent)return reply({error:'Not found'},404,origin);
 if(request.method!=='POST')return reply({error:'Use POST.'},405,origin);
 if(!isFeedback&&(!env.GROQ_API_KEY||(!signedIn&&!env.AI_ACCESS_CODE)))return reply({error:'AI guidance is not connected yet. Your GoPlan team needs to activate it. You can still build and save a plan manually.',code:'AI_NOT_CONFIGURED'},503,origin);
 if(!isFeedback&&!signedIn&&request.headers.get('X-GoPlan-Access')!==env.AI_ACCESS_CODE)return reply({error:'Enter the demo access code from the GoPlan team.',code:'ACCESS_REQUIRED'},401,origin);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'Use JSON.'},415,origin);
 const bytes=Number(request.headers.get('Content-Length'));if(bytes>40000)return reply({error:'Request too large.'},413,origin);
 const reader=request.body?.getReader();let chunks=[],size=0;
 if(!reader)return reply({error:'Missing request.'},400,origin);
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>40000){await reader.cancel();return reply({error:'Request too large.'},413,origin);}chunks.push(value);}
 const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
 let data;try{data=JSON.parse(new TextDecoder().decode(all));}catch{return reply({error:'Invalid request.'},400,origin);}
 if(isEvent){if(!data||!EVENTS.has(data.event)||Object.keys(data).some(k=>k!=='event'))return reply({error:'Unknown usage event.'},400,origin);await recordSafely(env,{kind:'event',stage:data.event,channel:channelFor(origin)});return reply({accepted:true},200,origin);}
 if(isFeedback){try{return reply(await feedbackEndpoint(path,data,request,env,signedIn),200,origin);}catch(e){return reply({error:e.status?e.message:'Mistake reporting is unavailable. Your report was not confirmed; keep your text and retry.',code:e.status===401?'ACCESS_REQUIRED':'FEEDBACK_ERROR'},e.status||503,origin);}}
 let corrections=[];try{corrections=await approvedCorrections(env);}catch{console.warn('Feedback library unavailable for this request.');}
 // A normal sequential journey has no hourly allowance. Coalesce duplicate clicks
 // and bound simultaneous paid work instead. All maps are per server instance.
 const session=request.headers.get('X-GoPlan-Session');
 const identity=signedIn?.id||(session&&/^[a-zA-Z0-9-]{16,80}$/.test(session)?session:request.headers.get('CF-Connecting-IP')||options.clientAddress||'demo');
 const scope=await digest(JSON.stringify([env.GROQ_API_KEY,env.AI_ACCESS_CODE,env.GROQ_MODEL,env.GROQ_RESEARCH_MODEL,env.GROQ_REASONING_EFFORT,env.GROQ_WEB_RESEARCH,identity]));
 const key=await digest(scope+JSON.stringify([data,corrections])),now=Date.now();
 for(const [id,item] of recent)if(item.expires<=now)recent.delete(id);
 if(recent.has(key)){await recordSafely(env,{stage:data.stage,channel:channelFor(origin),outcome:'cached'});return reply(recent.get(key).value,200,origin);}
 let job=pending.get(key);
 if(!job){
  if((activeSessions.get(scope)||0)>=2||pending.size>=8)return reply({error:'The adviser is finishing other requests. Retrying automatically.',code:'AGENT_BUSY',retryAfterSeconds:2},429,origin);
  activeSessions.set(scope,(activeSessions.get(scope)||0)+1);
  const metric={stage:data.stage,channel:channelFor(origin),outcome:'error',providerCalls:0,inputTokens:0,outputTokens:0};
  const measuredFetch=async(...args)=>{metric.providerCalls++;const response=await (options.fetcher||fetch)(...args);try{const p=await response.clone().json();metric.inputTokens+=p.usage?.input_tokens??p.usage?.prompt_tokens??0;metric.outputTokens+=p.usage?.output_tokens??p.usage?.completion_tokens??0;}catch{}return response;};
  job=Promise.resolve().then(()=>advise(data,{...env,GOPLAN_REVIEWED_CORRECTIONS:corrections},measuredFetch)).then(value=>{
   metric.outcome='success';
   while(recent.size>=200)recent.delete(recent.keys().next().value);
   recent.set(key,{value,expires:Date.now()+600000});return value;
  }).finally(async()=>{pending.delete(key);const n=activeSessions.get(scope)-1;if(n)activeSessions.set(scope,n);else activeSessions.delete(scope);metric.durationMs=Date.now()-now;await recordSafely(env,metric);});
  pending.set(key,job);
 }
 try{return reply(await job,200,origin);}catch(e){return reply({error:e.name==='TimeoutError'?'GoPlan took too long to respond. Your choices are unchanged; please try again.':e.message||'GoPlan could not finish that request.'},e.status||422,origin);}
}
