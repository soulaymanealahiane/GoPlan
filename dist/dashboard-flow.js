import {newJourney,emptyWorkspace,makePlan} from './guidance.js';
import {normalizeProfile,DATA,coursesFor,moveCourse,termOrder,validatePlan,fitDegreePrerequisites} from './planner.js';
import {planningWorkspace,recordedStudy,buildStudentPlan} from './student-context.js';
import {proposeReplan} from './replanning.js';
import {editManualCourse,retainManualEdits,manualCatalogue} from './manual-plan.js';
import {courseOptions,needsPersonalConfirmation} from './course-options.js';
export function manualCourseOptions(c,profile){return manualCatalogue(profile,{scope:'all'}).filter(x=>!x.requirementId);}
export function newcomerWorkspace({year=new Date().getFullYear(),name='',degree=''}={}){
 if(degree&&!DATA.programs.some(p=>p.id===degree&&p.level==='undergraduate'))throw Error('Choose an undergraduate degree.');
 return planningWorkspace({profileName:name,studentContext:{route:'admitted',degreeIntent:degree?'keep':'explore',currentDegree:degree,currentTerm:'Fall-'+year,studyStartYear:year,records:[]}});
}
export function needsBusinessMinorRefresh(plan){return !!(plan?.profile?.program==='BSCSC'&&plan.profile.minor==='business-administration'&&plan.courses.filter(c=>c.minorId==='business-administration').length>5);}
export function refreshMinorDraft(state){
 const plan=state.phase==='draft'?state.draftPlan:state.plan;if(!plan||plan.manualEdits)return state;
 const minorCorrection=needsBusinessMinorRefresh(plan)&&state.journey?.minorDataVersion!==2;
 const protectedCourses=plan.courses.filter(c=>['completed','in-progress'].includes(plan.tracking?.[c.id]?.status)||plan.profile.priorCodes?.includes(c.code)),protectedIds=protectedCourses.map(c=>c.id);
 const profile={...plan.profile,choices:{...plan.profile.choices,...Object.fromEntries(protectedCourses.filter(c=>c.choice&&c.code).map(c=>[c.id,c.code]))}};
 const fitted=fitDegreePrerequisites(profile,{protectedIds});
 const allocations=fitted.courses.filter(c=>c.prerequisiteFor?.length&&plan.courses.find(old=>old.id===c.id)?.code!==c.code).map(c=>({id:c.id,courseCode:c.code,title:c.title,previousCode:plan.courses.find(old=>old.id===c.id)?.code||'',requiredBy:c.prerequisiteFor}));
 if(!minorCorrection&&!allocations.length)return state;
 const result=manualDegreePlan(plan,fitted.profile);result.degreeAllocationChanges=allocations;
 return {...state,journey:result.decisions,draftPlan:result,phase:'draft'};
}
export function studyBoundary(plan,profile=plan.profile){
 const records=recordedStudy(plan),terms=records.map(r=>r.termId).filter(id=>/^(Fall|Spring|Summer)-20\d\d$/.test(id)).map(id=>({id,season:id.split('-')[0],year:Number(id.split('-')[1])})).sort((a,b)=>termOrder(a)-termOrder(b));
 return {records,currentTerm:records.find(r=>r.status==='in-progress')?.termId||terms.at(-1)?.id||'Fall-'+profile.startYear};
}
export function manualDegreePlan(plan,rawProfile){
 const profile=normalizeProfile(rawProfile),{records,currentTerm:recordTerm}=studyBoundary(plan,profile),currentTerm=termOrder({season:recordTerm.split('-')[0],year:Number(recordTerm.split('-')[1])})<termOrder({season:'Fall',year:profile.startYear})?'Fall-'+profile.startYear:recordTerm;
 const j=newJourney(plan),degreeChanged=profile.program!==plan.profile.program;
 j.profile=profile;j.programChosen=true;j.minorDataVersion=2;j.studentContext={route:records.length?'continuing':'admitted',degreeIntent:'keep',currentDegree:profile.program,currentTerm,studyStartYear:profile.startYear,records};
 j.advice={kind:'recommend',summary:'Your chosen academic direction.',themes:[],questions:[],tradeoffs:[],academic:{program:profile.program,track:profile.track,secondTrack:profile.secondTrack,minor:profile.minor,rationale:'Chosen by you.',focusRationale:'Chosen by you.',minorRationale:'Chosen by you.',secondFocusRationale:'Chosen by you.'}};
 if(degreeChanged){j.details={summary:'Your degree choices.',choices:profile.choices,internships:[],exchanges:[]};j.internships=[];j.exchanges=[];j.paceAdvice=null;}
 j.agentStamps={};
 if(plan.manualEdits){const next=makePlan(j,plan);next.id=plan.id;next.createdAt=plan.createdAt;const dated=records.map(r=>r.termId).filter(id=>/^(Fall|Spring|Summer)-20\d\d$/.test(id)).sort((a,b)=>termOrder({season:a.split('-')[0],year:Number(a.split('-')[1])})-termOrder({season:b.split('-')[0],year:Number(b.split('-')[1])}));const last=dated.at(-1)||currentTerm,boundary=termOrder({season:last.split('-')[0],year:Number(last.split('-')[1])})<termOrder({season:'Fall',year:profile.startYear})?'Fall-'+profile.startYear:last,compatible=records.filter(r=>r.status!=='in-progress'||r.termId===boundary);next.studentContext={...structuredClone(j.studentContext),currentTerm:boundary,route:compatible.length?'continuing':'admitted',records:compatible};next.academicRecord=compatible.map(r=>{const c=next.courses.find(c=>c.code===r.courseCode);return {...r,requirementId:c?.id||'',countsTowardDegree:r.status==='completed'&&!!c,review:!c,reason:'Progress recorded by you.'};});return retainManualEdits(next,plan);}
 return buildStudentPlan(j,plan);
}
export function manualCoursePlan(plan,change){const candidate=editManualCourse(plan,change);return {candidate,issues:validatePlan(candidate.terms,candidate.courses,candidate.profile,candidate.scheduling||{})};}
