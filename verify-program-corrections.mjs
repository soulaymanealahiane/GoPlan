import assert from 'node:assert/strict';
import {DATA,coursesFor,normalizeProfile,generatePlan,validatePlan} from './dist/planner.js';
import {newJourney,makePlan,emptyWorkspace,validateSavedWorkspace} from './dist/guidance.js';
import {manualPrerequisiteIssues,manualRule} from './dist/manual-checks.js';
import {addManualCourse} from './dist/manual-plan.js';
import {courseDetailFacts} from './dist/course-details.js';
import {prerequisiteCoverage} from './dist/course-eligibility.js';
import {detailsContext} from './server/advisor.mjs';
import {semesterContext} from './server/semester-context.mjs';
import {adviseJourney} from './server/journey-agent.mjs';
import {replanSnapshot,restoreSnapshot} from './dist/replanning.js';
import {openaiFixture} from './tests/openai-fixture.mjs';

const codes=['CHE1401','CHE1402','EGR3304'];
const target=rows=>rows.find(c=>c.code==='EGR3304');
const assertRule=rule=>{assert.deepEqual(rule.all,['CHE1402']);assert.deepEqual(rule.any,[]);assert.deepEqual(rule.coreq,[]);};
function fixture(program,placements){
 const profile=normalizeProfile({program}),rows=coursesFor(profile),terms=['Fall-2026','Spring-2027','Fall-2027'].map(id=>({id,season:id.split('-')[0],year:Number(id.split('-')[1]),courses:[]}));
 const courses=placements.map(([code,term])=>{const c=rows.find(c=>c.code===code)||{...DATA.courses[code],id:code.toLowerCase(),code,loadCredits:DATA.courses[code].credits,kind:'core'};terms.find(t=>t.id===term).courses.push(c.id);return c;});
 return {profile,courses,terms,tracking:{},reports:[],targets:{internships:[],exchanges:[],auiMasters:[],globalMasters:[]}};
}
for(const track of DATA.programs.find(p=>p.id==='BSEMS').tracks){
 const profile=normalizeProfile({program:'BSEMS',track:track.id}),courses=coursesFor(profile),course=target(courses);assertRule(course.rule);assert.ok(!JSON.stringify(course).includes('EGR2412'));
 assert.ok(!courses.some(c=>c.code==='EGR2412'),'The correction must never append a supporting course.');
 const terms=generatePlan(profile);assert.ok(!validatePlan(terms,courses,profile).some(i=>i.id===course.id&&i.level==='conflict'));
 const context=detailsContext({profile});assertRule(target(context.requiredCourses).prerequisites);
}
let p=fixture('BSEMS',[['CHE1401','Fall-2026'],['CHE1402','Spring-2027'],['EGR3304','Fall-2027']]);
assert.ok(!manualPrerequisiteIssues(p).some(i=>i.id===target(p.courses).id));assert.ok(prerequisiteCoverage(p.courses).covered.has('EGR3304'));
const withoutChem=fixture('BSEMS',[['EGR3304','Fall-2027']]);assert.match(manualPrerequisiteIssues(withoutChem).find(i=>i.id===target(withoutChem.courses).id).text,/CHE1402/);
const alongsideChem=fixture('BSEMS',[['CHE1401','Fall-2026'],['CHE1402','Spring-2027'],['EGR3304','Spring-2027']]);assert.ok(manualPrerequisiteIssues(alongsideChem).some(i=>i.id===target(alongsideChem.courses).id),'A prerequisite still must be earlier.');
const addition=addManualCourse(fixture('BSEMS',[['CHE1401','Fall-2026'],['CHE1402','Spring-2027']]),{courseCode:'EGR3304',termId:'Fall-2027'});assertRule(target(addition.courses).rule);

