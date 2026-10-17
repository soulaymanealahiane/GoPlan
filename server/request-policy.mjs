import {AI_REQUEST_BUDGET} from '../dist/service-policy.js';
// One budget and deadline cover discovery, extraction, advice and repairs.
export const REQUEST_TIMEOUT_MS=180000;
export const REQUEST_BUDGET_USD=AI_REQUEST_BUDGET;
const prices={'gpt-6.1-sol':[2,10],'gpt-6-luna':[0.1,0.5]};
export function boundedRequest(env,fetcher=fetch,{timeoutMs=REQUEST_TIMEOUT_MS}={}){
 const controller=new AbortController(),started=Date.now();let spent=0;
 const timer=setTimeout(()=>controller.abort(new DOMException('GoPlan response deadline','TimeoutError')),timeoutMs);
 const budget=REQUEST_BUDGET_USD;
 const bounded=async(url,init={})=>{
  controller.signal.throwIfAborted();
  const signal=AbortSignal.any([controller.signal,...(init.signal?[init.signal]:[])]);
  if(new URL(url).origin!=='https://api.openai.com')return fetcher(url,{...init,signal});
  const body=JSON.parse(init.body),baseRates=prices[body.model];
  if(!baseRates||!['default','fast',undefined].includes(body.service_tier))throw Object.assign(Error('This model or processing tier has no verified GoPlan spending limit.'),{status:503});
  const rates=baseRates.map(rate=>rate*(body.service_tier==='fast'?2:1));
  // Count the actual prompt and schema before committing to a paid generation.
  const countBody=Object.fromEntries(['model','input','instructions','tools','tool_choice','text'].filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));
  let inputTokens;
  if(typeof env.GOPLAN_TOKEN_COUNTER==='function')inputTokens=await env.GOPLAN_TOKEN_COUNTER(countBody);
  else{
   const count=await fetcher('https://api.openai.com/v1/responses/input_tokens',{...init,signal,body:JSON.stringify(countBody)});
   if(!count.ok)return count;
   inputTokens=(await count.json()).input_tokens;
  }
  if(!Number.isInteger(inputTokens)||inputTokens<0)throw Object.assign(Error('The adviser could not verify the request cost. Your choices are saved.'),{status:503});
  const tools=body.tools?Math.min(body.max_tool_calls||4,4):0;
  if(inputTokens>65000||body.max_output_tokens>6000||body.max_tool_calls>4)throw Object.assign(Error('GoPlan could not finish this recommendation. Your answers and choices are saved; you can keep working manually.'),{status:422,code:'REQUEST_TOO_LARGE',retryable:false});
  const reserve=(inputTokens*rates[0]+body.max_output_tokens*rates[1]+tools*40000*rates[0])/1e6+tools*0.01;
  if(spent+reserve>budget)throw Object.assign(Error('GoPlan could not finish this recommendation. Your answers and choices are saved; you can keep working manually.'),{status:422,code:'REQUEST_BUDGET',retryable:false});
  spent+=reserve;
  const response=await fetcher(url,{...init,signal});
  // Do not release the reserve after a transport failure: the provider may bill it.
  try{const p=await response.clone().json();if(p.usage){const actual=(p.usage.input_tokens*rates[0]+p.usage.output_tokens*rates[1])/1e6+tools*0.01;spent+=Math.max(0,actual)-reserve;}}catch{}
  return response;
 };
 return {env:{...env,GOPLAN_REQUEST_SIGNAL:controller.signal,GOPLAN_REQUEST_STARTED:started},fetcher:bounded,dispose:()=>clearTimeout(timer)};
}
export const adviceTokens=stage=>({setup:1800,question:1400,change:1400,pace:1400,direction:4000,courses:6000,targets:3000,replan:4000}[stage]||5000);
export const adviceEffort=(stage,env)=>['setup','question','change','pace','targets'].includes(stage)?'low':env.OPENAI_REASONING_EFFORT||'medium';
