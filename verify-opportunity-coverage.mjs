import assert from 'node:assert/strict';
import fs from 'node:fs';
import OPPORTUNITIES from './dist/opportunities.js';
import {DATA} from './dist/planner.js';
import {availableTargets,advise,canonicalTargetKeys} from './server/advisor.mjs';
import {rankOpportunityTargets,opportunityInterests} from './server/opportunity-matching.mjs';
import {newJourney} from './dist/guidance.js';
import {acceptAdvice} from './dist/journey-state.js';
import {agentContext} from './dist/agent-context.js';
import {openaiFixture} from './tests/openai-fixture.mjs';

const source=JSON.parse(fs.readFileSync('data/guidance/exchanges-v4.json','utf8'));
const addition=JSON.parse(fs.readFileSync('data/guidance/opportunities-variety-v13.json','utf8'));
for(const patch of addition.exchangePatches){
 const original=source.exchanges.find(t=>t.id===patch.id),record=OPPORTUNITIES.exchanges.find(t=>t.id===patch.id);
 assert.ok(original&&record,'Every added institution must already be in the supplied AUI list.');
 for(const field of ['id','name','country','scheme','term','exchangeType','documentParagraph','listedSpots','businessOnly','subjectRestrictions','levelRestriction'])assert.deepEqual(record[field],original[field],field+' must retain the AUI route restriction.');
 assert.ok(original.constraints.every(value=>record.constraints.includes(value)));
 assert.ok(original.eligibility.every(value=>record.eligibility.includes(value)));
 assert.equal(record.availabilityConfirmed,false);assert.equal(record.placementConfirmed,false);assert.ok(!record.graduateAccessVerified);
 assert.ok(record.sources.some(s=>s.primary&&s.checkedAt===addition.reviewedAt));
 assert.ok(record.constraints.includes(patch.reason));
}
for(const type of ['internships','exchanges']){
 const keys=new Set();
 for(const record of OPPORTUNITIES[type])for(const key of ['id:'+record.id,...canonicalTargetKeys(record,type)]){
  assert.ok(!keys.has(key),'The reviewed pool must not count organization aliases as extra choices: '+key);keys.add(key);
 }
}

const interests=['Software products and artificial intelligence','Finance investment accounting and banking','Creative media film writing and marketing','Water climate agriculture and environmental policy','Energy renewable power systems and engineering'];
const coverage=[];
for(const program of DATA.programs.filter(p=>p.level==='undergraduate')){
 const profile={...newJourney().profile,program:program.id,track:program.tracks[0]?.id||'',secondTrack:'',minor:''};
 const row={program:program.id};
 for(const type of ['internships','exchanges']){
  const records=availableTargets(type,profile);row[type]=records.length;assert.ok(records.length>=15,program.id+' '+type+' must support at least three distinct five-item shortlists.');
  const firstLists=[];
  for(const text of interests){
   const request={profile,questionnaire:{ambitions:text,activities:text},refinement:''};
   const first=rankOpportunityTargets(records,request,type,{limit:5});firstLists.push(first.map(t=>t.id).join(','));
   assert.equal(new Set(first.map(t=>t.id)).size,5);
   assert.deepEqual(rankOpportunityTargets([...records].reverse(),request,type,{limit:5}),first,'Input ordering must not decide recommendations.');
   const seen=[];
   for(let round=0;round<Math.ceil(records.length/5);round++){
    const unseen=records.filter(t=>!seen.includes(t.id)),next=rankOpportunityTargets(records,{...request,refinement:type==='internships'?'Show different internship companies.':'Show different exchange institutions.',seenTargetIds:{[type]:seen}},type,{limit:5});
    assert.equal(next.filter(t=>!seen.includes(t.id)).length,Math.min(5,unseen.length),'Do not cycle into history while supported unseen alternatives remain.');
    seen.push(...next.map(t=>t.id));
   }
   assert.equal(new Set(seen).size,records.length,'Repeated alternatives must explore the whole compatible pool.');
  }
  assert.ok(new Set(firstLists).size>=3,program.id+' '+type+' must react to different interests.');
 }
 coverage.push(row);
}

