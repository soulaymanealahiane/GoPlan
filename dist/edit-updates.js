import {normalizeProfile,programFor} from './planner.js';
import {selectedMinor} from './minors.js';

export function academicChanges(before,after){
 const a=normalizeProfile(before),b=normalizeProfile(after),changes=[],focus=(p,id)=>programFor(p).tracks.find(t=>t.id===id)?.name||id;
 if(a.program!==b.program)changes.push(`Changed degree to ${programFor(b).name}.`);
 if(a.track!==b.track)changes.push(b.track?`Set the primary focus to ${focus(b,b.track)}.`:'Removed the optional primary focus.');
 if(a.secondTrack!==b.secondTrack)changes.push(b.secondTrack?`Added ${focus(b,b.secondTrack)} as the second focus.`:'Removed the second focus.');
 if(a.minor!==b.minor)changes.push(b.minor?`Set the minor to ${selectedMinor(b)?.name||b.minor}.`:'Removed the optional minor.');
 return changes;
}
export function targetChanges(before={},after={}){
 const changes=[];
 for(const type of ['internships','exchanges']){
  const old=before[type]||[],next=after[type]||[],added=next.filter(t=>!old.some(x=>x.id===t.id)),removed=old.filter(t=>!next.some(x=>x.id===t.id)),name=type==='internships'?'company':'exchange';
  if(added.length||removed.length)changes.push(`Updated ${name} matches${added.length?': '+added.map(t=>t.name).join(', '):''}.`);
  else if(JSON.stringify(old.map(t=>[t.id,t.tier]))!==JSON.stringify(next.map(t=>[t.id,t.tier])))changes.push(`Reordered ${name} recommendations and their search tiers.`);
 }
 return changes;
}
export function roadmapUpdate(before,after,sectionUpdates=[]){
 const academic=academicChanges(before.profile,after.profile),courses=after.courses.filter(c=>before.courses.find(x=>x.id===c.id)?.code!==c.code),targets=targetChanges(before.targets,after.targets),sequence=JSON.stringify(before.terms.map(t=>[t.id,t.courses]))!==JSON.stringify(after.terms.map(t=>[t.id,t.courses])),loads=['regularCourses','summerCourses','summers'].some(k=>before.profile[k]!==after.profile[k]),changes=[...academic];
 if(courses.length)changes.push(`Updated ${courses.length} course assignments within the degree requirements.`);
 changes.push(...targets);if(loads)changes.push(`Set regular semesters to up to ${after.profile.regularCourses} courses${after.profile.summers?'; summers to up to '+after.profile.summerCourses: '; summer classroom study off'}.`);
 if(sequence)changes.push('Rebuilt the future semester sequence around the updated choices and prerequisites.');
 const limitations=[...new Set(sectionUpdates.flatMap(x=>x?.limitations||[]))];
 if(after.revisionAssessment?.delayed)limitations.unshift(`Graduation moves from ${after.revisionAssessment.before} to ${after.revisionAssessment.after}.`);
 if(after.revisionAssessment?.unmatchedRecords)limitations.unshift('Past study is retained; courses outside the new degree need an adviser’s credit review.');
 const parts=[academic.length?'academic direction':'',courses.length?'course choices':'',targets.length?'opportunities':'',loads?'workload':'',sequence?'semester sequence':''].filter(Boolean);
 return {summary:parts.length?'Updated your '+parts.join(', ')+'.':'Your roadmap is unchanged.',changes:changes.slice(0,6),limitations:limitations.slice(0,4)};
}
