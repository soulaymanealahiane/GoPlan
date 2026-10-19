// Real controller -> browser clients -> HTTP API -> durable D1 receipts ->
// structured provider responses -> cloud save/reload. All students and responses
// are synthetic; every network request is intercepted and no API key is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {localDatabase} from './server/local-db.mjs';
import {handleApi} from './server/api.mjs';
import {acquireAdviserLease} from './server/adviser-lease.mjs';
import {reserveServiceCall,serviceOwner} from './server/service-allowance.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {openaiFixture} from './tests/openai-fixture.mjs';
import {createDashboardController} from './dist/dashboard-controller.js';
import {dashboardView} from './dist/dashboard-view.js';
import {newcomerWorkspace} from './dist/dashboard-flow.js';
import {newJourney,suggestChoices,validateSavedWorkspace,planIssues} from './dist/guidance.js';
import {acceptAdvice} from './dist/journey-state.js';
import {requestAdvice,resetAdviserSession} from './dist/ai-client.js';
import {normalizeProfile} from './dist/planner.js';
import {AXES} from './dist/evidence.js';
import {createWorkbook} from './dist/export.js';

const BASE='https://planwithgoplan.com';
const originals={fetch:globalThis.fetch,FormData:globalThis.FormData};
const profiles=[
 {name:'Computer Systems and AI with BA minor',program:'BSCSC',track:'CSYS',secondTrack:'AI',minor:'business-administration',ambitions:'Build intelligent embedded software for Moroccan businesses.'},
 {name:'Engineering and management',program:'BSEMS',track:'MLE',secondTrack:'',minor:'',ambitions:'Design sustainable engineering systems and manage production.'},
 {name:'Business finance',program:'BBA',track:'FIN',secondTrack:'',minor:'computer-science',ambitions:'Analyze finance and build useful financial services.'}
];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const form=(id,values={},dataset={})=>({id,values,dataset,querySelector:()=>({textContent:'',disabled:false})});
const button=(action,extra={})=>({dataset:{action,...extra}});
const proof={groups:0,providerCalls:0,failures:[]};
async function group(name,fn){try{await fn();proof.groups++;console.log('PASS '+name);}catch(e){proof.failures.push({name,error:e});console.error('FAIL '+name+': '+e.message);}}

globalThis.FormData=class{constructor(f){this.f=f;}get(k){return this.f.values[k];}};

