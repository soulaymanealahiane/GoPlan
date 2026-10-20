import assert from 'node:assert/strict';
import {DATA,normalizeProfile,coursesFor,generatePlan} from './dist/planner.js';
import {eligibleCourseOptions,selectionEligibility,prerequisiteCoverage,releaseIneligibleChoices} from './dist/course-eligibility.js';
import {newJourney,suggestChoices,makePlan,validateSavedWorkspace,emptyWorkspace} from './dist/guidance.js';
import {detailsContext,validateDetails,recoverDetails} from './server/advisor.mjs';
import {adviseJourney} from './server/journey-agent.mjs';
import {openaiFixture} from './tests/openai-fixture.mjs';
import {localDatabase} from './server/local-db.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {handleApi} from './server/api.mjs';
import {serviceFixture} from './tests/service-fixture.mjs';
import {courseOptions} from './dist/course-options.js';
import {acceptAdvice} from './dist/journey-state.js';
import {proposeReplan} from './dist/replanning.js';
let passed=0;
async function test(name,body){await body();passed++;console.log('PASS '+name);}
const base=normalizeProfile({program:'BSGE',track:'ME'}),free='bsge-free-1';
const courseRequest={stage:'courses',flowVersion:5,profile:base,questionnaire:{ambitions:'Build useful technology',activities:'Programming and building products',strengths:'Science and engineering'}};
const model=(choices,extra={})=>({summary:'Feasible course choices.',choices,openItems:[],update:{summary:'Updated the course selection.',changes:['Updated elective choices.'],limitations:[]},...extra});
const response=value=>openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const choice=(id,code)=>({requirementId:id,courseCode:code,reason:'Fits the degree and its covered prerequisites.'});

