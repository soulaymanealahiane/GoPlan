import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DATA,normalizeProfile,coursesFor,generatePlan,validatePlan,creditsOf} from './dist/planner.js';
import {newJourney,suggestChoices,makePlan,emptyWorkspace,validateSavedWorkspace} from './dist/guidance.js';
import {refreshMinorDraft} from './dist/dashboard-flow.js';
import {acceptAdvice} from './dist/journey-state.js';
import {buildProposal} from './dist/workspace-flow.js';
import {dashboardView} from './dist/dashboard-view.js';
import {advise} from './server/advisor.mjs';
import {JEV_URL} from './server/jev.mjs';
import {jevFixture} from './tests/jev-fixture.mjs';
import {localDatabase} from './server/local-db.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {handleApi} from './server/api.mjs';
import {serviceEntitlement,allowanceView} from './server/service-allowance.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./tests/fixtures/bba-placement-v77.json',import.meta.url)));
const pending=plan=>(plan.terms.find(t=>t.id==='pending')?.courses||[]).map(id=>plan.courses.find(c=>c.id===id));
function assertScheduled(plan){
 assert.deepEqual(pending(plan),[],'Ordinary BBA requirements must not silently accumulate in Needs placement.');
 const when=code=>plan.terms.findIndex(t=>t.id!=='pending'&&t.courses.some(id=>plan.courses.find(c=>c.id===id)?.code===code));
 for(const code of ['ACC2301','ECO2301','GBU2301'])assert.ok(when('MTH1305')<when(code),code+' must follow Mathematics for Business.');
 assert.ok(when('ACC2301')<when('ACC2302'));assert.ok(when('ECO2301')<when('ECO2302'));
 assert.ok(when('ACC2302')<when('FIN3301'));assert.ok(when('ECO2302')<when('FIN3301'));
 assert.equal(new Set(plan.terms.flatMap(t=>t.courses)).size,plan.courses.length);
 assert.equal(plan.terms.flatMap(t=>t.courses).length,plan.courses.length);
 assert.deepEqual(validatePlan(plan.terms,plan.courses,plan.profile,plan.scheduling).filter(i=>i.level==='conflict'),[]);
}
function oldPlan(){
 const j=newJourney();j.profile=normalizeProfile(fixture.profile);j.programChosen=true;
 const plan=makePlan(j),math=plan.courses.find(c=>c.id==='bba-math');
 Object.assign(math,{code:'',title:'Mathematics requirement',unresolved:true,rule:{all:[],any:[],coreq:[],minCredits:0,review:true}});
 plan.terms=structuredClone(fixture.terms);plan.finalizedAt='2026-10-28T00:00:00.000Z';return plan;
}
const broken=oldPlan(),original=JSON.stringify(broken);
assert.equal(pending(broken).length,21);assert.equal(creditsOf(pending(broken)),60,'Reproduce the exact 60-credit incident.');
const state={...emptyWorkspace(),phase:'saved',plan:broken,journey:newJourney(broken)};
const repaired=refreshMinorDraft(validateSavedWorkspace(structuredClone(state)));
assert.equal(repaired.phase,'draft');assertScheduled(repaired.draftPlan);
assert.equal(JSON.stringify(repaired.plan),original,'The original saved plan remains available until the repair is saved.');
assert.equal(creditsOf(repaired.draftPlan.courses),creditsOf(broken.courses));assert.equal(repaired.draftPlan.courses.length,broken.courses.length);
assert.deepEqual(repaired.draftPlan.profile.choices,broken.profile.choices);assert.deepEqual(repaired.draftPlan.targets,broken.targets);
assert.equal(repaired.draftPlan.id,broken.id);assert.equal(repaired.draftPlan.createdAt,broken.createdAt);
assert.equal(refreshMinorDraft(repaired),repaired,'The repair must be idempotent on reload.');
assertScheduled(validateSavedWorkspace(JSON.parse(JSON.stringify(repaired))).draftPlan);

// Fixed, source-confirmed mathematics is present even if an old model receipt
// omits it. Language, Arabic and civic placement slots must remain open.
const compulsory=coursesFor(fixture.profile);
assert.equal(compulsory.find(c=>c.id==='bba-math').code,'MTH1305');
assert.equal(DATA.courses.MTH1305.title,'Mathematics for Business');assert.equal(DATA.courses.MTH1305.credits,3);
for(const id of ['bba-arabic','bba-french','bba-civic'])assert.equal(compulsory.find(c=>c.id===id)?.code,'');
const tracks=DATA.programs.find(p=>p.id==='BBA').tracks;let combinations=0;
for(const track of tracks)for(const secondTrack of ['',...tracks.map(t=>t.id)].filter(id=>id!==track.id))for(const regularCourses of [5,6])for(const summers of [false,true]){
 const j=newJourney();j.profile=normalizeProfile({...fixture.profile,track:track.id,secondTrack,regularCourses,summers,gpa:3.5});j.profile=suggestChoices(j).profile;
 const plan=makePlan(j);assertScheduled(plan);
 combinations++;
}
assert.equal(combinations,324);

