import assert from 'node:assert/strict';
import {DATA,normalizeProfile,coursesFor,generatePlan,validatePlan} from './dist/planner.js';
import {degreePolicy,degreeSelectionIssues,degreeSelectionPath} from './dist/degree-policy.js';
import {eligibleMinors,newJourney,makePlan,emptyWorkspace,validateSavedWorkspace} from './dist/guidance.js';
import {refreshMinorDraft,manualDegreePlan} from './dist/dashboard-flow.js';
import {acceptAdvice} from './dist/journey-state.js';
import {validateDirection,directionContext} from './server/advisor.mjs';
import {academicEdit,requestedEdit} from './server/edit-intent.mjs';
import {proposeReplan} from './dist/replanning.js';

const requiredMinor=['BSCSC','BACS','BAIS','BSESS'];
for(const program of DATA.programs){
 const policy=degreePolicy(program);assert.ok(policy.sources.length,program.id+' has evidence');
 assert.equal(policy.maxTracks>0,program.tracks.length>0,program.id+' selector matches source structure');
 assert.ok(policy.selectionPaths.length,program.id+' explicit selection pathway');
 for(const path of policy.selectionPaths)assert.ok(path.id&&path.label&&Number.isInteger(path.trackCount)&&path.minorMode);
 if(program.level==='graduate')assert.equal(eligibleMinors({program:program.id}).length,0);
}
for(const program of ['BSEMS','BSGE','BSRESE']){
 const valid=normalizeProfile({program}),old={...valid,minor:'computer-science'},normalized=normalizeProfile(old);
 assert.equal(normalized.minor,'');assert.ok(normalized.selectionNotices.length);
 assert.deepEqual(coursesFor(old).map(c=>[c.id,c.credits]),coursesFor(valid).map(c=>[c.id,c.credits]),'An unsupported minor cannot append degree credits');
 assert.equal(eligibleMinors(old).length,0);assert.ok(degreeSelectionIssues(old).length);
 assert.equal(coursesFor(valid).filter(c=>c.groupId==='minor'||c.minorId).length,0);
 assert.throws(()=>manualDegreePlan(makePlan({...newJourney(),profile:valid}),old),/minor/);
}
for(const program of requiredMinor){
 const profile=normalizeProfile({program});assert.deepEqual(degreeSelectionIssues(profile),[],'Open required minor is a draft, not a waiver');
 assert.ok(degreeSelectionIssues(profile,{requireComplete:true}).some(s=>/required minor/.test(s)));
 assert.ok(validatePlan(generatePlan(profile),coursesFor(profile),profile).some(i=>i.id==='degree-selection'&&i.level==='review'));
 assert.ok(coursesFor(profile).some(c=>c.groupId==='minor'));
}
assert.equal(degreePolicy('BBA').trackLabel,'Concentration');assert.equal(degreePolicy('BSEMS').trackLabel,'Thematic area');assert.equal(degreePolicy('BSGE').trackLabel,'Thematic area');assert.equal(degreePolicy('BSCSC').trackLabel,'Specialization');
const bba={program:'BBA',track:'FIN',secondTrack:'MKT',minor:'mathematics'};
assert.ok(degreeSelectionIssues(bba).some(s=>/either two concentrations/.test(s)));assert.equal(normalizeProfile(bba).minor,'');
assert.deepEqual(coursesFor(bba).map(c=>c.id),coursesFor({...bba,minor:''}).map(c=>c.id));
assert.equal(degreeSelectionPath(bba),'double');assert.equal(degreeSelectionPath({...bba,secondTrack:''}),'minor');
assert.ok(degreeSelectionIssues({...bba,secondTrack:'FIN',minor:''}).some(s=>/different/.test(s)));
assert.equal(normalizeProfile({...bba,secondTrack:'FIN',minor:''}).secondTrack,'');
assert.ok(eligibleMinors({program:'BBA'}).some(m=>m.id==='leadership'),'The specific November sheet allows Leadership');
assert.ok(!eligibleMinors({program:'BBA'}).some(m=>m.id==='business-administration'));
assert.ok(!eligibleMinors({program:'BSCSC'}).some(m=>['computer-science','data-analytics'].includes(m.id)),'CS minor is outside computing');
assert.ok(!eligibleMinors({program:'BSESS'}).some(m=>m.id==='environmental-sustainability'),'A same-major minor is not independently satisfied');
const cs=normalizeProfile({program:'BSCSC',track:'SE',secondTrack:'AI',minor:'business-administration'}),csRows=coursesFor(cs);
assert.equal(cs.minor,'business-administration');assert.equal(csRows.filter(c=>c.minorId===cs.minor).length,5);assert.ok(csRows.some(c=>c.focusRole==='secondary'));

