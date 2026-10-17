import {serviceFixture} from './tests/service-fixture.mjs';
import assert from 'node:assert/strict';
import {advise,detailsContext,sanitizeRequest} from './server/advisor.mjs';
import {compactCourseContext} from './server/course-context.mjs';
import {REQUEST_BUDGET_USD} from './server/request-policy.mjs';
import {adviserFailure,rememberAdviserFailure} from './server/adviser-lease.mjs';
import {localDatabase} from './server/local-db.mjs';
import {handleApi} from './server/api.mjs';
import {DATA,normalizeProfile} from './dist/planner.js';
import {newJourney} from './dist/guidance.js';
import {adviceFingerprint} from './dist/journey-state.js';
import {journeyView} from './dist/views.js';
import {requestAdvice,setAccessCode,resetAdviserSession} from './dist/ai-client.js';

const questionnaire={ambitions:'Build useful software.',activities:'Programming and analysis.',strengths:'Solving mathematical problems.'};
const courses={stage:'courses',flowVersion:5,programChosen:true,questionnaire,goal:questionnaire.ambitions,profile:normalizeProfile({program:'BSCSC',track:'SE',minor:'business-administration',choices:{'bscsc-history':'HIS1301'}})};
const base={OPENAI_API_KEY:'fixture-course-budget',OPENAI_WEB_RESEARCH:'off'};
const response=(proposal,usage)=>Response.json({status:'completed',model:'gpt-6.1-sol',usage,output:[{content:[{type:'output_text',text:JSON.stringify(proposal)}]}]});
assert.equal(REQUEST_BUDGET_USD,0.25,'The spending ceiling must match the founder-approved $0.25 cap.');

for(const program of DATA.programs){
 const request=sanitizeRequest({stage:'details',goal:questionnaire.ambitions,level:program.level,profile:normalizeProfile({program:program.id,track:program.tracks[0]?.id})});
 const original=detailsContext(request),compact=compactCourseContext(original);
 assert.equal(compact.requirements.length,original.requirements.length);
 for(let i=0;i<original.requirements.length;i++){
  const row=compact.requirements[i];assert.deepEqual(row.options||compact.optionSets[row.optionsId],original.requirements[i].options,'Every eligible course remains selectable.');
  assert.deepEqual(row.conditionalRules,original.requirements[i].conditionalRules);
 }
 assert.equal(compact.catalog.length,original.catalog.length);
 for(let i=0;i<original.catalog.length;i++){
  const row=Object.fromEntries(compact.catalogFields.map((field,index)=>[field,compact.catalog[i][index]])),old=original.catalog[i];
  assert.equal(row.code,old.code);assert.equal(row.title,old.title);assert.equal(row.credits,old.credits);assert.equal(row.topic,old.topic);
  for(const [field,value]of Object.entries(old.prerequisites||{}))assert.deepEqual(row.prerequisites[field]??({all:[],any:[],coreq:[],minCredits:0,review:false}[field]),value,'Prerequisite semantics must remain intact.');
 }
 assert.deepEqual(compact.programPrerequisiteOverrides,original.programPrerequisiteOverrides);
 assert.deepEqual(compact.minorOverlapRules,original.minorOverlapRules);
 if(program.level==='undergraduate')assert.ok(JSON.stringify(compact).length<JSON.stringify({...original,companies:undefined,exchangeDestinations:undefined}).length*0.7,'Reduce academic payload without removing course choices.');
}

let generations=0,counts=[];
const env={...base,GOPLAN_TOKEN_COUNTER:async body=>{const count=Math.ceil(JSON.stringify(body).length/4);counts.push(count);return count;}};
const repaired=await advise(courses,env,async(_,init)=>{
 generations++;assert.ok(JSON.parse(JSON.parse(init.body).input).optionSets);
 return response({summary:'Review eligible options.',choices:[],openItems:[]},{input_tokens:counts.at(-1),output_tokens:6000});
});
assert.equal(generations,2);assert.equal(repaired.recovery,undefined);
assert.ok(repaired.openItems.length,'An incomplete minor remains explicitly open.');
assert.equal(repaired.choices['bscsc-history'],'HIS1301');
assert.ok(counts.every(n=>n<21000),'The previous oversized course case now fits a normal repair within the original ceiling.');

// If a completed proposal has used almost all the request budget, never pay to
// restart it. Recover its valid selections and visibly leave rejected ones open.
generations=0;
const recovered=await advise(courses,{...base,GOPLAN_TOKEN_COUNTER:async()=>60000},async()=>{
 generations++;return response({summary:'Review these courses.',choices:[{requirementId:'bscsc-free-1',courseCode:'FIN4308',reason:'Finance applications.'},{requirementId:'bscsc-free-2',courseCode:'MTH2304',reason:'Mathematical modelling.'}],openItems:[]},{input_tokens:60000,output_tokens:6000});
});
assert.equal(generations,1);assert.equal(recovered.recovery,'validated-course-review');
assert.equal(recovered.choices['bscsc-free-1'],undefined);assert.equal(recovered.choices['bscsc-free-2'],'MTH2304');
assert.equal(recovered.choices['bscsc-history'],'HIS1301');assert.ok(recovered.openItems.length);assert.ok(recovered.reviewNotes.length);

