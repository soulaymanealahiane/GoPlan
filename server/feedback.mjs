import {DATA} from '../dist/planner.js';
const DAY=86400000,RETENTION=90*DAY;
const uuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/i.test(s);
const token=s=>typeof s==='string'&&/^[a-f0-9]{64}$/i.test(s);
export const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
function fail(message,status=400){const e=Error(message);e.status=status;throw e;}
const clean=(v,max,min=0)=>{if(typeof v!=='string'||v.trim().length<min||v.length>max)fail('Please check the report fields and their lengths.');return v.trim();};
export function cleanReport(data){
 if(data?.consentShare!==true)fail('Choose whether to send this report before submitting.');
 if(!uuid(data.id)||!token(data.receiptToken))fail('Invalid report receipt.');
 if(!['policy','program','recommendation','other'].includes(data.category)||!['direction','courses','targets','pace'].includes(data.stage))fail('Choose the kind of mistake and planning step.');
 const p=data.academic||{};if(!DATA.programs.some(x=>x.id===p.program))fail('Choose a valid degree context.');
 return {category:data.category,stage:data.stage,issue:clean(data.issue,2000,10),expected:clean(data.expected,1600),evidence:clean(data.evidence,800),
  academic:Object.fromEntries(['program','track','secondTrack','minor'].map(k=>[k,clean(p[k]||'',100)])),
  consentShare:true,consentImprove:data.consentImprove===true,policyVersion:'2026-09-27'};
}
function receipt(row){return {id:row.id,status:row.status,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),
 improve:!!row.improve,reviewNote:row.review_note,reviewedAt:row.reviewed_at?new Date(row.reviewed_at).toISOString():null,
 correction:row.status==='confirmed'&&row.correction?JSON.parse(row.correction):null,
 learning:row.status==='confirmed'&&row.improve&&row.correction?'reviewed-guidance':'not-applied'};}
