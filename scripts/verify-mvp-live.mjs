// Synthetic MVP evaluation. No provider calls unless --live is passed.
// node scripts/verify-mvp-live.mjs                       (fixture checks only)
// node scripts/verify-mvp-live.mjs --stress              (all coded courses)
// node --env-file=.env scripts/verify-mvp-live.mjs --live
// Add --courses-only or --targets-only to limit paid calls.
// This report contains synthetic course cases and public opportunity URLs only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {advise,availableTargets} from '../server/advisor.mjs';
import {normalizeProfile,coursesFor,termOrder,validatePlan} from '../dist/planner.js';
import {newJourney,makePlan,allowedChoices,emptyWorkspace,validateSavedWorkspace} from '../dist/guidance.js';
import {proposeReplan,replanSnapshot,restoreSnapshot} from '../dist/replanning.js';
import {publicUrl} from '../server/research.mjs';
import {courseAvailability} from '../dist/course-availability.js';

const live=process.argv.includes('--live');
const coursesOnly=process.argv.includes('--courses-only');
const targetsOnly=process.argv.includes('--targets-only');
assert.ok(!(coursesOnly&&targetsOnly),'Choose one evaluation subset.');
if(live&&!process.env.GROQ_API_KEY)throw Error('A server Groq key is required for --live.');
const report={synthetic:true,live,generatedAt:new Date().toISOString(),cases:[],providerUsage:[]};
fs.mkdirSync('.sites-runtime',{recursive:true});
const save=()=>fs.writeFileSync('.sites-runtime/mvp-live-report.json',JSON.stringify(report,null,2));
let activeCase='fixture';
const trackedFetch=async(url,init)=>{
 assert.equal(new URL(url).origin,'https://api.groq.com','Only the configured inference provider is permitted.');
 const start=performance.now();
 const response=await fetch(url,init);
 let payload;try{payload=await response.clone().json();}catch{}
 const body=JSON.parse(init.body);
 report.providerUsage.push({case:activeCase,phase:body.tools?'web-search':body.response_format?.json_schema?.name||'completion',httpStatus:response.status,latencyMs:Math.round(performance.now()-start),model:payload?.model||body.model,inputTokens:payload?.usage?.input_tokens??payload?.usage?.prompt_tokens??null,outputTokens:payload?.usage?.output_tokens??payload?.usage?.completion_tokens??null,executedTools:payload?.choices?.[0]?.message?.executed_tools?.length||0});
 save();return response;
};

// These are catalogue fixtures, not invented student records. Foundation and
// language qualification are stipulated so the test exercises scheduling.
function fixture(program){
 const j=newJourney();
 j.profile=normalizeProfile(program==='BSCSC'
  ?{program,track:'SE',minor:'business-administration',priorCodes:['FRN3210'],choices:{'bscsc-free-1':'MTH2304','bscsc-free-2':'CSC3331','bscsc-computing':'CSC3308'}}
  :{program,track:'FIN',secondTrack:'MKT',priorCodes:['MTH1304','FRN3210'],choices:{'bba-free-1':'MTH1304','bba-free-2':'CSC1401','bba-free-3':'GEO1301'}});
 for(let pass=0;pass<2;pass++){
  const courses=coursesFor(j.profile),used=new Set(courses.filter(c=>c.code).map(c=>c.code));
  for(const c of courses){
   if(!c.choice||c.code||c.replacementFor||c.approvalOnly||!c.options?.length)continue;
   const option=allowedChoices(c,j.profile).find(o=>!o.topic&&!o.creditsProvisional&&!used.has(o.code)&&o.credits===c.credits);
   if(option){j.profile.choices[c.id]=option.code;used.add(option.code);}
  }
 }
 j.programChosen=true;j.preferredDegree=program;
 j.background='Synthetic fixture: admitted university student reviewing a degree plan.';
 j.questionnaire=program==='BSCSC'
  ?{ambitions:'Build secure payments and logistics software for Moroccan merchants.',activities:'Program software, investigate data and test prototypes.',strengths:'Mathematics, programming and practical problem solving.',industries:'Financial technology and logistics software.',priorities:'Useful skills and a degree plan that respects prerequisites.',entrepreneurship:'Work in a small engineering team before building a product.',automation:'Build reliable AI tools with human review.',constraints:'Keep five regular courses and two summer courses.'}
  :{ambitions:'Develop a Moroccan logistics business with sound finance and marketing.',activities:'Analyze costs, understand customers and improve business operations.',strengths:'Business analysis, communication and organizing projects.',industries:'Logistics, retail and financial services.',priorities:'Practical business exposure and an academically sound degree.',entrepreneurship:'Learn from startups and growing local businesses.',automation:'Use analytics to improve business decisions.',constraints:'Keep five regular courses and two summer courses.'};
 const plan=makePlan(j),regular=plan.terms.filter(t=>['Fall','Spring'].includes(t.season));
 for(const id of regular[0].courses)if(plan.courses.find(c=>c.id===id)?.code)plan.tracking[id]={status:'completed'};
 const currentCourse=regular[1].courses.find(id=>plan.courses.find(c=>c.id===id)?.code);
 plan.tracking[currentCourse]={status:'in-progress'};
 return {j,plan,currentTerm:regular[1].id};
}

