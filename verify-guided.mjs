import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DATA,coursesFor,generatePlan,normalizeProfile,validatePlan} from './dist/planner.js';
import {GUIDED,newJourney,emptyWorkspace,eligibleMinors,makePlan,migrateLegacy,suggestPrograms,suggestChoices,validateSavedWorkspace,planIssues} from './dist/guidance.js';
import {selectedMinor} from './dist/minors.js';
import {journeyView,planView,libraryView} from './dist/views.js';
import {createWorkbook} from './dist/export.js';
let scenarios=0;
for(const p of DATA.programs.filter(p=>p.level==='undergraduate'))for(const m of eligibleMinors({program:p.id})){
 const profile=normalizeProfile({program:p.id,minor:m.id}),j=newJourney();j.profile=profile;j.interests=['business','technology'];j.programChosen=true;j.profile=suggestChoices(j).profile;
 const cs=coursesFor(j.profile),terms=generatePlan(j.profile);
 assert.equal(new Set(cs.map(c=>c.id)).size,cs.length,`${p.id}/${m.id}: unique ids`);
 assert.deepEqual([...new Set(terms.flatMap(t=>t.courses))].sort(),cs.map(c=>c.id).sort());
 assert.ok(cs.some(c=>c.minorId===m.id));assert.ok(!cs.some(c=>c.groupId==='minor'));
 assert.ok(cs.every(c=>Number.isFinite(c.credits)&&c.source.file&&c.source.page));
 const state=emptyWorkspace();state.journey=j;for(let step=0;step<6;step++){j.step=step;assert.ok(journeyView(state).includes('journey'));}
 scenarios++;
}
assert.equal(eligibleMinors({program:'MSSE'}).length,0);
assert.ok(!eligibleMinors({program:'BSCSC'}).some(m=>['computer-science','data-analytics'].includes(m.id)));
assert.equal(selectedMinor({program:'BSCSC',minor:'business-administration'}).requirements.length,7);
const bba=coursesFor({program:'BBA',minor:'human-resources-development'});assert.ok(bba.some(c=>c.minorId&&c.code==='HRD3302'));assert.ok(!bba.some(c=>c.minorId&&c.code==='HRD2301'));
const org=coursesFor({program:'BBA',minor:'organizational-studies',priorCodes:['MGT3305']});assert.ok(!org.some(c=>c.minorId&&c.code==='PSY3304'));
const j=newJourney();j.level='open';j.interests=['technology'];assert.ok(suggestPrograms(j).some(x=>x.program.level==='graduate'));j.level='undergraduate';assert.ok(suggestPrograms(j).every(x=>x.program.level==='undergraduate'));
j.profile=normalizeProfile({program:'BSCSC',track:'SE',minor:'english'});j.programChosen=true;j.profile=suggestChoices(j).profile;j.internships=[GUIDED.internships[0].id];j.exchanges=[GUIDED.exchanges[0].id];j.auiMasters=['MSSE'];j.globalMasters=[GUIDED.globalMasters[0].id];
const plan=makePlan(j),old=JSON.stringify(plan);plan.tracking[plan.courses.find(c=>c.code==='CSC1401').id]={status:'completed',grade:'A',note:'Passed'};const frozen=JSON.stringify(plan);const next=makePlan(newJourney(plan),plan);assert.equal(JSON.stringify(plan),frozen);assert.ok(next.profile.priorCodes.includes('CSC1401'));assert.ok(next.terms.find(t=>t.id==='prior').courses.some(id=>next.courses.find(c=>c.id===id).code==='CSC1401'));
const saved={...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)};assert.equal(JSON.stringify(validateSavedWorkspace(JSON.parse(JSON.stringify(saved))).plan),frozen);assert.ok(planView(plan,false).includes('YOUR SAVED ROADMAP'));for(const v of ['sources','programs','policies'])assert.ok(libraryView(v).length>500);
const legacyProfile=normalizeProfile({program:'BSCSC',priorCodes:['CSC1401']});const migrated=migrateLegacy({version:2,dataVersion:DATA.version,profile:legacyProfile,terms:generatePlan(legacyProfile),completed:[]});assert.equal(migrated.plan.tracking.csc1401.status,'completed');const retake=structuredClone(plan);retake.tracking.csc1401={status:'retake',grade:'F'};assert.ok(planIssues(retake).some(i=>i.level==='conflict'&&i.id==='csc1401'&&i.text.includes('retake')));const badTrack=structuredClone(saved);badTrack.plan.program.tracks=[null];assert.throws(()=>validateSavedWorkspace(badTrack));
const invalid=JSON.parse(JSON.stringify(saved));invalid.plan.terms[0].courses.push(invalid.plan.terms[0].courses[0]);assert.throws(()=>validateSavedWorkspace(invalid));
const se=coursesFor({program:'MSSE'}).find(c=>c.repeatable);assert.equal(se.rule.minProgramCourses,4);assert.equal(se.rule.all.length,0);
const thesis=coursesFor({program:'MACDM',choices:{'macdm-final':'COM5391'}}).find(c=>c.id==='macdm-final');const practicum=coursesFor({program:'MACDM',choices:{'macdm-final':'COM5392'}}).find(c=>c.id==='macdm-final');assert.deepEqual(thesis.offeredTerms,['Summer']);assert.equal(practicum.offeredTerms,undefined);
// A final must never be moved into the semester containing its prerequisite.
const prog=DATA.programs.find(p=>p.id==='BSCSC'),original=structuredClone(prog);
try{prog.requirements=prog.requirements.filter(r=>['ENG2303','EGR4402'].includes(r.code));prog.tracks=[];const p=normalizeProfile({program:'BSCSC',priorCodes:['ENG1301','COM1301','FAS1220'],summers:false}),cs=coursesFor(p),ts=generatePlan(p);assert.ok(ts.findIndex(t=>t.courses.includes('egr4402'))>ts.findIndex(t=>t.courses.includes('eng2303')));}finally{Object.assign(prog,original);}
await fs.writeFile('.sites-runtime/guided-export.xlsx',await createWorkbook(plan.terms,plan.courses,plan.profile,[],planIssues(plan),await fs.readFile('dist/template-styles.xml','utf8'),plan));
console.log(`Passed ${scenarios} eligible degree/minor combinations, six-step rendering, saved snapshot retention, completed-course carryover, graduate rules, capstone sequencing and guided Excel export.`);
