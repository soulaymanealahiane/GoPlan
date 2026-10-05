// Retry bounded transient failures. Billing failures require intervention.
export async function fetchGroq(url,init,fetcher=fetch,{pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),random=Math.random}={}){
 for(let attempt=0;attempt<3;attempt++){
  let response;
  try{response=await fetcher(url,init);}catch(error){
   init.signal?.throwIfAborted();
   const transient=['ECONNRESET','ETIMEDOUT','EPIPE','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(error.cause?.code);
   if(!transient||attempt===2)throw error;
   await pause(1000*2**attempt+random()*500);init.signal?.throwIfAborted();continue;
  }
  const transient=response.status>=500&&response.status<=504;
  if((response.status!==429&&!transient)||attempt===2)return response;
  if(!transient){
   let error;try{error=(await response.clone().json()).error;}catch{return response;}
   if([error?.code,error?.type].some(x=>['insufficient_quota','credit_balance_exhausted'].includes(x)))return response;
   if(![error?.code,error?.type].some(x=>['rate_limit_exceeded','rate_limit_error','slow_down'].includes(x)))return response;
  }
  const header=response.headers.get('Retry-After');
  const requested=header==null?NaN:Number.isFinite(Number(header))?Number(header)*1000:Date.parse(header)-Date.now();
  // Do not retry earlier than the provider asks, or hold the UI indefinitely.
  if(requested>15000)return response;
  const delay=Number.isFinite(requested)&&requested>0?requested:2000*2**attempt+random()*500;
  await response.body?.cancel();await pause(delay);
  init.signal?.throwIfAborted();
 }
}

export function groqServiceError(response,error){
 const budget=['blocked_api_access','credit_balance_exhausted','insufficient_quota'].includes(error?.code)||error?.type==='insufficient_quota';
 const tooLarge=response.status===413;
 const message=budget?'The GoPlan adviser has reached its service budget. Your saved plan is unchanged.':tooLarge?'The GoPlan adviser needs a higher service limit for this request. Your saved plan is unchanged.':response.status===429?'The adviser is busy. Wait a moment and retry.':'The AI service could not complete this request. Your saved plan is unchanged.';
 const e=Error(message);e.status=budget||tooLarge?503:502;return e;
}
