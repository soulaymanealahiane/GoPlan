import {DATA,coursesFor,limits,termOrder,label} from './planner.js';
import {courseOptions,needsPersonalConfirmation} from './course-options.js';

const termPattern=/^(Fall|Spring|Summer)-(20\d\d)$/;
const courseCode=value=>String(value||'').replace(/\s/g,'').toUpperCase();
function validTerm(value){if(typeof value!=='string'||!termPattern.test(value))throw Error('Choose a valid semester for the course-offering report.');return value;}
function codes(value){if(!Array.isArray(value)||value.length>600)throw Error('Invalid course-offering list.');return [...new Set(value.map(courseCode).map(id=>{if(!DATA.courses[id])throw Error('Unknown course in the offering report: '+id+'.');return id;}))];}

// Reports are student supplied. A partial list never establishes absence of an unlisted course.
export function normalizeScheduling(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid course-offering reports.');
 if(raw.unavailable!=null&&(!Array.isArray(raw.unavailable)||raw.unavailable.length>1200))throw Error('Invalid unavailable-course report.');
 if(raw.offerings!=null&&(!Array.isArray(raw.offerings)||raw.offerings.length>100))throw Error('Invalid semester offering reports.');
 if(raw.currentRegistrations!=null&&(!Array.isArray(raw.currentRegistrations)||raw.currentRegistrations.length>100))throw Error('Invalid current registrations.');
 const offerings=[...new Map((raw.offerings||[]).map(item=>{
  if(!item||typeof item!=='object'||item.complete!=null&&typeof item.complete!=='boolean')throw Error('Invalid semester offering report.');
  const termId=validTerm(item.termId),offeredCourseCodes=codes(item.offeredCourseCodes||[]),unavailableCourseCodes=codes(item.unavailableCourseCodes||[]);
  if(offeredCourseCodes.some(id=>unavailableCourseCodes.includes(id)))throw Error('A course cannot be both offered and unavailable in the same report.');
  return [termId,{termId,offeredCourseCodes,unavailableCourseCodes,complete:item.complete===true}];
 })).values()];
 const unavailable=[...new Map((raw.unavailable||[]).map(item=>{
  if(!item||typeof item!=='object')throw Error('Invalid unavailable-course report.');
  const termId=validTerm(item.termId),id=courseCode(item.courseCode);if(!DATA.courses[id])throw Error('Unknown unavailable course.');
  return [id+'@'+termId,{courseCode:id,termId}];
 })).values()].filter(item=>!offerings.some(t=>t.termId===item.termId&&t.offeredCourseCodes.includes(item.courseCode)));
 const registrationCodes=new Set(),currentRegistrations=(raw.currentRegistrations||[]).map(item=>{if(!item||typeof item!=='object')throw Error('Invalid current registration.');const id=courseCode(item.courseCode),termId=validTerm(item.termId);if(!DATA.courses[id]||registrationCodes.has(id))throw Error('Use a known course once in current registrations.');registrationCodes.add(id);return {courseCode:id,termId};});
 return {unavailable,offerings,...(currentRegistrations.length?{currentRegistrations}:{})};
}

export function mergeScheduling(current={},change={}){
 const old=normalizeScheduling(current),updates=normalizeScheduling({offerings:change.offerings||[],unavailable:change.unavailable||[]});
 // Replacing a term report is also how a student corrects or clears a stale report.
 const refreshed=new Set(updates.offerings.map(t=>t.termId));
 return normalizeScheduling({offerings:[...old.offerings.filter(t=>!refreshed.has(t.termId)),...updates.offerings],unavailable:[...old.unavailable.filter(t=>!refreshed.has(t.termId)),...updates.unavailable],currentRegistrations:change.currentRegistrations??old.currentRegistrations??[]});
}

export function courseAvailability(course,termId,scheduling={}){
 const id=courseCode(course),entry=scheduling.offerings?.find(t=>t.termId===termId);
 if(entry?.offeredCourseCodes.includes(id))return {status:'reported-offered',allowed:true,confirmed:false,reason:'Reported offered by the student; registration and timetable remain to be checked.'};
 if(entry?.unavailableCourseCodes.includes(id)||scheduling.unavailable?.some(t=>t.termId===termId&&t.courseCode===id))return {status:'reported-unavailable',allowed:false,confirmed:false,reason:'Reported unavailable in this semester.'};
 if(entry?.complete)return {status:'not-listed',allowed:false,confirmed:false,reason:'Absent from the complete course-offering list supplied for this semester.'};
 return {status:'unknown',allowed:true,confirmed:false,reason:'No current offering information was supplied for this course and semester.'};
}

