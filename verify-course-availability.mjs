import assert from 'node:assert/strict';
import {normalizeProfile,coursesFor,generatePlan,validatePlan,termOrder,DATA} from './dist/planner.js';
import {proposeReplan,replanSnapshot,restoreSnapshot,graduationTerm} from './dist/replanning.js';
import {normalizeScheduling,mergeScheduling,courseAvailability,analyzeCourseAvailability} from './dist/course-availability.js';

const profile=normalizeProfile({program:'BSCSC',track:'SE',priorCodes:['FRN3210'],choices:{'bscsc-free-1':'ACC2301','bscsc-free-2':'MTH2304','bscsc-history':'HIS1301','bscsc-humanities':'LIT2301','bscsc-arts':'ART1301','bscsc-social':'PSY1301','bscsc-basic-science':'BIO1401','bscsc-arabic':'ARA1201','bscsc-french':'FRN3210','bscsc-civic':'CIP2100'}});
const make=()=>({profile:structuredClone(profile),courses:coursesFor(profile),terms:generatePlan(profile),tracking:{},scheduling:{unavailable:[],offerings:[]}});
const termOf=(plan,id)=>plan.terms.find(t=>t.courses.includes(id));
const offered=(termId,offeredCourseCodes=[],unavailableCourseCodes=[],complete=false)=>({termId,offeredCourseCodes,unavailableCourseCodes,complete});
const base=make(),first=termOf(base,'csc1401').id,original=JSON.stringify(base);
const cancellation={offerings:[offered(first,['PSY1301'],['CSC1401'])]};
const analysis=analyzeCourseAvailability(base,first,mergeScheduling(base.scheduling,cancellation));
assert.equal(analysis.affected.find(c=>c.courseCode==='CSC1401').kind,'required');
assert.equal(analysis.affected.find(c=>c.courseCode==='CSC1401').alternatives.length,0,'A compulsory course must not get invented substitutes');
assert.ok(analysis.affected.find(c=>c.courseCode==='CSC1401').dependants.some(c=>c.courseCode==='CSC2302'));
assert.ok(analysis.fillers.some(c=>c.courseCode==='PSY1301'&&c.availability==='reported-offered'));
const postponed=proposeReplan(base,cancellation,first);
assert.equal(JSON.stringify(base),original,'Proposal must preserve the saved plan until acceptance');
assert.equal(postponed.assessment.canApply,true);
assert.ok(termOrder(termOf(postponed.candidate,'csc1401'))>termOrder(termOf(base,'csc1401')));
assert.ok(termOrder(termOf(postponed.candidate,'csc2302'))>termOrder(termOf(postponed.candidate,'csc1401')),'Dependent study must wait for the compulsory prerequisite');
assert.ok(termOrder(termOf(postponed.candidate,'csc2302'))>termOrder(termOf(base,'csc2302')));
assert.equal(termOf(postponed.candidate,'bscsc-social').id,first,'A reported-offered eligible course should fill the released slot');
assert.ok(postponed.assessment.slotFillers.some(c=>c.id==='bscsc-social'));
assert.equal(postponed.assessment.postponed.find(c=>c.courseCode==='CSC1401').availability,'unknown','A future placement must not claim an unreported offering');
assert.equal(validatePlan(postponed.candidate.terms,postponed.candidate.courses,profile,postponed.candidate.scheduling).filter(i=>i.level==='conflict').length,0);
assert.throws(()=>proposeReplan(base,{choices:[{requirementId:'csc1401',courseCode:'CSC2302'}]},first),/verified equivalent|approval/);

