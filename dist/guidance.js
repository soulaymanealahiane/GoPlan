import {DATA,DEFAULT_PROFILE,normalizeProfile,coursesFor,generatePlan,validatePlan,creditsOf,restoreState} from './planner.js';
import GUIDED from './guided-data.js';
import {selectedMinor} from './minors.js';
import {courseOptions} from './course-options.js';
import {normalizeScheduling} from './course-availability.js';
import {emptyQuestionnaire,cleanQuestionnaire} from './questionnaire.js';
import {normalizeStudentContext} from './student-context.js';
export {GUIDED};
export const INTERESTS=[
 {id:'technology',name:'Build software & products',icon:'⌘',words:['software','comput','programming','digital','system','technology']},
 {id:'ai-data',name:'Explore AI & data',icon:'✳',words:['data','analytics','artificial intelligence','machine learning','statistic','quantitative']},
 {id:'business',name:'Start or grow a business',icon:'↗',words:['business','entrepreneur','management','marketing','innovation','finance']},
 {id:'engineering',name:'Design things that work',icon:'⚙',words:['engineering','design','mechanical','manufactur','energy','system']},
 {id:'sustainability',name:'Work on climate & energy',icon:'◉',words:['environment','sustainab','energy','renewable','climate','ecology']},
 {id:'communication',name:'Tell stories & influence',icon:'◈',words:['communication','media','writing','marketing','brand','public relation']},
 {id:'international',name:'Understand the world',icon:'◎',words:['international','diploma','politic','global','geograph','culture','development']},
 {id:'people',name:'Help people & lead teams',icon:'◇',words:['human','leadership','psychology','sociology','education','organization','development']}
];
export const PROGRAM_TAGS={BSCSC:['technology','ai-data'],BBA:['business','people'],BACS:['communication','people'],BAIS:['international','people'],BSESS:['sustainability','international'],BSGE:['engineering','technology'],BSRESE:['sustainability','engineering'],BSEMS:['engineering','business','ai-data'],MSSE:['technology'],MSBDA:['ai-data','technology'],MSSEM:['sustainability','engineering'],MSDMA:['communication','business','ai-data'],MBA:['business','people'],MACDM:['communication','people'],MAISD:['international','people']};
export const STEPS=['Starting point','Your goals','Your direction','Your courses','Experience','Roadmap'];
export function newJourney(plan){return structuredClone({flowVersion:5,step:0,programChosen:!!plan,refinements:plan?.decisions?.refinements||{},feedbackHistory:plan?.decisions?.feedbackHistory||{},lastUpdates:plan?.decisions?.lastUpdates||{},agentChoices:plan?.decisions?.agentChoices||plan?.decisions?.details?.choices||{},setup:plan?.decisions?.setup||null,background:plan?.decisions?.background||'',questionnaire:cleanQuestionnaire(plan?.decisions?.questionnaire||emptyQuestionnaire()),paceAdvice:plan?.decisions?.paceAdvice||null,advice:plan?.decisions?.advice||null,details:plan?.decisions?.details||null,answers:'',refinement:'',choiceReasons:plan?.decisions?.choiceReasons||{},level:plan?.program?.level||'undergraduate',preferredDegree:plan?.profile.program||'undecided',interests:plan?.decisions?.interests||[],goal:plan?.decisions?.goal||'',region:plan?.decisions?.region||'open',mastersPreference:plan?.decisions?.mastersPreference||'both',internships:plan?.decisions?.internships||[],exchanges:plan?.decisions?.exchanges||[],auiMasters:plan?.decisions?.auiMasters||[],globalMasters:plan?.decisions?.globalMasters||[],profile:normalizeProfile(plan?.profile||{...DEFAULT_PROFILE,program:'BSCSC',track:'',summers:true}),reviewAcknowledged:false,...(plan?.studentContext||plan?.decisions?.studentContext?{studentContext:plan.studentContext||plan.decisions.studentContext,scheduling:plan.scheduling||{}}:{})});}
export const emptyWorkspace=()=>({version:3,phase:'journey',journey:newJourney(),plan:null,draftPlan:null,history:[],updatedAt:new Date().toISOString()});
export function migrateLegacy(raw){const old=restoreState(raw),j=newJourney();j.profile=old.profile;j.programChosen=true;j.preferredDegree=old.profile.program;const plan=makePlan(j);plan.terms=old.terms;plan.tracking={...plan.tracking,...Object.fromEntries(old.completed.map(id=>[id,{status:'completed',grade:'',note:'Imported from your previous GoPlan'}]))};plan.finalizedAt=new Date().toISOString();return {...emptyWorkspace(),phase:'saved',plan,journey:newJourney(plan)};}
function matches(tags,interests){return interests.filter(x=>(tags||[]).includes(x));}
export function tagsForText(text){text=String(text).toLowerCase();return INTERESTS.filter(i=>i.words.some(w=>text.includes(w))).map(i=>i.id);}
export function interestNames(tags){return tags.map(id=>INTERESTS.find(x=>x.id===id)?.name).filter(Boolean).join(' · ');}
export function suggestPrograms(j){const level=j.level==='open'?null:j.level;return DATA.programs.filter(p=>!level||p.level===level).map(p=>{const hit=matches(PROGRAM_TAGS[p.id],j.interests);return {program:p,hit,preferred:p.id===j.preferredDegree,reason:hit.length?`Connects with ${interestNames(hit).toLowerCase()}.`:'Another field to compare against your goals.'};}).sort((a,b)=>Number(b.preferred)-Number(a.preferred)||b.hit.length-a.hit.length);}
export function eligibleMinors(profile){return GUIDED.minors.map(m=>selectedMinor({...profile,minor:m.id})).filter(Boolean);}
export function suggestMinors(j){return eligibleMinors(j.profile).map(m=>({minor:m,hit:matches(m.tags||tagsForText(m.name),j.interests)})).sort((a,b)=>b.hit.length-a.hit.length);}
export function recommendTargets(type,j){return (GUIDED[type]||[]).map(x=>{const hit=matches(x.tags||[],j.interests),related=(x.programs||[]).includes(j.profile.program);return {...x,hit,related};}).sort((a,b)=>b.hit.length-a.hit.length||Number(b.related)-Number(a.related));}
export const allowedChoices=courseOptions;
export function suggestChoices(j){
 const p=normalizeProfile(j.profile),cs=coursesFor(p),used=new Set(cs.filter(c=>c.code).map(c=>c.code)),minor=selectedMinor(p);let filled=0;
 for(const c of cs){
  if(!c.choice||c.code||c.replacementFor||!c.options?.length||/arabic|french|language|civic|placement/i.test(c.title))continue;
  const candidates=allowedChoices(c,p).filter(x=>!used.has(x.code)&&!x.creditsProvisional&&x.credits===c.credits&&!(minor?.overlapRules||[]).some(r=>r.action==='mutually-exclusive'&&r.courses.includes(x.code)&&r.courses.some(id=>used.has(id)))).map(x=>({...x,hit:matches(tagsForText(x.title),j.interests)})).sort((a,b)=>b.hit.length-a.hit.length);
  if(!candidates.length)continue;p.choices={...p.choices,[c.id]:candidates[0].code};used.add(candidates[0].code);filled++;
 }
 return {profile:p,filled};
}
export function makePlan(j,previous){
 const profile=normalizeProfile(j.profile),completedCodes=(previous?.courses||[]).filter(c=>previous?.tracking?.[c.id]?.status==='completed'&&c.code).map(c=>c.code);
 profile.priorCodes=[...new Set([...profile.priorCodes,...completedCodes])];profile.exchange=j.profile.exchange===true;
 const courses=coursesFor(profile),tracking={};
 for(const c of courses){const prior=(previous?.courses||[]).find(x=>x.code&&x.code===c.code&&previous.tracking?.[x.id]?.status==='completed');if(prior)tracking[c.id]={...previous.tracking[prior.id]};else if(profile.priorCodes.includes(c.code))tracking[c.id]={status:'completed',grade:'',note:'Recorded before this roadmap'};}
 const program=DATA.programs.find(p=>p.id===profile.program),minor=selectedMinor(profile);
 return {id:Date.now().toString(36),dataVersion:DATA.version,createdAt:new Date().toISOString(),finalizedAt:null,profile,courses,terms:generatePlan(profile),program:structuredClone(program),minor:minor?structuredClone(minor):null,decisions:structuredClone(j),tracking,reports:[],targets:{internships:structuredClone(j.details?.internships||[]),exchanges:structuredClone(j.details?.exchanges||[]),auiMasters:[],globalMasters:[]}};
}
export function planIssues(plan){
 const issues=validatePlan(plan.terms,plan.courses,plan.profile,plan.scheduling);
 for(const c of plan.courses){const progress=plan.tracking?.[c.id];if(progress?.status==='retake')issues.push({level:'conflict',id:c.id,text:`${c.code||c.title} needs a retake. Move it to a new semester and review dependent courses before treating their prerequisites as satisfied.`});if(progress?.status==='completed'&&plan.program.level==='graduate'&&['C+','C','C−','D+','D','F'].includes(progress.grade))issues.push({level:'conflict',id:c.id,text:`${c.code||c.title}: recorded grade ${progress.grade} is below the graduate minimum B− stated in the catalog; some programs require B. Confirm repeat and degree-credit rules.`});}
 if(plan.minor?.reviewRequired)issues.push({level:'review',text:`${plan.minor.name}: source differences, eligibility or overlap approvals still require review.`});
 for(const r of plan.reports||[])if(r.status==='open')issues.push({level:'conflict',id:r.courseId,text:`Reported ${r.type}: ${r.detail||'Course availability or registration conflict'} (${r.termId}).`});
 for(const record of plan.academicRecord||[])if(record.review)issues.push({level:'review',text:`${record.courseCode}: recorded ${record.status} study is retained; confirm its applicability to this degree with your academic adviser.`});
 return issues;
}
export function completedIds(plan){return plan.courses.filter(c=>plan.tracking?.[c.id]?.status==='completed').map(c=>c.id);}
export function courseLabel(c){return c.code?`${c.code} · ${c.title}`:c.title;}
export function targetLabel(t){return t.name||t.title;}
export function validateSavedWorkspace(raw){
 if(raw?.version!==3||!['journey','draft','saved'].includes(raw.phase)||!raw.journey)throw Error('This is not a GoPlan guided-plan backup.');
 const object=x=>x&&typeof x==='object'&&!Array.isArray(x),strings=x=>Array.isArray(x)&&x.every(v=>typeof v==='string'),number=x=>Number.isFinite(x)&&x>=0&&x<=1000;
 if(!object(raw.journey)||!Array.isArray(raw.history||[]))throw Error('Invalid saved workspace.');
 if(![4,5].includes(raw.journey.flowVersion)){raw.journey.step=({0:0,1:1,2:2,3:2,4:3,5:4,6:5,7:5})[raw.journey.step]??0;}
 raw.journey.flowVersion=5;
 raw.journey={...newJourney(),...raw.journey,profile:normalizeProfile(raw.journey.profile)};
 raw.journey.questionnaire=cleanQuestionnaire(raw.journey.questionnaire);if(!raw.journey.questionnaire.ambitions&&raw.journey.goal)raw.journey.questionnaire.ambitions=raw.journey.goal.slice(0,1200);
 const j=raw.journey;
 if(j.studentContext)j.studentContext=normalizeStudentContext(j.studentContext);
 if(j.scheduling)j.scheduling=normalizeScheduling(j.scheduling);
 const stages=['setup','direction','courses','targets','pace'];
 j.refinements=Object.fromEntries(stages.map(stage=>[stage,typeof j.refinements?.[stage]==='string'?j.refinements[stage].slice(0,2500):'']));
 j.feedbackHistory=Object.fromEntries(stages.map(stage=>[stage,(Array.isArray(j.feedbackHistory?.[stage])?j.feedbackHistory[stage]:[]).slice(-4).filter(x=>object(x)&&typeof x.request==='string'&&typeof x.summary==='string').map(x=>({request:x.request.slice(0,2500),summary:x.summary.slice(0,1000)}))]));
 if(!object(j.agentChoices))j.agentChoices={};
 if(!Number.isInteger(j.step)||j.step<0||j.step>5||!['undergraduate','graduate','open'].includes(j.level))throw Error('Invalid guided setup.');
 for(const key of ['goal','answers','refinement'])if(typeof j[key]!=='string'||j[key].length>10000)throw Error('Invalid saved goals.');
 if(j.advice&&(!object(j.advice)||!['clarify','recommend'].includes(j.advice.kind)||!strings(j.advice.themes)||!strings(j.advice.questions)||!strings(j.advice.tradeoffs)||!object(j.advice.academic)||typeof j.advice.summary!=='string'))throw Error('Invalid saved AI direction.');
 if(j.details&&(!object(j.details)||typeof j.details.summary!=='string'||!['internships','exchanges'].every(k=>Array.isArray(j.details[k])&&j.details[k].length<=5&&j.details[k].every(t=>object(t)&&typeof t.name==='string'&&typeof t.reason==='string'))))throw Error('Invalid saved recommendations.');
 for(const key of ['interests','internships','exchanges','auiMasters','globalMasters'])if(!strings(j[key]))throw Error('Invalid saved choices.');
 for(const plan of [raw.plan,raw.draftPlan,...(raw.history||[])].filter(Boolean)){
  if(!Array.isArray(plan.courses)||plan.courses.length>300||!Array.isArray(plan.terms)||plan.terms.length>100)throw Error('The saved roadmap is invalid.');
  if(plan.courses.some(c=>!object(c)||typeof c.id!=='string'||!number(c.credits)||!number(c.loadCredits)||!['focus','general','foundation','core','experience'].includes(c.kind)||!object(c.rule)||!strings(c.rule.all)||!strings(c.rule.any)||!strings(c.rule.coreq)||!number(c.rule.minCredits)))throw Error('Invalid saved course information.');
  for(const c of plan.courses){if(c.options&&!strings(c.options)||c.excludedCourses&&!strings(c.excludedCourses)||c.offeredTerms&&!strings(c.offeredTerms)||c.allowedOptions&&(!Array.isArray(c.allowedOptions)||c.allowedOptions.some(x=>!object(x)))||c.rule.minProgramCourses&&(!number(c.rule.minProgramCourses)||!strings(c.rule.programCourseCodes)))throw Error('Invalid saved requirement options.');}
  if(plan.scheduling)plan.scheduling=normalizeScheduling(plan.scheduling);
  if(plan.studentContext)plan.studentContext=normalizeStudentContext(plan.studentContext);
  if(plan.decisions?.studentContext)plan.decisions.studentContext=normalizeStudentContext(plan.decisions.studentContext);
  if(new Set(plan.courses.map(c=>c.id)).size!==plan.courses.length)throw Error('Duplicate saved course identifiers.');
  if(new Set(plan.terms.map(t=>t.id)).size!==plan.terms.length)throw Error('Duplicate semester identifiers.');
  let order=-Infinity;for(const t of plan.terms){if(t.id==='prior'||t.id==='pending')continue;const n=t.year*3+({Spring:0,Summer:1,Fall:2}[t.season]??NaN);if(!Number.isInteger(t.year)||t.year<2000||t.year>2100||!Number.isFinite(n)||n<=order||t.id!==`${t.season}-${t.year}`)throw Error('Invalid semester order.');order=n;}
  const ids=new Set(plan.courses.map(c=>c.id)),seen=new Set();for(const t of plan.terms){if(!Array.isArray(t.courses))throw Error('Invalid semester.');for(const id of t.courses){if(!ids.has(id)||seen.has(id))throw Error('The saved roadmap has duplicate or unknown requirements.');seen.add(id);}}
  if(plan.academicRecord){if(!Array.isArray(plan.academicRecord)||plan.academicRecord.length>300)throw Error('Invalid retained study.');const context=plan.studentContext||plan.decisions?.studentContext;if(!context)throw Error('Recorded study needs a student starting point.');const normalized=normalizeStudentContext({...context,route:'continuing',records:plan.academicRecord});plan.academicRecord=normalized.records.map((record,index)=>{const original=plan.academicRecord[index];if(original.requirementId&&!ids.has(original.requirementId)||typeof original.review!=='boolean'||typeof original.countsTowardDegree!=='boolean'||original.countsTowardDegree&&(record.status!=='completed'||!original.requirementId))throw Error('Invalid recorded-study mapping.');return {...record,requirementId:original.requirementId||'',countsTowardDegree:original.countsTowardDegree,review:original.review,reason:textRecordReason(original.reason)};});}
  if(seen.size!==ids.size)throw Error('The saved roadmap is incomplete.');
  if(!object(plan.program)||!object(plan.profile)||!DATA.programs.some(p=>p.id===plan.profile.program)||!number(plan.program.degreeCredits?.min)||!number(plan.program.degreeCredits?.max)||!Array.isArray(plan.program.tracks)||!Array.isArray(plan.program.notes))throw Error('Invalid saved program.');
  // Older backups stored a single pace. Upgrade its preferences without rebuilding semesters or progress.
  const loads=normalizeProfile(plan.profile);plan.profile.regularCourses=loads.regularCourses;plan.profile.summerCourses=loads.summerCourses;
  if(plan.program.tracks.some(t=>!object(t)||typeof t.id!=='string'||typeof t.name!=='string'))throw Error('Invalid saved specialization.');
  if(!object(plan.tracking)||!Array.isArray(plan.reports)||!object(plan.targets))throw Error('Missing saved progress.');
  for(const [id,t] of Object.entries(plan.tracking))if(!ids.has(id)||!object(t)||!['planned','in-progress','completed','retake'].includes(t.status))throw Error('Invalid progress record.');
  for(const r of plan.reports)if(!ids.has(r.courseId)||!['open','resolved'].includes(r.status))throw Error('Invalid conflict report.');
  for(const type of ['internships','exchanges','auiMasters','globalMasters'])if(!Array.isArray(plan.targets[type])||plan.targets[type].some(t=>!object(t)||typeof t.id!=='string'))throw Error('Invalid research targets.');
 }
 if(raw.phase==='saved'&&!raw.plan||raw.phase==='draft'&&!raw.draftPlan)throw Error('The saved plan is missing.');
 raw.history=(raw.history||[]).slice(0,3);return raw;
}
const textRecordReason=value=>typeof value==='string'?value.slice(0,1000):'';