const parse=id=>{const [,season,year]=termPattern.exec(validTerm(id));return {id,season,year:Number(year)};};
const protectedCourse=(plan,c)=>['completed','in-progress'].includes(plan.tracking?.[c.id]?.status)||(plan.profile.priorCodes||[]).includes(c.code);
function prerequisites(c,done,credits,same=[]){
 const rule=c.rule,blocked=[];
 if(rule.all.some(id=>!done.has(id)))blocked.push('Earlier prerequisites: '+rule.all.filter(id=>!done.has(id)).join(', '));
 if(rule.any.length&&!rule.any.some(id=>done.has(id)))blocked.push('Earlier prerequisite: one of '+rule.any.join(' / '));
 if(rule.coreq.some(id=>!done.has(id)&&!same.includes(id)))blocked.push('Earlier or simultaneous corequisites: '+rule.coreq.filter(id=>!done.has(id)&&!same.includes(id)).join(', '));
 if(credits<rule.minCredits)blocked.push('Requires '+rule.minCredits+' earlier credits');
 if(rule.minProgramCourses&&(rule.programCourseCodes||[]).filter(id=>done.has(id)).length<rule.minProgramCourses)blocked.push('Requires '+rule.minProgramCourses+' earlier program courses');
 return blocked;
}
export function prerequisiteDependants(courses,course){
 const visited=new Set(),queue=[course];while(queue.length){const code=queue.shift();for(const c of courses)if(c.code&&!visited.has(c.id)&&(c.rule.all.includes(code)||c.rule.any.includes(code)||c.rule.coreq.includes(code))){visited.add(c.id);queue.push(c.code);}}
 return courses.filter(c=>visited.has(c.id)&&c.code!==course).map(c=>({requirementId:c.id,courseCode:c.code,title:c.title}));
}