// Exercise the current hybrid course/pace agents and the receipt acceptance
// path, with no network calls or paid inference.
const journey=newJourney();journey.profile=normalizeProfile(fixture.profile);journey.programChosen=true;
journey.questionnaire={ambitions:'Analyze business and financial technology.',activities:'Work with mathematics and data.',strengths:'Mathematics.'};
let calls=0;
for(const stage of ['courses','pace']){
 const result=await advise({...journey,stage},{GOPLAN_HYBRID:'on',TYPESAFE_API_KEY:'synthetic-jev',OPENAI_API_KEY:'synthetic-openai',OPENAI_WEB_RESEARCH:'off'},async(url,init)=>{
  assert.equal(url,JEV_URL);calls++;return jevFixture(JSON.parse(init.body),{pick:{regular:'5',summer:'2',summers:'yes'}});
 });
 assert.equal(result.source,'hybrid');acceptAdvice(journey,stage,result);
}
assert.equal(calls,2);assertScheduled(buildProposal(journey));

// Pre-fix semester receipts must not restore the broken map over a fresh plan.
const legacy=newJourney();legacy.profile=normalizeProfile(fixture.profile);
legacy.semesterSequence={key:JSON.stringify(['program','track','secondTrack','minor','choices','regularCourses','summerCourses','summers','startYear','lc','priorCodes','exchange'].map(k=>legacy.profile[k])),terms:fixture.terms,assessment:{}};
assertScheduled(buildProposal(legacy));

// Recorded study and semester notes survive the repair. Deliberate personal
// edits and manually overridden/recorded math are never silently regenerated.
const progress=oldPlan(),completed=progress.courses.find(c=>c.code==='FYE1101'),current=progress.courses.find(c=>c.code==='ENG1301');
progress.tracking[completed.id]={status:'completed',grade:'A',note:'Retain completed note'};
progress.tracking[current.id]={status:'in-progress',grade:'',note:'Retain current note'};
progress.terms[0].note='Retain semester note';
const withProgress=refreshMinorDraft({...state,plan:progress,journey:newJourney(progress)});
assert.deepEqual(withProgress.draftPlan.tracking[completed.id],progress.tracking[completed.id]);
assert.deepEqual(withProgress.draftPlan.tracking[current.id],progress.tracking[current.id]);
assert.equal(withProgress.draftPlan.terms.find(t=>t.courses.includes(current.id)).id,progress.terms.find(t=>t.courses.includes(current.id)).id);
assert.equal(withProgress.draftPlan.terms.find(t=>t.id===progress.terms[0].id).note,'Retain semester note');
for(const change of [p=>p.manualEdits={version:1,removedIds:[],placements:{}},p=>p.courses.find(c=>c.id==='bba-math').manualOverride=true,p=>p.tracking['bba-math']={status:'completed',grade:'',note:'My recorded requirement'}]){
 const plan=oldPlan();change(plan);const workspace={...state,plan,journey:newJourney(plan)};assert.equal(refreshMinorDraft(workspace),workspace);
}
const runtime={dashboardPanel:'semesters',selectedTerm:'pending',service:{saved:true,globalRemaining:0}};
assert.match(dashboardView(state,runtime,{firstName:'Synthetic'}),/21 courses need semester placement/);
assert.ok(!dashboardView(repaired,runtime,{firstName:'Synthetic'}).includes('21 courses need semester placement'));

// Real authenticated HTTP/storage roundtrip at zero AI allowance: the repair
// must remain saveable without another paid action or allowance reset.
const DB=localDatabase(':memory:'),base='https://planwithgoplan.com',uid='synthetic-placement-recovery',id=crypto.randomUUID();
try{
 const headers={...await testSession(DB,uid),'Content-Type':'application/json',Origin:base},env={DB};
 const call=(path,method='GET',body)=>handleApi(new Request(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),env);
 assert.equal((await call('/api/account/profile','POST',{firstName:'Synthetic',lastName:'Placement',consentCloud:true})).status,200);
 const entitlement=await serviceEntitlement(DB,uid);
 await DB.prepare('UPDATE service_entitlements SET step=5,saved=1,global_used=5,initial_mask=31,change0=2,change1=2,change2=2,change3=2,change4=2 WHERE id=?').bind(entitlement.id).run();
 assert.equal((await call('/api/account/workspaces/'+id,'PUT',{revision:0,state})).status,200);
 const allowance=allowanceView(await serviceEntitlement(DB,uid));
 const loaded=(await (await call('/api/account/workspaces/'+id)).json()).state;
 const preview=refreshMinorDraft(validateSavedWorkspace(loaded));assertScheduled(preview.draftPlan);
 assert.equal((await call('/api/account/workspaces/'+id,'PUT',{revision:1,state:preview})).status,200);
 const saved={...preview,phase:'saved',plan:preview.draftPlan,draftPlan:null};saved.plan.finalizedAt=new Date().toISOString();
 assert.equal((await call('/api/account/workspaces/'+id,'PUT',{revision:2,state:saved})).status,200);
 assertScheduled((await (await call('/api/account/workspaces/'+id)).json()).state.plan);
 assert.deepEqual(allowanceView(await serviceEntitlement(DB,uid)),allowance);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM student_workspaces').first()).n,1);
}finally{DB.close();}
console.log('Passed exact 21-course/60-credit reproduction, source-backed required mathematics, 324 BBA concentration/load/summer combinations, hybrid agents, stale receipt rejection, protected study and notes, manual-edit isolation, placement visibility, and authenticated save/reload with exhausted AI allowance. Synthetic providers only.');
