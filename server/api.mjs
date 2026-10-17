import {serviceEndpoint,reserveServiceCall} from './service-allowance.mjs';
import {partnershipEndpoint} from './partnerships.mjs';
import {rosterMode} from './university-access.mjs';
import {authEndpoint,accountIdentity} from './auth.mjs';
import {advise} from './advisor.mjs';
import {feedbackEndpoint,approvedCorrections} from './feedback.mjs';
import {EVENTS,channelFor,recordSafely,isAnalyticsAdmin,analyticsSnapshot} from './analytics.mjs';
import {adminEndpoint} from './admin.mjs';
import {accountEndpoint} from './accounts.mjs';
import {acquireAdviserLease,adviserFailure,rememberAdviserFailure} from './adviser-lease.mjs';
import {REQUEST_BUDGET_USD,REQUEST_TIMEOUT_MS} from './request-policy.mjs';
import {RESEARCH_TIMEOUT_MS,RESEARCH_TOOL_CALLS} from './research.mjs';

const pending=new Map(),recent=new Map(),failures=new Map(),activeSessions=new Map();
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const LIVE='https://goplan-aui-demo-k7m9.salahiane9.chatgpt.site';
const CUSTOM='https://planwithgoplan.com';
const timeoutMessage='This recommendation took longer than three minutes. Your answers are saved; you can keep working manually without restarting your plan.';
const acceptedOrigins=new Set([LIVE,CUSTOM,'https://app.goplan.local','http://127.0.0.1:4317','http://localhost:4317']);
function reply(body,status=200,origin=''){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(acceptedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});}
export async function handleApi(request,env,options={}){
 const path=new URL(request.url).pathname,origin=request.headers.get('Origin')||'';
 if(!path.startsWith('/api/'))return null;
 if(path==='/api/partnerships')return partnershipEndpoint(request,env,options);
 if(path.startsWith('/api/auth/'))return authEndpoint(request,env,options);
 if(path==='/api/account'||path.startsWith('/api/account/'))return accountEndpoint(request,env);
 if(path.startsWith('/api/admin/'))return adminEndpoint(request,env);
 if(origin&&!acceptedOrigins.has(origin))return reply({error:'This origin cannot use the GoPlan adviser.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-GoPlan-Access, X-GoPlan-Session','Access-Control-Max-Age':'600','Vary':'Origin'}});
 let signedIn;try{signedIn=await accountIdentity(request,env);}catch{return reply({error:'Account connection unavailable. Please retry.'},503,origin);}
 if(signedIn&&!['GET','HEAD'].includes(request.method)&&origin!==new URL(request.url).origin)return reply({error:'Open this action from GoPlan.'},403,origin);
 if(rosterMode(env)&&!signedIn&&path!=='/api/status')return reply({error:'Sign in with an approved university email.',code:'ACCESS_REQUIRED'},401,origin);
 if(path==='/api/service'||path.startsWith('/api/service/'))return serviceEndpoint(request,env,signedIn);
 if(path==='/api/status'&&request.method==='GET')return reply({available:!!env.OPENAI_API_KEY,provider:'openai',model:env.OPENAI_MODEL||'gpt-6.1-sol',requiresAccess:false,requiresSignIn:!signedIn,authenticated:!!signedIn,feedbackAvailable:!!env.DB},200,origin);
 const isFeedback=path==='/api/feedback'||path.startsWith('/api/feedback/')||path.startsWith('/api/review/');
 const isEvent=path==='/api/usage';
 if(path!=='/api/advice'&&!isFeedback&&!isEvent)return reply({error:'Not found'},404,origin);
 if(request.method!=='POST')return reply({error:'Use POST.'},405,origin);
 if(!isFeedback&&!env.OPENAI_API_KEY)return reply({error:'The adviser is temporarily unavailable. Your answers are saved.',code:'AI_NOT_CONFIGURED'},503,origin);
 if(!isFeedback&&!signedIn)return reply({error:'Sign in to continue with your adviser. No demo code is needed.',code:'SIGN_IN_REQUIRED'},401,origin);
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
 // Durable service receipts enforce package limits. These instance-local maps
 // coalesce duplicate clicks and bound simultaneous paid work.
 const session=request.headers.get('X-GoPlan-Session');
 const identity=signedIn?.id||(session&&/^[a-zA-Z0-9-]{16,80}$/.test(session)?session:request.headers.get('CF-Connecting-IP')||options.clientAddress||'demo');
 const scope=await digest(JSON.stringify([env.OPENAI_API_KEY,env.AI_ACCESS_CODE,env.OPENAI_MODEL,env.OPENAI_RESEARCH_MODEL,env.OPENAI_REASONING_EFFORT,env.OPENAI_RESEARCH_REASONING_EFFORT,env.OPENAI_WEB_RESEARCH,env.OPENAI_DIRECTION_RESEARCH,identity]));
 // Earlier budget/timeout failures must not block work under revised limits.
 const key=await digest('service-v1:'+scope+JSON.stringify([data,corrections,REQUEST_BUDGET_USD,REQUEST_TIMEOUT_MS,RESEARCH_TIMEOUT_MS,RESEARCH_TOOL_CALLS])),now=Date.now();
 for(const [id,item] of recent)if(item.expires<=now)recent.delete(id);
 for(const [id,item] of failures)if(item.expires<=now)failures.delete(id);
 if(failures.has(key)){const failure=failures.get(key);return reply(failure.value,failure.status,origin);}
 if(recent.has(key)){await recordSafely(env,{stage:data.stage,channel:channelFor(origin),outcome:'cached'});return reply(recent.get(key).value,200,origin);}
 let job=pending.get(key);
 if(!job){
  if((activeSessions.get(scope)||0)>=1||pending.size>=8)return reply({error:'The adviser is finishing your previous request. Wait for it before requesting another recommendation.',code:'AGENT_BUSY',retryAfterSeconds:2},429,origin);
  activeSessions.set(scope,(activeSessions.get(scope)||0)+1);
  const metric={stage:data.stage,channel:channelFor(origin),outcome:'error',providerCalls:0,inputTokens:0,outputTokens:0};
  const measuredFetch=async(...args)=>{const provider=new URL(args[0]).origin==='https://api.openai.com';if(provider)metric.providerCalls++;const response=await (options.fetcher||fetch)(...args);if(provider)try{const p=await response.clone().json();metric.inputTokens+=p.usage?.input_tokens||0;metric.outputTokens+=p.usage?.output_tokens||0;}catch{}return response;};
  let lease,serviceCall;
  job=Promise.resolve().then(async()=>{
   let blocked;
   try{blocked=await adviserFailure(env.DB,key);if(!blocked)lease=await acquireAdviserLease(env.DB,scope);}catch{throw Object.assign(Error('The adviser could not safely start this request. Your answers are saved; please retry.'),{status:503});}
   if(blocked)throw Object.assign(Error(blocked.code==='ADVISER_TIMEOUT'?timeoutMessage:'GoPlan could not finish this recommendation. Your answers and choices are saved; you can keep working manually.'),{status:blocked.code==='ADVISER_TIMEOUT'?504:422,code:blocked.code,retryable:false});
   if(!lease)throw Object.assign(Error('The adviser is finishing your previous request. Wait a moment before retrying.'),{status:429,code:'AGENT_BUSY'});
   serviceCall=await reserveServiceCall(env.DB,identity,data.serviceAction,data.stage,key);
   if(serviceCall.cached){if(serviceCall.status!==200)throw Object.assign(Error(serviceCall.cached.error),{status:serviceCall.status,code:serviceCall.cached.code});return serviceCall.cached;}
   const input={...data};delete input.serviceAction;
   return advise(input,{...env,GOPLAN_REVIEWED_CORRECTIONS:corrections},measuredFetch);
  }).then(async value=>{
   if(serviceCall?.finish)await serviceCall.finish(value,200);
   metric.outcome='success';
   while(recent.size>=200)recent.delete(recent.keys().next().value);
   // A temporary research failure must not pin the next retry to old evidence.
   if(!data.researchOnly&&!['unavailable','partial'].includes(value.research?.status))recent.set(key,{value,expires:Date.now()+600000});return value;
  }).catch(async error=>{
   if(error.name==='TimeoutError')error=Object.assign(Error(timeoutMessage),{name:'TimeoutError',status:504,code:'ADVISER_TIMEOUT',retryable:false});
   if(serviceCall?.finish)await serviceCall.finish({error:error.message||'This request could not finish.',code:error.code,...(error.retryable===false?{retryable:false}:{})},error.status||(error.name==='TimeoutError'?504:422));
   if(['REQUEST_BUDGET','REQUEST_TOO_LARGE','RESPONSE_INCOMPLETE','ADVISER_TIMEOUT'].includes(error.code)){
    while(failures.size>=200)failures.delete(failures.keys().next().value);
    failures.set(key,{value:{error:error.name==='TimeoutError'?timeoutMessage:error.message,code:error.code,retryable:false},status:error.status||(error.name==='TimeoutError'?504:422),expires:Date.now()+600000});
    try{await rememberAdviserFailure(env.DB,key,error.code);}catch{console.warn('Adviser failure persistence unavailable.');}
   }
   throw error;
  }).finally(async()=>{try{await lease?.release();}catch{console.warn('Adviser lease cleanup deferred to expiry.');}pending.delete(key);const n=activeSessions.get(scope)-1;if(n)activeSessions.set(scope,n);else activeSessions.delete(scope);metric.durationMs=Date.now()-now;await recordSafely(env,metric);});
  pending.set(key,job);
 }
 try{return reply(await job,200,origin);}catch(e){return reply({error:e.name==='TimeoutError'?timeoutMessage:e.message||'GoPlan could not finish that request.',...(e.code?{code:e.code}:{}),...(e.retryable===false?{retryable:false}:{})},e.status||(e.name==='TimeoutError'?504:422),origin);}
}