const DB=localDatabase(':memory:'),apiEnv={...base,DB,AI_ACCESS_CODE:'fixture-access',GOPLAN_TOKEN_COUNTER:async()=>60000};
const {testSession}=await import('./tests/session-fixture.mjs'),budgetSession=await testSession(DB,'budget-fixture');
const serviceActions=await serviceFixture(DB,'budget-fixture');
const failedInput={stage:'direction',flowVersion:5,questionnaire,level:'undergraduate',preferredDegree:'undecided'};
const req=(body=failedInput)=>new Request('https://planwithgoplan.com/api/advice',{method:'POST',headers:{Origin:'https://planwithgoplan.com','Content-Type':'application/json',...budgetSession,'X-GoPlan-Session':'budget-fixture-session-1234'},body:JSON.stringify({...body,serviceAction:serviceActions[0]})});
let paid=0;
const fail=async()=>{paid++;return response({kind:'recommend',academic:{program:'UNSUPPORTED'}},{input_tokens:60000,output_tokens:6000});};
let result=await handleApi(req(),apiEnv,{fetcher:fail});assert.equal(result.status,422);
let error=await result.json();assert.equal(error.code,'REQUEST_BUDGET');assert.equal(error.retryable,false);assert.equal(paid,1);
await handleApi(req(),apiEnv,{fetcher:fail});assert.equal(paid,1,'Immediate unchanged retry must not call the provider.');
const anotherWorker=await import('./server/api.mjs?budget-worker-fixture');
result=await anotherWorker.handleApi(req(),apiEnv,{fetcher:fail});assert.equal(result.status,422);assert.equal(paid,1,'Persisted failure protects a different Worker instance.');
await handleApi(req({...failedInput,questionnaire:{...questionnaire,ambitions:'Design infrastructure software.'}}),apiEnv,{fetcher:fail});assert.equal(paid,2,'A genuinely changed request is a separate decision.');
const rows=(await DB.prepare('SELECT id,code FROM adviser_failures').all()).results;
assert.ok(rows.every(row=>/^[a-f0-9]{64}$/.test(row.id)&&row.code==='REQUEST_BUDGET'),'The failure store contains no prompt or identity text.');
await rememberAdviserFailure(DB,'expired-fixture','REQUEST_BUDGET');
await DB.prepare('UPDATE adviser_failures SET expires_at=? WHERE id=?').bind(Date.now()-1,'expired-fixture').run();
assert.equal(await adviserFailure(DB,'expired-fixture'),null);

paid=0;
const incomplete={...failedInput,questionnaire:{...questionnaire,ambitions:'Study economics and data.'}};
const incompleteFetcher=async()=>{paid++;return Response.json({status:'incomplete',usage:{input_tokens:1000,output_tokens:6000},output:[]});};
error=await (await handleApi(req(incomplete),apiEnv,{fetcher:incompleteFetcher})).json();
assert.equal(error.code,'RESPONSE_INCOMPLETE');assert.equal(error.retryable,false);
await handleApi(req(incomplete),apiEnv,{fetcher:incompleteFetcher});assert.equal(paid,1,'A billed incomplete generation must not be repeated unchanged.');

paid=0;
const timedOut={...failedInput,questionnaire:{...questionnaire,ambitions:'Study environmental engineering.'}};
const timeoutFetcher=async()=>{paid++;throw new DOMException('Internal deadline detail','TimeoutError');};
result=await handleApi(req(timedOut),apiEnv,{fetcher:timeoutFetcher});assert.equal(result.status,504);
const timeoutError=await result.json();assert.equal(timeoutError.code,'ADVISER_TIMEOUT');assert.equal(timeoutError.retryable,false);
assert.match(timeoutError.error,/answers are saved/);assert.ok(!timeoutError.error.includes('Internal deadline'));
result=await handleApi(req(timedOut),apiEnv,{fetcher:timeoutFetcher});assert.equal(result.status,504);assert.deepEqual(await result.json(),timeoutError);
result=await anotherWorker.handleApi(req(timedOut),apiEnv,{fetcher:timeoutFetcher});assert.equal(result.status,504);assert.deepEqual(await result.json(),timeoutError);
assert.equal(paid,1,'A timed-out generation stays blocked across workers without exposing internal details.');
DB.close();

const oldFetch=globalThis.fetch;
try{
 resetAdviserSession();setAccessCode('client-budget-fixture');let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({error:'Your choices are saved.',code:'REQUEST_BUDGET',retryable:false},{status:422});};
 const journey=newJourney();journey.step=2;journey.programChosen=true;journey.questionnaire=questionnaire;
 const before=JSON.stringify(journey);
 await assert.rejects(()=>requestAdvice('courses',journey),e=>e.code==='REQUEST_BUDGET'&&e.retryable===false);
 await assert.rejects(()=>requestAdvice('courses',journey));assert.equal(calls,1);assert.equal(JSON.stringify(journey),before);
 const failure={stage:'courses',retryable:false,fingerprint:adviceFingerprint('courses',journey)};
 let html=journeyView({journey},{aiError:'Your choices are saved.',aiFailure:failure});
 assert.ok(html.includes('data-action="review-course-choices"'));assert.ok(!html.includes('data-action="retry-ai"'));assert.match(html,/data-action="journey-next" disabled/);
 journey.profile.choices={'bscsc-free-1':'MTH2304'};
 html=journeyView({journey},{aiError:'Your choices are saved.',aiFailure:failure});assert.ok(html.includes('data-action="retry-ai"'));
 await assert.rejects(()=>requestAdvice('courses',journey));assert.equal(calls,2);
}finally{globalThis.fetch=oldFetch;resetAdviserSession();setAccessCode('');}
console.log('Passed all-program course-option/constraint preservation, smaller repair prompts, original spending ceiling, validated paid-proposal recovery, cross-instance failure protection, expiry, billed-incomplete protection and safe browser recovery. No live calls.');
