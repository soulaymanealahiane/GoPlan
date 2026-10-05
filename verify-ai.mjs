import {groqFixture} from './tests/groq-fixture.mjs';
import assert from 'node:assert/strict';
import {requestAdvice,setAccessCode,hasAccessCode} from './dist/ai-client.js';
import {sanitizeRequest,validateDirection,validateDetails,availableTargets,advise} from './server/advisor.mjs';
import {fetchGroq} from './server/groq-transport.mjs';
import {handleApi} from './server/api.mjs';
import {normalizeProfile,DATA} from './dist/planner.js';
import {emptyWorkspace,validateSavedWorkspace} from './dist/guidance.js';
import {journeyView} from './dist/views.js';
import {needsPersonalConfirmation} from './dist/course-options.js';

const input={stage:'direction',level:'undergraduate',goal:'I want to develop fraud detection software for digital payments.'};
const direction={kind:'recommend',summary:'Software engineering for financial products.',themes:['Payment security'],questions:[],academic:{program:'BSCSC',track:'SE',secondTrack:'AI',minor:'mathematics',rationale:'Build the software.',focusRationale:'Engineer reliable systems.',secondFocusRationale:'Understand detection models.',minorRationale:'Strengthen quantitative foundations; Individual Minor approval is needed.'},tradeoffs:['Mathematics needs an approved final elective.']};
const request=sanitizeRequest({...input,profile:{name:'Private name',gpa:2.1,choices:{privateNote:'Do not send this'}}});
assert.ok(!JSON.stringify(request).includes('Private name'));assert.ok(!JSON.stringify(request).includes('Do not send this'));assert.ok(!('gpa' in request.profile));
assert.throws(()=>validateDirection({...direction,academic:{...direction.academic,program:'INVENTED'}},request));
assert.throws(()=>validateDirection({...direction,themes:[{}]},request));
const p=normalizeProfile({program:'BSCSC',track:'SE'}),tier=(t,i,n)=>({id:t.id,tier:i<n-2?'reach':i===n-2?'target':'safety',reason:'Academic fit for the example goals.',tierReason:'A research strategy, not an acceptance estimate.'});
const targets=Object.fromEntries(['internships','exchanges'].map(type=>{const ts=availableTargets(type,p).slice(0,5);return [type,ts.map((t,i)=>tier(t,i,ts.length))];}));
const detailRequest=sanitizeRequest({...input,stage:'details',profile:p});
assert.throws(()=>validateDetails({summary:'Invalid elective',choices:[{requirementId:'bscsc-free-1',courseCode:'FIN4308',reason:'Missing prerequisite'}],...targets},detailRequest),/prerequisites/);
assert.throws(()=>validateDetails({summary:'Duplicate destinations',choices:[],...targets,exchanges:targets.exchanges.map(()=>targets.exchanges[0])},detailRequest));
const details=validateDetails({summary:'Study mathematics and secure software.',choices:[{requirementId:'bscsc-free-1',courseCode:'MTH2304',reason:'Model dynamic systems.'}],...targets},detailRequest);
assert.equal(details.choices['bscsc-free-1'],'MTH2304');assert.equal(details.exchanges.filter(t=>t.tier==='reach').length,3);
const lockedRequest=sanitizeRequest({...input,stage:'details',profile:{...p,choices:{'bscsc-free-1':'CSC3309'}}});
assert.throws(()=>validateDetails({summary:'Do not overwrite the student edit',choices:[{requirementId:'bscsc-free-1',courseCode:'CSC3331',reason:'Another option'}],...targets},lockedRequest),/Preserve the current selected course/);
for(const program of DATA.programs){const profile=normalizeProfile({program:program.id}),lists=Object.fromEntries(['internships','exchanges'].map(type=>{const ts=availableTargets(type,profile).slice(0,5);return [type,ts.map((t,i)=>tier(t,i,ts.length))];}));validateDetails({summary:'Evidence-bounded research targets.',choices:[],...lists},sanitizeRequest({...input,level:program.level,stage:'details',profile}));if(program.level==='undergraduate')for(const ts of Object.values(lists))assert.equal(ts.length,5);}
let calls=0;
const provider=async(url,init)=>{calls++;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer fixture-secret');const payload=JSON.parse(init.body);assert.equal(payload.store,undefined);assert.equal(payload.response_format.json_schema.strict,true);assert.ok(!init.body.includes('fixture-secret'));return groqFixture({status:'completed',model:'fixture-provider',output:[{content:[{type:'output_text',text:JSON.stringify(direction)}]}]});};
const env={GROQ_WEB_RESEARCH:'off',GROQ_API_KEY:'fixture-secret',AI_ACCESS_CODE:'fixture-access'};
assert.equal(needsPersonalConfirmation({id:'bscsc-specialization-option',title:'Natural Language Processing and Text Mining'}),false);
assert.equal(needsPersonalConfirmation({id:'bscsc-specialization-option',title:'Languages and Compilers'}),false);
assert.equal(needsPersonalConfirmation({id:'minor-replacement-1',title:'Approved minor replacement'}),false);
assert.equal(needsPersonalConfirmation({id:'minor-course-1',code:'PSY3397',title:'Language Acquisition'}),false);
assert.equal(needsPersonalConfirmation({id:'free-elective-1',code:'ARB1241',title:'Arabic Literature'}),false);
assert.equal(needsPersonalConfirmation({id:'bscsc-french',title:'FRN3210'}),true);
await advise({...input,stage:'details',profile:{program:'BSCSC',track:'AI',secondTrack:'SE',minor:'mathematics'}},env,async(url,init)=>{
 const context=JSON.parse(JSON.parse(init.body).messages.at(-1).content),fixed=new Set(context.requiredCourses.map(c=>c.code));
 for(const r of context.requirements){if(r.approvalOnly||r.placementDependent)assert.deepEqual(r.options,[]);for(const id of r.options){assert.ok(!DATA.courses[id]?.creditsProvisional,id);assert.ok(!fixed.has(id),'Do not offer required course twice: '+id);}}
 assert.ok(!context.catalog.some(c=>['BIO1402','CSC3357','CSC3359'].includes(c.code)));
 return groqFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Reviewed options',choices:[],...targets})}]}]});
});
await assert.rejects(()=>advise(input,env,async()=>groqFixture({error:{type:'insufficient_quota',code:'credit_balance_exhausted'}},{status:429})),e=>e.status===503&&e.message.includes('service budget'));
await assert.rejects(()=>advise(input,env,async()=>groqFixture({error:{type:'rate_limit_exceeded'}},{status:429})),e=>e.status===502&&e.message.includes('busy'));
const req=(body=input,headers={})=>new Request('http://127.0.0.1:4317/api/advice',{method:'POST',headers:{'Content-Type':'application/json','X-GoPlan-Access':'fixture-access',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
assert.equal((await handleApi(req(),{})).status,503);
assert.equal((await handleApi(req(input,{'X-GoPlan-Access':'wrong'}),env)).status,401);
assert.equal((await handleApi(req(input,{Origin:'https://unrelated.example'}),env)).status,403);
assert.equal((await handleApi(req('x'.repeat(40001)),env)).status,413);
assert.equal((await handleApi(req('{bad'),env)).status,400);
const results=await Promise.all(Array.from({length:14},()=>handleApi(req(),env,{clientAddress:'concurrency-fixture',fetcher:provider})));
assert.equal(calls,1);assert.ok(results.every(r=>r.status===200));
assert.equal((await handleApi(req(),env,{clientAddress:'concurrency-fixture',fetcher:provider})).status,200);assert.equal(calls,1);
// Twenty distinct sequential recommendations must not share an hourly allowance.
for(let i=0;i<20;i++)assert.equal((await handleApi(req({...input,goal:input.goal+' Scenario '+i}),env,{clientAddress:'concurrency-fixture',fetcher:provider})).status,200);
assert.equal(calls,21);
// Session isolation, bounded simultaneous work, and slot release on failure.
let release;const gate=new Promise(resolve=>release=resolve);let started=0;
const slow=async(...args)=>{started++;await gate;return provider(...args);};
const opts={clientAddress:'busy-fixture',fetcher:slow};
const jobs=[0,1].map(i=>handleApi(req({...input,goal:input.goal+' Busy '+i}),env,opts));
while(started<2)await new Promise(resolve=>setTimeout(resolve,1));
const busy=await handleApi(req({...input,goal:input.goal+' Busy 2'}),env,opts);
assert.equal(busy.status,429);assert.equal((await busy.json()).code,'AGENT_BUSY');
assert.equal((await handleApi(req(input,{'X-GoPlan-Session':'independent-session-1234'}),env,{...opts,fetcher:provider})).status,200);
release();assert.ok((await Promise.all(jobs)).every(r=>r.status===200));
assert.equal((await handleApi(req({...input,goal:input.goal+' Busy 2'}),env,{...opts,fetcher:provider})).status,200);
let transportCalls=0,delays=[];
const transport=()=>fetchGroq('fixture',{},async()=>++transportCalls<3?groqFixture({error:{code:'rate_limit_exceeded'}},{status:429}):groqFixture({ok:true}),{pause:async ms=>delays.push(ms),random:()=>0});
assert.equal((await transport()).status,200);assert.equal(transportCalls,3);assert.deepEqual(delays,[2000,4000]);
transportCalls=0;
await fetchGroq('fixture',{},async()=>{transportCalls++;return groqFixture({error:{code:'insufficient_quota'}},{status:429});},{pause:async()=>assert.fail('Never retry exhausted credit')});assert.equal(transportCalls,1);
const failOpts={clientAddress:'failed-fixture',fetcher:async()=>{throw Error('fixture failure');}};
for(let i=0;i<3;i++)assert.equal((await handleApi(req(),env,failOpts)).status,422);
assert.equal((await handleApi(req(),env,{...failOpts,fetcher:provider})).status,200);
let attempts=0;await advise(input,env,async()=>{attempts++;return groqFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(attempts===1?{...direction,academic:{...direction.academic,program:'FAKE'}}:direction)}]}]});});assert.equal(attempts,2);
const state=emptyWorkspace();state.journey.advice=direction;state.journey.goal=input.goal;state.journey.details={...details,summary:'Specific test recommendations'};
for(let step=0;step<6;step++){state.journey.step=step;assert.ok(journeyView(state).includes('journey'));}
assert.ok(!journeyView({...state,journey:{...state.journey,step:4}}).includes('data-target='));
state.journey.advice.themes={};assert.throws(()=>validateSavedWorkspace(state));
console.log('Passed AI input privacy, schema, academic validation, 15-program evidence coverage, API authorization, request deduplication, independent sessions, 20 sequential requests, concurrency limits, bounded retry, six-screen rendering and malformed backup checks. Model responses were fixtures; no live AI call was made.');

