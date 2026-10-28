import assert from 'node:assert/strict';
import {advise} from './server/advisor.mjs';
import {decide,selected,JEV_URL,JEV_MODEL} from './server/jev.mjs';
import {boundedRequest} from './server/request-policy.mjs';
import {normalizeProfile} from './dist/planner.js';
import {newJourney,suggestChoices,makePlan,validateSavedWorkspace,emptyWorkspace} from './dist/guidance.js';
import {acceptAdvice} from './dist/journey-state.js';
import {AXES} from './dist/evidence.js';
import {jevFixture} from './tests/jev-fixture.mjs';
import {openaiFixture} from './tests/openai-fixture.mjs';
import {localDatabase} from './server/local-db.mjs';
import {handleApi} from './server/api.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {beginServiceAction} from './server/service-allowance.mjs';
import {requestsLiveResearch} from './server/hybrid-adviser.mjs';
import {researchFor,researchContextKey} from './server/research.mjs';
import {saveResearch} from './server/research-cache.mjs';
const observations=[],env={OPENAI_API_KEY:'synthetic-openai',OPENAI_WEB_RESEARCH:'on',OPENAI_DIRECTION_RESEARCH:'off',GOPLAN_HYBRID:'on',TYPESAFE_API_KEY:'synthetic-jev',TYPESAFE_MODEL:JEV_MODEL,GOPLAN_TOKEN_COUNTER:async()=>1000,GOPLAN_PROVIDER_OBSERVER:e=>observations.push(e)};
const questionnaire={ambitions:'Build useful financial software for Moroccan businesses.',activities:'Program reliable software and analyze information.',strengths:'Mathematics and computer science.',industries:'Digital payments.',priorities:'Useful technical products.',entrepreneurship:'Explore startup experience.',automation:'Build and use AI.',constraints:'A normal workload with summer study.'};
const base={flowVersion:5,questionnaire,level:'undergraduate',preferredDegree:'undecided',profile:normalizeProfile({program:'BSCSC',track:'SE',minor:'',name:'PRIVATE_NAME',gpa:3.99,note:'PRIVATE_NOTE'})};
let jevCalls=0,openaiCalls=0;
const fixture=async(url,init)=>{
 assert.equal(url,JEV_URL,'Routine hybrid work must bypass OpenAI and live search: '+JSON.parse(init.body).text?.format?.name+' '+JSON.stringify(observations));jevCalls++;
 const body=JSON.parse(init.body);assert.ok(!init.body.includes('synthetic-jev'));assert.ok(!init.body.includes('PRIVATE_NOTE'));assert.ok(!init.body.includes('PRIVATE_NAME'));assert.ok(!init.body.includes('3.99'));
 return jevFixture(body,{pick:{degree:'BSCSC',focus_BSCSC:'SE',minor:'none',regular:'5',summer:'2',summers:'yes',scope:'companies'}});
};
const j=newJourney();j.questionnaire=questionnaire;j.profile=base.profile;
for(const stage of ['direction','courses','targets','pace']){
 const result=await advise({...base,stage,profile:j.profile},env,fixture);
 assert.equal(result.source,'hybrid',stage+' should use Jev with validated template output.');
 assert.equal(result.model,JEV_MODEL);acceptAdvice(j,stage,result);
 if(stage==='direction')assert.equal(result.assessment.length,6);
 if(stage==='courses')assert.equal(new Set(Object.values(result.agentChoices)).size,Object.values(result.agentChoices).length);
 if(stage==='targets'){assert.equal(result.internships.length,5);assert.equal(result.exchanges.length,5);assert.equal(result.research.status,'reviewed');}
 if(stage==='pace'){assert.equal(result.regularCourses,5);assert.equal(result.summerCourses,2);assert.equal(result.summers,true);}
}
assert.equal(jevCalls,5,'Direction makes two bounded calls; other routine stages make one each.');
const plan=makePlan(j);assert.doesNotThrow(()=>validateSavedWorkspace({...emptyWorkspace(),phase:'saved',plan,journey:j}));
const route=await advise({...base,stage:'change',changeRequest:'Change my company recommendations to include more startups.',programChosen:true},env,fixture);
assert.deepEqual(route.sections,['companies']);assert.equal(route.instructions.exchanges,'');
let complexCalls=0;
await advise({...base,stage:'change',changeRequest:'Change my minor and replace my company recommendations.',programChosen:true},env,async(url)=>{complexCalls++;assert.notEqual(url,JEV_URL);return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...route,sections:['direction','companies'],instructions:{direction:'Change the minor.',courses:'',companies:'Replace companies.',exchanges:'',semesters:''}})}]}]});});assert.equal(complexCalls,1);
let researchCalls=0;
const refreshed=await advise({...base,stage:'targets',researchOnly:true},env,async(url)=>{researchCalls++;assert.notEqual(url,JEV_URL);return Response.json({error:{code:'synthetic-unavailable'}},{status:503});});assert.equal(refreshed.kind,'research');assert.ok(researchCalls>0);
assert.equal(requestsLiveResearch({refinement:'Research more Moroccan startups on the web.'}),true);
assert.equal(requestsLiveResearch({refinement:'Choose company recommendations.'}),false);
const cachedRequest={profile:{program:'BSCSC'},questionnaire,refinement:'',currentTargets:{}};
const cacheMiss=await researchFor(cachedRequest,'targets',env,async()=>{throw Error('A cache-only match cannot buy research.');},{cacheOnly:true});assert.equal(cacheMiss.status,'reviewed');
const retained={status:'live',companies:[{id:'synthetic-verified-company',name:'Synthetic verified company',sourceUrl:'https://example.com/source'}],exchanges:[],facts:[],sources:[],gaps:[]};
await saveResearch(null,await researchContextKey(cachedRequest,'targets'),retained);
const cacheHit=await researchFor(cachedRequest,'targets',env,async()=>{throw Error('Retained evidence should be reused without a provider.');},{cacheOnly:true});assert.equal(cacheHit.companies[0].id,'synthetic-verified-company');
const direction={kind:'recommend',summary:'A supported direction.',themes:[],questions:[],tradeoffs:[],academic:{program:'BSCSC',track:'SE',secondTrack:'',minor:'',rationale:'Software.',focusRationale:'Software.',secondFocusRationale:'',minorRationale:''},assessment:Object.keys(AXES).map(axis=>({axis,explanation:'Supported planning draft.',answerIds:[],evidenceIds:[]})),update:{summary:'Prepared a direction.',changes:[],limitations:[]}};
for(const mode of ['low-confidence','invalid-choice','provider-error','stalled-body']){
 let attempts=0,fallbacks=0;
 const result=await advise({...base,stage:'direction'},{...env,GOPLAN_JEV_TIMEOUT_MS:100},async(url,init)=>{
  const body=JSON.parse(init.body);
  if(url===JEV_URL){attempts++;if(mode==='provider-error')return Response.json({error:'synthetic'},{status:429});if(mode==='stalled-body')return new Response(new ReadableStream({start(){}}));const response=jevFixture(body,{confidence:mode==='low-confidence'?0.01:1,pick:{degree:'BSCSC',focus_BSCSC:'SE'}});if(mode==='invalid-choice'){const p=await response.json();p.answers.degree.choice='INVENTED';return Response.json(p);}return response;}
  fallbacks++;return openaiFixture({status:'completed',model:'gpt-6.1-sol',output:[{content:[{type:'output_text',text:JSON.stringify(direction)}]}]});
 });
 assert.equal(result.source,'openai');assert.equal(attempts,1,'Never retry paid Jev failures.');assert.equal(fallbacks,1);
}
// A typed but academically invalid proposal must still fail validation and use
// the existing fallback. The model cannot invent courses or waive prerequisites.
let sawRepair=false;
const badChoices={...base,stage:'courses'};
const courseResult=await advise(badChoices,env,async(url,init)=>{
 const body=JSON.parse(init.body);if(url===JEV_URL)return jevFixture(body);
 openaiCalls++;const c=JSON.parse(body.input);sawRepair=!!c.repair;
 const choices=suggestChoices({interests:[],profile:base.profile,questionnaire}).profile.choices;
 return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Reviewed courses.',choices:Object.entries(choices).map(([requirementId,courseCode])=>({requirementId,courseCode,reason:'Fits the reviewed curriculum.'})),openItems:[],update:{summary:'Reviewed choices.',changes:[],limitations:[]}})}]}]});
});
assert.ok(['hybrid','openai'].includes(courseResult.source));
// Missing key or disabled flag preserves the original route without a Jev call.
let calls=0;
await advise({...base,stage:'direction'},{...env,TYPESAFE_API_KEY:''},async(url)=>{calls++;assert.notEqual(url,JEV_URL);return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(direction)}]}]});});assert.equal(calls,1);
// One shared ceiling accounts for both providers; uncertain transports retain
// their reservation even when the fallback follows immediately.
let paid=0;
const policy=boundedRequest({...env,GOPLAN_TOKEN_COUNTER:async()=>60000},async()=>{paid++;return Response.json({status:'incomplete'});});
try{await policy.fetcher(JEV_URL,{method:'POST',body:JSON.stringify({model:JEV_MODEL,state:'Synthetic',questions:{}})});await policy.fetcher('https://api.openai.com/v1/responses',{method:'POST',body:JSON.stringify({model:'gpt-6.1-sol',input:'Synthetic',max_output_tokens:6000})});await assert.rejects(()=>policy.fetcher('https://api.openai.com/v1/responses',{method:'POST',body:JSON.stringify({model:'gpt-6.1-sol',input:'Synthetic',max_output_tokens:6000})}),e=>e.code==='REQUEST_BUDGET');assert.equal(paid,2);}finally{policy.dispose();}
const questions={x:{type:'choice',instructions:'Choose.',criteria:{a:'A',b:'B'}}};
await assert.rejects(()=>decide('Synthetic',questions,{...env,TYPESAFE_MODEL:'jev-latest'},fixture),e=>e.reason==='model');
await assert.rejects(()=>decide('x'.repeat(31000),questions,env,fixture),e=>e.reason==='context');
assert.throws(()=>selected({choice:'a',confidence:0.1}),e=>e.reason==='confidence');
// Authenticated API, durable allowance receipt, replay and saved-data privacy.
const DB=localDatabase(':memory:'),uid='synthetic-hybrid-student',origin='https://planwithgoplan.com';
try{
 const headers={...await testSession(DB,uid),'Content-Type':'application/json',Origin:origin};
 const action=(await beginServiceAction(DB,uid,{id:crypto.randomUUID(),kind:'initial',step:0})).action;
 const status=await handleApi(new Request(origin+'/api/status',{headers}),{...env,DB});assert.equal((await status.json()).provider,'hybrid');
 // The real API settles one allowance receipt; replay never calls a provider.
 const input={...base,stage:'direction',serviceAction:action};
 let replayCalls=0;const api=()=>handleApi(new Request(origin+'/api/advice',{method:'POST',headers,body:JSON.stringify(input)}),{...env,DB},{fetcher:async(...args)=>{replayCalls++;return fixture(...args);}});
 const first=await api();assert.equal(first.status,200);const count=replayCalls;assert.equal(count,2);const second=await api();assert.equal(second.status,200);assert.equal(replayCalls,count);
}finally{DB.close();}
assert.ok(observations.some(e=>e.outcome==='completed'&&e.inputTokens===1200));
console.log('Passed Jev protocol, routine four-stage flow, saved workspace, scoped routing, low-confidence/error/body-timeout fallback, shared budget, model pinning, context bounds and authenticated receipt replay. Synthetic providers only.');