function checkProtected(before,after){
 for(const [id,state] of Object.entries(before.tracking))if(['completed','in-progress'].includes(state.status)){
  assert.equal(after.courses.find(c=>c.id===id)?.code,before.courses.find(c=>c.id===id)?.code,'Protected course code changed.');
  assert.equal(after.terms.find(t=>t.courses.includes(id))?.id,before.terms.find(t=>t.courses.includes(id))?.id,'Protected semester changed.');
  assert.deepEqual(after.tracking[id],state,'Protected progress changed.');
 }
 assert.equal(after.profile.program,before.profile.program,'The degree changed.');
 for(const key of ['track','secondTrack','minor','regularCourses','summerCourses','summers'])assert.deepEqual(after.profile[key],before.profile[key],key+' changed without a request.');
}
function checkCandidate(before,candidate){
 checkProtected(before,candidate);
 assert.deepEqual(candidate.terms.flatMap(t=>t.courses).sort(),candidate.courses.map(c=>c.id).sort(),'Requirements were lost or repeated.');
 const prior=validatePlan(before.terms,before.courses,before.profile).filter(i=>i.level==='conflict');
 const introduced=validatePlan(candidate.terms,candidate.courses,candidate.profile).filter(i=>i.level==='conflict'&&!prior.some(p=>p.id===i.id&&p.text===i.text));
 assert.equal(introduced.length,0,'New prerequisite, load or sequence conflicts were introduced.');
 for(const entry of candidate.scheduling?.unavailable||[])assert.ok(!candidate.terms.find(t=>t.id===entry.termId)?.courses.some(id=>candidate.courses.find(c=>c.id===id)?.code===entry.courseCode),'A reported unavailable course was scheduled.');
 for(const t of candidate.terms)for(const id of t.courses){const c=candidate.courses.find(c=>c.id===id);if(c?.code)assert.ok(courseAvailability(c.code,t.id,candidate.scheduling).allowed,'A course absent from a complete offering list was scheduled.');}
 const snapshot=replanSnapshot(candidate),restored=restoreSnapshot(snapshot);
 assert.deepEqual(restored.terms.map(({id,courses})=>({id,courses})),candidate.terms.map(({id,courses})=>({id,courses})),'Snapshot semester replay changed.');
 assert.deepEqual(restored.scheduling,candidate.scheduling,'Snapshot lost course offerings.');
 const workspace=validateSavedWorkspace({...emptyWorkspace(),phase:'saved',plan:structuredClone(candidate),journey:newJourney(candidate)});
 assert.deepEqual(workspace.plan.scheduling,candidate.scheduling,'Saved workspace lost course offerings.');
}
async function runCase(name,body){
 activeCase=name;const start=performance.now();
 try{const detail=await body();report.cases.push({name,passed:true,latencyMs:Math.round(performance.now()-start),...detail});}
 catch(error){report.cases.push({name,passed:false,latencyMs:Math.round(performance.now()-start),failureType:error.name==='AssertionError'?'assertion':error.code||'service-or-contract'});save();throw error;}
 save();console.log(JSON.stringify(report.cases.at(-1)));
}
function cleanName(name){return String(name).normalize('NFKD').replace(/[^a-z0-9]/gi,'').toLowerCase();}
function targetMetrics(result){
 const metrics={};
 for(const type of ['internships','exchanges']){
  const items=result[type];assert.ok(Array.isArray(items)&&items.length>0,'Missing opportunity list.');
  assert.equal(new Set(items.map(t=>cleanName(t.name))).size,items.length,'Duplicate entity names.');
  if(type==='exchanges')assert.equal(new Set(items.map(t=>cleanName(t.institutionId||t.name))).size,items.length,'Duplicate exchange institutions.');
  assert.ok(items.every(t=>publicUrl(t.sourceUrl)),'A target has no safe public source URL.');
  const urls=[...new Set(items.map(t=>publicUrl(t.sourceUrl)))];
  metrics[type]={count:items.length,distinctCountries:new Set(items.map(t=>t.country)).size,distinctSourceHosts:new Set(urls.map(url=>new URL(url).hostname.replace(/^www\./,''))).size,publicSources:urls,organizations:items.map(t=>({id:t.id,name:t.name,country:t.country,organizationType:t.organizationType||null,scheme:t.scheme||null}))};
 }
 return metrics;
}

