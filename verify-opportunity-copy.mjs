import assert from 'node:assert/strict';
import OPPORTUNITIES from './dist/opportunities.js';
import {DATA,normalizeProfile} from './dist/planner.js';
import {opportunityDescription,opportunityWebsite,opportunityContextKey} from './dist/opportunity-description.js';
import {opportunityDetail,esc,experienceCards} from './dist/views.js';
import {reviewedOpportunityShortlist} from './server/opportunity-recovery.mjs';
import {availableTargets} from './server/advisor.mjs';
import {createDashboardController} from './dist/dashboard-controller.js';
import {newJourney,makePlan,validateSavedWorkspace} from './dist/guidance.js';

const profile=normalizeProfile({program:'BSCSC',track:'CSYS',secondTrack:'AI',minor:'business-administration'});
const questionnaire={ambitions:'Build useful technology',activities:'Programming and building products',strengths:'Coding and technology'};
const journey={...newJourney(),profile,questionnaire,programChosen:true};
const rekrute=OPPORTUNITIES.internships.find(t=>t.id==='rekrute'),richmond=OPPORTUNITIES.exchanges.find(t=>t.name.startsWith('Richmond'));
const old={...rekrute,reason:'Explore how software and media connect with your degree.',industryReason:'Fit is inferred from your profile and the reviewed source.',researchLimitations:['Global software forecasts cannot establish hiring.'],researchCheckedAt:'2026-09-16'};
const snapshot=JSON.stringify([old,journey]);
let html=opportunityDetail(old,journey,'internships');
for(const required of ['Programming and building products','Computer Science','Computer Systems','recruitment','rekrute.com'])assert.ok(html.includes(required),required);
for(const unwanted of ['<details','inferred','forecasts','Evidence checked','publication','Why it fits','Explore how software and media'])assert.ok(!html.includes(unwanted));
assert.equal((html.match(/<a /g)||[]).length,1);assert.equal((html.match(/<p class="opportunity-fit"/g)||[]).length,1);
assert.equal(JSON.stringify([old,journey]),snapshot,'Opening a detail cannot mutate saved choices.');
html=opportunityDetail({...richmond,industryReason:'Global software forecasts cannot establish UK hiring.'},journey,'exchanges');
for(const required of ['richmond.ac.uk','Programming and building products','computing','Computer Systems'])assert.ok(html.includes(required));
assert.ok(!html.includes('forecasts'));assert.ok(!html.includes('<details'));

let checked=0;
for(const program of DATA.programs.filter(p=>p.level==='undergraduate')){
 const p=normalizeProfile({program:program.id,track:program.tracks[0]?.id||''}),j={...journey,profile:p};
 for(const type of ['internships','exchanges'])for(const target of availableTargets(type,p)){
  const description=opportunityDescription(target,j,type),words=description.split(/\s+/).length;
  assert.ok(words<110,'Keep the paragraph brief: '+target.id+' '+words);assert.ok(description.includes('You said'));
  assert.ok(!/undefined|null|\b(?:answerIds|evidenceIds)\b|publication date|inferred from|Evidence checked|forecasts/.test(description),target.id);
  assert.ok(!/include \.|works in \./.test(description),target.id);assert.ok(opportunityWebsite(target,type).startsWith('https://'));checked++;
 }
 const recovered=reviewedOpportunityShortlist(j);
 for(const type of ['internships','exchanges'])for(const target of recovered[type]){
  assert.ok(target.reason.includes('Programming and building products'));assert.equal(target.fitContext,opportunityContextKey(j));
  assert.ok(!target.reason.includes('Explore how'));assert.ok(target.sourceUrl);
 }
}

