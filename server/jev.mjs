// Jev only makes bounded decisions. It never receives credentials, student
// identity, grades, notes, or permission to change an academic rule.
export const JEV_URL='https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL='jev-1.14.0';
export const JEV_INPUT_PRICE=0.042;
export const hybridEnabled=env=>env.GOPLAN_HYBRID==='on'&&typeof env.TYPESAFE_API_KEY==='string'&&!!env.TYPESAFE_API_KEY.trim();
export const jevFailure=reason=>Object.assign(Error('The decision service could not verify this request.'),{code:'JEV_UNAVAILABLE',reason});
export function providerEvent(env,event){
 const safe={provider:'jev',...event};
 if(typeof env.GOPLAN_PROVIDER_OBSERVER==='function')env.GOPLAN_PROVIDER_OBSERVER(safe);
 else console.info('GoPlan inference',JSON.stringify(safe));
}
const probability=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
function checkAnswer(answer,question){
 if(!answer||answer.type!==question.type)throw jevFailure('response');
 if(question.type==='noul'){if(!probability(answer.noul))throw jevFailure('response');return;}
 const keys=question.type==='choice'?Object.keys(question.criteria):question.criteria.map((_,i)=>String(i));
 const probs=answer.probabilities;
 if(!probability(answer.confidence)||!probs||Object.keys(probs).length!==keys.length||keys.some(k=>!Object.hasOwn(probs,k)||!probability(probs[k]))||Math.abs(Object.values(probs).reduce((n,v)=>n+v,0)-1)>0.02)throw jevFailure('response');
 if(question.type==='choice'&&(!keys.includes(answer.choice)||probs[answer.choice]+0.001<Math.max(...Object.values(probs))))throw jevFailure('response');
 if(question.type==='score'&&(!Number.isFinite(answer.score)||answer.score<0||answer.score>keys.length-1))throw jevFailure('response');
}
export async function decide(state,questions,env,fetcher=fetch){
 if(!hybridEnabled(env))throw jevFailure('disabled');
 const model=env.TYPESAFE_MODEL||JEV_MODEL;
 if(![JEV_MODEL,'jev-1.13.0'].includes(model))throw jevFailure('model');
 const body=JSON.stringify({model,state,questions});
 // Conservative byte bounds keep routine decisions below the normal context
 // limits without experimental long-context headers or a second tokenizer API.
 const bytes=value=>new TextEncoder().encode(value).length;
 if(!Object.keys(questions).length||bytes(body)>60000||Object.values(questions).some(q=>bytes(JSON.stringify({state,question:q}))>30000))throw jevFailure('context');
 if(Object.values(questions).some(q=>!['choice','score','noul'].includes(q.type)||q.type==='choice'&&(!Object.keys(q.criteria||{}).length||Object.keys(q.criteria).length>255)||q.type==='score'&&(!Array.isArray(q.criteria)||q.criteria.length<2||q.criteria.length>10)))throw jevFailure('questions');
 const controller=new AbortController(),started=Date.now();
 const configured=Number(env.GOPLAN_JEV_TIMEOUT_MS)||5000,timeout=Math.max(100,Math.min(8000,configured));
 const signal=AbortSignal.any([controller.signal,...(env.GOPLAN_REQUEST_SIGNAL?[env.GOPLAN_REQUEST_SIGNAL]:[])]);
 let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(jevFailure('timeout'));},timeout);});
 try{
  const result=await Promise.race([deadline,(async()=>{
   const response=await fetcher(JEV_URL,{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.TYPESAFE_API_KEY},body});
   if(!response.ok)throw jevFailure(response.status===429?'rate-limit':response.status===401||response.status===403?'authentication':'provider');
   const payload=await response.json();
   if(payload.model!==model||!payload.answers||Object.keys(payload.answers).length!==Object.keys(questions).length)throw jevFailure('response');
   for(const [id,q]of Object.entries(questions))checkAnswer(payload.answers[id],q);
   if(!Number.isInteger(payload.usage?.input_tokens)||payload.usage.input_tokens<0||payload.usage.input_tokens>64000)throw jevFailure('usage');
   return payload;
  })()]);
  providerEvent(env,{outcome:'completed',model,questions:Object.keys(questions).length,inputTokens:result.usage.input_tokens,costUsd:result.usage.input_tokens*JEV_INPUT_PRICE/1e6,elapsedMs:Date.now()-started});
  return result.answers;
 }catch(error){providerEvent(env,{outcome:'failed',reason:error.reason||'connection',elapsedMs:Date.now()-started});throw error.code==='REQUEST_BUDGET'?error:error.code==='JEV_UNAVAILABLE'?error:jevFailure('connection');}
 finally{clearTimeout(timer);}
}
export function selected(answer,{minimum=0.65}={}){
 if(!answer||answer.confidence<minimum)throw jevFailure('confidence');
 return answer.choice;
}
