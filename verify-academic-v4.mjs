/**
 * GoPlan v4 academic acceptance regressions.
 * Run from any directory: node verify-academic-v4.mjs
 * Uses public planner/guidance exports and real supplied catalogue requirements.
 * This file never edits GoPlan, mutates DATA, or contacts an AI service.
 */
import assert from 'node:assert/strict';
import { DATA, normalizeProfile, coursesFor, generatePlan, validatePlan, creditsOf } from './dist/planner.js';
import { allowedChoices, emptyWorkspace, newJourney, makePlan, validateSavedWorkspace, planIssues } from './dist/guidance.js';

let passed=0, failed=0;
function test(name, body) {
  try { body(); passed++; console.log('PASS '+name); }
  catch (error) { failed++; console.error('FAIL '+name+'\n  '+error.message); }
}
const concrete = courses => courses.filter(c=>c.code);
const minorRows = courses => courses.filter(c=>c.minorId);
const physicalCount = (courses, code) => courses.filter(c=>c.code===code).length;
const uniqueIds = courses => assert.equal(new Set(courses.map(c=>c.id)).size,courses.length,'every requirement has a unique identifier');
const regularTerms = terms => terms.filter(t=>['Fall','Spring'].includes(t.season));
const rowsIn = (term,courses) => term.courses.map(id=>courses.find(c=>c.id===id));
const counted = rows => rows.filter(c=>c.loadCredits>0).length;
const sumLoad = rows => rows.reduce((n,c)=>n+c.loadCredits,0);
// Catalogue p263 separates zero-credit SBA fieldwork from its later credit-bearing assessment.
const isFieldwork = c => ['EGR4300','INT4001','INT4012'].includes(c.code);

// Fill only explicit source-listed choices, using distinct entries with the correct credit allocation.
// This fixture utility deliberately does not rank courses or approximate AI recommendations.
function withListedChoices(raw) {
  const p=normalizeProfile(raw);
  for(let pass=0;pass<2;pass++) {
    const courses=coursesFor(p), used=new Set(concrete(courses).map(c=>c.code));
    for(const c of courses) {
      if(!c.choice||c.code||c.replacementFor||c.approvalOnly||!c.options?.length)continue;
      const option=allowedChoices(c,p).find(x=>!x.topic&&!used.has(x.code)&&x.credits===c.credits);
      if(option){p.choices[c.id]=option.code;used.add(option.code);}
    }
  }
  return p;
}
function academicResult(raw) {
  const profile=withListedChoices(raw),courses=coursesFor(profile),terms=generatePlan(profile);
  uniqueIds(courses);
  assert.deepEqual(terms.flatMap(t=>t.courses).sort(),courses.map(c=>c.id).sort(),'every requirement is placed exactly once, including pending rows');
  return {profile,courses,terms,issues:validatePlan(terms,courses,profile)};
}
function approvalEvidence(courses, issues) {
  return courses.some(c=>c.approvalRequired||c.approvalOnly)||issues.some(i=>/approv|approved alternative/i.test(i.text));
}

