import {QUESTIONS,questionnaireGoal} from './questionnaire.js';
import {newJourney} from './guidance.js';
import {acceptAdvice} from './journey-state.js';
import {buildProposal} from './workspace-flow.js';
import {normalizeStudentContext,recordedStudy} from './student-context.js';
import {coursesFor,termOrder,fitDegreePrerequisites} from './planner.js';
import {roadmapUpdate} from './edit-updates.js';
import {checkedMinorPlan} from './minor-plan.js';

export const EDIT_SECTIONS=['direction','courses','companies','exchanges','semesters'];
export function validateEditRoute(route){
 if(!Array.isArray(route.sections)||route.sections.length>5||route.sections.some(s=>!EDIT_SECTIONS.includes(s))||new Set(route.sections).size!==route.sections.length||typeof route.rebuild!=='boolean')throw Error('Invalid roadmap edit scope.');
 if(!route.instructions||EDIT_SECTIONS.some(s=>typeof route.instructions[s]!=='string'||route.instructions[s].length>2500))throw Error('Invalid section instructions.');
 if(route.questionnaireChanges!==undefined&&(!Array.isArray(route.questionnaireChanges)||route.questionnaireChanges.length>8||new Set(route.questionnaireChanges.map(x=>x.answerId)).size!==route.questionnaireChanges.length||route.questionnaireChanges.some(x=>!QUESTIONS.some(q=>q.id===x.answerId)||typeof x.value!=='string'||x.value.length>2500)))throw Error('Invalid planning-goal edits.');
 if(['journey','schedule'].includes(route.kind)&&!route.sections.length&&!route.rebuild)throw Error('Identify the roadmap sections that need editing.');
 return route;
}
// One global allowance covers this transaction. At most four specialist calls
// follow its router call. No partial journey or draft is committed on failure.
export async function editRoadmap(previous,route,request,call){
 validateEditRoute(route);if(!previous)throw Error('Build your roadmap before applying a global edit.');
 const j=newJourney(previous),wanted=new Set(route.sections),updates=[],records=recordedStudy(previous);
 // Manual progress can advance beyond the original onboarding date. Current
 // registration is authoritative; otherwise retain the latest known study term.
 const dated=[j.studentContext?.currentTerm,...records.map(r=>r.termId)].filter(id=>/^(Fall|Spring|Summer)-20\d\d$/.test(id||'')).map(id=>({id,season:id.split('-')[0],year:Number(id.split('-')[1])})).sort((a,b)=>termOrder(a)-termOrder(b));
 const currentTerm=records.find(r=>r.status==='in-progress')?.termId||dated.at(-1)?.id||previous.terms.find(t=>!['prior','pending'].includes(t.id))?.id||'Fall-2026';
 const goalsChanged=(route.questionnaireChanges||[]).some(x=>j.questionnaire[x.answerId]!==x.value);for(const x of route.questionnaireChanges||[])j.questionnaire[x.answerId]=x.value;if(goalsChanged){j.goal=questionnaireGoal(j.questionnaire);wanted.add('direction');}
 j.refinements={};j.changeRequest=request;j.editStartStep=wanted.has('direction')?2:wanted.has('courses')?3:wanted.has('companies')||wanted.has('exchanges')?4:5;j.editFromTerm=currentTerm;
 j.studentContext=normalizeStudentContext({...j.studentContext,route:records.length?'continuing':j.studentContext?.route||'admitted',degreeIntent:wanted.has('direction')?'explore':j.studentContext?.degreeIntent||'keep',currentDegree:j.studentContext?.currentDegree||previous.profile.program,currentTerm,studyStartYear:j.studentContext?.studyStartYear||previous.profile.startYear,records});
 if(route.rebuild){j.agentChoices={...j.profile.choices};j.semesterSequence=null;j.scheduling={...j.scheduling,moves:[],termLoads:[]};}
 const feedback=section=>route.instructions[section]||request;
 let draft=previous,coursePlan=null,verifiedCourses=false;
 async function stage(name,text,plan){
  j.refinements[name]=text;const result=await call(name,j,plan,currentTerm);
  if(result.kind==='answer'||result.kind==='clarify')return {kind:result.kind,summary:result.answer||result.questions?.[0]||result.summary,questions:result.questions};
  acceptAdvice(j,name,result,{plan,currentTerm});if(name==='direction'&&result.coursePlan)coursePlan=result.coursePlan;if(result.update)updates.push(result.update);return null;
 }
 if(wanted.has('direction')){const stop=await stage('direction',feedback('direction'),previous);if(stop)return stop;}
 const combinationChanged=['program','track','secondTrack','minor'].some(k=>j.profile[k]!==previous.profile[k]),degreeChanged=j.profile.program!==previous.profile.program;
 if(combinationChanged){const protectedCodes=new Set(records.filter(r=>['completed','in-progress'].includes(r.status)).map(r=>r.courseCode)),protectedIds=coursesFor(j.profile).filter(c=>protectedCodes.has(c.code)).map(c=>c.id);j.profile=fitDegreePrerequisites(j.profile,{protectedIds}).profile;}
 if(coursePlan){
  const checked=checkedMinorPlan(j.profile,coursePlan,{protectedCodes:records.filter(r=>['completed','in-progress'].includes(r.status)).map(r=>r.courseCode)});
  acceptAdvice(j,'courses',{summary:`Selected ${checked.summary.requiredCourses} ${checked.summary.name} courses within the existing degree requirements.`,choices:checked.profile.choices,agentChoices:checked.profile.choices,choiceReasons:Object.fromEntries(Object.keys(checked.profile.choices).map(id=>[id,'Part of the validated minor recommendation within existing degree slots.'])),openItems:[],update:{summary:'Applied the course selection that established the minor recommendation.',changes:[],limitations:[]}});verifiedCourses=true;
 }
 const known=new Set(coursesFor(j.profile).map(c=>c.id));j.scheduling={...j.scheduling,moves:(j.scheduling?.moves||[]).filter(m=>known.has(m.requirementId))};
 const needCourses=wanted.has('courses')||combinationChanged||route.rebuild;
 const independentCourseEdit=/\b(?:swap|replace|clear|redistribute|reassign|change)\b[^.;\n]{0,70}\b(?:electives?|[A-Z]{3}\s*\d{4})\b/i.test(request);
 if(needCourses&&(!verifiedCourses||wanted.has('courses')&&independentCourseEdit)){
  if(wanted.has('courses')){draft=buildProposal(j,previous);const stop=await stage('courses',feedback('courses'),draft);if(stop)return stop;}
  else {const stop=await stage('courses',route.rebuild?'Rebuild the uncompleted selectable course choices for this roadmap. Preserve protected study and source requirements; recommend a fresh coherent selection.':'');if(stop)return stop;}
 }
 const companies=wanted.has('companies')||degreeChanged||route.rebuild,exchanges=wanted.has('exchanges')||degreeChanged||route.rebuild;
 if(companies||exchanges){
  const scoped=companies&&exchanges?`Change both companies and exchanges. Companies: ${feedback('companies')} Exchanges: ${feedback('exchanges')}`:companies?`Change companies only. Preserve exchange destinations. ${feedback('companies')}`:`Change exchange destinations only. Preserve companies. ${feedback('exchanges')}`;
  const stop=await stage('targets',scoped);if(stop)return stop;
 }
 draft=buildProposal(j,previous);
 if(wanted.has('semesters')){const stop=await stage('pace',feedback('semesters'),draft);if(stop)return stop;draft=buildProposal(j,previous);}
 if(verifiedCourses){checkedMinorPlan(draft.profile,{academic:Object.fromEntries(['program','track','secondTrack','minor'].map(k=>[k,draft.profile[k]||''])),choices:draft.profile.choices});const rows=draft.courses.filter(c=>c.minorId===draft.profile.minor),pending=new Set(draft.terms.find(t=>t.id==='pending')?.courses||[]);if(rows.some(c=>!c.code||pending.has(c.id)||!independentCourseEdit&&c.choice&&coursePlan.choices[c.id]!==c.code))throw Error('A placement or later edit prevents the recommended minor courses from fitting. Your saved plan is unchanged.');}
 if(!j.paceAdvice)j.paceAdvice={summary:'Your revised semester map.',pace:j.profile.pace,regularCourses:j.profile.regularCourses,summerCourses:j.profile.summerCourses,summers:j.profile.summers,reason:'Rebuilt from the revised academic choices.',actions:[]};
 const update=roadmapUpdate(previous,draft,updates);if(goalsChanged){update.changes.unshift('Updated your stated planning goals.');update.summary='Updated your stated planning goals.'+(update.summary==='Your roadmap is unchanged.'?'':' '+update.summary);}j.lastUpdates={...j.lastUpdates,global:update};draft.decisions=structuredClone(j);draft.updatedAt=new Date().toISOString();
 return {kind:'updated',candidate:draft,journey:j,update};
}
