import assert from 'node:assert/strict';
import {advise,availableTargets,canonicalTargetKeys} from './server/advisor.mjs';
import {reviewedOpportunityShortlist} from './server/opportunity-recovery.mjs';
import {normalizeProfile} from './dist/planner.js';
import {REQUEST_BUDGET_USD} from './server/request-policy.mjs';

const questionnaire={ambitions:'Build useful AI products for Moroccan businesses.',activities:'Programming, system design and solving engineering problems.',strengths:'Mathematics and practical experiments.'};
const profiles=[normalizeProfile({program:'BSCSC',track:'CSYS',secondTrack:'AI',minor:'business-administration'}),normalizeProfile({program:'BSEMS',track:'MLE'})];
const env={OPENAI_API_KEY:'synthetic-target-resilience-only',OPENAI_WEB_RESEARCH:'off',GOPLAN_SERVICE_ACTION_KIND:'initial'};
const input=profile=>({stage:'targets',flowVersion:5,programChosen:true,profile,questionnaire,refinement:'Choose company recommendations.'});
const wire=(value,{status='completed',usage={input_tokens:18000,output_tokens:2500},incomplete_details}={})=>Response.json({status,usage,incomplete_details,output:[{content:[{type:'output_text',text:typeof value==='string'?value:JSON.stringify(value)}]}]});
function proposal(context){
 const items=records=>records.slice(0,5).map(record=>({id:record.id,reason:'Connect your technical interests with practical projects.',tierReason:'Compare preparation requirements and subject fit.',industryReason:'Fit is inferred from the reviewed organization record.',answerIds:['ambitions','activities'],evidenceIds:[]}));
 const tiers=items=>({reach:items.slice(0,-2),target:items.slice(-2,-1),safety:items.slice(-1)});
 return {summary:'Your shortlist.',internships:tiers(items(context.companies)),exchanges:tiers(items(context.exchangeDestinations)),update:{summary:'Your supported shortlist.',changes:[],limitations:[]}};
}
function validateShortlist(result,profile){
 for(const type of ['internships','exchanges']){
  assert.equal(result[type].length,5);assert.equal(new Set(result[type].map(t=>t.id)).size,5);
  const keys=new Set();for(const item of result[type]){assert.ok(availableTargets(type,profile).some(t=>t.id===item.id));for(const key of canonicalTargetKeys(item,type)){assert.ok(!keys.has(key));keys.add(key);}assert.ok(item.sourceUrl);}
  assert.deepEqual(result[type].map(t=>t.tier),['reach','reach','reach','target','safety']);
 }
}
const seen=[];
const provider=handler=>async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(init.body),context=JSON.parse(body.input);seen.push({body,context});assert.equal(body.service_tier,'default');assert.equal(body.max_output_tokens,5000);return handler(context,seen.length);};
const counted={...env,GOPLAN_TOKEN_COUNTER:async body=>Math.ceil(JSON.stringify(body).length/4)};
assert.equal(REQUEST_BUDGET_USD,0.25);

