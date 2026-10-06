// User offering input -> saved roadmap -> adviser -> exported shared document.
// No provider/network calls: the Groq fixture exercises its real wire adapter.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {groqFixture} from './tests/groq-fixture.mjs';
import {normalizeProfile} from './dist/planner.js';
import {newJourney,makePlan,emptyWorkspace,validateSavedWorkspace,planIssues} from './dist/guidance.js';
import {previousFor} from './dist/agent-context.js';
import {mergeScheduling,courseAvailability} from './dist/course-availability.js';
import {replanSnapshot,proposeReplan} from './dist/replanning.js';
import {parseOfferingCodes,offeringChanges,offeringEditor,loadOfferingEditor,availabilityAssessmentView} from './dist/offering-view.js';
import {createWorkbook} from './dist/export.js';
import {advise,availableTargets,mergeResearchTargets} from './server/advisor.mjs';

const env={GROQ_API_KEY:'fixture-key',GROQ_WEB_RESEARCH:'off'};
const response=value=>groqFixture({status:'completed',model:'test-fixture',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const j=newJourney();j.programChosen=true;j.preferredDegree='BSCSC';
j.profile=normalizeProfile({program:'BSCSC',track:'SE',priorCodes:['FRN3210'],choices:{'bscsc-free-1':'ACC2301','bscsc-free-2':'MTH2304','bscsc-history':'HIS1301','bscsc-humanities':'LIT2301','bscsc-arts':'ART1301','bscsc-social':'PSY1301','bscsc-basic-science':'BIO1401','bscsc-arabic':'ARA1201','bscsc-french':'FRN3210','bscsc-civic':'CIP2100'}});
j.questionnaire={ambitions:'Build secure payments software for Moroccan merchants.',activities:'Program reliable software and compare practical options.',strengths:'Mathematics, programming and problem solving.'};
const plan=makePlan(j),first=plan.terms.find(t=>t.courses.includes('csc1401')).id;
const report={termId:first,offeredCourseCodes:['PSY1301'],unavailableCourseCodes:['CSC1401'],complete:false};
const form=(overrides={})=>({elements:{offeringTerm:{value:first},reportOfferings:{checked:true},offeredCodes:{value:'PSY 1301, psy1301'},unavailableCodes:{value:'CSC 1401'},completeOfferings:{checked:false},...overrides}});
let passed=0;
async function test(name,body){await body();passed++;console.log('PASS '+name);}

await test('Offering input retains scope, normalizes codes and rejects contradictions',()=>{
 assert.deepEqual(parseOfferingCodes('csc 1401; MTH1304\nCSC1401\r\n PSY 1301'),['CSC1401','MTH1304','PSY1301']);
 assert.deepEqual(offeringChanges(form()),[report]);
 assert.deepEqual(offeringChanges(form({reportOfferings:{checked:false}})),[]);
 assert.deepEqual(offeringChanges(form({offeredCodes:{value:''},unavailableCodes:{value:''}})),[{...report,offeredCourseCodes:[],unavailableCourseCodes:[]}]);
 assert.throws(()=>parseOfferingCodes('UNKNOWN1000'),/Unknown catalogue course/);
 assert.throws(()=>offeringChanges(form({offeredCodes:{value:'CSC1401'}})),/both offered and unavailable/);
 assert.throws(()=>offeringChanges(form({offeringTerm:{value:'Spring-9999'}})),/valid semester/);
});

await test('Offering editor reloads partial, complete and legacy cancellation reports',()=>{
 const saved={...plan,scheduling:mergeScheduling({}, {offerings:[report]})},f=form();
 loadOfferingEditor(f,saved);assert.equal(f.elements.offeredCodes.value,'PSY1301');assert.equal(f.elements.unavailableCodes.value,'CSC1401');assert.equal(f.elements.completeOfferings.checked,false);assert.equal(f.elements.reportOfferings.checked,true);
 const html=offeringEditor(saved,first);assert.ok(html.includes('PSY1301'));assert.ok(html.includes('CSC1401'));assert.ok(html.includes('name="reportOfferings" type="checkbox" checked'));assert.ok(html.includes('data-action="save-course-offerings"'));
 const full={...plan,scheduling:mergeScheduling({}, {offerings:[{...report,complete:true}]})};
 loadOfferingEditor(f,full);assert.equal(f.elements.completeOfferings.checked,true);assert.match(offeringEditor(full,first),/name="completeOfferings" type="checkbox" checked/);
 const legacy={...plan,scheduling:{unavailable:[{courseCode:'CSC1401',termId:first}]}},legacyForm=form();
 loadOfferingEditor(legacyForm,legacy);assert.equal(legacyForm.elements.unavailableCodes.value,'CSC1401');assert.equal(legacyForm.elements.reportOfferings.checked,true);
 const legacyHtml=offeringEditor(legacy,first);assert.ok(legacyHtml.includes('CSC1401'),'An initial legacy cancellation must be visible without changing semesters.');
 const clean=form();loadOfferingEditor(clean,plan);assert.equal(clean.elements.reportOfferings.checked,false);assert.equal(clean.elements.offeredCodes.value,'');assert.equal(clean.elements.unavailableCodes.value,'');
});

let savedPlan;
await test('Offerings survive JSON/cloud workspace validation and invalid backups are refused',()=>{
 savedPlan={...structuredClone(plan),scheduling:mergeScheduling({}, {offerings:[report],unavailable:[{courseCode:'MTH1311',termId:first}]})};
 const saved={...emptyWorkspace(),phase:'saved',plan:savedPlan,journey:newJourney(savedPlan),history:[structuredClone(savedPlan)]};
 const restored=validateSavedWorkspace(JSON.parse(JSON.stringify(saved)));
 assert.deepEqual(restored.plan.scheduling,savedPlan.scheduling);assert.deepEqual(restored.history[0].scheduling,savedPlan.scheduling);
 assert.ok(planIssues(restored.plan).some(i=>i.level==='conflict'&&/CSC1401/.test(i.text)),'Saved offering conflicts must be visible before a replan.');
 const corrupt=JSON.parse(JSON.stringify(saved));corrupt.history[0].scheduling.offerings[0].offeredCourseCodes=['INVENTED'];
 assert.throws(()=>validateSavedWorkspace(corrupt),/Unknown course/);
 const tooLarge=JSON.parse(JSON.stringify(saved));tooLarge.plan.scheduling.offerings=Array.from({length:101},()=>report);
 assert.throws(()=>validateSavedWorkspace(tooLarge),/Invalid semester offering reports/);
 const corrected=mergeScheduling(savedPlan.scheduling,{offerings:[{...report,offeredCourseCodes:['CSC1401'],unavailableCourseCodes:[]}]});
 assert.equal(courseAvailability('CSC1401',first,corrected).status,'reported-offered');assert.equal(courseAvailability('MTH1311',first,corrected).status,'unknown','Replacing a report clears the old term cancellations.');
});

await test('Export includes student offering reports, scope and unconfirmed-registration context',async()=>{
 const styles=fs.readFileSync(new URL('./dist/template-styles.xml',import.meta.url),'utf8');
 const bytes=await createWorkbook(savedPlan.terms,savedPlan.courses,savedPlan.profile,[],planIssues(savedPlan),styles,savedPlan);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder();
 let offset=0,details='';
 while(offset+30<=bytes.length&&view.getUint32(offset,true)===0x04034b50){
  assert.equal(view.getUint16(offset+8,true),0,'The export fixture expects stored ZIP entries.');
  const size=view.getUint32(offset+18,true),nameSize=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),name=decoder.decode(bytes.subarray(offset+30,offset+30+nameSize)),start=offset+30+nameSize+extra;
  if(name==='xl/worksheets/sheet2.xml')details=decoder.decode(bytes.subarray(start,start+size));
  offset=start+size;
 }
 assert.ok(details,'Course details worksheet is missing.');
 for(const value of ['Student-reported course offerings','Partial student list','Student cancellation report',first,'PSY1301','CSC1401','MTH1311','Student reports do not confirm registration'])assert.ok(details.includes(value),'Export omitted '+value+'.');
});

await test('Replan uses submitted offerings, refuses model-invented reports and preserves preview state',async()=>{
 const original=JSON.stringify(plan),submitted=[report];let calls=0;
 const result=await advise({...j,flowVersion:5,stage:'replan',plan:replanSnapshot(plan),currentTerm:first,changeRequest:'CSC1401 is unavailable. Keep the required course, postpone it and fill the semester with eligible offered study.',offerings:submitted},env,async(_,init)=>{
  calls++;const wire=JSON.parse(init.body),context=JSON.parse(wire.messages.at(-1).content);
  assert.deepEqual(context.courseOfferings.offerings,submitted);assert.ok(context.availabilityAnalysis.some(a=>a.affected.some(c=>c.courseCode==='CSC1401'&&c.kind==='required')));
  assert.equal(wire.response_format.json_schema.schema.properties.change.properties.offerings,undefined,'The model cannot manufacture current offering reports.');
  return response({kind:'propose',summary:'Postpone compulsory programming; keep its dependent sequence valid.',questions:[],change:{track:plan.profile.track,secondTrack:plan.profile.secondTrack,minor:plan.profile.minor,pace:plan.profile.pace,regularCourses:plan.profile.regularCourses,summerCourses:plan.profile.summerCourses,summers:plan.profile.summers,choices:[],unavailable:[],offerings:[{termId:first,offeredCourseCodes:['CSC1401'],unavailableCourseCodes:[],complete:true}]},update:{summary:'Adjusted the remaining schedule.',changes:['Postponed compulsory programming.'],limitations:['Future offerings remain unconfirmed.']}});
 });
 assert.equal(calls,1);assert.deepEqual(result.change.offerings,submitted,'Student reports must override fabricated model fields.');
 const proposal=proposeReplan(plan,result.change,first);assert.equal(proposal.assessment.canApply,true);assert.deepEqual(proposal.candidate.scheduling.offerings,submitted);
 assert.ok(!proposal.candidate.terms.find(t=>t.id===first)?.courses.includes('csc1401'));
 assert.equal(JSON.stringify(plan),original,'An unaccepted proposal changed the saved roadmap.');
 const html=availabilityAssessmentView(proposal.assessment);assert.ok(html.includes('Required courses postponed'));assert.ok(html.includes('Future offering needs confirmation.'));assert.ok(html.includes('Offering bottlenecks'));
 assert.ok(availabilityAssessmentView({bottlenecks:[{message:'<script>bad()</script>'}],assumptions:['<img src=x>']}).includes('&lt;script&gt;'));assert.ok(!availabilityAssessmentView({bottlenecks:[{message:'<script>bad()</script>'}]}).includes('<script>'));
});

await test('Invalid submitted offerings stop before model calls',async()=>{
 let calls=0;
 await assert.rejects(()=>advise({...j,stage:'replan',flowVersion:5,plan:replanSnapshot(plan),currentTerm:first,changeRequest:'Review this semester against the current offered courses.',offerings:[{...report,offeredCourseCodes:['INVENTED']}]},env,async()=>{calls++;throw Error('Unexpected provider call.');}),/Unknown course/);
 assert.equal(calls,0);
});

await test('Exchange-only refinement retains prior researched companies by ID, order and evidence',async()=>{
 const internships=mergeResearchTargets(availableTargets('internships',j.profile),{},'internships').slice(0,4);
 internships.push({id:'research-synthetic-logistics-ma',name:'Synthetic Logistics',country:'Morocco',organizationType:'startup',sourceUrl:'https://synthetic-logistics.ma/about',officialUrl:'https://synthetic-logistics.ma',reason:'Previously researched product engineering fit.',caveat:'Research target; openings remain unverified.'});
 const exchanges=mergeResearchTargets(availableTargets('exchanges',j.profile),{},'exchanges').slice(0,5);
 const priorItem=(t,i)=>({...t,tier:i<3?'reach':i===3?'target':'safety',reason:t.reason||'Existing reviewed fit.',tierReason:'Existing search route.',industryReason:'Existing qualified evidence.'});
 const editing=newJourney();editing.profile=j.profile;editing.programChosen=true;editing.questionnaire=j.questionnaire;editing.details={summary:'Saved targets',internships:internships.map(priorItem),exchanges:exchanges.map(priorItem)};
 const previous=previousFor(editing,'targets');assert.equal(previous.internships.at(-1).sourceUrl,'https://synthetic-logistics.ma/about');
 const original=JSON.stringify(editing);let calls=0;
 const result=await advise({...editing,stage:'targets',flowVersion:5,currentRecommendation:previous,refinement:'Replace my exchange institutions with new alternatives. Keep my current company targets unchanged.'},env,async(_,init)=>{
  calls++;const context=JSON.parse(JSON.parse(init.body).messages.at(-1).content);
  assert.deepEqual(context.opportunityPolicy.preserveTypes,['internships']);
  assert.ok(context.companies.some(t=>t.id==='research-synthetic-logistics-ma'),'Prior dynamic targets must remain in the supported schema.');
  const newExchanges=context.exchangeDestinations.filter(t=>!exchanges.some(e=>e.id===t.id)).slice(0,5);assert.equal(newExchanges.length,5);
  const modelItem=(t,i)=>({id:t.id,tier:i<3?'reach':i===3?'target':'safety',reason:'MODEL REWRITTEN REASON',tierReason:'A reviewed search strategy.',industryReason:'A qualified inference, not an admission claim.',answerIds:['ambitions'],evidenceIds:[]});
  return response({summary:'Different exchange institutions; current companies retained.',internships:previous.internships.map(modelItem),exchanges:newExchanges.map(modelItem),intent:'update',answer:'',update:{summary:'Explored different exchange routes.',changes:['Selected other approved institutions.'],limitations:[]}});
 });
 assert.equal(calls,1);assert.deepEqual(result.internships.map(t=>t.id),previous.internships.map(t=>t.id));
 for(const [i,t] of result.internships.entries()){assert.equal(t.reason,previous.internships[i].reason);assert.equal(t.sourceUrl,previous.internships[i].sourceUrl);assert.equal(t.tier,previous.internships[i].tier);}
 assert.equal(result.internships.at(-1).organizationType,'startup');assert.ok(result.update.added.length>=3);
 assert.equal(JSON.stringify(editing),original,'A refinement preview mutated the saved journey.');
});

console.log('Passed '+passed+' MVP integration checks. No live calls.');
