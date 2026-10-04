import {coursesFor,normalizeProfile} from './planner.js';
import {selectedMinor} from './minors.js';

// Include fixed requirements and unresolved slots, not only selectable electives.
// Supporting prerequisites never count as minor credits.
export function minorSummary(raw){
 const profile=normalizeProfile(raw),minor=selectedMinor(profile);if(!minor)return null;
 const rows=coursesFor(profile).filter(c=>c.minorId===minor.id).map(c=>({id:c.id,code:c.code,title:c.title,credits:c.credits,selected:!!c.code&&!c.unresolved,approvalRequired:!!(c.approvalOnly||c.approvalRequired),reason:c.condition||(!c.code?'A distinct eligible course still needs to be selected.':c.unresolved?'The course credits need confirmation.':''),choice:c.choice}));
 const selected=rows.filter(c=>c.selected),selectedCredits=selected.reduce((n,c)=>n+c.credits,0),listedCredits=rows.reduce((n,c)=>n+c.credits,0),creditMismatch=listedCredits<minor.credits.min||listedCredits>minor.credits.max;
 const reviewNote=creditMismatch?`The listed requirements total ${listedCredits} credits, while the published minor total is ${minor.credits.min}${minor.credits.max!==minor.credits.min?'–'+minor.credits.max:''}. Your school needs to confirm the final requirement; all listed slots remain in the plan.`:'';
 return {id:minor.id,name:minor.name,requiredCourses:rows.length,requiredCredits:minor.credits.min,listedCredits,reviewNote,allSelected:selected.length===rows.length,maximumCredits:minor.credits.max,selectedCourses:selected.length,selectedCredits,complete:!creditMismatch&&selected.length===rows.length&&selectedCredits>=minor.credits.min&&selectedCredits<=minor.credits.max,approvalRequired:!!minor.reviewRequired,rows};
}
