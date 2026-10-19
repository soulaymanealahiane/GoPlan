import {DATA,coursesFor,programFor,termOrder,label} from './planner.js';
import {courseOptions} from './course-options.js';
import {businessRule} from './program-rules.js';
import {sheetRule} from './program-sheet-policy.js';

const failed=(plan,c)=>plan.tracking?.[c.id]?.status==='retake'||['F','W','I','NP'].includes(plan.tracking?.[c.id]?.grade);
const where=(plan,id)=>plan.terms.find(t=>t.courses.includes(id));
const name=c=>c.code||c.title;

// Resolve the same applicable sheet and school rules used by the degree planner,
// including a course selected from outside the original AI recommendation.
export function manualRule(profile,course,resolved){
 const canonical=(resolved||coursesFor(profile)).find(c=>c.code&&c.code===course.code);
 if(canonical)return canonical.rule;
 const program=programFor(profile),override=program.trackOverrides?.[profile.track]?.[course.code]||program.overrides?.[course.code];
 const school=businessRule(profile.program,course.code);
 if(school||override?.source)return sheetRule(school||override);
 return {all:[],any:[],coreq:[],minCredits:0,...DATA.courses[course.code]?.rule,...course.rule};
}

// A few catalogue descriptions contain course-code expressions that were not
// translated by the data importer. Preserve AND/OR grouping instead of treating
// every mentioned course as compulsory. Non-course permissions are not inferred.
function cataloguePaths(course,rule){
 if(rule.all?.length||rule.any?.length||rule.coreq?.length||rule.review===false)return null;
 let raw=DATA.courses[course.code]?.prerequisiteText||'';
 raw=raw.split(/\b(?:corequisites?|recommended)\s*:/i)[0].replace(/([A-Z]{3})\s+(\d{4})/g,'$1$2');
 if(!/\b[A-Z]{3}\d{4}\b/.test(raw))return null;
 // Parenthetical school labels contain no course expression.
 raw=raw.replace(/\([^()]*\)/g,s=>/[A-Z]{3}\d{4}/.test(s)?s:'');
 const tokens=raw.match(/[A-Z]{3}\d{4}|\bor\b|\band\b|[&(),;]/gi)||[];
 let at=0;
 const factor=()=>{if(tokens[at]==='('){at++;const value=expr();if(tokens[at]===')')at++;return value;}const code=tokens[at++];return /^[A-Z]{3}\d{4}$/.test(code||'')?[[code]]:[];};
 const both=(a,b)=>a.length&&b.length?a.flatMap(x=>b.map(y=>[...new Set([...x,...y])])).slice(0,64):a.length?a:b;
 const sequence=()=>{let value=factor();while(at<tokens.length&&tokens[at]!==')'&&!/^or$/i.test(tokens[at])){if(/^(?:and|[&,;])$/i.test(tokens[at]))at++;if(tokens[at]===')'||/^or$/i.test(tokens[at]||'')||at>=tokens.length)break;value=both(value,factor());}return value;};
 const expr=()=>{let value=sequence();while(/^or$/i.test(tokens[at]||'')){at++;value.push(...sequence());}return value;};
 return expr().filter(x=>x.length);
}