// A genuinely personalized model paragraph is kept; invented answers, stale
// degree/choice context and old slogans fall back without buying another call.
const reason='You said “Programming and building products” and chose Computer Systems within Computer Science. ReKrute runs a recruitment platform in Morocco, so it is a relevant target for exploring how the software skills in your degree could support digital tools for employers and job seekers.';
const fresh={...old,fitVersion:2,fitContext:opportunityContextKey(journey),reason};
assert.equal(opportunityDescription(fresh,journey),reason);
assert.ok(!opportunityDescription({...fresh,reason:reason+' You are guaranteed an internship.'},journey).includes('guaranteed'));
assert.notEqual(opportunityDescription({...fresh,reason:reason.replace('Programming and building products','Investment banking and trading')},journey),reason.replace('Programming and building products','Investment banking and trading'));
const changed={...journey,questionnaire:{...questionnaire,activities:'Writing and storytelling'}};
assert.notEqual(opportunityDescription(fresh,changed),reason);assert.ok(opportunityDescription(fresh,changed).includes('Writing and storytelling'));
assert.notEqual(opportunityContextKey({...journey,profile:{...profile,secondTrack:''}}),opportunityContextKey(journey));
assert.notEqual(opportunityContextKey({...journey,profile:{...profile,choices:{...profile.choices,test:'CSC1401'}}}),opportunityContextKey(journey));
assert.equal(opportunityWebsite(OPPORTUNITIES.internships.find(t=>t.id==='freterium'),'internships'),'https://freterium.ai/company','Use the company website instead of its third-party funding/job directory.');
for(const sourceUrl of ['javascript:alert(1)','http://example.com','https://user:secret@example.com','https://127.0.0.1/private','https://[::1]/','https://app.local/private'])assert.equal(opportunityWebsite({sourceUrl},'internships'),'');
const escaped=opportunityDetail(old,{...journey,questionnaire:{activities:'<img src=x onerror=alert(1)> build products'}},'internships');assert.ok(!escaped.includes('<img'));assert.ok(escaped.includes('&lt;img'));
const unsure=opportunityDescription(rekrute,{profile,questionnaire:{activities:'Undecided',ambitions:'I am still deciding'}});assert.ok(!unsure.includes('You said'));assert.ok(unsure.includes('You chose Computer Science'));
const negative=opportunityDescription(rekrute,{profile,questionnaire:{activities:'I hate programming and do not want it'}});assert.ok(!negative.includes('You said'));
const hanyang=OPPORTUNITIES.exchanges.find(t=>t.id==='hanyang-university-pel');assert.ok(opportunityDescription(hanyang,journey,'exchanges').includes('Business courses are excluded'));

// Actual controller at zero allowance: both modals work from saved decisions,
// use the currently displayed degree and make no API request or cloud write.
const j=newJourney();Object.assign(j,structuredClone(journey));j.details={summary:'Your targets.',internships:[old],exchanges:[richmond]};
const plan=makePlan(j);plan.finalizedAt=new Date().toISOString();let state={version:3,phase:'saved',plan,draftPlan:null,journey:newJourney(plan)},modal='';
state=validateSavedWorkspace(JSON.parse(JSON.stringify(state)));
const originalFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Reading an opportunity must not call the network.');
const controller=createDashboardController({runtime:{service:{step:5,saved:true,globalRemaining:0}},read:()=>state,modal:value=>{modal=value;},head:(title,subtitle)=>'<h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p>',render(){},persist:()=>assert.fail('Reading must not rewrite the saved plan.'),getAdvice:()=>assert.fail('Reading must not consume an AI change.')});
try{
 for(const [type,target] of [['internships',rekrute],['exchanges',richmond]]){
  await controller.click({dataset:{action:'dashboard-target',targetType:type,targetIndex:'0'}});assert.ok(modal.includes(target.name));assert.ok(modal.includes('Programming and building products'));assert.ok(modal.includes('target="_blank"'));assert.ok(!modal.includes('<details'));
 }
 state.plan.profile=normalizeProfile({program:'BBA',track:'FIN',minor:'computer-science'});
 await controller.click({dataset:{action:'dashboard-target',targetType:'internships',targetIndex:'0'}});assert.ok(!modal.includes('Computer Systems'));
 const guided={phase:'journey',plan:null,draftPlan:null,journey:j};state=guided;
 await controller.click({dataset:{action:'dashboard-target',targetType:'exchanges',targetIndex:'0'}});assert.ok(modal.includes('Computer Systems'));
}finally{globalThis.fetch=originalFetch;}
html=experienceCards([old],journey,'internships');assert.ok(html.includes('Programming and building products'));assert.ok(!html.includes('<details'));
console.log('Passed '+checked+' compatible target/profile paragraphs across eight degrees, exact screenshot regressions, genuine model rationale/freshness, undecided/negative answers, safe official links, HTML escaping, relevant exchange restrictions and real guided/saved zero-allowance modals. No live calls.');
