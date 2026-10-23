import {proposeReplan} from './replanning.js';
import {sequenceKey,semesterUpdate} from './semester-edits.js';
import {feedbackFor,rememberFeedback} from './agent-context.js';
import {normalizeProfile,coursesFor} from './planner.js';
import {releaseIneligibleChoices} from './course-eligibility.js';
import {questionnaireGoal} from './questionnaire.js';
import {courseOptions} from './course-options.js';
import {academicChanges} from './edit-updates.js';
import {publicStudentContext} from './student-context.js';
export function adviceFingerprint(stage,j){const base={agentVersion:16,stage,questionnaire:j.questionnaire,questionnaireRankings:j.questionnaireRankings,goal:j.goal,background:j.background,answers:j.answers,refinement:feedbackFor(j,stage),level:j.level,preferredDegree:j.preferredDegree,...(j.studentContext?{studentContext:publicStudentContext(j.studentContext)}:{})};if(stage!=='setup'&&(stage!=='direction'||j.programChosen))base.profile={program:j.profile.program,track:j.profile.track,secondTrack:j.profile.secondTrack,minor:j.profile.minor,choices:j.profile.choices,regularCourses:j.profile.regularCourses,summerCourses:j.profile.summerCourses,summers:j.profile.summers,acceleratedEligible:j.profile.gpa!==''&&+j.profile.gpa>=3};return JSON.stringify(base);}
export function acceptAdvice(j,stage,result,editing={}){
 if(result.kind==='answer'||result.kind==='clarify'&&['pace','courses'].includes(stage))return;
 let semesterProposal;
 if(['pace','courses'].includes(stage)&&result.change){
  if(!editing.plan)throw Error('Reopen your semester plan before applying this edit.');
  semesterProposal=proposeReplan(editing.plan,result.change,editing.currentTerm);
  if(!semesterProposal.assessment.canApply)throw Error('This edit leaves course conflicts. Your plan is unchanged.');
  result={...result,update:semesterUpdate(editing.plan,semesterProposal.candidate,semesterProposal.assessment,result.change)};
 }
 rememberFeedback(j,stage,result);
 if(stage==='setup'){j.setup=result;j.level=result.level;j.preferredDegree=result.preferredDegree;}
 if(stage==='direction'){
  const before=j.profile;j.advice=result;j.manual=false;
  if(result.kind==='recommend'){
   const a=result.academic,next=normalizeProfile({...before,...Object.fromEntries(['program','track','secondTrack','minor'].map(k=>[k,a[k]])),choices:{}}),changed=academicChanges(before,next).length>0;
   if(changed||!j.programChosen){
    const options=coursesFor(next),choices={};for(const [id,code]of Object.entries({...before.choices,...j.protectedChoices})){const c=options.find(c=>c.id===id);if(c?.choice&&courseOptions(c,next).some(o=>o.code===code))choices[id]=code;}
    j.profile=normalizeProfile({...next,choices});j.semesterSequence=null;j.choiceReasons={};j.agentChoices={};j.paceAdvice=null;j.agentStamps={};j.detailsDirty=true;
    const degreeChanged=before.program!==next.program;
    if(j.details)j.details={summary:'Course choices for your revised direction.',choices,internships:degreeChanged?[]:j.details.internships||[],exchanges:degreeChanged?[]:j.details.exchanges||[]};
    if(degreeChanged){j.internships=[];j.exchanges=[];if(j.studentContext)j.studentContext.degreeIntent='explore';}
    if(j.scheduling)j.scheduling.moves=(j.scheduling.moves||[]).filter(m=>options.some(c=>c.id===m.requirementId));
   }else j.profile=normalizeProfile({...before,choices:{...before.choices,...j.protectedChoices}});
   j.programChosen=true;
  }else j.step=1;
 }
 if(semesterProposal){const p=semesterProposal.candidate;j.profile=p.profile;if(j.studentContext&&!j.studentContext.records.length&&p.profile.startYear!==editing.plan.profile.startYear)j.studentContext={...j.studentContext,studyStartYear:p.profile.startYear,currentTerm:'Fall-'+p.profile.startYear};j.scheduling=p.scheduling;j.semesterSequence={key:sequenceKey(p.profile),terms:p.terms,assessment:semesterProposal.assessment};}

 if(stage==='courses'){
  // Old durable receipts can replay after a deployment. Validate those choices
  // locally as well, without another model call or a restored allowance.
  const protectedCodes=new Set((j.studentContext?.records||[]).filter(r=>['completed','in-progress'].includes(r.status)).map(r=>r.courseCode));
  const protectedIds=[...Object.keys(j.protectedChoices||{}),...coursesFor(j.profile).filter(c=>protectedCodes.has(c.code)).map(c=>c.id)];
  const released=releaseIneligibleChoices({...j.profile,choices:result.choices},{protectedIds});
  const choices=released.profile.choices,removed=new Set(released.removed.map(c=>c.id));
  const safe={...result,choices,agentChoices:Object.fromEntries(Object.entries(result.agentChoices||result.choices||{}).filter(([id])=>!removed.has(id))),openItems:[...(result.openItems||[]).filter(x=>!removed.has(x.requirementId)),...released.removed.map(c=>({requirementId:c.id,reason:c.message}))]};
  j.agentChoices={...safe.agentChoices};j.profile=normalizeProfile({...j.profile,choices});j.choiceReasons={...j.choiceReasons,...result.choiceReasons};for(const id of [...removed,...(result.change?.clearChoices||[])])delete j.choiceReasons[id];j.details={...j.details,...safe,internships:j.details?.internships||[],exchanges:j.details?.exchanges||[]};j.detailsDirty=false;
 }
 if(stage==='targets'){j.seenTargetIds=Object.fromEntries(['internships','exchanges'].map(type=>[type,[...new Set([...(j.seenTargetIds?.[type]||[]),...(j.details?.[type]||[]).map(t=>t.id),...(result[type]||[]).map(t=>t.id)])].slice(-200)]));j.details={summary:j.details?.summary||'Reviewed academic choices.',...j.details,targetResearch:result.research,targetUpdate:result.update,internships:result.internships,exchanges:result.exchanges,targetSummary:result.summary};j.internships=result.internships.map(t=>t.id);j.exchanges=result.exchanges.map(t=>t.id);}
 if(stage==='pace'){
  if(semesterProposal){const p=semesterProposal.candidate;j.profile=p.profile;if(j.studentContext&&!j.studentContext.records.length&&p.profile.startYear!==editing.plan.profile.startYear)j.studentContext={...j.studentContext,studyStartYear:p.profile.startYear,currentTerm:'Fall-'+p.profile.startYear};j.scheduling=p.scheduling;j.semesterSequence={key:sequenceKey(p.profile),terms:p.terms,assessment:semesterProposal.assessment};j.details={summary:j.details?.summary||'Your degree course choices.',internships:[],exchanges:[],...j.details,choices:{...p.profile.choices}};}
  j.paceAdvice=result;j.profile=normalizeProfile({...j.profile,pace:result.pace,regularCourses:result.regularCourses??(result.pace==='accelerated'?6:5),summerCourses:result.summerCourses??j.profile.summerCourses,summers:result.summers});}
 j.agentStamps={...j.agentStamps,[stage]:adviceFingerprint(stage,j)};
}
export function synchronizeGoal(j){j.goal=questionnaireGoal(j.questionnaire)||j.goal;}
