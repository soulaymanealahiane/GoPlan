import {emptyWorkspace} from '../dist/guidance.js';
import {serviceEntitlement,allowanceView} from './service-allowance.mjs';
import {rosterMode} from './university-access.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export async function resetArchiveSchema(db){await db.prepare('CREATE TABLE IF NOT EXISTS test_reset_archives (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,archive_user TEXT NOT NULL,archive_owner TEXT NOT NULL,active_workspace TEXT,entitlement TEXT NOT NULL,fresh_workspace TEXT NOT NULL,actor TEXT NOT NULL,created_at INTEGER NOT NULL,restored_at INTEGER,restore_token TEXT)').run();}
const fields=['step','saved','global_used','initial_mask','change0','change1','change2','change3','change4','workspace_id','created_at'];
export async function resetStudentTest(env,actor,data){
 if(rosterMode(env))fail('Test resets are available only in the public demo.',403);
 const email=String(data.email||'').trim().toLowerCase();
 if(!uuid(data.requestId)||data.confirm!==email||!email.includes('@'))fail('Confirm the student email before resetting the test.');
 const db=env.DB,student=await db.prepare('SELECT id,email,active_workspace_id FROM student_profiles WHERE lower(email)=?').bind(email).first();
 if(!student)fail('No GoPlan profile was found for this email.',404);
 await resetArchiveSchema(db);
 const existing=await db.prepare('SELECT user_id,restored_at FROM test_reset_archives WHERE id=?').bind(data.requestId).first();
 if(existing){if(existing.user_id!==student.id||existing.restored_at)fail('This reset request is no longer available.',409);return {reset:true,resetId:data.requestId,email:student.email,allowance:allowanceView(await serviceEntitlement(db,student.id))};}
 const entitlement=await serviceEntitlement(db,student.id),now=Date.now();
 const running=await db.prepare("SELECT id FROM service_calls WHERE owner=? AND state='running' AND created_at>? LIMIT 1").bind(entitlement.id,now-240000).first();
 if(running)fail('This student has an AI request running. Wait for it to finish before resetting.',409);
 const guard='EXISTS(SELECT 1 FROM test_reset_archives WHERE id=?)';
 const archiveUser='test-archive:'+data.requestId,archiveOwner=entitlement.id+':'+data.requestId,fresh=crypto.randomUUID(),state=emptyWorkspace();
 // Keep the old private workspace and receipts recoverable under an isolated
 // archive owner. Old browser tabs cannot write to the fresh test's workspace.
 const results=await db.batch([
  db.prepare('INSERT INTO test_reset_archives(id,user_id,archive_user,archive_owner,active_workspace,entitlement,fresh_workspace,actor,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM student_profiles WHERE id=? AND active_workspace_id IS ?) AND EXISTS(SELECT 1 FROM service_entitlements WHERE id=? AND '+fields.slice(0,9).map(field=>field+'=?').join(' AND ')+')').bind(data.requestId,student.id,archiveUser,archiveOwner,student.active_workspace_id,JSON.stringify(entitlement),fresh,actor,now,student.id,student.active_workspace_id,entitlement.id,...fields.slice(0,9).map(field=>entitlement[field])),
  db.prepare('UPDATE student_workspaces SET user_id=? WHERE user_id=? AND '+guard).bind(archiveUser,student.id,data.requestId),
  db.prepare('UPDATE service_calls SET owner=? WHERE owner=? AND '+guard).bind(archiveOwner,entitlement.id,data.requestId),
  db.prepare('UPDATE service_actions SET owner=? WHERE owner=? AND '+guard).bind(archiveOwner,entitlement.id,data.requestId),
  db.prepare('UPDATE service_entitlements SET step=0,saved=0,global_used=0,initial_mask=0,change0=0,change1=0,change2=0,change3=0,change4=0,workspace_id=?,created_at=? WHERE id=? AND '+guard).bind(fresh,now,entitlement.id,data.requestId),
  db.prepare('INSERT INTO student_workspaces(user_id,id,title,phase,state,revision,updated_at) SELECT ?,?,?,?,?,1,? WHERE '+guard).bind(student.id,fresh,'Plan in progress','journey',JSON.stringify(state),now,data.requestId),
  db.prepare('UPDATE student_profiles SET active_workspace_id=? WHERE id=? AND '+guard).bind(fresh,student.id,data.requestId)
 ]);
 if(!results[0].meta?.changes)fail('The account changed while preparing the reset. Refresh and try again.',409);
 return {reset:true,resetId:data.requestId,email:student.email,allowance:allowanceView(await serviceEntitlement(db,student.id))};
}
export async function undoStudentTestReset(env,actor,data){
 if(rosterMode(env)||!uuid(data.resetId))fail('Choose an available demo reset.',403);
 const db=env.DB;await resetArchiveSchema(db);
 const archive=await db.prepare('SELECT * FROM test_reset_archives WHERE id=? AND restored_at IS NULL').bind(data.resetId).first();
 if(!archive)fail('This reset is no longer available.',404);
 const student=await db.prepare('SELECT email FROM student_profiles WHERE id=?').bind(archive.user_id).first();
 if(!student||data.confirm!==student.email.toLowerCase())fail('Confirm the student email.');
 const current=await serviceEntitlement(db,archive.user_id),fresh=await db.prepare('SELECT revision FROM student_workspaces WHERE user_id=? AND id=?').bind(archive.user_id,archive.fresh_workspace).first();
 if(!fresh||fresh.revision!==1||current.initial_mask||current.global_used||current.saved||current.step)fail('The new test has already changed. Keep it; the previous test remains archived.',409);
 const previous=JSON.parse(archive.entitlement),token=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM test_reset_archives WHERE id=? AND restore_token=?)';
 const results=await db.batch([
  db.prepare('UPDATE test_reset_archives SET restored_at=?,restore_token=? WHERE id=? AND restored_at IS NULL AND EXISTS(SELECT 1 FROM student_workspaces WHERE user_id=? AND id=? AND revision=1) AND EXISTS(SELECT 1 FROM service_entitlements WHERE id=? AND initial_mask=0 AND global_used=0 AND saved=0 AND step=0)').bind(Date.now(),token,archive.id,archive.user_id,archive.fresh_workspace,current.id),
  db.prepare('DELETE FROM student_workspaces WHERE user_id=? AND id=? AND revision=1 AND '+guard).bind(archive.user_id,archive.fresh_workspace,archive.id,token),
  db.prepare('UPDATE student_workspaces SET user_id=? WHERE user_id=? AND '+guard).bind(archive.user_id,archive.archive_user,archive.id,token),
  db.prepare('UPDATE service_calls SET owner=? WHERE owner=? AND '+guard).bind(current.id,archive.archive_owner,archive.id,token),
  db.prepare('UPDATE service_actions SET owner=? WHERE owner=? AND '+guard).bind(current.id,archive.archive_owner,archive.id,token),
  db.prepare('UPDATE service_entitlements SET '+fields.map(field=>field+'=?').join(',')+' WHERE id=? AND '+guard).bind(...fields.map(field=>previous[field]),current.id,archive.id,token),
  db.prepare('UPDATE student_profiles SET active_workspace_id=? WHERE id=? AND '+guard).bind(archive.active_workspace,archive.user_id,archive.id,token)
 ]);
 if(!results[0].meta?.changes)fail('The new test changed while preparing undo. Keep the current test.',409);
 return {restored:true,email:student.email};
}
export async function purgeTestArchives(db,uid){
 await resetArchiveSchema(db);const rows=(await db.prepare('SELECT archive_user,archive_owner FROM test_reset_archives WHERE user_id=?').bind(uid).all()).results;
 await db.batch([...rows.flatMap(row=>[db.prepare('DELETE FROM student_workspaces WHERE user_id=?').bind(row.archive_user),db.prepare('DELETE FROM service_calls WHERE owner=?').bind(row.archive_owner),db.prepare('DELETE FROM service_actions WHERE owner=?').bind(row.archive_owner)]),db.prepare('DELETE FROM test_reset_archives WHERE user_id=?').bind(uid)]);
}