export async function purgeExpired(db,now=Date.now()){
 await db.batch([db.prepare('DELETE FROM feedback_reviews WHERE report_id IN (SELECT id FROM feedback_reports WHERE expires_at<=?)').bind(now),db.prepare('DELETE FROM feedback_reports WHERE expires_at<=?').bind(now)]);
}
function database(env){if(!env.DB?.prepare)fail('Mistake reporting is temporarily unavailable. Your report has not been sent; keep this window open and retry.',503);return env.DB;}
export async function submitFeedback(data,env,session,now=Date.now()){
 const payload=cleanReport(data),db=database(env);await purgeExpired(db,now);
 const receiptHash=await hash(data.receiptToken),payloadHash=await hash(JSON.stringify(payload)),sessionHash=await hash(session);
 const existing=await db.prepare('SELECT * FROM feedback_reports WHERE id=?').bind(data.id).first();
 if(existing){if(existing.receipt_hash!==receiptHash||existing.payload_hash!==payloadHash)fail('This receipt belongs to a different report. Start a new report.',409);return receipt(existing);}
 const expires=now+RETENTION;
 const inserted=await db.prepare(`INSERT OR IGNORE INTO feedback_reports(id,receipt_hash,payload_hash,session_hash,payload,improve,created_at,expires_at)
 SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM feedback_reports WHERE session_hash=? AND created_at>?)<8 AND (SELECT COUNT(*) FROM feedback_reports)<5000`).bind(data.id,receiptHash,payloadHash,sessionHash,JSON.stringify(payload),payload.consentImprove?1:0,now,expires,sessionHash,now-3600000).run();
 const row=await db.prepare('SELECT * FROM feedback_reports WHERE id=?').bind(data.id).first();
 if(!row)fail('The report inbox is busy. Your text is still here; please try again later.',429);
 if(row.receipt_hash!==receiptHash||row.payload_hash!==payloadHash)fail('This receipt belongs to a different report.',409);
 return receipt(row);
}
async function owned(data,db,now){
 if(!uuid(data.id)||!token(data.receiptToken))fail('Report not found or receipt not accepted.',404);
 const row=await db.prepare('SELECT * FROM feedback_reports WHERE id=? AND receipt_hash=? AND expires_at>?').bind(data.id,await hash(data.receiptToken),now).first();
 if(!row)fail('Report not found, withdrawn, or past its retention period.',404);return row;
}
export async function readFeedback(data,env,now=Date.now()){const db=database(env);await purgeExpired(db,now);return receipt(await owned(data,db,now));}
export async function withdrawFeedback(data,env,now=Date.now()){
 const db=database(env);await owned(data,db,now);
 await db.batch([db.prepare('DELETE FROM feedback_reviews WHERE report_id=?').bind(data.id),db.prepare('DELETE FROM feedback_reports WHERE id=?').bind(data.id)]);
 return {id:data.id,status:'withdrawn',learning:'not-applied'};
}
function reviewedSource(source={}){
 if(source.url){const url=new URL(clean(source.url,700,10));if(url.protocol!=='https:'||!(url.hostname==='aui.ma'||url.hostname.endsWith('.aui.ma')))fail('Academic corrections need an official AUI source.');return {url:url.href};}
 const file=clean(source.file||'',250,3),page=Number(source.page);
 if(!DATA.documents.some(d=>(d.file||d.filename||d.name)===file)||!Number.isInteger(page)||page<1||page>1500)fail('Use a supplied AUI document filename and PDF page.');return {file,page};
}
export async function reviewFeedback(data,env,now=Date.now()){
 const db=database(env);await purgeExpired(db,now);
 const row=await db.prepare('SELECT * FROM feedback_reports WHERE id=?').bind(data.id).first();if(!row)fail('Report not found.',404);
 if(!['confirmed','dismissed','needs-information'].includes(data.status))fail('Choose a review outcome.');
 const note=clean(data.note,1600,10),reviewer=clean(data.reviewer,120,3);let correction=null;
 if(data.status==='confirmed'){
  if(data.evidenceChecked!==true)fail('A reviewer must check the academic source before confirming a correction.');
  const p=JSON.parse(row.payload);correction={text:clean(data.correction,1800,20),source:reviewedSource(data.source),program:p.academic.program,stage:p.stage,reviewedAt:new Date(now).toISOString()};
 }
 await db.batch([db.prepare('UPDATE feedback_reports SET status=?,review_note=?,correction=?,reviewed_at=? WHERE id=?').bind(data.status,note,correction?JSON.stringify(correction):null,now,data.id),
  db.prepare('INSERT INTO feedback_reviews(id,report_id,reviewer,status,note,correction,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),data.id,reviewer,data.status,note,correction?JSON.stringify(correction):null,now)]);
 return receipt(await db.prepare('SELECT * FROM feedback_reports WHERE id=?').bind(data.id).first());
}
export async function listFeedback(env,now=Date.now()){
 const db=database(env);await purgeExpired(db,now);
 const rows=(await db.prepare('SELECT * FROM feedback_reports ORDER BY created_at DESC LIMIT 100').all()).results;
 return {reports:rows.map(row=>({...receipt(row),report:JSON.parse(row.payload)})),limit:100};
}
export async function approvedCorrections(env,now=Date.now()){
 if(!env.DB)return []; // Existing/offline test environments have no shared feedback library.
 const rows=(await env.DB.prepare("SELECT id,correction FROM feedback_reports WHERE status='confirmed' AND improve=1 AND correction IS NOT NULL AND expires_at>? ORDER BY reviewed_at DESC LIMIT 30").bind(now).all()).results;
 return rows.map(row=>({id:row.id,...JSON.parse(row.correction)}));
}
export async function feedbackEndpoint(path,data,request,env,identity=null){
 if(path.startsWith('/api/review/')){
  if(!env.FEEDBACK_REVIEW_KEY||request.headers.get('Authorization')!=='Bearer '+env.FEEDBACK_REVIEW_KEY)fail('Reviewer access required.',403);
  if(path==='/api/review/list')return listFeedback(env);
  if(path==='/api/review/decision')return reviewFeedback(data,env);
 }else{
  if(!identity&&(!env.AI_ACCESS_CODE||request.headers.get('X-GoPlan-Access')!==env.AI_ACCESS_CODE))fail('Enter your demo access code before sending or managing a report.',401);
  if(path==='/api/feedback')return submitFeedback(data,env,request.headers.get('X-GoPlan-Session')||'demo');
  if(path==='/api/feedback/status')return readFeedback(data,env);
  if(path==='/api/feedback/withdraw')return withdrawFeedback(data,env);
 }
 fail('Not found.',404);
}
