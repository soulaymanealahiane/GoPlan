import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {normalizeProfile,coursesFor,generatePlan,validatePlan,termOrder,termLimits} from './dist/planner.js';
import {newJourney,makePlan,emptyWorkspace,validateSavedWorkspace} from './dist/guidance.js';
import {proposeReplan,replanSnapshot,restoreSnapshot} from './dist/replanning.js';
import {acceptAdvice} from './dist/journey-state.js';
import {buildProposal} from './dist/workspace-flow.js';
import {semesterContext} from './server/semester-context.mjs';
import {semesterUpdate} from './dist/semester-edits.js';
import {advise} from './server/advisor.mjs';
import {openaiFixture} from './tests/openai-fixture.mjs';
import {createWorkbook} from './dist/export.js';
import {dashboardView} from './dist/dashboard-view.js';
import {localDatabase} from './server/local-db.mjs';
import {handleApi} from './server/api.mjs';
import {serviceEntitlement,beginServiceAction,allowanceView} from './server/service-allowance.mjs';
import {testSession} from './tests/session-fixture.mjs';

const j=newJourney();j.programChosen=true;j.questionnaire={ambitions:'Build engineering products.',activities:'Program and design.',strengths:'Mathematics.'};
j.profile=normalizeProfile({program:'BSGE',track:'ME',priorCodes:['FRN3210','CSC1402'],choices:{'bsge-free-1':'MTH1304','bsge-free-2':'CSC2302','bsge-history':'HIS1301','bsge-humanities':'LIT2301','bsge-arts':'ART1301','bsge-social':'PSY1301','bsge-civic':'CIP2100','bsge-me-1':'EGR3301','bsge-me-2':'EGR3302'}});
const base=makePlan(j),original=JSON.stringify(base),boundary='Fall-2026',of=(p,id)=>p.terms.find(t=>t.courses.includes(id));
const request='Make all regular semesters six courses, keep summer sessions at two. Replace Discrete Mathematics for Engineers with CSC 1401 in my existing free elective so I can take Data Structures without adding a course on top of my degree.';
const change={track:base.profile.track,secondTrack:'',minor:'',pace:'accelerated',regularCourses:6,summerCourses:2,summers:true,choices:[{requirementId:'bsge-free-1',courseCode:'CSC1401',reason:'Covers Data Structures in the existing elective slot.'}],moves:[],termLoads:[],unavailable:[]};
const response=value=>openaiFixture({status:'completed',model:'fixture',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const env={OPENAI_WEB_RESEARCH:'off',OPENAI_API_KEY:'fixture-key',OPENAI_MODEL:'gpt-6.1-sol',GOPLAN_TOKEN_COUNTER:async body=>Math.ceil(JSON.stringify(body).length/4)};
let providerCalls=0;
const result=await advise({...j,stage:'pace',flowVersion:5,refinement:request,plan:replanSnapshot(base),currentTerm:boundary,loadEligibility:'unconfirmed'},env,async(_,init)=>{
 providerCalls++;const body=JSON.parse(init.body),context=JSON.parse(body.input),schema=body.text.format.schema;
 assert.ok(body.max_output_tokens>=4000);assert.ok(context.plan.terms.length);assert.ok(context.currentCourses.some(c=>c.code==='CSC1402'));
 assert.ok(context.requirements.find(r=>r.id==='bsge-free-1').options.includes('CSC1401'));
 assert.ok(schema.properties.change.properties.moves);assert.ok(schema.properties.change.properties.termLoads);
 assert.match(context.task,/atomic|together/);assert.match(context.task,/never append/);
 assert.ok(!init.body.includes('PRIVATE'));
 return response({kind:'propose',intent:'update',answer:'',summary:'All semesters are exactly six and approved.',questions:[],change,update:{summary:'Everything approved.',changes:['Deleted extra courses.'],limitations:[]}});
});
assert.equal(providerCalls,1);assert.equal(result.regularCourses,6);assert.equal(result.summerCourses,2);
assert.match(result.update.summary,/MTH1304.*CSC1401/);assert.ok(!result.update.summary.includes('approved'));
assert.ok(result.update.limitations.some(s=>s.includes('conditional')));assert.ok(result.update.limitations.some(s=>s.includes('fewer')));
j.refinements.pace=request;acceptAdvice(j,'pace',result,{plan:base,currentTerm:boundary});
const edited=buildProposal(j),code1401=edited.courses.find(c=>c.code==='CSC1401'),structures=edited.courses.find(c=>c.code==='CSC2302');
assert.equal(edited.courses.length,base.courses.length);assert.equal(edited.profile.program,'BSGE');assert.equal(edited.courses.find(c=>c.code==='CSC1402').id,'csc1402');
assert.equal(code1401.id,'bsge-free-1');assert.ok(termOrder(of(edited,code1401.id))<termOrder(of(edited,structures.id)));
assert.ok(!edited.courses.some(c=>c.id.startsWith('support-')));assert.equal(edited.profile.summerCourses,2);
assert.equal(JSON.stringify(base),original,'The base draft must remain immutable until the validated edit is accepted');
const state={...emptyWorkspace(),journey:j,phase:'draft',draftPlan:edited};
const restored=validateSavedWorkspace(JSON.parse(JSON.stringify(state)));
assert.deepEqual(restored.draftPlan.terms,edited.terms);assert.deepEqual(buildProposal(restored.journey).terms,edited.terms,'Reloading must not discard an accepted sequence');
const annotated=structuredClone(edited);annotated.terms[0].note='Keep this personal note';assert.equal(newJourney(annotated).semesterSequence,null,'Later personal edits must invalidate an old cached sequence');
const html=dashboardView(restored,{dashboardPanel:'semesters',service:{step:4,saved:false,initialMask:31,stageChanges:[2,2,2,2,1]}},{firstName:'Test'});
assert.ok(!html.includes('aria-label="Plan update"'));assert.ok(!html.includes('conditional draft'));assert.ok(restored.draftPlan.courses.some(c=>c.code==='CSC1401'));

const lower=proposeReplan(edited,{termLoads:[{termId:'Fall-2027',courseCount:4}],allowConditionalLoad:true},boundary);
assert.equal(lower.assessment.canApply,true);assert.equal(lower.candidate.profile.regularCourses,6);assert.equal(lower.candidate.profile.summerCourses,2);
const target=of(lower.candidate,structures.id);assert.notEqual(target.id,'pending');
for(const t of lower.candidate.terms.filter(t=>!['prior','pending'].includes(t.id))){const cap=termLimits(lower.candidate.profile,t,lower.candidate.scheduling),courses=t.courses.map(id=>lower.candidate.courses.find(c=>c.id===id));assert.ok(courses.filter(c=>c.loadCredits>0).length<=cap.count);assert.ok(courses.reduce((n,c)=>n+c.loadCredits,0)<=cap.credits);}
assert.equal(lower.candidate.terms.find(t=>t.id==='Fall-2027').courses.filter(id=>lower.candidate.courses.find(c=>c.id===id).loadCredits>0).length,4);
const lifted=proposeReplan(lower.candidate,{termLoads:[{termId:'Fall-2027',courseCount:-1}],allowConditionalLoad:true},boundary);assert.equal(lifted.candidate.scheduling.termLoads,undefined);
const pinned=proposeReplan(edited,{moves:[{requirementId:'bsge-free-1',termId:'Spring-2027'},{requirementId:'bsge-free-2',termId:'Fall-2027'}],allowConditionalLoad:true},boundary);
assert.equal(pinned.assessment.canApply,true);assert.equal(of(pinned.candidate,'bsge-free-1').id,'Spring-2027');assert.equal(of(pinned.candidate,'bsge-free-2').id,'Fall-2027');
assert.deepEqual(restoreSnapshot(replanSnapshot(pinned.candidate)).scheduling,pinned.candidate.scheduling);
const released=proposeReplan(pinned.candidate,{moves:[{requirementId:'bsge-free-1',termId:''}],allowConditionalLoad:true},boundary);assert.ok(!released.candidate.scheduling.moves.some(m=>m.requirementId==='bsge-free-1'));
const impossible=proposeReplan(edited,{moves:[{requirementId:'bsge-free-1',termId:'Spring-2027'},{requirementId:'bsge-free-2',termId:'Fall-2026'}],allowConditionalLoad:true},boundary);assert.equal(impossible.assessment.canApply,false,'Do not silently ignore an impossible prerequisite placement');
const fixed=structuredClone(edited);fixed.tracking['bsge-free-1']={status:'in-progress',grade:'PRIVATE',note:'PRIVATE'};
assert.throws(()=>proposeReplan(fixed,{moves:[{requirementId:'bsge-free-1',termId:'Fall-2028'}],allowConditionalLoad:true},of(fixed,'bsge-free-1').id),/cannot be moved/);
assert.throws(()=>proposeReplan(fixed,{choices:[{requirementId:'bsge-free-1',courseCode:'MTH1304'}]},boundary),/cannot be replaced/);
assert.throws(()=>proposeReplan(edited,{choices:[{requirementId:'csc1402',courseCode:'CSC1401'}]},boundary),/verified equivalent/);
assert.throws(()=>proposeReplan({...base,profile:{...base.profile,gpa:2.5}},{...change,allowConditionalLoad:true},boundary),/CGPA/);
assert.throws(()=>proposeReplan(edited,{termLoads:[{termId:'Summer-2027',courseCount:6}],allowConditionalLoad:true},boundary),/degree.*limit/);
assert.throws(()=>proposeReplan(edited,{moves:[{requirementId:'bsge-history',termId:'Fall-2025'}]},boundary),/past semester/);
const breakPlan=proposeReplan(edited,{termLoads:[{termId:'Fall-2027',courseCount:0}],allowConditionalLoad:true},boundary);assert.equal(breakPlan.assessment.canApply,true);assert.equal(breakPlan.candidate.terms.find(t=>t.id==='Fall-2027').courses.length,0);
const noop=proposeReplan(edited,{allowConditionalLoad:true},boundary);const noUpdate=semesterUpdate(edited,noop.candidate,noop.assessment,{});assert.equal(noUpdate.changes.length,0);assert.match(noUpdate.summary,/unchanged/);
const atomic=proposeReplan({...base,profile:{...base.profile,choices:{...base.profile.choices,'bsge-free-2':'MTH2304'}},courses:coursesFor({...base.profile,choices:{...base.profile.choices,'bsge-free-2':'MTH2304'}})},{...change,choices:[...change.choices,{requirementId:'bsge-free-2',courseCode:'CSC2302'}],allowConditionalLoad:true},boundary);assert.equal(atomic.assessment.canApply,true);
assert.ok(semesterContext(base,request).catalog.some(c=>c.code==='CSC1401'));

// Inspect the produced XLSX package, rather than only checking string templates.
const pendingId='bsge-history',exportPlan=structuredClone(edited);for(const t of exportPlan.terms)t.courses=t.courses.filter(id=>id!==pendingId);let pending=exportPlan.terms.find(t=>t.id==='pending');if(!pending){pending={id:'pending',season:'Pending',year:0,courses:[]};exportPlan.terms.push(pending);}pending.courses.push(pendingId);
const zip=await createWorkbook(exportPlan.terms,exportPlan.courses,exportPlan.profile,[],[],await fs.readFile('dist/template-styles.xml','utf8'),exportPlan),buffer=Buffer.from(zip),entries={};
for(let offset=0;buffer.readUInt32LE(offset)===0x04034b50;){const size=buffer.readUInt32LE(offset+18),n=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),start=offset+30+n+extra;entries[buffer.subarray(offset+30,offset+30+n).toString()]=buffer.subarray(start,start+size).toString();offset=start+size;}
assert.ok(entries['xl/worksheets/sheet1.xml'].includes('Needs placement'));assert.ok(entries['xl/worksheets/sheet1.xml'].includes('HIS1301'),'Unscheduled courses must be included in the main semester layout.');assert.ok(!entries['xl/worksheets/sheet1.xml'].includes('Projects &amp; Start-Up Dev'));assert.ok(!entries['xl/worksheets/sheet1.xml'].includes('<c r="C'));assert.ok(!entries['xl/worksheets/sheet1.xml'].includes('ref="C1:'));
assert.ok(entries['xl/worksheets/sheet2.xml'].includes('Needs placement'));assert.ok(entries['xl/worksheets/sheet2.xml'].includes('HIS1301'),'Unscheduled courses must also remain visible in Course details');
// Actual authenticated HTTP handlers and durable stage receipts, in memory only.
const DB=localDatabase(':memory:'),uid='semester-http-fixture',session=await testSession(DB,uid),BASE='https://planwithgoplan.com';let httpProviderCalls=0;
try{
 const row=await serviceEntitlement(DB,uid);await DB.prepare('UPDATE service_entitlements SET step=4,initial_mask=31 WHERE id=?').bind(row.id).run();
 let providerChange=change;
 const provider=async(url)=>{assert.equal(url,'https://api.openai.com/v1/responses');httpProviderCalls++;return response({kind:'propose',intent:'update',answer:'',summary:'A proposed edit.',questions:[],change:providerChange,update:{summary:'Proposed changes.',changes:[],limitations:[]}});};
 const call=(path,method='GET',body)=>handleApi(new Request(BASE+path,{method,headers:{Origin:BASE,...session,'Content-Type':'application/json','X-GoPlan-Session':'semester-http-fixture'},...(body?{body:JSON.stringify(body)}:{})}),{...env,DB},{fetcher:provider});
 const action1=(await beginServiceAction(DB,uid,{kind:'stage',step:4,id:crypto.randomUUID()})).action;
 const firstBody={...base.decisions,stage:'pace',flowVersion:5,profile:base.profile,refinement:request,plan:replanSnapshot(base),currentTerm:boundary,serviceAction:action1};
 let reply=await call('/api/advice','POST',firstBody);const first=await reply.json();assert.equal(reply.status,200,JSON.stringify(first));
 const replay=await call('/api/advice','POST',firstBody);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),first);assert.equal(httpProviderCalls,1,'A repeated HTTP response must reuse its durable receipt');
 const journey=structuredClone(base.decisions);acceptAdvice(journey,'pace',first,{plan:base,currentTerm:boundary});const firstDraft=buildProposal(journey);
 const action2=(await beginServiceAction(DB,uid,{kind:'stage',step:4,id:crypto.randomUUID()})).action;
 providerChange={...change,choices:[],termLoads:[{termId:'Fall-2027',courseCount:4}]};
 const nextBody={...journey,stage:'pace',refinement:'Make Fall 2027 four courses and rebalance the remaining future semesters.',plan:replanSnapshot(firstDraft),currentTerm:boundary,serviceAction:action2};
 reply=await call('/api/advice','POST',nextBody);const second=await reply.json();assert.equal(reply.status,200,JSON.stringify(second));assert.equal(httpProviderCalls,2);
 acceptAdvice(journey,'pace',second,{plan:firstDraft,currentTerm:boundary});const finalDraft=buildProposal(journey);
 assert.equal(finalDraft.terms.find(t=>t.id==='Fall-2027').courses.length,4);assert.equal(allowanceView(await serviceEntitlement(DB,uid)).stageChanges[4],0);
 await assert.rejects(beginServiceAction(DB,uid,{kind:'stage',step:4,id:crypto.randomUUID()}));assert.equal(httpProviderCalls,2);
 assert.equal((await call('/api/account/profile','POST',{firstName:'Synthetic',lastName:'Student',consentCloud:true})).status,200);
 const workspaceId=crypto.randomUUID(),workspace={...emptyWorkspace(),journey,phase:'draft',draftPlan:finalDraft};
 reply=await call('/api/account/workspaces/'+workspaceId,'PUT',{revision:0,state:workspace});assert.equal(reply.status,200,await reply.text());
 reply=await call('/api/account/workspaces/'+workspaceId);const cloud=await reply.json();assert.equal(reply.status,200);assert.deepEqual(cloud.state.draftPlan.terms,finalDraft.terms);assert.deepEqual(buildProposal(cloud.state.journey).terms,finalDraft.terms);
}finally{DB.close();}
console.log('Passed semester-stage agent edits, reported BSGE prerequisite swap, independent 6/2 loads, persisted sequence, per-term workloads and breaks, exact course moves, atomic replacements, protected work, impossible placement rejection, truthful change summaries and two-column XLSX export. Synthetic provider only.');
