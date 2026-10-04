import {createAccountWorkspace} from './accounts.js';
import {openMistakeReport,openMyReports,ethicsPolicy} from './feedback-view.js';
import {homeView} from './home-view.js';
import {freshWorkspace,editJourney,buildProposal} from './workspace-flow.js';
import {researchView,updateView} from './journey-view.js';
import {missingAnswers} from './questionnaire.js';
import {adviceFingerprint,acceptAdvice,synchronizeGoal} from './journey-state.js';
import {replanSnapshot,proposeReplan} from './replanning.js';
import {DATA,normalizeProfile,programFor,coursesFor,moveCourse,restoreState,label,code} from './planner.js';
import {GUIDED,emptyWorkspace,newJourney,makePlan,planIssues,completedIds,validateSavedWorkspace,suggestChoices,allowedChoices,migrateLegacy} from './guidance.js';
import {esc,cite,link,btn,options,journeyView,planView,libraryView,experienceCards,minorChecklistView} from './views.js';
import {createWorkbook} from './export.js';
import {requestAdvice,aiStatus,setAccessCode,hasAccessCode,resetAdviserSession,trackUsage} from './ai-client.js';
const $=s=>document.querySelector(s);
let rememberedWorkspace='';try{rememberedWorkspace=localStorage.getItem('goplan-last-workspace')||'';}catch{}
const workspaceId=new URLSearchParams(location.search).get('workspace')||rememberedWorkspace;
const separateWorkspace=/^[a-zA-Z0-9-]{1,80}$/.test(workspaceId);
let KEY='goplan-aui-v3'+(separateWorkspace?':'+workspaceId:'');
let state=emptyWorkspace(),view='home',storageFailed=false,loadFailed=false,toastTimer,sourcePages;
const runtime={busy:false,aiError:'',aiStatus:null,validation:{}};let renderedScreen='';let lastStage='direction';
const active=()=>state.phase==='draft'?state.draftPlan:state.plan;
const accounts=createAccountWorkspace({read:()=>state,render,notify,modal,head:(...args)=>head(...args),close:()=>close(),busy:()=>runtime.busy||changeBusy||replanBusy||targetBusy||questionBusy,open:(next,key,begin=false)=>{state=next;KEY=key;loadFailed=false;storageFailed=false;view=begin?'plan':'home';renderedScreen='';runtime.aiError='';runtime.validation={};resetAdviserSession();}});
try{const saved=localStorage.getItem(KEY);if(saved)state=validateSavedWorkspace(JSON.parse(saved));else if(!separateWorkspace){const legacy=localStorage.getItem('goplan-aui-v2');if(legacy)state=migrateLegacy(JSON.parse(legacy));}}catch{loadFailed=true;storageFailed=true;}
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),6500);}
function persist(){if(accounts.signedIn){accounts.schedule(state);return;}if(!loadFailed)try{state.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(state));localStorage.setItem('goplan-last-workspace',KEY.startsWith('goplan-aui-v3:')?KEY.slice('goplan-aui-v3:'.length):'');storageFailed=false;}catch{storageFailed=true;}$('#save-status').textContent=storageFailed?'Saving unavailable · keep this page open':'Saved on this device';}
function render(){const surface=$('#view-content'),screen=view+':'+state.phase+':'+state.journey.step,same=screen===renderedScreen,focus=surface.contains(document.activeElement)?document.activeElement:null,field=focus?['profile','journey','choice','question'].find(k=>focus.dataset[k]):null,focusValue=field?focus.dataset[field]:null,expanded=same?[...surface.querySelectorAll('details[data-disclosure][open]')].map(d=>d.dataset.disclosure):[];runtime.hasAccess=hasAccessCode();$('#crumb').textContent=view==='home'?'Home':state.phase==='journey'?'Your next step':'Your roadmap';$('#view-content').innerHTML=accounts.gate()||(view==='home'?homeView(state,accounts.profile):view==='plan'?(state.phase==='journey'?journeyView(state,runtime):planView(active(),state.phase==='draft')):libraryView(view));$('#save-status').textContent=storageFailed?'Saving unavailable':'Saved on this device';for(const key of expanded){const item=surface.querySelector('[data-disclosure="'+CSS.escape(key)+'"]');if(item)item.open=true;}if(same&&field)surface.querySelector('[data-'+field+'="'+CSS.escape(focusValue)+'"]')?.focus({preventScroll:true});renderedScreen=screen;accounts.updateStatus();}