// A deterministic regression catches the final-semester post-processing edge:
// both BBA capstones must remain in the final regular term without moving a
// previously placed capstone back into a reported unavailable semester.
await runCase('BBA-capstone-bottleneck-fixture',()=>{
 const {plan,currentTerm}=fixture('BBA'),a=plan.courses.find(c=>c.code==='GBU4101'),b=plan.courses.find(c=>c.code==='MGT4301');
 const originalTerm=plan.terms.find(t=>t.courses.includes(b.id));
 const next=originalTerm.season==='Fall'?`Spring-${originalTerm.year+1}`:`Fall-${originalTerm.year}`;
 const following=originalTerm.season==='Fall'?`Fall-${originalTerm.year+1}`:`Spring-${originalTerm.year+1}`;
 const result=proposeReplan(plan,{choices:[],unavailable:[{courseCode:b.code,termId:originalTerm.id},{courseCode:b.code,termId:next},{courseCode:a.code,termId:following}]},currentTerm);
 assert.equal(result.assessment.canApply,true,'A feasible later capstone semester should be found.');checkCandidate(plan,result.candidate);
 const at=result.candidate.terms.find(t=>t.courses.includes(a.id)),bt=result.candidate.terms.find(t=>t.courses.includes(b.id));
 assert.equal(at.id,bt.id,'Capstones must stay in the final regular semester.');
 assert.ok(termOrder(at)>termOrder({season:following.split('-')[0],year:Number(following.split('-')[1])}),'The second capstone availability conflict was not resolved.');
 return {graduation:result.assessment.after,delay:result.assessment.delayed};
});

if(process.argv.includes('--stress'))await runCase('all-coded-course-cancellation-matrix',()=>{
 let cases=0;
 for(const program of ['BSCSC','BBA']){
  const {plan,currentTerm}=fixture(program),boundary=plan.terms.find(t=>t.id===currentTerm);
  for(const c of plan.courses){
   if(!c.code||['completed','in-progress'].includes(plan.tracking[c.id]?.status))continue;
   const term=plan.terms.find(t=>t.courses.includes(c.id));
   if(['prior','pending'].includes(term.id)||termOrder(term)<termOrder(boundary))continue;
   for(const mode of ['unavailable','complete-list']){
    const change=mode==='unavailable'
     ?{choices:[],unavailable:[{courseCode:c.code,termId:term.id}]}
     :{choices:[],offerings:[{termId:term.id,offeredCourseCodes:term.courses.map(id=>plan.courses.find(x=>x.id===id)?.code).filter(code=>code&&code!==c.code),unavailableCourseCodes:[],complete:true}]};
    const proposal=proposeReplan(plan,change,currentTerm);
    assert.equal(proposal.assessment.canApply,true,program+' '+c.code+' '+mode+' has a feasible later semester.');
    checkCandidate(plan,proposal.candidate);cases++;
   }
  }
 }
 return {programs:['BSCSC','BBA'],schedulingCases:cases,violations:0};
});

