import assert from 'node:assert/strict';
import {newcomerWorkspace,manualDegreePlan,manualCoursePlan,refreshMinorDraft,manualCourseOptions} from './dist/dashboard-flow.js';
import {dashboardView,dashboardReady} from './dist/dashboard-view.js';
import {createDashboardController} from './dist/dashboard-controller.js';
import {minorSummary} from './dist/minor-summary.js';
import {newJourney,suggestChoices,makePlan,validateSavedWorkspace} from './dist/guidance.js';
import {normalizeProfile,coursesFor,DATA} from './dist/planner.js';
import {courseGroups,courseGroupKey,courseSemester} from './dist/course-groups.js';
import {acceptAdvice} from './dist/journey-state.js';
import {availableTargets} from './server/advisor.mjs';
const seed=newcomerWorkspace({year:2026,name:'Synthetic'});assert.equal(seed.journey.studentContext.route,'admitted');assert.deepEqual(seed.journey.studentContext.records,[]);assert.equal(seed.journey.level,'undergraduate');assert.throws(()=>newcomerWorkspace({degree:'MBA'}));
let state=seed;const runtime={},calls=[];
const direction={kind:'recommend',summary:'Explore technology and business.',themes:[],questions:[],tradeoffs:[],academic:{program:'BSCSC',track:'SE',secondTrack:'',minor:'business-administration',rationale:'Connect your interest in technology with business.',focusRationale:'Build reliable products.',minorRationale:'Learn how a business works.'}};
const getAdvice=async stage=>{
 calls.push(stage);const j=state.journey;
 if(stage==='direction')acceptAdvice(j,stage,direction);
 if(stage==='courses')acceptAdvice(j,stage,{summary:'Your selected courses.',choices:suggestChoices(j).profile.choices,choiceReasons:{}});
 if(stage==='targets')acceptAdvice(j,stage,Object.fromEntries(['internships','exchanges'].map(type=>[type,availableTargets(type,j.profile).slice(0,5).map(t=>({...t,reason:'Connect with your technology and business interests.'}))])));
 if(stage==='pace')acceptAdvice(j,stage,{pace:'balanced',regularCourses:5,summerCourses:2,summers:true,summary:'A manageable pace.'});
 return true;
};
const hooks={runtime,read:()=>state,account:()=>({firstName:'Synthetic'}),render(){},changed(){},persist(){},notify(){},modal(){},head:()=>'',close(){},getAdvice,startWorkspace:async s=>{state=s;},showPlan(){},exportPlan:async()=>{}};
const controller=createDashboardController(hooks);
await controller.click({dataset:{action:'dashboard-build'}});assert.deepEqual(calls,['direction','courses','targets','pace']);assert.equal(state.phase,'draft');assert.ok(state.draftPlan);
let html=dashboardView(state,runtime,{firstName:'Synthetic'});
for(const unwanted of ['STEP 1 OF 6','journey-steps','data-study=','Update course offerings','Verified findings are retained','Research again'])assert.ok(!html.includes(unwanted),unwanted+' leaked into the main dashboard.');
assert.ok(html.includes('dashboard-command-form'));assert.ok(html.includes('Your space'));assert.equal(minorSummary(state.draftPlan.profile).requiredCourses,5);assert.equal(minorSummary(state.draftPlan.profile).listedCredits,15);

