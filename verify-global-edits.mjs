import assert from 'node:assert/strict';
import {advise,availableTargets} from './server/advisor.mjs';
import {academicEdit,requestedEdit,enforceEditRoute,minorEditOption} from './server/edit-intent.mjs';
import {openaiFixture} from './tests/openai-fixture.mjs';
import {newJourney,makePlan,suggestChoices,emptyWorkspace,validateSavedWorkspace} from './dist/guidance.js';
import {normalizeProfile,coursesFor} from './dist/planner.js';
import {agentContext} from './dist/agent-context.js';
import {localDatabase} from './server/local-db.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {serviceEntitlement} from './server/service-allowance.mjs';
import {handleApi} from './server/api.mjs';
import {createDashboardController} from './dist/dashboard-controller.js';

const env={OPENAI_API_KEY:'synthetic-global-edits',OPENAI_WEB_RESEARCH:'off',OPENAI_DIRECTION_RESEARCH:'off',GOPLAN_TOKEN_COUNTER:async()=>1000};
const update={summary:'Untrusted model prose.',changes:[],limitations:[]};
const response=value=>openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const refusal='I cannot safely implement the replacement until the Mathematics minor rules establish that it fits. Unrelated old questionnaire narrative.';
const q={ambitions:'Build useful software.',activities:'Write programs and solve mathematical problems.',strengths:'Logical analysis.',constraints:'PRIVATE-OLD-NARRATIVE'};
function seed(program='BSGE'){
 const j=newJourney();j.profile=normalizeProfile({program,track:program==='BSGE'?'CS':'SE',minor:'business-administration',choices:{}});j.questionnaire=q;j.programChosen=true;j.profile=suggestChoices(j).profile;
 j.details={choices:j.profile.choices,summary:'Selected courses.',...Object.fromEntries(['internships','exchanges'].map(type=>[type,availableTargets(type,j.profile).slice(0,5).map((t,i)=>({...t,tier:i<3?'reach':i===3?'target':'safety',reason:'Keep this recommendation.'}))]))};
 return makePlan(j);
}
const p=seed().profile;
for(const text of ['Change my minor to Mathematics.','Can you switch my minor to math?','I want Mathematics as my minor.','Please replace my minor with Mathematics.','Keep my degree and change my minor to Mathematics.','Make my minor Mathematics.'])assert.equal(academicEdit(text,p).patch.minor,'mathematics',text);
for(const text of ['Why did you change my minor?','Explain the Mathematics minor.','How can I change my minor?','Should I switch my minor to Mathematics?'])assert.equal(requestedEdit(text).isEdit,false,text);
assert.deepEqual(academicEdit('Change my second specialization to AI.',normalizeProfile({program:'BSCSC',track:'SE'})).patch,{secondTrack:'AI'});
assert.deepEqual(academicEdit('Change my major to BBA Finance and my minor to Computer Science.',p).patch,{program:'BBA',track:'FIN',minor:'computer-science'});
const refused={kind:'answer',startStep:0,summary:refusal,questions:[],sections:[],rebuild:false,instructions:{direction:'',courses:'',companies:'',exchanges:'',semesters:''}};
assert.deepEqual(enforceEditRoute(refused,'Change my minor to Mathematics.').sections,['direction']);
assert.equal(enforceEditRoute(refused,'Change my minor to Mathematics.').kind,'journey');
const noExtra='Change my minor into a minor that will not require me to take a course on top of my degree just for the sake of the prerequisite chaining.';
const comparison=academicEdit(noExtra,p);assert.ok(comparison.patch.minor);assert.ok(comparison.options.some(o=>o.id===comparison.patch.minor&&o.noSupplementaryCourses&&!o.approvalSlots));