if(live&&!targetsOnly)for(const program of ['BSCSC','BBA']){
 await runCase(program+'-required-course-live',async()=>{
  const {j,plan,currentTerm}=fixture(program),code=program==='BSCSC'?'CSC2306':'ACC3201';
  const course=plan.courses.find(c=>c.code===code),term=plan.terms.find(t=>t.courses.includes(course.id));
  const before=JSON.stringify(plan);
  const result=await advise({...j,flowVersion:5,stage:'replan',plan:replanSnapshot(plan),currentTerm,changeRequest:`${code} is not offered in ${term.id}. Keep this compulsory requirement and postpone it to the next academically feasible semester. Move other eligible courses forward when useful, preserve completed and current study, and keep my degree choices and workload limits.`,unavailable:[{courseCode:code,termId:term.id}]},{...process.env,GROQ_WEB_RESEARCH:'off'},trackedFetch);
  assert.equal(result.kind,'propose','Expected a reviewed replan.');
  assert.ok(!result.change.choices.some(x=>x.requirementId===course.id),'A fixed required course was substituted.');
  const proposal=proposeReplan(plan,result.change,currentTerm);assert.equal(proposal.assessment.canApply,true);checkCandidate(plan,proposal.candidate);
  const relocated=proposal.candidate.terms.find(t=>t.courses.includes(course.id));assert.ok(termOrder(relocated)>termOrder(term),'Required course was not postponed.');
  assert.equal(JSON.stringify(plan),before,'An unaccepted proposal mutated the saved plan.');
  return {course:code,from:term.id,to:relocated.id,graduation:proposal.assessment.after,delay:proposal.assessment.delayed,completedPreserved:proposal.assessment.completedPreserved};
 });
 await runCase(program+'-offered-elective-live',async()=>{
  const {j,plan,currentTerm}=fixture(program),requirementId=program==='BSCSC'?'bscsc-arts':'bba-arts';
  const course=plan.courses.find(c=>c.id===requirementId),term=plan.terms.find(t=>t.courses.includes(course.id)),used=new Set(plan.courses.map(c=>c.code));
  const alternative=allowedChoices(course,plan.profile).filter(o=>!o.topic&&!o.creditsProvisional&&!used.has(o.code)&&o.credits===course.credits).find(o=>{
   try{const p=proposeReplan(plan,{choices:[{requirementId,courseCode:o.code}],unavailable:[{courseCode:course.code,termId:term.id}]},currentTerm);return p.assessment.canApply;}catch{return false;}
  });assert.ok(alternative,'The synthetic elective needs a verified schedulable alternative.');
  const result=await advise({...j,flowVersion:5,stage:'replan',plan:replanSnapshot(plan),currentTerm,changeRequest:`${course.code} is not offered in ${term.id}. The university offering list shows ${alternative.code} is offered that semester. Replace only this elective with that course if it satisfies the same requirement; keep my degree choices, progress and workload limits.`,offerings:[{termId:term.id,offeredCourseCodes:[alternative.code],unavailableCourseCodes:[course.code],complete:false}],unavailable:[{courseCode:course.code,termId:term.id}]},{...process.env,GROQ_WEB_RESEARCH:'off'},trackedFetch);
  assert.equal(result.kind,'propose');const proposal=proposeReplan(plan,result.change,currentTerm);assert.equal(proposal.assessment.canApply,true);checkCandidate(plan,proposal.candidate);
  assert.equal(proposal.candidate.courses.find(c=>c.id===requirementId).code,alternative.code,'An explicitly offered valid alternative was ignored.');
  assert.ok(proposal.candidate.scheduling.offerings.some(o=>o.termId===term.id&&o.offeredCourseCodes.includes(alternative.code)),'The offered list was not retained.');
  return {requirementId,replaced:course.code,with:alternative.code,reportedOfferingTerm:term.id,scheduledTerm:proposal.candidate.terms.find(t=>t.courses.includes(requirementId)).id,replacements:proposal.assessment.replacements.length,graduation:proposal.assessment.after};
 });
}

