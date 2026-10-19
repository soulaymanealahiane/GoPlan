import {DATA,coursesFor,termOrder} from './planner.js';
import {courseOptions} from './course-options.js';
import {manualRule,checkManualPlacement} from './manual-checks.js';

const statuses=new Set(['planned','in-progress','completed','retake']);
const text=(value,max)=>String(value??'').trim().slice(0,max);
const validTerm=(plan,id)=>plan.terms.find(t=>t.id===id);
export function manualCatalogue(profile,{scope='degree',search=''}={}){
 const degree=coursesFor(profile),records=new Map();
 for(const row of degree){
  if(row.code)records.set(row.code,{...DATA.courses[row.code],code:row.code,title:row.title,credits:row.credits});
  else records.set('slot:'+row.id,{code:'slot:'+row.id,title:row.title,credits:row.credits,requirementId:row.id});
  if(row.choice)for(const entry of courseOptions(row,profile))if(!entry.topic&&entry.code)records.set(entry.code,{...DATA.courses[entry.code],...entry});
 }
 if(scope==='all')for(const [code,entry]of Object.entries(DATA.courses))if(!records.has(code)&&entry.title)records.set(code,{...entry,code});
 const words=text(search,160).toLowerCase().split(/\s+/).filter(Boolean);
 return [...records.values()].filter(c=>words.every(w=>(c.code+' '+c.title).toLowerCase().includes(w))).sort((a,b)=>a.code.localeCompare(b.code));
}
function edited(plan){const p=structuredClone(plan);p.manualEdits={version:1,removedIds:[],removedTermIds:[],placements:{},...p.manualEdits};p.academicRecord||=[];p.tracking||={};if(!p.studentContext)p.studentContext={route:'admitted',degreeIntent:'keep',currentDegree:p.profile.program,currentTerm:p.terms.find(t=>!['prior','pending'].includes(t.id))?.id||'Fall-'+p.profile.startYear,studyStartYear:p.profile.startYear,records:[]};return p;}
function finish(p){p.profile.priorCodes=[...new Set([...(p.profile.priorCodes||[]),...p.courses.filter(c=>c.code&&p.tracking[c.id]?.status==='completed').map(c=>c.code)])];p.updatedAt=new Date().toISOString();p.manualEdits.updatedAt=p.updatedAt;p.decisions={...p.decisions,profile:structuredClone(p.profile)};return p;}
function forgetRecord(p,course){
 if(!course?.code)return;
 p.profile.priorCodes=(p.profile.priorCodes||[]).filter(c=>c!==course.code);
 p.academicRecord=(p.academicRecord||[]).filter(r=>r.courseCode!==course.code);
 for(const owner of [p.studentContext,p.decisions?.studentContext])if(owner?.records)owner.records=owner.records.filter(r=>r.courseCode!==course.code);
}
function sourceCourse(profile,key){
 if(key.startsWith('slot:')){const row=coursesFor(profile).find(c=>c.id===key.slice(5));if(!row)throw Error('Choose a course or requirement from the list.');return {...row,manualRequirementId:row.id};}
 const entry=DATA.courses[key]||coursesFor(profile).find(c=>c.code===key);
 if(!entry)throw Error('Choose a course from the AUI list.');
 const credits=Number(entry.credits)||0;
 return {...entry,code:key,title:entry.title||key,credits,loadCredits:credits,kind:'core',category:'Added courses',unresolved:!!entry.creditsProvisional,rule:manualRule(profile,{...entry,code:key})};
}
export function editManualCourse(plan,{id,courseCode,termId,status}){
 const original=plan.courses.find(c=>c.id===id);if(!original)throw Error('This course is no longer in your plan.');
 if(status&&!statuses.has(status))throw Error('Choose a valid course status.');
 if(termId&&!validTerm(plan,termId))throw Error('Choose a semester in your plan.');
 let p=edited(plan);const originalTerm=plan.terms.find(t=>t.courses.includes(id));let course=p.courses.find(c=>c.id===id);forgetRecord(p,original);
 if(courseCode&&courseCode!==course.code){
  const replacement=sourceCourse(p.profile,courseCode);
  const duplicate=p.courses.find(c=>c.id!==id&&replacement.code&&c.code===replacement.code);
  if(duplicate){
   const from=p.terms.find(t=>t.courses.includes(duplicate.id)),to=validTerm(p,termId||originalTerm?.id);
   if(from?.id!=='pending'&&(from?.id==='prior'||to?.id==='pending'||termOrder(from)<=termOrder(to)))throw Error(replacement.code+' is already in '+(from?.id==='prior'?'your completed courses':from.season+' '+from.year)+'. Open that course to move it. Your plan has not changed.');
   p=removeManualCourse(p,duplicate.id);course=p.courses.find(c=>c.id===id);
  }
  Object.assign(course,replacement,{id,category:original.category,kind:original.kind,manualOverride:true});
  // A manually selected catalogue course is a personal assignment, not an AI-approved replacement.
  delete course.prerequisiteFor;delete course.supportingPrerequisite;delete course.replacementFor;
 }
 if(termId){for(const t of p.terms)t.courses=t.courses.filter(c=>c!==id);validTerm(p,termId).courses.push(id);p.manualEdits.placements[id]=termId;}
 const nextStatus=status||p.tracking[id]?.status||'planned';p.tracking[id]={...p.tracking[id],status:nextStatus};
 if(nextStatus==='completed'&&['F','W','I','NP'].includes(p.tracking[id].grade))p.tracking[id].grade='';
 if(nextStatus==='completed'&&course.code)p.profile.priorCodes=[...new Set([...p.profile.priorCodes,course.code])];
 // Uncoded language/placement requirements can be self-reported as complete.
 // No course code, equivalency or official credit is invented to do so.
 if(course.code!==original.code||termId&&termId!==originalTerm?.id)checkManualPlacement(plan,p,id);
 return finish(p);
}
export function addManualCourse(plan,{courseCode,termId,anotherAttempt=false}){
 if(!validTerm(plan,termId))throw Error('Choose a semester in your plan.');
 const selected=sourceCourse(plan.profile,String(courseCode||''));
 const existing=plan.courses.find(c=>selected.code?c.code===selected.code:(c.manualRequirementId||c.id)===selected.id);
 if(existing&&!anotherAttempt)return editManualCourse(plan,{id:existing.id,termId});
 if(plan.courses.length>=300)throw Error('Your plan has reached 300 courses. Remove a course before adding another.');
 const p=edited(plan),id='manual-'+crypto.randomUUID(),course={...selected,id,manualAddition:true,category:'Added courses'};
 p.courses.push(course);validTerm(p,termId).courses.push(id);p.tracking[id]={status:'planned',grade:'',note:''};p.manualEdits.placements[id]=termId;
 checkManualPlacement(plan,p,id);
 return finish(p);
}
export function removeManualCourse(plan,id){
 const original=plan.courses.find(c=>c.id===id);if(!original)throw Error('This course is no longer in your plan.');
 const p=edited(plan);forgetRecord(p,original);p.courses=p.courses.filter(c=>c.id!==id);for(const t of p.terms)t.courses=t.courses.filter(c=>c!==id);
 delete p.tracking[id];delete p.manualEdits.placements[id];p.reports=(p.reports||[]).filter(r=>r.courseId!==id);
 if(!original.manualAddition)p.manualEdits.removedIds=[...new Set([...p.manualEdits.removedIds,id])];
 return finish(p);
}
export function noteManualSemester(plan,termId,note){
 if(!validTerm(plan,termId))throw Error('Choose a semester in your plan.');
 if(typeof note!=='string'||note.length>2000)throw Error('Keep the semester note within 2,000 characters.');
 const p=edited(plan);validTerm(p,termId).note=note.trim();return finish(p);
}
export function removeManualSemester(plan,termId){
 const term=validTerm(plan,termId);if(!term||['prior','pending'].includes(termId))throw Error('Choose a regular or summer semester.');
 if(term.courses.length)throw Error('Move or remove its courses before removing this semester.');
 const p=edited(plan);p.terms=p.terms.filter(t=>t.id!==termId);p.manualEdits.removedTermIds=[...new Set([...(p.manualEdits.removedTermIds||[]),termId])];return finish(p);
}
export function addManualSemester(plan,{season,year}){
 if(!['Fall','Spring','Summer'].includes(season)||!Number.isInteger(year)||year<2000||year>2099)throw Error('Choose a valid semester.');
 const id=season+'-'+year;if(validTerm(plan,id))throw Error('This semester is already in your map.');
 if(plan.terms.length>=100)throw Error('Your plan has reached 100 semesters. Remove an empty semester first.');
 const p=edited(plan);p.manualEdits.removedTermIds=(p.manualEdits.removedTermIds||[]).filter(t=>t!==id);
 p.terms.push({id,season,year,courses:[],exchange:false,lc:false});
 p.terms.sort((a,b)=>a.id==='prior'?-1:b.id==='prior'?1:a.id==='pending'?1:b.id==='pending'?-1:termOrder(a)-termOrder(b));
 return finish(p);
}
// Preserve deliberate personal edits when a remaining AI prompt or a degree/load
// change creates a preview. The preview remains separate until the student saves.
export function retainManualEdits(candidate,previous){
 if(!previous?.manualEdits)return candidate;
 const p=structuredClone(candidate),same=p.profile.program===previous.profile.program,old=previous.manualEdits;
 p.manualEdits=structuredClone({...old,removedIds:same?old.removedIds:[],placements:{}});
 if(same)p.courses=p.courses.filter(c=>!old.removedIds.includes(c.id));
 for(const c of previous.courses.filter(c=>c.manualAddition||same&&c.manualOverride)){
  const index=p.courses.findIndex(x=>x.id===c.id);if(index<0)p.courses.push(structuredClone(c));else p.courses[index]=structuredClone(c);
 }
 if(!same)for(const c of previous.courses.filter(c=>['completed','in-progress','retake'].includes(previous.tracking?.[c.id]?.status))){let match=p.courses.find(x=>c.code&&x.code===c.code);if(!match){const id=p.courses.some(x=>x.id===c.id)?'manual-'+crypto.randomUUID():c.id;match={...structuredClone(c),id,manualAddition:true};p.courses.push(match);const term=previous.terms.find(t=>t.courses.includes(c.id));if(term){const destination=p.terms.find(t=>t.id===term.id);if(destination)destination.courses.push(id);else p.terms.push({...structuredClone(term),courses:[id]});}p.tracking[id]=structuredClone(previous.tracking[c.id]);}else p.tracking[match.id]=structuredClone(previous.tracking[c.id]);}
 const ids=new Set(p.courses.map(c=>c.id));for(const t of p.terms)t.courses=t.courses.filter(id=>ids.has(id));
 const termNeeded=new Set(Object.values(old.placements||{}));
 for(const t of previous.terms){const next=p.terms.find(x=>x.id===t.id);if(next){if(t.note)next.note=t.note;}else if(t.note||termNeeded.has(t.id)||!t.courses.length)p.terms.push({...structuredClone(t),courses:[]});}
 p.terms.sort((a,b)=>a.id==='prior'?-1:b.id==='prior'?1:a.id==='pending'?1:b.id==='pending'?-1:(a.year*3+['Spring','Summer','Fall'].indexOf(a.season))-(b.year*3+['Spring','Summer','Fall'].indexOf(b.season)));
 for(const [id,term]of Object.entries(old.placements||{}))if(ids.has(id)&&p.terms.some(t=>t.id===term)){
  for(const t of p.terms)t.courses=t.courses.filter(x=>x!==id);p.terms.find(t=>t.id===term).courses.push(id);p.manualEdits.placements[id]=term;
 }
 for(const c of p.courses){const before=previous.courses.find(x=>x.id===c.id&&x.code===c.code);if(before&&previous.tracking?.[c.id])p.tracking[c.id]=structuredClone(previous.tracking[c.id]);if(!p.terms.some(t=>t.courses.includes(c.id))){let pending=p.terms.find(t=>t.id==='pending');if(!pending){pending={id:'pending',season:'Pending',year:0,courses:[],lc:false,exchange:false};p.terms.push(pending);}pending.courses.push(c.id);}}
 const retired=new Set(old.removedTermIds||[]),displaced=p.terms.filter(t=>retired.has(t.id)).flatMap(t=>t.courses);p.terms=p.terms.filter(t=>!retired.has(t.id));if(displaced.length){let pending=p.terms.find(t=>t.id==='pending');if(!pending){pending={id:'pending',season:'Pending',year:0,courses:[],lc:false,exchange:false};p.terms.push(pending);}pending.courses.push(...displaced);for(const id of displaced)p.manualEdits.placements[id]='pending';}
 p.tracking=Object.fromEntries(Object.entries(p.tracking).filter(([id])=>ids.has(id)));p.reports=(p.reports||[]).filter(r=>ids.has(r.courseId));
 if(p.academicRecord)p.academicRecord=p.academicRecord.map(r=>ids.has(r.requirementId)?r:{...r,requirementId:'',countsTowardDegree:false,review:true});
 return p;
}