async function harness(profile){
 const DB=localDatabase(':memory:'),uid='resilience-'+crypto.randomUUID(),session=await testSession(DB,uid);
 const env={DB,OPENAI_API_KEY:'synthetic-'+uid,OPENAI_WEB_RESEARCH:'off',OPENAI_DIRECTION_RESEARCH:'off',GOPLAN_TOKEN_COUNTER:async()=>1000};
 let state=newcomerWorkspace({year:2026,degree:profile.program}),runtime={},revision=0,exported=0,paid=0;
 let failure='',failureStage='targets',dropAdvice='',dropAction=false,httpFault='',gate=null,started=null,modal='',directionProfile={...profile};
 const workspaceId=crypto.randomUUID(),calls=[],requests=[],replies=[];
 state.journey.questionnaire={...state.journey.questionnaire,ambitions:profile.ambitions,activities:'Build practical projects, compare options and solve problems.',strengths:'Mathematics, programming and problem solving.'};
 const wire=(path,init={})=>new Request(BASE+path,{...init,headers:{Origin:BASE,...session,...init.headers}});
 const scope=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([env.OPENAI_API_KEY,env.AI_ACCESS_CODE,env.OPENAI_MODEL,env.OPENAI_RESEARCH_MODEL,env.OPENAI_REASONING_EFFORT,env.OPENAI_RESEARCH_REASONING_EFFORT,env.OPENAI_WEB_RESEARCH,env.OPENAI_DIRECTION_RESEARCH,uid])))),b=>b.toString(16).padStart(2,'0')).join('');
 const api=async(path,init={})=>handleApi(wire(path,init),env,{fetcher:provider});
 const json=async(path,method,body)=>{const response=await api(path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();assert.ok(response.ok,path+': '+JSON.stringify(value));return value;};
 const provider=async(url,init)=>{
  assert.equal(url,'https://api.openai.com/v1/responses','An unexpected outbound request must never escape this test.');
  paid++;proof.providerCalls++;const body=JSON.parse(init.body),context=JSON.parse(body.input),stage=body.text.format.name.replace('goplan_','');
  calls.push({stage,context,body});
  if(gate){const wait=gate;gate=null;started?.resolve();await wait.promise;}
  if(stage===failureStage&&failure){
   if(failure==='hang')return new Promise(()=>{});
   if(failure==='transient'){failure='';return openaiFixture({error:{code:'server_error',message:'Synthetic temporary outage'}},{status:503});}
   if(failure==='incomplete')return openaiFixture({status:'incomplete',output:[],incomplete_details:{reason:'max_output_tokens'}});
   if(failure==='empty')return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:'{"summary":"","internships":[],"exchanges":[],"update":{"summary":"","changes":[],"limitations":[]}}'}]}]});
   if(failure==='malformed')return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:'{"internships":'}]}]});
   if(failure==='quota')return openaiFixture({error:{code:'insufficient_quota',message:'Synthetic exhausted provider credit'}},{status:429});
  }
  let result;
  if(stage==='direction')result={kind:'recommend',summary:'A direction matching your interests.',themes:['Practical learning'],questions:[],tradeoffs:[],academic:{program:directionProfile.program,track:directionProfile.track,secondTrack:directionProfile.secondTrack,minor:directionProfile.minor,rationale:'Matches your goals.',focusRationale:'Build useful skills.',secondFocusRationale:'Explore intelligent systems.',minorRationale:'Connect complementary skills.'},assessment:Object.keys(AXES).map(axis=>({axis,explanation:'Relevant to the stated goal; source limitations remain.',answerIds:['ambitions'],evidenceIds:[]}))};
  if(stage==='courses'){
   const j=newJourney();j.profile=normalizeProfile(context.request.profile);j.questionnaire=context.request.questionnaire;
   const suggested=suggestChoices(j).profile.choices,allowed=new Set(body.text.format.schema.properties.choices.items.properties?.requirementId?.enum||[]);
   result={summary:'Your course choices.',choices:Object.entries(suggested).filter(([id])=>allowed.has(id)).map(([requirementId,courseCode])=>({requirementId,courseCode,reason:'Fits this degree requirement.'})),openItems:[]};
  }
  if(stage==='targets'){
   const make=(records,type)=>{
    const prop=body.text.format.schema.properties[type],prior=context.currentRecommendation[type]||[];
    const list=context.opportunityPolicy.preserveTypes.includes(type)?prior:records.slice(0,Math.min(5,records.length));
    const item=(t,i)=>({id:t.id,reason:'Matches your practical interests.',tierReason:'A useful route to explore.',industryReason:'Related to your learning goals.',answerIds:['ambitions'],evidenceIds:[]});
    if(prop.type==='array')return list.map((t,i)=>({...item(t,i),tier:i<list.length-2?'reach':i===list.length-2?'target':'safety'}));
    return {reach:list.slice(0,Math.max(0,list.length-2)).map(item),target:list.length>=2?[item(list.at(-2))]:[],safety:list.length?[item(list.at(-1))]:[]};
   };
   result={summary:'Explore these targets.',internships:make(context.companies,'internships'),exchanges:make(context.exchangeDestinations,'exchanges')};
  }
  if(stage==='pace')result={summary:'A balanced semester map.',pace:'balanced',regularCourses:5,summerCourses:2,summers:!context.request.refinement?.includes('no summer'),reason:'Keep a manageable study load.',actions:[]};
  if(stage==='change')result={kind:'journey',startStep:/companies|exchange|internship/i.test(context.request.changeRequest)?4:/focus|specialization|minor/i.test(context.request.changeRequest)?2:5,summary:'Update the requested part.',questions:[]};
  assert.ok(result,'Missing synthetic response for '+stage);
  result.update={summary:'Your requested choices are ready.',changes:[],limitations:context.request.refinement?['The existing choices already fit the stated degree and constraints.']:[]};
  if(context.request.refinement){result.intent='update';result.answer='';}
  return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
 };
 const saveCloud=async()=>{const value=await json('/api/account/workspaces/'+workspaceId,'PUT',{revision,state});revision=value.revision;return true;};
 const getAdvice=async(stage,{serviceAction}={})=>{
  runtime.busy=true;
  try{const result=await requestAdvice(stage,state.journey,{serviceAction});acceptAdvice(state.journey,stage,result);return result.kind!=='clarify';}
  catch(e){runtime.aiError=e.message;runtime.aiFailure={code:e.code,retryable:e.retryable!==false};return false;}
  finally{runtime.busy=false;}
 };
 const hooks={runtime,read:()=>state,account:()=>({firstName:'Synthetic'}),render(){},persist(){},changed(){},notify(){},modal:value=>{modal=value;},head:()=>'',close(){modal='';},getAdvice,startWorkspace:async next=>{state=next;},showPlan(){},saveAccount:saveCloud,exportPlan:async()=>{
  const p=state.phase==='draft'?state.draftPlan:state.plan,styles=fs.readFileSync(new URL('./dist/template-styles.xml',import.meta.url),'utf8');
  const bytes=await createWorkbook(p.terms,p.courses,p.profile,[],planIssues(p),styles,p);assert.ok(bytes.byteLength>1000);exported++;return bytes;
 }};
 let controller=createDashboardController(hooks);
 globalThis.fetch=async(path,init={})=>{
  assert.ok(String(path).startsWith('/api/'),'No real network access is allowed.');const data=init.body?JSON.parse(init.body):{};requests.push({path,data});
  if(path==='/api/advice'&&data.stage==='targets'&&httpFault){
   const mode=httpFault;httpFault='';
   if(mode==='unauthorized')return Response.json({error:'Sign in again.',code:'SIGN_IN_REQUIRED'},{status:401});
   await acquireAdviserLease(DB,scope,{owner:await serviceOwner(uid),actionId:data.serviceAction});
   await reserveServiceCall(DB,uid,data.serviceAction,'targets','abandoned-previous-deployment');
   if(mode==='disconnect')throw TypeError('Synthetic interrupted gateway connection.');
   if(mode==='timeout')throw new DOMException('Synthetic request timeout','TimeoutError');
   return new Response(mode==='empty'?'':'<html>Gateway unavailable</html>',{status:mode==='empty'?200:502,headers:{'Content-Type':'text/html'}});
  }
  const response=await api(path,init);
  if(path==='/api/advice')replies.push({stage:data.stage,status:response.status,body:await response.clone().json()});
  if(path==='/api/advice'&&data.stage===dropAdvice&&response.ok){dropAdvice='';throw TypeError('Synthetic response lost after durable completion.');}
  if(path==='/api/service/action'&&dropAction){dropAction=false;throw TypeError('Synthetic reservation response lost.');}
  return response;
 };
 await json('/api/account/profile','POST',{firstName:'Synthetic',lastName:'Student',consentCloud:true});await controller.loadService();
 return {DB,uid,api,json,calls,requests,replies,apiWithoutAI:(path,init={})=>handleApi(wire(path,init),{DB},{fetcher:()=>assert.fail('Reviewed recovery must never contact a provider.')}),get state(){return state;},get runtime(){return runtime;},get controller(){return controller;},get paid(){return paid;},get exported(){return exported;},get modal(){return modal;},
  oldLease:()=>acquireAdviserLease(DB,scope),
  httpFault:mode=>{httpFault=mode;},
  fail:(value,stage='targets')=>{failure=value;failureStage=stage;},direction:changes=>{directionProfile={...directionProfile,...changes};},drop:stage=>{dropAdvice=stage;},dropReservation:()=>{dropAction=true;},hold:()=>{gate=deferred();started=deferred();return {started:started.promise,release:gate.resolve};},
  save:saveCloud,reload:async()=>{const saved=await json('/api/account/workspaces/'+workspaceId,'GET');state=validateSavedWorkspace(saved.state);revision=saved.revision;runtime={};hooks.runtime=runtime;controller=createDashboardController(hooks);resetAdviserSession();await controller.loadService();},
  async close(){DB.close();resetAdviserSession();}
 };
}

