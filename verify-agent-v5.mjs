import assert from 'node:assert/strict';
import {advise} from './server/advisor.mjs';
import {DATA,normalizeProfile,coursesFor,generatePlan,termOrder} from './dist/planner.js';
import {newJourney,makePlan,validateSavedWorkspace,emptyWorkspace} from './dist/guidance.js';
import {QUESTIONS,emptyQuestionnaire,missingAnswers} from './dist/questionnaire.js';
import {AXES} from './dist/evidence.js';
import {acceptAdvice} from './dist/journey-state.js';
import {journeyView,planView} from './dist/views.js';
import {proposeReplan,replanSnapshot,restoreSnapshot} from './dist/replanning.js';
const q={...emptyQuestionnaire(),ambitions:'Build fraud detection products for small Moroccan businesses.',activities:'Program reliable software and test mathematical models.',strengths:'I enjoy mathematics and programming projects.',industries:'Digital payments and financial technology.',priorities:'Useful products and stable technical skills.',entrepreneurship:'Start a service for merchants after gaining experience.',automation:'Build and use AI while learning security and human judgment.',constraints:'Keep a normal workload and study in summers.'};
const input={stage:'direction',flowVersion:5,questionnaire:q,level:'undergraduate',preferredDegree:'undecided',profile:normalizeProfile({program:'BSCSC',track:'SE'})};
const env={OPENAI_WEB_RESEARCH:'off',OPENAI_API_KEY:'fixture-secret',AI_ACCESS_CODE:'fixture-code'};
const response=value=>Response.json({status:'completed',model:'test-fixture',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const assessment=Object.keys(AXES).map(axis=>({axis,explanation:'A qualified inference connected to the stated product goal.',answerIds:['ambitions'],evidenceIds:['ita-digital-morocco-2025']}));
const direction={kind:'recommend',summary:'Build reliable payment software.',themes:['Secure software'],questions:[],academic:{program:'BSCSC',track:'SE',secondTrack:'',minor:'',rationale:'Software foundations for your product.',focusRationale:'Practice reliable engineering.',secondFocusRationale:'Keep workload manageable.',minorRationale:'Leave open until you compare complements.'},tradeoffs:['Check placement separately.'],assessment};
// Regression: only the three required responses, with every optional field blank.
const partial={...emptyQuestionnaire(),ambitions:'undecided',activities:'applying technology and intelligence to mainstream industries',strengths:'I like solving problems and providing intelligence and analysis; I hate remembering facts'};
assert.equal(missingAnswers(partial).length,0);
for(const answers of [partial,emptyQuestionnaire(),q]){
 const allowed=QUESTIONS.filter(x=>answers[x.id]).map(x=>x.id);
 await advise({...input,questionnaire:answers},env,async(_,init)=>{
  const body=JSON.parse(init.body),context=JSON.parse(body.input),links=body.text.format.schema.properties.assessment.items.properties.answerIds;
  assert.deepEqual(context.allowedAnswerIds,allowed);
  assert.deepEqual(context.questionLabels.map(x=>x.id),allowed);
  if(allowed.length)assert.deepEqual(links.items.enum,allowed);
  else {assert.equal(links.maxItems,0);assert.equal(links.items.enum,undefined);}
  return response({...direction,assessment:assessment.map(x=>({...x,answerIds:allowed.slice(0,1)}))});
 });
}
let partialCalls=0;
await advise({...input,questionnaire:partial},env,async(_,init)=>{
 partialCalls++;const context=JSON.parse(JSON.parse(init.body).input);
 if(partialCalls===2)assert.match(context.repair.reason,/answers actually supplied/);
 return response({...direction,assessment:assessment.map(x=>({...x,answerIds:[partialCalls===1?'entrepreneurship':'activities']}))});
});
assert.equal(partialCalls,2,'Invalid blank-answer references must be repaired, not silently accepted');
await assert.rejects(advise({...input,questionnaire:partial},env,async()=>response({...direction,assessment:assessment.map(x=>({...x,answerIds:['entrepreneurship']}))})),/answers actually supplied/);
assert.equal(missingAnswers(q).length,0);assert.equal(missingAnswers(emptyQuestionnaire()).length,3);
const j=newJourney();j.questionnaire=q;j.goal='Build secure financial products.';j.background='I am completing high school and considering AUI.';
for(const stage of ['setup','direction','courses','targets','pace']){
 let calls=0;
 const result=await advise({...input,stage,profile:j.profile,background:j.background},env,async(_,init)=>{
  calls++;const payload=JSON.parse(init.body),c=JSON.parse(payload.input);assert.equal(payload.store,false);assert.equal(c.request.questionnaire.activities,q.activities);assert.ok(!init.body.includes('fixture-secret'));
  if(stage==='setup')return response({summary:'Explore undergraduate programs.',level:'undergraduate',preferredDegree:'undecided',reason:'You are completing secondary education.',questions:['Which work do you enjoy?']});
  if(stage==='direction')return response(direction);
  if(stage==='courses'){
   assert.equal(c.companies,undefined);assert.equal(c.exchangeDestinations,undefined);
   if(calls===2){assert.ok(c.repair.previousProposal);assert.match(c.repair.reason,/prerequisites/);}
   return response({summary:'Suggested electives.',choices:[{requirementId:'bscsc-free-1',courseCode:'FIN4308',reason:'Finance applications.'},{requirementId:'bscsc-free-2',courseCode:'MTH2304',reason:'Mathematical modeling.'}],openItems:[]});
  }
  if(stage==='targets'){
   const s=payload.text.format.schema;const companyIds=s.properties.internships.properties.reach.items.properties.id.enum,exchangeIds=s.properties.exchanges.properties.reach.items.properties.id.enum;assert.ok(companyIds.every(id=>!exchangeIds.includes(id)),'Separate destination enums');
   const items=(records)=>records.slice(0,5).map((r,i)=>({id:r.id,tier:i<3?'reach':i===3?'target':'safety',reason:'Explore skills for your merchant-product goal.',tierReason:'Research fit, not admission probability.',industryReason:'A qualified digital-sector opportunity, not an opening.',answerIds:['ambitions'],evidenceIds:['ita-digital-morocco-2025']}));
   return response({summary:'Research these sourced opportunities.',internships:items(c.companies),exchanges:items(c.exchangeDestinations)});
  }
  return response({summary:'Normal load with summer courses.',pace:'balanced',summers:true,reason:'Respects your workload preference.',actions:['Confirm language placement.']});
 });
 acceptAdvice(j,stage,result);if(stage==='courses'){assert.equal(calls,2);assert.equal(j.profile.choices['bscsc-free-1'],undefined);assert.equal(j.profile.choices['bscsc-free-2'],'MTH2304');assert.ok(result.reviewNotes.length);}
}
for(let step=0;step<6;step++){j.step=step;const html=journeyView({journey:j},{aiStatus:{available:true},hasAccess:true});assert.ok(html.includes('STEP '));assert.ok(!html.includes('Continue with manual planning'));}
const plan=makePlan(j),html=planView(plan,false);assert.ok(html.includes('MOROCCAN COMPANIES'));assert.ok(html.includes('EXCHANGE DESTINATIONS'));assert.ok(html.includes('Change my plan'));assert.ok(html.includes('data-action="agent-replan"'));
const restored=validateSavedWorkspace({...emptyWorkspace(),phase:'saved',plan,journey:j});assert.deepEqual(restored.journey.questionnaire,q);
const old=structuredClone(restored);old.journey.flowVersion=4;old.journey.step=3;delete old.journey.questionnaire;assert.equal(validateSavedWorkspace(old).journey.step,3);
assert.throws(()=>validateSavedWorkspace({...restored,journey:{...j,step:99}}));
const base=makePlan(j);const first=base.terms.find(t=>t.id.startsWith('Fall-')),current=base.terms.find(t=>t.id.startsWith('Spring-'));
for(const id of first.courses)if(base.courses.find(c=>c.id===id).code)base.tracking[id]={status:'completed',grade:'A',note:'private academic note'};
const inProgress=current.courses.find(id=>base.courses.find(c=>c.id===id).code);base.tracking[inProgress]={status:'in-progress'};
const snapshot=replanSnapshot(base);assert.ok(!JSON.stringify(snapshot).includes('private academic note'));assert.ok(!JSON.stringify(snapshot).includes('grade'));
restoreSnapshot(snapshot);
const future=base.terms.find(t=>termOrder(t)>termOrder(current)&&t.courses.some(id=>base.courses.find(c=>c.id===id).code)),unavailableCode=base.courses.find(c=>c.id===future.courses.find(id=>base.courses.find(c=>c.id===id).code)).code;
const change={track:base.profile.track,secondTrack:base.profile.secondTrack,minor:base.profile.minor,pace:'balanced',summers:true,choices:[],unavailable:[{courseCode:unavailableCode,termId:future.id}]};
const original=JSON.stringify(base),proposal=proposeReplan(base,change,current.id);assert.equal(JSON.stringify(base),original);
const replaceId='bscsc-free-2',replaceCode=base.courses.find(c=>c.id===replaceId).code;
const replaceTerm=base.terms.find(t=>t.courses.includes(replaceId)).id;
const substitution={...change,choices:[{requirementId:replaceId,courseCode:'ACC2301',reason:'An eligible introductory business elective.'}],unavailable:[{courseCode:replaceCode,termId:replaceTerm}]};
const replaced=proposeReplan(base,substitution,current.id);
assert.equal(replaced.candidate.courses.find(c=>c.id===replaceId).code,'ACC2301');
assert.equal(replaced.assessment.replacements[0].from,replaceCode);
assert.equal(replaced.assessment.replacements[0].to,'ACC2301');
assert.equal(replaced.candidate.scheduling.unavailable.filter(x=>x.courseCode===replaceCode).length,1);
assert.doesNotThrow(()=>proposeReplan(replaced.candidate,{choices:[]},current.id),'A historical unavailable code survives a later replan');
assert.throws(()=>proposeReplan(base,{...substitution,unavailable:[{courseCode:'INVENTED',termId:replaceTerm}]},current.id),/degree plan/);
const protectedReplacement=structuredClone(base);protectedReplacement.tracking[replaceId]={status:'completed'};
assert.throws(()=>proposeReplan(protectedReplacement,substitution,current.id),/cannot be replaced/);
const retiredProgress=structuredClone(base);retiredProgress.tracking[replaceId]={status:'retake',grade:'F',note:'Old course only'};
assert.equal(proposeReplan(retiredProgress,substitution,current.id).candidate.tracking[replaceId],undefined);
const optionsHtml=html.split('More plan options</summary>')[1].split('</details>')[0];
assert.equal((optionsHtml.match(/data-action=/g)||[]).length,2);
assert.ok(!optionsHtml.includes('Record a course conflict'));
for(const [id,t] of Object.entries(base.tracking))if(['completed','in-progress'].includes(t.status)){assert.equal(proposal.candidate.terms.find(t=>t.courses.includes(id)).id,base.terms.find(t=>t.courses.includes(id)).id);assert.deepEqual(proposal.candidate.tracking[id],t);}
assert.ok(!proposal.candidate.terms.find(t=>t.id===future.id)?.courses.some(id=>proposal.candidate.courses.find(c=>c.id===id).code===unavailableCode));
const trackedCourse=base.courses.find(c=>c.id===inProgress);assert.throws(()=>proposeReplan(base,{...change,unavailable:[{courseCode:trackedCourse.code,termId:current.id}]},current.id),/completed or current/);
assert.throws(()=>restoreSnapshot({...snapshot,progress:[{id:'invented',status:'completed'}]}));
const delayed=proposeReplan(base,{...change,unavailable:[]},'Fall-2035');assert.equal(delayed.assessment.delayed,true);assert.ok(delayed.assessment.extraRegularTerms>0);
let replanCalls=0;await advise({...input,stage:'replan',plan:{...snapshot,profile:{...snapshot.profile,name:'private name'},progress:snapshot.progress.map(p=>({...p,note:'private note'}))},currentTerm:current.id,changeRequest:'Keep my current direction and reschedule the remaining work.'},env,async(_,init)=>{replanCalls++;assert.ok(!init.body.includes('private name'));assert.ok(!init.body.includes('private note'));return response({kind:'propose',summary:'Keep the same academic direction.',questions:[],change:{...change,unavailable:[]}});});assert.equal(replanCalls,1);
console.log('Passed v5 questionnaire, five agent stages, rejected-elective recovery, distinct target schemas, rationale links, backup migration, progress privacy, immutable completed/current courses, unavailable offerings and delayed-graduation checks. No live calls.');
