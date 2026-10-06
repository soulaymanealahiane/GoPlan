import {agentContext} from './agent-context.js';
const endpoint=()=>globalThis.GoPlanAndroid?'https://goplan-aui-demo-k7m9.salahiane9.chatgpt.site':'';
const accessStorage='goplan-verified-demo-access';
let access='',session='',accountAccess=false;
try{access=sessionStorage.getItem(accessStorage)||'';}catch{}
function sessionId(){if(session)return session;try{session=sessionStorage.getItem('goplan-ai-session')||crypto.randomUUID();sessionStorage.setItem('goplan-ai-session',session);}catch{session=crypto.randomUUID();}return session;}
export function setAccessCode(value){const next=String(value||'').trim();if(next!==access){try{sessionStorage.removeItem(accessStorage);}catch{}}access=next;}
export function hasAccessCode(){return !!access||accountAccess;}
export async function aiStatus(){try{const r=await fetch(endpoint()+'/api/status');const status=r.ok?await r.json():{available:false,requiresAccess:true};accountAccess=status.requiresAccess===false;return status;}catch{return {available:false,requiresAccess:true};}}
export async function requestAdvice(stage,journey,extra={}){
 const {program,track,secondTrack,minor,choices,regularCourses,summerCourses,summers}=journey.profile;
 const body=JSON.stringify({stage,flowVersion:journey.flowVersion||5,background:journey.background,programChosen:journey.programChosen===true,changeRequest:journey.changeRequest||'',questionnaire:journey.questionnaire,goal:journey.goal,answers:journey.answers,...agentContext(journey,stage),preferredDegree:journey.preferredDegree,level:journey.level,acceleratedEligible:journey.profile.gpa!==''&&Number(journey.profile.gpa)>=3,profile:stage==='setup'||(['direction','question'].includes(stage)&&!journey.programChosen)?{}:{program,track,secondTrack,minor,choices,regularCourses,summerCourses,summers},...extra});
 const signal=AbortSignal.timeout(480000),requestAccess=access;
 for(let attempt=0;attempt<8;attempt++){
 const response=await fetch(endpoint()+'/api/advice',{method:'POST',headers:{'Content-Type':'application/json','X-GoPlan-Access':requestAccess,'X-GoPlan-Session':sessionId()},signal,body});
 let data;try{data=await response.json();}catch{throw Error('The AI service is unavailable. Your saved plan is unchanged.');}
 if(response.status===429&&data.code==='AGENT_BUSY'&&attempt<7){await new Promise(resolve=>setTimeout(resolve,Math.min(6000,Math.max(1000,Number(data.retryAfterSeconds)*1000||2000)*(1+attempt/2))));signal.throwIfAborted();continue;}
 if(response.status===401&&data.code==='ACCESS_REQUIRED'){
  if(access===requestAccess){setAccessCode('');try{sessionStorage.removeItem(accessStorage);}catch{}}
  if(accountAccess){accountAccess=false;const e=Error('Your session expired. Sign in again to continue; your answers are saved.');e.code='SIGN_IN_REQUIRED';throw e;}
  const error=Error('That demo code was not accepted. Enter the code for this version of GoPlan in the demo access field, then retry. Your answers are saved.');error.code='ACCESS_REQUIRED';throw error;
 }
 if(!response.ok)throw Error(data.error||'GoPlan could not finish the request.');
 if(access===requestAccess&&access){try{sessionStorage.setItem(accessStorage,access);}catch{}}
 return data;
 }
}

export function resetAdviserSession(){session='';try{sessionStorage.removeItem('goplan-ai-session');}catch{}}

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
