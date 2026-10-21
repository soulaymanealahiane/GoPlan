import {normalizeProfile,coursesFor,generatePlan,validatePlan} from './planner.js';
import {courseOptions,needsPersonalConfirmation} from './course-options.js';
import {prerequisiteCoverage} from './course-eligibility.js';
import {minorSummary} from './minor-summary.js';

// Validate the concrete course selection that establishes a recommendation.
// The same check runs on the server and again before applying the draft.
export function checkedMinorPlan(raw,recipe,{protectedCodes=[]}={}){
 if(!recipe||['program','track','secondTrack','minor'].some(k=>(raw[k]||'')!==(recipe.academic?.[k]||''))||!recipe.choices||typeof recipe.choices!=='object'||Array.isArray(recipe.choices))throw Error('This minor recommendation belongs to a different academic combination.');
 const profile=normalizeProfile({...raw,choices:recipe.choices}),courses=coursesFor(profile),known=new Map(courses.map(c=>[c.id,c]));
 for(const [id,code]of Object.entries(recipe.choices)){
  const c=known.get(id);if(!c?.choice||typeof code!=='string'||!courseOptions(c,profile).some(o=>o.code===code&&!o.topic&&!o.creditsProvisional))throw Error('A recommended assignment is not supported by its degree slot.');
  if((c.approvalOnly||needsPersonalConfirmation(c))&&raw.choices?.[id]!==code)throw Error('A recommended assignment needs personal placement or school approval.');
 }
 for(const c of coursesFor(raw))if(c.code&&protectedCodes.includes(c.code)&&!courses.some(next=>next.code===c.code))throw Error('A recommendation cannot remove completed or current study.');
 const summary=minorSummary(profile),rows=courses.filter(c=>c.minorId===profile.minor),coverage=prerequisiteCoverage(courses,profile.priorCodes),issues=coverage.issues.filter(i=>rows.some(c=>c.id===i.id));
 if(!summary?.complete||summary.approvalRequired||rows.some(c=>c.approvalOnly||c.approvalRequired))throw Error('The full minor needs an unresolved course, credit or school-approval decision.');
 if(issues.length)throw Error(issues.map(i=>i.message).join(' '));
 const terms=generatePlan(profile),pending=new Set(terms.find(t=>t.id==='pending')?.courses||[]),conflicts=validatePlan(terms,courses,profile).filter(i=>i.level==='conflict'&&(rows.some(c=>c.id===i.id)||/counted twice|cannot both count/.test(i.text)));
 if(rows.some(c=>pending.has(c.id))||conflicts.length)throw Error('The selected minor courses cannot form a valid sequence within the degree.');
 return {profile,summary,courses,terms};
}
