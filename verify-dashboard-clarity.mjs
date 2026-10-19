import assert from 'node:assert/strict';
import {academicCombination,dashboardView} from './dist/dashboard-view.js';
import {QUESTIONS} from './dist/questionnaire.js';
import {QUICK_CHOICES,questionnaireCard} from './dist/question-cards.js';
import {DATA,normalizeProfile} from './dist/planner.js';
import {newJourney,makePlan,emptyWorkspace} from './dist/guidance.js';

// A structurally changed plan must name every selected component, including
// the second specialization that previously disappeared from Your space.
const profile=normalizeProfile({program:'BSCSC',track:'CSYS',secondTrack:'AI',minor:'business-administration'});
assert.equal(academicCombination(profile),'Computer Systems + Artificial Intelligence + Business Administration minor');
const journey=newJourney();journey.profile=profile;journey.programChosen=true;
const plan=makePlan(journey),state={...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)};
const service={saved:true,step:5,stageChanges:[0,0,0,0,0],globalRemaining:0};
const overview=dashboardView(state,{dashboardPanel:'overview',service});
const delayed=structuredClone(state);delayed.plan.revisionAssessment={delayed:true,before:'Fall 2030',after:'Spring 2031'};assert.ok(!dashboardView(delayed,{dashboardPanel:'overview',service}).includes('This change moves graduation'),'Accepted saved changes should not retain a preview warning.');
assert.ok(dashboardView({...delayed,phase:'draft',draftPlan:delayed.plan},{dashboardPanel:'overview',service}).includes('This change moves graduation'),'A new graduation delay must remain visible before saving.');
const directionState=structuredClone(state);directionState.plan.decisions.advice={academic:{rationale:'An explanation available on request.',focusRationale:'Details for this focus.'}};
const direction=dashboardView(directionState,{dashboardPanel:'direction',service});
assert.ok(direction.includes('Why this match?'));assert.ok(!direction.includes('An explanation available on request.'),'Direction explanations should open on demand rather than crowd every card.');
assert.ok(overview.includes('Computer Systems + Artificial Intelligence + Business Administration minor'));
assert.ok(overview.includes('Edit my plan'));assert.ok(overview.includes('Edit courses'));assert.ok(overview.includes('Export Excel'));
assert.ok(overview.includes('You can still edit your plan manually'));
// Saved-plan profile is authoritative even if an old journey snapshot lacks
// the second specialization.
const stale=structuredClone(state);stale.journey.profile.secondTrack='';
assert.ok(dashboardView(stale,{dashboardPanel:'overview',service}).includes('Computer Systems + Artificial Intelligence'));
for(const program of DATA.programs.filter(p=>p.level==='undergraduate')){
 for(const track of program.tracks){
  const second=program.tracks.find(t=>t.id!==track.id),p=normalizeProfile({program:program.id,track:track.id,secondTrack:['BSCSC','BBA'].includes(program.id)?second?.id||'':''});
  const summary=academicCombination(p);assert.ok(summary.includes(track.name),program.id+' omits its primary specialization.');
  if(p.secondTrack)assert.ok(summary.includes(program.tracks.find(t=>t.id===p.secondTrack).name),program.id+' omits its second specialization.');
 }
}
const third=QUESTIONS.find(q=>q.id==='strengths');assert.equal(third.label,'Which subjects interest you?');
const card=questionnaireCard({...journey,questionIndex:2});assert.ok(card.includes(third.label));assert.ok(!card.includes('what feels difficult'));
for(const choice of QUICK_CHOICES.strengths)assert.ok(card.includes(choice));

