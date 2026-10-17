async function api(path='',body){
 const response=await fetch('/api/service'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},credentials:'same-origin',body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Your service allowance is unavailable.'),{code:data.code,retryable:data.retryable!==false});return data;
}
export const loadAllowance=async()=> (await api()).allowance;
export const beginAction=(kind,step,id=crypto.randomUUID())=>api('/action',{kind,step,id});
export const advanceStage=async step=>(await api('/advance',{step})).allowance;