await test('General Engineering never substitutes CSC1402 for the required CSC1401',()=>{
 const rows=coursesFor(base);assert.ok(rows.some(c=>c.code==='CSC1402'));assert.ok(!rows.some(c=>c.code==='CSC1401'));
 assert.deepEqual(DATA.courses.CSC2302.rule.all,['CSC1401']);
 const slot=rows.find(c=>c.id===free);assert.ok(courseOptions(slot,base).some(c=>c.code==='CSC2302'),'Keep catalogue/manual scope intact.');
 assert.ok(!eligibleCourseOptions(slot,base).some(c=>c.code==='CSC2302'));
 const context=detailsContext({profile:base});for(const r of context.requirements)assert.ok(!r.options.includes('CSC2302'));
 assert.ok(!context.catalog.some(c=>c.code==='CSC2302'));
 assert.throws(()=>validateDetails(model([choice(free,'CSC2302')]),{profile:base},false),/CSC1401/);
});
await test('Exact prior study supports a prerequisite, while a different programming code does not',()=>{
 const withPrior=normalizeProfile({...base,priorCodes:['CSC1401']});assert.ok(eligibleCourseOptions(coursesFor(withPrior).find(c=>c.id===free),withPrior).some(c=>c.code==='CSC2302'));
 const engineer=normalizeProfile({...base,priorCodes:['CSC1402']});assert.ok(!eligibleCourseOptions(coursesFor(engineer).find(c=>c.id===free),engineer).some(c=>c.code==='CSC2302'));
});
await test('Core, selected electives and complete chains are checked without inventing extra requirements',()=>{
 const cs=normalizeProfile({program:'BSCSC',track:'SE'});assert.ok(prerequisiteCoverage(coursesFor(cs),[]).covered.has('CSC2302'));
 const chosen=normalizeProfile({...base,choices:{[free]:'CSC2302'}}),raw=JSON.stringify(chosen),released=releaseIneligibleChoices(chosen);
 assert.equal(released.profile.choices[free],undefined);assert.ok(released.removed.some(c=>c.courseCode==='CSC2302'));assert.equal(JSON.stringify(chosen),raw);
 assert.equal(coursesFor(released.profile).length,coursesFor(base).length);assert.ok(!coursesFor(released.profile).some(c=>c.code==='CSC1401'));
 assert.equal(releaseIneligibleChoices(chosen,{protectedIds:[free]}).profile.choices[free],'CSC2302');
 const j=newJourney();j.profile=chosen;j.interests=['technology'];assert.equal(suggestChoices(j).profile.choices[free],undefined);
});
await test('AND, OR, transitive chains, cycles and real corequisites retain their distinct meanings',()=>{
 const row=(id,rule)=>({id,code:id,rule:{all:[],any:[],coreq:[],review:false,...rule}});
 assert.ok(!prerequisiteCoverage([row('A',{all:['B']}),row('B',{all:['C']})]).covered.has('A'));
 assert.ok(prerequisiteCoverage([row('A',{all:['B']}),row('B',{all:['C']})],['C']).covered.has('A'));
 assert.ok(prerequisiteCoverage([row('A',{any:['B','C']})],['C']).covered.has('A'));
 assert.ok(!prerequisiteCoverage([row('A',{all:['B','C']})],['C']).covered.has('A'));
 assert.ok(!prerequisiteCoverage([row('A',{all:['B']}),row('B',{all:['A']})]).covered.has('A'));
 assert.ok(prerequisiteCoverage([row('A',{coreq:['B']}),row('B',{coreq:['A']})]).covered.has('A'));
 assert.ok(!prerequisiteCoverage([row('A',{coreq:['B']}),row('B',{all:['C']})]).covered.has('A'));
});
await test('Invalid model output is rejected and bounded recovery leaves the slot open',()=>{
 const recovered=recoverDetails(model([choice(free,'CSC2302')]),{profile:base},false);
 assert.equal(recovered.choices[free],undefined);assert.ok(recovered.reviewNotes[0].message.includes('CSC1401'));
});
await test('Replaying an old course receipt cannot restore an infeasible elective or spend another prompt',()=>{
 const j=newJourney();j.profile=base;const stale={choices:{[free]:'CSC2302'},agentChoices:{[free]:'CSC2302'},choiceReasons:{[free]:'Old recommendation.'}};
 acceptAdvice(j,'courses',stale);assert.equal(j.profile.choices[free],undefined);assert.equal(j.agentChoices[free],undefined);assert.ok(j.details.openItems.some(x=>x.requirementId===free&&x.reason.includes('CSC1401')));
 assert.equal(stale.choices[free],'CSC2302','Replay guard must not mutate the durable result.');
});
await test('Schedule/global revisions cannot bypass prerequisite validation for a previously pending slot',()=>{
 const j=newJourney();j.profile={...base,choices:{[free]:'CSC2302'}};j.programChosen=true;const plan=makePlan(j),original=JSON.stringify(plan);
 assert.throws(()=>proposeReplan(plan,{choices:[choice(free,'CSC2302')]},'Fall-2026'),/CSC1401/);
 assert.equal(JSON.stringify(plan),original);
 const safe=proposeReplan(plan,{choices:[choice(free,'HIS1301')]},'Fall-2026');assert.equal(safe.candidate.courses.find(c=>c.id===free).code,'HIS1301');
});
await test('All eight undergraduate degrees expose only options whose prerequisite chains are covered',()=>{
 let profiles=0,options=0;
 for(const program of DATA.programs.filter(p=>p.level==='undergraduate'))for(const track of program.tracks.length?program.tracks:[{id:''}]){
  const p=normalizeProfile({program:program.id,track:track.id}),context=selectionEligibility(p);profiles++;
  for(const slot of context.courses.filter(c=>c.choice&&!c.approvalOnly)){
   const allowed=eligibleCourseOptions(slot,p,context),source=new Set(courseOptions(slot,p).filter(o=>!o.topic&&!o.creditsProvisional).map(o=>o.code));
   options+=allowed.length;assert.ok(allowed.every(o=>source.has(o.code)));
   if(!context.coverage.covered.has('CSC1401'))assert.ok(!allowed.some(o=>o.code==='CSC2302'));
   // Also resolve a real recommended option in every degree slot. Exact chain
   // semantics and forged model selections have separate exhaustive fixtures.
   for(const option of allowed.slice(0,1)){
    const selected=normalizeProfile({...p,choices:{...p.choices,[slot.id]:option.code}}),rows=coursesFor(selected),coverage=prerequisiteCoverage(rows,selected.priorCodes);
    assert.ok(coverage.covered.has(option.code),program.id+'/'+track.id+'/'+slot.id+'/'+option.code);
   }
  }
 }
 console.log('Audited '+profiles+' degree/focus combinations and '+options+' selectable options.');
});
await test('Initial course generation sends filtered options before any provider work',async()=>{
 let calls=0;const result=await adviseJourney(courseRequest,{OPENAI_API_KEY:'synthetic',OPENAI_WEB_RESEARCH:'off'},async(_,init)=>{
  calls++;const body=JSON.parse(init.body),context=JSON.parse(body.input);
  const options=Object.values(context.optionSets||{}).flat();assert.ok(!options.includes('CSC2302'));
  assert.ok(!context.catalog.some(c=>c[0]==='CSC2302'));assert.ok(!body.text.format.schema.properties.choices.items.properties.courseCode.enum.includes('CSC2302'));
  return response(model([choice(free,'HIS1301')]));
 });assert.equal(result.choices[free],'HIS1301');assert.equal(calls,1);
});
await test('A legacy invalid selection can be removed by a structural change without a false no-change failure',async()=>{
 const before={...base,choices:{[free]:'CSC2302'}},input={...courseRequest,profile:before,refinement:'Remove Data Structures because my degree has CSC1402, not CSC1401.',replaceableChoices:[]};
 const result=await adviseJourney(input,{OPENAI_API_KEY:'synthetic',OPENAI_WEB_RESEARCH:'off'},async(_,init)=>{
  const context=JSON.parse(JSON.parse(init.body).input);assert.equal(context.currentRecommendation.choices[free],'CSC2302');assert.equal(context.request.profile.choices[free],undefined);
  assert.ok(context.prerequisiteCorrections.some(c=>c.courseCode==='CSC2302'&&c.missing.includes('CSC1401')));
  return response(model([],{intent:'update',answer:''}));
 });assert.equal(result.choices[free],undefined);assert.deepEqual(before.choices,{[free]:'CSC2302'});
});
await test('The real authenticated API returns a corrected course choice and roundtrips a saved workspace',async()=>{
 const DB=localDatabase(':memory:'),uid='elective-prerequisite-fixture',headers=await testSession(DB,uid),actions=await serviceFixture(DB,uid),origin='https://planwithgoplan.com';
 const env={DB,OPENAI_API_KEY:'synthetic',OPENAI_WEB_RESEARCH:'off',GOPLAN_TOKEN_COUNTER:async()=>1000},api=(route,method='GET',body)=>handleApi(new Request(origin+route,{method,headers:{...headers,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{fetcher:async()=>response(model([choice(free,'HIS1301')],{intent:'update',answer:''}))});
 const result=await api('/api/advice','POST',{...courseRequest,profile:{...base,choices:{[free]:'CSC2302'}},refinement:'Replace this elective with one whose prerequisites are in my degree.',serviceAction:actions[0]});
 const body=await result.json();assert.equal(result.status,200,JSON.stringify(body));assert.equal(body.choices[free],'HIS1301');
 const j=newJourney();j.profile={...base,choices:body.choices};j.programChosen=true;const plan=makePlan(j),workspace={...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)};validateSavedWorkspace(structuredClone(workspace));
 const terms=generatePlan(j.profile),selected=plan.courses.find(c=>c.id===free);assert.equal(selected.code,'HIS1301');assert.ok(!terms.find(t=>t.id==='pending')?.courses.includes(free));
 assert.equal((await api('/api/account/profile','POST',{firstName:'Synthetic',lastName:'Prerequisites',consentCloud:true})).status,200);
 const id=crypto.randomUUID(),saved=await api('/api/account/workspaces/'+id,'PUT',{revision:0,state:workspace});assert.equal(saved.status,200,await saved.text());
 const reload=await api('/api/account/workspaces/'+id);assert.equal(reload.status,200);assert.ok(JSON.stringify(await reload.json()).includes('HIS1301'));
});
console.log('Passed '+passed+' elective prerequisite groups. Synthetic provider and isolated storage only.');
