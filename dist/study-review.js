import {DATA,code} from './planner.js';
import {normalizeStudentContext} from './student-context.js';
import {esc,options} from './views.js';
const courseCodes=value=>[...new Set(String(value||'').split(/[,;\s]+/).map(code).filter(Boolean))];
export function studyReviewView(j){
 const context=j.studentContext,records=context?.records||[],completed=records.filter(r=>r.status==='completed').map(r=>r.courseCode),current=records.filter(r=>r.status==='in-progress').map(r=>r.courseCode),term=context?.currentTerm||'Fall-'+j.profile.startYear;
 const year=Number(term.split('-')[1])||Number(j.profile.startYear),terms=Array.from({length:7},(_,i)=>year-2+i).flatMap(y=>['Spring','Summer','Fall'].map(s=>[s+'-'+y,s+' '+y]));
 return `<section class="study-review"><span class="eyebrow">BEFORE YOU BUILD YOUR ROADMAP</span><h3>Reflect on where you are now.</h3><p class="small-note">Starting university? Leave the course lists empty. Already studying? Add passed courses and current registrations so the roadmap plans what remains.</p><div class="field-grid"><label class="field">Completed course codes<input data-study="completed" value="${esc([...new Set([...completed,...j.profile.priorCodes])].join(', '))}" placeholder="CSC1401, ENG1301" maxlength="3000"><small>Only passed courses recognized by AUI. Unmatched credit stays marked for adviser review.</small></label><label class="field">Courses you’re taking now<input data-study="current" value="${esc(current.join(', '))}" placeholder="CSC2302" maxlength="3000"><small>Current registrations are retained, without counting as completed credit.</small></label><label class="field">Plan from semester<select data-study="currentTerm">${options(terms,term)}</select></label><label class="field">Year you began / will begin university<input data-study="studyStartYear" type="number" min="2000" max="2040" value="${context?.studyStartYear||j.profile.startYear}"></label></div><p class="review-summary">${completed.length||j.profile.priorCodes.length} completed · ${current.length} currently registered · ${Number(j.profile.lc)||0} Language Center semester(s) remaining</p><p class="small-note">Language Center study is a separate period before degree coursework. Select only the semesters still needed above; completed Language Center study is not degree credit.</p></section>`;
}
export function updateStudyReview(j,key,value){
 const previous=j.studentContext||{route:'admitted',degreeIntent:'explore',currentDegree:'',currentTerm:'Fall-'+j.profile.startYear,studyStartYear:Number(j.profile.startYear),records:[]},context=structuredClone(previous);
 if(['completed','current'].includes(key)){
  const status=key==='completed'?'completed':'in-progress',codes=courseCodes(value),existing=context.records.filter(r=>r.status===status),other=context.records.filter(r=>r.status!==status);
  for(const courseCode of codes){if(!DATA.courses[courseCode])throw Error('Unknown course code: '+courseCode+'. Check it before continuing.');if(other.some(r=>r.courseCode===courseCode))throw Error(courseCode+' already has a different recorded study status. Review the two lists.');}
  context.records=[...other,...codes.map(courseCode=>existing.find(r=>r.courseCode===courseCode)||{courseCode,status,termId:status==='in-progress'?context.currentTerm:'prior',grade:'',note:''})];
 }else if(key==='currentTerm'){
  if(context.records.some(r=>r.status==='in-progress'&&r.termId!==value))throw Error('Keep the semester of your recorded current courses. Update their progress before changing the semester.');context.currentTerm=value;
 }else if(key==='studyStartYear')context.studyStartYear=Number(value);else throw Error('Unknown study review field.');
 context.route=context.records.length?'continuing':'admitted';const normalized=normalizeStudentContext(context);
 j.studentContext=normalized;j.profile.priorCodes=normalized.records.filter(r=>r.status==='completed').map(r=>r.courseCode);j.profile.startYear=normalized.studyStartYear;
 // Advice was requested before this progress edit; the next request uses fresh context.
 j.agentStamps={};
 return normalized;
}