for(const remaining of [0,5])for(const panel of ['overview','direction','courses','opportunities','semesters']){
 const html=dashboardView(state,{dashboardPanel:panel,service:{...service,globalRemaining:remaining}});
 assert.ok(!html.includes('dashboard-unavailable'),'Removed course-unavailable feature remains on '+panel);
 assert.ok(!html.includes('A course isn’t offered'));
 if(['courses','semesters'].includes(panel)){assert.ok(html.includes('No AI changes used.'));assert.ok(html.includes('aria-label="Edit '));}
 if(panel==='semesters'){
  assert.match(html,/<button[^>]+data-action="dashboard-add-term"[^>]*>\+ Add semester<\/button>/);
  assert.ok(!html.match(/<button[^>]+data-action="dashboard-add-term"[^>]*>/)[0].includes('disabled'),'Adding a semester remains manual at zero allowance.');
 }
}
for(const flag of ['busy','dashboardBusy']){
 const html=dashboardView(state,{dashboardPanel:'overview',service:{...service,globalRemaining:5},[flag]:true,dashboardWork:'Updating your semester map…'});
 assert.ok(html.includes('aria-busy="true"'));assert.ok(html.includes('class="dashboard-content" disabled'));
 assert.ok(html.includes('role="status"'));assert.ok(html.includes('Updating your semester map…'));
 assert.match(html,/<input[^>]+id="dashboard-request"[^>]+disabled/);
 assert.match(html,/<button[^>]+type="submit"[^>]+disabled>Updating your plan…/);
 const map=dashboardView(state,{dashboardPanel:'semesters',service,[flag]:true,dashboardWork:'Updating your semester map…'});
 assert.match(map,/<button[^>]+data-action="dashboard-add-term"[^>]+disabled/);
 assert.ok(map.indexOf('role="status"')<map.indexOf('<fieldset class="dashboard-content" disabled'),'Visible work status must remain outside the disabled manual controls.');
 for(const screen of ['launch','questionnaire','clarification']){
  const j=newJourney();if(screen!=='launch')j.studentContext={route:'admitted'};if(screen==='clarification')j.advice={kind:'clarify',questions:['Which subject would you like to explore?']};
  const initial=dashboardView({...emptyWorkspace(),phase:'journey',journey:j},{[flag]:true,dashboardWork:'Finding your direction…',service:{...service,saved:false,step:0,stageChanges:[2,2,2,2,2]}});
  assert.ok(initial.includes('aria-busy="true"'),screen+' omits its loading state.');
  assert.ok(initial.includes('<fieldset class="dashboard-content" disabled>'),screen+' controls must disable for the whole request.');
  assert.ok(initial.includes('class="dashboard-working" role="status"'));assert.ok(initial.includes('Finding your direction…'));
  assert.ok(initial.indexOf('</fieldset>')<initial.indexOf('class="dashboard-working"'),screen+' work status must remain outside disabled content.');
 }
}
{
 const j=newJourney();j.studentContext={route:'admitted'};
 const failed=dashboardView({...emptyWorkspace(),phase:'journey',journey:j},{service:{...service,saved:false,step:0,stageChanges:[2,2,2,2,2]},aiError:'Choose your degree to continue.',aiFailure:{retryable:false}});
 assert.match(failed,/<button[^>]+data-action="dashboard-direction-options"[^>]*>Choose my degree<\/button>/);
 assert.ok(!failed.includes('Try a different request'),'An initial Direction failure must offer a degree selection rather than consume a stage change.');
}
// One category being populated must not disguise the other as complete, or
// offer a paid initial request on an already saved account.
state.plan.targets={internships:[{id:'test-host',name:'Synthetic internship target',reason:'Technology experience.'}],exchanges:[]};
const exchanges=dashboardView(state,{dashboardPanel:'opportunities',targetGroup:'exchanges',service});
assert.ok(exchanges.includes('No exchange destinations saved'));assert.ok(!exchanges.includes('data-action="dashboard-targets"'));
const guided=dashboardView({...state,phase:'journey',plan:null,journey:{...journey,advice:{kind:'recommend'},details:{choices:{},internships:state.plan.targets.internships,exchanges:[]}}},{service:{...service,saved:false,step:3,stageChanges:[2,2,2,2,2]}});
assert.ok(guided.includes('Find your exchange destinations'));assert.ok(!guided.includes('Find my matches'));
const matchesState=structuredClone(state);matchesState.plan.targets.internships[0].reason='Verbose match reasoning stays in the details.';
const matches=dashboardView(matchesState,{dashboardPanel:'opportunities',service});assert.ok(matches.includes('Synthetic internship target'));assert.ok(matches.includes('Explore this match'));assert.ok(!matches.includes('Verbose match reasoning stays in the details.'));assert.ok(!matches.includes('opportunity-number'));
console.log('Passed complete academic-combination names, subject-choice wording, manual-only exhausted access, removal of course-unavailable controls, accessible operation locking and category-specific opportunity states. No live calls.');
