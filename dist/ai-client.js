import {agentContext} from './agent-context.js';
import {publicStudentContext} from './student-context.js';
const endpoint=()=>globalThis.GoPlanAndroid?'https://goplan-aui-demo-k7m9.salahiane9.chatgpt.site':'';
const accessStorage='goplan-verified-demo-access';
const pendingAdvice=new Map(),blockedAdvice=new Map();
let access='',session='',accountAccess=false;
try{access=sessionStorage.getItem(accessStorage)||'';}catch{}
function sessionId(){if(session)return session;try{session=sessionStorage.getItem('goplan-ai-session')||crypto.randomUUID();sessionStorage.setItem('goplan-ai-session',session);}catch{session=crypto.randomUUID();}return session;}
export function setAccessCode(value){const next=String(value||'').trim();if(next!==access){try{sessionStorage.removeItem(accessStorage);}catch{}}access=next;}
export function hasAccessCode(){return !!access||accountAccess;}
export async function aiStatus(){try{const r=await fetch(endpoint()+'/api/status');const status=r.ok?await r.json():{available:false,requiresAccess:true};accountAccess=status.authenticated===true||(status.authenticated===undefined&&status.requiresAccess===false);return status;}catch{return {available:false,requiresAccess:true};}}
export async function requestAdvice(stage,journey,extra={}){
 const {program,track,secondTrack,minor,choices,regularCourses,summerCourses,summers}=journey.profile;
 const body=JSON.stringify({stage,flowVersion:journey.flowVersion||5,background:journey.background,programChosen:journey.programChosen===true,changeRequest:journey.changeRequest||'',questionnaire:journey.questionnaire,goal:journey.goal,answers:journey.answers,...agentContext(journey,stage),preferredDegree:journey.preferredDegree,level:journey.level,acceleratedEligible:journey.profile.gpa!==''&&Number(journey.profile.gpa)>=3,loadEligibility:journey.profile.gpa===''?'unconfirmed':Number(journey.profile.gpa)>=3?'threshold-met':'below-threshold',profile:stage==='setup'||(['direction','question'].includes(stage)&&!journey.programChosen)?{}:{program,track,secondTrack,minor,choices,regularCourses,summerCourses,summers},...extra,...(journey.studentContext?{studentContext:publicStudentContext(journey.studentContext)}:{})});
 const key=JSON.stringify([access,sessionId(),body]);
 for(const [id,item]of blockedAdvice)if(item.expires<=Date.now())blockedAdvice.delete(id);
 if(blockedAdvice.has(key))throw blockedAdvice.get(key).error;
 if(pendingAdvice.has(key))return pendingAdvice.get(key);
 const job=(async()=>{
 // Allow the server's three-minute deadline plus time to return its result.
 const initialTargets=stage==='targets'&&['Choose company recommendations.','Choose exchange destinations and preserve the company recommendations.'].includes(journey.refinements?.targets);
 const signal=AbortSignal.timeout(initialTargets?55000:195000),requestAccess=access;
 for(let attempt=0;attempt<2;attempt++){
 let response;try{response=await fetch(endpoint()+'/api/advice',{method:'POST',headers:{'Content-Type':'application/json','X-GoPlan-Access':requestAccess,'X-GoPlan-Session':sessionId()},signal,body});}catch(e){throw Object.assign(Error(e.name==='TimeoutError'||signal.aborted?'The recommendation took longer than expected. Your answers are saved.':'The connection was interrupted. Your answers are saved; check your connection before retrying.'),{code:'ADVICE_TRANSPORT',retryable:true});}
 let data;try{data=await response.json();}catch{throw Object.assign(Error('The connection did not return a recommendation. Your answers are saved.'),{code:response.status===401?'SIGN_IN_REQUIRED':'ADVICE_TRANSPORT',status:response.status,retryable:true});}
 if(response.status===429&&data.code==='AGENT_BUSY'&&attempt<1){await new Promise(resolve=>setTimeout(resolve,Math.min(6000,Math.max(1000,Number(data.retryAfterSeconds)*1000||2000)*(1+attempt/2))));signal.throwIfAborted();continue;}
 if(response.status===401&&['ACCESS_REQUIRED','SIGN_IN_REQUIRED'].includes(data.code)){
  if(access===requestAccess){setAccessCode('');try{sessionStorage.removeItem(accessStorage);}catch{}}
  if(accountAccess){accountAccess=false;const e=Error('Your session expired. Sign in again to continue; your answers are saved.');e.code='SIGN_IN_REQUIRED';throw e;}
  const error=Error('Sign in to continue with your adviser. Your answers are saved.');error.code=data.code==='ACCESS_REQUIRED'?'ACCESS_REQUIRED':'SIGN_IN_REQUIRED';throw error;
 }
 if(!response.ok){const error=Object.assign(Error(data.error||'GoPlan could not finish the request.'),{code:data.code,retryable:data.retryable!==false});if(error.retryable===false){while(blockedAdvice.size>=100)blockedAdvice.delete(blockedAdvice.keys().next().value);blockedAdvice.set(key,{error,expires:Date.now()+600000});}throw error;}
 if(access===requestAccess&&access){try{sessionStorage.setItem(accessStorage,access);}catch{}}
 return data;
 }
 })();pendingAdvice.set(key,job);try{return await job;}finally{pendingAdvice.delete(key);}
}

export function resetAdviserSession(){session='';blockedAdvice.clear();try{sessionStorage.removeItem('goplan-ai-session');}catch{}}

// Aggregate events only: never include a plan, answer, name or device identifier.
export function trackUsage(event){
 if((!access&&!accountAccess)||!['plan_saved','plan_updated','targets_updated','excel_requested'].includes(event))return;
 void fetch(endpoint()+'/api/usage',{method:'POST',headers:{'Content-Type':'application/json','X-GoPlan-Access':access},body:JSON.stringify({event}),signal:AbortSignal.timeout(4000)}).catch(()=>{});
}

export async function feedbackRequest(action,body){
 const response=await fetch(endpoint()+'/api/feedback'+(action?'/'+action:''),{method:'POST',headers:{'Content-Type':'application/json','X-GoPlan-Access':access,'X-GoPlan-Session':sessionId()},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 let data;try{data=await response.json();}catch{throw Error('The report service did not confirm your request. Keep your text and try again.');}
 if(!response.ok){if(response.status===401)setAccessCode('');const error=Error(data.error||'The report could not be saved.');error.code=data.code;throw error;}
 if(access)try{sessionStorage.setItem(accessStorage,access);}catch{}
 return data;
}

// Reviewed matching only: settle an interrupted initial action without another
// model call or consuming a guided/global change.
export async function requestReviewedTargets(journey,{serviceAction}={}){
 const {program,track,secondTrack,minor,choices}=journey.profile;
 const response=await fetch(endpoint()+'/api/reviewed-targets',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({profile:{program,track,secondTrack,minor,choices},questionnaire:journey.questionnaire,goal:journey.goal,serviceAction}),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Your matches could not load. Please try again.'),{retryable:true});return data;
}
