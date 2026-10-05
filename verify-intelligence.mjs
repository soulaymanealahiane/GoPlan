import {groqFixture} from './tests/groq-fixture.mjs';
import assert from 'node:assert/strict';
import {advise,availableTargets} from './server/advisor.mjs';
import {extractResearch,searchEvidence,publicUrl,researchFor} from './server/research.mjs';
import {agentContext,feedbackFor} from './dist/agent-context.js';
import {acceptAdvice,adviceFingerprint} from './dist/journey-state.js';
import {newJourney,emptyWorkspace,validateSavedWorkspace,makePlan} from './dist/guidance.js';
import {journeyView,planView} from './dist/views.js';
const env={GROQ_API_KEY:'fixture',GROQ_WEB_RESEARCH:'off'};
const j=newJourney();j.profile.track='AI';j.questionnaire={ambitions:'Build useful software for Moroccan merchants.',activities:'Develop products and investigate data.',strengths:'Mathematics and programming.'};
j.refinements={targets:'Add startups, keep exchange institutions.'};j.agentChoices={'bscsc-free-1':'MTH2304'};j.profile.choices={'bscsc-free-1':'MTH2304','bscsc-free-2':'CSC3331'};
assert.equal(feedbackFor(j,'direction'),'');assert.equal(agentContext(j,'targets').refinement,j.refinements.targets);assert.deepEqual(agentContext(j,'courses').replaceableChoices,['bscsc-free-1']);
const directionStamp=adviceFingerprint('direction',j);j.refinements.targets='Do not select startups.';assert.equal(adviceFingerprint('direction',j),directionStamp);j.refinements.targets='Add startups, keep exchange institutions.';
const primary='https://examplecompany.ma/about';
const candidate={name:'Example Company',organizationType:'startup',officialUrl:primary,sourceUrl:primary,sourceKind:'company',moroccoEvidence:'Based in Casablanca.',activity:'Logistics software.',fit:'Product engineering.'};
const payload=data=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]});
const receipt=url=>({choices:[{finish_reason:'stop',message:{content:'An unsupported model link: https://invented.ma',executed_tools:[{name:'browser.search',type:'function',output:'Source: '+url+'\nBased in Casablanca. Logistics software.'}]}}]});
const evidence=searchEvidence(receipt(primary));assert.ok(!evidence.urls.includes('https://invented.ma'));
assert.throws(()=>searchEvidence({choices:[{message:{content:primary,executed_tools:[]}}]}),/search/);
let researched=extractResearch(payload({summary:'Untrusted summary must not leak rejected entities.',companies:[candidate,{...candidate,name:'Invented',sourceUrl:'https://invented.ma'}],facts:[]}),j.profile.program,evidence);
assert.equal(researched.companies.length,1);assert.ok(!researched.summary.includes('Untrusted'));
const accelerator='https://www.startgate.ma/startups';
const acceleratorPayload=payload({companies:[{...candidate,name:'HappyTaux',sourceKind:'accelerator',officialUrl:accelerator,sourceUrl:accelerator}],facts:[]});
const supported=extractResearch(acceleratorPayload,'BSCSC',searchEvidence(receipt(accelerator)));assert.equal(supported.companies[0].officialUrl,undefined);assert.equal(supported.companies[0].sourceUrl,accelerator);assert.equal(supported.companies[0].id,'research-happytaux');
assert.throws(()=>extractResearch(payload({companies:[],facts:[]}), 'BSCSC',evidence),/primary sources/);
assert.equal(publicUrl('https://127.0.0.1/private'),'');assert.equal(publicUrl('javascript:alert(1)'),'');assert.equal(publicUrl('https://key:secret@example.com'),'');
assert.throws(()=>extractResearch({output:[]},'BSCSC'),/search/);
const failed=await researchFor({profile:j.profile,questionnaire:j.questionnaire,refinement:''},'targets',{...env,GROQ_WEB_RESEARCH:'on'},async()=>groqFixture({error:{}},{status:503}));assert.equal(failed.status,'unavailable');
let privacyChecked=0;const researchResult=await researchFor({profile:{...j.profile,name:'PRIVATE NAME',gpa:3.8},questionnaire:{...j.questionnaire,constraints:'PRIVATE HEALTH NOTE',ambitions:'Email me at student@example.org about fintech.'},refinement:''},'targets',{...env,GROQ_WEB_RESEARCH:'on'},async(url,init)=>{privacyChecked++;assert.ok(url.startsWith('https://api.groq.com/'));assert.ok(!init.body.includes('PRIVATE NAME'));assert.ok(!init.body.includes('PRIVATE HEALTH NOTE'));assert.ok(!init.body.includes('student@example.org'));const body=JSON.parse(init.body);if(privacyChecked===1){assert.deepEqual(body.tools,[{type:'browser_search'}]);assert.equal(body.response_format,undefined);return groqFixture(receipt(primary));}assert.equal(body.tools,undefined);assert.equal(body.response_format.json_schema.strict,true);return groqFixture(payload({summary:'Sourced',companies:[candidate],facts:[]}));});assert.equal(privacyChecked,2);assert.equal(researchResult.status,'live');
const earlier=Object.fromEntries(['internships','exchanges'].map(type=>[type,availableTargets(type,j.profile).slice(0,5)]));j.details={summary:'Existing choices',...earlier};
const response=data=>groqFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(data)}]}]});
const item=(t,i)=>({id:t.id,tier:i<3?'reach':i===3?'target':'safety',reason:'Relates to the stated product ambition.',tierReason:'A search strategy only.',industryReason:'A qualified inference from the digital economy evidence.',answerIds:['ambitions'],evidenceIds:['ita-digital-morocco-2025']});
let attempts=0;const result=await advise({...j,...agentContext(j,'targets'),stage:'targets'},env,async(_,init)=>{
 attempts++;const p=JSON.parse(init.body),c=JSON.parse(p.messages.at(-1).content);assert.equal(p.reasoning_effort,'medium');assert.equal(c.currentRecommendation.internships.length,5);assert.equal(c.request.refinement,'Add startups, keep exchange institutions.');
 const companies=attempts===1?earlier.internships:[...c.companies.filter(t=>['chari','freterium','yakeey'].includes(t.id)),...earlier.internships.slice(0,2)];
 if(attempts===2)assert.match(c.repair.reason,/No destinations changed/);
 return response({summary:'Startup options with unchanged exchanges.',internships:companies.map(item),exchanges:earlier.exchanges.map(item),update:{summary:'Added startup exposure.',changes:['Included startups'],limitations:[]}});
});
assert.equal(attempts,2);assert.equal(result.update.added.length,3);assert.equal(result.update.removed.length,3);assert.equal(result.exchanges[0].id,earlier.exchanges[0].id);
const savedPlan=makePlan(j),savedBefore=JSON.stringify(savedPlan),previewJourney=newJourney(savedPlan);acceptAdvice(previewJourney,'targets',result);assert.equal(JSON.stringify(savedPlan),savedBefore,'A preview must not change the saved plan before acceptance.');
acceptAdvice(j,'targets',result);assert.equal(j.feedbackHistory.targets.length,1);assert.ok(agentContext(j,'targets').feedbackHistory[0].request.includes('startups'));
const restored=validateSavedWorkspace({...emptyWorkspace(),journey:j});assert.equal(restored.journey.feedbackHistory.targets.length,1);
j.step=4;const html=journeyView({journey:j});assert.ok(html.includes('How your feedback changed the plan'));assert.ok(html.includes('Chari'));assert.ok(html.includes('data-feedback="targets"'));
assert.ok(planView(makePlan(j),false).includes('data-action="agent-targets"'));
// A revised course suggestion must be unlocked, while the manual selection remains locked.
j.refinements.courses='Change the AI mathematics elective, retain the other selected course.';
await advise({...j,...agentContext(j,'courses'),stage:'courses'},env,async(_,init)=>{
 const c=JSON.parse(JSON.parse(init.body).messages.at(-1).content);assert.equal(c.request.profile.choices['bscsc-free-1'],undefined);assert.equal(c.request.profile.choices['bscsc-free-2'],'CSC3331');assert.equal(c.currentRecommendation.choices['bscsc-free-1'],'MTH2304');
 return response({summary:'Retain selections until alternatives are confirmed.',choices:[],openItems:[],update:{summary:'No verified replacement chosen.',changes:[],limitations:['The remaining elective needs further comparison.']}});
});
console.log('Passed sourced discovery, rejected-source filtering, research privacy/failure handling, stage-specific feedback memory, actual target changes, no-op repair, backup roundtrip and editable AI vs locked manual courses.');

