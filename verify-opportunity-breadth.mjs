import assert from 'node:assert/strict';
import fs from 'node:fs';
import O from './dist/opportunities.js';
import {DATA,normalizeProfile} from './dist/planner.js';
import {newJourney,makePlan,validateSavedWorkspace,emptyWorkspace} from './dist/guidance.js';
import {acceptAdvice} from './dist/journey-state.js';
import {agentContext} from './dist/agent-context.js';
import {advise,availableTargets,canonicalTargetKeys,opportunityRefinementPolicy} from './server/advisor.mjs';
import {companySizePreference,rankOpportunityTargets} from './dist/opportunity-matching.js';
import {exchangeScheme,companyType,companySector,opportunityLabel} from './dist/opportunity-labels.js';
import {experienceCards} from './dist/views.js';
import {dashboardView} from './dist/dashboard-view.js';
import {createDashboardController} from './dist/dashboard-controller.js';
import {openaiFixture} from './tests/openai-fixture.mjs';
import {researchFor} from './server/research.mjs';
import {createWorkbook} from './dist/export.js';
import {STAGE_CHANGES,GLOBAL_CHANGES,AI_REQUEST_BUDGET} from './dist/service-policy.js';

const addition=JSON.parse(fs.readFileSync('data/guidance/companies-breadth-v14.json','utf8'));
assert.equal(addition.internships.length,52);assert.equal(O.internships.length,92);
assert.deepEqual([STAGE_CHANGES,GLOBAL_CHANGES,AI_REQUEST_BUDGET],[2,5,0.25]);
for(const t of addition.internships){
 assert.ok(t.moroccoEvidence&&t.fields.length&&t.programs.length&&t.fitIsInference);
 assert.ok(t.sources.every(s=>s.primary&&s.checkedAt==='2026-10-21'&&s.url.startsWith('https://')));
 assert.match(t.availability,/must be confirmed/);assert.equal(t.selectionProbabilityKnown,false);
 assert.notEqual(companyType(t),'Morocco');
 assert.doesNotMatch(opportunityLabel(t),/unconfirmed|unknown|startup|scaleup|established company/i);
}
const seen=new Set();for(const t of O.internships)for(const key of canonicalTargetKeys(t)){
 assert.ok(!seen.has(key),'New records cannot be aliases counted as extra companies: '+key);seen.add(key);
}
assert.equal(companyType({id:'wafr',organizationType:'established'}),'Startup','Reviewed company type also fixes old labels.');
assert.equal(companyType({organizationType:'scaleup'}),'Scaleup');
assert.equal(companyType({organizationType:'unknown'}),'Company');
assert.equal(companySector({id:'green-watech'}),'Water & environment');
assert.equal(opportunityLabel({id:'green-watech',organizationType:'unknown'}),'Water & environment · Morocco');
assert.equal(companySizePreference({refinement:'Avoid startups; focus on established companies.',questionnaire:{industries:'Startups and small businesses'}}),'established');
assert.equal(companySizePreference({refinement:'Companies that are startups, please.'}),'startup');
assert.equal(companySizePreference({refinement:'Startups rather than large companies.'}),'startup');
const pair=[{id:'large',name:'Large',organizationType:'established'},{id:'small',name:'Small',organizationType:'startup'}];
assert.equal(rankOpportunityTargets(pair,{refinement:'Avoid startups.'},'internships',{limit:1})[0].id,'large');
for(const t of O.exchanges){
 assert.ok(['PEL','Bilateral Exchange'].includes(exchangeScheme({id:t.id})),t.name);
 assert.equal(exchangeScheme({id:t.id,scheme:'ISEP Exchange'}),exchangeScheme(t),'An institution in ISEP does not change the source-defined route.');
 assert.ok(experienceCards([{id:t.id,name:t.name,reason:'Old saved reason.'}],{},'exchanges').includes(exchangeScheme(t)));
}
assert.equal(exchangeScheme({scheme:'ISEP'}),'ISEP Exchange');
assert.equal(exchangeScheme({scheme:'ISEP Exchange'}),'ISEP Exchange');
assert.equal(exchangeScheme({name:'Unverified member'}),'Exchange route to confirm');

