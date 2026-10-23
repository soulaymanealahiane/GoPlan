import assert from 'node:assert/strict';
import {unsupportedOperation,capabilityContext,clearlySupportedOperation,validateCapabilityOutput} from './dist/agent-capabilities.js';
import {advise} from './server/advisor.mjs';
import {handleApi} from './server/api.mjs';
import {localDatabase} from './server/local-db.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {serviceEntitlement,allowanceView} from './server/service-allowance.mjs';
import {newJourney,makePlan,emptyWorkspace} from './dist/guidance.js';
import {createDashboardController} from './dist/dashboard-controller.js';
import {openaiFixture} from './tests/openai-fixture.mjs';
const blocked=['Remove the prerequisite flag for EGR 2412.','Dismiss that review warning.','Change the prerequisite of EGR3304.','Register me for CSC1401.','Send an email to my adviser.','Upload a screenshot of my flowchart.'];
for(const text of blocked){assert.ok(unsupportedOperation(text),text);assert.doesNotMatch(unsupportedOperation(text).message,/Report a mistake/);}
for(const [text,stage] of [['Change my minor to mathematics.','direction'],['Recommend a minor with no additional courses.','change'],['Replace the elective with CSC1401.','courses'],['Recommend different companies and exchange destinations.','targets'],['Make all regular semesters six courses and summers two courses.','pace'],['Remove the warning by moving CSC1401 earlier.','pace']]){assert.equal(unsupportedOperation(text),null,text);assert.ok(clearlySupportedOperation(text,stage),text);}
assert.equal(unsupportedOperation('Do not remove the prerequisite warning.'),null);
assert.throws(()=>validateCapabilityOutput({answer:'Please share the flowchart excerpt before I can remove the flag.'}),e=>e.code==='CAPABILITY_OUTPUT');
assert.throws(()=>validateCapabilityOutput({update:{summary:'I removed the prerequisite warning.'}}),e=>e.code==='CAPABILITY_OUTPUT');
assert.doesNotThrow(()=>validateCapabilityOutput({answer:'I cannot receive screenshots here. Describe the issue in text.'}));
const j=newJourney();j.programChosen=true;j.profile.program='BSEMS';
let paid=0;const forbidden=async()=>{paid++;assert.fail('Unsupported operations cannot call a provider.');};
for(const stage of ['setup','direction','courses','targets','pace','replan','change','question']){
 const input={...j,stage,refinement:blocked[0],question:blocked[0],changeRequest:blocked[0]};
 const result=await advise(input,{OPENAI_API_KEY:'fixture',OPENAI_WEB_RESEARCH:'off'},forbidden);assert.equal(result.unsupported,true);assert.match(result.summary,/designed not|not programmed/);assert.equal(capabilityContext(stage).input,'Text only; no image, file or attachment input.');
}
const DB=localDatabase(':memory:'),uid='capability-student',BASE='https://app.goplan.local',session=await testSession(DB,uid),entitlement=await serviceEntitlement(DB,uid);
try{
 await DB.prepare('UPDATE service_entitlements SET saved=1,step=5,initial_mask=31 WHERE id=?').bind(entitlement.id).run();
 const before=allowanceView(await serviceEntitlement(DB,uid));
 for(const stage of ['direction','courses','targets','pace','change','question']){
  const response=await handleApi(new Request(BASE+'/api/advice',{method:'POST',headers:{...session,Origin:BASE,'Content-Type':'application/json'},body:JSON.stringify({...j,stage,refinement:blocked[0]})}),{DB},{fetcher:forbidden});
  assert.equal(response.status,200);assert.equal((await response.json()).unsupported,true);
 }
 assert.deepEqual(allowanceView(await serviceEntitlement(DB,uid)),before,'Direct API preflight does not consume an action');
 const plan=makePlan(j),state={...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)},snapshot=JSON.stringify(state),oldFormData=globalThis.FormData,oldFetch=globalThis.fetch;
 try{
  globalThis.FormData=class{constructor(form){this.values=form.values;}get(key){return this.values[key]??null;}};globalThis.fetch=forbidden;
  for(const step of [0,1,2,3,4,5]){
   const runtime={dashboardPanel:step===5?'overview':'semesters',service:{saved:step===5,step,globalRemaining:5,stageChanges:[2,2,2,2,2]}};
   const serviceBefore=JSON.stringify(runtime.service),controller=createDashboardController({runtime,read:()=>state,render(){},persist(){},changed(){},account:()=>({}),close(){}});
   await controller.submit({id:'dashboard-command-form',values:{request:blocked[0]}});
   assert.match(runtime.dashboardNotice,/academic rules/);assert.equal(JSON.stringify(state),snapshot);assert.equal(JSON.stringify(runtime.service),serviceBefore);
  }
 }finally{globalThis.FormData=oldFormData;globalThis.fetch=oldFetch;}
 // A hallucinated attachment request is rejected and repaired before any edit.
 let attempts=0;
 const badProvider=async(_,init)=>{attempts++;const context=JSON.parse(JSON.parse(init.body).input);assert.ok(context.capabilities.policy.includes('Never ask for screenshots'));if(attempts===2)assert.ok(context.repair.reason.includes('unavailable input'));return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({answer:'Please share the flowchart excerpt before removing the flag.',update:{summary:'Share a screenshot.',changes:[],limitations:[]}})}]}]});};
 const guarded=await advise({...j,stage:'question',question:'Why does this course need chemistry?'},{OPENAI_API_KEY:'fixture',OPENAI_WEB_RESEARCH:'off',GOPLAN_TOKEN_COUNTER:async()=>8000},badProvider);
 assert.equal(attempts,2);assert.equal(guarded.unsupported,true);assert.doesNotMatch(guarded.answer,/Please share|Report a mistake/);
 assert.equal(paid,0);
}finally{DB.close();}
console.log('Passed all-stage unsupported-action preflight, zero allowance/provider use, immutable plans, supported-edit classification and attachment hallucination repair. Synthetic provider only.');