// Sources: BBA November sheet pp4,9; catalogue pp123,126,178.
test('second focus accepts only a distinct supported concentration/specialization',()=>{
  assert.equal(normalizeProfile({program:'BSCSC',track:'SE',secondTrack:'AI'}).secondTrack,'AI');
  assert.equal(normalizeProfile({program:'BBA',track:'FIN',secondTrack:'MKT'}).secondTrack,'MKT');
  for(const raw of [{program:'BBA',track:'FIN',secondTrack:'FIN'},{program:'BSCSC',track:'SE',secondTrack:'SE'},{program:'BAIS',secondTrack:'AI'},{program:'BSCSC',secondTrack:'invented-track'}])assert.equal(normalizeProfile(raw).secondTrack,'');
});
test('BBA Finance plus Marketing replaces minor allocation and keeps nine elective credits',()=>{
  const one=academicResult({program:'BBA',track:'FIN',minor:''});
  const two=academicResult({program:'BBA',track:'FIN',secondTrack:'MKT',minor:''});
  assert.equal(creditsOf(two.courses),creditsOf(one.courses),'second concentration substitutes the existing allocation');
  assert.equal(creditsOf(two.courses),129);
  assert.equal(two.courses.filter(c=>c.code?.startsWith('FIN')&&!one.courses.some(x=>x.code===c.code)).length,0,'original finance selections are retained');
  const marketing=DATA.programs.find(p=>p.id==='BBA').tracks.find(t=>t.id==='MKT');
  const marketOptions=new Set(marketing.requirements.flatMap(r=>r.options||[]));
  assert.equal(two.courses.filter(c=>marketOptions.has(c.code)).length,5,'five separate marketing courses fulfill the second concentration');
  assert.equal(two.courses.filter(c=>/free elective/i.test(c.title)).reduce((n,c)=>n+c.credits,0),9);
  assert.ok(!two.courses.some(c=>c.groupId==='minor'||c.minorId),'no unnamed minor or extra minor is silently added');
  assert.equal(new Set(concrete(two.courses).map(c=>c.code)).size,concrete(two.courses).length,'no physical course is counted twice');
});
test('BBA Analytics plus TIM does not count their shared BAI3301 twice',()=>{
  const result=academicResult({program:'BBA',track:'BAI',secondTrack:'TIM',minor:''});
  assert.equal(physicalCount(result.courses,'BAI3301'),1);
  assert.ok(approvalEvidence(result.courses,result.issues),'required-course substitution remains subject to approval');
});
test('BSCSC second specialization uses nine existing elective credits and retains minor',()=>{
  const base=academicResult({program:'BSCSC',track:'SE',minor:'mathematics'});
  const result=academicResult({program:'BSCSC',track:'SE',secondTrack:'AI',minor:'mathematics'});
  assert.equal(creditsOf(result.courses),creditsOf(base.courses));
  assert.equal(creditsOf(result.courses),134);
  assert.equal(creditsOf(minorRows(result.courses)),15);
  for(const code of ['CSC4307','CSC4309','CSC3309','CSC3347'])assert.equal(physicalCount(result.courses,code),1);
  assert.ok(!result.courses.some(c=>/^(free elective|computing elective)/i.test(c.title)),'consumed elective allocation is not left in the plan a second time');
});
test('BSCSC ACS plus AI requires an approved alternative for shared CSC3309',()=>{
  const result=academicResult({program:'BSCSC',track:'ACS',secondTrack:'AI',minor:''});
  assert.equal(physicalCount(result.courses,'CSC3309'),1);
  assert.equal(creditsOf(result.courses),134);
  assert.ok(approvalEvidence(result.courses,result.issues));
});

// The newer November BBA sheet p4 gives school-specific prerequisites.
// Verify those factual rules independently of generated scheduling and catch empty parser fallbacks.
test('BBA common-core prerequisites match the November 2025 program sheet',()=>{
  const courses=coursesFor({program:'BBA',track:'FIN'}),find=code=>courses.find(c=>c.code===code);
  const math=['MTH1305','MTH1304','MTH1311','MTH1303'];
  for(const code of ['ACC2301','ECO2301','GBU2301'])assert.deepEqual(new Set(find(code).rule.any),new Set(math),code+' accepts every math route listed on p4');
  assert.deepEqual(new Set(find('ACC2302').rule.any),new Set(['ACC2301','EGR2391']));
  for(const code of ['FIN3301','MGT3301','MKT3301'])assert.deepEqual(new Set(find(code).rule.all),new Set(['ACC2302','ECO2302']),code+' requires BOTH prior accounting and economics for BBA');
  assert.ok(find('ACC3201').rule.all.includes('ACC2302'));assert.equal(find('ACC3201').rule.minCredits,60);
  assert.ok(find('ECO2302').rule.all.includes('ECO2301'));assert.ok(find('GBU3311').rule.all.includes('GBU2301'));
  for(const code of ['GBU3302','GBU3203'])assert.equal(find(code).rule.minCredits,60);
  assert.equal(find('GBU4101').rule.minCredits,90);assert.ok(find('GBU4101').rule.finalTerm);
  for(const code of ['INT4001','GBU3203','ACC3201'])assert.ok(find('INT4301').rule.all.includes(code));
  assert.equal(find('INT4301').rule.minCredits,90);
  assert.deepEqual(new Set(find('MGT3302').rule.all),new Set(['MGT3301','MKT3301','FIN3301']));
  assert.ok(find('MGT4303').rule.all.includes('MGT3301'));assert.deepEqual(new Set(find('MGT4303').rule.any),new Set(['GBU3311','MTH3301']));
  assert.ok(find('MIS3301').rule.all.includes('MGT3301'));assert.deepEqual(new Set(find('MIS3301').rule.any),new Set(['CSC1300','CSC1401']));
  assert.deepEqual(new Set(find('MGT4301').rule.all),new Set(['INT4301','MGT3301']));assert.ok(find('MGT4301').rule.finalTerm);
  assert.equal(find('INT4001').rule.minCredits,0,'p263 fieldwork must not inherit the p4 senior-standing condition of its later assessment');
});
test('generated BBA courses respect the source prerequisites before timing targets',()=>{
  for(const pace of ['balanced','accelerated']){
    const result=academicResult({program:'BBA',track:'FIN',pace,gpa:3.5,summers:true,startYear:2026});
    const done=new Set(result.profile.priorCodes);let credits=result.profile.priorCodes.reduce((n,id)=>n+(DATA.courses[id]?.credits||0),0);
    for(const term of result.terms){
      if(['prior','pending'].includes(term.id))continue;
      const rows=rowsIn(term,result.courses);
      for(const c of rows){
        assert.ok(c.rule.all.every(id=>done.has(id)),(c.code||c.title)+' is scheduled before a required prerequisite');
        assert.ok(!c.rule.any.length||c.rule.any.some(id=>done.has(id)),(c.code||c.title)+' lacks an earlier allowed prerequisite');
        assert.ok(credits>=c.rule.minCredits,(c.code||c.title)+' is scheduled before its standing requirement');
      }
      for(const c of rows){if(c.code)done.add(c.code);credits+=c.credits;}
    }
    for(const code of ['FIN3301','MGT3301','MKT3301'])assert.ok(done.has(code),code+' remains schedulable once its prerequisites are complete');
  }
});

