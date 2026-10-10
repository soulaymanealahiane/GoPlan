import {DATA,code} from './planner.js';
import {recordedStudy,normalizeStudentContext} from './student-context.js';
import {esc,options,btn} from './views.js';

export function entryContext(state,route,mode='new'){
 const now=new Date(),year=now.getFullYear(),season=now.getMonth()<5?'Spring':now.getMonth()<8?'Summer':'Fall',plan=state.phase==='draft'?state.draftPlan:state.plan;
 const existing=mode==='rethink'?state.journey?.studentContext||plan?.studentContext:null;
 const records=mode==='rethink'?recordedStudy(plan):[];
 for(const record of existing?.records||[])if(!records.some(r=>r.courseCode===record.courseCode))records.push({...record});
 const current=records.find(r=>r.status==='in-progress')?.termId||existing?.currentTerm||`${season}-${year}`;
 return {route:records.length?'continuing':route,degreeIntent:'explore',currentDegree:mode==='rethink'?plan?.profile?.program||existing?.currentDegree||'':'',currentTerm:current,studyStartYear:mode==='rethink'?existing?.studyStartYear||plan?.profile?.startYear||year:year,records};
}

export function routePicker(head){return head('Start your university plan','One journey, whether you are starting or reconsidering your studies.')+`<div class="entry-route-list"><button class="entry-route-option" data-action="entry-admitted"><strong>Build my plan</strong><span>Explore your goals, then add any completed study at the final review.</span></button></div><p class="small-note">Your existing plans stay in My plans.</p>`; }

export function studentEntryView(context,mode,head){
 const continuing=context.route==='continuing',rethink=mode==='rethink',completed=context.records.filter(r=>r.status==='completed'),current=context.records.filter(r=>r.status==='in-progress');
 const years=Array.from({length:41},(_,i)=>2000+i),terms=years.flatMap(year=>['Spring','Summer','Fall'].map(season=>[`${season}-${year}`,`${season} ${year}`]));
 return head(rethink?'A fresh direction':continuing?'Plan what comes next':'Start your university plan',rethink?'Revisit your interests and build a separate roadmap.':continuing?'Your progress is the starting point.':'Choose a degree, or explore before committing.')+`<form id="student-entry-form"><div class="field-grid"><label class="field">${continuing?'Your current degree':'Degree in mind'}<select name="currentDegree">${options([['','I’m still deciding'],...DATA.programs.map(p=>[p.id,p.name])],context.currentDegree)}</select></label><label class="field">${continuing?'Year you started university':'Year you start university'}<input name="studyStartYear" type="number" min="2000" max="2040" value="${context.studyStartYear}" required></label><label class="field">${continuing?'Current semester':'First semester'}<select name="currentTerm">${options(terms,context.currentTerm)}</select></label></div><label class="checkbox-row entry-explore"><input name="explore" type="checkbox" ${context.degreeIntent==='explore'?'checked':''}><span>I’m open to exploring another degree<small>Leave this off to keep the degree selected above.</small></span></label>${continuing?`${context.records.length?`<div class="entry-progress"><strong>Your recorded study comes with you</strong><p>${completed.length} completed · ${current.length} currently registered${context.records.some(r=>r.status==='retake')?' · retakes kept for replanning':''}</p><details class="quiet-details"><summary>View recorded courses</summary>${context.records.map(r=>`<p class="small-note">${esc(r.courseCode)} · ${esc({'completed':'Completed','in-progress':'Registered now',retake:'Needs a retake'}[r.status])} · ${esc(r.termId==='prior'?'Prior study':r.termId.replace('-',' '))}</p>`).join('')}</details><p class="small-note">Update an incorrect record in its original roadmap before starting again.</p></div>`:''}<div class="field-grid"><label class="field">${context.records.length?'Additional completed course codes':'Completed course codes'}<textarea name="completed" rows="2" maxlength="3000" placeholder="For example: CSC1401, ENG1301"></textarea><small>Courses passed and recognized by AUI. Leave empty if none.</small></label><label class="field">${context.records.length?'Additional current course codes':'Courses you’re taking this semester'}<textarea name="current" rows="2" maxlength="3000" placeholder="For example: CSC2302"></textarea><small>Current registrations stay in this semester.</small></label></div><p class="small-note">Your plan uses exact course matches. Credit that needs an adviser’s review will stay clearly marked.</p>`:''}<p class="small-note">${rethink?'Previous answers and recommendations start fresh. Your original plan and recorded progress stay available in My plans.':'You can restart the questionnaire at any time. Each fresh plan is saved separately.'}</p><p id="student-entry-error" class="field-error" role="alert" hidden></p><div class="modal-actions">${btn('close','Cancel')}<button class="button primary" type="submit">${rethink?'Rethink my whole plan':'Continue to my interests'} →</button></div></form>`;
}

export function readStudentEntry(form,context){
 const data=new FormData(form),currentDegree=String(data.get('currentDegree')||''),currentTerm=String(data.get('currentTerm')||''),records=context.records.map(r=>({...r}));
 const seen=new Set(records.map(r=>r.courseCode));
 for(const [key,status,termId] of [['completed','completed','prior'],['current','in-progress',currentTerm]]){
  for(const courseCode of String(data.get(key)||'').split(/[,;\s]+/).map(code).filter(Boolean)){
   if(!DATA.courses[courseCode])throw Error(`Course ${courseCode} is not in the AUI course library. Check the code before continuing.`);
   if(seen.has(courseCode)){if(records.find(r=>r.courseCode===courseCode).status!==status)throw Error(`${courseCode} has two different study statuses. Keep its recorded status or update the original roadmap first.`);continue;}
   seen.add(courseCode);records.push({courseCode,status,termId,grade:'',note:''});
  }
 }
 if(records.some(r=>r.status==='in-progress'&&r.termId!==currentTerm))throw Error('Keep the semester of your current registrations. Update their progress in the original plan before moving to another semester.');
 return normalizeStudentContext({...context,currentDegree,currentTerm,studyStartYear:Number(data.get('studyStartYear')),degreeIntent:!currentDegree||data.get('explore')==='on'?'explore':'keep',records});
}
