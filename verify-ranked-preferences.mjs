import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {QUICK_CHOICES,cleanRankings} from './dist/preferences.js';
import {selectQuickAnswer,moveQuickAnswer,writeCardDetail,cardAnswer,questionnaireCard} from './dist/question-cards.js';
import {newJourney,emptyWorkspace,makePlan,validateSavedWorkspace,preferenceWeights} from './dist/guidance.js';
import {adviceFingerprint} from './dist/journey-state.js';
import {opportunityInterests,rankOpportunityTargets,companySizePreference} from './dist/opportunity-matching.js';
import {adviseJourney} from './server/journey-agent.mjs';
import {AXES} from './dist/evidence.js';
import {localDatabase} from './server/local-db.mjs';
import {handleApi} from './server/api.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {openaiFixture} from './tests/openai-fixture.mjs';

const j=newJourney();
for(const [id,choices]of Object.entries(QUICK_CHOICES)){
 assert.ok(choices.length>=10,id+' needs broad choices');assert.equal(new Set(choices).size,choices.length);
 j.questionIndex=Object.keys(QUICK_CHOICES).indexOf(id);
 selectQuickAnswer(j,id,choices[0]);selectQuickAnswer(j,id,choices[1]);
 assert.ok(questionnaireCard(j).includes('Move '+choices[1]+' up'));
 assert.equal(moveQuickAnswer(j,id,1,-1),true);assert.equal(j.questionnaireRankings[id][0],choices[1]);
 assert.equal(moveQuickAnswer(j,id,0,-1),false);assert.equal(moveQuickAnswer(j,id,0,3),false);
 assert.deepEqual(cardAnswer(j,id).choices,[choices[1],choices[0]]);
}
for(const [id,word]of [['ambitions','investments'],['activities','international relations'],['strengths','accounting'],['industries','humanitarian'],['priorities','local community'],['entrepreneurship','public service'],['automation','social impact'],['constraints','work or family']])assert.ok(QUICK_CHOICES[id].some(c=>c.includes(word)));
const legacy=newJourney();legacy.questionnaire.ambitions='I want to study international relations.';assert.deepEqual(cardAnswer(legacy,'ambitions'),{choices:[],detail:legacy.questionnaire.ambitions});assert.deepEqual(cleanRankings(undefined,legacy.questionnaire),{});
assert.deepEqual(cleanRankings({activities:['Invented preference','Financial analysis and investment decisions']},{activities:'unrelated answer'}),{});
writeCardDetail(j,'ambitions','My own goal: economic development in Morocco.');assert.ok(j.questionnaire.ambitions.includes('economic development'));
const restored=validateSavedWorkspace(JSON.parse(JSON.stringify({...emptyWorkspace(),journey:j})));assert.deepEqual(restored.journey.questionnaireRankings,j.questionnaireRankings);
const plan=makePlan(j),reopened=newJourney(plan);assert.deepEqual(reopened.questionnaireRankings,j.questionnaireRankings);assert.deepEqual(reopened.questionCards,j.questionCards);
selectQuickAnswer(j,'activities','Undecided');assert.deepEqual(j.questionnaireRankings.activities,['Undecided']);selectQuickAnswer(j,'activities','Financial analysis and investment decisions');assert.deepEqual(j.questionnaireRankings.activities,['Financial analysis and investment decisions']);

// The same selected set in a different order must change real ranking scores.
const ranked=newJourney();selectQuickAnswer(ranked,'activities','Financial analysis and investment decisions');selectQuickAnswer(ranked,'activities','Programming and building products');
const request=()=>({profile:{},questionnaire:ranked.questionnaire,questionnaireRankings:ranked.questionnaireRankings});
const records=[{id:'finance',name:'Finance example',tags:['finance']},{id:'software',name:'Software example',tags:['software']}];
assert.equal(rankOpportunityTargets(records,request(),'internships')[0].id,'finance');
const first=adviceFingerprint('direction',ranked),finance=opportunityInterests(request()).themes.find(t=>t.theme==='finance').weight;
moveQuickAnswer(ranked,'activities',1,-1);assert.notEqual(adviceFingerprint('direction',ranked),first);assert.equal(rankOpportunityTargets(records,request(),'internships')[0].id,'software');assert.ok(opportunityInterests(request()).themes.find(t=>t.theme==='finance').weight<finance);
assert.ok(preferenceWeights(ranked).technology>preferenceWeights(ranked).business);
const employer=newJourney();selectQuickAnswer(employer,'entrepreneurship','I prefer an established employer');selectQuickAnswer(employer,'entrepreneurship','I want startup experience first');assert.equal(companySizePreference(employer),'established');moveQuickAnswer(employer,'entrepreneurship',1,-1);assert.equal(companySizePreference(employer),'startup');assert.equal(companySizePreference({...employer,refinement:'Avoid startups.'}),'established');

