import {manualCatalogue,addManualSemester,addManualCourse,removeManualCourse,noteManualSemester,removeManualSemester} from './manual-plan.js';
import {manualChangeMessage} from './manual-checks.js';
import {SERVICE_STAGES} from './service-policy.js';
import {loadAllowance,beginAction,advanceStage} from './service-client.js';
import {dashboardReady,short} from './dashboard-view.js';
import {courseGroups} from './course-groups.js';
import {dashboardCopy} from './dashboard-copy.js';
import {courseDetailFacts} from './course-details.js';
import {newcomerWorkspace,manualCoursePlan,manualDegreePlan,manualCourseOptions,studyBoundary} from './dashboard-flow.js';
import {newJourney,eligibleMinors,allowedChoices,planIssues,suggestChoices} from './guidance.js';
import {DATA,programFor,coursesFor,normalizeProfile,label,termOrder} from './planner.js';
import {buildProposal,editJourney} from './workspace-flow.js';
import {requestAdvice,requestReviewedTargets,trackUsage} from './ai-client.js';
import {acceptAdvice} from './journey-state.js';
import {proposeReplan,replanSnapshot} from './replanning.js';
import {esc,options,link,targetEvidence} from './views.js';
const action=(id,text,extra='')=>`<button type="button" class="button secondary" data-action="${id}" ${extra}>${text}</button>`;
const stages={direction:'Finding your direction…',courses:'Choosing your courses…',targets:'Finding your matches…',pace:'Mapping your semesters…'};
const friendly=e=>['REQUEST_BUDGET','RESPONSE_INCOMPLETE','ADVISER_TIMEOUT'].includes(e.code)?'This suggestion isn’t ready yet. Try a different request or keep your current plan.':e.message;