const artTerm=termOf(base,'bscsc-arts').id,artReport={offerings:[offered(artTerm,['ART1302'],['ART1301'])]};
const alternatives=analyzeCourseAvailability(base,artTerm,mergeScheduling(base.scheduling,artReport)).affected.find(c=>c.requirementId==='bscsc-arts');
assert.equal(alternatives.kind,'selectable');
assert.ok(alternatives.alternatives.some(c=>c.courseCode==='ART1302'&&c.eligible&&c.availability==='reported-offered'));
const substitute=proposeReplan(base,{...artReport,choices:[{requirementId:'bscsc-arts',courseCode:'ART1302',reason:'Reported offered alternative for this same arts requirement.'}]},artTerm);
assert.equal(substitute.candidate.courses.find(c=>c.id==='bscsc-arts').code,'ART1302');
assert.ok(substitute.assessment.replacements.some(c=>c.from==='ART1301'&&c.to==='ART1302'));
assert.equal(substitute.candidate.scheduling.offerings[0].offeredCourseCodes[0],'ART1302');

const partial=normalizeScheduling({offerings:[offered(first,['PSY1301'])]});
assert.equal(courseAvailability('CSC1401',first,partial).status,'unknown');
assert.equal(courseAvailability('CSC1401',first,partial).allowed,true);
const complete=normalizeScheduling({offerings:[offered(first,['PSY1301'],[],true)]});
assert.equal(courseAvailability('CSC1401',first,complete).status,'not-listed');
assert.equal(courseAvailability('CSC1401',first,complete).allowed,false);
const listedOnly=proposeReplan(base,{offerings:complete.offerings},first);
assert.deepEqual(listedOnly.candidate.terms.find(t=>t.id===first).courses,['bscsc-social'],'Complete semester listing restricts scheduled courses to listed offerings');
assert.equal(courseAvailability('PSY1301',first,complete).confirmed,false,'A student report must not claim official registration certainty');
assert.throws(()=>normalizeScheduling({offerings:[offered(first,['PSY1301'],['PSY1301'])]}),/both offered and unavailable/);
assert.throws(()=>normalizeScheduling({offerings:[offered('Spring-9999',['PSY1301'])]}),/valid semester/);
assert.throws(()=>normalizeScheduling({offerings:[offered(first,['INVENTED'])]}),/Unknown course/);
const stale={unavailable:[{courseCode:'CSC1401',termId:first}],offerings:[]};
assert.equal(courseAvailability('CSC1401',first,mergeScheduling(stale,{offerings:[offered(first)]})).status,'unknown','An empty partial report clears an old semester report');
assert.equal(courseAvailability('CSC1401',first,mergeScheduling(stale,{offerings:[offered(first,['CSC1401'])]})).status,'reported-offered','A corrected offering clears stale unavailable status');
assert.equal(courseAvailability('CSC1401',first,mergeScheduling(stale,{offerings:[offered(first)],unavailable:[{courseCode:'CSC1401',termId:first}]})).status,'reported-unavailable','Fresh explicit cancellation still applies when older reports are cleared');

const frozen=make();frozen.tracking.csc1401={status:'completed',grade:'A',note:'Private course note'};frozen.tracking.mth1311={status:'in-progress'};
const frozenUpdate=proposeReplan(frozen,{offerings:[offered(first,['PSY1301'],['MTH1304'])]},first);
for(const id of ['csc1401','mth1311']){assert.equal(termOf(frozenUpdate.candidate,id).id,termOf(frozen,id).id);assert.deepEqual(frozenUpdate.candidate.tracking[id],frozen.tracking[id]);}
assert.throws(()=>proposeReplan(frozen,{offerings:[offered(first,['PSY1301'],[],true)]},first),/completed or current/);
const completedChoice=make();completedChoice.tracking['bscsc-arts']={status:'completed'};
assert.throws(()=>proposeReplan(completedChoice,{choices:[{requirementId:'bscsc-arts',courseCode:'ART1302'}]},artTerm),/cannot be replaced/);
const priorChoice=make();priorChoice.profile.priorCodes.push('ART1301');priorChoice.courses=coursesFor(priorChoice.profile);priorChoice.terms=generatePlan(priorChoice.profile);
assert.throws(()=>proposeReplan(priorChoice,{choices:[{requirementId:'bscsc-arts',courseCode:'ART1302'}]},first),/cannot be replaced/,'Prior credited work must stay protected without a separate progress flag');

