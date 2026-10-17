import assert from 'node:assert/strict';
import {normalizeProfile,coursesFor,generatePlan,creditsOf,fitDegreePrerequisites} from './dist/planner.js';
import {newJourney,makePlan,emptyWorkspace,validateSavedWorkspace} from './dist/guidance.js';
import {refreshMinorDraft} from './dist/dashboard-flow.js';
import {courseDetailFacts} from './dist/course-details.js';
import {validateDetails} from './server/advisor.mjs';

const profile=normalizeProfile({program:'BSCSC',track:'SE',minor:'business-administration'}),courses=coursesFor(profile),econ=courses.find(c=>c.code==='EGR2302');
assert.equal(econ.groupId,'free');assert.equal(econ.credits,3);assert.deepEqual(econ.rule.all,['MTH1311'],'Allocation must retain the prerequisite of Engineering Economics itself.');
assert.equal(courses.filter(c=>c.groupId==='free').length,2);assert.ok(econ.prerequisiteFor.includes('FIN3301'));assert.ok(econ.prerequisiteFor.includes('MGT3301'));
const slot=courses.find(c=>c.minorId&&c.options?.includes('MKT3301'));
const selected=validateDetails({summary:'Marketing.',choices:[{requirementId:slot.id,courseCode:'MKT3301',reason:'Business interest.'}]},{profile},false);
const updated={...profile,choices:selected.choices},rows=coursesFor(updated),terms=generatePlan(updated);
assert.equal(rows.length,courses.length);assert.equal(creditsOf(rows),creditsOf(courses));assert.equal(rows.filter(c=>c.minorId).length,5);
assert.ok(rows.find(c=>c.code==='EGR2302').prerequisiteFor.includes('MKT3301'));
const index=code=>terms.findIndex(t=>t.courses.some(id=>rows.find(c=>c.id===id)?.code===code));
assert.ok(index('MTH1311')<index('EGR2302'));for(const code of ['FIN3301','MGT3301','MKT3301']){assert.ok(index('EGR2302')<index(code));assert.ok(!terms.find(t=>t.id==='pending')?.courses.some(id=>rows.find(c=>c.id===id)?.code===code));}
const facts=courseDetailFacts(rows.find(c=>c.code==='EGR2302'),updated).facts;
assert.ok(facts.some(f=>f.label==='Counts toward'&&f.text.includes('Free elective')));assert.ok(facts.some(f=>f.label==='Needed before'&&f.text.includes('MKT3301')));

// A full old roadmap gets an explicit replacement preview, not a silent edit.
const filled={...updated,choices:{...updated.choices,'bscsc-free-1':'HIS1301','bscsc-free-2':'GEO1301'}},j=newJourney();j.profile=filled;j.programChosen=true;
const plan=makePlan(j);plan.finalizedAt='2026-10-17T00:00:00Z';
const original=JSON.stringify(plan),state={...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)},preview=refreshMinorDraft(state);
assert.equal(preview.phase,'draft');assert.equal(JSON.stringify(preview.plan),original);assert.ok(preview.draftPlan.courses.some(c=>c.code==='EGR2302'&&c.groupId==='free'));
assert.equal(preview.draftPlan.courses.length,plan.courses.length);assert.equal(creditsOf(preview.draftPlan.courses),creditsOf(plan.courses));assert.ok(preview.draftPlan.degreeAllocationChanges.some(c=>c.courseCode==='EGR2302'&&c.previousCode));
assert.equal(refreshMinorDraft(preview),preview,'An already allocated preview must not be rebuilt on reload.');validateSavedWorkspace(structuredClone(preview));
const protectedPlan=structuredClone(plan);for(const c of protectedPlan.courses.filter(c=>c.groupId==='free'))protectedPlan.tracking[c.id]={status:'completed',grade:'A'};
const protectedState={...state,plan:protectedPlan,journey:newJourney(protectedPlan)};assert.equal(refreshMinorDraft(protectedState),protectedState,'Completed electives cannot be displaced to hide a missing prerequisite.');
const noRoom=fitDegreePrerequisites({...profile,secondTrack:'AI'});assert.ok(!noRoom.courses.some(c=>c.code==='EGR2302'),'A second specialization has consumed these free slots; never append an extra course.');
console.log('Passed Engineering Economics in an existing free elective, retained calculus prerequisite, five-course minor and unchanged credits, correct marketing sequence, clear course details, saved-plan repair previews, protected study and no-extra-course fallback. No live calls.');