for(const profile of profiles){
 seen.length=0;
 const first=await advise(input(profile),counted,provider(context=>wire(proposal(context))));
 assert.equal(first.source,'openai');assert.equal(seen.length,1);validateShortlist(first,profile);
 const initial={...input(profile),refinement:'Choose exchange destinations and preserve the company recommendations.',currentRecommendation:first};
 seen.length=0;
 const same=await advise(initial,counted,provider(context=>{
  const value=proposal(context);
  for(const type of ['internships','exchanges']){
   const rows=first[type].map(({id,reason,tierReason,industryReason,answerIds,evidenceIds})=>({id,reason,tierReason,industryReason,answerIds,evidenceIds}));
   value[type]={reach:rows.slice(0,3),target:rows.slice(3,4),safety:rows.slice(4,5)};
  }
  return wire(value);
 }));
 assert.equal(same.source,'openai');assert.equal(seen.length,1,'A valid no-op initial Exchanges stage must not trigger a paid repair.');
 assert.deepEqual(same.internships.map(t=>t.id),first.internships.map(t=>t.id));
 assert.deepEqual(same.exchanges.map(t=>t.id),first.exchanges.map(t=>t.id));

 for(const invalid of ['duplicate','empty','malformed','truncated']){
  seen.length=0;
  const repaired=await advise(input(profile),counted,provider((context,n)=>{
   const valid=proposal(context);if(n>1){assert.ok(context.repair);return wire(valid);}
   if(invalid==='malformed')return wire('{"summary":"partial",');
   if(invalid==='truncated')return wire('',{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:18000,output_tokens:5000}});
   if(invalid==='duplicate')valid.internships.reach[1]=valid.internships.reach[0];
   else valid.internships={reach:[],target:[],safety:[]};
   return wire(valid);
  }));
  assert.equal(seen.length,2,invalid+' gets one bounded repair');assert.equal(repaired.source,'openai');validateShortlist(repaired,profile);
 }

 for(const failure of ['duplicate','malformed','truncated','provider','transport','envelope']){
  seen.length=0;
  const recovered=await advise(input(profile),counted,provider(context=>{
   if(failure==='transport')throw Object.assign(Error('Synthetic ambiguous disconnect'),{cause:{code:'ECONNRESET'}});
   if(failure==='provider')return Response.json({error:{code:'server_error'}},{status:503});
   if(failure==='envelope')return new Response('{',{headers:{'Content-Type':'application/json'}});
   if(failure==='malformed')return wire('{');
   if(failure==='truncated')return wire('',{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}});
   const value=proposal(context);value.internships.reach[1]=value.internships.reach[0];return wire(value);
  }));
  assert.equal(recovered.source,'reviewed');assert.equal(recovered.recovery,'reviewed-opportunity-shortlist');
  assert.equal(seen.length,['transport','provider','envelope'].includes(failure)?1:2,'No unbounded or ambiguous provider retries');
  assert.equal(recovered.research.status,'reviewed');assert.match(recovered.update.limitations[0],/need confirmation/);validateShortlist(recovered,profile);
 }

 seen.length=0;
 const budget=await advise(input(profile),{...env,GOPLAN_TOKEN_COUNTER:async()=>60000},provider(context=>{
  const value=proposal(context);value.internships.reach[1]=value.internships.reach[0];return wire(value,{usage:{input_tokens:60000,output_tokens:5000}});
 }));
 assert.equal(seen.length,1);assert.equal(budget.source,'reviewed');assert.equal(budget.recoveryReason,'budget');validateShortlist(budget,profile);

 // Recovery is never permission to turn an explicit user revision into a fake
 // successful edit or to silently replace the preserved exchange shortlist.
 seen.length=0;
 await assert.rejects(()=>advise({...input(profile),refinement:'Find different internship companies; preserve my exchanges.',currentRecommendation:first},{...counted,GOPLAN_SERVICE_ACTION_KIND:'stage'},provider(()=>wire('{'))),/could not verify/);
 assert.equal(seen.length,2);
 const reviewed=reviewedOpportunityShortlist(initial);
 assert.deepEqual(reviewed.internships.map(t=>t.id),first.internships.map(t=>t.id));
 assert.deepEqual(reviewed.internships.map(t=>t.reason),first.internships.map(t=>t.reason));
 validateShortlist(reviewed,profile);
}

let search=0,adviceCalls=0;
const researchUnavailable=await advise(input(profiles[0]),{...counted,OPENAI_WEB_RESEARCH:'on'},async(_,init)=>{
 const body=JSON.parse(init.body);
 if(body.tools){search++;return Response.json({error:{code:'insufficient_quota'}},{status:429});}
 adviceCalls++;return wire(proposal(JSON.parse(body.input)));
});
assert.equal(search,1);assert.equal(adviceCalls,1);assert.equal(researchUnavailable.source,'openai');assert.equal(researchUnavailable.research.status,'unavailable');validateShortlist(researchUnavailable,profiles[0]);
assert.throws(()=>reviewedOpportunityShortlist({...input(profiles[0]),goal:'x',questionnaire:{}}),/Describe your goals/);
console.log('Passed real target prompt/validator regressions for Computer Systems + AI + BA minor and BSEMS: valid initial Exchanges no-op, one bounded schema/truncation repair, reviewed initial recovery after budget/provider/output failures, preserved targets, no fabricated sources, and explicit revision failure isolation. No live calls.');
