import {DATA,normalizeProfile,coursesFor,generatePlan,validatePlan,programFor,termOrder,label} from './planner.js';
import {selectedMinor} from './minors.js';
import {courseOptions,needsPersonalConfirmation} from './course-options.js';

export function parseTerm(id){const m=/^(Fall|Spring|Summer)-(20\d\d)$/.exec(id||'');if(!m)throw Error('Choose a valid semester.');return {id,season:m[1],year:Number(m[2])};}
export const graduationTerm=plan=>plan.terms.filter(t=>!['pending','prior'].includes(t.id)&&t.courses.length).at(-1)||null;
export function replanSnapshot(plan){return {profile:{program:plan.profile.program,track:plan.profile.track,secondTrack:plan.profile.secondTrack,minor:plan.profile.minor,choices:plan.profile.choices,pace:plan.profile.pace,regularCourses:plan.profile.regularCourses,summerCourses:plan.profile.summerCourses,summers:plan.profile.summers,startYear:plan.profile.startYear,lc:plan.profile.lc,priorCodes:plan.profile.priorCodes},terms:plan.terms.map(({id,season,year,courses})=>({id,season,year,courses})),progress:Object.entries(plan.tracking||{}).filter(([,t])=>['completed','in-progress','retake'].includes(t.status)).map(([id,t])=>({id,status:t.status})),unavailable:plan.scheduling?.unavailable||[]};}
export function restoreSnapshot(raw){
 if(!raw||!Array.isArray(raw.terms)||raw.terms.length>100||!Array.isArray(raw.progress)||raw.progress.length>300)throw Error('Invalid planning history.');
 const profile=normalizeProfile(raw.profile),courses=coursesFor(profile),known=new Set(courses.map(c=>c.id)),seen=new Set();let order=-Infinity;
 const terms=raw.terms.map(t=>{const term=['prior','pending'].includes(t.id)?{id:t.id,season:t.id==='prior'?'Prior':'Pending',year:0}:parseTerm(t.id);if(!Array.isArray(t.courses)||t.courses.some(id=>!known.has(id)||seen.has(id)))throw Error('Invalid saved courses.');t.courses.forEach(id=>seen.add(id));if(!['prior','pending'].includes(t.id)){if(termOrder(term)<=order)throw Error('Invalid semester order.');order=termOrder(term);}return {...term,courses:[...t.courses]};});
 if(seen.size!==known.size)throw Error('Incomplete planning history.');
 const tracking={};for(const p of raw.progress){if(!known.has(p.id)||!['completed','in-progress','retake'].includes(p.status))throw Error('Invalid course progress.');tracking[p.id]={status:p.status};}
 return {profile,courses,terms,tracking,program:programFor(profile),reports:[],scheduling:{unavailable:raw.unavailable||[]},decisions:{},targets:{internships:[],exchanges:[],auiMasters:[],globalMasters:[]}};
}
export function proposeReplan(plan,change,currentTerm){
 const boundary=parseTerm(currentTerm),old=normalizeProfile(plan.profile),program=programFor(old);
 const track=change.track??old.track,secondTrack=change.secondTrack??old.secondTrack,minor=change.minor??old.minor;
 if(program.tracks.length&&!program.tracks.some(t=>t.id===track))throw Error('This focus is not offered in the selected degree.');
 if(secondTrack&&(!['BBA','BSCSC'].includes(old.program)||secondTrack===track||!program.tracks.some(t=>t.id===secondTrack)))throw Error('This second focus is not supported.');
 if(minor&&!selectedMinor({...old,minor}))throw Error('This minor is not supported for your degree.');
 const profile=normalizeProfile({...old,track,secondTrack,minor,regularCourses:change.regularCourses??(change.pace&&change.pace!==old.pace?(change.pace==='accelerated'?6:5):old.regularCourses),summerCourses:change.summerCourses??old.summerCourses,summers:change.summers??old.summers});
 if((profile.regularCourses>old.regularCourses||profile.summers&&profile.summerCourses===3&&(!old.summers||old.summerCourses<3))&&(old.gpa===''||old.gpa<3))throw Error('Confirm CGPA 3.0 and good standing before increasing to six regular courses or three summer courses.');
 const protectedCourses=plan.courses.filter(c=>['completed','in-progress'].includes(plan.tracking?.[c.id]?.status));
 const options=coursesFor(profile),choices={...profile.choices};
 for(const item of change.choices||[]){const c=options.find(c=>c.id===item.requirementId);if(!c?.choice||c.approvalOnly||needsPersonalConfirmation(c)||!courseOptions(c,profile).some(o=>o.code===item.courseCode&&!o.topic&&!o.creditsProvisional))throw Error('This requested course needs a verified equivalent or placement approval.');if(protectedCourses.some(p=>p.id===c.id&&p.code!==item.courseCode))throw Error('Completed and current courses cannot be replaced.');choices[c.id]=item.courseCode;}
 profile.choices=choices;const courses=coursesFor(profile);
 for(const c of protectedCourses)if(!courses.some(n=>n.id===c.id&&n.code===c.code))throw Error('This academic change would remove completed or current work. Keep this roadmap and use Update life decisions for a separate degree review.');
 const frozenIds=new Set(protectedCourses.map(c=>c.id));
 const fixedTerms=plan.terms.filter(t=>!['prior','pending'].includes(t.id)).map(t=>({...t,courses:t.courses.filter(id=>frozenIds.has(id))})).filter(t=>t.courses.length);
 if(fixedTerms.some(t=>termOrder(t)>termOrder(boundary)&&t.courses.some(id=>plan.tracking[id]?.status==='in-progress')))throw Error('The edit semester cannot be earlier than a course marked as currently studying.');
 // Validate reports against the original plan, before replacements remove their codes.
 for(const x of change.unavailable||[])if(!plan.courses.some(c=>c.code===x.courseCode))throw Error('Choose an unavailable course from your degree plan.');
 const unavailable=[...new Map([...(plan.scheduling?.unavailable||[]),...(change.unavailable||[])].map(x=>[x.courseCode+'@'+x.termId,x])).values()];
 for(const x of unavailable){parseTerm(x.termId);if(!DATA.courses[x.courseCode])throw Error('Unknown unavailable course.');if(fixedTerms.some(t=>t.id===x.termId&&t.courses.some(id=>plan.courses.find(c=>c.id===id)?.code===x.courseCode)))throw Error('A completed or current course cannot also be unavailable in that semester. Update its progress first.');}
 const terms=generatePlan(profile,{fixedTerms,notBefore:boundary,unavailable});
 const tracking=Object.fromEntries(Object.entries(plan.tracking||{}).filter(([id])=>courses.some(c=>c.id===id&&c.code===plan.courses.find(old=>old.id===id)?.code)));
 const candidate={...structuredClone(plan),profile,courses,terms,tracking,program:structuredClone(program),minor:selectedMinor(profile),scheduling:{unavailable},updatedAt:new Date().toISOString()};
 const issues=validatePlan(terms,courses,profile);
 for(const t of terms)for(const id of t.courses){const c=courses.find(c=>c.id===id);if(unavailable.some(x=>x.termId===t.id&&x.courseCode===c.code))issues.push({level:'conflict',id,text:c.code+' is unavailable in '+label(t)+'.'});}
 const before=graduationTerm(plan),after=graduationTerm(candidate),pending=terms.find(t=>t.id==='pending')?.courses.length||0;
 const conflicts=issues.filter(i=>i.level==='conflict'),unresolved=courses.filter(c=>c.unresolved).length;
 const priorIssues=validatePlan(plan.terms,plan.courses,old),priorPending=new Set(plan.terms.find(t=>t.id==='pending')?.courses||[]);
 const newlyPending=(terms.find(t=>t.id==='pending')?.courses||[]).filter(id=>!priorPending.has(id));
 const newConflicts=conflicts.filter(i=>!i.text.includes('requirements need manual placement')&&!priorIssues.some(p=>p.level==='conflict'&&p.id===i.id&&p.text===i.text));
 const extraRegularTerms=before&&after?terms.filter(t=>t.season!=='Summer'&&!['prior','pending'].includes(t.id)&&termOrder(t)>termOrder(before)&&termOrder(t)<=termOrder(after)).length:0;
 const moves=courses.flatMap(c=>{const from=plan.terms.find(t=>t.courses.includes(c.id)),to=terms.find(t=>t.courses.includes(c.id));return from?.id!==to?.id?[{id:c.id,course:c.code||c.title,from:from?label(from):'New requirement',to:to?label(to):'Unscheduled'}]:[];});
 const replacements=courses.flatMap(c=>{const previous=plan.courses.find(old=>old.id===c.id);return previous?.code&&c.code&&previous.code!==c.code?[{id:c.id,from:previous.code,to:c.code,title:c.title,requirement:c.category,reason:(change.choices||[]).find(x=>x.requirementId===c.id)?.reason||'Eligible alternative for the same requirement.'}]:[];});
 return {candidate,assessment:{canApply:newConflicts.length===0&&newlyPending.length===0,status:pending||conflicts.length||unresolved?'needs-review':before&&after&&termOrder(after)>termOrder(before)?'delayed':'within-target',delayed:!!(before&&after&&termOrder(after)>termOrder(before)),before:before?label(before):'Unconfirmed',after:after?label(after):'Unconfirmed',extraRegularTerms,unresolved,pending,newlyPending,issues,moves,replacements,completedPreserved:protectedCourses.filter(c=>plan.tracking[c.id].status==='completed').length}};
}