export function manualPrerequisiteIssues(plan){
 const issues=[],represented=new Set(plan.courses.map(c=>c.code).filter(Boolean)),resolved=coursesFor(plan.profile);
 for(const course of plan.courses){
  const term=where(plan,course.id);if(!term||['prior','pending'].includes(term.id))continue;
  const rule=manualRule(plan.profile,course,resolved),canonical=resolved.find(c=>c.code&&c.code===course.code),fromSheet=/program.sheet|course.sequence/i.test(canonical?.ruleSource?.file||''),catalogue=!fromSheet&&rule.review!==false,raw=DATA.courses[course.code]?.prerequisiteText||'',done=new Set((plan.profile.priorCodes||[]).filter(code=>!represented.has(code))),creditCodes=new Set(done);
  let credits=[...done].reduce((n,code)=>n+(DATA.courses[code]?.credits||0),0);
  for(const previous of plan.courses){
   if(previous.id===course.id||failed(plan,previous))continue;
   const before=where(plan,previous.id);if(!before||before.id==='pending'||before.id!=='prior'&&termOrder(before)>=termOrder(term))continue;
   if(previous.code){if(!creditCodes.has(previous.code)){credits+=previous.credits||0;creditCodes.add(previous.code);}done.add(previous.code);}else credits+=previous.credits||0;
  }
  const add=(key,text)=>issues.push({id:course.id,key,text,termId:term.id,course});
  const missing=(rule.all||[]).filter(code=>!done.has(code));
  if(missing.length)add('all:'+missing.join(','),'Before adding '+name(course)+' to '+label(term)+', place '+missing.join(' and ')+' in an earlier semester.');
  if(rule.any?.length&&!rule.any.some(code=>done.has(code)))add('any:'+rule.any.join(','),name(course)+' needs one of '+rule.any.join(' / ')+' in an earlier semester.');
  const paths=catalogue?cataloguePaths(course,rule):null;
  if(paths?.length&&!paths.some(path=>path.every(code=>done.has(code))))add('paths:'+JSON.stringify(paths),name(course)+' needs '+paths.map(path=>path.join(' + ')).join(' or ')+' in an earlier semester.');
  const same=plan.courses.filter(c=>term.courses.includes(c.id)&&c.id!==course.id&&!failed(plan,c)).map(c=>c.code);
  const extractedCoreq=catalogue?(raw.match(/\bCorequisites?:\s*([^.;]*)/i)?.[1].match(/[A-Z]{3}\s*\d{4}/g)||[]).map(code=>code.replace(/\s/g,'')):[];
  const coreq=[...new Set([...(rule.coreq||[]),...extractedCoreq])].filter(code=>!done.has(code)&&!same.includes(code));
  if(coreq.length)add('coreq:'+coreq.join(','),name(course)+' needs '+coreq.join(' and ')+' in this semester or an earlier one.');
  const minCredits=rule.minCredits||(catalogue&&/\bJunior classification\b/i.test(raw)?60:catalogue&&/\bSenior classification\b/i.test(raw)?90:0);
  if(credits<minCredits)add('credits',name(course)+' needs '+minCredits+' earlier credits. Your plan has '+credits+' before '+label(term)+'.');
  if(rule.minProgramCourses&&(rule.programCourseCodes||[]).filter(code=>done.has(code)).length<rule.minProgramCourses)add('program',name(course)+' needs '+rule.minProgramCourses+' program courses in earlier semesters.');
 }
 return issues;
}

export function checkManualPlacement(before,after,changedId){
 const previous=manualPrerequisiteIssues(before),next=manualPrerequisiteIssues(after);
 const target=next.find(issue=>issue.id===changedId);
 if(target)throw Error(target.text+' Your plan has not changed.');
 const newIssue=next.find(issue=>!previous.some(old=>old.id===issue.id&&old.key===issue.key));
 if(newIssue)throw Error('This would leave '+name(newIssue.course)+' without its prerequisites in '+label(where(after,newIssue.id))+'. Keep its prerequisites earlier, or move that course first. Your plan has not changed.');
}

// Allocate each real course to at most one degree slot. A maximum matching
// prevents a broad elective from stealing a course needed by a fixed requirement.
export function degreeBalance(plan){
 const requirements=coursesFor(plan.profile),candidates=plan.courses,eligible=requirements.map(r=>{
  const options=r.choice?new Set(courseOptions(r,plan.profile).filter(c=>!c.topic).map(c=>c.code)):new Set();
  return candidates.map((c,index)=>({c,index})).filter(({c,index})=>{
   if(c.code&&!c.repeatable&&candidates.findIndex(x=>x.code===c.code)!==index)return false;
   return c.code?(r.code===c.code||options.has(c.code)):(c.manualRequirementId||c.id)===r.id&&!c.manualOverride;
  }).map(({index})=>index);
 });
 const assigned=new Map(),matched=new Map();
 function fit(index,seen){for(const candidate of eligible[index]){if(seen.has(candidate))continue;seen.add(candidate);const old=assigned.get(candidate);if(old===undefined||fit(old,seen)){assigned.set(candidate,index);matched.set(index,candidate);return true;}}return false;}
 for(const index of requirements.map((_,i)=>i).sort((a,b)=>eligible[a].length-eligible[b].length))fit(index,new Set());
 const missing=requirements.filter((_,i)=>!matched.has(i)),extra=candidates.filter((_,i)=>!assigned.has(i));
 const requiredCredits=requirements.reduce((n,c)=>n+c.credits,0),plannedCredits=candidates.reduce((n,c)=>n+c.credits,0);
 return {missing,extra,requiredCredits,plannedCredits,netCredits:plannedCredits-requiredCredits,prerequisites:manualPrerequisiteIssues(plan)};
}

export function manualChangeMessage(before,after,{id,courseCode,termId,anotherAttempt=false}={}){
 const course=after.courses.find(c=>id?c.id===id:c.code===courseCode||courseCode==='slot:'+(c.manualRequirementId||c.id)),previous=before.courses.find(c=>c.id===course?.id),from=previous&&where(before,previous.id),to=course&&where(after,course.id);
 const merged=before.courses.find(c=>c.id!==id&&c.code&&c.code===courseCode&&!after.courses.some(x=>x.id===c.id));
 const source=merged?where(before,merged.id):from;
 if(!anotherAttempt&&source&&to&&source.id!==to.id)return name(course)+' moved to '+label(to)+'. Removed from '+label(source)+' so it appears only once.';
 return previous?'Course updated.':anotherAttempt?'New attempt added.':'Course added.';
}
