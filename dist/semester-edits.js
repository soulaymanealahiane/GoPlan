import {normalizeProfile,label,limits} from './planner.js';

// Sequence receipts are local state, never model-authored course lists.
export function sequenceKey(raw){const p=normalizeProfile(raw);return JSON.stringify(['program','track','secondTrack','minor','choices','regularCourses','summerCourses','summers','startYear','lc','priorCodes','exchange'].map(k=>p[k]));}
export function semesterUpdate(before,after,assessment,change){
 const changes=[],limitations=[];
 if(before.profile.startYear!==after.profile.startYear)changes.push(`Set the degree start to Fall ${after.profile.startYear}.`);
 if(before.profile.lc!==after.profile.lc)changes.push(after.profile.lc?`Reserved ${after.profile.lc} Language Center semester${after.profile.lc===1?'':'s'} before degree study.`:'Removed the Language Center buffer.');
 for(const id of change.clearChoices||[]){const old=before.courses.find(c=>c.id===id),next=after.courses.find(c=>c.id===id);if(old?.code&&!next?.code)changes.push(`Left the existing ${old.category.toLowerCase()} slot open instead of ${old.code}.`);}
 for(const r of assessment.replacements)changes.push(r.from?`Replaced ${r.from} with ${r.to} in the same ${r.requirement.toLowerCase()} slot.`:`Filled the existing ${r.requirement.toLowerCase()} slot with ${r.to}.`);
 if(before.profile.regularCourses!==after.profile.regularCourses||before.profile.summerCourses!==after.profile.summerCourses||before.profile.summers!==after.profile.summers)changes.push(`Set regular semesters to up to ${after.profile.regularCourses} courses; ${after.profile.summers?'summers to up to '+after.profile.summerCourses:'summer classroom study is off'}.`);
 for(const x of change.termLoads||[]){const old=before.scheduling?.termLoads?.find(t=>t.termId===x.termId);if((old?.courseCount??-1)!==x.courseCount)changes.push(x.courseCount===-1?`Restored the usual workload in ${x.termId.replace('-',' ')}.`:`Set ${x.termId.replace('-',' ')} to up to ${x.courseCount} courses.`);}
 const explicit=assessment.moves.filter(m=>(change.moves||[]).some(x=>x.requirementId===m.id&&x.termId===m.toTermId));
 for(const m of explicit.slice(0,2))changes.push(`Moved ${m.course} to ${m.to}.`);
 const ripple=assessment.moves.length-explicit.length;
 if(ripple)changes.push(`Resequenced ${ripple} other course${ripple===1?'':'s'} around the updated prerequisites and workload.`);
 const heavier=after.profile.regularCourses===6||after.profile.summers&&after.profile.summerCourses===3||after.scheduling?.termLoads?.some(x=>x.courseCount===(x.termId.startsWith('Summer')?3:6));
 if(heavier&&after.profile.gpa==='')limitations.push('The heavier load is a conditional draft: confirm CGPA ≥3.0, good standing or applicable permission before registration.');
 const shortfalls=after.terms.filter(t=>!['prior','pending'].includes(t.id)&&!t.lc&&!t.internshipOnly&&t.courses.filter(id=>after.courses.find(c=>c.id===id)?.loadCredits>0).length<(after.scheduling?.termLoads?.find(x=>x.termId===t.id)?.courseCount??limits(after.profile,t.season==='Summer').count));
 if(shortfalls.length&&(change.regularCourses!==before.profile.regularCourses||change.termLoads?.length))limitations.push('Some semesters have fewer courses because of sequence constraints, credit limits or the remaining degree requirements; no extra courses were added.');
 if(assessment.delayed)limitations.push(`Graduation moves from ${assessment.before} to ${assessment.after}.`);
 if(!changes.length)limitations.push('The requested settings already match this plan, or no supported course or placement change was supplied.');
 return {summary:changes.length?changes.slice(0,2).join(' '):'Your semester sequence is unchanged.',changes:changes.slice(0,6),limitations:limitations.slice(0,4)};
}
