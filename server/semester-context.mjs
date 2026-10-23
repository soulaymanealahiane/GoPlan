import {DATA} from '../dist/planner.js';
import {courseOptions,needsPersonalConfirmation} from '../dist/course-options.js';
import {correctedCourse} from '../dist/academic-corrections.js';
import {manualRule} from '../dist/manual-checks.js';

// Search every source-backed option, then send the relevant slice. Combined
// substitutions are validated atomically, so a prerequisite can fill another
// existing elective slot in the same request.
export function semesterContext(plan,request){
 plan={...plan,courses:plan.courses.map(course=>correctedCourse(plan.profile,course))};
 const compact=c=>({code:c.code,title:c.title,credits:c.credits,prerequisites:c.rule,offeredTerms:c.offeredTerms||null}),catalog=new Map(plan.courses.filter(c=>c.code).map(c=>[c.code,compact(c)]));
 const normalized=request.replace(/\b([a-z]{3})\s+(\d{4})\b/gi,'$1$2').toUpperCase(),words=request.toLowerCase().match(/[a-z]{4,}/g)||[],referenced=new Set(Object.keys(DATA.courses).filter(code=>normalized.includes(code)));
 const needed=new Set(plan.courses.flatMap(c=>[...c.rule.all,...c.rule.any,...c.rule.coreq]));
 const requirements=plan.courses.filter(c=>c.choice).map(c=>{
  const protectedWork=['completed','in-progress'].includes(plan.tracking?.[c.id]?.status)||plan.profile.priorCodes.includes(c.code),options=protectedWork||c.approvalOnly||needsPersonalConfirmation(c)?[]:courseOptions(c,plan.profile).filter(o=>!o.topic&&!o.creditsProvisional);
  const score=o=>(referenced.has(o.code)?10000:0)+(o.code===c.code?1000:0)+(needed.has(o.code)?500:0)+words.filter(w=>(o.title||'').toLowerCase().includes(w)).length*100;
  const selected=options.sort((a,b)=>score(b)-score(a)).slice(0,28);
  for(const o of selected)catalog.set(o.code,compact(correctedCourse(plan.profile,{...DATA.courses[o.code],...o,rule:manualRule(plan.profile,o,plan.courses)})));
  return {id:c.id,title:c.title,category:c.category,selectedCourse:c.code,protected:protectedWork,options:selected.map(o=>o.code)};
 });
 return {requirements,catalog:[...catalog.values()],currentCourses:plan.courses.map(c=>({requirementId:c.id,code:c.code,title:c.title,credits:c.loadCredits,category:c.category,choice:!!c.choice,termId:plan.terms.find(t=>t.courses.includes(c.id))?.id,status:plan.tracking[c.id]?.status||'planned',prerequisites:c.rule}))};
}