// Actual server sanitation and model context retain the priority signal.
let providerCalls=0;
await adviseJourney({stage:'direction',flowVersion:5,programChosen:false,preferredDegree:'undecided',level:'undergraduate',questionnaire:ranked.questionnaire,questionnaireRankings:{...ranked.questionnaireRankings,bogus:['injected']},profile:{}},{OPENAI_API_KEY:'fixture',OPENAI_WEB_RESEARCH:'off',OPENAI_DIRECTION_RESEARCH:'off'},async(url,init)=>{
 providerCalls++;const body=JSON.parse(init.body),context=JSON.parse(body.input);
 assert.deepEqual(context.request.questionnaireRankings.activities,ranked.questionnaireRankings.activities);assert.ok(!context.request.questionnaireRankings.bogus);assert.match(context.questionnairePolicy,/Weight earlier choices/);
 return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({kind:'recommend',summary:'A provisional direction.',themes:[],questions:[],tradeoffs:[],academic:{program:'BSCSC',track:'SE',secondTrack:'',minor:'',rationale:'Fits your interests.',focusRationale:'Fits your interests.',secondFocusRationale:'',minorRationale:''},assessment:Object.keys(AXES).map(axis=>({axis,explanation:'Uses supplied preferences.',answerIds:['activities'],evidenceIds:[]})),update:{summary:'Prepared a direction.',changes:[],limitations:[]}})}]}]});
});assert.equal(providerCalls,1);

// Cloud save / restore use the real account endpoints and isolated storage.
const DB=localDatabase(':memory:'),base='https://planwithgoplan.com',headers={...await testSession(DB,'ranked-preferences'),'Content-Type':'application/json',Origin:base},env={DB};
const api=(path,method='GET',body)=>handleApi(new Request(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),env);
assert.equal((await api('/api/account/profile','POST',{firstName:'Demo',lastName:'Student',consentCloud:true})).status,200);
assert.equal((await api('/api/account/workspaces/'+crypto.randomUUID(),'PUT',{revision:0,state:restored})).status,200);
const saved=await (await api('/api/account/workspaces')).json(),loaded=await (await api('/api/account/workspaces/'+saved.workspaces[0].id)).json();assert.deepEqual(loaded.state.journey.questionnaireRankings,restored.journey.questionnaireRankings);DB.close();

// Exercise the actual sign-in script: mismatch blocks submission, announces the
// problem and focuses confirmation; a corrected password can proceed once.
const ids=[...fs.readFileSync(new URL('./dist/signin.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
const nodes=Object.fromEntries(ids.map(id=>[id,{value:'',hidden:false,textContent:'',className:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},classList:{contains(name){return nodes[id].className.split(' ').includes(name);}},focus(){this.focused=true;}}]));let calls=0,navigation='';
vm.runInContext(fs.readFileSync(new URL('./dist/signin.js',import.meta.url),'utf8'),vm.createContext({document:{getElementById:id=>nodes[id]},location:{search:'',replace:path=>{navigation=path;}},URLSearchParams,AbortSignal,fetch:async()=>{calls++;return Response.json({});}}));
nodes['new-password'].value='synthetic password one';nodes['confirm-password'].value='synthetic password two';const button={disabled:false},event={preventDefault(){},target:{querySelector:()=>button}};
await nodes['password-form'].onsubmit(event);assert.equal(calls,0);assert.equal(nodes['password-match-error'].hidden,false);assert.equal(nodes['confirm-password'].attrs['aria-invalid'],'true');assert.equal(nodes['confirm-password'].focused,true);assert.equal(nodes['auth-status'].attrs.role,'alert');assert.match(nodes['auth-status'].textContent,/Passwords don’t match/);
nodes['confirm-password'].value='synthetic password one';nodes['confirm-password'].oninput();assert.equal(nodes['password-match-error'].hidden,true);assert.equal(nodes['confirm-password'].attrs['aria-invalid'],'false');await nodes['password-form'].onsubmit(event);assert.equal(calls,1);assert.equal(navigation,'/demo');
console.log('Passed expanded choices across all eight questions, editable priority order, uncertainty/custom answers, legacy migration, saved-plan/cloud ranking persistence, recommendation-score inversion, provider context and prominent accessible password mismatch. Synthetic calls only.');
