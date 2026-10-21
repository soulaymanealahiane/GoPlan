import assert from 'node:assert/strict';
import {academicEdit} from './server/edit-intent.mjs';
import {normalizeProfile,coursesFor,DATA} from './dist/planner.js';
import {newJourney,suggestChoices,makePlan,emptyWorkspace,validateSavedWorkspace} from './dist/guidance.js';
import {checkedMinorPlan} from './dist/minor-plan.js';
import {minorSummary} from './dist/minor-summary.js';
import {prerequisiteCoverage} from './dist/course-eligibility.js';
import {createDashboardController} from './dist/dashboard-controller.js';
import {localDatabase} from './server/local-db.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {serviceEntitlement} from './server/service-allowance.mjs';
import {handleApi} from './server/api.mjs';
import {availableTargets} from './server/advisor.mjs';
import {openaiFixture} from './tests/openai-fixture.mjs';

const request="Recommend and implement for me a minor that won't require me to take an additional extra course on top of my degree.";
const paraphrase='Recommend and implement a suitable replacement minor whose complete requirements fit my existing approved degree slots.';
const q={ambitions:'Work on climate and sustainable engineering.',activities:'Design renewable energy solutions.',strengths:'Mathematics and system design.'};
const j=newJourney();j.profile=normalizeProfile({program:'BSGE',track:'CS',minor:'mathematics',priorCodes:['CSC1402']});j.programChosen=true;j.questionnaire=q;j.profile=suggestChoices(j).profile;
const alternatives=academicEdit(paraphrase,j.profile,undefined,q);assert.ok(alternatives.options.some(o=>o.verified));assert.ok(alternatives.patch.minor);assert.ok(alternatives.options.find(o=>o.id===alternatives.patch.minor).coursePlan);
j.details={summary:'My existing choices.',choices:j.profile.choices,...Object.fromEntries(['internships','exchanges'].map(type=>[type,availableTargets(type,j.profile).slice(0,5).map((t,i)=>({...t,tier:i<3?'reach':i===3?'target':'safety',reason:'Keep this unrelated recommendation.'}))]))};
const original=makePlan(j);original.tracking.csc1402={status:'completed',note:'PRIVATE-COMPLETED-NOTE'};original.tracking.eng1301={status:'in-progress',note:'PRIVATE-CURRENT-NOTE'};
const currentTerm=original.terms.find(t=>t.courses.includes('eng1301')).id;
const DB=localDatabase(':memory:'),uid='minor-recommendation-flow',session=await testSession(DB,uid),oldFetch=globalThis.fetch,OldForm=globalThis.FormData,BASE='https://planwithgoplan.com';
const env={DB,OPENAI_API_KEY:'synthetic-minor-recommendation',OPENAI_WEB_RESEARCH:'off',OPENAI_DIRECTION_RESEARCH:'off',GOPLAN_TOKEN_COUNTER:async()=>1000};
const providerStages=[],receipts=[];
const provider=async(url,init)=>{
 assert.equal(url,'https://api.openai.com/v1/responses');assert.ok(!init.body.includes('PRIVATE-'));const b=JSON.parse(init.body),c=JSON.parse(b.input),stage=b.text.format.name.replace('goplan_','');providerStages.push(stage);let r;
 if(stage==='change')r={kind:'journey',startStep:2,summary:'Choose a suitable minor.',questions:[],sections:['direction','courses'],rebuild:false,questionnaireChanges:[],instructions:{direction:'Recommend a suitable alternative minor.',courses:'Update the related course choices.',companies:'',exchanges:'',semesters:''}};
 else if(stage==='direction'){
  assert.equal(c.originalChangeRequest,request,'The original constraint must survive the lossy router paraphrase.');assert.ok(c.minorEditOptions.some(o=>o.verified));
  r={kind:'clarify',summary:'I cannot safely implement a replacement: the supplied information does not verify any alternative minor whose full requirements, including prerequisites, fit existing approved degree slots.',questions:['Establish the minor rules first.'],intent:'clarify',answer:'I cannot safely implement a replacement: no alternative is verified.',academic:{program:'',track:'',secondTrack:'',minor:'',rationale:'',focusRationale:'',secondFocusRationale:'',minorRationale:''}};
 }else throw Error('A verified course recommendation must be applied directly; do not ask a second model to invent it again: '+stage);
 r.update={summary:r.summary,changes:[],limitations:[]};return openaiFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(r)}]}]});
};
try{
 globalThis.FormData=class{constructor(form){this.form=form;}get(k){return this.form.values[k];}};
 globalThis.fetch=async(url,init={})=>{const r=await handleApi(new Request(BASE+url,{...init,headers:{Origin:BASE,...session,'Content-Type':'application/json',...init.headers}}),env,{fetcher:provider});if(url==='/api/advice'&&JSON.parse(init.body).stage==='direction')receipts.push(await r.clone().json());return r;};
 const owner=await serviceEntitlement(DB,uid);await DB.prepare('UPDATE service_entitlements SET step=5,saved=1,initial_mask=31 WHERE id=?').bind(owner.id).run();
 let state={...emptyWorkspace(),phase:'saved',plan:original,journey:newJourney(original)},runtime={};
 const controller=createDashboardController({runtime,read:()=>state,account:()=>({firstName:'Synthetic'}),render(){},changed(){},persist(){},notify(){},modal(){},head:()=>'',close(){},getAdvice(){throw Error('Unexpected legacy editor.');}});
 await controller.loadService();const untouched=JSON.stringify(original);
 await controller.submit({id:'dashboard-command-form',values:{request}});
 assert.equal(runtime.aiError,'',runtime.aiError);assert.equal(state.phase,'draft');assert.equal(runtime.service.globalRemaining,4);assert.equal(JSON.stringify(state.plan),untouched);assert.deepEqual(providerStages,['change','direction']);
 const next=state.draftPlan,recipe=receipts[0].coursePlan;assert.ok(recipe);assert.notEqual(next.profile.minor,'mathematics');assert.equal(next.profile.program,'BSGE');assert.equal(next.profile.track,'CS');assert.deepEqual(next.profile.choices,recipe.choices,'Apply the exact course selection that established fit.');assert.equal(minorSummary(next.profile).complete,true);assert.equal(minorSummary(next.profile).approvalRequired,false);
 const checked=checkedMinorPlan(next.profile,recipe,{protectedCodes:['CSC1402','ENG1301']});assert.ok(checked.courses.length);const minorRows=next.courses.filter(c=>c.minorId===next.profile.minor),pending=new Set(next.terms.find(t=>t.id==='pending')?.courses||[]);assert.ok(minorRows.every(c=>c.code&&!pending.has(c.id)&&!c.approvalOnly));assert.ok(!prerequisiteCoverage(next.courses,next.profile.priorCodes).issues.some(i=>minorRows.some(c=>c.id===i.id)));assert.equal(next.courses.length,coursesFor(next.profile).length,'No supplementary requirement was appended.');
 assert.equal(next.tracking.csc1402.note,'PRIVATE-COMPLETED-NOTE');assert.equal(next.tracking.eng1301.note,'PRIVATE-CURRENT-NOTE');assert.ok(next.terms.find(t=>t.id===currentTerm).courses.includes('eng1301'));assert.deepEqual(next.targets,original.targets);validateSavedWorkspace(JSON.parse(JSON.stringify(state)));
 const profile=await globalThis.fetch('/api/account/profile',{method:'POST',body:JSON.stringify({firstName:'Synthetic',lastName:'Student',consentCloud:true})});assert.equal(profile.status,200);const id=crypto.randomUUID();const save=await globalThis.fetch('/api/account/workspaces/'+id,{method:'PUT',body:JSON.stringify({revision:0,state})});assert.equal(save.status,200,await save.text());const read=await globalThis.fetch('/api/account/workspaces/'+id);const reloaded=(await read.json()).state.draftPlan;assert.equal(reloaded.profile.minor,next.profile.minor);assert.deepEqual(reloaded.profile.choices,recipe.choices);assert.deepEqual(reloaded.terms,next.terms);
 assert.throws(()=>checkedMinorPlan(next.profile,{...recipe,choices:{...recipe.choices,arbitrary:'CSC1401'}}),/not supported/);
 console.log('PASS exact recommend-and-implement prompt through a lossy router and refusing Direction model: selected '+next.minor.name+', applied all '+minorRows.length+' source-defined minor courses, no supplementary degree slot, one allowance, two provider replies, protected study, untouched targets and cloud reload.');
}finally{globalThis.fetch=oldFetch;globalThis.FormData=OldForm;DB.close();}

let profiles=0,verified=0;
for(const p of DATA.programs.filter(p=>p.level==='undergraduate')){
 const profile=normalizeProfile({program:p.id,track:p.tracks[0]?.id||'',minor:p.id==='BBA'?'computer-science':'mathematics'}),edit=academicEdit(request,profile,undefined,q),option=edit.options.find(o=>o.id===edit.patch.minor);profiles++;
 if(option){assert.equal(option.verified,true);checkedMinorPlan({...profile,minor:option.id},option.coursePlan);verified++;}
}
assert.equal(profiles,8);assert.equal(verified,8,'Every representative undergraduate degree must yield an actual source-validated alternative, not a canned refusal.');
console.log('PASS verified concrete minor course recipes for all eight undergraduate degree profiles. Synthetic providers and isolated storage only.');