const saved=replanSnapshot({...frozenUpdate.candidate,scheduling:{...frozenUpdate.candidate.scheduling,unavailable:[{courseCode:'ART1301',termId:artTerm}]}});
assert.ok(!JSON.stringify(saved).includes('Private course note'));assert.ok(!JSON.stringify(saved).includes('grade'));
assert.deepEqual(restoreSnapshot(saved).scheduling,saved.scheduling);
const legacy=structuredClone(saved);delete legacy.scheduling;assert.deepEqual(restoreSnapshot(legacy).scheduling.unavailable,legacy.unavailable);
assert.throws(()=>restoreSnapshot({...saved,scheduling:{offerings:[offered(first,['INVENTED'])]}}),/Unknown course/);
const unavailableForHorizon=[];for(let year=2026;year<=2050;year++)for(const season of ['Fall','Spring','Summer'])unavailableForHorizon.push(offered(`${season}-${year}`,[],[],true));
const impossible=proposeReplan(base,{offerings:unavailableForHorizon},first);
assert.equal(impossible.assessment.canApply,false);assert.ok(impossible.assessment.newlyPending.includes('csc1401'));
assert.equal(termOf(impossible.candidate,'csc1401').id,'pending','Impossible reports must not silently schedule a banned course');
const late=proposeReplan(base,{},'Fall-2035');assert.equal(late.assessment.delayed,true);assert.ok(late.assessment.extraRegularTerms>0);assert.ok(termOrder(graduationTerm(late.candidate))>termOrder(graduationTerm(base)));

// A completed language-center buffer must not be repeated on every schedule edit.
const bufferedProfile={...profile,lc:1},buffered={profile:bufferedProfile,courses:coursesFor(bufferedProfile),terms:generatePlan(bufferedProfile),tracking:{},scheduling:{}};
const bufferedReplan=proposeReplan(buffered,{},'Spring-2027');assert.equal(bufferedReplan.candidate.terms.filter(t=>t.lc).length,1);assert.equal(bufferedReplan.candidate.terms.find(t=>t.lc).id,'Fall-2026');

// Every simultaneous prerequisite must pass offering checks, including a transitive corequisite.
const fasRule=structuredClone(DATA.courses.FAS1220.rule);
try{
 DATA.courses.FAS1220.rule={...fasRule,coreq:['PSY1301']};
 const paired=generatePlan(profile,{offerings:[offered('Fall-2026',[],['PSY1301']),offered('Spring-2027',[],['PSY1301'])]}),pairedPlan={profile,courses:coursesFor(profile),terms:paired};
 const englishTerm=termOf(pairedPlan,'eng1301');
 assert.ok(!['Fall-2026','Spring-2027'].includes(englishTerm.id),'The transitive unavailable corequisite must block the whole simultaneous bundle');
 assert.ok(englishTerm.courses.includes('fas1220'));assert.ok(englishTerm.courses.includes('bscsc-social'));
 assert.equal(validatePlan(paired,pairedPlan.courses,profile).filter(i=>i.level==='conflict').length,0);
}finally{DATA.courses.FAS1220.rule=fasRule;}
const retake=make(),retakeTerm=termOf(retake,'bscsc-free-1').id,retakeAnalysis=analyzeCourseAvailability(retake,retakeTerm,{offerings:[offered(retakeTerm,['MTH3301'],['ACC2301'])]});
assert.ok(retakeAnalysis.affected.find(c=>c.requirementId==='bscsc-free-1').alternatives.find(c=>c.courseCode==='MTH3301').blockedBy.some(s=>s.includes('prerequisite')),'Untracked earlier planned mathematics must not count as completed prerequisite credit');
const reserved=base.terms.find(t=>t.internshipOnly);assert.ok(reserved);assert.equal(analyzeCourseAvailability(base,reserved.id).fillers.length,0,'No classroom filler should be suggested for reserved internship fieldwork');
console.log('Passed required-course cascades, eligible elective substitution, offered slot filling, complete/partial reports, stale-report correction, protected/prior work, impossible availability, graduation impact, snapshots and elapsed language buffers.');
