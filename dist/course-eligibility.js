import {coursesFor,normalizeProfile,programFor} from './planner.js';
import {courseOptions} from './course-options.js';
import {cataloguePaths,manualRule} from './manual-checks.js';

// Availability in the catalogue is not evidence that a student has the required
// foundations. Check exact codes and complete chains within this actual degree,
// its selected electives/minor and recorded prior study. Never infer equivalency.
export function prerequisiteCoverage(courses,priorCodes=[]){
 const prior=new Set(priorCodes),rows=courses.filter(c=>c.code),paths=new Map(rows.map(c=>[c.id,cataloguePaths(c,c.rule||{})]));
 let active=new Set([...prior,...rows.map(c=>c.code)]),done;
 do{
  const before=active;done=new Set(prior);
  let changed=true;
  while(changed){changed=false;for(const c of rows){
   if(done.has(c.code)||!before.has(c.code))continue;
   const r=c.rule||{},alternatives=paths.get(c.id);
   if((r.all||[]).every(code=>done.has(code))&&(!(r.any||[]).length||r.any.some(code=>done.has(code)))&&
      (!alternatives?.length||alternatives.some(path=>path.every(code=>done.has(code))))&&
      (r.coreq||[]).every(code=>before.has(code))){done.add(c.code);changed=true;}
  }}
  active=done;
  if(active.size===before.size)break;
 }while(true);
 const issues=rows.filter(c=>!done.has(c.code)).map(c=>{
  const r=c.rule||{},alternatives=paths.get(c.id),missing=[...(r.all||[]),...(r.coreq||[])].filter(code=>!done.has(code));
  const any=(r.any||[]).length&&!r.any.some(code=>done.has(code))?r.any:[];
  const missingPaths=alternatives?.length&&!alternatives.some(path=>path.every(code=>done.has(code)))?alternatives.map(path=>path.filter(code=>!done.has(code))):[];
  return {id:c.id,courseCode:c.code,missing:[...new Set(missing)],any,paths:missingPaths,message:c.code+' has unmet prerequisites: '+[...new Set(missing),...(any.length?['one of '+any.join(' / ')]:[]),...(missingPaths.length?[missingPaths.map(path=>path.join(' + ')).join(' or ')]:[])].join(' and ')+'. Include them in the degree plan or recorded prior study. No prerequisite equivalency is assumed.'};
 });
 return {covered:done,issues};
}

export function selectionEligibility(raw){
 const profile=normalizeProfile(raw),courses=coursesFor(profile),program=programFor(profile);
 return {profile,courses,program,coverage:prerequisiteCoverage(courses,profile.priorCodes)};
}

export function eligibleCourseOptions(requirement,raw,context=selectionEligibility(raw)){
 const {profile,courses,program}=context;
 return courseOptions(requirement,profile).filter(option=>{
  if(option.topic||option.creditsProvisional)return false;
  const source=program.trackOverrides?.[requirement.secondTrack||profile.track]?.[option.code]||program.overrides?.[option.code];
  let rule=manualRule(profile,option,courses);
  if(!source?.source&&requirement.conditionalRules?.[option.code])rule={...rule,...requirement.conditionalRules[option.code]};
  // An already-resolved selected row carries the exact applicable sheet rule.
  const candidate={...option,id:requirement.id,rule:requirement.code===option.code?requirement.rule:rule};
  const rows=courses.map(c=>c.id===requirement.id?candidate:c);
  return prerequisiteCoverage(rows,profile.priorCodes).covered.has(option.code);
 });
}

// Only a new recommendation/revision may clear an invalid unprotected choice.
// Reading or saving a personal plan never silently rewrites existing study.
export function releaseIneligibleChoices(raw,{protectedIds=[]}={}){
 const profile=normalizeProfile(raw),protectedSet=new Set(protectedIds),removed=[];
 const {courses,coverage}=selectionEligibility(profile);
 for(const issue of coverage.issues){const row=courses.find(c=>c.id===issue.id);
  if(row?.choice&&profile.choices[row.id]&&!protectedSet.has(row.id)&&!profile.priorCodes.includes(row.code)){
   removed.push(issue);delete profile.choices[row.id];
  }
 }
 return {profile,removed};
}