export function createDashboardController(h){
 const r=h.runtime,state=()=>h.read(),current=()=>state().phase==='draft'?state().draftPlan:state().plan;
 let locked=false,retry=null,operation=null,activeAction='';
 const guided=()=>r.service&&!r.service.saved&&r.service.step<5;
 async function loadService(){try{r.service=await loadAllowance();r.serviceError='';if(r.service.saved&&r.service.globalRemaining===0&&(!r.dashboardPanel||r.dashboardPanel==='overview'))r.dashboardPanel='semesters';}catch(e){r.serviceError=e.message;}display();}
 async function reserveAction(kind,step=r.service?.step||0){if(!r.service)await loadService();const index=operation?operation.cursor++:0;let request=operation?.actions[index];if(!request){request={kind,step,id:crypto.randomUUID()};if(operation)operation.actions[index]=request;}if(request.kind!==kind||request.step!==step)throw Object.assign(Error('Your plan changed. Use a new request to continue.'),{retryable:false});const result=await beginAction(kind,Math.min(4,step),request.id);r.service=result.allowance;return result.action;}
 async function authorizeAdvice(stage){if(!guided())throw Error('Use a remaining global change from Your space.');const step=r.service.step;if(SERVICE_STAGES[step].agent!==stage)throw Error('Continue your current stage first.');return reserveAction('initial',step);}
 async function initialStage(){const def=SERVICE_STAGES[r.service.step];if(!def)return;if(def.target){state().journey.refinements||={};state().journey.refinements.targets=def.target==='exchanges'?'Choose exchange destinations and preserve the company recommendations.':'Choose company recommendations.';}const token=await reserveAction('initial');activeAction=token;try{await advice(def.agent);}catch(error){const auth=['SIGN_IN_REQUIRED','ACCESS_REQUIRED'].includes(r.aiFailure?.code);if(!auth&&(def.agent==='targets'||(r.aiFailure?.retryable===false||r.aiFailure?.code==='AGENT_BUSY')&&['courses','pace'].includes(def.agent)))await recoverInitialStage(def);else throw error;}if(def.id==='semesters'){state().draftPlan=buildProposal(state().journey,state().plan);state().phase='draft';}r.dashboardPanel=def.panel;if(def.id==='courses')r.courseGroup=state().journey.profile.minor?'minor':'specialization';r.targetGroup=def.target||'internships';h.persist();}
 async function nextStage(){const def=SERVICE_STAGES[r.service.step];if(def?.target&&!(state().journey.details?.[def.target]?.length))await recoverTargets();if(r.service.step===0&&!state().journey.programChosen)throw Error('Choose your degree before continuing.');r.service=await advanceStage(r.service.step);h.persist();if(r.service.step<5)await initialStage();else{if(!state().draftPlan)state().draftPlan=buildProposal(state().journey,state().plan);state().phase='draft';r.dashboardPanel='overview';h.persist();}}
 function display(){h.render();}
 function commit(message=''){r.aiError='';r.aiFailure=null;retry=null;h.changed(message);}
 function panel(name){if(guided())return;r.dashboardPanel=name;r.dashboardWelcome=false;r.aiError='';r.aiFailure=null;display();}
 async function advice(stage){r.dashboardWork=stages[stage];const ok=await h.getAdvice(stage,{serviceAction:activeAction||undefined});if(!ok&&!(stage==='direction'&&state().journey.advice?.kind==='clarify'&&!r.aiError))throw Object.assign(Error(r.aiError||'Tell GoPlan a little more about what you want.'),{handled:true});return true;}
 async function recoverInitialStage(def){
  if(def.agent==='targets')return recoverTargets();const j=state().journey;
  if(def.agent==='courses'){const suggested=suggestChoices(j);j.profile=suggested.profile;acceptAdvice(j,'courses',{source:'reviewed',summary:'Your degree course choices.',choices:{...j.profile.choices},agentChoices:{},choiceReasons:{},openItems:[]});}
  else if(def.agent==='pace')acceptAdvice(j,'pace',{source:'reviewed',summary:'Your semester map.',pace:j.profile.pace,regularCourses:j.profile.regularCourses,summerCourses:j.profile.summerCourses,summers:j.profile.summers,reason:'Uses your selected course load.',actions:[]});
  r.aiError='';r.aiFailure=null;h.persist();return true;
 }
 async function recoverTargets(){
  const j=state().journey,plan=current(),before=JSON.stringify([j.profile,plan?.id,plan?.updatedAt]),existing=structuredClone(plan?.targets||j.details||{});
  r.aiError='';r.aiFailure=null;r.dashboardWork='Preparing your matches…';display();const serviceAction=guided()?(activeAction||await reserveAction('initial')):undefined;const result=await requestReviewedTargets(j,{serviceAction});
  if(before!==JSON.stringify([state().journey.profile,current()?.id,current()?.updatedAt]))throw Error('Your plan changed. Open your matches again.');
  for(const type of ['internships','exchanges'])if(existing[type]?.length)result[type]=existing[type];
  acceptAdvice(j,'targets',result);
  if(plan){const updated=structuredClone(plan);updated.targets={...updated.targets,internships:result.internships,exchanges:result.exchanges};updated.decisions=structuredClone(j);updated.updatedAt=new Date().toISOString();replacePlan(updated);}
  r.aiError='';r.aiFailure=null;h.persist();return true;
 }
 async function ensure(part){
  if(guided()){
   const def=SERVICE_STAGES[r.service.step],j=state().journey,used=!!(r.service.initialMask&(1<<r.service.step));
   if(def.target&&used&&!j.details?.[def.target]?.length)await recoverTargets();
   else if(!used||def.agent==='courses'&&!j.details?.choices||def.agent==='pace'&&!j.paceAdvice)await initialStage();
   else if(def.id==='semesters'&&!state().draftPlan){state().draftPlan=buildProposal(j,state().plan);state().phase='draft';r.dashboardPanel=def.panel;h.persist();}
   return;
  }
  if(r.service?.step===5){if(part==='opportunities'&&(!current()?.targets?.internships?.length||!current()?.targets?.exchanges?.length))await recoverTargets();r.dashboardPanel=part;h.persist();display();return true;}
  const j=state().journey;
  if(!dashboardReady(j,current()).direction){j.step=1;if(!await h.getAdvice('direction'))return false;j.step=2;}
  if(['courses','opportunities','semesters'].includes(part)&&!j.details?.choices)await advice('courses');
  if(['opportunities','semesters'].includes(part)&&!j.agentStamps?.targets&&!(j.details?.internships?.length||j.details?.exchanges?.length))await advice('targets');
  if(part==='semesters'){
   if(!j.paceAdvice)await advice('pace');
   state().draftPlan=buildProposal(j,state().plan);state().phase='draft';
  }
  r.dashboardPanel=part;r.dashboardNotice='';h.persist();display();return true;
 }
 async function run(job,replay=null){
  if(locked)return;
  if(replay){if(replay.after!==JSON.stringify(state())){r.aiError='Your plan changed. Use a new request to continue.';r.aiFailure={retryable:false};retry=null;display();return;}Object.assign(state(),structuredClone(replay.before));r.service=structuredClone(replay.service);}
  locked=true;operation=replay||{job,before:structuredClone(state()),beforePanel:r.dashboardPanel,service:structuredClone(r.service),actions:[]};operation.cursor=0;r.aiError='';r.aiFailure=null;r.dashboardNotice='';r.dashboardBusy=true;r.dashboardWork='Updating your plan…';display();
  try{await job();}catch(e){if(operation.atomic){Object.assign(state(),structuredClone(operation.before));r.dashboardPanel=operation.beforePanel||'overview';}if(!e.handled){r.aiError=friendly(e)||'That change could not be completed.';r.aiFailure={retryable:e.retryable!==false,code:e.code};}}finally{retry=r.aiError?operation:null;if(retry)retry.after=JSON.stringify(state());operation=null;locked=false;r.busy=false;r.dashboardBusy=false;activeAction='';h.persist();display();}
 }
 async function start(){
  if(state().journey.studentContext&&!state().plan&&!state().draftPlan){r.dashboardWelcome=false;h.showPlan();display();return;}
  const seed=newcomerWorkspace({name:h.account()?.firstName||''});await h.startWorkspace(seed);r.dashboardPanel='overview';r.dashboardWelcome=false;display();
 }
 function ask(initial=''){
  if(r.service?.saved){panel('overview');r.dashboardPrefill=initial;return;}
  const p=current()?.profile||state().journey.profile,group=courseGroups(current()?.courses||coursesFor(p),p).find(g=>g.id===r.courseGroup),copy=dashboardCopy(r.dashboardPanel,group?.title,r.targetGroup);
  h.modal(h.head(copy.title)+`<form id="dashboard-modal-command"><label class="field">${esc(copy.label)}<textarea name="request" rows="3" minlength="5" maxlength="2500" required placeholder="${esc(copy.placeholder)}">${esc(initial)}</textarea></label><button class="button primary" type="submit">Update with GoPlan ↗</button></form>`);
 }


 async function command(text){
  if(!text?.trim())return;
  if(guided()){const def=SERVICE_STAGES[r.service.step],token=await reserveAction('stage');activeAction=token;const j=state().journey;j.refinements||={};j.refinements[def.agent]=(def.target==='internships'?'Change companies only. Preserve exchange destinations. ':def.target==='exchanges'?'Change exchange destinations only. Preserve companies. ':'')+text;if(def.agent==='courses')j.agentChoices={...j.profile.choices};await advice(def.agent);if(def.id==='semesters'){state().draftPlan=buildProposal(j,state().plan);state().phase='draft';}h.persist();return;}
  if(operation)operation.atomic=true;activeAction=await reserveAction('global',4);
  const before=JSON.stringify([state().journey.profile,current()?.id,current()?.updatedAt]),j=structuredClone(state().phase==='journey'?state().journey:newJourney(current()));
  r.busy=true;r.dashboardWork='Understanding your change…';display();
  const request=r.pendingDashboardRequest?`${r.pendingDashboardRequest} Additional detail: ${text}`:text;
  const route=await requestAdvice('change',j,{changeRequest:request,serviceAction:activeAction});r.busy=false;
  if(before!==JSON.stringify([state().journey.profile,current()?.id,current()?.updatedAt]))throw Error('Your plan changed while I was checking. Please send the request again.');
  if(route.kind==='answer'){r.dashboardNotice=route.summary;r.dashboardAnswer=route.summary;return;}
  if(route.kind==='clarify'){r.pendingDashboardRequest=request;r.dashboardNotice=route.questions?.[0]||route.summary;return;}
  r.pendingDashboardRequest='';
  if(route.kind==='schedule'){
   const plan=current();if(!plan)throw Error('Save your degree plan before changing individual semesters.');
   r.busy=true;r.dashboardWork='Updating your semester map…';display();const term=studyBoundary(plan).currentTerm;
   const result=await requestAdvice('replan',newJourney(plan),{serviceAction:activeAction,plan:replanSnapshot(plan),currentTerm:term,unavailable:[],offerings:[],changeRequest:request});r.busy=false;
   if(result.kind==='clarify'){r.pendingDashboardRequest=request;r.dashboardNotice=result.questions?.[0]||result.summary;return;}
   const proposal=proposeReplan(plan,result.change,term);if(!proposal.assessment.canApply)throw Object.assign(Error('This change needs a different course sequence. Your plan is unchanged.'),{retryable:false});
   state().draftPlan=proposal.candidate;state().draftPlan.revisionAssessment=proposal.assessment;state().phase='draft';state().journey=newJourney(state().draftPlan);r.dashboardPanel='semesters';r.dashboardNotice=result.summary;h.persist();return;
  }
  const previous=current(),wasPlanned=!!previous,next=previous?editJourney(previous,request,route.startStep,studyBoundary(previous).currentTerm):state().journey;
  state().journey=next;state().phase='journey';state().draftPlan=null;
  next.changeRequest=request;next.refinements||={};next.agentStamps||={};
  const target=route.startStep<=2?'direction':route.startStep===3?'courses':route.startStep===4?'targets':'pace';
  next.refinements[target]=request;
  if(target==='direction'&&next.studentContext)next.studentContext.degreeIntent='explore';
  if(target==='courses')next.agentChoices={...next.profile.choices};
  const targetsBefore=next.details?{internships:next.details.internships||[],exchanges:next.details.exchanges||[],targetResearch:next.details.targetResearch}:null;
  await advice(target);
  const programChanged=next.profile.program!==j.profile.program||next.profile.track!==j.profile.track||next.profile.minor!==j.profile.minor||next.profile.secondTrack!==j.profile.secondTrack;
  if(programChanged){next.details=null;next.paceAdvice=null;next.agentStamps={direction:next.agentStamps.direction};}
  if(target==='courses'&&targetsBefore)next.details={...next.details,...targetsBefore};
  // A saved roadmap is rebuilt as a preview. Existing unrelated suggestions
  // remain in place unless changing the academic combination invalidates them.
  if(wasPlanned){
   if(programChanged||!next.details?.choices)await advice('courses');
   if(programChanged)await advice('targets');
   if(!next.paceAdvice)await advice('pace');
   state().draftPlan=buildProposal(next,state().plan);state().phase='draft';
  }
  r.dashboardPanel=target==='targets'?'opportunities':target==='pace'?'semesters':target==='courses'?'courses':'direction';
  if(target==='pace'&&!wasPlanned)r.dashboardPanel='overview';
  r.dashboardNotice=next.lastUpdates?.[target]?.summary||'Your plan has been updated.';h.persist();
 }
 async function save(){
  const s=state();if(!s.draftPlan)return;const firstSave=!r.service?.saved;if(operation)operation.atomic=true;
  if(s.plan)s.history=[structuredClone(s.plan),...(s.history||[])].slice(0,3);
  s.plan=structuredClone(s.draftPlan);s.plan.finalizedAt=new Date().toISOString();s.draftPlan=null;s.phase='saved';s.journey=newJourney(s.plan);r.dashboardPanel='overview';
  commit('Saved. Your plan is ready.');if(h.saveAccount&&!await h.saveAccount())throw Error('Your plan is kept on this device. Retry cloud saving to finish.');await loadService();if(firstSave){r.manualWelcome=true;display();}trackUsage('plan_saved');
 }
 function addTerm(){
  const plan=current();if(!plan)return;const last=plan.terms.filter(t=>!['prior','pending'].includes(t.id)).at(-1),season=last?.season==='Fall'?'Spring':last?.season==='Spring'?'Summer':'Fall',year=last?.year+(last?.season==='Fall'?1:0)||new Date().getFullYear();
  h.modal(h.head('Add a semester')+'<form id="dashboard-add-term-form"><div class="field-grid"><label class="field">Season<select name="season">'+options([['Fall','Fall'],['Spring','Spring'],['Summer','Summer']],season)+'</select></label><label class="field">Year<input name="year" type="number" min="2000" max="2099" value="'+year+'" required></label></div><p class="small-note">Then select a course to move it here.</p><p id="dashboard-add-term-error" class="field-error" role="alert"></p><button class="button primary">Add semester</button></form>');
 }
 function applyManual(candidate,message,{undo=false}={}){
  const before=structuredClone(current());r.manualWelcome=false;r.manualUndo=undo?{before,after:JSON.stringify(candidate)}:null;r.dashboardNotice='';replacePlan(candidate);commit(message);
 }
 function catalogueOptions(profile,scope,search,selected='',plan=current()){
  const found=manualCatalogue(profile,{scope,search}),visible=found.slice(0,120);
  const selectedRecord=manualCatalogue(profile,{scope:'all'}).find(c=>c.code===selected);if(selectedRecord&&!visible.some(c=>c.code===selected))visible.unshift(selectedRecord);
  return {html:options([['','Choose a course'],...visible.map(c=>{const existing=plan?.courses.find(x=>c.requirementId?x.id===c.requirementId:x.code===c.code),term=plan?.terms.find(t=>t.courses.includes(existing?.id));return [c.code,(c.requirementId?'':c.code+' · ')+c.title+' · '+c.credits+' cr'+(term?' · In '+label(term):'')];})],selected),count:found.length>120?'Showing 120 of '+found.length+'. Search to narrow the list.':found.length+(found.length===1?' course':' courses')};
 }
 function picker(profile,{scope='degree',selected=''}={}){const list=catalogueOptions(profile,scope,'',selected);return '<div class="manual-picker"><label class="field">Course list<select id="dashboard-catalogue-scope" name="catalogueScope">'+options([['degree','My degree'],['all','All AUI courses']],scope)+'</select></label><label class="field">Search courses<input id="dashboard-catalogue-search" name="catalogueSearch" type="search" placeholder="Course code or name" autocomplete="off"></label><label class="field">Course<select id="dashboard-catalogue-course" name="course">'+list.html+'</select></label><p class="small-note" id="dashboard-catalogue-count" role="status">'+list.count+'</p></div>';}
 function filterCatalogue(form){const scope=form.querySelector('[name="catalogueScope"]').value,search=form.querySelector('[name="catalogueSearch"]').value,select=form.querySelector('[name="course"]'),list=catalogueOptions(current().profile,scope,search);select.innerHTML=list.html;form.querySelector('#dashboard-catalogue-count').textContent=list.count;}
 function addCourse(termId){const p=current(),term=p?.terms.find(t=>t.id===termId);if(!term)return;h.modal(h.head('Add a course',label(term))+'<form id="dashboard-add-course-form" data-term="'+esc(termId)+'">'+picker(p.profile)+'<details class="quiet-details"><summary>Retaking a course?</summary><label class="check"><input type="checkbox" name="anotherAttempt">Keep the previous attempt and add another.</label></details><p id="dashboard-add-course-error" class="field-error" role="alert"></p><button class="button primary">Add to semester</button></form>');}
 function semesterNote(termId){const term=current()?.terms.find(t=>t.id===termId);if(!term)return;h.modal(h.head('Semester note',label(term))+'<form id="dashboard-term-note-form" data-term="'+esc(termId)+'"><label class="field">Keep in mind<textarea name="note" maxlength="2000" rows="5" placeholder="A reminder for this semester">'+esc(term.note||'')+'</textarea></label><p id="dashboard-term-note-error" class="field-error" role="alert"></p><button class="button primary">Save note</button></form>');}
 function course(id){
  const p=current(),profile=p?.profile||state().journey.profile,c=(p?.courses||coursesFor(profile)).find(c=>c.id===id);if(!c)return;
  const term=p?.terms.find(t=>t.courses.includes(id)),progress=p?.tracking?.[id]?.status||'planned',detail=courseDetailFacts(c,profile);
  h.modal(h.head(detail.course.title,c.code||'')+'<p class="course-detail-meta">'+c.credits+' credits · '+esc(c.manualAddition?'Added by you':courseGroups([c],profile)[0]?.title||c.category)+'</p>'+(p?'<form id="dashboard-course-form" data-course-id="'+esc(id)+'"><div class="field-grid"><label class="field">Status<select name="status">'+options([['planned','Planned'],['in-progress','Taking now'],['completed','Completed'],['retake','Need to retake']],progress)+'</select></label><label class="field">Semester<select name="term">'+options(p.terms.map(t=>[t.id,label(t)]),term?.id)+'</select></label></div><details class="quiet-details"><summary>Change course</summary>'+picker(profile,{scope:'all'})+'</details><p id="dashboard-course-error" class="field-error" role="alert"></p><button class="button primary">Save changes</button></form><div class="manual-course-actions">'+action('dashboard-remove-course','Remove course','data-course-id="'+esc(id)+'"')+'</div>':'')+(detail.facts.length?'<details class="quiet-details"><summary>Course details</summary><dl class="course-facts">'+detail.facts.map(f=>'<div><dt>'+esc(f.label)+'</dt><dd>'+esc(f.text)+'</dd></div>').join('')+'</dl></details>':''));
 }
 function degreeOptions(){
  const p=current()?.profile||state().journey.profile;
  h.modal(h.head('Your degree, your choice')+`<form id="dashboard-degree-form"><label class="field">Degree<select name="program" id="dashboard-degree">${options(DATA.programs.filter(p=>p.level==='undergraduate').map(p=>[p.id,p.name]),p.program)}</select></label><div id="dashboard-focus-options">${focusOptions(p)}</div><p id="dashboard-degree-error" class="field-error" role="alert"></p><button class="button primary" type="submit">Update my degree</button></form>`);
 }
 function focusOptions(p){const degree=programFor(p);return `${degree.tracks.length?`<label class="field">Focus<select name="track">${options(degree.tracks.map(t=>[t.id,t.name]),p.track)}</select></label>`:''}<label class="field">Minor<select name="minor">${options([['','No minor for now'],...eligibleMinors(p).map(m=>[m.id,m.name])],p.minor)}</select></label><details class="quiet-details"><summary>More choices</summary>${['BBA','BSCSC'].includes(p.program)?`<label class="field">Second focus<select name="secondTrack">${options([['','None'],...degree.tracks.map(t=>[t.id,t.name])],p.secondTrack)}</select></label>`:''}</details>`;}
 function pace(){
  const p=current()?.profile||state().journey.profile;
  h.modal(h.head('Plan settings')+`<form id="dashboard-pace-form"><label class="field">Regular semester<select name="regular">${options([['5','Up to 5 courses'],['6','Up to 6 courses']],String(p.regularCourses))}</select></label><label class="field">Summer<select name="summer">${options([['0','Keep summers free'],['2','Up to 2 courses'],['3','Up to 3 courses']],p.summers?String(p.summerCourses):'0')}</select></label><details class="quiet-details"><summary>Starting year and placement</summary><label class="field">First fall year<input name="year" type="number" min="2000" max="2040" value="${p.startYear}" required></label><label class="field">Language Center semesters<select name="lc">${options([['0','No Language Center semesters'],['1','One semester'],['2','Two semesters']],String(p.lc))}</select></label><p class="small-note">Extra course loads depend on your academic standing or approval.</p></details><p id="dashboard-pace-error" class="field-error" role="alert"></p><button class="button primary" type="submit">Update my semesters</button></form>`);
 }
 function target(type,index){
  const t=(current()?.targets||state().journey.details||{})[type]?.[index];if(!t)return;
  const source=t.researchSources?.[0]?.url||t.sourceUrl;
  h.modal(h.head(t.name,t.country||t.organizationType||'A target to explore')+`<p>${esc(short(t.reason,220))}</p>${link(source,'Visit official source')}<details class="quiet-details"><summary>Why it fits and what to check</summary><p>${esc(t.industryReason||t.tierReason||'')}</p>${targetEvidence(t)}<p>${esc(Array.isArray(t.constraints)?t.constraints.join(' '):t.constraints||t.caveat||'Confirm current availability and eligibility.')}</p></details><div class="deck-actions"></div>`);
 }
 function why(kind){const a=current()?.decisions?.advice?.academic||state().journey.advice?.academic||{},key={'Degree':'rationale','Focus':'focusRationale','Minor':'minorRationale','Second focus':'secondFocusRationale'}[kind];h.modal(h.head('Why this match?')+`<p>${esc(a[key]||'Your combination connects your stated interests with its academic requirements.')}</p><details class="quiet-details"><summary>More context</summary>${(current()?.decisions?.advice?.assessment||state().journey.advice?.assessment||[]).map(x=>`<p>${esc(x.explanation)}</p>`).join('')}</details>`);}
 async function submit(form){
  if(!form.id.startsWith('dashboard-'))return false;
  if(locked||r.busy)return true;
  const data=new FormData(form);
  if(form.id==='dashboard-clarification-form'){const answer=String(data.get('answer')||'').trim().slice(0,2500);if(!answer)return true;await run(async()=>{activeAction=await reserveAction('stage',0);state().journey.answers=answer;await advice('direction');});return true;}
  if(['dashboard-command-form','dashboard-modal-command'].includes(form.id)){
   const text=String(data.get('request')||'');if(form.id==='dashboard-modal-command')h.close();await run(()=>command(text));return true;
  }
  if(form.id==='dashboard-add-term-form'){
   try{const season=String(data.get('season')),year=Number(data.get('year')),id=season+'-'+year,candidate=addManualSemester(current(),{season,year});replacePlan(candidate);r.selectedTerm=id;r.dashboardPanel='semesters';h.close();r.manualUndo=null;commit('Semester added. Add a course when ready.');}catch(e){form.querySelector('#dashboard-add-term-error').textContent=e.message;}return true;
  }
  if(form.id==='dashboard-add-course-form'){
   try{const selected=String(data.get('course')||'');if(!selected)throw Error('Choose a course from the list.');const before=current(),change={courseCode:selected,termId:form.dataset.term,anotherAttempt:data.get('anotherAttempt')==='on'},candidate=addManualCourse(before,change);r.selectedTerm=form.dataset.term;h.close();applyManual(candidate,manualChangeMessage(before,candidate,change));}catch(e){form.querySelector('#dashboard-add-course-error').textContent=e.message;}return true;
  }
  if(form.id==='dashboard-term-note-form'){
   try{const candidate=noteManualSemester(current(),form.dataset.term,String(data.get('note')||''));h.close();applyManual(candidate,'Semester note saved.');}catch(e){form.querySelector('#dashboard-term-note-error').textContent=e.message;}return true;
  }
  if(form.id==='dashboard-course-form') {
   try{const p=current(),change={id:form.dataset.courseId,courseCode:String(data.get('course')||''),termId:String(data.get('term')||''),status:String(data.get('status')||'planned')},result=manualCoursePlan(p,change);if(r.dashboardPanel==='semesters'&&data.get('term'))r.selectedTerm=String(data.get('term'));h.close();applyManual(result.candidate,manualChangeMessage(p,result.candidate,change));}catch(e){form.querySelector('#dashboard-course-error').textContent=e.message;}return true;
  }
  if(form.id==='dashboard-degree-form'){
   try{const p=current(),old=p?.profile||state().journey.profile,profile=normalizeProfile({...old,program:String(data.get('program')),track:String(data.get('track')||''),secondTrack:String(data.get('secondTrack')||''),minor:String(data.get('minor')||''),choices:String(data.get('program'))===old.program?old.choices:{}});
    if(p){state().draftPlan=manualDegreePlan(p,profile);state().phase='draft';state().journey=newJourney(state().draftPlan);}else{const j=state().journey;j.profile=profile;j.programChosen=true;j.details=null;j.agentStamps={};j.advice={kind:'recommend',summary:'Your degree choices.',themes:[],questions:[],tradeoffs:[],academic:{program:profile.program,track:profile.track,secondTrack:profile.secondTrack,minor:profile.minor,rationale:'Chosen by you.'}};}
    h.close();r.dashboardPanel='direction';commit(p?'Degree updated in your preview. Save when ready.':'Your degree choices are updated.');
   }catch(e){form.querySelector('#dashboard-degree-error').textContent=e.message;}return true;
  }
  if(form.id==='dashboard-language-center-form'){
   try{
    const p=current(),lc=Number(data.get('lc'));if(!p||![0,1,2].includes(lc))throw Error('Choose zero, one or two Language Center semesters.');
    if(lc===p.profile.lc){h.notify('Your Language Center setting is already applied.');return true;}
    const candidate=manualDegreePlan(p,{...p.profile,lc});
    state().draftPlan=candidate;state().phase='draft';state().journey=newJourney(candidate);r.dashboardPanel='semesters';r.selectedTerm=candidate.terms.find(t=>t.lc)?.id||candidate.terms.find(t=>!['prior','pending'].includes(t.id))?.id||'';
    commit(lc?'Language Center semesters added. Review your updated map.':'Language Center semesters removed. Your map is updated.');
   }catch(e){form.querySelector('#dashboard-language-center-error').textContent=e.message;}return true;
  }
  if(form.id==='dashboard-pace-form'){
   try{const p=current(),j=state().journey,old=p?.profile||j.profile,profile=normalizeProfile({...old,regularCourses:Number(data.get('regular')),summers:data.get('summer')!=='0',summerCourses:data.get('summer')==='0'?old.summerCourses:Number(data.get('summer')),startYear:Number(data.get('year')),lc:Number(data.get('lc'))});
    if(p){state().draftPlan=manualDegreePlan(p,profile);state().phase='draft';state().journey=newJourney(state().draftPlan);}else j.profile=profile;
    h.close();r.dashboardPanel=p?'semesters':'overview';commit(p?'Your updated semester map is ready to review.':'Your pace is set.');
   }catch(e){form.querySelector('#dashboard-pace-error').textContent=e.message;}return true;
  }
  return false;
 }
 function replacePlan(p){if(state().phase==='draft')state().draftPlan=p;else{state().history=[structuredClone(state().plan),...(state().history||[])].slice(0,3);state().plan=p;}state().journey=newJourney(p);}
 async function click(b){
  const a=b.dataset.action;if(!a?.startsWith('dashboard-'))return false;
  if(locked||r.busy){h.notify('Your adviser is finishing this change.');return true;}
  if(a==='dashboard-service-reload')await loadService();
  else if(a==='dashboard-stage-next')await run(nextStage);
  else if(a==='dashboard-stage-generate')await run(initialStage);
  else if(a==='dashboard-start')await start();
  else if(a==='dashboard-restart')h.notify('Continue your current roadmap.');
  else if(a==='dashboard-confirm-restart')h.notify('Your service includes one roadmap.');
  else if(a==='dashboard-home'){r.dashboardWelcome=true;panel('overview');r.dashboardWelcome=true;display();}
  else if(a==='dashboard-panel'){if(b.dataset.panel==='opportunities'&&r.service?.step===5&&(!current()?.targets?.internships?.length||!current()?.targets?.exchanges?.length))await run(()=>ensure('opportunities'));else panel(b.dataset.panel);}
  else if(a==='dashboard-open')await run(()=>ensure(b.dataset.panel));
  else if(a==='dashboard-courses')await run(()=>ensure('courses'));
  else if(a==='dashboard-targets')await run(()=>ensure('opportunities'));
  else if(a==='dashboard-build')await run(()=>ensure('semesters'));
  else if(a==='dashboard-change')ask();
  else if(a==='dashboard-course-group'){r.courseGroup=b.dataset.group;display();}
  else if(a==='dashboard-target-group'){r.targetGroup=b.dataset.group;display();}
  else if(a==='dashboard-term'){r.selectedTerm=b.dataset.term;display();}
  else if(a==='dashboard-course-semester'){r.selectedTerm=b.dataset.term;h.close();panel('semesters');}
  else if(a==='dashboard-course')course(b.dataset.courseId);
  else if(a==='dashboard-add-term')addTerm();
  else if(a==='dashboard-add-course')addCourse(b.dataset.term);
  else if(a==='dashboard-term-note')semesterNote(b.dataset.term);
  else if(a==='dashboard-remove-course'){const candidate=removeManualCourse(current(),b.dataset.courseId);h.close();applyManual(candidate,'Course removed. You can undo this.',{undo:true});}
  else if(a==='dashboard-remove-term'){try{const candidate=removeManualSemester(current(),b.dataset.term);r.selectedTerm='';applyManual(candidate,'Semester removed. You can undo this.',{undo:true});}catch(e){h.notify(e.message);}}
  else if(a==='dashboard-manual-undo'){const undo=r.manualUndo;if(undo&&JSON.stringify(current())===undo.after){replacePlan(undo.before);r.manualUndo=null;commit('Removal undone.');}else{r.manualUndo=null;h.notify('Your plan has changed since that removal.');display();}}
  else if(a==='dashboard-manual-open'){r.manualWelcome=false;panel('semesters');}
  else if(a==='dashboard-course-replace'){const c=(current()?.courses||coursesFor(state().journey.profile)).find(c=>c.id===b.dataset.courseId);ask(`Replace ${c?.code||c?.title||'this course'} with another eligible course that fits my interests.`);}
  else if(a==='dashboard-target')target(b.dataset.targetType,Number(b.dataset.targetIndex));
  else if(a==='dashboard-why')why(b.dataset.kind);
  else if(a==='dashboard-direction-options')degreeOptions();
  else if(a==='dashboard-pace')pace();
  else if(a==='dashboard-unavailable'){h.notify('Select a course to edit its semester or elective choice manually.');}
  else if(a==='dashboard-discard'){if(state().plan){state().draftPlan=null;state().phase='saved';state().journey=newJourney(state().plan);r.manualUndo=null;r.dashboardPanel='semesters';commit('Kept your saved plan.');}}
  else if(a==='dashboard-save')await run(save);
  else if(a==='dashboard-export')await h.exportPlan();
  else if(a==='dashboard-retry'){if(r.aiFailure?.retryable===false)return true;if(retry)await run(retry.job,retry);else if(guided())await run(initialStage);else {r.aiError='';r.aiFailure=null;display();}}
  return true;
 }
 function input(target){if(target.id==='dashboard-catalogue-search')filterCatalogue(target.form);}
 function change(target){if(target.id==='dashboard-catalogue-scope'){filterCatalogue(target.form);return;}if(target.id!=='dashboard-degree')return;const old=current()?.profile||state().journey.profile,p=normalizeProfile({...old,program:target.value,track:'',minor:'',secondTrack:''});target.form.querySelector('#dashboard-focus-options').innerHTML=focusOptions(p);}
 return {click,submit,change,input,loadService,authorizeAdvice,reset(){retry=null;r.manualUndo=null;r.manualWelcome=false;},get busy(){return locked;}};
}
