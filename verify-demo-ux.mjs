import assert from 'node:assert/strict';
import fs from 'node:fs';
import {localDatabase} from './server/local-db.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {authEndpoint} from './server/auth.mjs';
import {demoPageGate} from './server/demo-access.mjs';
import {handleApi} from './server/api.mjs';
import {newJourney,emptyWorkspace,validateSavedWorkspace} from './dist/guidance.js';
import {missingAnswers} from './dist/questionnaire.js';
import {QUICK_CHOICES,selectQuickAnswer,writeCardDetail,advanceQuestion,questionnaireCard,questionNavigation} from './dist/question-cards.js';
import {journeyView} from './dist/journey-view.js';
const base='https://planwithgoplan.com',DB=localDatabase(':memory:'),session=await testSession(DB,'public-demo'),env={DB,OPENAI_API_KEY:'fixture',AI_ACCESS_CODE:'obsolete',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture'};
for(const path of ['/demo','/demo/','/demo/aui','/demo.html']){
 const r=await demoPageGate(new Request(base+path),env);assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'/signin.html?mode=signup');
 assert.equal(await demoPageGate(new Request(base+path,{headers:session}),env),null);
}
assert.equal(await demoPageGate(new Request(base+'/'),env),null);
let calls=0;
for(const email of ['synthetic@gmail.com','synthetic@aui.ma']){
 const r=await authEndpoint(new Request(base+'/api/auth/send',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email})}),env,{authFetcher:async(url,init)=>{assert.equal(JSON.parse(init.body).email,email);calls++;return Response.json({});}});assert.equal(r.status,200);
}
assert.equal(calls,2,'Both public and university emails must reach the verification provider.');
let paidCalls=0;
const guest=await handleApi(new Request(base+'/api/advice',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-GoPlan-Access':'obsolete'},body:'{}'}),env,{fetcher:async()=>{paidCalls++;throw Error('Not authorized');}});
assert.equal(guest.status,401);assert.equal((await guest.json()).code,'SIGN_IN_REQUIRED');assert.equal(paidCalls,0);
const status=await (await handleApi(new Request(base+'/api/status',{headers:session}),env)).json();assert.equal(status.authenticated,true);assert.equal(status.requiresAccess,false);assert.equal(status.requiresSignIn,false);
const j=newJourney();j.step=1;
assert.equal(advanceQuestion(j),false);
for(const id of ['ambitions','activities','strengths'])selectQuickAnswer(j,id,QUICK_CHOICES[id][0]);
assert.equal(missingAnswers(j.questionnaire).length,0);
selectQuickAnswer(j,'ambitions',QUICK_CHOICES.ambitions[1]);writeCardDetail(j,'ambitions','I want to build useful products for local businesses.');
assert.ok(j.questionnaire.ambitions.includes('Grow a business'));assert.ok(j.questionnaire.ambitions.includes('local businesses'));
selectQuickAnswer(j,'strengths','Undecided');assert.deepEqual(j.questionCards.strengths.choices,['Undecided']);assert.equal(missingAnswers(j.questionnaire).length,0);
const state={...emptyWorkspace(),journey:j},restored=validateSavedWorkspace(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored.journey.questionCards,j.questionCards);
for(let i=0;i<8;i++){j.questionIndex=i;const html=questionnaireCard(j);assert.equal((html.match(/data-question="/g)||[]).length,1);assert.ok(html.includes('aria-pressed='));assert.ok(!html.includes('Demo access code'));}
j.questionIndex=2;assert.ok(questionNavigation(j).includes('Find my direction'));assert.ok(questionnaireCard(j).includes('Personalize further'));
assert.ok(!journeyView(state,{aiStatus:{available:true},hasAccess:false}).includes('ai-access-code'));
for(const file of ['dist/app.js','dist/journey-view.js','dist/ethics-view.js'])assert.ok(!fs.readFileSync(file,'utf8').includes('Demo access code'),file+' still exposes a code control.');
DB.close();console.log('Passed mandatory demo sign-in, no code bypass, unrestricted email signup, account-based adviser status, quick-choice cards, optional text, three-answer completion and saved-answer restoration. No live AI calls.');
