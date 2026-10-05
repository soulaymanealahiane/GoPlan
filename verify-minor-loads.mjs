import {groqFixture} from './tests/groq-fixture.mjs';
import assert from 'node:assert/strict';
import {normalizeProfile,coursesFor,generatePlan,limits,validatePlan} from './dist/planner.js';
import {minorSummary} from './dist/minor-summary.js';
import {newJourney,makePlan,validateSavedWorkspace,emptyWorkspace} from './dist/guidance.js';
import {journeyView,planView,minorChecklistView} from './dist/views.js';
import {acceptAdvice,adviceFingerprint} from './dist/journey-state.js';
import {editJourney,buildProposal} from './dist/workspace-flow.js';
import {replanSnapshot,proposeReplan} from './dist/replanning.js';
import {advise,detailsContext} from './server/advisor.mjs';

const env={GROQ_API_KEY:'fixture-secret',GROQ_WEB_RESEARCH:'off'};
const response=value=>groqFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const j=newJourney();j.programChosen=true;j.profile=normalizeProfile({program:'BSCSC',track:'SE',minor:'mathematics',gpa:3.4});j.goal='Build useful software and learn mathematical modelling.';
const math=minorSummary(j.profile);assert.equal(math.requiredCourses,5);assert.equal(math.requiredCredits,15);assert.equal(math.selectedCourses,4);assert.equal(math.selectedCredits,12);assert.equal(math.complete,false);assert.ok(math.rows[4].approvalRequired);assert.equal(math.rows[4].code,'');
assert.equal(math.rows.filter(c=>c.code).length,4);assert.ok(!math.rows.some(c=>c.id.startsWith('support-')));
for(const c of math.rows)assert.ok(minorChecklistView(j.profile,{editable:true}).includes(c.title));
assert.ok(minorChecklistView(j.profile).includes('4 of 5'));
const comp=minorSummary({program:'BBA',track:'FIN',minor:'computer-science'});assert.equal(comp.requiredCourses,6);assert.equal(comp.requiredCredits,15);assert.equal(comp.listedCredits,18);assert.ok(comp.reviewNote.includes('18 credits'));
// Every independent load combination drives both generation and validation.
for(const regularCourses of [5,6])for(const summerCourses of [2,3]){
 const p=normalizeProfile({...j.profile,regularCourses,summerCourses}),cs=coursesFor(p),terms=generatePlan(p);
 assert.equal(limits(p,false).count,regularCourses);assert.equal(limits(p,true).count,summerCourses);
 for(const t of terms.filter(t=>!['prior','pending'].includes(t.id))){const list=t.courses.map(id=>cs.find(c=>c.id===id)),cap=limits(p,t.season==='Summer');assert.ok(list.filter(c=>c.loadCredits>0).length<=cap.count);assert.ok(list.reduce((n,c)=>n+c.loadCredits,0)<=cap.credits);}
 assert.ok(!validatePlan(terms,cs,p).some(i=>i.text.includes('load exceeds')));
 const plan=makePlan({...j,profile:p});const snapshot=replanSnapshot(plan);assert.equal(snapshot.profile.regularCourses,regularCourses);assert.equal(snapshot.profile.summerCourses,summerCourses);
 const saved=validateSavedWorkspace({...emptyWorkspace(),phase:'saved',plan,journey:{...j,profile:p}});assert.equal(saved.plan.profile.summerCourses,summerCourses);
}
assert.equal(normalizeProfile({pace:'accelerated'}).summerCourses,3,'Legacy accelerated plans retain their old schedule preference');
const legacyPlan=makePlan(j);legacyPlan.profile.pace='accelerated';delete legacyPlan.profile.regularCourses;delete legacyPlan.profile.summerCourses;
const legacySchedule=JSON.stringify(legacyPlan.terms),legacyTracking=JSON.stringify(legacyPlan.tracking);
const migrated=validateSavedWorkspace({...emptyWorkspace(),phase:'saved',plan:legacyPlan,draftPlan:structuredClone(legacyPlan),history:[structuredClone(legacyPlan)]});
for(const restored of [migrated.plan,migrated.draftPlan,...migrated.history]){assert.equal(restored.profile.regularCourses,6);assert.equal(restored.profile.summerCourses,3);assert.equal(JSON.stringify(restored.terms),legacySchedule);assert.equal(JSON.stringify(restored.tracking),legacyTracking);assert.ok(!planView(restored,false).includes('undefined'));}
const independent=normalizeProfile({...newJourney().profile,regularCourses:6});assert.equal(independent.summerCourses,2,'Changing regular preference must not raise summer load');
const grad=normalizeProfile({program:'MSSE',regularCourses:6,summerCourses:3});assert.equal(grad.regularCourses,4);assert.equal(grad.summerCourses,2);
assert.ok(validatePlan(generatePlan({...j.profile,regularCourses:5,summerCourses:3,gpa:''}),coursesFor(j.profile),{...j.profile,regularCourses:5,summerCourses:3,gpa:''}).some(i=>i.text.includes('heavier load')));
j.step=5;const html=journeyView({journey:j});assert.ok(html.includes('data-profile="regularCourses"'));assert.ok(html.includes('data-profile="summerCourses"'));assert.ok(!html.includes('data-profile="pace"'));
const stamp=adviceFingerprint('pace',j);j.profile.summerCourses=3;assert.notEqual(adviceFingerprint('pace',j),stamp);j.profile.summerCourses=2;
const before=JSON.stringify(j);let calls=0;
const explanation=await advise({...j,stage:'question',question:'Why are only four courses selected for my minor?',profile:{...j.profile,name:'PRIVATE NAME',gpa:3.4}},env,async(_,init)=>{
 calls++;assert.ok(!init.body.includes('PRIVATE NAME'));assert.ok(!init.body.includes('fixture-secret'));const context=JSON.parse(JSON.parse(init.body).messages.at(-1).content);assert.equal(context.questionFacts.minorChecklist.requiredCourses,5);assert.equal(context.questionFacts.minorChecklist.selectedCourses,4);return response({answer:'The four named courses provide 12 credits. A fifth approved math-intensive course is still required for the 15-credit Individual Minor.'});
});assert.equal(calls,1);acceptAdvice(j,'question',explanation);assert.equal(JSON.stringify(j),before,'An explanation cannot alter any draft choices');
await advise({...newJourney(),stage:'question',question:'What is my degree?'},env,async(_,init)=>{const c=JSON.parse(JSON.parse(init.body).messages.at(-1).content);assert.equal(c.questionFacts.degree,undefined);assert.equal(c.request.profile.program,'');return response({answer:'You have not selected a degree yet.'});});
// A question entered into the change/refinement field stays read-only, too.
const answer=await advise({...j,stage:'courses',refinement:'Why only four minor courses?',replaceableChoices:[]},env,async()=>response({intent:'answer',answer:'The fifth requirement needs school approval.',choices:[{requirementId:'bad',courseCode:'INVENTED',reason:'Must never be applied'}]}));acceptAdvice(j,'courses',answer);assert.equal(JSON.stringify(j),before);
const routed=await advise({...j,stage:'change',changeRequest:'Why only four courses for my minor?'},env,async()=>response({kind:'answer',startStep:3,summary:'A fifth approved slot is required.',questions:[]}));assert.equal(routed.kind,'answer');
const minorResult=await advise({...j,stage:'courses'},env,async()=>response({summary:'All requirements are complete.',choices:[],openItems:[]}));assert.equal(minorResult.minorChecklist.complete,false);assert.ok(minorResult.summary.includes('4 of 5'));assert.ok(minorResult.openItems.some(x=>x.requirementId===math.rows[4].id));
// An omitted selectable minor slot triggers bounded repair and remains explicit if unverified.
const minorProfile=normalizeProfile({program:'BBA',track:'FIN',minor:'computer-science'});let repaired=0;
assert.ok(detailsContext({profile:minorProfile}).requirements.some(c=>c.minorId&&c.options.length));
const omitted=await advise({...j,profile:minorProfile,stage:'courses'},env,async()=>{repaired++;return response({summary:'Complete.',choices:[],openItems:[]});});assert.equal(repaired,2);assert.equal(omitted.minorChecklist.complete,false);assert.ok(omitted.openItems.length);
for(const [regularCourses,summerCourses,eligible,expectedRegular,expectedSummer] of [[6,2,true,6,2],[5,3,true,5,3],[6,3,false,5,2]]){
 const pace=await advise({...j,stage:'pace',acceleratedEligible:eligible},env,async()=>response({summary:'Independent targets.',pace:regularCourses===6?'accelerated':'balanced',regularCourses,summerCourses,summers:true,reason:'Your available time.',actions:[]}));assert.equal(pace.regularCourses,expectedRegular);assert.equal(pace.summerCourses,expectedSummer);const copy=structuredClone(j);acceptAdvice(copy,'pace',pace);assert.equal(copy.profile.summerCourses,expectedSummer);
}
// A saved plan can change one load while keeping progress and the other preference.
const plan=makePlan(j),first=plan.terms[0],id=first.courses.find(id=>plan.courses.find(c=>c.id===id).code);plan.tracking[id]={status:'completed'};const original=JSON.stringify(plan);
const edit=editJourney(plan,'Six regular courses, keep two in summer.',5,first.id);edit.profile.regularCourses=6;const proposal=buildProposal(edit,plan);assert.equal(proposal.profile.regularCourses,6);assert.equal(proposal.profile.summerCourses,2);assert.equal(proposal.terms.find(t=>t.courses.includes(id)).id,first.id);assert.equal(JSON.stringify(plan),original);assert.ok(planView(proposal,true).includes('6 per regular semester and 2 per summer session'));
assert.throws(()=>proposeReplan({...plan,profile:{...plan.profile,gpa:''}},{summerCourses:3},first.id),/CGPA/);
console.log('Passed full minor checklists, omitted-course repair, factual read-only questions, all four independent loads, legacy migration, academic caps, eligibility and progress-preserving edits.');
