import {validateSavedWorkspace,emptyWorkspace} from './guidance.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signIn='/signin.html';
const $=id=>document.getElementById(id);
export function createAccountWorkspace(hooks){
 let phase=globalThis.GoPlanAndroid?'guest':'loading',identity=null,profile=null,id=null,revision=0,pending=null,inflight=null,timer,status='',fault='',cloudList=[],deviceState=null,disposed=false,navigation=0,preparing=false;
 const prefix=()=>`goplan-cloud:${identity.id}:`,cacheKey=()=>prefix()+id,pointer=()=>`goplan-cloud-current:${identity.id}`;
 const readCache=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
 const cache=()=>{if(!identity||!id)return;try{localStorage.setItem(cacheKey(),JSON.stringify({id,revision,state:pending||hooks.read(),pending:!!pending}));localStorage.setItem(pointer(),id);}catch{fault='Local recovery is unavailable. Keep this page open until cloud saving finishes.';}};
 async function api(path='',{method='GET',body}={}){const r=await fetch('/api/account'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(identity&&(path||method!=='GET')?{'X-GoPlan-Account':identity.id}:{})},body:body?JSON.stringify(body):undefined,credentials:'same-origin',signal:AbortSignal.timeout(25000)});let data;try{data=await r.json();}catch{throw Error('Your account could not connect. Your device copy is unchanged.');}if(!r.ok){const e=Error(data.error||'Account request failed.');e.code=data.code;e.status=r.status;throw e;}return data;}
 const refresh=()=>{hooks.render();updateStatus();};
 function updateStatus(){if(globalThis.GoPlanAndroid){if($('account-button'))$('account-button').hidden=true;return;}const target=$('save-status');if(!target)return;if(phase==='guest')return;target.textContent=phase==='ready'?(fault||status||'Saved to your account'):phase==='conflict'?'Two versions need your review':phase==='loading'?'Opening your account…':phase==='error'?'Account unavailable':'Set up your personal workspace';const button=$('account-button');if(button)button.textContent=profile?profile.firstName+' · Account':'Sign in';const bar=$('account-sync-notice');if(bar){bar.hidden=!fault&&phase!=='conflict';bar.textContent=fault||'Your plan changed on another device. Open Account to resolve it.';}}
 function gate(){
  if(phase==='choose'&&!cloudList.length&&!deviceHasWork())return '';
  if(phase==='guest')return '<section class="account-welcome"><h1>Your plan starts here.</h1><p>Create your GoPlan account to begin.</p><a class="button primary" href="/signin.html?mode=signup">Create an account</a><a class="text-button" href="/signin.html">Sign in</a></section>';
  if(phase==='loading')return '<section class="account-welcome"><p role="status">Opening your personal workspace…</p></section>';
  if(phase==='error')return `<section class="account-welcome"><h1>We couldn’t open your account.</h1><p>${esc(fault)}</p><button class="button primary" data-account="retry-boot">Try again</button><p>Your existing device and cloud copies have not been replaced.</p></section>`;
  if(phase==='profile')return `<section class="account-welcome"><span class="eyebrow">MAKE GOPLAN YOURS</span><h1>Let’s start with you.</h1><p>Your plan, saved for you.</p><form id="account-profile-form"><div class="account-fields"><label class="field">First name<input name="firstName" autocomplete="given-name" maxlength="80" required></label><label class="field">Last name<input name="lastName" autocomplete="family-name" maxlength="80" required></label></div><p class="small-note">Signed in as ${esc(identity.email)}.</p><label class="checkbox-row"><input name="consent" type="checkbox" required>Save my profile and roadmap in my GoPlan account.</label><p class="small-note">Your plan syncs across devices. Your name stays out of AI requests. <a href="/privacy.html" target="_blank" rel="noopener">Read about your data</a>.</p><p id="account-form-error" role="alert"></p><button class="button primary">Create my profile</button></form><a class="account-switch" href="/signin.html">Use a different account</a></section>`;
  if(phase==='choose')return `<section class="account-welcome"><h1>Hello, ${esc(profile.firstName)}.</h1><p>Start your plan.</p><div class="card-actions">${deviceHasWork()?'<button class="button secondary" data-account="import-device">Continue the plan on this device</button>':''}<button class="button primary" data-account="blank">Build my roadmap</button></div></section>`;
  return '';
 }
 function deviceHasWork(){return !!(deviceState?.plan||deviceState?.draftPlan||deviceState?.journey?.background||Object.values(deviceState?.journey?.questionnaire||{}).some(Boolean));}
 async function boot(){if(globalThis.GoPlanAndroid){phase='guest';refresh();return;}phase='loading';fault='';refresh();try{const data=await api();if(!data.authenticated){phase='guest';identity=null;profile=null;refresh();return;}identity=data.identity;profile=data.profile;deviceState??=structuredClone(hooks.read());hooks.open(emptyWorkspace(),'account-pending');if(!profile){phase='profile';refresh();return;}await chooseInitial();}catch(e){phase='error';fault=e.message;refresh();}}
 async function chooseInitial(){cloudList=(await api('/workspaces')).workspaces;let cachedId;try{cachedId=localStorage.getItem(pointer());}catch{}const cached=cachedId?readCache(prefix()+cachedId):null;
  if(cached?.pending&&cached.id===cachedId&&(!cloudList.length||cloudList.some(p=>p.id===cachedId))){id=cachedId;revision=cached.revision;pending=validateSavedWorkspace(cached.state);hooks.open(structuredClone(pending),cacheKey());phase='ready';fault='Unsynced changes recovered from this device.';refresh();await flush();return;}
  if(profile.activeWorkspaceId&&cloudList.some(p=>p.id===profile.activeWorkspaceId)){await open(profile.activeWorkspaceId,false);return;}
  if(cloudList.length){const latest=[...cloudList].sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)))[0];await open(latest.id,false);return;}
  phase='choose';refresh();
 }
 async function open(nextId,saveCurrent=true){if(hooks.busy()){hooks.notify('Wait for your adviser to finish before switching plans.');return;}const request=++navigation;if(saveCurrent&&!await flush())return;const next=await api('/workspaces/'+encodeURIComponent(nextId));if(request!==navigation)return;const nextState=validateSavedWorkspace(next.state);await api('/active',{method:'POST',body:{id:nextId}});if(request!==navigation)return;id=nextId;revision=next.revision;pending=null;fault='';status='Saved to your account';phase='ready';hooks.open(nextState,cacheKey());cache();refresh();}
 function schedule(state){if(!['ready','conflict'].includes(phase)||!id)return;pending=structuredClone(state);if(phase==='conflict'){cache();updateStatus();return;}status='Saving to your account…';cache();updateStatus();clearTimeout(timer);timer=setTimeout(()=>void flush(),1000);}
 async function flush(){clearTimeout(timer);if(inflight){await inflight;return phase==='ready'&&!fault&&!pending;}if(!pending)return phase!=='conflict'&&phase!=='error';if(phase!=='ready')return false;
  inflight=(async()=>{while(pending&&phase==='ready'){const saving=pending,workspaceId=id,expected=revision;try{const result=await api('/workspaces/'+workspaceId,{method:'PUT',body:{revision:expected,state:saving}});revision=result.revision;if(pending===saving)pending=null;fault='';status=pending?'Saving to your account…':'Saved to your account';cache();updateStatus();}catch(e){fault=e.message;if(e.code==='SYNC_CONFLICT')phase='conflict';status='Changes kept on this device';cache();updateStatus();break;}}})();await inflight;inflight=null;return phase==='ready'&&!fault&&!pending;
 }
 function pristine(state){const j=state?.journey;return state?.phase==='journey'&&!state.plan&&!state.draftPlan&&!state.history?.length&&j&&!j.studentContext&&!j.programChosen&&!j.step&&!j.background?.trim()&&!j.advice&&!j.details&&!j.setup&&!j.paceAdvice&&!j.goal?.trim()&&!j.answers?.trim()&&!Object.keys(j.profile?.choices||{}).length&&!j.interests?.length&&!Object.values(j.questionnaire||{}).some(v=>String(v||'').trim());}
 async function newPlan(state=emptyWorkspace()){
  if(hooks.busy()){hooks.notify('Wait for your adviser to finish first.');return false;}
  if(phase==='guest'){location.assign(signIn);return false;}
  const seed=validateSavedWorkspace(structuredClone(state));
  if(id){
   if(phase!=='ready'||!pristine(hooks.read())){hooks.notify('Continue your existing roadmap.');return false;}
   if(!await flush()){hooks.notify('Your changes are still on this device. Retry saving before continuing.');return false;}
   const workspaceId=id,before=JSON.stringify(hooks.read()),response=await fetch('/api/service',{credentials:'same-origin',signal:AbortSignal.timeout(25000)}),data=await response.json(),allowance=data.allowance;
   if(!response.ok)throw Error(data.error||'Could not open your workspace. Please try again.');
   if(!allowance||allowance.saved||allowance.step!==0||allowance.initialMask!==0||allowance.globalRemaining!==5||!allowance.stageChanges?.every(n=>n===2)||allowance.stageChanges.length!==5||allowance.workspaceId!==id){hooks.notify('Continue your existing roadmap.');return false;}
   if(workspaceId!==id||before!==JSON.stringify(hooks.read()))return false;
   // An owner reset already created the one permitted workspace. Begin inside
   // that empty workspace; never create another plan or reset service counters.
   hooks.open(seed,cacheKey(),true);fault='';schedule(hooks.read());refresh();return true;
  }
  const request=++navigation;if(phase!=='choose'&&!await flush()){hooks.notify('Your changes are still on this device. Retry saving before switching plans.');return false;}
  if(request!==navigation)return false;id=crypto.randomUUID();revision=0;pending=null;phase='ready';fault='';hooks.open(seed,cacheKey(),true);schedule(hooks.read());refresh();return true;
 }
 async function prepareNew(state=emptyWorkspace()){if(globalThis.GoPlanAndroid||phase==='guest')return globalThis.GoPlanAndroid?true:(location.assign(signIn),false);if(preparing)return false;preparing=true;try{return await newPlan(state);}catch(e){hooks.notify(e.message||'Could not open your workspace. Please try again.');return false;}finally{preparing=false;}}
 function showPlans(){hooks.startNew?.();}

 function accountModal(){if(phase==='guest'){hooks.modal(hooks.head('Your plan, wherever you are')+'<p>Sign in with your email to save your roadmap and pick up where you left off.</p><a class="button primary" target="_top" href="'+signIn+'">Continue with email</a>');return;}if(!profile){void boot();return;}const conflicts=phase==='conflict'?`<div class="warning"><h3>Two versions of your plan</h3><p>Your edits are still on this device. Load the saved version, or keep this page open while you resolve your edits.</p><div class="card-actions"><button class="button secondary" data-account="load-cloud">Load the cloud version</button></div></div>`:'';
  hooks.modal(hooks.head('Your GoPlan account')+`<p>Signed in as ${esc(profile.email)}.</p>${conflicts}${fault&&phase!=='conflict'?`<p class="warning">${esc(fault)}</p><button class="button secondary" data-account="retry-sync">Retry saving</button>`:''}<form id="account-edit-form"><div class="account-fields"><label class="field">First name<input name="firstName" autocomplete="given-name" maxlength="80" value="${esc(profile.firstName)}" required></label><label class="field">Last name<input name="lastName" autocomplete="family-name" maxlength="80" value="${esc(profile.lastName)}" required></label></div><p id="account-form-error" role="alert"></p><button class="button secondary">Save profile</button></form><div class="card-actions"><button class="button secondary" data-account="signout">Sign out</button></div><details class="quiet-details"><summary>Privacy & account data</summary><p><a href="/api/account/export" download>Download my personal data</a> · <a href="/privacy.html">Privacy notice</a></p><h3>Delete my GoPlan data</h3><p>This permanently deletes your cloud profile and roadmaps and clears this account’s copies from this browser. A hashed record of your used service allowance remains to prevent a reset. AI response receipts are deleted. Downloaded files, device-only plans and submitted feedback reports remain. Earlier reports follow the retention terms in the privacy notice.</p><form id="account-delete-form"><label class="field">Type DELETE MY GOPLAN DATA<input name="confirmation" autocomplete="off" required></label><p id="delete-account-error" role="alert"></p><button class="button secondary">Permanently delete my GoPlan data</button></form></details>`);

 }
 function clearAccountCache(){try{const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix()))keys.push(k);}keys.forEach(k=>localStorage.removeItem(k));localStorage.removeItem(pointer());}catch{}}
 document.addEventListener('click',async event=>{const b=event.target.closest('[data-account],[data-account-open]');if(!b)return;event.preventDefault();if(hooks.busy()){hooks.notify('Wait for your adviser to finish first.');return;}b.disabled=true;try{
  if(b.dataset.accountOpen){await open(b.dataset.accountOpen);hooks.close();return;}
  switch(b.dataset.account){
   case 'open':accountModal();break;case 'retry-boot':await boot();break;
   case 'blank':if(hooks.startNew)hooks.startNew();else await newPlan();break;case 'import-device':await newPlan(deviceState);break;
   case 'retry-sync':await flush();accountModal();break;
   case 'load-cloud':{if(!confirm('Replace these unsynced edits with the version saved online?'))break;await open(id,false);hooks.close();break;}
   case 'signout':if(!await flush()){hooks.notify('Your changes are still on this device. Retry saving before signing out.');break;}{const result=await fetch('/api/auth/signout',{method:'POST',credentials:'same-origin'});if(!result.ok)throw Error('Could not sign out. Please retry.');}clearAccountCache();disposed=true;location.assign('/');break;
  }
 }catch(e){hooks.notify(e.message);}finally{b.disabled=false;}});
 document.addEventListener('submit',async event=>{const f=event.target;if(!['account-profile-form','account-edit-form','account-delete-form'].includes(f.id))return;event.preventDefault();const b=f.querySelector('button');b.disabled=true;const data=new FormData(f),target=$(f.id==='account-delete-form'?'delete-account-error':'account-form-error');target.textContent='';try{
  if(f.id==='account-delete-form'){if(!await flush())throw Error('Wait for your changes to finish saving, then try again.');await api('',{method:'DELETE',body:{confirm:data.get('confirmation')}});clearAccountCache();disposed=true;pending=null;await fetch('/api/auth/signout',{method:'POST',credentials:'same-origin'});location.assign('/');return;}
  profile=(await api('/profile',{method:'POST',body:{firstName:data.get('firstName'),lastName:data.get('lastName'),consentCloud:data.get('consent')==='on'}})).profile;
  if(f.id==='account-profile-form')await chooseInitial();else{hooks.close();refresh();hooks.notify('Your profile is updated.');}
 }catch(e){target.textContent=e.message;}finally{b.disabled=false;}});
 window.addEventListener('online',()=>{if(pending&&phase==='ready')void flush();});
 window.addEventListener('beforeunload',e=>{if(!disposed&&(pending||inflight)){e.preventDefault();e.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&pending&&phase==='ready')void flush();});
 return {boot,gate,prepareNew,showPlans,schedule,flush,updateStatus,get profile(){return profile;},get signedIn(){return !!identity;},get ready(){return phase==='ready';},get phase(){return phase;}};
}