// Sources: catalogue pp120,177,199; ALS1002 description p204.
test('BSCSC Mathematics uses a fifteen-credit Individual Minor proposal beyond major mathematics',()=>{
  const result=academicResult({program:'BSCSC',track:'SE',minor:'mathematics'}),minor=minorRows(result.courses);
  assert.equal(creditsOf(minor),15);
  for(const code of ['MTH1311','MTH1312','MTH1304','MTH2301','MTH2320','EGR3393','MTH3301','MTH3303','ALS1002'])assert.ok(!minor.some(c=>c.code===code),code+' must not count in this minor');
  for(const code of ['MTH2304','EGR3392','CSC4351','EGR4394'])assert.equal(physicalCount(minor,code),1);
  assert.ok(minor.some(c=>!c.code&&c.credits===3),'unidentified approved math elective remains a clearly pending three-credit slot');
  assert.ok(approvalEvidence(minor,result.issues));
  assert.ok(!minor.some(c=>/replacement for MTH1312|replacement for MTH2301/i.test(c.title)),'major calculus is not presented as a minor replacement problem');
});
test('math approval slot rejects LC courses through both UI options and forged input',()=>{
  const p=normalizeProfile({program:'BSCSC',track:'SE',minor:'mathematics'}),courses=coursesFor(p);
  const slot=minorRows(courses).find(c=>c.choice&&!c.code);
  assert.ok(slot,'Individual Minor has a pending school-approved choice');
  assert.ok(!allowedChoices(slot,p).some(x=>x.code==='ALS1002'));
  const forged=normalizeProfile({...p,choices:{...p.choices,[slot.id]:'ALS1002'}});
  assert.ok(!coursesFor(forged).some(c=>c.minorId&&c.code==='ALS1002'));
  assert.equal(coursesFor(forged).find(c=>c.id===slot.id).credits,3,'invalid choice cannot erase the requirement credit allocation');
});
test('computing elective cannot accept LC or unrelated academic courses',()=>{
  const p=normalizeProfile({program:'BSCSC',track:'SE'}),courses=coursesFor(p);
  const slot=courses.find(c=>/computing elective/i.test(c.title));assert.ok(slot);
  const options=allowedChoices(slot,p);
  assert.ok(options.length>0);
  assert.ok(options.every(x=>/^CSC[34]\d{3}$/.test(x.code)&&x.credits>0),'every option is an advanced computing course with degree credit');
  for(const code of ['ALS1002','MTH1312'])assert.ok(!coursesFor({...p,choices:{[slot.id]:code}}).some(c=>c.id===slot.id&&c.code===code),'forged '+code+' is rejected');
});
test('BDA Statistical Analysis and Mathematics minor cannot reuse CSC4351',()=>{
  const p=normalizeProfile({program:'BSCSC',track:'BDA',minor:'mathematics'});
  const slot=coursesFor(p).find(c=>!c.minorId&&c.choice&&allowedChoices(c,p).some(x=>x.code==='CSC4351'));
  assert.ok(slot);p.choices[slot.id]='CSC4351';
  const result=coursesFor(p);assert.equal(physicalCount(result,'CSC4351'),1);
  assert.equal(creditsOf(minorRows(result)),15,'minor still has its full independent credit requirement');
  assert.ok(minorRows(result).filter(c=>!c.code).length>=2,'math needs a further distinct approved course when statistics is used in the specialization');
});
test('an explicit free-elective prerequisite prevents an added duplicate supporting course',()=>{
  const p=normalizeProfile({program:'BBA',track:'FIN',minor:'computer-science'});
  const free=coursesFor(p).find(c=>c.choice&&/free elective/i.test(c.title)&&allowedChoices(c,p).some(x=>x.code==='CSC1401'));
  assert.ok(free);p.choices[free.id]='CSC1401';
  const result=coursesFor(p);assert.equal(physicalCount(result,'CSC1401'),1);
  assert.ok(!result.some(c=>c.code==='CSC1401'&&c.supportingPrerequisite),'the allocated degree course satisfies the prerequisite without extra study');
});

