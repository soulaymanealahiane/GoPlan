import assert from 'node:assert/strict';
import {localDatabase} from './server/local-db.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {handleApi} from './server/api.mjs';
import {serviceEntitlement,beginServiceAction,reserveServiceCall} from './server/service-allowance.mjs';
import {createDashboardController} from './dist/dashboard-controller.js';
import {dashboardView} from './dist/dashboard-view.js';
import {newcomerWorkspace} from './dist/dashboard-flow.js';
import {acceptAdvice} from './dist/journey-state.js';
import {requestAdvice} from './dist/ai-client.js';
import {AXES} from './dist/evidence.js';
import {openaiFixture} from './tests/openai-fixture.mjs';

const DB=localDatabase(':memory:'),uid='follow-up-regression',session=await testSession(DB,uid),base='https://planwithgoplan.com';
const originals={fetch:globalThis.fetch,FormData:globalThis.FormData};
let state=newcomerWorkspace(),runtime={},paid=0,dropResponse=true,repeatClarify=false,dropReservation=false;
state.journey.questionnaire={ambitions:'Build technology for finance.',activities:'Programming useful financial products.',strengths:'Mathematics and programming.'};
const direction={kind:'recommend',summary:'Build financial technology.',themes:[],questions:[],tradeoffs:[],academic:{program:'BSCSC',track:'SE',secondTrack:'',minor:'business-administration',rationale:'Build financial products.',focusRationale:'Software development.',secondFocusRationale:'',minorRationale:'Business applications.'},assessment:Object.keys(AXES).map(axis=>({axis,explanation:'Connected to the stated product goal.',answerIds:['ambitions'],evidenceIds:[]}))};
const provider=async(_,init)=>{
 paid++;const body=JSON.parse(init.body),context=JSON.parse(body.input),answered=!!context.request.answers?.trim();
 if(answered){assert.deepEqual(body.text.format.schema.properties.kind.enum,['recommend']);assert.equal(body.text.format.schema.properties.questions.maxItems,0);assert.match(context.task,/Do not ask another follow-up/);}
 const result=!answered||repeatClarify?{...direction,kind:'clarify',questions:['Finance as your main subject, or programming financial technology?'],academic:Object.fromEntries(Object.keys(direction.academic).map(k=>[k,'']))}:direction;
 return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
};
const env={DB,OPENAI_API_KEY:'synthetic-follow-up-only',OPENAI_WEB_RESEARCH:'off',GOPLAN_TOKEN_COUNTER:async()=>1000};
const getAdvice=async(stage,{serviceAction}={})=>{
 try{const result=await requestAdvice(stage,state.journey,{serviceAction});acceptAdvice(state.journey,stage,result);return result.kind!=='clarify';}
 catch(e){runtime.aiError=e.message;runtime.aiFailure={retryable:e.retryable!==false,code:e.code};return false;}
};
const hooks={runtime,read:()=>state,account:()=>null,render(){},persist(){},getAdvice,notify(){},changed(){},head:()=>'',modal(){},close(){}};
let controller=createDashboardController(hooks);
globalThis.FormData=class{constructor(form){this.form=form;}get(k){return this.form.values[k];}};
globalThis.fetch=async(url,init={})=>{
 const data=init.body?JSON.parse(init.body):{};
 const response=await handleApi(new Request(base+url,{...init,headers:{...init.headers,...session,Origin:base}}),env,{fetcher:provider});
 // Simulate a lost response AFTER the server has completed the paid request.
 if(url==='/api/advice'&&data.answers&&dropResponse){dropResponse=false;throw TypeError('Synthetic lost response');}
 if(url==='/api/service/action'&&data.kind==='stage'&&dropReservation){dropReservation=false;throw TypeError('Synthetic lost reservation');}
 return response;
};
try{
 await controller.loadService();
 await controller.click({dataset:{action:'dashboard-stage-generate'}});
 assert.equal(state.journey.advice.kind,'clarify');assert.equal(runtime.aiError,'');assert.equal(paid,1);assert.equal(runtime.service.stageChanges[0],2);
 let html=dashboardView(state,runtime);assert.ok(html.includes('dashboard-clarification-form'));assert.ok(html.includes('2 remaining Direction changes'));
 await controller.submit({id:'dashboard-clarification-form',values:{answer:'Keep programming central and build financial technology.'}});
 assert.ok(runtime.aiError.includes('connection was interrupted'));assert.equal(runtime.service.stageChanges[0],1);assert.equal(paid,2);
 const count=(await DB.prepare("SELECT COUNT(*) AS n FROM service_actions WHERE kind='stage'").first()).n;assert.equal(count,1);
 await controller.click({dataset:{action:'dashboard-retry'}});
 assert.equal(runtime.aiError,'');assert.equal(state.journey.advice.kind,'recommend');assert.equal(state.journey.programChosen,true);assert.equal(paid,2,'Retry must replay the completed receipt without another provider call.');assert.equal(runtime.service.stageChanges[0],1);
 assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM service_actions WHERE kind='stage'").first()).n,1,'Retry cannot consume another stage change.');
 // Reloaded controller still uses a stage action for a legacy follow-up screen.
 state.journey.advice={...direction,kind:'clarify',questions:['Which direction?']};state.journey.programChosen=false;state.journey.answers='';controller=createDashboardController(hooks);await controller.loadService();dropReservation=true;
 await controller.submit({id:'dashboard-clarification-form',values:{answer:'Software engineering for finance.'}});
 assert.ok(runtime.aiError);assert.equal((await serviceEntitlement(DB,uid)).change0,2);assert.equal(paid,2,'Lost action response must not start provider work.');
 await controller.click({dataset:{action:'dashboard-retry'}});
 assert.equal(runtime.aiError,'');assert.equal(state.journey.programChosen,true);assert.equal(paid,3);assert.equal(runtime.service.stageChanges[0],0);
 const before=paid;
 await controller.submit({id:'dashboard-clarification-form',values:{answer:'An extra question must be refused.'}});
 assert.equal(paid,before);assert.equal(runtime.aiFailure.retryable,false);html=dashboardView(state,runtime);assert.ok(!html.includes('data-action="dashboard-retry"'));assert.ok(!html.includes('data-action="dashboard-change"'));
 // A legacy clarification with no allowance provides an explicit manual route.
 state.journey.programChosen=false;state.journey.advice={kind:'clarify',questions:['Which direction?']};html=dashboardView(state,runtime);assert.ok(html.includes('Choose my degree myself'));assert.ok(!html.includes('dashboard-clarification-form'));
 // Exhausted request receipts and cached provider failures are terminal over HTTP.
 const fresh=await beginServiceAction(DB,'receipt-fixture',{id:crypto.randomUUID(),kind:'initial',step:0});
 const receipt=await reserveServiceCall(DB,'receipt-fixture',fresh.action,'direction','used');await receipt.finish(direction,200);
 await assert.rejects(()=>reserveServiceCall(DB,'receipt-fixture',fresh.action,'direction','different'),e=>e.code==='SERVICE_ACTION_USED'&&e.retryable===false);
 console.log('Passed real API/client follow-up flow, original empty-ID clarification, one stage allowance per answer, lost-result and lost-reservation retries without extra spend, reload recovery, terminal quota errors and manual continuation. No live provider calls.');
}finally{globalThis.fetch=originals.fetch;globalThis.FormData=originals.FormData;DB.close();}