// Research recovery is bounded and never retries billing/access failures.
let semanticCalls=0;
const recovered=await researchFor({profile:j.profile,questionnaire:j.questionnaire},'targets',{...env,GROQ_WEB_RESEARCH:'on'},async()=>{
 semanticCalls++;
 if(semanticCalls===1)return groqFixture({error:{code:'tool_use_failed',message:'PRIVATE PROVIDER DETAIL'}},{status:400});
 if(semanticCalls===2)return groqFixture(receipt(primary));
 return groqFixture(payload({companies:[candidate],facts:[]}));
});
assert.equal(recovered.status,'live');assert.equal(semanticCalls,3);
let budgetCalls=0;
const budgetStopped=await researchFor({profile:j.profile,questionnaire:j.questionnaire},'direction',{...env,GROQ_WEB_RESEARCH:'on'},async()=>{budgetCalls++;return groqFixture({error:{code:'blocked_api_access',message:'PRIVATE PROVIDER DETAIL'}},{status:400});});
assert.equal(budgetCalls,1);assert.equal(budgetStopped.reasonCode,'budget');assert.ok(!JSON.stringify(budgetStopped).includes('PRIVATE PROVIDER DETAIL'));
const marketUrl='https://www.oecd.org/en/topics/policy-issues/future-of-work.html';
const marketFact={claim:'OECD discusses how AI changes skills and work.',sourceUrl:marketUrl,limitation:'International evidence; not a Moroccan hiring forecast.'};
assert.equal(extractResearch(payload({companies:[],facts:[marketFact]}),'BSCSC',searchEvidence(receipt(marketUrl))).facts.length,1);
let focusedCalls=0;
const focused=await researchFor({profile:j.profile,questionnaire:j.questionnaire},'direction',{...env,GROQ_WEB_RESEARCH:'on'},async(_,init)=>{
 focusedCalls++;
 if(focusedCalls===1)return groqFixture(receipt(primary));
 if(focusedCalls===2)return groqFixture(payload({companies:[candidate],facts:[]}));
 if(focusedCalls===3){assert.ok(JSON.parse(init.body).messages[0].content.includes('labour-market evidence'));return groqFixture(receipt(marketUrl));}
 return groqFixture(payload({companies:[],facts:[marketFact]}));
});
assert.equal(focused.status,'live');assert.equal(focusedCalls,4);assert.equal(focused.facts.length,1);
const {researchView}=await import('./dist/journey-view.js');
assert.ok(researchView(budgetStopped,'direction').includes('data-agent-stage="direction"'));
assert.ok(!researchView(budgetStopped).includes('data-agent-stage'));
// A research fallback is not cached; a subsequent successful search is cached.
const {handleApi}=await import('./server/api.mjs');
const apiEnv={...env,GROQ_WEB_RESEARCH:'on',AI_ACCESS_CODE:'research-fixture'};
const directionValue={kind:'recommend',summary:'A provisional software direction.',themes:['Software'],questions:[],academic:{program:'BSCSC',track:'SE',secondTrack:'',minor:'',rationale:'Fits the stated programming work.',focusRationale:'Software foundations.',secondFocusRationale:'Keep workload manageable.',minorRationale:'Leave open.'},tradeoffs:[],assessment:Object.keys((await import('./dist/evidence.js')).AXES).map(axis=>({axis,explanation:'A qualified inference from the supplied interests and evidence.',answerIds:['activities'],evidenceIds:[]})),update:{summary:'Recommended a direction.',changes:[],limitations:[]}};
const apiRequest=()=>new Request('https://planwithgoplan.com/api/advice',{method:'POST',headers:{Origin:'https://planwithgoplan.com','Content-Type':'application/json','X-GoPlan-Access':'research-fixture','X-GoPlan-Session':'research-cache-regression-20261005'},body:JSON.stringify({...newJourney(),stage:'direction',flowVersion:5,questionnaire:j.questionnaire})});
let apiCalls=0;
const apiFetch=async(_,init)=>{
 apiCalls++;const body=JSON.parse(init.body);
 if(body.tools)return apiCalls===1?groqFixture({error:{code:'denied'}},{status:403}):groqFixture(receipt(marketUrl));
 if(body.response_format.json_schema.name==='goplan_research')return groqFixture(payload({companies:[],facts:[marketFact]}));
 return groqFixture(payload(directionValue));
};
const fallback=await handleApi(apiRequest(),apiEnv,{fetcher:apiFetch});assert.equal(fallback.status,200);assert.equal((await fallback.json()).research.status,'unavailable');assert.equal(apiCalls,2);
const refreshed=await handleApi(apiRequest(),apiEnv,{fetcher:apiFetch});assert.equal(refreshed.status,200);assert.equal((await refreshed.json()).research.status,'live');assert.equal(apiCalls,5);
await handleApi(apiRequest(),apiEnv,{fetcher:apiFetch});assert.equal(apiCalls,5);
console.log('Passed research recovery, stage-specific market evidence, private diagnostics, visible retry and successful-only research caching.');
