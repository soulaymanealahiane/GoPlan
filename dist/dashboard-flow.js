import {newJourney,emptyWorkspace,makePlan} from './guidance.js';
import {normalizeProfile,DATA,coursesFor,moveCourse,termOrder,validatePlan,fitDegreePrerequisites} from './planner.js';
import {planningWorkspace,recordedStudy,buildStudentPlan} from './student-context.js';
import {proposeReplan} from './replanning.js';
import {courseOptions,needsPersonalConfirmation} from './course-options.js';
export function manualCourseOptions(c,profile){return !c.choice||c.approvalOnly||c.approvalRequired||needsPersonalConfirmation(c)?[]:courseOptions(c,profile).filter(o=>!o.topic&&!o.creditsProvisional);}
export function newcomerWorkspace({year=new Date().getFullYear(),name='',degree=''}={}){
 if(degree&&!DATA.programs.some(p=>p.id===degree&&p.level==='undergraduate'))throw Error('Choose an undergraduate degree.');
 return planningWorkspace({profileName:name,studentContext:{route:'admitted',degreeIntent:degree?'keep':'explore',currentDegree:degree,currentTerm:'Fall-'+year,studyStartYear:year,records:[]}});
}
export function needsBusinessMinorRefresh(plan){return !!(plan?.profile?.program==='BSCSC'&&plan.profile.minor==='business-administration'&&plan.courses.filter(c=>c.minorId==='business-administration').length>5);}
export function refreshMinorDraft(state){
 const plan=state.phase==='draft'?state.draftPlan:state.plan;if(!plan)return state;
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
 const profile=normalizeProfile(rawProfile),{records,currentTerm}=studyBoundary(plan,profile);
 const j=newJourney(plan),degreeChanged=profile.program!==plan.profile.program;
 j.profile=profile;j.programChosen=true;j.minorDataVersion=2;j.studentContext={route:records.length?'continuing':'admitted',degreeIntent:'keep',currentDegree:profile.program,currentTerm,studyStartYear:profile.startYear,records};
 j.advice={kind:'recommend',summary:'Your chosen academic direction.',themes:[],questions:[],tradeoffs:[],academic:{program:profile.program,track:profile.track,secondTrack:profile.secondTrack,minor:profile.minor,rationale:'Chosen by you.',focusRationale:'Chosen by you.',minorRationale:'Chosen by you.',secondFocusRationale:'Chosen by you.'}};
 if(degreeChanged){j.details={summary:'Your degree choices.',choices:profile.choices,internships:[],exchanges:[]};j.internships=[];j.exchanges=[];j.paceAdvice=null;}
 j.agentStamps={};
 return buildStudentPlan(j,plan);
}
export function manualCoursePlan(plan,{id,courseCode,termId,status}){
 const original=plan.courses.find(c=>c.id===id);if(!original)throw Error('Choose a course in your plan.');
 let candidate=structuredClone(plan);
 if(courseCode&&courseCode!==original.code){
  if(['completed','in-progress'].includes(plan.tracking?.[id]?.status))throw Error('Undo its recorded progress before changing this course.');
  if(!original.choice)throw Error('This is a required degree course. Ask GoPlan to revise its timing instead.');
  const current=plan.terms.find(t=>!['prior','pending'].includes(t.id))?.id;
  const revised=proposeReplan(plan,{choices:[{requirementId:id,courseCode}]},current);
  if(!revised.assessment.canApply)throw Error('This swap needs a different course sequence. Ask GoPlan to find a feasible alternative.');
  candidate=revised.candidate;
 }
 if(termId){if(!candidate.terms.some(t=>t.id===termId&&(t.id!=='prior'||plan.terms.find(t=>t.id==='prior')?.courses.includes(id))))throw Error('Choose a semester in your roadmap.');if(!candidate.terms.find(t=>t.id===termId)?.courses.includes(id))candidate.terms=moveCourse(candidate.terms,id,termId);}
 if(status){
  if(!['planned','in-progress','completed','retake'].includes(status))throw Error('Choose a valid course status.');
  const course=candidate.courses.find(c=>c.id===id);
  const destination=candidate.terms.find(t=>t.courses.includes(id));
  if(destination?.id==='prior'&&status!=='completed')throw Error('Choose a future semester when undoing completed credit.');
  if(status==='in-progress'&&(!destination||['prior','pending'].includes(destination.id)))throw Error('Choose a regular or summer semester for a course you are taking now.');
  if(status==='in-progress'&&candidate.courses.some(c=>c.id!==id&&candidate.tracking?.[c.id]?.status==='in-progress'&&!destination.courses.includes(c.id)))throw Error('Finish updating your earlier semester before marking courses in another semester as taking now.');
  if(status==='completed'&&(!course.code||course.unresolved))throw Error('Choose a confirmed course before marking it complete.');
  candidate.tracking[id]={...candidate.tracking[id],status};
  if(status!=='completed')candidate.profile.priorCodes=candidate.profile.priorCodes.filter(x=>x!==course.code);
  if(status==='completed'&&['F','W','I','NP'].includes(candidate.tracking[id].grade))candidate.tracking[id].grade='';
  for(const owner of [candidate.studentContext,candidate.decisions?.studentContext])if(owner?.records)owner.records=owner.records.filter(x=>x.courseCode!==course.code||status!=='planned').map(x=>x.courseCode===course.code?{...x,status,termId:destination?.id||x.termId,grade:candidate.tracking[id].grade||''}:x);
  if(candidate.academicRecord)candidate.academicRecord=candidate.academicRecord.filter(x=>x.courseCode!==course.code||status!=='planned').map(x=>x.courseCode===course.code?{...x,status,termId:destination?.id||x.termId,grade:candidate.tracking[id].grade||'',countsTowardDegree:status==='completed'&&!!x.requirementId}:x);
 }
 const records=recordedStudy(candidate),currentRecords=records.filter(x=>x.status==='in-progress'),recordedTerms=records.map(x=>candidate.terms.find(t=>t.id===x.termId&&t.id!=='prior')).filter(Boolean).sort((a,b)=>termOrder(a)-termOrder(b)),boundary=currentRecords[0]?.termId||recordedTerms.at(-1)?.id||candidate.studentContext?.currentTerm||'Fall-'+candidate.profile.startYear;
 if(currentRecords.some(x=>x.termId!==boundary)||recordedTerms.some(t=>termOrder(t)>termOrder(candidate.terms.find(t=>t.id===boundary)||{season:boundary.split('-')[0],year:Number(boundary.split('-')[1])})))throw Error('Your completed courses cannot be later than a semester marked as taking now. Update those course statuses first.');
 const context={route:records.length?'continuing':'admitted',degreeIntent:'keep',currentDegree:candidate.profile.program,currentTerm:boundary,studyStartYear:candidate.profile.startYear,records};
 candidate.studentContext=context;candidate.academicRecord=records.map(record=>{const old=candidate.academicRecord?.find(x=>x.courseCode===record.courseCode),c=candidate.courses.find(x=>x.code===record.courseCode),requirementId=c?.id||'';return {...old,...record,requirementId,review:!requirementId,countsTowardDegree:record.status==='completed'&&!!requirementId,reason:old?.reason||'Course progress recorded by you.'};});
 candidate.decisions={...candidate.decisions,studentContext:structuredClone(context),profile:structuredClone(candidate.profile)};candidate.updatedAt=new Date().toISOString();
 return {candidate,issues:validatePlan(candidate.terms,candidate.courses,candidate.profile,candidate.scheduling||{})};
}