export function analyzeCourseAvailability(plan,currentTerm,supplied=plan.scheduling||{}){
 const term=parse(currentTerm),scheduling=normalizeScheduling(supplied),entry=scheduling.offerings.find(t=>t.termId===currentTerm),courses=plan.courses;
 const earlierTerms=plan.terms.filter(t=>t.id==='prior'||t.id!=='pending'&&termOrder(t)<termOrder(term)),earlierIds=new Set(earlierTerms.flatMap(t=>t.courses));
 const done=new Set([...(plan.profile.priorCodes||[]),...courses.filter(c=>earlierIds.has(c.id)&&c.code&&protectedCourse(plan,c)).map(c=>c.code)]);
 const credits=[...done].reduce((n,id)=>n+(DATA.courses[id]?.credits||0),0),currentIds=plan.terms.find(t=>t.id===currentTerm)?.courses||[],current=courses.filter(c=>currentIds.includes(c.id)),cap=limits(plan.profile,term.season==='Summer');
 const isFieldwork=c=>['EGR4300','INT4001','INT4012'].includes(c.code),internshipOnly=term.season==='Summer'&&(plan.terms.find(t=>t.id===currentTerm)?.internshipOnly||current.some(isFieldwork)||term.year===plan.profile.startYear+3&&courses.some(c=>isFieldwork(c)&&!done.has(c.code)));
 const affected=courses.filter(c=>currentIds.includes(c.id)&&!courseAvailability(c.code,currentTerm,scheduling).allowed).map(c=>{
  const protectedWork=protectedCourse(plan,c),selectable=c.choice&&!c.approvalOnly&&!needsPersonalConfirmation(c),kind=protectedWork?'protected':selectable?'selectable':'required';
  const alternatives=selectable&&!protectedWork?courseOptions(c,plan.profile).filter(o=>o.code!==c.code&&!o.topic&&!o.creditsProvisional).map(o=>{
   const availability=courseAvailability(o.code,currentTerm,scheduling);
   if(!availability.allowed)return {courseCode:o.code,title:o.title,availability:availability.status,blockedBy:[availability.reason],eligible:false};
   if(courses.some(x=>x.id!==c.id&&x.code===o.code)||plan.profile.priorCodes?.includes(o.code))return {courseCode:o.code,title:o.title,availability:availability.status,blockedBy:['Already counted toward another requirement or prior credit'],eligible:false};
   const next=coursesFor({...plan.profile,choices:{...plan.profile.choices,[c.id]:o.code}}),option=next.find(x=>x.id===c.id),other=current.filter(x=>x.id!==c.id&&courseAvailability(x.code,currentTerm,scheduling).allowed),blockedBy=prerequisites(option,done,credits,other.map(x=>x.code));
   if(!availability.allowed)blockedBy.push(availability.reason);
   if(option.unresolved)blockedBy.push('The course credits or registration identity still need confirmation');
   if(next.some(x=>x.id!==c.id&&x.code===o.code)||plan.profile.priorCodes?.includes(o.code))blockedBy.push('Already counted toward another requirement or prior credit');
   if(option.offeredTerms&&!option.offeredTerms.includes(term.season))blockedBy.push('Source-based placement: '+option.offeredTerms.join(' / '));
   if(internshipOnly&&!isFieldwork(option))blockedBy.push('This semester is reserved for internship fieldwork');
   if(term.season==='Summer'&&!plan.profile.summers&&!isFieldwork(option))blockedBy.push('Summer classroom study is disabled in this plan');
   const previous=earlierTerms.at(-1);if(option.rule.previousId&&!previous?.courses.includes(option.rule.previousId)||option.rule.previousSeason&&(previous?.season!==option.rule.previousSeason||previous?.year!==term.year))blockedBy.push('The required consecutive registration sequence is not satisfied');
   const load=other.reduce((n,x)=>n+x.loadCredits,0)+option.loadCredits,count=other.filter(x=>x.loadCredits>0).length+(option.loadCredits>0?1:0);
   if(load>cap.credits||count>cap.count)blockedBy.push('Exceeds the selected semester workload');
   if(term.season==='Summer'&&[...other,option].filter(x=>x.lab).length>1)blockedBy.push('Summer laboratory limit');
   return {courseCode:o.code,title:option.title,availability:availability.status,blockedBy,eligible:blockedBy.length===0};
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||Number(b.availability==='reported-offered')-Number(a.availability==='reported-offered')||a.courseCode.localeCompare(b.courseCode)):[];
  return {requirementId:c.id,courseCode:c.code,title:c.title,termId:currentTerm,kind,action:kind==='protected'?'correct-report-or-progress':kind==='selectable'?'consider-eligible-alternative':'postpone-required-course',availability:courseAvailability(c.code,currentTerm,scheduling).status,alternatives,dependants:prerequisiteDependants(courses,c.code)};
 });
 const affectedIds=new Set(affected.map(c=>c.requirementId)),keep=current.filter(c=>!affectedIds.has(c.id)),same=keep.map(c=>c.code),freeCount=cap.count-keep.filter(c=>c.loadCredits>0).length,freeCredits=cap.credits-keep.reduce((n,c)=>n+c.loadCredits,0);
 const fillers=courses.filter(c=>!internshipOnly&&(term.season!=='Summer'||plan.profile.summers)&&c.code&&!c.unresolved&&!protectedCourse(plan,c)&&!currentIds.includes(c.id)&&!(plan.profile.priorCodes||[]).includes(c.code)&&!c.rule.finalTerm).flatMap(c=>{
  const availability=courseAvailability(c.code,currentTerm,scheduling),blocked=prerequisites(c,done,credits,same);
  if(!availability.allowed||blocked.length||c.offeredTerms&&!c.offeredTerms.includes(term.season)||c.loadCredits>freeCredits||c.loadCredits>0&&freeCount<1||c.rule.previousId||c.rule.previousSeason||term.season==='Summer'&&[...keep,c].filter(x=>x.lab).length>1)return [];
  if(isFieldwork(c))return [];
  return [{requirementId:c.id,courseCode:c.code,title:c.title,fromTerm:plan.terms.find(t=>t.courses.includes(c.id))?.id||'pending',availability:availability.status}];
 }).sort((a,b)=>Number(b.availability==='reported-offered')-Number(a.availability==='reported-offered'));
 const bottlenecks=affected.map(c=>({code:c.kind==='protected'?'protected-course-conflict':c.kind==='required'?'required-course-unavailable':c.alternatives.some(a=>a.eligible)?'elective-alternative':'no-eligible-elective-alternative',requirementId:c.requirementId,termId:currentTerm,message:c.kind==='protected'?'A completed or current course cannot be removed; correct the offering report or course progress.':c.kind==='required'?'Keep this required course and schedule it later; no unapproved equivalent can replace it.':c.alternatives.some(a=>a.eligible)?'A different allowed course can satisfy this same requirement, subject to the listed checks.':'No safe replacement is currently available for this requirement; postpone or seek academic approval.',dependants:c.dependants}));
 const assumptions=[entry?.complete?'Unlisted courses are treated as unavailable only in the reported complete semester list.':'Unlisted courses remain unknown; a partial offering list does not establish their availability or absence.','Only credited or protected earlier work counts as completed prerequisites; earlier untracked planned courses must be rescheduled.','Reports come from the student. Seat capacity, clashes, permission and official registration are not verified.','Future semesters without offering reports are provisional; a postponed course is not confirmed to be offered.'];
 return {scheduling,termId:currentTerm,completeness:entry?(entry.complete?'complete':'partial'):'unknown',affected,fillers,bottlenecks,assumptions};
}