const tieRecords=Array.from({length:12},(_,i)=>({id:'tie-'+i,name:'Neutral '+i,tags:[]})),tied={profile:{program:'BSCSC',track:'CSYS',secondTrack:'AI'},questionnaire:{ambitions:'Undecided'}};
assert.notDeepEqual(rankOpportunityTargets(tieRecords,tied,'internships').map(t=>t.id),rankOpportunityTargets(tieRecords,{...tied,profile:{...tied.profile,secondTrack:'CSEC'}},'internships').map(t=>t.id),'The second focus participates in stable tie ordering.');
assert.ok(opportunityInterests(tied).secondFocus);
const exchangeRecords=[{id:'neutral',name:'Neutral',tags:[]},{id:'label-only',name:'Label only',tags:[],organizationType:'startup'}],startupRequest={profile:{program:'BBA',track:'FIN'},questionnaire:{ambitions:'Startups'}};
assert.equal(rankOpportunityTargets(exchangeRecords,startupRequest,'exchanges').find(t=>t.id==='label-only').matchScore,0,'Company-size preference must not boost exchange institutions.');
assert.equal(rankOpportunityTargets(exchangeRecords,startupRequest,'internships').find(t=>t.id==='label-only').matchScore,20);

let calls=0;
const env={OPENAI_API_KEY:'synthetic-coverage-only',OPENAI_WEB_RESEARCH:'off',GOPLAN_TOKEN_COUNTER:async()=>1000};
const picks=records=>records.slice(0,5).map((t,i)=>({id:t.id,tier:i<3?'reach':i===3?'target':'safety',reason:'Explore the documented subject match.',tierReason:'Compare preparation before applying.',industryReason:'Subject fit is inferred from reviewed evidence.',answerIds:['ambitions'],evidenceIds:[]}));
const provider=async(_,init)=>{
 calls++;const body=JSON.parse(init.body),context=JSON.parse(body.input);
 assert.ok(context.companies.length<=24);assert.ok(context.exchangeDestinations.length<=20);
 return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Supported alternatives.',internships:picks(context.companies),exchanges:picks(context.exchangeDestinations),update:{summary:'Different supported suggestions.',changes:[],limitations:[]}})}]}]});
};
for(const program of DATA.programs.filter(p=>p.level==='undergraduate'))for(const type of ['internships','exchanges']){
 const j=newJourney();j.profile={...j.profile,program:program.id,track:program.tracks[0]?.id||'',secondTrack:'',minor:''};j.programChosen=true;j.questionnaire={ambitions:'Explore practical choices in my degree.'};
 const input=()=>({stage:'targets',flowVersion:5,programChosen:true,profile:j.profile,questionnaire:j.questionnaire,...agentContext(j,'targets')});
 acceptAdvice(j,'targets',await advise(input(),env,provider));
 const preservedType=type==='internships'?'exchanges':'internships',preservedIds=j.details[preservedType].map(t=>t.id),records=availableTargets(type,j.profile);
 for(const remaining of [1,2,3,4,0]){
  // The current five are already shown. Leave only a final small suffix unseen.
  const currentIds=new Set(j.details[type].map(t=>t.id)),unseen=remaining?records.filter(t=>!currentIds.has(t.id)).slice(-remaining):[],unseenIds=unseen.map(t=>t.id);
  j.seenTargetIds[type]=records.filter(t=>!unseenIds.includes(t.id)).map(t=>t.id);
  j.refinements.targets=type==='internships'?'Show different internship companies; keep my exchanges.':'Show different exchange institutions; keep my companies.';
  const out=await advise(input(),env,provider);
  assert.ok(unseenIds.every(id=>out[type].some(t=>t.id===id)),program.id+' '+type+': the model must receive every remaining unseen option.');
  assert.equal(out[type].filter(t=>currentIds.has(t.id)).length,0,'Use older history instead of the immediately displayed list when filling a nearly exhausted pool.');
  assert.deepEqual(out[preservedType].map(t=>t.id),preservedIds,'Changing one category must preserve the other.');
 }
}
assert.equal(calls,96,'History recovery must not use repair loops or extra model requests.');
console.log('Passed all 8 undergraduate degrees, source route preservation, alias checks, all-pool exploration, profile variety, second focus, scoped company preferences, and 96 synthetic initial/near-exhausted/fully-exhausted selections. Coverage: '+JSON.stringify(coverage)+'. No live calls.');
