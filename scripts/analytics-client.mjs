import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
try{process.loadEnvFile(process.env.GOPLAN_ENV_FILE||path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
export async function adminRequest(route,{local=false,body}={}){
 const key=/^(reports|review|students)(\?|$)/.test(route)?process.env.FEEDBACK_REVIEW_KEY:(process.env.ANALYTICS_ADMIN_KEY||process.env.FEEDBACK_REVIEW_KEY);
 if(!key)throw Error('The private administrator configuration is missing. Ask your GoPlan agent to reconnect this console.');
 const base=local?'http://127.0.0.1:4317':'https://planwithgoplan.com';
 const response=await fetch(base+'/api/admin/'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});
 const data=await response.json();if(!response.ok)throw Error(response.status===401?'Administrator access was not accepted.':data.error||'Usage is temporarily unavailable.');return data;
}
export const loadAnalytics=(days=30,options={})=>adminRequest('analytics?days='+Math.max(1,Math.min(90,Number(days)||30)),options);
