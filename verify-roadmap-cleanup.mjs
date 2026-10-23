import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {dashboardView} from './dist/dashboard-view.js';
import {newJourney,makePlan,emptyWorkspace} from './dist/guidance.js';
import {handleApi} from './server/api.mjs';
const j=newJourney();j.programChosen=true;j.profile.program='BSEMS';const plan=makePlan(j),state={...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)};
for(const stage of ['direction','courses','targets','pace','global'])state.journey.lastUpdates[stage]={summary:'Historical recap should not appear.',limitations:['Historical limitation.']};
for(const panel of ['overview','direction','courses','opportunities','semesters']){
 const html=dashboardView(state,{dashboardPanel:panel,manualWelcome:true,service:{step:5,saved:true,globalRemaining:5}});
 assert.equal((html.match(/data-action="dashboard-export"/g)||[]).length,1,panel);assert.ok(html.includes('dashboard-export'));assert.ok(html.includes('<svg aria-hidden="true"'));
 assert.doesNotMatch(html,/mistake-report|Report a mistake|manual-handoff|Ready for university|Historical recap|Historical limitation|aria-label="Plan update"|dashboard-notice/);
}
const reply=dashboardView(state,{dashboardPanel:'overview',dashboardNotice:'Cannot change <academic rules>.',service:{step:5,saved:true,globalRemaining:5}});
assert.match(reply,/class="dashboard-command-response" role="status"/);assert.ok(reply.includes('Cannot change &lt;academic rules&gt;.'));assert.ok(reply.indexOf('dashboard-command-form')<reply.indexOf('dashboard-command-response'));
for(const path of ['/api/feedback','/api/feedback/status','/api/feedback/withdraw','/api/review/list','/api/review/decision']){
 const response=await handleApi(new Request('http://127.0.0.1:4317'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),{});assert.equal(response.status,410);assert.equal((await response.json()).code,'FEATURE_REMOVED');
}
const app=await fs.readFile('dist/app.js','utf8'),client=await fs.readFile('dist/ai-client.js','utf8');assert.doesNotMatch(app,/mistake-report|my-reports|feedback-view/);assert.doesNotMatch(client,/feedbackRequest|\/api\/feedback/);
console.log('Passed clean roadmap panels, one accessible Excel action per panel, escaped current-request replies, retired reporting routes and removed client entry points.');
