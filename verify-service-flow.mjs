import assert from 'node:assert/strict';
import {localDatabase} from './server/local-db.mjs';
import {serviceEndpoint,serviceEntitlement,reserveServiceCall} from './server/service-allowance.mjs';
import {createDashboardController} from './dist/dashboard-controller.js';
import {dashboardView} from './dist/dashboard-view.js';
import {newcomerWorkspace} from './dist/dashboard-flow.js';
import {newJourney,suggestChoices} from './dist/guidance.js';
import {acceptAdvice} from './dist/journey-state.js';
import {availableTargets} from './server/advisor.mjs';
const DB=localDatabase(':memory:'),uid='service-flow',originalFetch=globalThis.fetch,originalForm=globalThis.FormData;
let state=newcomerWorkspace({year:2026}),runtime={},paid=0,routeStep=5,directionTrack='SE',loseCourses=false;
state.journey.questionnaire={ambitions:'Build useful technology.',workStyle:'Software products.',strengths:'Mathematics.'};
const call=async(stage,action,extra={})=>{
 const receipt=await reserveServiceCall(DB,uid,action,stage,JSON.stringify(extra));if(receipt.cached)return receipt.cached;paid++;
 const j=state.journey;let result;
 if(stage==='change')result={kind:'journey',startStep:routeStep,summary:'Update the plan.',questions:[]};
 if(stage==='direction')result={kind:'recommend',summary:'Your direction.',themes:[],questions:[],tradeoffs:[],academic:{program:'BSCSC',track:directionTrack,secondTrack:'',minor:'business-administration',rationale:'Build technology.',focusRationale:'Practical software.',minorRationale:'Business applications.'}};
 if(stage==='courses')result={summary:'Your courses.',choices:suggestChoices(j).profile.choices,choiceReasons:{},openItems:[]};
 if(stage==='targets')result=Object.fromEntries(['internships','exchanges'].map(type=>[type,availableTargets(type,j.profile).slice(0,5).map(t=>({...t,reason:'Goal alignment.'}))]));
 if(stage==='pace')result={pace:'balanced',regularCourses:5,summerCourses:2,summers:true,summary:'Your pace.',reason:'Balanced.',actions:[]};
 await receipt.finish(result,200);return result;
};
const getAdvice=async(stage,{serviceAction}={})=>{const result=await call(stage,serviceAction,{stage,refinement:state.journey.refinements?.[stage]});if(loseCourses&&stage==='courses'){loseCourses=false;throw TypeError('Synthetic lost courses response');}acceptAdvice(state.journey,stage,result);return true;};
const h={runtime,read:()=>state,account:()=>({firstName:'Demo'}),render(){},changed(){},persist(){},notify(){},modal(){},head:()=>'',close(){},getAdvice,startWorkspace:async next=>{state=next;},showPlan(){},exportPlan:async()=>{},saveAccount:async()=>{const row=await serviceEntitlement(DB,uid);await DB.prepare('UPDATE service_entitlements SET saved=1 WHERE id=? AND step=5').bind(row.id).run();return true;}};
const controller=createDashboardController(h);
globalThis.FormData=class{constructor(form){this.form=form;}get(key){return this.form.values[key];}};
globalThis.fetch=async(url,init={})=>{
 if(String(url).startsWith('/api/service'))return serviceEndpoint(new Request('https://planwithgoplan.com'+url,{method:init.method||'GET',headers:{Origin:'https://planwithgoplan.com',...init.headers},body:init.body}),{DB},{id:uid});
 const data=JSON.parse(init.body);return Response.json(await call(data.stage,data.serviceAction,{stage:data.stage,request:data.changeRequest}));
};
try{
 await controller.loadService();const first=await controller.authorizeAdvice('direction');await getAdvice('direction',{serviceAction:first});
 for(let step=0;step<5;step++){
  assert.equal(runtime.service.step,step);let html=dashboardView(state,runtime);assert.ok(html.includes('OF 5'));assert.ok(!html.includes('class="dashboard-tabs"'));assert.ok(!html.includes('Start over'));
  for(let n=0;n<2;n++)await controller.submit({id:'dashboard-command-form',values:{request:'Refine this stage '+step+' preference '+n}});
  assert.equal(runtime.service.stageChanges[step],0);html=dashboardView(state,runtime);assert.ok(!html.includes('id="dashboard-request"'));
  const before=paid;await controller.submit({id:'dashboard-command-form',values:{request:'A third prompt must be refused.'}});assert.equal(paid,before);
  await controller.click({dataset:{action:'dashboard-stage-next'}});
 }
 assert.equal(runtime.service.step,5);assert.equal(state.phase,'draft');assert.ok(!dashboardView(state,runtime).includes('id="dashboard-request"'),'Global prompts unlock only after saving.');
 await controller.click({dataset:{action:'dashboard-save'}});assert.equal(runtime.service.saved,true);assert.equal(runtime.service.globalRemaining,5);
 for(let n=0;n<5;n++){
  if(n===0){routeStep=2;directionTrack='AI';loseCourses=true;}else routeStep=5;
  const before=paid;await controller.submit({id:'dashboard-command-form',values:{request:'Make global change '+n}});assert.equal(runtime.service.globalRemaining,4-n);if(n===0){assert.match(runtime.aiError,/lost courses/);await controller.click({dataset:{action:'dashboard-retry'}});assert.equal(runtime.aiError,'');assert.equal(runtime.service.globalRemaining,4,'Retry must reuse the same global change.');}assert.ok(paid-before<=5,'A global change cannot exceed five backend requests.');
  assert.equal(state.phase,'draft');await controller.click({dataset:{action:'dashboard-save'}});
 }
 const before=paid;await controller.submit({id:'dashboard-command-form',values:{request:'A sixth global change is forbidden.'}});assert.equal(paid,before);
 await controller.loadService();const html=dashboardView(state,{...runtime,dashboardPanel:'overview'});assert.ok(html.includes('Your five global AI changes are used'));assert.ok(html.includes('Export Excel'));assert.ok(!html.includes('id="dashboard-request"'));assert.ok(html.includes('Change your degree'));
 const saved=JSON.stringify(state);await controller.click({dataset:{action:'dashboard-confirm-restart'}});assert.equal(JSON.stringify(state),saved);
 console.log('Passed five sequential card stages, two stage prompts each, saved-dashboard transition, five global revisions including a full cross-panel rebuild, persistent manual-only state and removed restart. No live calls.');
}finally{globalThis.fetch=originalFetch;globalThis.FormData=originalForm;DB.close();}
