import {courseOptions,needsPersonalConfirmation} from './course-options.js';

export const isFreeSlot=c=>c.choice&&!c.approvalOnly&&!c.approvalRequired&&!needsPersonalConfirmation(c)&&(c.groupId==='free'||/^Free elective/i.test(c.category)||c.category==='Elective');
export function uncoveredPrerequisites(courses,prior=[]){
 const present=new Set([...courses.map(c=>c.code).filter(Boolean),...prior]),missing=new Map();
 for(const c of courses){
  for(const code of [...c.rule.all,...c.rule.coreq])if(!present.has(code)){
   if(!missing.has(code))missing.set(code,[]);missing.get(code).push(c);
  }
 }
 return [...missing].sort((a,b)=>b[1].filter(c=>!isFreeSlot(c)).length-a[1].filter(c=>!isFreeSlot(c)).length);
}
// Use only unfilled, source-eligible free-elective slots with matching credits.
// This cannot append requirements, overwrite choices or authorize an equivalency.
export function allocatePrerequisiteSlots(rows,profile,resolve){
 const courses=[...rows];
 for(let pass=0;pass<rows.length;pass++){
  let filled=false;
  for(const [code] of uncoveredPrerequisites(courses,profile.priorCodes)){
   const i=courses.findIndex(c=>!c.code&&isFreeSlot(c)&&courseOptions(c,profile).some(o=>o.code===code&&!o.topic&&!o.creditsProvisional&&o.credits===c.credits));
   if(i<0)continue;
   courses[i]=resolve(courses[i],code);filled=true;break;
  }
  if(!filled)break;
 }
 return courses.map(c=>isFreeSlot(c)&&c.code?{...c,prerequisiteFor:[...new Set(courses.filter(other=>other.id!==c.id&&[...other.rule.all,...other.rule.coreq].includes(c.code)).map(other=>other.code||other.title))]}:c);
}