const advice=academic=>({kind:'recommend',summary:'A source-defined selection.',themes:[],questions:[],tradeoffs:[],academic:{...academic,rationale:'Chosen.',focusRationale:'Chosen.',secondFocusRationale:'Chosen.',minorRationale:'Chosen.'}});
for(const track of ['FINANCE','DSS']){
 const j=newJourney();j.programChosen=true;j.profile=normalizeProfile({program:'BSEMS',track:'FINANCE',minor:'computer-science'});assert.ok(j.profile.selectionNotices.length);
 acceptAdvice(j,'direction',advice({program:'BSEMS',track,secondTrack:'',minor:''}));
 assert.equal(j.profile.track,track);assert.deepEqual(j.profile.selectionNotices,[],'Validated changed or unchanged academic direction clears historical normalization notices');
}
for(const invalid of [bba,{program:'BSEMS',track:'FINANCE',secondTrack:'',minor:'computer-science'},{program:'BSGE',track:'ME',secondTrack:'CS',minor:''}]){
 assert.throws(()=>validateDirection(advice(invalid),{level:'undergraduate'}));
 const j=newJourney(),before=structuredClone(j);assert.throws(()=>acceptAdvice(j,'direction',advice(invalid)));assert.deepEqual(j,before,'Rejected old receipts cannot mutate advice or feedback');
}
for(const program of ['BBA','BSCSC','BSEMS','BSGE']){
 const missingPrimary={program,track:'',secondTrack:program==='BBA'?'MKT':'',minor:''};
 assert.ok(degreeSelectionIssues(missingPrimary).some(s=>/^Choose a /.test(s)));
 assert.throws(()=>validateDirection(advice(missingPrimary),{level:'undergraduate'}));
 const j=newJourney(),before=structuredClone(j);assert.throws(()=>acceptAdvice(j,'direction',advice(missingPrimary)));assert.deepEqual(j,before);
 const existing=makePlan({...newJourney(),profile:normalizeProfile({program})});assert.throws(()=>manualDegreePlan(existing,missingPrimary),'Manual commit must not silently pick a primary area');
}
const context=directionContext({level:'undergraduate'});
assert.equal(context.programs.find(p=>p.id==='BSEMS').minors.length,0);assert.equal(context.programs.find(p=>p.id==='BBA').selectionPolicy.minorMode,'alternative');
assert.equal(context.programs.find(p=>p.id==='BSCSC').selectionPolicy.trackLabel,'Specialization');
const ems=normalizeProfile({program:'BSEMS',track:'DSS'});
assert.ok(requestedEdit('Change my thematic area to Finance').sections.includes('direction'));
assert.equal(academicEdit('Change my thematic area to Finance',ems).patch.track,'FINANCE');
const basePlan=makePlan({...newJourney(),profile:ems});
assert.throws(()=>proposeReplan(basePlan,{minor:'computer-science'},'Fall-2026'),/minor/);

// Legacy unsupported credentials remain visible for review without silently
// deleting any course, semester, note or progress record during workspace load.
const historical=structuredClone(basePlan);historical.profile.minor='computer-science';historical.terms[0].note='Keep this note';historical.tracking[historical.courses[0].id]={status:'completed',grade:'A',note:'Keep my work'};
const before={profile:structuredClone(historical.profile),courses:structuredClone(historical.courses),terms:structuredClone(historical.terms),tracking:structuredClone(historical.tracking)};
const state=validateSavedWorkspace({...emptyWorkspace(),phase:'saved',plan:historical,journey:newJourney(historical)});
refreshMinorDraft(state);
assert.deepEqual(state.plan.profile,before.profile);assert.deepEqual(state.plan.courses,before.courses);assert.deepEqual(state.plan.terms,before.terms);assert.deepEqual(state.plan.tracking,before.tracking);assert.ok(state.plan.degreeSelectionWarnings.length);assert.equal(state.phase,'saved');
console.log('Degree selection: source-defined pathways/terminology for all programs; EMS/GE no appended minor; BBA alternatives and duplicate rejection; CS retained minor and optional second specialization; raw AI/replan/receipt validation; thematic-area editing; explicit required-minor drafts; and non-destructive historical review passed.');