function changed(message){persist();render();if(message)notify(message);}
function modal(body){$('#modal-content').innerHTML=`<div class="modal-inner">${body}</div>`;if(!$('#modal').open)$('#modal').showModal();}
const head=(title,subtitle='')=>`<div class="modal-head"><div><h2 id="modal-title">${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="icon-button" data-action="close" aria-label="Close dialog">×</button></div>`;
const close=()=>$('#modal').close();
function invalidateAdvice(j){j.agentStamps={};j.agentChoices={};j.lastUpdates={};j.paceAdvice=null;j.details=null;j.advice=null;j.choiceReasons={};j.internships=[];j.exchanges=[];j.detailsDirty=true;}
function setDegree(id){if(!DATA.programs.some(p=>p.id===id))return;state.journey.profile=normalizeProfile({...state.journey.profile,program:id,track:'',secondTrack:'',minor:'',choices:{}});state.journey.programChosen=true;invalidateAdvice(state.journey);}
async function getAdvice(stage){
 if(runtime.busy)return false;
 lastStage=stage;runtime.aiError='';
 const j=state.journey;synchronizeGoal(j);
 if(stage==='setup'&&j.background.trim().length<10){runtime.validation={background:true};render();$('[data-journey="background"]')?.focus();return false;}
 if(stage==='direction'&&missingAnswers(j.questionnaire).length){const missing=missingAnswers(j.questionnaire);runtime.validation=Object.fromEntries(missing.map(q=>[q.id,true]));j.step=1;render();$('[data-question="'+missing[0].id+'"]')?.focus();return false;}runtime.validation={};
 const codeInput=$('#ai-access-code');if(codeInput?.value)setAccessCode(codeInput.value);if(runtime.aiStatus?.requiresAccess&&!hasAccessCode()){runtime.aiError='Enter your demo access code to continue with your adviser. Your answers are saved.';render();$('#ai-access-code')?.focus();return false;}
 lastStage=stage;runtime.busy=true;runtime.aiError='';const before=adviceFingerprint(stage,j);render();
 try{const result=await requestAdvice(stage,j);if(j!==state.journey||before!==adviceFingerprint(stage,j))throw Error('Your choices changed. Request fresh advice for the latest answers.');if(result.kind==='answer'){showAnswer(result,j.profile);return false;}acceptAdvice(j,stage,result);persist();return result.kind!=='clarify';}
 catch(e){runtime.aiError=e.name==='TimeoutError'?'The adviser took too long. Your draft is saved; please retry.':e.message;return false;}
 finally{runtime.busy=false;render();}
}
async function next(){
 const j=state.journey;if(runtime.busy)return;synchronizeGoal(j);
 const stage=['setup','direction','courses','targets','pace'][j.step];if(!stage)return;
 const cached=j.agentStamps?.[stage]===adviceFingerprint(stage,j);
 if(!cached){runtime.nextAfterAdvice=j.step===0?0:j.step+1;if(!await getAdvice(stage))return;if(stage==='setup'){changed();return;}}
 j.step=Math.min(5,j.step+1);runtime.nextAfterAdvice=null;runtime.aiError='';changed();$('#main').scrollIntoView({block:'start'});
}
function startDecisions(){if(state.plan){openChange();return;}view='plan';render();}
async function startFresh(){
 if(runtime.busy||changeBusy||replanBusy||targetBusy||questionBusy){notify('Wait for your current recommendation to finish.');return;}
 if(!globalThis.GoPlanAndroid){if(await accounts.prepareNew()){view='plan';close();render();$('#main').scrollIntoView();}return;}
 persist();const id=crypto.randomUUID();KEY='goplan-aui-v3:'+id;state=freshWorkspace();loadFailed=false;runtime.aiError='';runtime.validation={};runtime.nextAfterAdvice=null;resetAdviserSession();
 try{localStorage.setItem('goplan-last-workspace',id);const url=new URL(location.href);url.searchParams.set('workspace',id);url.hash='';history.replaceState(null,'',url);}catch{}
 view='plan';close();changed();$('#main').scrollIntoView();
}