// Partition real requirement slots, including both kinds of elective and second focus.
for(const program of DATA.programs){for(const track of program.tracks.length?program.tracks:[{id:''}]){
 const profile=normalizeProfile({program:program.id,track:track.id,minor:program.id==='BSCSC'?'business-administration':'',secondTrack:['BSCSC','BBA'].includes(program.id)?program.tracks.find(t=>t.id!==track.id)?.id||'':''});
 const courses=coursesFor(profile),groups=courseGroups(courses,profile),rows=groups.flatMap(g=>g.courses);
 assert.equal(rows.length,courses.length);assert.equal(new Set(rows.map(c=>c.id)).size,courses.length,'A course must appear in exactly one group.');
 assert.ok(groups.every(g=>g.courses.length));
 for(const c of courses.filter(c=>c.focusRole==='secondary'))assert.equal(courseGroupKey(c,profile),'second');
 for(const c of courses.filter(c=>c.minorId))assert.equal(courseGroupKey(c,profile),'minor');
 for(const c of courses.filter(c=>c.groupId==='free'))assert.equal(courseGroupKey(c,profile),'free');
}}
const profile=state.draftPlan.profile,rows=state.draftPlan.courses;
assert.equal(courseGroupKey(rows.find(c=>c.id==='bscsc-arabic'),profile),'general');
assert.equal(courseGroupKey(rows.find(c=>c.id==='bscsc-computing'),profile),'open');
assert.equal(courseGroupKey(rows.find(c=>c.id==='csc4307'),profile),'specialization');
assert.equal(courseGroupKey(rows.find(c=>c.id==='csc1401'),profile),'major');
assert.equal(courseGroupKey(rows.find(c=>c.id==='bscsc-free-1'),profile),'free');
for(const group of courseGroups(rows,profile)){html=dashboardView(state,{dashboardPanel:'courses',courseGroup:group.id});assert.equal((html.match(/data-course-id=/g)||[]).length,group.courses.length);assert.ok(!html.includes('Your choice'));assert.ok(!html.includes('Your choices'));}
const first=rows.find(c=>c.id==='csc1401'),placement=courseSemester(state.draftPlan,first);assert.ok(placement.termId);assert.ok(dashboardView(state,{dashboardPanel:'courses',courseGroup:'major'}).includes(placement.text));
const notMapped=dashboardView({...state,phase:'journey',draftPlan:null,plan:null},{dashboardPanel:'courses'});assert.ok(notMapped.includes('Semester timing appears when you build your roadmap.'));assert.ok(!notMapped.includes('Fall 2026'));
const delayed=structuredClone(state.draftPlan),oldTerm=delayed.terms.find(t=>t.courses.includes(first.id)),newTerm=delayed.terms.find(t=>t.id!==oldTerm.id&&!['pending','prior'].includes(t.id));oldTerm.courses=oldTerm.courses.filter(id=>id!==first.id);newTerm.courses.push(first.id);assert.equal(courseSemester(delayed,first).termId,newTerm.id,'Course labels must use actual saved placement, including manual moves.');

const earlierCalls=calls.length;await controller.click({dataset:{action:'dashboard-course-semester',term:placement.termId}});assert.equal(runtime.dashboardPanel,'semesters');assert.equal(runtime.selectedTerm,placement.termId);await controller.click({dataset:{action:'dashboard-panel',panel:'courses'}});await controller.click({dataset:{action:'dashboard-panel',panel:'opportunities'}});assert.equal(calls.length,earlierCalls,'Opening a ready panel must not trigger paid advice.');
runtime.dashboardPanel='opportunities';state.journey.details.targetResearch={status:'partial',notice:'Verified findings are retained. Research again.'};html=dashboardView(state,runtime);assert.ok(!html.includes('Verified findings'));assert.ok(!html.includes('Research again'));assert.ok(html.includes('Openings and eligibility still need checking.'));
runtime.dashboardPanel='semesters';html=dashboardView(state,runtime);assert.equal((html.match(/class="semester-focus"/g)||[]).length,1,'Only the selected semester is expanded.');assert.ok(!html.includes('Progress note'));
await controller.click({dataset:{action:'dashboard-save'}});assert.equal(state.phase,'saved');assert.equal(state.draftPlan,null);
const saved=JSON.stringify(state.plan),course=state.plan.courses.find(c=>c.code==='CSC1401'),term=state.plan.terms.find(t=>t.courses.includes(course.id));
const completed=manualCoursePlan(state.plan,{id:course.id,status:'completed',termId:term.id}).candidate;assert.equal(completed.tracking[course.id].status,'completed');assert.equal(JSON.stringify(state.plan),saved,'Manual preview mutated the saved plan.');

