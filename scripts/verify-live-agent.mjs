// Explicit opt-in smoke test. Uses synthetic answers and the existing server key.
// Run: node --env-file=.env scripts/verify-live-agent.mjs
import fs from 'node:fs';
import {advise} from '../server/advisor.mjs';
import {newJourney,makePlan} from '../dist/guidance.js';
import {acceptAdvice,synchronizeGoal} from '../dist/journey-state.js';
import {replanSnapshot} from '../dist/replanning.js';
if(!process.env.OPENAI_API_KEY)throw Error('No server API key configured.');
const j=newJourney();j.background='I am finishing high school and want to study an undergraduate degree at AUI.';
j.questionnaire={ambitions:'Build useful fraud-detection products for small Moroccan businesses.',activities:'I enjoy programming software and investigating data, more than running a sales department.',strengths:'Mathematics and programming are my strongest subjects. I enjoy practical projects.',industries:'Digital payments and financial technology for merchants.',priorities:'Develop practical technical skills, stable career options and a useful product.',entrepreneurship:'Work in an engineering team first, then possibly start a service for small merchants.',automation:'Learn to build and use AI, with strong security and human judgment.',constraints:'A normal workload with summer courses is fine. Keep graduation close to four years.'};synchronizeGoal(j);
const results={},usage=[];const trackedFetch=async(url,init)=>{const r=await fetch(url,init);if(r.ok){const p=await r.clone().json();usage.push({input:p.usage?.input_tokens,output:p.usage?.output_tokens,model:p.model});}return r;};
fs.mkdirSync('.sites-runtime',{recursive:true});const save=()=>fs.writeFileSync('.sites-runtime/v5-live-results.json',JSON.stringify({results,usage,journey:j},null,2));
for(const stage of ['setup','direction','courses','targets','pace']){
 console.log('Checking '+stage+'…');
 const r=await advise({...j,stage,flowVersion:5,acceleratedEligible:false},process.env,trackedFetch);results[stage]=r;acceptAdvice(j,stage,r);save();
 if(r.kind==='clarify')throw Error('Fixture needs a follow-up: '+r.questions.join(' '));
 console.log(JSON.stringify({stage,passed:true,program:j.profile.program,selectedCourses:r.choices?Object.keys(r.choices).length:undefined,reviewNotes:r.reviewNotes?.length,internships:r.internships?.length,exchanges:r.exchanges?.length}));
}
const plan=makePlan(j),first=plan.terms.find(t=>t.id.startsWith('Fall-')),current=plan.terms.find(t=>t.id.startsWith('Spring-'));
for(const id of first.courses)if(plan.courses.find(c=>c.id===id).code)plan.tracking[id]={status:'completed'};
const unavailable=plan.courses.find(c=>current.courses.includes(c.id)&&c.code);
console.log('Checking progress-aware replanning…');
results.replan=await advise({...j,stage:'replan',flowVersion:5,plan:replanSnapshot(plan),currentTerm:current.id,changeRequest:`${unavailable.code} is unavailable in ${current.id}. Keep my degree, focus and minor. Reschedule remaining courses while trying to retain the current graduation date.`,unavailable:[{courseCode:unavailable.code,termId:current.id}]},process.env,trackedFetch);save();
console.log(JSON.stringify({stage:'replan',kind:results.replan.kind,feasibility:results.replan.feasibility?.status,canApply:results.replan.feasibility?.canApply,completedPreserved:results.replan.feasibility?.completedPreserved,providerCalls:usage.length}));
