// Synthetic admitted/continuing journeys plus the real browser account
// controller and in-memory cloud API. No credentials or live inference.
import assert from 'node:assert/strict';
import {testSession} from './tests/session-fixture.mjs';
import {localDatabase} from './server/local-db.mjs';
import {handleApi} from './server/api.mjs';
import {createAccountWorkspace} from './dist/accounts.js';
import {newJourney,makePlan,emptyWorkspace,validateSavedWorkspace} from './dist/guidance.js';
import {buildProposal} from './dist/workspace-flow.js';
import {planningWorkspace,normalizeStudentContext,publicStudentContext} from './dist/student-context.js';
import {requestAdvice,resetAdviserSession} from './dist/ai-client.js';
import {acceptAdvice,adviceFingerprint} from './dist/journey-state.js';
import {homeView} from './dist/home-view.js';
import {DATA,limits} from './dist/planner.js';
import {adviseJourney} from './server/journey-agent.mjs';
import {groqFixture} from './tests/groq-fixture.mjs';
import {AXES} from './dist/evidence.js';

let passed=0;
async function test(name,body){await body();passed++;console.log('PASS '+name);}
const admitted=intent=>({route:'admitted',degreeIntent:intent,currentDegree:'BBA',currentTerm:'Fall-2026',studyStartYear:2026,records:[]});
const continuing=intent=>({route:'continuing',degreeIntent:intent,currentDegree:'BSCSC',currentTerm:'Spring-2027',studyStartYear:2026,records:[{courseCode:'CSC1401',status:'completed',termId:'Fall-2026',grade:'A',note:'PRIVATE COMPLETED NOTE'},{courseCode:'CSC2302',status:'in-progress',termId:'Spring-2027',grade:'',note:'PRIVATE CURRENT NOTE'},{courseCode:'FRN3210',status:'completed',termId:'prior',grade:'',note:'Synthetic confirmed language qualification'}]});
const keepAdmitted=planningWorkspace({studentContext:admitted('keep')});
const exploreAdmitted=planningWorkspace({studentContext:admitted('explore')});
const keepContinuing=planningWorkspace({studentContext:continuing('keep')});
const exploreContinuing=planningWorkspace({studentContext:continuing('explore')});

await test('The provider receives only public study context and cannot change a kept degree',async()=>{
 const input={stage:'direction',flowVersion:5,studentContext:continuing('keep'),level:'undergraduate',preferredDegree:'BSCSC',questionnaire:{ambitions:'Build useful technology products',activities:'Program and analyze problems',strengths:'Mathematics and problem solving'},profile:{}},env={GROQ_WEB_RESEARCH:'off',GROQ_API_KEY:'fixture-secret'};
 const proposal={kind:'recommend',summary:'Study software engineering.',themes:['Software'],questions:[],academic:{program:'BSCSC',track:'SE',secondTrack:'',minor:'',rationale:'Software foundations.',focusRationale:'Reliable systems.',secondFocusRationale:'Keep a manageable load.',minorRationale:'Compare optional complements.'},tradeoffs:[],assessment:Object.keys(AXES).map(axis=>({axis,explanation:'Related to the stated goals; evidence is limited.',answerIds:['ambitions'],evidenceIds:[]}))};
 const reply=value=>groqFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
 const result=await adviseJourney(input,env,async(_,init)=>{
  const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content);
  assert.deepEqual(context.request.studentContext,publicStudentContext(input.studentContext));
  assert.ok(!init.body.includes('PRIVATE'));assert.ok(!init.body.includes('"grade"'));assert.ok(!init.body.includes('"note"'));
  assert.deepEqual(body.response_format.json_schema.schema.properties.academic.properties.program.enum,['','BSCSC']);
  return reply(proposal);
 });
 assert.equal(result.academic.program,'BSCSC');
 await assert.rejects(adviseJourney(input,env,async()=>reply({...proposal,academic:{...proposal.academic,program:'BBA',track:'FIN'}})),/Keep the degree selected/);
 let calls=0;await assert.rejects(adviseJourney({...input,studentContext:{...input.studentContext,records:[{courseCode:'FORGED',status:'completed'}]}},env,async()=>{calls++;return reply(proposal);}),/known course/);assert.equal(calls,0);
});

