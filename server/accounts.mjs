import {accountIdentity} from './auth.mjs';
import {validateSavedWorkspace} from '../dist/guidance.js';
import {hash} from './feedback.mjs';
import {privateHeaders} from './admin-auth.mjs';
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export const studentIdentity=accountIdentity;
const profile=row=>row?{id:row.id,firstName:row.first_name,lastName:row.last_name,email:row.email,createdAt:row.created_at,lastSeenAt:row.last_seen_at,activeWorkspaceId:row.active_workspace_id}:null;
function names(data){
 const clean=v=>typeof v==='string'?v.normalize('NFC').trim().replace(/\s+/g,' '):'';
 const firstName=clean(data.firstName),lastName=clean(data.lastName);
 if(!firstName||!lastName||firstName.length>80||lastName.length>80||/[\x00-\x1f<>]/.test(firstName+lastName))fail('Enter your first and last name (up to 80 characters each).');
 return {firstName,lastName};
}
async function body(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('Use JSON.',415);
 const reader=request.body?.getReader();if(!reader)fail('Missing request.');let length=0,parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2000000){await reader.cancel();fail('This plan exceeds the 2 MB cloud-save limit. Keep a backup.',413);}parts.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('Invalid JSON.');}
}
export async function accountEndpoint(request,env){
 const url=new URL(request.url),json=(data,status=200)=>Response.json(data,{status,headers:privateHeaders});
 try{
  const identity=await studentIdentity(request,env);
  if(!identity)return json(url.pathname==='/api/account'&&request.method==='GET'?{authenticated:false}:{error:'Sign in to access your account.',code:'SIGN_IN_REQUIRED'},url.pathname==='/api/account'&&request.method==='GET'?200:401);
  if(request.headers.get('X-GoPlan-Account')&&request.headers.get('X-GoPlan-Account')!==identity.id)return json({error:'The signed-in account changed. Reload GoPlan before continuing.',code:'ACCOUNT_CHANGED'},409);
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Use GoPlan on this website.'},403);
  if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return json({error:'Open this action from GoPlan.'},403);
  if(!env.DB)fail('Account storage is temporarily unavailable. Your device copy is unchanged.',503);
  const db=env.DB,uid=identity.id,now=Date.now();
  const row=await db.prepare('SELECT * FROM student_profiles WHERE id=?').bind(uid).first();
  if(url.pathname==='/api/account'&&request.method==='GET'){
   if(row&&now-row.last_seen_at>900000)await db.prepare('UPDATE student_profiles SET last_seen_at=? WHERE id=?').bind(now,uid).run();
   return json({authenticated:true,identity:{id:uid,email:identity.email},profile:profile(row)});
  }
  if(url.pathname==='/api/account/profile'&&request.method==='POST'){
   const data=await body(request),{firstName,lastName}=names(data);
   if(!row&&data.consentCloud!==true)fail('Confirm cloud saving before creating your profile.');
   await db.prepare(`INSERT INTO student_profiles(id,email,first_name,last_name,created_at,last_seen_at,consent_version) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,first_name=excluded.first_name,last_name=excluded.last_name,last_seen_at=excluded.last_seen_at`).bind(uid,identity.email,firstName,lastName,now,now,'2026-09-29').run();
   return json({profile:profile(await db.prepare('SELECT * FROM student_profiles WHERE id=?').bind(uid).first())});
  }
  if(!row)fail('Create your GoPlan profile first.',409);
  if(url.pathname==='/api/account/workspaces'&&request.method==='GET'){
   return json({workspaces:(await db.prepare('SELECT id,title,phase,revision,updated_at FROM student_workspaces WHERE user_id=? ORDER BY updated_at DESC LIMIT 20').bind(uid).all()).results});
  }
  const match=url.pathname.match(/^\/api\/account\/workspaces\/([^/]+)$/);
  if(match){
   const id=match[1];if(!uuid(id))fail('Invalid roadmap identifier.');
   if(request.method==='GET'){
    const saved=await db.prepare('SELECT id,state,revision,updated_at FROM student_workspaces WHERE user_id=? AND id=?').bind(uid,id).first();
    if(!saved)fail('Roadmap not found.',404);return json({id:saved.id,state:JSON.parse(saved.state),revision:saved.revision,updatedAt:saved.updated_at});
   }
   if(request.method==='PUT'){
    const data=await body(request);if(!Number.isInteger(data.revision)||data.revision<0)fail('Invalid saved revision.');
    let state;try{state=validateSavedWorkspace(data.state);}catch{fail('The roadmap could not be validated. Your existing cloud copy is unchanged.');}
    // Store the supported workspace fields only; never arbitrary authentication data.
    const clean={version:3,phase:state.phase,journey:state.journey,plan:state.plan,draftPlan:state.draftPlan,history:state.history,updatedAt:new Date(now).toISOString()};
    const title=String(state.plan?.program?.name||state.draftPlan?.program?.name||'Plan in progress').slice(0,160),serialized=JSON.stringify(clean);
    let result;
    if(data.revision===0){
     result=await db.prepare(`INSERT OR IGNORE INTO student_workspaces(user_id,id,title,phase,state,revision,updated_at) SELECT ?,?,?,?,?,1,? WHERE (SELECT COUNT(*) FROM student_workspaces WHERE user_id=?)<20`).bind(uid,id,title,state.phase,serialized,now,uid).run();
    }else result=await db.prepare('UPDATE student_workspaces SET title=?,phase=?,state=?,revision=revision+1,updated_at=? WHERE user_id=? AND id=? AND revision=?').bind(title,state.phase,serialized,now,uid,id,data.revision).run();
    if(!result.meta?.changes){const exists=await db.prepare('SELECT revision FROM student_workspaces WHERE user_id=? AND id=?').bind(uid,id).first();if(!exists&&data.revision===0)fail('Your account has reached the 20-plan limit. Export your plans before removing an old one.',409);return json({error:'This roadmap changed on another device. Choose which version to keep.',code:'SYNC_CONFLICT'},409);}
    await db.prepare('UPDATE student_profiles SET active_workspace_id=?,last_seen_at=? WHERE id=?').bind(id,now,uid).run();
    return json({id,revision:data.revision+1,updatedAt:now});
   }
  }
  if(url.pathname==='/api/account/active'&&request.method==='POST'){
   const data=await body(request);if(!uuid(data.id)||!await db.prepare('SELECT id FROM student_workspaces WHERE user_id=? AND id=?').bind(uid,data.id).first())fail('Roadmap not found.',404);
   await db.prepare('UPDATE student_profiles SET active_workspace_id=?,last_seen_at=? WHERE id=?').bind(data.id,now,uid).run();return json({activeWorkspaceId:data.id});
  }
  if(url.pathname==='/api/account/export'&&request.method==='GET'){
   const plans=(await db.prepare('SELECT id,title,state,revision,updated_at FROM student_workspaces WHERE user_id=? ORDER BY updated_at DESC').bind(uid).all()).results.map(p=>({...p,state:JSON.parse(p.state)}));
   return new Response(JSON.stringify({profile:profile(row),workspaces:plans,exportedAt:new Date(now).toISOString()},null,2),{headers:{...privateHeaders,'Content-Type':'application/json','Content-Disposition':'attachment; filename="GoPlan-account.json"'}});
  }
  if(url.pathname==='/api/account'&&request.method==='DELETE'){
   const data=await body(request);if(data.confirm!=='DELETE MY GOPLAN DATA')fail('Confirm account deletion.');
   await db.batch([db.prepare('DELETE FROM student_workspaces WHERE user_id=?').bind(uid),db.prepare('DELETE FROM student_profiles WHERE id=?').bind(uid),db.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(uid)]);return json({deleted:true});
  }
  return json({error:'Unsupported account request.'},405);
 }catch(e){return json({error:e.status?e.message:'Account storage is temporarily unavailable. Keep your device copy and retry.'},e.status||503);}
}
export async function studentDirectory(env){
 const rows=(await env.DB.prepare('SELECT id,first_name,last_name,email,created_at,last_seen_at FROM student_profiles ORDER BY last_seen_at DESC LIMIT 200').all()).results;
 const total=(await env.DB.prepare('SELECT COUNT(*) AS count FROM student_profiles').first()).count;
 return {students:rows.map(r=>({id:r.id,firstName:r.first_name,lastName:r.last_name,email:r.email,createdAt:r.created_at,lastSeenAt:r.last_seen_at})),total,limit:200};
}
