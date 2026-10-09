import {DATA,normalizeProfile,coursesFor,generatePlan,validatePlan,termOrder,code,label} from './planner.js';
import {emptyWorkspace,newJourney,makePlan} from './guidance.js';
import {courseOptions,needsPersonalConfirmation} from './course-options.js';
import {normalizeScheduling} from './course-availability.js';

const semesters=/^(Fall|Spring|Summer)-(20\d\d)$/;
const validProgram=id=>DATA.programs.some(p=>p.id===id);
const parse=id=>{const match=semesters.exec(id||'');if(!match)throw Error('Choose a valid semester.');return {id,season:match[1],year:Number(match[2])};};
const text=(value,max)=>String(value??'').trim().slice(0,max);
export function normalizeStudentContext(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid student starting point.');
 const route=raw.route||'admitted',degreeIntent=raw.degreeIntent||'explore',currentDegree=raw.currentDegree||'',currentTerm=raw.currentTerm||'Fall-2026',studyStartYear=Number(raw.studyStartYear??parse(currentTerm).year);
 if(!['admitted','continuing'].includes(route)||!['keep','explore'].includes(degreeIntent))throw Error('Choose your student starting point and degree preference.');
 if(currentDegree&&!validProgram(currentDegree)||degreeIntent==='keep'&&!currentDegree)throw Error('Choose the degree you want to keep.');
 const boundary=parse(currentTerm);if(!Number.isInteger(studyStartYear)||studyStartYear<2000||studyStartYear>2040||studyStartYear>boundary.year)throw Error('Choose a valid study start year before your current semester.');
 if(!Array.isArray(raw.records||[])||(raw.records||[]).length>300)throw Error('Invalid recorded study.');
 const seen=new Set(),records=(raw.records||[]).map(record=>{
  if(!record||typeof record!=='object'||Array.isArray(record))throw Error('Invalid study record.');
  const courseCode=code(record.courseCode),status=record.status,termId=record.termId||'prior';
  if(!DATA.courses[courseCode]||!['completed','in-progress','retake'].includes(status)||seen.has(courseCode))throw Error('Use a known course once with its recorded study status.');seen.add(courseCode);
  if(termId!=='prior'&&termOrder(parse(termId))>termOrder(boundary))throw Error('Recorded study cannot be later than your current semester.');
  if(status==='in-progress'&&termId!==currentTerm)throw Error('Current courses must belong to your current semester.');
  if(typeof record.grade!=='undefined'&&typeof record.grade!=='string'||typeof record.note!=='undefined'&&typeof record.note!=='string')throw Error('Invalid private course progress.');
  const grade=text(record.grade,30).toUpperCase().replace(/-/g,'−');
  if(grade&&!['A','A−','B+','B','B−','C+','C','C−','D+','D','F','P','W','I','NP'].includes(grade))throw Error('Use a recognized course grade or leave the grade blank.');
  if(status==='completed'&&['F','W','I','NP'].includes(grade))throw Error('Failed, withdrawn or incomplete study cannot count as completed credit. Record a retake instead.');
  if(status==='completed'&&Number(courseCode.slice(3))>=5000&&['C+','C','C−','D+','D'].includes(grade))throw Error('This graduate grade is below B−. Record the repeat or confirm degree-credit approval before counting completion.');
  return {courseCode,status,termId,grade,note:text(record.note,2000)};
 });
 if(route==='admitted'&&records.length)throw Error('Use the continuing-student route to retain recorded university study.');
 return {route,degreeIntent,currentDegree,currentTerm,studyStartYear,records};
}
export function publicStudentContext(raw){
 const context=normalizeStudentContext(raw);return {...context,records:context.records.map(({courseCode,status,termId})=>({courseCode,status,termId}))};
}
export function recordedStudy(plan){
 if(!plan)return [];
 const records=new Map((plan.academicRecord||plan.studentContext?.records||[]).map(r=>[r.courseCode,{courseCode:r.courseCode,status:r.status,termId:r.termId,grade:r.grade||'',note:r.note||''}]));
 for(const course of plan.courses||[]){
  const progress=plan.tracking?.[course.id];if(!course.code||!['completed','in-progress','retake'].includes(progress?.status))continue;
  const term=plan.terms?.find(t=>t.courses.includes(course.id));records.set(course.code,{courseCode:course.code,status:progress.status,termId:term?.id==='pending'?'prior':term?.id||'prior',grade:progress.grade||'',note:progress.note||''});
 }
 for(const courseCode of plan.profile?.priorCodes||[])if(!records.has(courseCode))records.set(courseCode,{courseCode,status:'completed',termId:'prior',grade:'',note:'Recorded before this roadmap'});
 return [...records.values()];
}
function inferredContext(previous){
 const saved=previous?.studentContext||previous?.decisions?.studentContext,records=recordedStudy(previous),current=records.find(r=>r.status==='in-progress')?.termId||saved?.currentTerm||previous?.terms?.find(t=>!['prior','pending'].includes(t.id)&&t.courses.some(id=>previous.tracking?.[id]?.status!=='completed'))?.id||'Fall-2026';
 return {route:records.length?'continuing':saved?.route||'admitted',degreeIntent:'explore',currentDegree:previous?.profile?.program||'',currentTerm:current,studyStartYear:saved?.studyStartYear||previous?.profile?.startYear||parse(current).year,records};
}
export function planningWorkspace(input={},previousPlan){
 const supplied=input.studentContext||input,seed=inferredContext(previousPlan),mergedRecords=new Map(seed.records.map(r=>[r.courseCode,r]));
 for(const record of supplied.records||[])mergedRecords.set(code(record.courseCode),record);
 const combined={...seed,...supplied,records:[...mergedRecords.values()]};if(combined.records.length)combined.route='continuing';
 const context=normalizeStudentContext(combined),state=emptyWorkspace(),j=state.journey,degree=DATA.programs.find(p=>p.id===context.currentDegree);
 j.studentContext=context;j.scheduling=normalizeScheduling(previousPlan?.scheduling||{});j.step=1;j.level=degree?.level||'undergraduate';j.preferredDegree=context.degreeIntent==='keep'?context.currentDegree:'undecided';j.programChosen=false;
 j.profile=normalizeProfile({...j.profile,name:input.profileName||input.profile?.name||previousPlan?.profile?.name||'',program:context.degreeIntent==='keep'?context.currentDegree:j.profile.program,startYear:context.studyStartYear,priorCodes:context.records.filter(r=>r.status==='completed').map(r=>r.courseCode),choices:{}});
 const summary=context.route==='continuing'?'Plan your next semesters using your recorded university study.':'Explore your interests and plan your degree after university admission.';
 j.setup={summary,level:j.level,preferredDegree:j.preferredDegree,reason:context.degreeIntent==='keep'?'Use your chosen degree as the planning preference.':'Compare academic directions with a fresh questionnaire.',questions:[]};
 return state;
}