await test('Both student routes persist while degree preference remains explicitly editable',()=>{
 for(const seed of [keepAdmitted,exploreAdmitted,keepContinuing,exploreContinuing]){
  assert.equal(seed.phase,'journey');assert.equal(seed.plan,null);assert.equal(seed.draftPlan,null);assert.equal(seed.journey.step,1,'The route questionnaire starts after the selected student context.');assert.equal(seed.journey.programChosen,false,'A starting preference cannot become an accepted agent recommendation.');
  const restored=validateSavedWorkspace(JSON.parse(JSON.stringify(seed)));
  assert.deepEqual(restored.journey.studentContext,normalizeStudentContext(seed.journey.studentContext));
 }
 assert.equal(keepAdmitted.journey.preferredDegree,'BBA');assert.equal(exploreAdmitted.journey.preferredDegree,'undecided');
 assert.equal(keepContinuing.journey.preferredDegree,'BSCSC');assert.equal(exploreContinuing.journey.preferredDegree,'undecided');
 const publicContext=publicStudentContext(continuing('explore'));
 assert.ok(!JSON.stringify(publicContext).includes('grade'));assert.ok(!JSON.stringify(publicContext).includes('note'));assert.ok(!JSON.stringify(publicContext).includes('PRIVATE'));
 assert.equal(publicContext.records.length,3,'The agent still needs the actual academic course/status context.');
});

await test('Landing and returning accounts expose student routes and a complete rethink',()=>{
 const landing=homeView(emptyWorkspace(),{firstName:'Synthetic'});
 assert.ok(landing.includes('data-action="entry-admitted"'));assert.ok(landing.includes('data-action="entry-continuing"'));
 const saved={...emptyWorkspace(),phase:'saved',plan:makePlan(newJourney())},returning=homeView(saved,{firstName:'Synthetic'});
 assert.ok(returning.includes('data-action="entry-rethink"'));assert.ok(returning.includes('data-action="entry-new"'));assert.ok(returning.includes('data-action="my-plans"'));
});

await test('A continuing student can rethink direction without losing private academic records',()=>{
 const oldJourney=newJourney();oldJourney.profile.name='PRIVATE OLD NAME';oldJourney.questionnaire.ambitions='PRIVATE OLD ANSWER';
 const original=makePlan(oldJourney);original.tracking.csc1401={status:'completed',grade:'A',note:'PRIVATE COMPLETED NOTE'};original.tracking.csc2302={status:'in-progress',grade:'',note:'PRIVATE CURRENT NOTE'};
 const originalJSON=JSON.stringify(original),seed=planningWorkspace({studentContext:continuing('explore')},original);
 assert.equal(seed.journey.preferredDegree,'undecided');assert.ok(!JSON.stringify(seed.journey.questionnaire).includes('PRIVATE OLD ANSWER'),'Rethinking should start the goals questionnaire again.');
 const j=seed.journey;
 acceptAdvice(j,'direction',{kind:'recommend',academic:{program:'BSCSC',track:'SE',secondTrack:'',minor:''}});
 const proposed=buildProposal(j,null),done=proposed.courses.find(c=>c.code==='CSC1401'),current=proposed.courses.find(c=>c.code==='CSC2302');
 assert.ok(done&&current);assert.equal(proposed.tracking[done.id].status,'completed');assert.equal(proposed.tracking[current.id].status,'in-progress');
 assert.equal(proposed.terms.find(t=>t.courses.includes(current.id)).id,'Spring-2027');
 assert.ok(proposed.academicRecord.some(r=>r.courseCode==='CSC1401'&&r.grade==='A'),'Actual grade remains available in the private academic record.');
 assert.equal(JSON.stringify(original),originalJSON,'A rethinking preview changed the original roadmap.');
});

await test('Unmatched current registrations reserve semester capacity and stay under academic review',()=>{
 const records=['ART1301','ART1302','ART1303','ART1304','ART1305'].map(courseCode=>({courseCode,status:'in-progress',termId:'Spring-2027',grade:'',note:''}));
 records.push({courseCode:'MTH1304',status:'completed',termId:'prior',grade:'A',note:''},{courseCode:'FRN3210',status:'completed',termId:'prior',grade:'',note:''});
 const seed=planningWorkspace({studentContext:{route:'continuing',degreeIntent:'explore',currentDegree:'BSCSC',currentTerm:'Spring-2027',studyStartYear:2026,records}});
 acceptAdvice(seed.journey,'direction',{kind:'recommend',academic:{program:'BBA',track:'FIN',secondTrack:'',minor:'computer-science'}});
 const plan=buildProposal(seed.journey,null),current=plan.terms.find(t=>t.id==='Spring-2027'),extras=plan.scheduling.currentRegistrations||[],cap=limits(plan.profile,false);
 assert.ok(extras.length>0,'Fixture must keep some current registrations outside the selected degree.');
 assert.ok(extras.every(r=>plan.academicRecord.some(a=>a.courseCode===r.courseCode&&a.review&&!a.countsTowardDegree)),'An unmatched current course cannot silently count toward degree completion.');
 const rows=current.courses.map(id=>plan.courses.find(c=>c.id===id)),external=extras.filter(r=>r.termId===current.id).map(r=>DATA.courses[r.courseCode]);
 assert.ok(rows.filter(c=>c.loadCredits>0).length+external.filter(c=>c.credits>0).length<=cap.count,'Outside registrations consumed unreserved course slots.');
 assert.ok(rows.reduce((n,c)=>n+c.loadCredits,0)+external.reduce((n,c)=>n+c.credits,0)<=cap.credits,'Outside registrations consumed unreserved credit capacity.');
});

