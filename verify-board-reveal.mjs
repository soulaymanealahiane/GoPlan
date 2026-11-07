import assert from 'node:assert/strict';
import {newJourney,makePlan,emptyWorkspace} from './dist/guidance.js';
import {normalizeProfile} from './dist/planner.js';
import {createDashboardController} from './dist/dashboard-controller.js';
const j=newJourney();j.profile=normalizeProfile({program:'BSCSC',track:'SE'});const plan=makePlan(j);plan.finalizedAt=new Date().toISOString();
const course=plan.courses.find(c=>c.code==='EGR4402'),original=plan.terms.find(t=>t.courses.includes(course.id));
original.courses=original.courses.filter(id=>id!==course.id);plan.terms.push({id:'pending',season:'Needs placement',courses:[course.id]});
let state={...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)},runtime={dashboardPanel:'semesters',semesterFilter:'remaining',boardOpen:{pending:false},service:{saved:true,globalRemaining:0}},focus=[],scroll=[],reduced=false;
const originalDocument=globalThis.document;
// Model the post-render document. Assertions observe the destination and focus
// reached by real controller actions, including a tall wrapped toolbar.
function section(term){const row={style:{},scrollIntoView:o=>scroll.push({id:term.id,course:true,...o})},control={getAttribute:()=>course.id,focus:o=>focus.push({id:term.id,course:true,...o}),closest:()=>row};return{style:{},getAttribute:()=>term.id,querySelector:()=>({focus:o=>focus.push({id:term.id,...o})}),querySelectorAll:()=>term.courses.includes(course.id)?[control]:[],scrollIntoView(o){scroll.push({id:term.id,margin:this.style.scrollMarginTop,...o});}};}
globalThis.document={defaultView:{matchMedia:()=>({matches:reduced})},querySelector:()=>({getBoundingClientRect:()=>({height:120})}),querySelectorAll:()=>state.plan.terms.map(section)};
const controller=createDashboardController({runtime,read:()=>state,render(){},changed(){},persist(){},close(){},notify(){},getAdvice(){assert.fail('Navigation must not call AI.');}}),flush=()=>new Promise(resolve=>setImmediate(resolve));
try{
 await controller.click({dataset:{action:'dashboard-current-terms'}});await flush();
 assert.equal(runtime.boardOpen.pending,true);assert.equal(runtime.semesterFilter,'all');assert.equal(scroll.at(-1).id,'pending');assert.equal(scroll.at(-1).block,'start');assert.equal(scroll.at(-1).margin,'136px');assert.equal(focus.at(-1).id,'pending');assert.equal(focus.at(-1).preventScroll,true);
 reduced=true;await controller.click({dataset:{action:'dashboard-collapse-terms'}});await controller.click({dataset:{action:'dashboard-current-terms'}});await flush();assert.equal(scroll.at(-1).behavior,'instant');assert.equal(runtime.boardOpen.pending,true);
 runtime.dashboardPanel='courses';runtime.semesterFilter='unplaced';await controller.click({dataset:{action:'dashboard-course-semester',term:original.id}});await flush();assert.equal(runtime.dashboardPanel,'semesters');assert.equal(runtime.semesterFilter,'all');assert.equal(runtime.boardOpen[original.id],true);assert.equal(scroll.at(-1).id,original.id);
 runtime.semesterFilter='unplaced';controller.moveBoardCourse(course.id,original.id);await flush();assert.equal(runtime.semesterFilter,'all');assert.equal(scroll.at(-1).id,original.id);assert.equal(scroll.at(-1).course,true);assert.equal(focus.at(-1).course,true);
 state.plan.terms=state.plan.terms.filter(t=>t.id!=='pending');state.plan.tracking[course.id]={status:'in-progress'};await controller.click({dataset:{action:'dashboard-current-terms'}});await flush();assert.equal(scroll.at(-1).id,original.id,'Without Needs placement, reveal the current semester');
 assert.equal(runtime.service.globalRemaining,0);
}finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
console.log('Board navigation reveals and focuses Needs placement after expanding it, respects wrapped toolbar/reduced motion, follows semester links and moves across filters, and falls back to current study at zero AI allowance.');