function assignRecordedChoices(profile,records,previous){
 const choices={...profile.choices},used=new Set(),matches=new Map();
 const ordered=[...records].sort((a,b)=>Number(b.status==='in-progress')-Number(a.status==='in-progress')||Number(b.status==='completed')-Number(a.status==='completed'));
 for(const record of ordered){
  let courses=coursesFor({...profile,choices}),match=courses.filter(c=>c.code===record.courseCode&&!used.has(c.id)).sort((a,b)=>Number(a.choice)-Number(b.choice))[0];
  if(!match&&record.status!=='retake'){
   const original=previous?.courses?.find(c=>c.code===record.courseCode&&['completed','in-progress'].includes(previous.tracking?.[c.id]?.status)),eligible=courses.filter(c=>c.choice&&!c.approvalOnly&&!c.approvalRequired&&!needsPersonalConfirmation(c)&&!used.has(c.id)&&courseOptions(c,profile).some(o=>o.code===record.courseCode&&!o.topic&&!o.creditsProvisional));
   eligible.sort((a,b)=>Number(b.id===original?.id)-Number(a.id===original?.id)||(a.options?.length||1000)-(b.options?.length||1000));match=eligible[0];
   if(match){choices[match.id]=record.courseCode;courses=coursesFor({...profile,choices});match=courses.find(c=>c.id===match.id);}
  }
  if(!match)continue;
  // A transcript course can count once, even when the agent also selected it for another slot.
  for(const duplicate of courses.filter(c=>c.id!==match.id&&c.choice&&c.code===record.courseCode&&!used.has(c.id)))delete choices[duplicate.id];
  used.add(match.id);matches.set(record.courseCode,match.id);
 }
 return {profile:normalizeProfile({...profile,choices}),matches};
}
export function studentPlanInputs(rawProfile,rawContext,existingScheduling={},previous){
 const context=normalizeStudentContext(rawContext),records=context.records;
 if(context.degreeIntent==='keep'&&rawProfile.program!==context.currentDegree)throw Error('This workflow keeps your chosen degree. Use degree exploration to compare another degree.');
 const raw=normalizeProfile({...rawProfile,startYear:context.studyStartYear,priorCodes:records.filter(r=>r.status==='completed').map(r=>r.courseCode)}),{profile,matches}=assignRecordedChoices(raw,records,previous),current=records.filter(r=>r.status==='in-progress'),fixedIds=current.map(r=>matches.get(r.courseCode)).filter(Boolean),boundary=parse(context.currentTerm),carried=normalizeScheduling(existingScheduling),reports=normalizeScheduling({...carried,currentRegistrations:current.filter(r=>!matches.has(r.courseCode)).map(({courseCode,termId})=>({courseCode,termId}))});
 return {context,profile,courses:coursesFor(profile),matches,scheduling:{...reports,notBefore:boundary,fixedTerms:fixedIds.length?[{...boundary,courses:fixedIds,exchange:false,lc:false}]:[]}};
}
export function buildStudentPlan(j,previous){
 const inputs=studentPlanInputs(j.profile,j.studentContext,j.scheduling||previous?.scheduling||{},previous),{context,profile,matches}=inputs,records=context.records,current=records.filter(r=>r.status==='in-progress'),plan=makePlan({...structuredClone(j),profile}),courses=plan.courses,scheduling=normalizeScheduling(inputs.scheduling);
 plan.profile=profile;plan.studentContext=structuredClone(context);plan.scheduling=scheduling;plan.tracking={};
 for(const record of records){const id=matches.get(record.courseCode);if(id)plan.tracking[id]={status:record.status,grade:record.grade,note:record.note};}
 plan.terms=generatePlan(profile,inputs.scheduling);
 plan.academicRecord=records.map(r=>{const requirementId=matches.get(r.courseCode)||'',countsTowardDegree=!!requirementId&&r.status==='completed';return {...r,requirementId,countsTowardDegree,review:!requirementId,reason:requirementId?r.status==='completed'?'Exact source-listed course matches this requirement in the draft.':r.status==='in-progress'?'Current registration is retained; it is not completed credit.':'Retake remains required; failed study is not completed credit.':'Recorded study is retained. Degree applicability needs university review; no replacement or transferred credit is assumed.'};});
 const issues=validatePlan(plan.terms,courses,profile,scheduling),conflicts=issues.filter(i=>i.level==='conflict'),unmatched=plan.academicRecord.filter(r=>r.review);
 for(const record of unmatched)issues.push({level:'review',id:'',text:`${record.courseCode}: recorded ${record.status} study is retained outside the new degree requirements. Confirm its applicability with your academic adviser.`});
 const pending=plan.terms.find(t=>t.id==='pending')?.courses||[],after=plan.terms.filter(t=>!['prior','pending'].includes(t.id)&&t.courses.length).at(-1),before=previous?.terms?.filter(t=>!['prior','pending'].includes(t.id)&&t.courses.length).at(-1);
 const extraRegularTerms=before&&after?Math.max(0,(after.year-before.year)*2+Number(after.season==='Fall')-Number(before.season==='Fall')):0;
 plan.revisionAssessment={canApply:conflicts.length===0,status:conflicts.length||pending.length?'needs-review':'within-target',issues,pending:pending.length,unmatchedRecords:unmatched.length,completedPreserved:records.filter(r=>r.status==='completed').length,inProgressPreserved:current.length,before:before?label(before):'New plan',after:after?label(after):'Unconfirmed',delayed:!!(before&&after&&termOrder(after)>termOrder(before)),extraRegularTerms};
 if(conflicts.length)throw Error('Your recorded study is retained, but this degree proposal has course or current-registration conflicts: '+conflicts.slice(0,3).map(i=>i.text).join(' '));
 return plan;
}