function showChecks(){modal(`${head('Review your roadmap','Resolve conflicts and confirm source conditions before registration.')}<div class="review-notes">${planIssues(active()).map(x=>`<div class="review-item ${esc(x.level)}"><strong>${esc(x.level==='conflict'?'Needs attention':x.level==='source'?'Source difference':'Confirm with your advisor')}</strong><p>${esc(x.text)}</p>${x.id?`<button class="text-button" data-course="${esc(x.id)}">Open course →</button>`:''}</div>`).join('')||'<p>No modeled conflicts found. Confirm actual offerings with AUI.</p>'}</div>`);}
function showTargets(){const p=active();modal(`${head('Your next chapter',p.decisions?.goal||'Recommendations for your direction')}<p>${esc(p.minor?'Minor in '+p.minor.name:'')}</p>${Object.entries(p.targets||{}).filter(([type])=>['internships','exchanges'].includes(type)).map(([type,items])=>`<h3>${{internships:'Internship targets',exchanges:'Exchange destinations',auiMasters:'AUI master’s targets',globalMasters:'Global master’s topics'}[type]}</h3>${items.map(t=>`<article class="review-item"><span class="tag">${esc(t.tier||'Research target')}</span><strong>${esc(t.name||t.topic)}</strong><p>${esc(t.reason||t.admissionSummary||'')}</p><p>${esc(t.caveat||'Eligibility and admission need review.')}</p>${link(t.sourceUrl||t.example?.url,'Official source')}${t.source?cite(t.source):''}</article>`).join('')||'<p class="small-note">No target selected yet.</p>'}`).join('')}`);}
function courseModal(id){const p=active(),c=p?.courses.find(c=>c.id===id);if(!c)return;const t=p.terms.find(t=>t.courses.includes(id)),tr=p.tracking[id]||{};modal(`${head(c.title,c.code||'Course choice still open')}<p class="small-note">${esc(c.category)} · ${c.credits} credits</p><form id="course-form" data-id="${esc(id)}">${c.choice?`<label class="field">Course choice<select name="choice">${options([['','Choose a course'],...allowedChoices(c,p.profile).map(x=>[x.code,`${x.code} · ${x.title} (${x.credits} cr.)`])],p.profile.choices[id]||'')}</select></label>`:''}<p class="info-box">${esc(c.prerequisiteText||'Your adviser checks prerequisites when building the plan.')}</p>${c.condition?`<p class="warning">${esc(c.condition)}</p>`:''}<div class="field-grid"><label class="field">Semester<select name="destination">${options(p.terms.filter(q=>q.id!=='prior'||t.id==='prior').map(q=>[q.id,label(q)]),t.id)}</select></label><label class="field">Progress<select name="status">${options([['planned','Planned'],['in-progress','Studying now'],['completed','Completed / passed'],['retake','Needs a retake']],tr.status||'planned')}</select></label><label class="field">Grade (optional)<select name="grade">${options(['','A','A−','B+','B','B−','C+','C','C−','D+','D','F','P','W','I'].map(g=>[g,g||'Not recorded']),tr.grade||'')}</select></label></div><label class="field">Progress note<textarea name="note" maxlength="1000" rows="2">${esc(tr.note||'')}</textarea></label><p class="small-note">Changing a course does not rebuild your roadmap. Save, then review the updated checks.</p><div class="modal-actions">${btn('close','Cancel')}<button class="button primary" type="submit">Save course update</button></div></form>`);}
function reportModal(){const p=active();modal(`${head('Course offering or plan conflict')}<p>Record the issue, adjust the affected course when you know the available option, and mark it resolved. Your roadmap stays in place.</p><form id="report-form"><label class="field">Affected course<select name="courseId">${options(p.courses.map(c=>[c.id,(c.code?c.code+' · ':'')+c.title]),'')}</select></label><label class="field">What happened?<select name="type">${options([['unavailable','Course not offered'],['timetable','Timetable clash'],['prerequisite','Registration / prerequisite conflict'],['other','Another plan conflict']],'unavailable')}</select></label><label class="field">Details<textarea name="detail" required maxlength="1000" rows="3" placeholder="For example: this course is not offered in Spring. My advisor suggested Fall."></textarea></label><div class="modal-actions"><button class="button primary">Record conflict</button></div></form><h3>Recorded issues</h3>${p.reports.map(r=>`<div class="review-item"><strong>${esc(p.courses.find(c=>c.id===r.courseId)?.code||r.courseId)} · ${esc(r.status)}</strong><p>${esc(r.detail)}</p>${r.status==='open'?`<div class="card-actions"><button class="text-button" data-course="${esc(r.courseId)}">Adjust course</button><button class="text-button" data-resolve="${esc(r.id)}">Mark resolved</button></div>`:''}</div>`).join('')||'<p class="small-note">No conflicts recorded.</p>'}`);}
async function showSource(file,page){try{if(!sourcePages){const r=await fetch('source-pages.json');if(!r.ok)throw Error('Source library could not load.');sourcePages=await r.json();}const pages=sourcePages[file];const doc=pages?{pages}:null;if(!doc)throw Error('This source is not in the local library.');page=Math.max(1,Math.min(doc.pages.length,Number(page)||1));const text=doc.pages[page-1];modal(`${head(file,`PDF page ${page} of ${doc.pages.length}`)}<form id="source-form" data-file="${esc(file)}" class="source-toolbar"><label class="field">Page<input name="page" type="number" min="1" max="${doc.pages.length}" value="${page}"></label><button class="button secondary">Go</button>${page>1?`<button type="button" class="button secondary" data-source-file="${esc(file)}" data-source-page="${page-1}">Previous</button>`:''}${page<doc.pages.length?`<button type="button" class="button secondary" data-source-file="${esc(file)}" data-source-page="${page+1}">Next</button>`:''}</form><pre class="source-text">${esc(typeof text==='string'?text:text.text)}</pre>`);}catch(e){notify(e.message);}}
function download(bytes,name,mime){if(window.GoPlanAndroid?.saveFile){let binary='';for(const b of bytes)binary+=String.fromCharCode(b);window.GoPlanAndroid.saveFile(name,mime,btoa(binary));return;}const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function exportPlan(){const p=active();try{download(await createWorkbook(p.terms,p.courses,p.profile,completedIds(p),planIssues(p),null,p),'GoPlan-degree-plan.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');trackUsage('excel_requested');notify('Your Excel plan is ready in your semester-block layout.');}catch(e){notify('Excel export could not finish: '+e.message);}}
function addTerm(){const p=active(),last=p.terms.filter(t=>!['prior','pending'].includes(t.id)).at(-1),season=last?.season==='Fall'?'Spring':last?.season==='Spring'?'Summer':'Fall',year=last?last.year+(last.season==='Fall'?1:0):p.profile.startYear;const term={id:`${season}-${year}`,season,year,courses:[],exchange:false,lc:false},pending=p.terms.find(t=>t.id==='pending');p.terms=p.terms.filter(t=>t.id!=='pending');p.terms.push(term);if(pending)p.terms.push(pending);changed(`${label(term)} added. Open a course to move it here.`);}
document.addEventListener('input',e=>{const t=e.target;if(t.id==='ai-access-code'){setAccessCode(t.value);return;}if(t.dataset.feedback){state.journey.refinements||={};state.journey.refinements[t.dataset.feedback]=t.value;persist();return;}if(t.dataset.question){state.journey.questionnaire[t.dataset.question]=t.value;synchronizeGoal(state.journey);const missing=missingAnswers(state.journey.questionnaire);if($('#question-progress'))$('#question-progress').textContent=(3-missing.length)+' of 3 essentials answered';if(!missing.some(q=>q.id===t.dataset.question)){delete runtime.validation[t.dataset.question];t.setAttribute('aria-invalid','false');const error=$('#error-'+t.dataset.question);if(error)error.hidden=true;}persist();return;}if(t.tagName==='SELECT'||t.type==='checkbox')return;if(t.dataset.journey){state.journey[t.dataset.journey]=t.value;if(t.dataset.journey==='background'&&t.value.trim().length>=10){delete runtime.validation.background;t.setAttribute('aria-invalid','false');if($('#background-error'))$('#background-error').hidden=true;}persist();}if(t.dataset.profile&&t.dataset.profile!=='priorCodes'){state.journey.profile[t.dataset.profile]=t.value;persist();}});
document.addEventListener('change',e=>{const t=e.target,j=state.journey;try{if(t.dataset.journey){j[t.dataset.journey]=t.value;if(t.dataset.journey==='level'){j.preferredDegree='undecided';j.programChosen=false;}if(t.dataset.journey==='preferredDegree')j.programChosen=false;if(t.dataset.journey==='mastersPreference'){if(t.value==='aui'||t.value==='later')j.globalMasters=[];if(t.value==='global'||t.value==='later')j.auiMasters=[];}changed();}if(t.dataset.profile){const key=t.dataset.profile;if(key==='program'){setDegree(t.value);}else if(key==='priorCodes'){const codes=t.value.split(/[,;\n]+/).map(code).filter(Boolean),unknown=codes.filter(c=>!DATA.courses[c]);if(unknown.length){notify('Unknown course codes: '+unknown.join(', '));t.value=j.profile.priorCodes.join(', ');return;}j.profile.priorCodes=codes;}else{j.profile[key]=key==='summers'?t.value==='true':t.value;if(['track','secondTrack','minor'].includes(key)){invalidateAdvice(j);}if(key==='secondTrack'&&j.profile.program==='BBA'&&t.value)j.profile.minor='';j.profile=normalizeProfile(j.profile);}changed();}if(t.dataset.choice){j.agentChoices||={...j.details?.choices};delete j.agentChoices[t.dataset.choice];j.profile.choices={...j.profile.choices,[t.dataset.choice]:t.value};j.detailsDirty=true;changed();}if(t.dataset.target){const type=t.dataset.target;j[type]=t.checked?[...new Set([...j[type],t.value])]:j[type].filter(id=>id!==t.value);persist();t.closest('.target-card')?.classList.toggle('selected',t.checked);}}catch(e){notify(e.message);}});
document.addEventListener('click',async e=>{const b=e.target.closest('button,a.brand');if(!b)return;try{if(b.matches('a.brand')){e.preventDefault();view='home';render();return;}if(runtime.busy)return;if(b.dataset.agentStage){runtime.nextAfterAdvice=null;await getAdvice(b.dataset.agentStage);return;}if(b.dataset.view){view=b.dataset.view;render();return;}if(b.dataset.course){courseModal(b.dataset.course);return;}if(b.dataset.sourceFile){await showSource(b.dataset.sourceFile,b.dataset.sourcePage);return;}if(b.dataset.interest){const j=state.journey,id=b.dataset.interest;j.interests=j.interests.includes(id)?j.interests.filter(x=>x!==id):[...j.interests,id];changed();return;}if(b.dataset.program){setDegree(b.dataset.program);changed();return;}if(b.dataset.minor){state.journey.profile.minor=b.dataset.minor;changed();return;}if(b.dataset.resolve){active().reports.find(r=>r.id===b.dataset.resolve).status='resolved';persist();render();reportModal();return;}
 switch(b.dataset.action){
 case 'home':close();view='home';render();break;
 case 'resume-plan':view='plan';render();break;
 case 'open-saved':state.phase='saved';view='plan';changed();break;
 case 'fresh-start':startFresh();break;
 case 'change-plan':openChange();break;
 case 'mistake-report':if(state.plan)openMistakeReport({plan:state.plan,workspace:KEY,modal,head,onReconsider:openChange});break;
 case 'my-reports':openMyReports({workspace:KEY,modal,head});break;
 case 'ethics-policy':modal(head('AI and data ethics')+ethicsPolicy());break;
 case 'ask-adviser':openQuestion();break;
 case 'new-user':startFresh();break;
 case 'close':close();break;
 case 'profile':case 'new-decisions':startDecisions();break;
 case 'confirm-new':state.journey=newJourney(state.plan);state.journey.programChosen=true;state.phase='journey';state.draftPlan=null;view='plan';close();changed();break;
 case 'journey-next':await next();break;
 case 'retry-ai':{if(await getAdvice(lastStage)){if(runtime.nextAfterAdvice!=null){state.journey.step=runtime.nextAfterAdvice;runtime.nextAfterAdvice=null;changed();}}break;}
 case 'refine-direction':await getAdvice('direction');break;
 case 'refresh-details':await getAdvice(state.journey.step===4?'targets':'courses');break;
 case 'manual-direction':invalidateAdvice(state.journey);state.journey.manual=true;state.journey.programChosen=true;state.journey.step=2;runtime.aiError='';changed();break;
 case 'journey-back':state.journey.step=Math.max(0,state.journey.step-1);runtime.aiError='';runtime.validation={};runtime.nextAfterAdvice=null;changed();$('#main').scrollIntoView({block:'start'});break;
 case 'suggest-choices':{const r=suggestChoices(state.journey);state.journey.profile=r.profile;changed(`${r.filled} source-listed choices suggested. Review them and select language placements separately.`);break;}
 case 'agent-targets':openTargetAgent();break;
 case 'apply-target-update':applyTargetUpdate();break;
 case 'agent-replan':openReplan();break;
 case 'apply-replan':applyReplan();break;
 case 'build-roadmap':state.draftPlan=buildProposal(state.journey,state.plan);state.phase='draft';changed('Roadmap built. Review it before saving.');$('#main').scrollIntoView();break;
 case 'back-to-journey':state.phase='journey';state.journey.step=5;changed();break;
 case 'cancel-journey':case 'cancel-draft':if(state.plan){state.phase='saved';state.draftPlan=null;state.journey=newJourney(state.plan);}else{state.phase='journey';state.journey.step=5;}changed();break;
 case 'finalize':{const checks=planIssues(active()),delay=active().revisionAssessment;modal(`${head('Save this roadmap?')}<p>Your degree, minor, targets and course plan will become your saved workspace. ${state.plan?'Your previous version is retained.':''}</p>${delay?.delayed?`<p class="warning">The revised finish is ${esc(delay.after)}, previously ${esc(delay.before)}. This adds ${delay.extraRegularTerms} regular semester(s).</p>`:''}${checks.length||delay?.delayed?`<div class="warning">${checks.length} items still need confirmation before registration. You can save your plan and follow up on them.</div><label class="checkbox-row"><input type="checkbox" id="review-ack">I reviewed the timing and items to confirm</label>`:''}<div class="modal-actions">${btn('close','Keep reviewing')}${btn('confirm-finalize','Save my roadmap',true)}</div>`);break;}
 case 'confirm-finalize':if($('#review-ack')&&!$('#review-ack').checked){notify('Acknowledge the open review items, or keep reviewing your roadmap.');break;}if(state.plan)state.history=[structuredClone(state.plan),...state.history].slice(0,3);const usageEvent=state.plan?'plan_updated':'plan_saved';state.plan=structuredClone(state.draftPlan);state.plan.finalizedAt=new Date().toISOString();state.draftPlan=null;state.phase='saved';close();changed('Your roadmap is saved. Future changes happen only when you choose them.');if(!storageFailed)trackUsage(usageEvent);break;
 case 'checks':showChecks();break;
 case 'targets':showTargets();break;
 case 'report':openReplan();break;
 case 'add-term':addTerm();break;
 case 'export':await exportPlan();break;
 case 'about':modal(`${head('Your workspace')}<p>${accounts.signedIn?'Your roadmaps save to your personal account. Open Account to switch plans, update your name or manage your data.':'Your plan stays on this device. Sign in to create a profile and bring your roadmap across devices.'}</p><div class="card-actions">${btn('ethics-policy','AI and data ethics')}${btn('my-reports','My mistake reports')}</div><details class="quiet-details"><summary>About recommendations</summary><p>GoPlan uses AUI requirements and sourced research. Individual approvals, course offerings and opportunity availability still need confirmation.</p></details>`);break;
 }}catch(e){notify(e.message||'The change could not be completed.');console.error(e);}});
document.addEventListener('submit',async e=>{const f=e.target;if(!['course-form','source-form','restore-form','report-form'].includes(f.id))return;e.preventDefault();const d=new FormData(f);try{
 if(f.id==='source-form'){await showSource(f.dataset.file,d.get('page'));return;}
 if(f.id==='report-form'){const p=active(),courseId=d.get('courseId');p.reports.push({id:Date.now().toString(36),courseId,termId:p.terms.find(t=>t.courses.includes(courseId)).id,type:d.get('type'),detail:String(d.get('detail')).slice(0,1000),status:'open',createdAt:new Date().toISOString()});persist();render();reportModal();return;}
 if(f.id==='course-form'){const p=active(),id=f.dataset.id,old=p.courses.find(c=>c.id===id),profile=normalizeProfile(p.profile);if(old.choice)profile.choices[id]=code(d.get('choice'));const replacement=old.choice?coursesFor(profile).find(c=>c.id===id):old;if(!replacement)throw Error('This choice changes the minor structure. Use Update life decisions to rebuild it.');const status=d.get('status'),grade=d.get('grade');if(status==='completed'&&(replacement.unresolved||['F','W','I'].includes(grade)))throw Error('Choose a confirmed course and a passing completion status before marking it completed.');if(old.code!==replacement.code&&['completed','in-progress'].includes(status))throw Error('The course changed. Save it as planned, then record its actual progress.');const term=p.terms.find(t=>t.courses.includes(id)),dest=d.get('destination');if(term.id==='prior'&&status!=='completed'&&dest==='prior')throw Error('Choose a future semester when a recorded course needs a retake.');if(dest!==term.id)p.terms=moveCourse(p.terms,id,dest);p.profile=profile;p.courses=p.courses.map(c=>c.id===id?replacement:c);p.tracking[id]={status,grade,note:String(d.get('note')).slice(0,1000),updatedAt:new Date().toISOString()};if(term.id==='prior'&&status!=='completed')p.profile.priorCodes=p.profile.priorCodes.filter(c=>c!==old.code);p.updatedAt=new Date().toISOString();close();changed('Course updated. Review the prerequisite checks after changing its semester or choice.');}
 }catch(e){notify(e.message||'The change could not be saved.');}});
void accounts.boot().then(()=>{render();if(loadFailed)notify('A saved workspace could not load. It has been left untouched. Sign in to open your cloud roadmap, or contact the GoPlan team for help.');else if(!accounts.signedIn)persist();});
if(document.modelContext?.registerTool)try{document.modelContext.registerTool({name:'read_degree_plan',title:'Read GoPlan roadmap',description:'Read the current guided setup or saved academic roadmap without changing it.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({phase:state.phase,journey:state.journey,plan:active(),issues:active()?planIssues(active()):[]})});}catch{}

aiStatus().then(status=>{runtime.aiStatus=status;if(state.phase==='journey'&&!runtime.busy)render();});

let replanPreview=null,replanBase='',replanBusy=false;
function openReplan(request='',selectedCode='',selectedTerm=''){
 const p=state.plan;if(!p)return;replanPreview=null;
 const terms=p.terms.filter(t=>!['prior','pending'].includes(t.id));
 modal(`${head('Resolve a course or schedule change','Tell your adviser what is unavailable. Review a replacement or a revised schedule before saving.')}<form id="replan-form" class="agent-terminal"><div class="field-grid"><label class="field">Replan from semester<select name="currentTerm">${options(terms.map(t=>[t.id,label(t)]),selectedTerm||terms.find(t=>t.courses.some(id=>p.tracking[id]?.status==='in-progress'))?.id||terms.find(t=>t.courses.some(id=>p.tracking[id]?.status!=='completed'))?.id)}</select></label><label class="field">Course unavailable this semester (optional)<select name="unavailable">${options([['','None / explain another change below'],...p.courses.filter(c=>c.code&&!['completed','in-progress'].includes(p.tracking[c.id]?.status)).map(c=>[c.code,c.code+' · '+c.title])],selectedCode)}</select></label></div><label class="field">What would you like to change?<textarea name="changeRequest" required minlength="10" maxlength="2500" placeholder="For example: replace this unavailable minor elective with an eligible alternative. If you know which courses are offered, list them here.">${esc(request)}</textarea></label><p class="small-note">Suggested replacements must fit your requirements. Current availability still needs confirmation unless you provide the offered courses.</p>${!hasAccessCode()?'<label class="field">Demo access code<input id="ai-access-code" type="password" autocomplete="off"></label>':''}<p class="small-note">The agent receives your questionnaire, academic selections, course progress status and semesters. Your name, grades and private notes stay here. It proposes changes; nothing is saved until you accept.</p><button class="button primary" type="submit">Check feasibility & propose changes</button><div id="replan-result" class="replan-result" aria-live="polite"></div></form>`);
}
function applyReplan(){
 if(!replanPreview||!replanPreview.assessment.canApply)return;
 if(JSON.stringify(state.plan)!==replanBase){notify('Your plan changed. Request a fresh proposal.');return;}
 if($('#replan-ack')&&!$('#replan-ack').checked){notify('Review the delay or remaining open items before accepting.');return;}
 state.history=[structuredClone(state.plan),...state.history].slice(0,3);state.plan=replanPreview.candidate;state.plan.finalizedAt=new Date().toISOString();state.journey=newJourney(state.plan);replanPreview=null;close();changed('Your remaining semesters are updated. Completed and current courses were preserved.');if(!storageFailed)trackUsage('plan_updated');
}
document.addEventListener('submit',async e=>{
 if(e.target.id!=='replan-form')return;e.preventDefault();if(replanBusy)return;
 const form=e.target,d=new FormData(form),output=$('#replan-result'),p=state.plan;if(!p)return;
 const entered=$('#ai-access-code');if(entered?.value)setAccessCode(entered.value);
 const currentTerm=d.get('currentTerm'),unavailable=d.get('unavailable')?[{courseCode:d.get('unavailable'),termId:currentTerm}]:[];
 replanBase=JSON.stringify(p);replanPreview=null;replanBusy=true;form.querySelector('button[type="submit"]').disabled=true;output.innerHTML='<p class="ai-working">Your agent is interpreting the change and checking the remaining semesters…</p>';
 try{
  const j=newJourney(p),result=await requestAdvice('replan',j,{plan:replanSnapshot(p),currentTerm,changeRequest:d.get('changeRequest'),unavailable});
  if(JSON.stringify(state.plan)!==replanBase)throw Error('Your progress changed. Request a fresh proposal.');
  if(result.kind==='clarify'){output.innerHTML='<p>'+esc(result.summary)+'</p>'+result.questions.map(q=>'<p>'+esc(q)+'</p>').join('');return;}
  replanPreview=proposeReplan(p,result.change,currentTerm);const a=replanPreview.assessment;
  replanPreview.candidate.decisions={...replanPreview.candidate.decisions,profile:replanPreview.candidate.profile};
  replanPreview.candidate.revisions=[...(p.revisions||[]),{at:new Date().toISOString(),request:d.get('changeRequest'),summary:result.summary,assessment:a}].slice(-10);
  output.innerHTML=`<h3>Review the proposed change</h3><p>${esc(result.summary)}</p><div class="${a.delayed||a.status==='needs-review'?'warning':'info-box'}"><strong>${a.delayed?'Graduation moves later':a.status==='needs-review'?'Open academic checks remain':'Within the current graduation target'}</strong><p>Current scheduled finish: ${esc(a.before)} → proposed finish: ${esc(a.after)}.</p>${a.delayed?'<p>'+a.extraRegularTerms+' additional regular semester(s); a summer extension may also apply.</p>':''}${a.status==='needs-review'?'<p>These dates are provisional: '+a.pending+' requirements are unscheduled and '+a.unresolved+' course choices remain open.</p>':''}<p>${a.completedPreserved} completed courses preserved. Current courses stay in place.</p></div>${a.replacements.length?'<h3>Course replacements</h3>'+a.replacements.map(r=>'<p><strong>'+esc(r.from)+' &rarr; '+esc(r.to)+'</strong> · '+esc(r.title)+'<br>'+esc(r.reason)+'</p>').join('')+'<p class="small-note">Confirm these alternatives are offered before registration.</p>':''}<ul class="replan-moves">${a.moves.map(m=>'<li><strong>'+esc(m.course)+'</strong>: '+esc(m.from)+' → '+esc(m.to)+'</li>').join('')||'<li>No semester moves are needed.</li>'}</ul><details><summary>Academic feasibility checks (${a.issues.length})</summary>${a.issues.map(i=>'<p class="small-note">'+esc(i.text)+'</p>').join('')}</details>${a.canApply?(a.delayed||a.status==='needs-review'?'<label class="checkbox-row"><input id="replan-ack" type="checkbox">I reviewed the timing and open academic items.</label>':'')+btn('apply-replan','Accept revised semesters',true):'<p class="warning">This proposal introduces unresolved conflicts. Your saved plan is unchanged. Revise the request or confirm the missing requirements with your adviser.</p>'}`;
 }catch(error){output.innerHTML='<p class="warning">'+esc(error.message)+'</p>';if(error.code==='ACCESS_REQUIRED'){const input=form.querySelector('#ai-access-code');if(input){input.value='';input.focus();}else{output.insertAdjacentHTML('beforeend','<label class="field">Demo access code<input id="ai-access-code" type="password" autocomplete="off" placeholder="Provided by the GoPlan team"><small>Enter the code supplied with this app link, then check feasibility again. Your change request is preserved.</small></label>');output.querySelector('input').focus();}}}
 finally{replanBusy=false;form.querySelector('button[type="submit"]').disabled=false;}
});

let targetPreview=null,targetBase='',targetBusy=false;
function openTargetAgent(initialRequest=''){
 if(targetBusy)return;const p=active();if(!p)return;targetPreview=null;
 modal(`${head('Refine your company and exchange targets','Your courses and recorded progress stay in place.')}<form id="target-agent-form"><label class="field">What should the agent change?<textarea name="request" minlength="10" maxlength="1800" required placeholder="Include Moroccan startups working on logistics. Keep my exchange institutions.">${esc(initialRequest)}</textarea></label>${!hasAccessCode()?'<label class="field">Demo access code<input id="ai-access-code" type="password" autocomplete="off"></label>':''}<button class="button primary" type="submit">Research and update recommendations</button><div id="target-agent-result" aria-live="polite"></div></form>`);
}
function applyTargetUpdate(){
 const p=active();if(!targetPreview||JSON.stringify(p)!==targetBase){notify('Your plan changed. Request an updated proposal.');return;}
 if(state.phase==='saved')state.history=[structuredClone(p),...state.history].slice(0,3);
 const {journey:j,result:r}=targetPreview;p.targets={...p.targets,internships:r.internships,exchanges:r.exchanges};
 p.decisions={...p.decisions,details:j.details,internships:j.internships,exchanges:j.exchanges,refinements:j.refinements,feedbackHistory:j.feedbackHistory,lastUpdates:j.lastUpdates};p.updatedAt=new Date().toISOString();
 targetPreview=null;close();changed('Targets updated. Your courses and progress are unchanged.');if(!storageFailed)trackUsage('targets_updated');
}
document.addEventListener('submit',async e=>{
 if(e.target.id!=='target-agent-form')return;e.preventDefault();if(targetBusy)return;
 const form=e.target,output=form.querySelector('#target-agent-result'),p=active();if(!p)return;
 const entered=form.querySelector('#ai-access-code');if(entered?.value)setAccessCode(entered.value);
 targetBase=JSON.stringify(p);targetPreview=null;targetBusy=true;form.querySelector('button[type="submit"]').disabled=true;
 output.innerHTML='<p class="ai-working">Researching your request and comparing it with your existing targets…</p>';
 try{
  const j=newJourney(p);j.refinements={...j.refinements,targets:String(new FormData(form).get('request')||'')};
  const result=await requestAdvice('targets',j);if(JSON.stringify(active())!==targetBase)throw Error('Your plan changed. Request a fresh proposal.');
  if(result.kind==='answer'){output.innerHTML=`<p>${esc(result.answer)}</p><p class="small-note">Your plan has not changed.</p>`;return;}
  acceptAdvice(j,'targets',result);targetPreview={journey:j,result};output.innerHTML=updateView(result.update)+researchView(result.research)+'<h3>Proposed companies</h3>'+experienceCards(result.internships)+'<h3>Proposed exchange institutions</h3>'+experienceCards(result.exchanges)+btn('apply-target-update','Save updated targets',true);
 }catch(error){output.innerHTML='<p class="warning">'+esc(error.message)+'</p>';if(error.code==='ACCESS_REQUIRED'){const input=form.querySelector('#ai-access-code');if(input)input.value='';else output.insertAdjacentHTML('beforeend','<label class="field">Demo access code<input id="ai-access-code" type="password" autocomplete="off"></label>');}}
 finally{targetBusy=false;form.querySelector('button[type="submit"]').disabled=false;}
});

let changeBusy=false;
function openChange(initialRequest=''){
 const p=state.plan;if(!p)return;
 modal(`${head('What has changed?','We’ll keep your plan and take you through the parts that need an update.')}<div class="feedback-invitation"><div><strong>Did the adviser get something wrong?</strong><p>Report a policy or recommendation mistake for evidence review.</p></div>${btn('mistake-report','Report a mistake')}</div><form id="change-plan-form"><label class="field">What would you like to change, and why?<textarea name="request" required minlength="10" maxlength="2500" placeholder="I want more Moroccan startups, I’m reconsidering my minor, or a course is no longer offered.">${esc(initialRequest)}</textarea></label><details class="quiet-details"><summary>Study progress</summary><p>Update course progress on your roadmap before changing academic choices.</p><label class="field">Plan remaining study from<select name="currentTerm">${options(p.terms.filter(t=>!['prior','pending'].includes(t.id)).map(t=>[t.id,label(t)]),p.terms.find(t=>t.courses.some(id=>p.tracking[id]?.status==='in-progress'))?.id||p.terms.find(t=>!['prior','pending'].includes(t.id)&&t.courses.some(id=>p.tracking[id]?.status!=='completed'))?.id)}</select></label></details>${!hasAccessCode()?'<label class="field">Demo access code<input id="ai-access-code" type="password" autocomplete="off"></label>':''}<button class="button primary" type="submit">Review my change</button><div id="change-plan-result" role="status"></div></form>`);
}
document.addEventListener('submit',async e=>{
 if(e.target.id!=='change-plan-form')return;e.preventDefault();if(changeBusy)return;
 const form=e.target,data=new FormData(form),request=String(data.get('request')||''),p=state.plan,output=form.querySelector('#change-plan-result');if(!p)return;
 const entered=form.querySelector('#ai-access-code');if(entered?.value)setAccessCode(entered.value);
 changeBusy=true;form.querySelector('button[type="submit"]').disabled=true;output.textContent='Finding the right place to update your plan…';
 try{
  const result=await requestAdvice('change',newJourney(p),{changeRequest:request});
  if(state.plan!==p)throw Error('Your plan changed. Please review the new plan first.');
  if(result.kind==='answer'){output.innerHTML=`<p>${esc(result.summary)}</p>${minorChecklistView(p.profile)}<p class="small-note">Your plan has not changed.</p>`;return;}
  if(result.kind==='clarify'){output.textContent=[result.summary,...result.questions].join(' ');return;}
  if(result.kind==='schedule'){openReplan(request,'',String(data.get('currentTerm')));return;}
  if(result.kind==='journey'&&result.startStep===4){openTargetAgent(request);return;}
  state.journey=editJourney(p,request,result.startStep,String(data.get('currentTerm')));state.phase='journey';state.draftPlan=null;view='plan';close();changed();
  if(result.startStep>=2){const stage={2:'direction',3:'courses',4:'targets',5:'pace'}[result.startStep];await getAdvice(stage);}
 }catch(error){output.textContent=error.message;if(error.code==='ACCESS_REQUIRED'&&!form.querySelector('#ai-access-code'))output.insertAdjacentHTML('beforeend','<label class="field">Demo access code<input id="ai-access-code" type="password" autocomplete="off"></label>');}
 finally{changeBusy=false;form.querySelector('button[type="submit"]').disabled=false;}
});

let questionBusy=false;
function showAnswer(result,profile){modal(`${head('Your adviser’s answer')}<div class="adviser-answer"><p>${esc(result.answer||result.summary)}</p>${result.minorChecklist?minorChecklistView(profile):''}<p class="small-note">Your choices and saved plan have not changed.</p></div>`);}
function openQuestion(){
 modal(`${head('Ask your adviser','Ask about your choices, requirements or study pace.')}<form id="question-form"><label class="field">Your question<textarea name="question" required minlength="5" maxlength="2500" rows="3" placeholder="Why are only four courses selected for my minor? What else is required?"></textarea></label>${!hasAccessCode()?'<label class="field">Demo access code<input id="ai-access-code" type="password" autocomplete="off"></label>':''}<button class="button primary" type="submit">Ask my adviser</button><div id="question-result" class="adviser-answer" aria-live="polite"></div></form>`);
}
document.addEventListener('submit',async e=>{
 if(e.target.id!=='question-form')return;e.preventDefault();if(questionBusy)return;
 const form=e.target,button=form.querySelector('button[type="submit"]'),output=form.querySelector('#question-result'),question=String(new FormData(form).get('question')||'');
 const j=structuredClone(state.phase==='journey'?state.journey:newJourney(active()));const entered=form.querySelector('#ai-access-code');if(entered?.value)setAccessCode(entered.value);
 questionBusy=true;button.disabled=true;output.textContent='Checking the requirements behind your plan…';
 try{const result=await requestAdvice('question',j,{question});output.innerHTML=`<p>${esc(result.answer)}</p>${result.minorChecklist?minorChecklistView(j.profile):''}<p class="small-note">Your choices and saved plan have not changed.</p>`;}
 catch(error){output.textContent=error.message;if(error.code==='ACCESS_REQUIRED'&&!form.querySelector('#ai-access-code'))output.insertAdjacentHTML('beforeend','<label class="field">Demo access code<input id="ai-access-code" type="password" autocomplete="off"></label>');}
 finally{questionBusy=false;button.disabled=false;}
});

document.addEventListener('change',e=>{if(e.target.matches('#replan-form select[name="unavailable"]')){const p=state.plan,c=p?.courses.find(c=>c.code===e.target.value),term=p?.terms.find(t=>t.courses.includes(c?.id));if(term&&!['prior','pending'].includes(term.id))e.target.form.elements.currentTerm.value=term.id;const field=e.target.form.elements.changeRequest;if(c&&!field.value.trim())field.value='Please replace '+c.code+' with an eligible alternative for the same requirement, keeping my goals and graduation target.';}});
