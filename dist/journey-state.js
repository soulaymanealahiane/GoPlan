import {feedbackFor,rememberFeedback} from './agent-context.js';
import {normalizeProfile} from './planner.js';
import {questionnaireGoal} from './questionnaire.js';
import {publicStudentContext} from './student-context.js';
export function adviceFingerprint(stage,j){const base={agentVersion:8,stage,questionnaire:j.questionnaire,goal:j.goal,background:j.background,answers:j.answers,refinement:feedbackFor(j,stage),level:j.level,preferredDegree:j.preferredDegree,...(j.studentContext?{studentContext:publicStudentContext(j.studentContext)}:{})};if(!['setup','direction'].includes(stage))base.profile={program:j.profile.program,track:j.profile.track,secondTrack:j.profile.secondTrack,minor:j.profile.minor,choices:j.profile.choices,regularCourses:j.profile.regularCourses,summerCourses:j.profile.summerCourses,summers:j.profile.summers,acceleratedEligible:j.profile.gpa!==''&&+j.profile.gpa>=3};return JSON.stringify(base);}
export function acceptAdvice(j,stage,result){
 if(result.kind==='answer')return;
 rememberFeedback(j,stage,result);
 if(stage==='setup'){j.setup=result;j.level=result.level;j.preferredDegree=result.preferredDegree;}
 if(stage==='direction'){j.advice=result;j.manual=false;j.details=null;j.choiceReasons={};j.agentChoices={};j.internships=[];j.exchanges=[];j.paceAdvice=null;j.agentStamps={};if(result.kind==='recommend'){const a=result.academic;j.profile=normalizeProfile({...j.profile,program:a.program,track:a.track,secondTrack:a.secondTrack,minor:a.minor,choices:{...j.protectedChoices}});j.programChosen=true;}else j.step=1;}
 if(stage==='courses'){j.agentChoices={...(result.agentChoices||result.choices)};j.profile=normalizeProfile({...j.profile,choices:result.choices});j.choiceReasons={...j.choiceReasons,...result.choiceReasons};j.details={...j.details,...result,internships:j.details?.internships||[],exchanges:j.details?.exchanges||[]};j.detailsDirty=false;}
 if(stage==='targets'){j.details={summary:j.details?.summary||'Reviewed academic choices.',...j.details,targetResearch:result.research,targetUpdate:result.update,internships:result.internships,exchanges:result.exchanges,targetSummary:result.summary};j.internships=result.internships.map(t=>t.id);j.exchanges=result.exchanges.map(t=>t.id);}
 if(stage==='pace'){j.paceAdvice=result;j.profile=normalizeProfile({...j.profile,pace:result.pace,regularCourses:result.regularCourses??(result.pace==='accelerated'?6:5),summerCourses:result.summerCourses??j.profile.summerCourses,summers:result.summers});}
 j.agentStamps={...j.agentStamps,[stage]:adviceFingerprint(stage,j)};
}
export function synchronizeGoal(j){j.goal=questionnaireGoal(j.questionnaire)||j.goal;}
