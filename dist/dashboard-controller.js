import {dashboardReady,short} from './dashboard-view.js';
import {newcomerWorkspace,manualCoursePlan,manualDegreePlan,manualCourseOptions,studyBoundary} from './dashboard-flow.js';
import {newJourney,eligibleMinors,allowedChoices,planIssues} from './guidance.js';
import {DATA,programFor,coursesFor,normalizeProfile,label} from './planner.js';
import {buildProposal,editJourney} from './workspace-flow.js';
import {requestAdvice,trackUsage} from './ai-client.js';
import {proposeReplan,replanSnapshot} from './replanning.js';
import {esc,options,link,targetEvidence} from './views.js';
const action=(id,text,extra='')=>`<button type="button" class="button secondary" data-action="${id}" ${extra}>${text}</button>`;
const stages={direction:'Finding your direction…',courses:'Choosing your courses…',targets:'Finding your matches…',pace:'Mapping your semesters…'};
const friendly=e=>['REQUEST_BUDGET','RESPONSE_INCOMPLETE','ADVISER_TIMEOUT'].includes(e.code)?'This suggestion isn’t ready yet. Try a different request or keep your current plan.':e.message;

export function createDashboardController(h){
 const r=h.runtime,state=()=>h.read(),current=()=>state().phase==='draft'?state().draftPlan:state().plan;
 let locked=false,retry=null;
 function display(){h.render();}
 function commit(message=''){h.changed(message);}
 function panel(name){r.dashboardPanel=name;r.dashboardWelcome=false;display();}
 async function advice(stage){r.dashboardWork=stages[stage];const ok=await h.getAdvice(stage);if(!ok)throw Object.assign(Error(r.aiError||'Tell GoPlan a little more about what you want.'),{handled:true});return true;}
 async function ensure(part){
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
 async function run(job,repeat=job){
  if(locked)return;locked=true;retry=repeat;r.aiError='';r.dashboardNotice='';
  try{await job();}catch(e){if(!e.handled)r.aiError=friendly(e)||'That change could not be completed.';}finally{locked=false;r.busy=false;display();}
 }
 async function start(){
  if(state().journey.studentContext&&!state().plan&&!state().draftPlan){r.dashboardWelcome=false;h.showPlan();display();return;}
  const seed=newcomerWorkspace({name:h.account()?.firstName||''});await h.startWorkspace(seed);r.dashboardPanel='overview';r.dashboardWelcome=false;display();
 }
 function ask(initial=''){
  h.modal(h.head('Make it more you')+`<form id="dashboard-modal-command"><label class="field">What would you like to change or know?<textarea name="request" rows="3" minlength="5" maxlength="2500" required placeholder="For example: keep my minor to five courses, or suggest more startups.">${esc(initial)}</textarea></label><button class="button primary" type="submit">Ask GoPlan ↗</button></form>`);
 }
 async function command(text){
  if(!text?.trim())return;
  const before=JSON.stringify([state().journey.profile,current()?.id,current()?.updatedAt]),j=structuredClone(state().phase==='journey'?state().journey:newJourney(current()));
  r.busy=true;r.dashboardWork='Understanding your change…';display();
  const request=r.pendingDashboardRequest?`${r.pendingDashboardRequest} Additional detail: ${text}`:text;
  const route=await requestAdvice('change',j,{changeRequest:request});r.busy=false;
  if(before!==JSON.stringify([state().journey.profile,current()?.id,current()?.updatedAt]))throw Error('Your plan changed while I was checking. Please send the request again.');
  if(route.kind==='answer'){r.dashboardNotice=route.summary;r.dashboardAnswer=route.summary;return;}
  if(route.kind==='clarify'){r.pendingDashboardRequest=request;r.dashboardNotice=route.questions?.[0]||route.summary;return;}
  r.pendingDashboardRequest='';
  if(route.kind==='schedule'){rescue(request);return;}
  const previous=current(),wasPlanned=!!previous,next=previous?editJourney(previous,request,route.startStep,studyBoundary(previous).currentTerm):state().journey;
  state().journey=next;state().phase='journey';state().draftPlan=null;
  next.changeRequest=request;next.refinements||={};next.agentStamps||={};
  const target=route.startStep<=2?'direction':route.startStep===3?'courses':route.startStep===4?'targets':'pace';
  next.refinements[target]=request;
  if(target==='direction'&&next.studentContext)next.studentContext.degreeIntent='explore';
  if(target==='courses')next.agentChoices={...next.profile.choices};
  const targetsBefore=next.details?{internships:next.details.internships||[],exchanges:next.details.exchanges||[],targetResearch:next.details.targetResearch}:null;
  if(!await h.getAdvice(target))return;
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
 function save(){
  const s=state();if(!s.draftPlan)return;
  if(s.plan)s.history=[structuredClone(s.plan),...(s.history||[])].slice(0,3);
  s.plan=structuredClone(s.draftPlan);s.plan.finalizedAt=new Date().toISOString();s.draftPlan=null;s.phase='saved';s.journey=newJourney(s.plan);r.dashboardPanel='overview';
  commit('Saved. Come back whenever your plans change.');trackUsage('plan_saved');
 }
 function course(id){
  const p=current(),profile=p?.profile||state().journey.profile,c=(p?.courses||coursesFor(profile)).find(c=>c.id===id);if(!c)return;
  const term=p?.terms.find(t=>t.courses.includes(id)),progress=p?.tracking?.[id]?.status||'planned',alternatives=manualCourseOptions(c,profile);
  h.modal(h.head(c.title,c.code||'Course choice')+`<p class="course-detail-meta">${c.credits} credits · ${esc(c.minorId?'Your minor':c.choice?'Personal choice':'Degree core')}</p>${p?`<form id="dashboard-course-form" data-course-id="${esc(id)}"><div class="field-grid"><label class="field">Status<select name="status">${options([['planned','Planned'],['in-progress','Taking now'],['completed','Completed'],['retake','Need to retake']],progress)}</select></label><label class="field">Semester<select name="term">${options(p.terms.filter(t=>t.id!=='prior'||term?.id==='prior').map(t=>[t.id,label(t)]),term?.id)}</select></label></div>${alternatives.length?`<details class="quiet-details"><summary>Choose a different course</summary><label class="field">Course<select name="course">${options([['','Keep this course'],...alternatives.map(x=>[x.code,x.title+' · '+x.code])],c.code)}</select></label></details>`:''}<p id="dashboard-course-error" class="field-error" role="alert"></p><button class="button primary" type="submit">Save changes</button></form>`:''}<div class="deck-actions">${action('dashboard-course-replace','Ask GoPlan for an alternative',`data-course-id="${esc(id)}"`)}</div><details class="quiet-details"><summary>Course details</summary><p>${esc(c.prerequisiteText||'GoPlan checks the course sequence.')}</p>${c.condition?`<p>${esc(c.condition)}</p>`:''}</details>`);
 }
 function degreeOptions(){
  const p=current()?.profile||state().journey.profile;
  h.modal(h.head('Your degree, your choice')+`<form id="dashboard-degree-form"><label class="field">Degree<select name="program" id="dashboard-degree">${options(DATA.programs.filter(p=>p.level==='undergraduate').map(p=>[p.id,p.name]),p.program)}</select></label><div id="dashboard-focus-options">${focusOptions(p)}</div><p id="dashboard-degree-error" class="field-error" role="alert"></p><button class="button primary" type="submit">Update my degree</button></form>`);
 }
 function focusOptions(p){const degree=programFor(p);return `${degree.tracks.length?`<label class="field">Focus<select name="track">${options(degree.tracks.map(t=>[t.id,t.name]),p.track)}</select></label>`:''}<label class="field">Minor<select name="minor">${options([['','No minor for now'],...eligibleMinors(p).map(m=>[m.id,m.name])],p.minor)}</select></label><details class="quiet-details"><summary>More choices</summary>${['BBA','BSCSC'].includes(p.program)?`<label class="field">Second focus<select name="secondTrack">${options([['','None'],...degree.tracks.map(t=>[t.id,t.name])],p.secondTrack)}</select></label>`:''}</details>`;}
 function pace(){
  const p=current()?.profile||state().journey.profile;
  h.modal(h.head('Make room for your life')+`<form id="dashboard-pace-form"><label class="field">Regular semester<select name="regular">${options([['5','Up to 5 courses'],['6','Up to 6 courses']],String(p.regularCourses))}</select></label><label class="field">Summer<select name="summer">${options([['0','Keep summers free'],['2','Up to 2 courses'],['3','Up to 3 courses']],p.summers?String(p.summerCourses):'0')}</select></label><details class="quiet-details"><summary>Starting year and placement</summary><label class="field">First fall year<input name="year" type="number" min="2000" max="2040" value="${p.startYear}" required></label><label class="field">Language preparation still needed<select name="lc">${options([['0','None / not sure'],['1','One semester'],['2','Two semesters']],String(p.lc))}</select></label><p class="small-note">Extra course loads depend on your academic standing or approval.</p></details><p id="dashboard-pace-error" class="field-error" role="alert"></p><button class="button primary" type="submit">Update my semesters</button></form>`);
 }
 function target(type,index){
  const t=(current()?.targets||state().journey.details||{})[type]?.[index];if(!t)return;
  const source=t.researchSources?.[0]?.url||t.sourceUrl;
  h.modal(h.head(t.name,t.country||t.organizationType||'A target to explore')+`<p>${esc(short(t.reason,220))}</p>${link(source,'Visit official source')}<details class="quiet-details"><summary>Why it fits and what to check</summary><p>${esc(t.industryReason||t.tierReason||'')}</p>${targetEvidence(t)}<p>${esc(Array.isArray(t.constraints)?t.constraints.join(' '):t.constraints||t.caveat||'Confirm current availability and eligibility.')}</p></details><div class="deck-actions">${action('dashboard-change','Suggest something different')}</div>`);
 }
 function why(kind){const a=current()?.decisions?.advice?.academic||state().journey.advice?.academic||{},key={'Degree':'rationale','Focus':'focusRationale','Minor':'minorRationale','Second focus':'secondFocusRationale'}[kind];h.modal(h.head('Why this match?')+`<p>${esc(a[key]||'Your combination connects your stated interests with its academic requirements.')}</p><details class="quiet-details"><summary>More context</summary>${(current()?.decisions?.advice?.assessment||state().journey.advice?.assessment||[]).map(x=>`<p>${esc(x.explanation)}</p>`).join('')}</details>`);}
 function rescue(request='',selectedId=''){
  const p=current();if(!p){ask(request||'I want to choose a different course.');return;}
  const selected=p.courses.find(c=>c.id===selectedId||request.toUpperCase().replace(/\s/g,'').includes(c.code)&&c.code),terms=p.terms.filter(t=>!['prior','pending'].includes(t.id));
  h.modal(h.head('A course isn’t offered?','Let’s find a way around it.')+`<form id="dashboard-rescue-form"><label class="field">Which course?<select name="course">${options(p.courses.filter(c=>c.code&&!['completed','in-progress'].includes(p.tracking?.[c.id]?.status)).map(c=>[c.code,c.title+' · '+c.code]),selected?.code)}</select></label><label class="field">In which semester?<select name="term">${options(terms.map(t=>[t.id,label(t)]),selected?p.terms.find(t=>t.courses.includes(selected.id))?.id:terms[0]?.id)}</select></label><details class="quiet-details"><summary>Add a preference</summary><textarea name="request" rows="2" maxlength="2000" placeholder="Anything you would like to keep?">${esc(request)}</textarea></details><button class="button primary" type="submit">Find a replacement</button><p id="dashboard-rescue-error" class="field-error" role="alert"></p></form>`);
 }
 async function submit(form){
  if(!form.id.startsWith('dashboard-'))return false;
  if(locked||r.busy)return true;
  const data=new FormData(form);
  if(form.id==='dashboard-clarification-form'){state().journey.answers=String(data.get('answer')||'').slice(0,2500);await run(()=>advice('direction'));return true;}
  if(['dashboard-command-form','dashboard-modal-command'].includes(form.id)){
   const text=String(data.get('request')||'');if(form.id==='dashboard-modal-command')h.close();await run(()=>command(text));return true;
  }
  if(form.id==='dashboard-course-form'){
   try{const p=current(),result=manualCoursePlan(p,{id:form.dataset.courseId,courseCode:String(data.get('course')||''),termId:String(data.get('term')||''),status:String(data.get('status')||'planned')});const oldIssues=new Set(planIssues(p).filter(i=>i.level==='conflict').map(i=>i.text));replacePlan(result.candidate);h.close();commit(result.issues.some(i=>i.level==='conflict'&&!oldIssues.has(i.text))?'Saved. A scheduling check needs your attention.':'Course updated.');}catch(e){form.querySelector('#dashboard-course-error').textContent=e.message;}return true;
  }
  if(form.id==='dashboard-degree-form'){
   try{const p=current(),old=p?.profile||state().journey.profile,profile=normalizeProfile({...old,program:String(data.get('program')),track:String(data.get('track')||''),secondTrack:String(data.get('secondTrack')||''),minor:String(data.get('minor')||''),choices:String(data.get('program'))===old.program?old.choices:{}});
    if(p){state().draftPlan=manualDegreePlan(p,profile);state().phase='draft';state().journey=newJourney(state().draftPlan);}else{const j=state().journey;j.profile=profile;j.programChosen=true;j.details=null;j.agentStamps={};j.advice={kind:'recommend',summary:'Your degree choices.',themes:[],questions:[],tradeoffs:[],academic:{program:profile.program,track:profile.track,secondTrack:profile.secondTrack,minor:profile.minor,rationale:'Chosen by you.'}};}
    h.close();r.dashboardPanel='direction';commit(p?'Degree updated in your preview. Save when ready.':'Your degree choices are updated.');
   }catch(e){form.querySelector('#dashboard-degree-error').textContent=e.message;}return true;
  }
  if(form.id==='dashboard-pace-form'){
   try{const p=current(),j=state().journey,old=p?.profile||j.profile,profile=normalizeProfile({...old,regularCourses:Number(data.get('regular')),summers:data.get('summer')!=='0',summerCourses:data.get('summer')==='0'?old.summerCourses:Number(data.get('summer')),startYear:Number(data.get('year')),lc:Number(data.get('lc'))});
    if(p){state().draftPlan=manualDegreePlan(p,profile);state().phase='draft';state().journey=newJourney(state().draftPlan);}else j.profile=profile;
    h.close();r.dashboardPanel=p?'semesters':'overview';commit(p?'Your updated semester map is ready to review.':'Your pace is set.');
   }catch(e){form.querySelector('#dashboard-pace-error').textContent=e.message;}return true;
  }
  if(form.id==='dashboard-rescue-form'){
   const p=current();if(!p)return true;const original=JSON.stringify(p),term=String(data.get('term')),courseCode=String(data.get('course')),request=String(data.get('request')||'Find an eligible alternative and keep graduation on time when possible.');
   const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Finding a replacement…';
   await run(async()=>{
    r.busy=true;r.dashboardWork='Finding a way around this course…';display();
    const result=await requestAdvice('replan',newJourney(p),{plan:replanSnapshot(p),currentTerm:term,unavailable:[{courseCode,termId:term}],offerings:[],changeRequest:request});r.busy=false;
    if(original!==JSON.stringify(current()))throw Error('Your plan changed. Please ask again.');
    if(result.kind==='clarify'){form.querySelector('#dashboard-rescue-error').textContent=result.questions?.[0]||result.summary;return;}
    const proposal=proposeReplan(p,result.change,term);if(!proposal.assessment.canApply)throw Error('This change still has a scheduling conflict. Try another course or ask your academic adviser.');
    state().draftPlan=proposal.candidate;state().draftPlan.revisionAssessment=proposal.assessment;state().phase='draft';state().journey=newJourney(state().draftPlan);r.dashboardPanel='semesters';r.dashboardNotice=result.summary;h.close();h.persist();
   });button.disabled=false;button.textContent='Find a replacement';if(r.aiError)form.querySelector('#dashboard-rescue-error').textContent=r.aiError;return true;
  }
  return false;
 }
 function replacePlan(p){if(state().phase==='draft')state().draftPlan=p;else{state().history=[structuredClone(state().plan),...(state().history||[])].slice(0,3);state().plan=p;}state().journey=newJourney(p);}
 async function click(b){
  const a=b.dataset.action;if(!a?.startsWith('dashboard-'))return false;
  if(locked||r.busy){h.notify('Your adviser is finishing this change.');return true;}
  if(a==='dashboard-start')await start();
  else if(a==='dashboard-home'){r.dashboardWelcome=true;panel('overview');r.dashboardWelcome=true;display();}
  else if(a==='dashboard-panel')panel(b.dataset.panel);
  else if(a==='dashboard-open')await run(()=>ensure(b.dataset.panel));
  else if(a==='dashboard-courses')await run(()=>ensure('courses'));
  else if(a==='dashboard-targets')await run(()=>ensure('opportunities'));
  else if(a==='dashboard-build')await run(()=>ensure('semesters'));
  else if(a==='dashboard-change')ask();
  else if(a==='dashboard-course-group'){r.courseGroup=b.dataset.group;display();}
  else if(a==='dashboard-target-group'){r.targetGroup=b.dataset.group;display();}
  else if(a==='dashboard-term'){r.selectedTerm=b.dataset.term;display();}
  else if(a==='dashboard-course')course(b.dataset.courseId);
  else if(a==='dashboard-course-replace'){const c=(current()?.courses||coursesFor(state().journey.profile)).find(c=>c.id===b.dataset.courseId);ask(`Replace ${c?.code||c?.title||'this course'} with another eligible course that fits my interests.`);}
  else if(a==='dashboard-target')target(b.dataset.targetType,Number(b.dataset.targetIndex));
  else if(a==='dashboard-why')why(b.dataset.kind);
  else if(a==='dashboard-direction-options')degreeOptions();
  else if(a==='dashboard-pace')pace();
  else if(a==='dashboard-unavailable')rescue();
  else if(a==='dashboard-save')save();
  else if(a==='dashboard-export')await h.exportPlan();
  else if(a==='dashboard-retry'){if(retry)await run(retry);else await run(async()=>{if(await h.getAdvice('direction'))state().journey.step=2;});}
  return true;
 }
 function change(target){if(target.id!=='dashboard-degree')return;const old=current()?.profile||state().journey.profile,p=normalizeProfile({...old,program:target.value,track:'',minor:'',secondTrack:''});target.form.querySelector('#dashboard-focus-options').innerHTML=focusOptions(p);}
 return {click,submit,change,reset(){retry=null;},get busy(){return locked;}};
}
