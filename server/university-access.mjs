import {hash} from './feedback.mjs';
export const rosterMode=env=>env.GOPLAN_ACCESS_MODE==='roster';
export const universityId=env=>String(env.GOPLAN_UNIVERSITY_ID||'').trim();
const admins=env=>String(env.ADMIN_EMAILS||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
export async function emailAllowed(email,env){
 if(!rosterMode(env))return true;
 const normalized=String(email).trim().toLowerCase();if(admins(env).includes(normalized))return true;
 const id=universityId(env);if(!id||!env.DB)return false;
 return !!await env.DB.prepare('SELECT email_hash FROM university_access WHERE university_id=? AND email_hash=?').bind(id,await hash(id+':'+normalized)).first();
}
export function parseRoster(text,env){
 if(typeof text!=='string'||text.length>500000)throw Object.assign(Error('Use an email list smaller than 500 KB.'),{status:400});
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),emails=new Set(),domains=String(env.GOPLAN_EMAIL_DOMAINS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 for(let i=0;i<lines.length;i++){let email=lines[i].replace(/^"|"$/g,'').toLowerCase();if(i===0&&/^(email|institutional_email)$/.test(email))continue;
  if(email.length>254||!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)||domains.length&&!domains.includes(email.split('@')[1]))throw Object.assign(Error('Invalid or non-institutional email at line '+(i+1)+'. Use one email per line.'),{status:400});emails.add(email);
 }
 if(!emails.size||emails.size>5000)throw Object.assign(Error('Provide between 1 and 5,000 approved emails.'),{status:400});return [...emails];
}
export async function replaceRoster(text,env){
 const id=universityId(env);if(!id)throw Object.assign(Error('Set the university ID before importing its approved students.'),{status:400});
 const emails=parseRoster(text,env),hashes=await Promise.all(emails.map(e=>hash(id+':'+e))),now=Date.now();
 // One atomic replacement; readers never see a partially loaded intake.
 await env.DB.batch([env.DB.prepare('DELETE FROM university_access WHERE university_id=?').bind(id),env.DB.prepare('INSERT INTO university_access(university_id,email_hash,updated_at) SELECT ?,value,? FROM json_each(?)').bind(id,now,JSON.stringify(hashes))]);
 return {universityId:id,count:hashes.length,updatedAt:now};
}
export async function rosterSummary(env){
 const id=universityId(env);const row=id?await env.DB.prepare('SELECT count(*) AS count,max(updated_at) AS updated_at FROM university_access WHERE university_id=?').bind(id).first():null;
 return {mode:rosterMode(env)?'roster':'demo',universityId:id,count:row?.count||0,updatedAt:row?.updated_at||null};
}