let calls=0;
const env={OPENAI_API_KEY:'synthetic-breadth-only',OPENAI_WEB_RESEARCH:'off',GOPLAN_TOKEN_COUNTER:async()=>1000};
const provider=async(_,init)=>{
 calls++;const body=JSON.parse(init.body),context=JSON.parse(body.input);
 assert.ok(context.companies.length<=24&&context.exchangeDestinations.length<=20,'The bigger repository must not expand paid prompt limits.');
 const pick=(records,type)=>{
  const n=Math.min(5,records.length),list=records.slice(0,n).map((t,i)=>({id:t.id,tier:i<n-2?'reach':i===n-2?'target':'safety',reason:'A concrete subject match to explore.',tierReason:'',industryReason:'',answerIds:['ambitions'],evidenceIds:[]}));
  return list;
 };
 const result={summary:'Relevant company choices.',internships:pick(context.companies,'internships'),exchanges:pick(context.exchangeDestinations,'exchanges'),update:{summary:'New companies to compare.',changes:[],limitations:[]}};
 if(context.request.refinement){result.intent='update';result.answer='';}
 return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
};
const coverage=[];
for(const degree of DATA.programs.filter(p=>p.level==='undergraduate')){
 let j=newJourney();j.programChosen=true;j.profile=normalizeProfile({program:degree.id,track:degree.tracks[0]?.id||''});j.questionnaire={ambitions:'Apply my studies to practical work.',activities:'Programming and building products'};
 const keys=new Set();let originalExchanges;
 for(let round=0;round<3;round++){
  if(round)j.refinements.targets=round===1?'Focus the companies on practical work in my degree.':'Prioritize companies where I can apply my studies.';
  const request={stage:'targets',flowVersion:5,programChosen:true,profile:j.profile,questionnaire:j.questionnaire,...agentContext(j,'targets')};
  if(round)assert.equal(opportunityRefinementPolicy(request.refinement,request.currentRecommendation).preferNovel,true,'Ordinary revisions must not depend on a novelty keyword.');
  const out=await advise(request,env,provider);
  assert.equal(out.internships.length,5);
  for(const company of out.internships){for(const key of canonicalTargetKeys(company)){assert.ok(!keys.has(key),degree.id+': both allowed refinements must explore unseen companies.');keys.add(key);}}
  if(!round)originalExchanges=out.exchanges.map(t=>({id:t.id,scheme:t.scheme,reason:t.reason}));
  else assert.deepEqual(out.exchanges.map(t=>({id:t.id,scheme:t.scheme,reason:t.reason})),originalExchanges,'Company changes must preserve the exchange list and its source scheme.');
  acceptAdvice(j,'targets',out);
  const restored=validateSavedWorkspace(JSON.parse(JSON.stringify({...emptyWorkspace(),journey:j,plan:makePlan(j),phase:'saved'})));
  j=newJourney(restored.plan);
 }
 assert.equal(j.seenTargetIds.internships.length,15);
 coverage.push({degree:degree.id,compatibleCompanies:availableTargets('internships',j.profile).length,distinctShown:15});
}
assert.equal(calls,24,'Three shortlists for eight degrees must need exactly 24 provider responses, without repairs.');

// Existing saved plans get labels at zero allowance, with no writes or AI calls.
const bilateral=O.exchanges.find(t=>t.scheme==='Bilateral'),pel=O.exchanges.find(t=>t.scheme==='PEL');
const j=newJourney();j.programChosen=true;j.profile=normalizeProfile({program:'BSCSC',track:'CSYS'});
const old=t=>({id:t.id,name:t.name,country:t.country,reason:'Old saved match.'});
j.details={summary:'Saved matches.',internships:[old(O.internships.find(t=>t.id==='wafr'))],exchanges:[old(bilateral),old(pel),{name:'ISEP example',scheme:'ISEP Exchange',country:'USA',reason:'A saved ISEP route.'}]};
const state={...emptyWorkspace(),phase:'saved',plan:makePlan(j),journey:j},before=JSON.stringify(state),runtime={service:{step:5,saved:true,globalRemaining:0},dashboardPanel:'opportunities',targetGroup:'exchanges'};
const html=dashboardView(state,runtime);for(const route of ['Bilateral Exchange','PEL','ISEP Exchange'])assert.ok(html.includes(route),route);
let modal='';const controller=createDashboardController({runtime,read:()=>state,modal:v=>modal=v,head:(title,subtitle)=>title+' '+subtitle,render(){},persist:()=>assert.fail('Reading labels cannot rewrite a plan.'),getAdvice:()=>assert.fail('Reading labels cannot spend an AI change.')});
for(let i=0;i<3;i++){await controller.click({dataset:{action:'dashboard-target',targetType:'exchanges',targetIndex:String(i)}});assert.ok(modal.includes(['Bilateral Exchange','PEL','ISEP Exchange'][i]));}
await controller.click({dataset:{action:'dashboard-target',targetType:'internships',targetIndex:'0'}});assert.ok(modal.includes('Retail technology · Morocco'));
assert.equal(JSON.stringify(state),before);
const workbook=await createWorkbook(state.plan.terms,state.plan.courses,state.plan.profile,[],[],fs.readFileSync('dist/template-styles.xml','utf8'),state.plan);
const workbookText=new TextDecoder().decode(workbook);
for(const route of ['Bilateral Exchange','PEL','ISEP Exchange'])assert.ok(workbookText.includes(route),'The exported roadmap must retain '+route);

// Live discovery receives the older shown names too, within the same tool budget.
let searchWire='';await researchFor({profile:j.profile,questionnaire:{ambitions:'Build software products'},refinement:'Focus the companies on software.',currentTargets:{internships:[{name:'Current company'}]},reviewedShownCompanies:[{name:'Company from first shortlist'}]},'targets',{OPENAI_API_KEY:'synthetic-research-only',OPENAI_WEB_RESEARCH:'on'},async(_,init)=>{searchWire=JSON.stringify(JSON.parse(init.body));return Response.json({error:{message:'Synthetic research unavailable'}},{status:503});});
assert.ok(searchWire.includes('Company from first shortlist'));assert.ok(searchWire.includes('at least three relevant subsectors'));assert.ok(searchWire.includes('"max_tool_calls":4'));
console.log('Passed 92 distinct sourced companies, 52 new records, unchanged AUI routes, consistent labels in saved/legacy cards and zero-allowance modals, latest size preferences, full discovery history, and 24 synthetic selections covering both ordinary company revisions across all eight degrees: '+JSON.stringify(coverage));