// Browser transport: busy replies retry automatically without changing the draft.
const savedFetch=globalThis.fetch,savedTimer=globalThis.setTimeout;
let clientCalls=0,clientBodies=[],clientSessions=[];
try{
 globalThis.setTimeout=fn=>{fn();return 0;};
 globalThis.fetch=async(url,init)=>{clientCalls++;clientBodies.push(init.body);clientSessions.push(init.headers['X-GoPlan-Session']);return clientCalls<3?groqFixture({code:'AGENT_BUSY',retryAfterSeconds:2},{status:429}):groqFixture({summary:'Ready'});};
 setAccessCode('fixture');const journey={profile:{program:'BSCSC',choices:{}},goal:'Build useful software'},before=JSON.stringify(journey);
 assert.equal((await requestAdvice('pace',journey)).summary,'Ready');assert.equal(clientCalls,3);assert.equal(new Set(clientBodies).size,1);assert.equal(new Set(clientSessions).size,1);assert.equal(JSON.stringify(journey),before);
 clientCalls=0;globalThis.fetch=async()=>{clientCalls++;return groqFixture({error:'Credit unavailable'},{status:503});};
 await assert.rejects(()=>requestAdvice('pace',journey),/Credit unavailable/);assert.equal(clientCalls,1);
}finally{globalThis.fetch=savedFetch;globalThis.setTimeout=savedTimer;setAccessCode('');}
console.log('Passed client automatic busy retry, stable session/request, draft preservation and no billing retry.');