// Paces are requested targets; policy approvals must remain visible, never fabricated.
for(const pace of ['balanced','accelerated']) {
  test(pace+' targets the requested regular and summer course counts',()=>{
    const result=academicResult({program:'BSCSC',track:'SE',pace,gpa:3.5,summers:true,startYear:2026,priorCodes:['FRN3210']});
    const regularMaximum=pace==='accelerated'?6:5,summerMaximum=pace==='accelerated'?3:2;
    const ordinarySummers=result.terms.filter(t=>t.season==='Summer'&&t.year!==2029);
    assert.ok(regularTerms(result.terms).some(t=>counted(rowsIn(t,result.courses))===regularMaximum),'requested regular target is actually used when enough courses remain');
    assert.ok(ordinarySummers.some(t=>counted(rowsIn(t,result.courses))===summerMaximum),'requested summer target is actually used');
    for(const term of regularTerms(result.terms)) {
      const rows=rowsIn(term,result.courses);assert.ok(counted(rows)<=regularMaximum);
      assert.ok(sumLoad(rows)<=(pace==='accelerated'?20:17),'regular credit cap remains respected');
    }
    for(const term of ordinarySummers)assert.ok(counted(rowsIn(term,result.courses))<=summerMaximum);
    for(const term of ordinarySummers)assert.ok(sumLoad(rowsIn(term,result.courses))<=(pace==='accelerated'?10:7),'summer credit ceiling remains respected');
  });
  for(const program of ['BSCSC','BBA'])test(program+' '+pace+' reserves third-year summer for internship only',()=>{
    const result=academicResult({program,track:program==='BSCSC'?'SE':'FIN',pace,gpa:3.5,summers:true,startYear:2026,priorCodes:program==='BSCSC'?['FRN3210']:[]});
    const thirdSummer=result.terms.find(t=>t.season==='Summer'&&t.year===2029);
    assert.ok(thirdSummer,'third-year summer exists as the internship target');
    const rows=rowsIn(thirdSummer,result.courses);
    assert.ok(rows.length>0&&rows.every(isFieldwork),'the internship target is not mixed with teaching courses');
    assert.ok(result.terms.filter(t=>t.id!=='prior'&&t.id!=='pending'&&t!==thirdSummer).every(t=>rowsIn(t,result.courses).every(c=>!isFieldwork(c))),'fieldwork is not prematurely placed in a teaching semester');
    if(program==='BBA'){
      const fieldwork=result.courses.find(c=>c.code==='INT4001'),assessment=result.courses.find(c=>c.code==='INT4301');
      assert.equal(fieldwork.credits,0,'catalogue fieldwork stage carries no degree credit');
      assert.equal(assessment.credits,3,'internship assessment retains its three degree credits');
      const assessmentTerm=result.terms.find(t=>t.courses.includes(assessment.id));
      assert.ok(['Fall','Spring'].includes(assessmentTerm.season),'INT4301 assessment is a later teaching-term registration');
      assert.ok(result.terms.indexOf(assessmentTerm)>result.terms.indexOf(thirdSummer),'assessment follows completed fieldwork');
      const nextRegular=result.terms.slice(result.terms.indexOf(thirdSummer)+1).find(t=>['Fall','Spring'].includes(t.season));
      const creditsBeforeNext=result.terms.slice(0,result.terms.indexOf(nextRegular)).flatMap(t=>rowsIn(t,result.courses)).reduce((n,c)=>n+c.credits,0);
      if(creditsBeforeNext>=90){assert.equal(assessmentTerm.season,'Fall');assert.equal(assessmentTerm.year,2029);}
      else assert.ok(result.terms.indexOf(assessmentTerm)>result.terms.indexOf(nextRegular),'senior-standing eligibility takes precedence over the next-fall target');
      assert.ok(assessment.rule.all.includes('INT4001'),'fieldwork is an earlier prerequisite, not a concurrent assessment');
      assert.ok(fieldwork.rule.review||fieldwork.approvalRequired,'BBA fieldwork remains subject to registration confirmation');
      const note=[fieldwork.condition,fieldwork.prerequisiteText,...result.issues.map(i=>i.text)].filter(Boolean).join(' ');
      assert.ok(/catalogue|catalog/i.test(note)&&/sheet|SBA|confirm/i.test(note),'newer program-sheet registration difference is retained for review');
    }
  });
}