const completedState={...state,plan:completed,journey:newJourney(completed)};
html=dashboardView(completedState,{dashboardPanel:'overview'});assert.ok(html.includes('4 / '));assert.ok(html.includes('Change your degree'));assert.ok(!html.includes('Your plan is taking shape'));
html=dashboardView(completedState,{dashboardPanel:'semesters'});assert.ok(html.includes('✓ Completed'));
const resetProgress=manualCoursePlan(completed,{id:course.id,status:'planned',termId:term.id}).candidate;assert.equal(resetProgress.tracking[course.id].status,'planned');assert.ok(!resetProgress.academicRecord.some(r=>r.courseCode===course.code));
validateSavedWorkspace(JSON.parse(JSON.stringify({...state,plan:resetProgress,journey:newJourney(resetProgress)})));
const later=state.plan.terms.find(t=>t.id!==term.id&&!['prior','pending'].includes(t.id));
const moved=manualCoursePlan(state.plan,{id:course.id,termId:later.id,status:'planned'}).candidate;assert.ok(moved.terms.find(t=>t.id===later.id).courses.includes(course.id));assert.ok(!moved.terms.find(t=>t.id===term.id).courses.includes(course.id));
const taking=manualCoursePlan(state.plan,{id:course.id,status:'in-progress',termId:term.id}).candidate;
const nextCourse=state.plan.courses.find(c=>later.courses.includes(c.id)&&c.code);assert.equal(manualCoursePlan(taking,{id:nextCourse.id,status:'in-progress',termId:later.id}).candidate.tracking[nextCourse.id].status,'in-progress','Personal progress can be recorded freely across semesters.');
const inProgressMoved=manualCoursePlan(taking,{id:course.id,status:'in-progress',termId:later.id}).candidate;validateSavedWorkspace(JSON.parse(JSON.stringify({...state,plan:inProgressMoved,journey:newJourney(inProgressMoved)})));
const swap=state.plan.courses.flatMap(c=>manualCourseOptions(c,state.plan.profile).filter(o=>o.code!==c.code&&!state.plan.courses.some(x=>x.code===o.code)).map(o=>({c,o}))).find(({c})=>!!c.code);assert.ok(swap,'Fixture needs a legitimate elective alternative.');const swapped=manualCoursePlan(state.plan,{id:swap.c.id,courseCode:swap.o.code}).candidate;assert.equal(swapped.courses.find(c=>c.id===swap.c.id).code,swap.o.code);validateSavedWorkspace(JSON.parse(JSON.stringify({...state,plan:swapped,journey:newJourney(swapped)})));

