import {SERVICE_STAGES,STAGE_CHANGES,GLOBAL_CHANGES,GLOBAL_REQUESTS,SERVICE_API_BUDGET} from '../dist/service-policy.js';
const ready=new WeakMap();
const fail=(message,status=403,code='SERVICE_LIMIT')=>{throw Object.assign(Error(message),{status,code,retryable:status===429||status>=500});};
export const serviceOwner=async uid=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('goplan-service-v1:'+uid))),b=>b.toString(16).padStart(2,'0')).join('');
async function schema(db){
 if(!db)fail('Your service allowance could not be checked. Please retry.',503,'SERVICE_UNAVAILABLE');
 if(!ready.has(db))ready.set(db,(async()=>{
  await db.prepare('CREATE TABLE IF NOT EXISTS service_entitlements (id TEXT PRIMARY KEY, step INTEGER NOT NULL DEFAULT 0, saved INTEGER NOT NULL DEFAULT 0, global_used INTEGER NOT NULL DEFAULT 0, initial_mask INTEGER NOT NULL DEFAULT 0, change0 INTEGER NOT NULL DEFAULT 0, change1 INTEGER NOT NULL DEFAULT 0, change2 INTEGER NOT NULL DEFAULT 0, change3 INTEGER NOT NULL DEFAULT 0, change4 INTEGER NOT NULL DEFAULT 0, workspace_id TEXT, created_at INTEGER NOT NULL)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS service_actions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, step INTEGER NOT NULL, calls INTEGER NOT NULL DEFAULT 0, max_calls INTEGER NOT NULL, created_at INTEGER NOT NULL)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS service_calls (id TEXT PRIMARY KEY, action_id TEXT NOT NULL, owner TEXT NOT NULL, state TEXT NOT NULL, response TEXT, status INTEGER, created_at INTEGER NOT NULL)').run();
 })().catch(e=>{ready.delete(db);throw e;}));
 await ready.get(db);
}
export async function serviceEntitlement(db,uid){
 await schema(db);const owner=await serviceOwner(uid);
 let row=await db.prepare('SELECT * FROM service_entitlements WHERE id=?').bind(owner).first();
 if(!row){
  const legacy=await db.prepare('SELECT id,state,phase FROM student_workspaces WHERE user_id=? ORDER BY updated_at DESC LIMIT 1').bind(uid).first();
  let state;try{state=legacy?JSON.parse(legacy.state):null;}catch{}
  const saved=state?.plan?.finalizedAt||legacy?.phase==='saved'?1:0,step=saved||state?.draftPlan?5:0;
  await db.prepare('INSERT OR IGNORE INTO service_entitlements(id,step,saved,initial_mask,workspace_id,created_at) VALUES(?,?,?,?,?,?)').bind(owner,step,saved,step===5?31:0,legacy?.id||null,Date.now()).run();
  row=await db.prepare('SELECT * FROM service_entitlements WHERE id=?').bind(owner).first();
 }
 return row;
}
export function allowanceView(row){return {version:1,step:row.step,saved:!!row.saved,initialMask:row.initial_mask,stageChanges:SERVICE_STAGES.map((_,i)=>STAGE_CHANGES-row['change'+i]),globalRemaining:GLOBAL_CHANGES-row.global_used,workspaceId:row.workspace_id,apiBudget:SERVICE_API_BUDGET};}
export async function beginServiceAction(db,uid,{id,kind,step}){
 const row=await serviceEntitlement(db,uid),owner=row.id;
 if(typeof id!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(id)||!['initial','stage','global'].includes(kind)||!Number.isInteger(step)||step<0||step>4)fail('Invalid service action.',400);
 const old=await db.prepare('SELECT * FROM service_actions WHERE id=?').bind(id).first();
 if(old){if(old.owner!==owner||old.kind!==kind||old.step!==step)fail('This action belongs to another request.');return {action:id,allowance:allowanceView(row)};}
 if(kind==='initial'){const first=await db.prepare("SELECT id FROM service_actions WHERE owner=? AND kind='initial' AND step=?").bind(owner,step).first();if(first)return {action:first.id,allowance:allowanceView(row)};}
 const now=Date.now(),column='change'+step;
 const condition=kind==='global'?`saved=1 AND global_used<${GLOBAL_CHANGES}`:`saved=0 AND step=${step} AND ${kind==='initial'?`(initial_mask & ${1<<step})=0`:`${column}<${STAGE_CHANGES}`}`;
 const assignment=kind==='global'?'global_used=global_used+1':kind==='stage'?`${column}=${column}+1`:`initial_mask=initial_mask | ${1<<step}`;
 const result=await db.batch([
  db.prepare(`UPDATE service_entitlements SET ${assignment} WHERE id=? AND ${condition} AND NOT EXISTS(SELECT 1 FROM service_actions WHERE id=?)`).bind(owner,id),
  db.prepare('INSERT INTO service_actions(id,owner,kind,step,max_calls,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(id,owner,kind,step,kind==='global'?GLOBAL_REQUESTS:1,now)
 ]);
 if(!result[0].meta?.changes){const retry=await db.prepare('SELECT owner,kind,step FROM service_actions WHERE id=?').bind(id).first();if(!retry||retry.owner!==owner||retry.kind!==kind||retry.step!==step)fail(kind==='global'?'Your five global AI changes have been used. Manual editing and Excel export remain available.':'This stage has no more AI changes available. Continue to the next stage.');}
 return {action:id,allowance:allowanceView(await serviceEntitlement(db,uid))};
}
export async function advanceService(db,uid,step){
 const row=await serviceEntitlement(db,uid);if(!Number.isInteger(step)||step<0||step>4)fail('Invalid stage.',400);
 if(row.step===step+1)return allowanceView(row);
 const result=await db.prepare('UPDATE service_entitlements SET step=step+1 WHERE id=? AND step=? AND saved=0 AND (initial_mask & ?)!=0').bind(row.id,step,1<<step).run();
 if(!result.meta?.changes)fail('Finish this stage before continuing.');return allowanceView(await serviceEntitlement(db,uid));
}
export async function reserveServiceCall(db,uid,actionId,stage,requestHash){
 const row=await serviceEntitlement(db,uid),action=await db.prepare('SELECT * FROM service_actions WHERE id=? AND owner=?').bind(actionId||'',row.id).first();
 if(!action)fail('Start this request from your GoPlan workspace.',403,'SERVICE_ACTION_REQUIRED');
 const allowed=action.kind==='global'?['change','question','direction','courses','targets','pace','replan']:[SERVICE_STAGES[action.step].agent];
 if(!allowed.includes(stage))fail('This AI request does not belong to the current stage.');
 const id=action.id+':'+requestHash,existing=await db.prepare('SELECT state,response,status FROM service_calls WHERE id=? AND owner=?').bind(id,row.id).first();
 if(existing?.response)return {cached:JSON.parse(existing.response),status:existing.status};
 if(action.kind!=='global'&&(row.saved||row.step!==action.step))fail('This stage is complete. Use a global change from Your space.');
 if(existing)fail('This request is still finishing. Please wait.',429,'AGENT_BUSY');
 const results=await db.batch([
  db.prepare('UPDATE service_actions SET calls=calls+1 WHERE id=? AND owner=? AND calls<max_calls AND NOT EXISTS(SELECT 1 FROM service_calls WHERE id=?)').bind(action.id,row.id,id),
  db.prepare("INSERT INTO service_calls(id,action_id,owner,state,created_at) SELECT ?,?,?,'running',? WHERE changes()=1").bind(id,action.id,row.id,Date.now())
 ]);
 if(!results[0].meta?.changes)fail('This request is already used. Choose manually or send a new request if you have changes remaining.',403,'SERVICE_ACTION_USED');
 return {id,action,allowance:allowanceView(row),finish:async(body,status)=>{
  await db.prepare("UPDATE service_calls SET state='finished',response=?,status=? WHERE id=? AND owner=?").bind(JSON.stringify(body),status,id,row.id).run();
 }};
}
export async function serviceEndpoint(request,env,identity){
 const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 try{
  if(!identity)return json({error:'Sign in to open your service allowance.'},401);
  const url=new URL(request.url);if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)fail('Open this action from GoPlan.');
  if(request.method==='GET')return json({allowance:allowanceView(await serviceEntitlement(env.DB,identity.id))});
  if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)fail('Open this action from GoPlan.');
  if(Number(request.headers.get('Content-Length'))>1024)fail('Request too large.',413);const text=await request.text();if(text.length>1024)fail('Request too large.',413);const data=JSON.parse(text);
  if(url.pathname==='/api/service/action')return json(await beginServiceAction(env.DB,identity.id,data));
  if(url.pathname==='/api/service/advance')return json({allowance:await advanceService(env.DB,identity.id,data.step)});
  return json({error:'Not found.'},404);
 }catch(e){return json({error:e.status?e.message:'Your service allowance is unavailable. Please retry.',code:e.code||'SERVICE_UNAVAILABLE',...(e.retryable===false?{retryable:false}:{})},e.status||503);}
}
