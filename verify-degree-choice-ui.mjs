import assert from 'node:assert/strict';
import {DATA,normalizeProfile,programFor} from './dist/planner.js';
import {degreePolicy,degreeSelectionPath} from './dist/degree-policy.js';
import {degreeChoiceFields,changeDegreeChoice,retainManualDirection} from './dist/degree-choice-view.js';
import {eligibleMinors,newJourney} from './dist/guidance.js';
import {journeyView} from './dist/journey-view.js';
import {dashboardView,dashboardReady} from './dist/dashboard-view.js';
import {createDashboardController} from './dist/dashboard-controller.js';
const render=p=>degreeChoiceFields(p,{program:programFor(p),minorOptions:eligibleMinors(p)});
for(const degree of DATA.programs){
 const policy=degreePolicy(degree);
 for(const path of policy.selectionPaths){
  const p=normalizeProfile(changeDegreeChoice(normalizeProfile({program:degree.id}),'degreePath',path.id,degree));
  assert.equal(degreeSelectionPath(p),path.id);const html=render(p);
  assert.equal(html.includes('name="track"'),path.trackCount>0,degree.id);
  assert.equal(html.includes('name="secondTrack"'),path.trackCount>1,degree.id);
  assert.equal(html.includes('name="minor"'),path.minorMode==='required'||path.minorMode==='optional',degree.id);
  assert.ok(!html.includes('More choices'));assert.ok(!html.includes('>Focus<'));
  if(path.trackCount>1){const secondary=html.match(/name="secondTrack"[^>]*>([\s\S]*?)<\/select>/)[1];assert.ok(!secondary.includes('value="'+p.track+'"'));}
 }
}
const bba=normalizeProfile({program:'BBA',track:'FIN',minor:'mathematics'}),double=changeDegreeChoice(bba,'degreePath','double',programFor(bba));
assert.equal(double.minor,'');assert.equal(double.track,'FIN');assert.notEqual(double.secondTrack,double.track);
const single=changeDegreeChoice(double,'degreePath','minor',programFor(double));assert.equal(single.secondTrack,'');assert.ok(render(single).includes('Minor (required)'));
const swapped=changeDegreeChoice(double,'track',double.secondTrack,programFor(double));assert.equal(swapped.secondTrack,double.track);
const manual=newJourney();manual.profile=bba;manual.advice=null;retainManualDirection(manual);assert.equal(dashboardReady(manual,null).direction,true);assert.equal(manual.advice.academic.track,'FIN');
for(const id of ['BSEMS','BSGE','BSRESE','BACS','BAIS','BSESS','BBA','BSCSC']){
 const p=normalizeProfile({program:id}),j=newJourney();j.profile=p;j.step=2;j.programChosen=true;j.advice={kind:'recommend',academic:{}};
 const html=journeyView({journey:j});assert.ok(!html.includes('PRIMARY FOCUS'));assert.ok(!html.includes('Major / primary focus'));
 const dashboard=dashboardView({phase:'journey',journey:j},{dashboardPanel:'direction'});
 if(['BSEMS','BSGE'].includes(id)){assert.ok(dashboard.includes('Thematic area'));assert.ok(!dashboard.includes('dashboard-kicker">Minor'));}
 if(['BACS','BAIS','BSESS','BSRESE'].includes(id))assert.ok(!dashboard.includes('A broad foundation'));
}
const oldFormData=globalThis.FormData;globalThis.FormData=class{constructor(form){this.values=form.values;}get(key){return this.values[key]??null;}};
try{
 let state={phase:'journey',journey:newJourney()},modal='';const controller=createDashboardController({runtime:{},read:()=>state,modal:x=>modal=x,head:x=>x,close(){modal='';},render(){},persist(){},changed(){},notify(){}});
 state.journey.profile=normalizeProfile({program:'BSEMS'});await controller.click({dataset:{action:'dashboard-direction-options'}});assert.ok(modal.includes('Thematic area'));assert.ok(!modal.includes('name="minor"'));assert.ok(!modal.includes('More choices'));
 const form=values=>{const error={textContent:''};return {id:'dashboard-degree-form',values,error,querySelector:()=>error};};
 for(const values of [{program:'BSEMS',track:'FINANCE',minor:'computer-science'},{program:'BBA',track:'FIN',secondTrack:'MKT',minor:'mathematics'},{program:'BBA',track:'FIN',secondTrack:'FIN'}]){
  const before=JSON.stringify(state),f=form(values);await controller.submit(f);assert.ok(f.error.textContent,'Forged invalid combination must show an error');assert.equal(JSON.stringify(state),before,'Invalid update cannot mutate workspace');
 }
 const f=form({program:'BBA',track:'FIN',secondTrack:'MKT'});await controller.submit(f);assert.equal(f.error.textContent,'');assert.equal(state.journey.profile.secondTrack,'MKT');assert.equal(state.journey.profile.minor,'');
}finally{globalThis.FormData=oldFormData;}
console.log('Degree-choice UI: every supported pathway, both editors, exact terminology, distinct second selections, pathway switching and forged manual submissions passed.');
