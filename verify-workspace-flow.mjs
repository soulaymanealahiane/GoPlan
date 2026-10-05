import {groqFixture} from './tests/groq-fixture.mjs';
import assert from 'node:assert/strict';
import {freshWorkspace,hasDraft,editJourney,buildProposal} from './dist/workspace-flow.js';
import {newJourney,makePlan,validateSavedWorkspace} from './dist/guidance.js';
import {homeView} from './dist/home-view.js';
import {missingAnswers} from './dist/questionnaire.js';
import {journeyView} from './dist/journey-view.js';
import {advise} from './server/advisor.mjs';
import {acceptAdvice} from './dist/journey-state.js';
const env={GROQ_API_KEY:'fixture',GROQ_WEB_RESEARCH:'off'};
const response=x=>groqFixture({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(x)}]}]});
const clean=freshWorkspace();assert.equal(hasDraft(clean),false);assert.equal(clean.plan,null);assert.equal(clean.journey.preferredDegree,'undecided');assert.equal(clean.journey.programChosen,false);
assert.ok(Object.values(clean.journey.questionnaire).every(x=>!x));assert.ok(homeView(clean).includes('Build my plan'));
const j=newJourney();j.profile.track='AI';j.background='I am finishing high school and I have not chosen a degree.';
let attempts=0;const setup=await advise({...j,stage:'setup'},env,async(_,init)=>{
 attempts++;const c=JSON.parse(JSON.parse(init.body).messages.at(-1).content);assert.equal(c.request.profile.program,'');assert.equal(c.request.preferredDegree,'undecided');assert.equal(c.currentRecommendation.summary,'');
 return response({summary:'You are finishing high school and exploring your options.',level:'undergraduate',preferredDegree:attempts===1?'BSCSC':'undecided',reason:'Your degree is still open.',questions:[]});
});assert.equal(attempts,2,'Unsupported starting degree must be rejected and repaired');assert.equal(setup.preferredDegree,'undecided');
const plan=makePlan(j);plan.decisions.questionnaire.ambitions='OLD PERSONAL ANSWER';plan.profile.name='Old identity';
const first=plan.terms.find(t=>t.courses.length&&t.id!=='pending');const completedId=first.courses.find(id=>plan.courses.find(c=>c.id===id).code);plan.tracking[completedId]={status:'completed',note:'Private progress'};
const initial=JSON.stringify(plan);const edit=editJourney(plan,'Add more startups and keep the academic choices.',4,first.id);
edit.details={summary:'Same studies',internships:[{id:'chari',name:'Chari',reason:'Startup experience'}],exchanges:[]};const proposal=buildProposal(edit,plan);
assert.equal(JSON.stringify(plan),initial);assert.deepEqual(proposal.terms,plan.terms);assert.deepEqual(proposal.tracking,plan.tracking);assert.equal(proposal.targets.internships[0].id,'chari');
const newUser=freshWorkspace();assert.ok(!JSON.stringify(newUser).includes('OLD PERSONAL ANSWER'));assert.ok(!JSON.stringify(newUser).includes('Old identity'));assert.equal(newUser.plan,null);assert.equal(newUser.history.length,0);
const snapshot=validateSavedWorkspace({...clean,phase:'saved',plan,journey:newJourney(plan)});const home=homeView(snapshot);assert.ok(home.includes('Change my plan'));assert.ok(home.includes('Start fresh'));assert.ok(!home.includes('.pdf'));assert.ok(!home.includes('OLD PERSONAL ANSWER'));
// Changes select the appropriate page without guessing preferences in the client.
for(const [request,startStep,kind] of [['Add startups in Morocco',4,'journey'],['Reconsider my minor',2,'journey'],['My course is unavailable next semester',5,'schedule']]){
 const result=await advise({...newJourney(plan),stage:'change',changeRequest:request},env,async(_,init)=>{const c=JSON.parse(JSON.parse(init.body).messages.at(-1).content);assert.equal(c.request.changeRequest,request);assert.ok(!init.body.includes('Private progress'));assert.ok(!init.body.includes('Old identity'));return response({kind,startStep,summary:'Review the relevant choices (answerIds: ambitions).',questions:[]});});assert.equal(result.startStep,startStep);assert.equal(result.kind,kind);assert.ok(!result.summary.includes('answerIds'));
}
const academicEdit=editJourney(plan,'Keep my choices and review the pace.',5,first.id);const rescheduled=buildProposal(academicEdit,plan);assert.deepEqual(rescheduled.tracking[completedId],plan.tracking[completedId]);assert.equal(rescheduled.terms.find(t=>t.courses.includes(completedId)).id,first.id);
const changedDegree=editJourney(plan,'Switch to BBA.',1,first.id);changedDegree.profile.program='BBA';assert.throws(()=>buildProposal(changedDegree,plan),/credit-transfer/);
const protectedEdit=editJourney(plan,'Change my direction.',2,first.id);protectedEdit.protectedChoices={'bscsc-free-1':'MTH2304'};acceptAdvice(protectedEdit,'direction',{kind:'recommend',academic:{program:'BSCSC',track:'AI',secondTrack:'',minor:''}});assert.equal(protectedEdit.profile.choices['bscsc-free-1'],'MTH2304');
assert.ok(!journeyView({journey:{...j,step:2}}).includes('data-source-file'));
console.log('Passed blank-session isolation, unsupported starting-degree repair, saved-plan preview isolation, targeted change routing, preserved progress, protected choices and simplified entry screens.');

assert.equal(missingAnswers({ambitions:'undecided',strengths:'not sure',activities:'unsure'}).length,0,'The short uncertainty answers invited by the questionnaire must be accepted');