// A historical row with a different ID and stale text cannot revive the old rule.
const stale={...structuredClone(target(p.courses)),id:'manual-old-materials',rule:{all:['EGR2412'],any:[],coreq:['EGR2412'],minCredits:0,review:true},prerequisiteText:'CHE1402; Corequisite: EGR2412',description:'Prerequisite: CHE1402, Corequisite: EGR2412\nMaterials properties.'};
const facts=courseDetailFacts(stale,p.profile);assertRule(facts.course.rule);assert.ok(!JSON.stringify(facts).includes('EGR2412'));assert.deepEqual(facts.facts,[{label:'Complete first',text:'CHE1402'}]);
const ctx=semesterContext({...p,courses:p.courses.map(c=>c.code==='EGR3304'?{...stale,id:c.id}:c)},'Move Materials Science to another semester.');assertRule(target(ctx.catalog).prerequisites);assertRule(target(ctx.currentCourses).prerequisites);

// Restoring an actual old workspace updates metadata without rebuilding the plan.
const j=newJourney();j.profile=p.profile;j.programChosen=true;const plan=makePlan(j);plan.finalizedAt='2026-10-01T00:00:00Z';
const row=target(plan.courses),index=plan.courses.indexOf(row);plan.courses[index]={...stale,id:row.id};plan.tracking[row.id]={status:'in-progress',grade:'',note:'Keep my note'};plan.terms[0].note='Keep semester note';
const before={terms:structuredClone(plan.terms),tracking:structuredClone(plan.tracking),count:plan.courses.length,credits:plan.courses.reduce((n,c)=>n+c.credits,0)},state={...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)};
const loaded=validateSavedWorkspace(JSON.parse(JSON.stringify(state))).plan;assertRule(target(loaded.courses).rule);assert.deepEqual(loaded.terms,before.terms);assert.deepEqual(loaded.tracking,before.tracking);assert.equal(loaded.courses.length,before.count);assert.equal(loaded.courses.reduce((n,c)=>n+c.credits,0),before.credits);assertRule(target(restoreSnapshot(replanSnapshot(loaded)).courses).rule);

// The correction is scoped to BSEMS: preserve other programs' own catalogue rules.
assert.match(DATA.courses.EGR3304.prerequisiteText,/Corequisite: EGR 2412/);
for(const program of ['BSGE','BSRESE'])assert.ok(manualPrerequisiteIssues(fixture(program,[['CHE1402','Fall-2026'],['EGR3304','Spring-2027']])).some(i=>i.id==='egr3304'&&i.text.includes('EGR2412')));

// A real corequisite may be earlier OR concurrent. Neither path forces a pair.
for(const term of ['Fall-2026','Spring-2027']){
 const coreq=fixture('BBA',[['FAS0210',term],['ENG1301','Spring-2027']]);
 assert.ok(!manualPrerequisiteIssues(coreq).some(i=>i.id==='eng1301'));
 assert.ok(!validatePlan(coreq.terms,coreq.courses,coreq.profile).some(i=>i.id==='eng1301'&&i.level==='conflict'));
}
const later=fixture('BBA',[['FAS0210','Fall-2027'],['ENG1301','Spring-2027']]);assert.ok(manualPrerequisiteIssues(later).some(i=>i.id==='eng1301'));

// Inspect the actual question agent's context, not only a local data fixture.
let calls=0;
const result=await adviseJourney({stage:'question',flowVersion:5,programChosen:true,profile:p.profile,question:'What do I need before EGR3304?',questionnaire:{ambitions:'Study engineering and management.'}},{OPENAI_API_KEY:'fixture',OPENAI_WEB_RESEARCH:'off'},async(url,init)=>{
 calls++;const context=JSON.parse(JSON.parse(init.body).input);assertRule(target(context.questionFacts.requiredCourses).prerequisites);assertRule(context.academicRuleCorrections.find(c=>c.courseCode==='EGR3304').rule);assert.match(context.academicRulePolicy,/override generic catalogue/);
 return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({answer:'For BSEMS, complete CHE1402 before EGR3304.'})}]}]});
});assert.equal(calls,1);assert.match(result.answer,/CHE1402/);
console.log('Passed BSEMS Materials Science correction across all four tracks, prerequisite checking, manual additions, saved/stale rows, course details, semester/course/question agent contexts, no extra courses, and earlier-or-concurrent corequisites. Other curricula retain their rules. Synthetic provider only.');
