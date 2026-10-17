import assert from 'node:assert/strict';
import {DATA,normalizeProfile,coursesFor,generatePlan,creditsOf} from './dist/planner.js';
import {eligibleMinors,newJourney,makePlan,emptyWorkspace,validateSavedWorkspace,allowedChoices} from './dist/guidance.js';
import {courseGroups} from './dist/course-groups.js';
import {validateDetails} from './server/advisor.mjs';

for(const program of DATA.programs)for(const track of program.tracks.length?program.tracks:[{id:''}]){
 const p=normalizeProfile({program:program.id,track:track.id});
 for(const minor of ['',...eligibleMinors(p).map(m=>m.id)]){
  const profile={...p,minor},rows=coursesFor(profile);
  assert.ok(rows.every(c=>!c.supportingPrerequisite&&!c.id.startsWith('support-')));
  assert.ok(courseGroups(rows,profile).every(g=>g.id!=='preparation'));
 }
}

const profile=normalizeProfile({program:'BSCSC',track:'SE',minor:'business-administration'}),j=newJourney();j.profile=profile;j.programChosen=true;
const rows=coursesFor(profile),slot=rows.find(c=>c.minorId&&c.options?.includes('MGT3302'));
assert.throws(()=>validateDetails({summary:'Business choice.',choices:[{requirementId:slot.id,courseCode:'MGT3302',reason:'Management interest.'}]},{profile:{...profile,choices:{'bscsc-free-1':'HIS1301','bscsc-free-2':'GEO1301'}}},false),/unmet prerequisites|cannot be scheduled/,'Removing extra courses must not waive their prerequisites.');
const free=rows.find(c=>c.groupId==='free'&&allowedChoices(c,profile).some(o=>o.code==='EGR2302'));
assert.ok(free,'This degree has an existing approved slot for EGR2302.');
const other=rows.find(c=>c.minorId&&c.id!==slot.id&&c.options?.includes('MKT3301'));
const valid=validateDetails({summary:'Use the existing elective.',choices:[{requirementId:other.id,courseCode:'MKT3301',reason:'Required marketing foundation for the management option.'},{requirementId:free.id,courseCode:'EGR2302',reason:'Meets the business prerequisites within the degree.'},{requirementId:slot.id,courseCode:'MGT3302',reason:'Management interest.'}]},{profile},false);
const fitted=coursesFor({...profile,choices:valid.choices});
assert.equal(fitted.length,rows.length);assert.equal(creditsOf(fitted),creditsOf(rows));
assert.ok(!generatePlan({...profile,choices:valid.choices}).find(t=>t.id==='pending')?.courses.includes(slot.id));

const legacy=makePlan({...j,profile:{...profile,choices:{'bscsc-free-1':'HIS1301','bscsc-free-2':'GEO1301'}}}),extra={...DATA.courses.EGR2302,id:'support-egr2302',code:'EGR2302',credits:3,loadCredits:3,kind:'foundation',category:'Supporting prerequisite',supportingPrerequisite:true,rule:{all:[],any:[],coreq:[],minCredits:0}};
legacy.courses.push(extra);legacy.terms[0].courses.push(extra.id);
legacy.tracking[extra.id]={status:'completed',grade:'A',note:'Retain my actual study.'};
legacy.reports.push({courseId:extra.id,status:'open'});
const workspace={...emptyWorkspace(),phase:'saved',plan:legacy,draftPlan:structuredClone(legacy),history:[structuredClone(legacy)],journey:newJourney(legacy)};
const restored=validateSavedWorkspace(structuredClone(workspace));
for(const plan of [restored.plan,restored.draftPlan,...restored.history]){
 assert.equal(plan.courses.length,rows.length);assert.ok(plan.terms.every(t=>!t.courses.includes(extra.id)));assert.ok(!plan.tracking[extra.id]);assert.ok(!plan.reports.some(r=>r.courseId===extra.id));
 const retained=plan.academicRecord.find(r=>r.courseCode==='EGR2302');assert.equal(retained.grade,'A');assert.equal(retained.note,'Retain my actual study.');assert.equal(retained.countsTowardDegree,false);assert.equal(retained.requirementId,'');
 assert.ok(plan.profile.priorCodes.includes('EGR2302'));assert.ok(!courseGroups(plan.courses,profile).some(g=>g.id==='preparation'));
}
assert.ok(restored.journey.studentContext.records.some(r=>r.courseCode==='EGR2302'));
const again=validateSavedWorkspace(structuredClone(restored));assert.deepEqual(again.plan,restored.plan,'Migration must be idempotent.');
const planned=structuredClone(workspace);for(const plan of [planned.plan,planned.draftPlan,...planned.history])plan.tracking[extra.id]={status:'planned'};
const noStudy=validateSavedWorkspace(planned);assert.ok(!noStudy.plan.profile.priorCodes.includes('EGR2302'),'Removing an unstudied extra must not fabricate completion.');
console.log('Passed degree-only rows across every degree/track/minor, prerequisite enforcement, fitting a prerequisite into an existing approved elective without extra credits, and lossless legacy study migration. No live calls.');