test('unknown or low GPA keeps accelerated targets conditional rather than treating them as permission',()=>{
  for(const gpa of ['',2.4]) {
    const result=academicResult({program:'BSCSC',track:'SE',pace:'accelerated',gpa,summers:true,startYear:2026,priorCodes:['FRN3210']});
    assert.ok(regularTerms(result.terms).some(t=>counted(rowsIn(t,result.courses))===6),'conditional six-course target is retained');
    const note=result.issues.find(i=>/CGPA|GPA/.test(i.text)&&/3(?:\.0)?/.test(i.text)&&/confirm|permission|approv|eligible/i.test(i.text));
    assert.ok(note,'registration eligibility must be stated when GPA qualification is unconfirmed or unmet');
    assert.equal(note.level,gpa===''?'review':'conflict');
  }
});

// Saved-plan contract: reconstruction produces a new proposal and retains the prior approved snapshot.
test('saved second-focus plan, progress and user adjustments survive restore and reconstruction',()=>{
  const journey=newJourney();journey.profile=withListedChoices({program:'BSCSC',track:'SE',secondTrack:'AI',minor:'mathematics',pace:'accelerated',gpa:3.5,summers:true});journey.programChosen=true;
  const plan=makePlan(journey),completed=plan.courses.find(c=>c.code==='CSC1401');assert.ok(completed);
  plan.tracking[completed.id]={status:'completed',grade:'A',note:'Student recorded this result'};
  plan.finalizedAt='2026-09-16T12:00:00.000Z';
  const movable=plan.courses.find(c=>c.code==='CSC2306'),term=plan.terms.find(t=>t.courses.includes(movable.id));
  plan.reports=[{id:'fixture-conflict',courseId:movable.id,termId:term.id,type:'unavailable',detail:'Student reports the next offering was cancelled.',status:'open',createdAt:'2026-09-16T12:01:00.000Z'}];
  const before=JSON.stringify(plan);
  const workspace={...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)};
  const restored=validateSavedWorkspace(JSON.parse(JSON.stringify(workspace)));
  assert.equal(JSON.stringify(restored.plan),before,'restoring does not regenerate terms or drop second focus/progress/reports');
  const nextJourney=newJourney(plan);nextJourney.profile={...nextJourney.profile,pace:'balanced'};
  const proposed=makePlan(nextJourney,plan);
  assert.equal(JSON.stringify(plan),before,'new decision must not mutate the old saved roadmap');
  assert.equal(plan.profile.secondTrack,'AI');
  assert.ok(proposed.profile.priorCodes.includes('CSC1401'),'completed course is carried forward');
  assert.ok(proposed.courses.some(c=>c.code==='CSC1401'&&proposed.tracking[c.id]?.status==='completed'));
  assert.ok(planIssues(restored.plan).some(i=>i.text.includes('Student reports the next offering was cancelled.')));
});

console.log('\nAcademic v4 regressions: '+passed+' passed; '+failed+' failed.');
if(failed)process.exitCode=1;