// A rejected code must reopen entry, retain the questionnaire, and permit recovery.
const authFetch=globalThis.fetch,authStorage=globalThis.sessionStorage;
const stored=new Map();globalThis.sessionStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
try{
 const journey={profile:{program:'BSCSC',choices:{}},questionnaire:{ambitions:'Build useful technology.'}},before=JSON.stringify(journey);
 setAccessCode('wrong');globalThis.fetch=async()=>groqFixture({code:'ACCESS_REQUIRED'},{status:401});
 await assert.rejects(()=>requestAdvice('direction',journey),e=>e.code==='ACCESS_REQUIRED');assert.equal(hasAccessCode(),false);assert.equal(JSON.stringify(journey),before);
 const workspace=emptyWorkspace();workspace.journey.step=1;
 assert.ok(journeyView(workspace,{hasAccess:hasAccessCode(),aiStatus:{available:true},aiError:'Code rejected'}).includes('id="ai-access-code"'));
 setAccessCode('valid-fixture');assert.equal(stored.has('goplan-verified-demo-access'),false);
 globalThis.fetch=async()=>groqFixture({summary:'Accepted'});await requestAdvice('direction',journey);
 assert.equal(stored.get('goplan-verified-demo-access'),'valid-fixture');
 const reloaded=await import('./dist/ai-client.js?auth-reload-test');assert.equal(reloaded.hasAccessCode(),true);
 globalThis.fetch=async()=>groqFixture({code:'ACCESS_REQUIRED'},{status:401});await assert.rejects(()=>reloaded.requestAdvice('direction',journey));assert.equal(reloaded.hasAccessCode(),false);assert.equal(stored.has('goplan-verified-demo-access'),false);
}finally{setAccessCode('');globalThis.fetch=authFetch;if(authStorage===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=authStorage;}
console.log('Passed rejected-code recovery, visible entry at step two, preserved questionnaire, verified-only session storage and expired-code invalidation.');