await test('Only public route and course status context leaves the browser for advice',async()=>{
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async(path,init)=>{
  calls++;assert.equal(path,'/api/advice');const body=JSON.parse(init.body);
  assert.equal(body.studentContext.route,'continuing');assert.equal(body.preferredDegree,'undecided');
  assert.deepEqual(body.studentContext,publicStudentContext(exploreContinuing.journey.studentContext));
  for(const marker of ['PRIVATE','grade','note'])assert.ok(!init.body.includes(marker),'The provider request exposed private academic fields.');
  return Response.json({kind:'clarify',questions:['Synthetic reply']});
 };
 try{resetAdviserSession();await requestAdvice('setup',exploreContinuing.journey);assert.equal(calls,1);}finally{globalThis.fetch=originalFetch;}
});

const DB=localDatabase(':memory:'),env={DB},base='https://planwithgoplan.com',session=await testSession(DB,'student-workflow-fixture');
const storage=new Map(),nodes=new Map(['save-status','account-button','account-sync-notice','account-roadmaps'].map(id=>[id,{}]));
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),key:i=>[...storage.keys()][i],get length(){return storage.size;}};
globalThis.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
let events={},state=emptyWorkspace(),key='',busy=false,offline=false,holdWorkspace='',releaseHeld,heldReached,notifications=[];
globalThis.document={getElementById:id=>nodes.get(id),addEventListener:(type,fn)=>events[type]=fn};
globalThis.window={addEventListener(){}};globalThis.location={assign(){}};globalThis.confirm=()=>true;
const request=(path,options={})=>new Request(base+path,{...options,headers:{...options.headers,Origin:base,...session}});
const directFetch=(path,options={})=>handleApi(request(path,options),env);
globalThis.fetch=async(path,options={})=>{
 if(offline)throw Error('Synthetic offline condition');
 const response=await directFetch(path,options);
 if(holdWorkspace&&path==='/api/account/workspaces/'+holdWorkspace&&(!options.method||options.method==='GET')){
  heldReached?.();await new Promise(resolve=>releaseHeld=resolve);
 }
 return response;
};
const setup=()=>createAccountWorkspace({read:()=>state,render(){},notify:message=>notifications.push(message),modal(){},head:()=>'',close(){},busy:()=>busy,open:(next,nextKey)=>{state=next;key=nextKey;}});
await directFetch('/api/account/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'Synthetic',lastName:'Student',consentCloud:true})});
let account=setup();await account.boot();
const cloud=async id=>(await (await directFetch('/api/account/workspaces/'+id)).json());
const list=async()=>(await (await directFetch('/api/account/workspaces')).json()).workspaces;
const currentId=()=>JSON.parse(storage.get(key)).id;
let originalId,originalStored;

await test('A restored saved account starts either route as a separate workspace',async()=>{
 assert.equal(account.phase,'choose');assert.equal(await account.prepareNew(keepContinuing),true);assert.deepEqual(state.journey.studentContext,keepContinuing.journey.studentContext);
 const old=makePlan(state.journey);old.finalizedAt=new Date().toISOString();state.plan=old;state.phase='saved';state.journey=newJourney(old);account.schedule(state);assert.equal(await account.flush(),true);
 originalId=currentId();originalStored=(await cloud(originalId)).state;
 account=setup();await account.boot();assert.equal(state.phase,'saved');assert.equal(currentId(),originalId);
 assert.equal(await account.prepareNew(exploreAdmitted),true);assert.equal(state.plan,null);assert.equal(state.journey.studentContext.route,'admitted');assert.equal(state.journey.preferredDegree,'undecided');
 assert.equal(await account.flush(),true);assert.notEqual(currentId(),originalId);assert.equal((await list()).length,2);
 assert.deepEqual((await cloud(originalId)).state,originalStored,'Restarting onboarding overwrote the saved roadmap.');
});

await test('An invalid restart seed cannot change active workspace or cached state',async()=>{
 const priorState=JSON.stringify(state),priorKey=key,priorId=currentId();
 const invalid=structuredClone(exploreAdmitted);invalid.journey.step=99;
 await assert.rejects(()=>account.prepareNew(invalid));
 assert.equal(key,priorKey);assert.equal(JSON.stringify(state),priorState);assert.equal(currentId(),priorId);
 assert.equal(account.phase,'ready');
});

await test('Busy refusal and returning to an old roadmap preserve both separate plans',async()=>{
 const count=(await list()).length,newId=currentId();busy=true;assert.equal(await account.prepareNew(keepAdmitted),false);busy=false;
 assert.equal(currentId(),newId);assert.equal((await list()).length,count);assert.ok(notifications.length);
 await events.click({target:{closest:()=>({dataset:{accountOpen:originalId}})},preventDefault(){}});
 assert.equal(currentId(),originalId);assert.equal(state.phase,'saved');assert.deepEqual(state,validateSavedWorkspace(structuredClone(originalStored)));
 assert.ok((await list()).some(w=>w.id===newId),'Cancelling a fresh direction must not erase the new separately saved draft.');
});

await test('Offline onboarding recovers its exact route and leaves the previous cloud plan intact',async()=>{
 offline=true;assert.equal(await account.prepareNew(exploreContinuing),true);
 state.journey.questionnaire.ambitions='Synthetic new career direction';account.schedule(state);assert.equal(await account.flush(),false);
 const recoveryKey=key,recoveryId=currentId();assert.equal(JSON.parse(storage.get(key)).pending,true);
 offline=false;state=emptyWorkspace();account=setup();await account.boot();
 assert.equal(key,recoveryKey);assert.equal(currentId(),recoveryId);assert.equal(state.journey.studentContext.route,'continuing');assert.equal(state.journey.preferredDegree,'undecided');assert.equal(state.journey.questionnaire.ambitions,'Synthetic new career direction');
 assert.equal(JSON.parse(storage.get(key)).pending,false);assert.deepEqual((await cloud(originalId)).state,originalStored);
});

await test('A delayed cloud open cannot replace a newer onboarding workspace',async()=>{
 holdWorkspace=originalId;const reached=new Promise(resolve=>heldReached=resolve);
 const opening=events.click({target:{closest:()=>({dataset:{accountOpen:originalId}})},preventDefault(){}});
 await reached;
 assert.equal(await account.prepareNew(keepAdmitted),true);const freshKey=key;await account.flush();const freshId=currentId();
 releaseHeld();holdWorkspace='';await opening;
 assert.equal(key,freshKey,'A stale cloud response changed the current workspace key.');assert.equal(currentId(),freshId);assert.equal(state.journey.studentContext.route,'admitted');assert.equal(state.journey.preferredDegree,'BBA');
 assert.deepEqual((await cloud(originalId)).state,originalStored);
});

await test('Workspace identity and route changes invalidate previous adviser acceptance',()=>{
 const before=planningWorkspace({studentContext:admitted('keep')}).journey;
 const oldStamp=adviceFingerprint('setup',before),other=planningWorkspace({studentContext:admitted('explore')}).journey;
 assert.notEqual(before,other,'Restart must use a new journey identity.');assert.notEqual(oldStamp,adviceFingerprint('setup',other),'A previous route or degree intent cannot reuse cached setup advice.');
 const changed=structuredClone(before);changed.studentContext=normalizeStudentContext(continuing('keep'));
 assert.notEqual(oldStamp,adviceFingerprint('setup',changed),'Changing student route must invalidate adviser context.');
 const contextStamp=adviceFingerprint('setup',changed);assert.ok(!contextStamp.includes('PRIVATE'),'Private progress notes must not become model cache context.');
 changed.studentContext.records[0].grade='B';changed.studentContext.records[0].note='A DIFFERENT PRIVATE NOTE';
 assert.equal(contextStamp,adviceFingerprint('setup',changed),'Private-only progress changes do not alter the public adviser context.');
});

await account.flush();DB.close();console.log('Passed '+passed+' student workflow integration checks. No live API calls.');