async function checkTargets(h,type){
 const selected=h.state.journey.details?.[type]||[];
 assert.ok(selected.length>0,type+' must not become an empty dead end. '+(h.runtime.aiError||''));
 assert.equal(new Set(selected.map(t=>t.id)).size,selected.length);assert.ok(selected.every(t=>t.sourceUrl||t.sources?.length||t.officialUrl));
}
async function stageStart(h){await h.controller.click(button('dashboard-stage-generate'));assert.equal(h.runtime.aiError,'','Stage generation failed: '+h.runtime.aiError);}
async function advance(h){const before=h.runtime.service.step;await h.controller.click(button('dashboard-stage-next'));assert.equal(h.runtime.aiError,'','Stage '+before+' advancement failed: '+h.runtime.aiError);assert.equal(h.runtime.service.step,before+1);}
async function finish(h){while(h.runtime.service.step<5)await advance(h);assert.equal(h.state.phase,'draft');await h.controller.click(button('dashboard-save'));assert.equal(h.state.phase,'saved');assert.equal(h.runtime.service.saved,true);}

try{
 for(const profile of profiles)await group(profile.name+': all five stages, all allowances, cloud reload, manual-only repository',async()=>{
  const h=await harness(profile);try{
   await stageStart(h);assert.equal(h.state.journey.profile.program,profile.program);assert.equal(h.state.journey.profile.secondTrack,profile.secondTrack);
   if(profile.secondTrack){const html=dashboardView(h.state,h.runtime);assert.ok(html.includes('Computer Systems'));assert.ok(html.includes('Artificial Intelligence'),'Direction heading must include the second specialization.');}
   for(let step=0;step<5;step++){
    assert.equal(h.runtime.service.step,step);
    for(let i=0;i<2;i++){await h.controller.submit(form('dashboard-command-form',{request:'Keep the same degree and refine my preferences '+step+' '+i}));assert.equal(h.runtime.aiError,'','Guided change failed: '+h.runtime.aiError);}
    assert.equal(h.runtime.service.stageChanges[step],0);
    const count=h.paid;await h.controller.submit(form('dashboard-command-form',{request:'A third stage change must not run.'}));assert.equal(h.paid,count);
    if(step===2)await checkTargets(h,'internships');if(step===3){await checkTargets(h,'exchanges');await h.save();await h.reload();assert.equal(h.runtime.service.step,3);assert.equal(h.state.journey.profile.secondTrack,profile.secondTrack);}
    await advance(h);
   }
   await h.controller.click(button('dashboard-save'));assert.equal(h.runtime.service.globalRemaining,5);
   for(let i=0;i<5;i++){await h.controller.submit(form('dashboard-command-form',{request:'Keep the degree and use no summer classes '+i}));assert.equal(h.runtime.aiError,'','Global request failed: '+h.runtime.aiError);assert.equal(h.runtime.service.globalRemaining,4-i);await h.controller.click(button('dashboard-save'));}
   await h.reload();assert.equal(h.runtime.service.globalRemaining,0);assert.deepEqual(h.runtime.service.stageChanges,[0,0,0,0,0]);
   const before=h.paid,p=h.state.plan,c=p.courses.find(c=>c.code&&!c.unresolved),term=p.terms.find(t=>t.courses.includes(c.id));
   await h.controller.submit(form('dashboard-course-form',{course:c.code,term:term.id,status:'completed'},{courseId:c.id}));
   const changed=h.state.phase==='draft'?h.state.draftPlan:h.state.plan;assert.equal(changed.tracking[c.id].status,'completed');
   await h.controller.submit(form('dashboard-language-center-form',{lc:'1'}));assert.equal(h.state.draftPlan.profile.lc,1);
   const year=Math.max(...h.state.draftPlan.terms.map(t=>Number(t.year)||2026))+1;
   await h.controller.submit(form('dashboard-add-term-form',{season:'Fall',year:String(year)}));assert.ok(h.state.draftPlan.terms.some(t=>t.id==='Fall-'+year&&t.courses.length===0));
   await h.controller.click(button('dashboard-save'));await h.controller.click(button('dashboard-export'));assert.equal(h.exported,1);assert.equal(h.paid,before,'Manual work and Excel export cannot invoke a provider.');
   await h.reload();assert.equal(h.state.plan.tracking[c.id].status,'completed');assert.equal(h.state.plan.profile.secondTrack,profile.secondTrack);assert.ok(h.state.plan.terms.some(t=>t.id==='Fall-'+year),'The manually added semester must survive cloud save/reload.');
   for(const dashboardPanel of ['overview','direction','courses','opportunities','semesters']){const html=dashboardView(h.state,{...h.runtime,dashboardPanel});assert.ok(!html.includes('id="dashboard-request"'));assert.ok(!html.includes('dashboard-unavailable'));assert.ok(!html.includes('Start over'));}
   const saved=JSON.stringify(h.state);await h.controller.click(button('dashboard-confirm-restart'));assert.equal(JSON.stringify(h.state),saved);
  }finally{await h.close();}
 });

 for(const failure of ['malformed','empty','incomplete','quota'])await group('Companies and Exchanges recover from '+failure+' provider responses without a roadmap halt',async()=>{
  const h=await harness(profiles[1]);try{
   await stageStart(h);await advance(h);h.fail(failure);await advance(h);await checkTargets(h,'internships');
   assert.equal(h.runtime.service.stageChanges[2],2,'Initial recovery cannot consume a guided change.');
   const recovered=h.replies.filter(r=>r.stage==='targets').at(-1);assert.equal(recovered.status,200);assert.equal(recovered.body.source,'reviewed');assert.equal(recovered.body.recovery,'reviewed-opportunity-shortlist','A local reviewed fallback must retain its honest provenance.');
   assert.ok(h.paid<=7,'Initial recovery must stay bounded rather than repeatedly buying model attempts.');
   const ids=h.state.journey.details.internships.map(t=>t.id);await advance(h);await checkTargets(h,'exchanges');assert.deepEqual(h.state.journey.details.internships.map(t=>t.id),ids,'Exchanges cannot erase companies.');
   assert.equal(h.runtime.service.stageChanges[3],2);await finish(h);assert.equal(h.runtime.service.globalRemaining,5);
  }finally{await h.close();}
 });

 for(const [stage,step,failure]of [['courses',1,'incomplete'],['pace',4,'quota']])await group('Initial '+stage+' recovers from '+failure+' without losing completed work or charging a guided change',async()=>{
  const h=await harness(profiles[0]);try{
   await stageStart(h);while(h.runtime.service.step<step-1)await advance(h);
   const academic=JSON.stringify([h.state.journey.profile.program,h.state.journey.profile.track,h.state.journey.profile.secondTrack,h.state.journey.profile.minor]);
   h.fail(failure,stage);await advance(h);assert.equal(h.runtime.service.step,step);assert.equal(h.runtime.service.stageChanges[step],2);
   assert.equal(JSON.stringify([h.state.journey.profile.program,h.state.journey.profile.track,h.state.journey.profile.secondTrack,h.state.journey.profile.minor]),academic);
   assert.ok(h.state.journey.details?.choices,'Reviewed course choices must remain usable.');if(stage==='pace')assert.ok(h.state.draftPlan?.terms.length);
   h.fail('');await finish(h);assert.equal(h.state.phase,'saved');assert.equal(h.runtime.service.globalRemaining,5);assert.deepEqual(h.runtime.service.stageChanges,[2,2,2,2,2]);
  }finally{await h.close();}
 });

 await group('The API rejects a different paid stage under a Companies action before provider work',async()=>{
  const h=await harness(profiles[2]);try{
   await stageStart(h);await advance(h);await advance(h);
   const action=h.requests.filter(r=>r.path==='/api/service/action').at(-1).data.id,before=h.paid;
   const response=await h.api('/api/advice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stage:'pace',flowVersion:5,profile:h.state.journey.profile,questionnaire:h.state.journey.questionnaire,serviceAction:action})});
   assert.equal(response.status,403);assert.equal(h.paid,before);assert.equal(h.runtime.service.stageChanges[2],2);
   const denied=await handleApi(new Request(BASE+'/api/service'),{DB:h.DB});assert.equal(denied.status,401);
   await finish(h);
  }finally{await h.close();}
 });

 await group('Reviewed opportunities require authentication, no provider configuration and no paid action',async()=>{
  const h=await harness(profiles[0]);try{
   const input={profile:{program:'BSCSC',track:'CSYS',secondTrack:'AI',minor:'business-administration',choices:{}},questionnaire:h.state.journey.questionnaire};
   const init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)};
   const before=JSON.stringify(h.runtime.service),response=await h.apiWithoutAI('/api/reviewed-targets',init);assert.equal(response.status,200);const result=await response.json();assert.equal(result.source,'reviewed');assert.equal(result.internships.length,5);assert.equal(result.exchanges.length,5);assert.equal(h.paid,0);
   assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM service_actions').first()).n,0);
   await h.controller.loadService();assert.equal(JSON.stringify(h.runtime.service),before);
   const denied=await handleApi(new Request(BASE+'/api/reviewed-targets',{...init,headers:{...init.headers,Origin:BASE}}),{DB:h.DB});assert.equal(denied.status,401);
   const invalid=await h.apiWithoutAI('/api/reviewed-targets',{...init,body:JSON.stringify({...input,profile:{program:'FORGED'}})});assert.equal(invalid.status,400);assert.equal(h.paid,0);
  }finally{await h.close();}
 });

 await group('An already-used failed legacy Companies action recovers without another paid call or stage change',async()=>{
  const h=await harness(profiles[1]);try{
   await stageStart(h);await advance(h);await h.json('/api/service/advance','POST',{step:1});await h.controller.loadService();
   const action=await h.json('/api/service/action','POST',{id:crypto.randomUUID(),kind:'initial',step:2});
   const receipt=await reserveServiceCall(h.DB,h.uid,action.action,'targets','legacy-failed-request');await receipt.finish({error:'Synthetic old target failure',code:'INVALID_TARGET_RESPONSE',retryable:false},422);
   const before=h.paid;await stageStart(h);await checkTargets(h,'internships');assert.equal(h.paid,before);assert.equal(h.runtime.service.stageChanges[2],2);assert.equal(h.runtime.service.globalRemaining,5);
   assert.equal((await h.DB.prepare("SELECT COUNT(*) AS n FROM service_calls WHERE state='running'").first()).n,0);await finish(h);
  }finally{await h.close();}
 });


 for(const mode of ['html','empty','disconnect','timeout'])await group('Gateway '+mode+': abandoned initial Companies request recovers immediately, saves and completes all stages',async()=>{
  const h=await harness(profiles[0]);try{
   await stageStart(h);await advance(h);const paid=h.paid;h.httpFault(mode);await advance(h);
   await checkTargets(h,'internships');assert.equal(h.paid,paid,'Transport recovery must never reissue a paid request.');
   const marker=await h.DB.prepare("SELECT response FROM service_calls WHERE id LIKE '%:reviewed'").first();assert.equal(JSON.parse(marker.response).source,'reviewed');
   assert.equal((await h.DB.prepare("SELECT COUNT(*) AS n FROM service_calls WHERE state='running'").first()).n,0);
   assert.deepEqual(h.runtime.service.stageChanges,[2,2,2,2,2]);
   assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM adviser_leases').first()).n,0,'Recovery must retire only the abandoned initial action lease.');
   const chosen=structuredClone(h.state.journey.details.internships);await h.save();await h.reload();assert.deepEqual(h.state.journey.details.internships,chosen);
   // Retry with a different deployment hash must replay the settled result.
   const action=h.requests.filter(r=>r.path==='/api/service/action'&&r.data.step===2).at(-1).data.id;
   const replay=await reserveServiceCall(h.DB,h.uid,action,'targets','new-deployment-hash');assert.equal(replay.status,200);assert.deepEqual(replay.cached.internships,chosen);
   h.httpFault(mode);await advance(h);await checkTargets(h,'exchanges');assert.deepEqual(h.state.journey.details.internships,chosen);assert.equal(h.paid,paid);
   await finish(h);assert.equal(h.state.phase,'saved');assert.equal(h.runtime.service.globalRemaining,5);
  }finally{await h.close();}
 });

 await group('A killed Worker receipt from the previous deployment recovers without a provider retry, at unchanged allowance',async()=>{
  const h=await harness(profiles[1]);try{
   await stageStart(h);await advance(h);await h.json('/api/service/advance','POST',{step:1});await h.controller.loadService();
   const action=await h.json('/api/service/action','POST',{id:crypto.randomUUID(),kind:'initial',step:2});
   const receipt=await reserveServiceCall(h.DB,h.uid,action.action,'targets','old-worker-hash');
   await h.DB.prepare('UPDATE service_calls SET created_at=? WHERE id=?').bind(Date.now()-300000,receipt.id).run();
   const before=h.paid;await stageStart(h);await checkTargets(h,'internships');assert.equal(h.paid,before);
   const recovered=structuredClone(h.state.journey.details.internships);
   // A late completion from the abandoned Worker must not overwrite recovery.
   const late=await receipt.finish({source:'late',internships:[]},200);assert.equal(late.body.source,'reviewed');
   const replay=await reserveServiceCall(h.DB,h.uid,action.action,'targets','new-worker-hash');assert.deepEqual(replay.cached.internships,recovered);
   assert.equal((await h.DB.prepare("SELECT COUNT(*) AS n FROM service_calls WHERE state='running'").first()).n,0);
   await finish(h);
  }finally{await h.close();}
 });

 await group('Recovery during an in-flight response wins atomically and the late provider cannot replace it',async()=>{
  const h=await harness(profiles[0]);try{
   await stageStart(h);await advance(h);const held=h.hold(),pending=h.controller.click(button('dashboard-stage-next'));
   await held.started;const action=h.requests.filter(r=>r.path==='/api/service/action'&&r.data.step===2).at(-1).data.id;
   const response=await h.apiWithoutAI('/api/reviewed-targets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:h.state.journey.profile,questionnaire:h.state.journey.questionnaire,serviceAction:action})});
   assert.equal(response.status,200);const recovered=await response.json();assert.equal(recovered.source,'reviewed');
   held.release();await pending;assert.equal(h.runtime.aiError,'');assert.deepEqual(h.state.journey.details.internships,recovered.internships);
   assert.equal(h.runtime.service.stageChanges[2],2);await finish(h);
  }finally{await h.close();}
 });

 await group('A previous-version orphan lock cannot halt Companies, Exchanges or Semesters',async()=>{
  const h=await harness(profiles[1]);let orphan;
  try{
   await stageStart(h);await advance(h);orphan=await h.oldLease();assert.ok(orphan);const paid=h.paid;
   await advance(h);await checkTargets(h,'internships');await advance(h);await checkTargets(h,'exchanges');await advance(h);
   assert.ok(h.state.draftPlan?.terms.length);assert.equal(h.paid,paid);await finish(h);assert.equal(h.runtime.service.globalRemaining,5);
   assert.deepEqual(h.runtime.service.stageChanges,[2,2,2,2,2]);
  }finally{await orphan?.release();await h.close();}
 });

 await group('Initial target hard deadline bounds an unresponsive provider, releases the lease and continues the roadmap',async()=>{
  const h=await harness(profiles[2]),timer=globalThis.setTimeout;
  try{
   await stageStart(h);await advance(h);h.fail('hang');
   globalThis.setTimeout=(fn,ms,...args)=>timer(fn,ms===45000?25:ms,...args);
   await advance(h);await checkTargets(h,'internships');
   assert.equal(h.replies.at(-1).body.recoveryReason,'timeout');
   assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM adviser_leases').first()).n,0);
   assert.equal((await h.DB.prepare("SELECT COUNT(*) AS n FROM service_calls WHERE state='running'").first()).n,0);
   assert.equal(h.runtime.service.stageChanges[2],2);h.fail('');await finish(h);
  }finally{globalThis.setTimeout=timer;await h.close();}
 });

 await group('Expired sign-in does not become a successful recovery or bypass authentication',async()=>{
  const h=await harness(profiles[0]);try{
   await stageStart(h);await advance(h);h.httpFault('unauthorized');await h.controller.click(button('dashboard-stage-next'));
   assert.ok(h.runtime.aiError);assert.ok(!h.state.journey.details?.internships?.length);
   assert.equal(h.requests.filter(r=>r.path==='/api/reviewed-targets').length,0);
  }finally{await h.close();}
 });
 await group('A saved legacy plan with missing exchanges recovers its cards at zero global quota',async()=>{
  const h=await harness(profiles[2]);try{
   await stageStart(h);await finish(h);await h.DB.prepare('UPDATE service_entitlements SET global_used=5').run();await h.controller.loadService();
   const companies=structuredClone(h.state.plan.targets.internships);h.state.plan.targets.exchanges=[];h.state.journey=newJourney(h.state.plan);await h.save();
   const paid=h.paid,actions=(await h.DB.prepare('SELECT COUNT(*) AS n FROM service_actions').first()).n;
   await h.controller.click(button('dashboard-targets'));assert.equal(h.runtime.aiError,'');assert.equal(h.runtime.dashboardPanel,'opportunities');assert.ok(h.state.plan.targets.exchanges.length);assert.deepEqual(h.state.plan.targets.internships,companies);assert.equal(h.runtime.service.globalRemaining,0);assert.equal(h.paid,paid);
   assert.equal((await h.DB.prepare('SELECT COUNT(*) AS n FROM service_actions').first()).n,actions);await h.save();await h.reload();assert.ok(h.state.plan.targets.exchanges.length);assert.equal(h.runtime.service.globalRemaining,0);
  }finally{await h.close();}
 });

 await group('Lost Companies result and lost Exchanges reservation replay the same durable actions',async()=>{
  const h=await harness(profiles[0]);try{
   await stageStart(h);await advance(h);h.drop('targets');await h.controller.click(button('dashboard-stage-next'));assert.equal(h.runtime.aiError,'','A lost successful initial response must recover immediately.');const paid=h.paid;
   await h.controller.click(button('dashboard-retry'));assert.equal(h.runtime.aiError,'');assert.equal(h.paid,paid,'Lost-result replay must not pay twice.');assert.equal(h.runtime.service.step,2);await checkTargets(h,'internships');
   h.dropReservation();await h.controller.click(button('dashboard-stage-next'));assert.ok(h.runtime.aiError);const before=h.paid;
   await h.controller.click(button('dashboard-retry'));assert.equal(h.runtime.aiError,'');assert.ok(h.paid-before<=1);assert.equal(h.runtime.service.step,3);await checkTargets(h,'exchanges');
   assert.equal((await h.DB.prepare("SELECT COUNT(*) AS n FROM service_actions WHERE kind='initial'").first()).n,4);await finish(h);
  }finally{await h.close();}
 });

 await group('A lost initial Courses result survives reload and replays its durable receipt without another paid call',async()=>{
  const h=await harness(profiles[0]);try{
   await stageStart(h);h.drop('courses');await h.controller.click(button('dashboard-stage-next'));
   assert.equal(h.runtime.service.step,1);assert.ok(h.runtime.aiError);assert.ok(!h.state.journey.details?.choices);
   const paid=h.paid;await h.save();await h.reload();await h.controller.click(button('dashboard-courses'));
   assert.equal(h.runtime.aiError,'');assert.ok(h.state.journey.details?.choices,'Choose my courses must recover a missing result after reload.');assert.equal(h.state.journey.details.source,'openai','Recovery should retain the original completed provider result.');
   assert.equal(h.paid,paid,'The original successful receipt must be replayed without a second provider call.');assert.equal(h.runtime.service.stageChanges[1],2);
   await finish(h);assert.equal(h.state.phase,'saved');
  }finally{await h.close();}
 });

 await group('A lost initial Semesters result and a missing draft map survive reload without another paid call',async()=>{
  const h=await harness(profiles[0]);try{
   await stageStart(h);await advance(h);await advance(h);await advance(h);h.drop('pace');await h.controller.click(button('dashboard-stage-next'));
   assert.equal(h.runtime.service.step,4);assert.ok(h.runtime.aiError);assert.ok(!h.state.journey.paceAdvice);assert.ok(!h.state.draftPlan);
   const paid=h.paid;await h.save();await h.reload();await h.controller.click(button('dashboard-build'));
   assert.equal(h.runtime.aiError,'');assert.ok(h.state.journey.paceAdvice);assert.equal(h.state.journey.paceAdvice.source,'openai','Recovery should retain the original completed provider result.');assert.ok(h.state.draftPlan?.terms.length,'Map my semesters must recover the missing roadmap after reload.');
   assert.equal(h.paid,paid,'Recovering the original semester result must replay its receipt.');assert.equal(h.runtime.service.stageChanges[4],2);
   h.state.draftPlan=null;h.state.phase='journey';await h.save();await h.reload();await h.controller.click(button('dashboard-build'));
   assert.ok(h.state.draftPlan?.terms.length,'A retained pace decision must rebuild a lost draft locally.');assert.equal(h.state.phase,'draft');assert.equal(h.paid,paid);
   await finish(h);assert.equal(h.state.phase,'saved');
  }finally{await h.close();}
 });

 await group('A failed global target refinement preserves the saved plan and terminal retry spends nothing more',async()=>{
  const h=await harness(profiles[2]);try{
   await stageStart(h);await finish(h);h.runtime.dashboardPanel='courses';const saved=JSON.stringify(h.state.plan),before=h.paid;
   h.fail('malformed');await h.controller.submit(form('dashboard-command-form',{request:'Change internship companies and keep exchange destinations.'}));
   assert.ok(h.runtime.aiError,'A failed explicit change must not claim that it succeeded.');assert.equal(JSON.stringify(h.state.plan),saved);assert.equal(h.runtime.service.globalRemaining,4);
   assert.equal(h.state.phase,'saved','Failed rebuild must restore the usable saved dashboard.');assert.equal(h.runtime.dashboardPanel,'courses','Failure must keep the user on their previous panel.');
   const used=h.paid;assert.ok(used-before<=3,'Routing plus target repair must remain bounded.');
   await h.controller.click(button('dashboard-retry'));assert.equal(h.paid,used,'A terminal failed receipt must not invoke the provider again.');assert.equal(h.runtime.service.globalRemaining,4);
   await h.controller.click(button('dashboard-export'));assert.equal(h.exported,1);assert.equal(h.paid,used);
  }finally{await h.close();}
 });

 await group('Adding a second specialization rebuilds every dependent stage inside one global change',async()=>{
  const h=await harness({...profiles[0],secondTrack:''});try{
   await stageStart(h);await finish(h);h.direction({secondTrack:'AI'});const before=h.paid;
   await h.controller.submit(form('dashboard-command-form',{request:'Add Artificial Intelligence as my second specialization and retain Computer Systems and my Business Administration minor.'}));
   assert.equal(h.runtime.aiError,'');assert.equal(h.runtime.service.globalRemaining,4);assert.equal(h.state.phase,'draft');assert.equal(h.state.draftPlan.profile.secondTrack,'AI');assert.equal(h.state.draftPlan.profile.minor,'business-administration');
   assert.ok(h.paid-before<=5,'The structural rebuild must fit one global action, including routing.');
   const html=dashboardView(h.state,{...h.runtime,dashboardPanel:'overview'});assert.ok(html.includes('Computer Systems'));assert.ok(html.includes('Artificial Intelligence'));assert.ok(html.includes('Business Administration'));
   await h.controller.click(button('dashboard-save'));await h.reload();assert.equal(h.state.plan.profile.secondTrack,'AI');assert.equal(h.runtime.service.globalRemaining,4);
  }finally{await h.close();}
 });

 await group('Repeated clicks during a slow request and cross-panel global routing consume one action',async()=>{
  const h=await harness(profiles[0]);try{
   const held=h.hold(),first=h.controller.click(button('dashboard-stage-generate'));try{await held.started;
    assert.equal(h.controller.busy,true);assert.equal(h.runtime.dashboardBusy,true);assert.ok(h.runtime.dashboardWork,'Visible working state is required.');
    const working=dashboardView(h.state,h.runtime);assert.ok(working.includes('aria-busy="true"'));assert.ok(working.includes('class="dashboard-working" role="status"'));assert.match(working,/<fieldset\b[^>]*\bdisabled(?:\s|>)/,'Working state must disable repeat actions visibly.');
    await Promise.all([h.controller.click(button('dashboard-stage-generate')),h.controller.click(button('dashboard-stage-next')),h.controller.submit(form('dashboard-command-form',{request:'Duplicate while pending.'}))]);
   }finally{held.release();await first;}
   assert.equal(h.paid,1);assert.equal(h.runtime.dashboardBusy,false);assert.equal(h.runtime.service.step,0);assert.equal(h.runtime.service.stageChanges[0],2);await finish(h);
   h.runtime.dashboardPanel='semesters';const before=h.paid;await h.controller.submit(form('dashboard-command-form',{request:'Change internship companies but keep exchange destinations.'}));
   assert.equal(h.runtime.aiError,'');assert.equal(h.runtime.service.globalRemaining,4);assert.equal(h.runtime.dashboardPanel,'opportunities');assert.ok(h.paid-before<=2);
   const global=(await h.DB.prepare("SELECT COUNT(*) AS n FROM service_actions WHERE kind='global'").first()).n;assert.equal(global,1);
  }finally{await h.close();}
 });
}finally{globalThis.fetch=originals.fetch;globalThis.FormData=originals.FormData;}

if(proof.failures.length){for(const {name,error}of proof.failures)console.error('\n'+name+'\n'+error.stack);throw Error(proof.failures.length+' roadmap resilience groups failed.');}
console.log('Passed '+proof.groups+' real HTTP/controller roadmap resilience groups ('+proof.providerCalls+' synthetic provider responses). No live AI or customer data.');