let mode='minor',providerCalls=[];
const provider=async(url,init)=>{
 assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(init.body),c=JSON.parse(body.input),stage=body.text.format.name.replace('goplan_','');providerCalls.push(stage);
 if(stage==='change'){
  assert.equal(c.request.questionnaire,undefined);assert.ok(!body.input.includes('PRIVATE-OLD-NARRATIVE'));
  return response({...refused,kind:mode==='clarify'?'clarify':'answer',questions:mode==='clarify'?[refusal]:[],update});
 }
 if(stage==='direction'){
  assert.ok(c.minorEditOptions?.length||mode==='compound');
  // Reproduce a valid provider response that refuses the supported change.
  return response({kind:'clarify',summary:refusal,questions:[refusal],academic:{program:'',track:'',secondTrack:'',minor:'',rationale:'',focusRationale:'',secondFocusRationale:'',minorRationale:''},intent:'clarify',answer:refusal,update});
 }
 if(stage==='courses'){
  const j=newJourney();j.profile=normalizeProfile(c.request.profile);const suggested=suggestChoices(j).profile.choices,ids=new Set(body.text.format.schema.properties.choices.items.properties?.requirementId?.enum||[]);
  assert.ok(!c.plan,'Automatic dependent course filling uses source-validated initial choices.');
  return response({summary:'Courses for the revised direction.',choices:Object.entries(suggested).filter(([id])=>ids.has(id)).map(([requirementId,courseCode])=>({requirementId,courseCode,reason:'Source-supported course selection.'})),openItems:[],update});
 }
 if(stage==='targets'){
  const select=(records,type)=>{const list=c.opportunityPolicy.preserveTypes.includes(type)?c.currentRecommendation[type]:records.slice(0,5),item=t=>({id:t.id,reason:'A suitable option.',tierReason:'',industryReason:'',answerIds:[],evidenceIds:[]});return {reach:list.slice(0,3).map(item),target:[item(list[3])],safety:[item(list[4])]};};
  return response({summary:'New opportunities.',internships:select(c.companies,'internships'),exchanges:select(c.exchangeDestinations,'exchanges'),intent:'update',answer:'',update});
 }
 throw Error('Unexpected specialist '+stage);
};
const DB=localDatabase(':memory:'),uid='global-edit-regression',session=await testSession(DB,uid),baseURL='https://planwithgoplan.com',oldFetch=globalThis.fetch,OldForm=globalThis.FormData;
try{
 globalThis.FormData=class{constructor(form){this.form=form;}get(k){return this.form.values[k];}};
 globalThis.fetch=async(url,init={})=>handleApi(new Request(baseURL+url,{...init,headers:{Origin:baseURL,...session,'Content-Type':'application/json',...init.headers}}),{...env,DB},{fetcher:provider});
 const entitlement=await serviceEntitlement(DB,uid);await DB.prepare('UPDATE service_entitlements SET step=5,saved=1,initial_mask=31 WHERE id=?').bind(entitlement.id).run();
 let state,runtime;
 // Controllers keep the runtime object, so initialize it once per harness.
 async function run(plan,text,scenario){
  mode=scenario;providerCalls=[];runtime={};state={...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)};
  const c=createDashboardController({runtime,read:()=>state,account:()=>({firstName:'Synthetic'}),render(){},changed(){},persist(){},notify(){},modal(){},head:()=>'',close(){},getAdvice(){throw Error('Legacy edit path used.');}});
  await c.loadService();const before=JSON.stringify(plan),remaining=runtime.service.globalRemaining;
  await c.submit({id:'dashboard-command-form',values:{request:text}});assert.equal(runtime.aiError,'',runtime.aiError);assert.equal(state.phase,'draft','An edit must create a real draft, not only an answer.');assert.equal(runtime.service.globalRemaining,remaining-1);assert.equal(JSON.stringify(state.plan),before,'Saved plan stays intact until Save.');assert.ok(state.journey.lastUpdates.global.changes.length);assert.ok(!JSON.stringify(state.journey.lastUpdates.global).includes('Unrelated old questionnaire'));
  validateSavedWorkspace(JSON.parse(JSON.stringify(state)));return structuredClone(state.draftPlan);
 }
 const original=seed();original.tracking.csc1402={status:'completed',note:'PRIVATE-PROTECTED-NOTE'};original.profile.priorCodes.push('CSC1402');
 const mathematics=await run(original,'Change my minor to Mathematics.','minor');
 assert.equal(mathematics.profile.minor,'mathematics');assert.equal(mathematics.profile.program,'BSGE');assert.equal(mathematics.profile.track,'CS');assert.equal(mathematics.tracking.csc1402.note,'PRIVATE-PROTECTED-NOTE');assert.deepEqual(mathematics.targets,original.targets);assert.ok(mathematics.courses.some(c=>c.minorId==='mathematics'));assert.ok(mathematics.courses.some(c=>c.minorId==='mathematics'&&c.approvalOnly));assert.match(state.journey.lastUpdates.global.limitations.join(' '),/approval/);assert.deepEqual(providerCalls,['change','direction','courses']);
 const cs=await run(seed('BSCSC'),'Can you change my minor to Mathematics?','clarify');assert.equal(cs.profile.minor,'mathematics');assert.ok(cs.courses.some(c=>c.id==='mathematics-imath-approved-4'&&!c.code));
 const constraint=await run(original,noExtra,'criteria');assert.notEqual(constraint.profile.minor,original.profile.minor);const fit=minorEditOption(constraint.profile,constraint.profile.minor);assert.equal(fit.noSupplementaryCourses,true);assert.equal(fit.approvalSlots,0);assert.equal(constraint.profile.program,original.profile.program);
 const compoundSeed=seed('BSCSC');compoundSeed.profile.priorCodes.push('CSC1401');compoundSeed.tracking.csc1401={status:'completed',note:'Synthetic prior programming.'};
 const compound=await run(compoundSeed,'Change my major to BBA Finance, my minor to Computer Science, and recommend new companies and exchange destinations.','compound');assert.equal(compound.profile.program,'BBA');assert.equal(compound.profile.track,'FIN');assert.equal(compound.profile.minor,'computer-science');
 assert.ok(compound.targets.internships.some(t=>!original.targets.internships.some(x=>x.id===t.id)));
 // A rejected router answer cannot poison the next explicit follow-up.
 const follow=await run(original,noExtra+' Additional detail: change my minor to Mathematics.','minor');assert.equal(follow.profile.minor,'mathematics');
 const profile=await globalThis.fetch('/api/account/profile',{method:'POST',body:JSON.stringify({firstName:'Synthetic',lastName:'Student',consentCloud:true})});assert.equal(profile.status,200);
 const id=crypto.randomUUID();const saved=await globalThis.fetch('/api/account/workspaces/'+id,{method:'PUT',body:JSON.stringify({revision:0,state})});assert.equal(saved.status,200,await saved.text());const reload=await globalThis.fetch('/api/account/workspaces/'+id);assert.equal((await reload.json()).state.draftPlan.profile.minor,'mathematics');
}finally{globalThis.fetch=oldFetch;globalThis.FormData=OldForm;DB.close();}
console.log('Passed global edit-vs-answer enforcement, explicit minor/major/focus parsing, source-based prerequisite comparison, Mathematics and Individual Minor drafts with open approvals, hostile irrelevant prose isolation, protected progress, compound edits, five single-allowance transactions and cloud roundtrip. Synthetic providers only.');