const changed=manualDegreePlan(completed,{...completed.profile,program:'BBA',track:'FIN',minor:'computer-science',choices:{}});assert.equal(changed.profile.program,'BBA');assert.ok(changed.academicRecord.some(r=>r.courseCode==='CSC1401'&&r.status==='completed'));assert.ok(changed.academicRecord.every(r=>!r.countsTowardDegree||r.requirementId));assert.equal(changed.targets.internships.length,0,'An old degree shortlist cannot silently carry over as a new-degree recommendation.');
const restored=validateSavedWorkspace(JSON.parse(JSON.stringify({...state,plan:changed,journey:newJourney(changed)})));assert.equal(restored.plan.profile.program,'BBA');
assert.equal(manualCoursePlan(state.plan,{id:course.id,courseCode:'FIN3301'}).candidate.courses.find(c=>c.id===course.id).code,'FIN3301','A personal plan allows a manual replacement from the catalogue.');
const old=structuredClone(state.plan),minorRows=old.courses.filter(c=>c.minorId==='business-administration');old.courses.push({...minorRows[0],id:'legacy-extra-a'},{...minorRows[0],id:'legacy-extra-b'});
const legacy={...state,plan:old,journey:newJourney(old)};const migrated=refreshMinorDraft(legacy);assert.equal(migrated.phase,'draft');assert.equal(migrated.draftPlan.courses.filter(c=>c.minorId==='business-administration').length,5);assert.equal(migrated.plan.courses.filter(c=>c.minorId==='business-administration').length,7,'The original saved snapshot must stay available until the draft is saved.');
const originalFetch=globalThis.fetch;let routes=0,routeStep=5;
globalThis.fetch=async(url)=>{if(String(url).startsWith('/api/service'))return Response.json({action:'test-action',allowance:{step:5,saved:true,globalRemaining:5,stageChanges:[2,2,2,2,2]}});routes++;return Response.json({kind:'journey',startStep:routeStep,summary:'Use a manageable pace.',questions:[]});};
const previousFormData=globalThis.FormData;globalThis.FormData=class{constructor(form){this.form=form;}get(key){return this.form.values[key];}};
try{const count=calls.length;await controller.submit({id:'dashboard-command-form',values:{request:'Keep my summers free and adjust my pace.'}});assert.equal(routes,1);assert.ok(calls.slice(count).includes('pace'));assert.equal(state.phase,'draft');assert.ok(state.draftPlan);assert.equal(JSON.stringify(state.plan),saved,'An agent change must create a preview instead of overwriting the saved roadmap.');state.plan=completed;state.draftPlan=null;state.phase='saved';state.journey=newJourney(completed);const savedTerms=JSON.stringify(completed.terms);routeStep=4;await controller.submit({id:'dashboard-command-form',values:{request:'Suggest more startup companies, keeping my courses.'}});assert.equal(JSON.stringify(state.draftPlan.terms),savedTerms,'Destination edits must preserve manual semester changes.');assert.equal(state.draftPlan.tracking[course.id].status,'completed');
routeStep=5;state.plan=completed;state.draftPlan=null;state.phase='saved';state.journey=newJourney(completed);await controller.submit({id:'dashboard-command-form',values:{request:'Keep summers free.'}});assert.equal(state.draftPlan.tracking[course.id].status,'completed','An adviser edit after progress must retain completed study.');
}finally{globalThis.fetch=originalFetch;globalThis.FormData=previousFormData;}
// Language Center is a direct manual map control, including after AI changes run out.
{
 const lcJourney=suggestChoices(newcomerWorkspace({year:2026}).journey),originalPlan=makePlan(lcJourney),originalRows=JSON.stringify(originalPlan.courses.map(c=>[c.id,c.code,c.credits]));
 let lcState={...seed,phase:'saved',plan:originalPlan,draftPlan:null,journey:newJourney(originalPlan)},formError='',commits=0;
 const lcRuntime={dashboardPanel:'semesters',service:{saved:true,step:5,globalRemaining:0,stageChanges:[0,0,0,0,0]}};
 const lcController=createDashboardController({...hooks,runtime:lcRuntime,read:()=>lcState,changed(){commits++;},getAdvice:async()=>{throw Error('Language Center editing must not call AI.');}});
 const savedFormData=globalThis.FormData;globalThis.FormData=class{constructor(form){this.form=form;}get(key){return this.form.values[key];}};
 const setLC=value=>lcController.submit({id:'dashboard-language-center-form',values:{lc:String(value)},querySelector:()=>({set textContent(text){formError=text;}})});
 try{
  for(const count of [1,2,0]){
   formError='';await setLC(count);assert.equal(formError,'');assert.equal(lcState.draftPlan.profile.lc,count);assert.equal(lcState.draftPlan.terms.filter(t=>t.lc).length,count);assert.equal(JSON.stringify(lcState.draftPlan.courses.map(c=>[c.id,c.code,c.credits])),originalRows,'Language Center cannot add degree courses or credits.');
   const terms=lcState.draftPlan.terms,firstDegree=terms.findIndex(t=>t.courses.length);assert.ok(terms.filter(t=>t.lc).every(t=>terms.indexOf(t)<firstDegree&&t.courses.length===0),'Degree courses must follow the Language Center buffer.');
   assert.equal(lcState.plan.profile.lc,0,'Editing creates a preview without changing the saved plan.');validateSavedWorkspace(JSON.parse(JSON.stringify(lcState)));assert.equal(lcRuntime.service.globalRemaining,0);
   const map=dashboardView(lcState,lcRuntime);assert.ok(map.includes('dashboard-language-center-form'));if(count){assert.ok(map.includes('· Language Center'));assert.ok(map.includes('Reserved for Language Center.'));assert.ok(!map.includes('Space for your next chapter.'));}
  }
  assert.equal(commits,3);const before=JSON.stringify(lcState);await setLC(3);assert.match(formError,/zero, one or two/);assert.equal(JSON.stringify(lcState),before);
  // Current registrations cannot be displaced into a language-only semester.
  const c=originalPlan.courses.find(c=>originalPlan.terms[0].courses.includes(c.id)&&c.code),taking=manualCoursePlan(originalPlan,{id:c.id,status:'in-progress',termId:originalPlan.terms[0].id}).candidate;
  lcState={...lcState,phase:'saved',plan:taking,draftPlan:null,journey:newJourney(taking)};formError='';await setLC(1);assert.equal(formError,'');assert.equal(lcState.draftPlan.profile.lc,1);assert.equal(lcState.draftPlan.tracking[c.id].status,'in-progress');assert.ok(lcState.draftPlan.terms.find(t=>t.id===originalPlan.terms[0].id).courses.includes(c.id),'Manual placement and progress stay under the student’s control.');
 }finally{globalThis.FormData=savedFormData;}
 console.log('Passed visible Language Center map editing, zero/one/two reserved semesters, unchanged degree credits, saved previews, cloud roundtrip, exhausted-AI manual access and protected current registrations. No live calls.');
}
console.log('Passed newcomer entry, one-click roadmap construction, dashboard navigation without API calls, quiet research handling, five-course business minor, mechanical progress, degree-change credit retention, saved-plan previews and actionable adviser routing. No live provider calls.');
