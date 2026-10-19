import {handleApi} from './server/api.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {emptyWorkspace} from './dist/guidance.js';
import assert from 'node:assert/strict';
import {localDatabase} from './server/local-db.mjs';
import {serviceEntitlement,allowanceView,beginServiceAction,advanceService,reserveServiceCall,recoverInitialTargets} from './server/service-allowance.mjs';
import {SERVICE_STAGES,SERVICE_API_BUDGET,SERVICE_PRICE,AI_REQUEST_BUDGET} from './dist/service-policy.js';
const db=localDatabase(':memory:'),uid='package-student',other='other-student';
const begin=(kind,step,id=crypto.randomUUID())=>beginServiceAction(db,uid,{id,kind,step});
assert.equal(SERVICE_API_BUDGET,10);assert.equal(SERVICE_PRICE,12);
await assert.rejects(()=>advanceService(db,uid,0),/Finish this stage/);
let total=0;
for(let step=0;step<5;step++){
 const initial=await begin('initial',step),agent=SERVICE_STAGES[step].agent;
 const receipt=await reserveServiceCall(db,uid,initial.action,agent,'first');await receipt.finish({summary:'Synthetic output.'},200);total++;
 assert.deepEqual((await reserveServiceCall(db,uid,initial.action,agent,'first')).cached,{summary:'Synthetic output.'});
 await assert.rejects(()=>reserveServiceCall(db,uid,initial.action,agent,'different'),e=>e.code==='SERVICE_ACTION_USED'&&e.retryable===false);
 await assert.rejects(()=>reserveServiceCall(db,other,initial.action,agent,'stolen'),/Start this request/);
 const attempts=await Promise.allSettled([begin('stage',step),begin('stage',step),begin('stage',step)]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,2,'Atomic quota must refuse a third simultaneous prompt.');
 for(const attempt of attempts.filter(r=>r.status==='fulfilled')){const call=await reserveServiceCall(db,uid,attempt.value.action,agent,'change');await call.finish({summary:'Changed.'},200);total++;}
 assert.equal(allowanceView(await serviceEntitlement(db,uid)).stageChanges[step],0);
 await advanceService(db,uid,step);
 await assert.rejects(()=>reserveServiceCall(db,uid,initial.action,agent,'late'),/stage is complete/);
}
await assert.rejects(()=>begin('global',4),/five global/);
const owner=(await serviceEntitlement(db,uid)).id;await db.prepare('UPDATE service_entitlements SET saved=1 WHERE id=?').bind(owner).run();
const global=await Promise.allSettled(Array.from({length:6},()=>begin('global',4)));
assert.equal(global.filter(r=>r.status==='fulfilled').length,5);
for(const action of global.filter(r=>r.status==='fulfilled'))for(let i=0;i<5;i++){
 const call=await reserveServiceCall(db,uid,action.value.action,'change','route-'+i);await call.finish({summary:'Global change.'},200);total++;
}
assert.equal(total,40);assert.equal(total*AI_REQUEST_BUDGET,SERVICE_API_BUDGET);
assert.equal(allowanceView(await serviceEntitlement(db,uid)).globalRemaining,0);
await assert.rejects(()=>reserveServiceCall(db,uid,global[0].value.action,'change','sixth-call'),e=>e.code==='SERVICE_ACTION_USED'&&e.retryable===false);
assert.equal((await begin('initial',0)).allowance.saved,true,'Replaying an old initial action does not restore any allowance.');
assert.equal(allowanceView(await serviceEntitlement(db,other)).globalRemaining,5,'Allowances must be isolated by verified account.');

const apiUser='service-api-test',session=await testSession(db,apiUser),base='https://planwithgoplan.com';
const api=(path,method='GET',data)=>handleApi(new Request(base+path,{method,headers:{...session,Origin:base,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),{DB:db});
assert.equal((await handleApi(new Request(base+'/api/service'),{DB:db})).status,401);
assert.equal((await api('/api/account/profile','POST',{firstName:'Synthetic',lastName:'Student',consentCloud:true})).status,200);
const ids=[crypto.randomUUID(),crypto.randomUUID()],workspace=emptyWorkspace();
assert.equal((await api('/api/account/workspaces/'+ids[0],'PUT',{revision:0,state:{...workspace,phase:'saved'}})).status,403,'Saving cannot skip the five stages.');
const concurrent=await Promise.all(ids.map(id=>api('/api/account/workspaces/'+id,'PUT',{revision:0,state:workspace})));
assert.equal(concurrent.filter(r=>r.status===200).length,1,'Concurrent first saves cannot create two roadmaps.');
assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM student_workspaces WHERE user_id=?').bind(apiUser).first()).n,1);
assert.equal((await api('/api/service/action','POST',{id:crypto.randomUUID(),kind:'global',step:4})).status,403,'Global prompts cannot unlock before saving.');
const beforeDelete=await serviceEntitlement(db,apiUser),initial=await beginServiceAction(db,apiUser,{id:crypto.randomUUID(),kind:'initial',step:0});
const privateReceipt=await reserveServiceCall(db,apiUser,initial.action,'direction','receipt');await privateReceipt.finish({private:'Synthetic private response'},200);
assert.equal((await api('/api/account','DELETE',{confirm:'DELETE MY GOPLAN DATA'})).status,200);
assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM service_calls WHERE owner=?').bind(beforeDelete.id).first()).n,0);
assert.equal((await serviceEntitlement(db,apiUser)).initial_mask,1,'Deleting profile data cannot restore a used initial request.');

// A dead Worker cannot hold a receipt forever or restore spent AI credit.
const staleUser='stale-receipt-user';
const staleAction=await beginServiceAction(db,staleUser,{id:crypto.randomUUID(),kind:'initial',step:0});
const staleCall=await reserveServiceCall(db,staleUser,staleAction.action,'direction','stale-hash');
await db.prepare('UPDATE service_calls SET created_at=? WHERE id=?').bind(Date.now()-300000,staleCall.id).run();
const interrupted=await reserveServiceCall(db,staleUser,staleAction.action,'direction','stale-hash');
assert.equal(interrupted.status,409);assert.equal(interrupted.cached.code,'REQUEST_INTERRUPTED');
await assert.rejects(()=>reserveServiceCall(db,staleUser,staleAction.action,'direction','another-hash'),e=>e.code==='SERVICE_ACTION_USED');
assert.equal((await serviceEntitlement(db,staleUser)).initial_mask,1);
await assert.rejects(()=>recoverInitialTargets(db,staleUser,staleAction.action,{source:'reviewed'}),e=>e.code==='SERVICE_ACTION_REQUIRED');
await assert.rejects(()=>recoverInitialTargets(db,other,staleAction.action,{source:'reviewed'}),e=>e.code==='SERVICE_ACTION_REQUIRED');
for(const action of global.filter(r=>r.status==='fulfilled'))await assert.rejects(()=>recoverInitialTargets(db,uid,action.value.action,{source:'reviewed'}),e=>e.code==='SERVICE_ACTION_REQUIRED');
db.close();console.log('Passed atomic two-per-stage and five-global quotas, persistent account isolation, closed stages, replay without new billing, forty-request/$10 package ceiling and $12 price at 20% markup. No live calls.');
