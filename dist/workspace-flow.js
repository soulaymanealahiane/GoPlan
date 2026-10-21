import {sequenceKey} from './semester-edits.js';
import {retainManualEdits} from './manual-plan.js';
import {emptyWorkspace,newJourney,makePlan} from './guidance.js';
import {proposeReplan,restoreSnapshot} from './replanning.js';
import {buildStudentPlan,normalizeStudentContext,recordedStudy} from './student-context.js';

export const hasDraft=state=>state.phase==='draft'||!!(state.phase==='journey'&&(state.journey.background?.trim()||Object.values(state.journey.questionnaire||{}).some(x=>x?.trim())||state.journey.advice));
export const freshWorkspace=()=>emptyWorkspace();
export function editJourney(plan,request,startStep,currentTerm){
 const j=newJourney(plan);j.step=startStep;j.changeRequest=request;j.editFromTerm=currentTerm;j.editStartStep=startStep;
 j.refinements={};j.agentStamps={};j.lastUpdates={};j.protectedChoices=Object.fromEntries(plan.courses.filter(c=>c.choice&&c.code&&['completed','in-progress'].includes(plan.tracking?.[c.id]?.status)).map(c=>[c.id,c.code]));
 const affected=startStep<=2?['direction','courses','targets','pace']:startStep===3?['courses','targets','pace']:startStep===4?['targets']:['pace'];
 for(const stage of affected)j.refinements[stage]=request;
 return j;
}
export function buildProposal(j,previous){
 const plan=retainManualEdits(buildCoreProposal(j,previous),previous),sequence=j.semesterSequence;
 if(sequence?.key===sequenceKey(j.profile)){
  restoreSnapshot({profile:j.profile,terms:sequence.terms,progress:[]});
  const ids=new Set(plan.courses.map(c=>c.id)),received=sequence.terms.flatMap(t=>t.courses);
  if(received.length===ids.size&&new Set(received).size===ids.size&&received.every(id=>ids.has(id))){plan.terms=structuredClone(sequence.terms);plan.scheduling=structuredClone(j.scheduling);plan.revisionAssessment=structuredClone(sequence.assessment);if(plan.manualEdits)for(const id of Object.keys(plan.manualEdits.placements))plan.manualEdits.placements[id]=plan.terms.find(t=>t.courses.includes(id))?.id||'pending';}
 }
 return plan;
}
function buildCoreProposal(j,previous){
 if(!previous)return j.studentContext?buildStudentPlan(j):makePlan(j);
 // Destination-only edits must not reschedule even one course.
 if(j.editStartStep===4&&['program','track','secondTrack','minor','pace','regularCourses','summerCourses','summers','startYear','lc'].every(k=>j.profile[k]===previous.profile[k])&&JSON.stringify(j.profile.choices)===JSON.stringify(previous.profile.choices)){const plan=structuredClone(previous);plan.decisions=structuredClone(j);plan.targets.internships=structuredClone(j.details?.internships||[]);plan.targets.exchanges=structuredClone(j.details?.exchanges||[]);return plan;}
 if(j.studentContext){
  if(j.editStartStep!==undefined){const records=recordedStudy(previous),currentTerm=records.find(r=>r.status==='in-progress')?.termId||j.editFromTerm||j.studentContext.currentTerm;j={...structuredClone(j),studentContext:normalizeStudentContext({...j.studentContext,route:records.length?'continuing':j.studentContext.route,currentTerm,records})};}
  return buildStudentPlan(j,previous);
 }
 if(j.profile.program!==previous.profile.program){
  if(Object.values(previous.tracking).some(t=>['completed','in-progress'].includes(t.status)))throw Error('Changing degree with recorded study needs a credit-transfer review. Your existing plan is safe. Review this change with your academic adviser before rebuilding.');
  return makePlan(j,previous);
 }
 const current=j.editFromTerm||previous.terms.find(t=>!['prior','pending'].includes(t.id))?.id;
 const changes=Object.entries(j.profile.choices).filter(([id,code])=>previous.profile.choices[id]!==code).map(([requirementId,courseCode])=>({requirementId,courseCode}));
 const result=proposeReplan(previous,{track:j.profile.track,secondTrack:j.profile.secondTrack,minor:j.profile.minor,pace:j.profile.pace,regularCourses:j.profile.regularCourses,summerCourses:j.profile.summerCourses,summers:j.profile.summers,allowConditionalLoad:j.semesterSequence?.key===sequenceKey(j.profile),choices:changes,...(j.scheduling||{})},current);
 if(!result.assessment.canApply)throw Error('This change leaves new course conflicts. Your saved plan is safe. Adjust the request or review the affected requirements before saving.');
 result.candidate.decisions=structuredClone(j);result.candidate.targets={...result.candidate.targets,internships:structuredClone(j.details?.internships||[]),exchanges:structuredClone(j.details?.exchanges||[])};result.candidate.revisionAssessment=result.assessment;
 return result.candidate;
}