if(live&&!coursesOnly)for(const program of ['BSCSC','BBA']){
 const {j,plan}=fixture(program);
 const originalPlan=JSON.stringify(plan);
 const current=Object.fromEntries(['internships','exchanges'].map(type=>[type,availableTargets(type,j.profile).slice(0,5).map(t=>({id:t.id,name:t.name}))]));
 let initial;
 await runCase(program+'-startup-research-live',async()=>{
  initial=await advise({...j,flowVersion:5,stage:'targets',currentRecommendation:current,refinement:'Find relevant active Moroccan startups or scaleups beyond the current company list. Prefer practical software or business roles that fit my interests. Keep every exchange institution exactly the same.'},{...process.env,GROQ_WEB_RESEARCH:'on'},trackedFetch);
  const metrics=targetMetrics(initial);
  assert.ok(initial.internships.filter(t=>['startup','scaleup'].includes(t.organizationType)).length>=2,'Requested startup exposure was not delivered.');
  assert.deepEqual(initial.exchanges.map(t=>t.id).sort(),current.exchanges.map(t=>t.id).sort(),'Company-only feedback changed exchanges.');
  assert.ok(initial.update.added.length,'Company feedback changed no entities.');
  assert.equal(initial.research.status,'live','The paid research path did not establish usable primary evidence.');
  assert.ok(initial.research.sources?.length,'Live research has no traceable sources.');
  return {...metrics,researchStatus:initial.research.status,researchSourceCount:initial.research.sources.length,added:initial.update.added.length,removed:initial.update.removed.length};
 });
 await runCase(program+'-exchange-research-live',async()=>{
  const result=await advise({...j,flowVersion:5,stage:'targets',currentRecommendation:initial,refinement:'Explore different approved exchange institutions and compare actual academic fit, teaching language, eligibility and route costs. Include at least two different countries where evidence supports this. Keep all my current company targets exactly unchanged. If a constraint prevents a requested change, explain the specific evidence gap.'},{...process.env,GROQ_WEB_RESEARCH:'on'},trackedFetch);
  const metrics=targetMetrics(result);
  assert.deepEqual(result.internships.map(t=>t.id).sort(),initial.internships.map(t=>t.id).sort(),'Exchange-only feedback changed companies.');
  const approved=new Set(availableTargets('exchanges',j.profile).map(t=>t.id));assert.ok(result.exchanges.every(t=>approved.has(t.id)),'An unapproved exchange institution was introduced.');
  assert.ok(metrics.exchanges.distinctCountries>=2,'Exchange destinations have no country diversity.');
  const added=result.exchanges.filter(t=>!initial.exchanges.some(p=>p.id===t.id)).length;
  assert.ok(added>0||result.update.limitations.length>0,'Repeated exchanges were described as a new search without explanation.');
  assert.equal(result.research.status,'live','Exchange research did not establish usable primary evidence.');
  assert.ok(result.research.exchanges?.length,'Live exchange research did not verify any approved institution.');
  assert.equal(JSON.stringify(plan),originalPlan,'Target evaluation changed the original plan.');
  return {...metrics,researchStatus:result.research.status,researchedExchanges:result.research.exchanges.length,exchangeAdditions:added};
 });
}

report.totalInputTokens=report.providerUsage.reduce((n,c)=>n+(c.inputTokens||0),0);
report.totalOutputTokens=report.providerUsage.reduce((n,c)=>n+(c.outputTokens||0),0);
report.providerCalls=report.providerUsage.length;
report.passed=report.cases.every(c=>c.passed);save();
console.log(JSON.stringify({passed:report.passed,live,cases:report.cases.length,providerCalls:report.providerCalls,totalInputTokens:report.totalInputTokens,totalOutputTokens:report.totalOutputTokens,report:'.sites-runtime/mvp-live-report.json'}));
