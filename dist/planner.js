import DATA from './academic-data.js';
import GUIDED from './guided-data.js';
import {withMinor,selectedMinor} from './minors.js';
import {withSecondFocus} from './second-focus.js';
import {courseOptions} from './course-options.js';
import {businessRule,BUSINESS_SOURCE,describeRule} from './program-rules.js';
import {normalizeScheduling,courseAvailability} from './course-availability.js';
for(const x of GUIDED.supplementaryCourses||[])if(!DATA.courses[x.id]||DATA.courses[x.id].creditsProvisional)DATA.courses[x.id]={code:x.id,title:x.title,credits:x.credits,source:x.source,prerequisiteText:x.prerequisiteStatus,rule:{all:[],any:[],coreq:[],minCredits:0,review:true}};
for(const m of GUIDED.minors)for(const r of [...m.requirements,...(m.variants||[]).flatMap(v=>v.requirements)])for(const id of [r.courseCode,...(r.allowedCourses||[])].filter(Boolean))if(!DATA.courses[id])DATA.courses[id]={code:id,title:r.courseCode===id?r.title:id+' · source-listed option',credits:r.credits,creditsProvisional:true,source:r.source,prerequisiteText:'Course is listed in the minor source; confirm its current course description, credits and prerequisites.',rule:{all:[],any:[],coreq:[],minCredits:0,review:true}};
export {DATA};
DATA.courses.INT4001={code:'INT4001',title:'Business internship fieldwork',credits:0,source:{file:'aui academic catalogue.pdf',page:263},rule:{all:['GBU3203','ENG2302','ACC3201'],any:['FRN3210','FRN3310'],coreq:[],minCredits:0,review:true},prerequisiteText:'Fieldwork stage before INT4301; preparation and French requirements apply. Confirm the registration sequence with SBA.'};
export const DEFAULT_PROFILE={name:'',program:'BSCSC',track:'SE',pace:'balanced',gpa:'',summers:true,exchange:false,startYear:2026,lc:0,priorCodes:[],choices:{}};
export const code=s=>String(s||'').replace(/\s/g,'').toUpperCase();
export const programFor=p=>DATA.programs.find(x=>x.id===p.program)||DATA.programs[0];
export const creditsOf=cs=>cs.reduce((n,c)=>n+(c?.credits||0),0);
export const label=t=>t.id==='pending'?'Needs placement':t.id==='prior'?'Completed before this plan':`${t.season} ${t.year}`;
export function normalizeProfile(raw={}){
 const p={...DEFAULT_PROFILE,...raw},program=programFor(p);p.program=program.id;
 p.track=program.tracks.some(t=>t.id===p.track)?p.track:(program.tracks[0]?.id||'');
 p.name=String(p.name||'').slice(0,40);p.startYear=Math.max(2026,Math.min(2040,Number(p.startYear)||2026));
 const legacyFast=raw.pace==='accelerated';p.regularCourses=program.level==='graduate'?4:([5,6].includes(Number(raw.regularCourses))?Number(raw.regularCourses):legacyFast?6:5);p.summerCourses=program.level==='graduate'?2:([2,3].includes(Number(raw.summerCourses))?Number(raw.summerCourses):legacyFast?3:2);p.pace=p.regularCourses===6?'accelerated':'balanced';p.gpa=p.gpa===''?'':Math.max(0,Math.min(4,Number(p.gpa)||0));
 p.lc=[0,1,2].includes(+p.lc)?+p.lc:0;p.summers=p.summers===true;p.exchange=p.exchange===true;
 p.priorCodes=[...new Set((Array.isArray(p.priorCodes)?p.priorCodes:[]).map(code).filter(c=>DATA.courses[c]))];
 p.choices=p.choices&&typeof p.choices==='object'&&!Array.isArray(p.choices)?{...p.choices}:{};p.secondTrack=['BBA','BSCSC'].includes(p.program)&&p.secondTrack!==p.track&&program.tracks.some(t=>t.id===p.secondTrack)?p.secondTrack:'';p.minor=selectedMinor(p)?.id||'';return p;
}
export function coursesFor(raw=DEFAULT_PROFILE){
 const p=normalizeProfile(raw),program=programFor(p),track=program.tracks.find(t=>t.id===p.track);
 const requirements=withMinor(withSecondFocus(track?[...program.requirements.filter(r=>r.groupId!==track.replacesGroup),...track.requirements]:program.requirements,p),p);
 if(p.program==='BBA')requirements.push({id:'bba-internship-fieldwork',code:'INT4001',title:'Business internship fieldwork',credits:0,category:'Internship',source:DATA.courses.INT4001.source,choice:false,options:[],condition:'The catalogue separates fieldwork and INT4301 assessment; confirm SBA registration against the newer program sheet.'});
 const planned=requirements.map(r=>{
  const selected=code(p.choices[r.id]),topics=(r.allowedOptions||[]).filter(x=>x.id&&x.title&&!x.courseCode),topic=topics.find(x=>code(x.id)===selected),permitted=courseOptions(r,p).some(x=>x.code===selected&&!x.topic);
  const cid=r.choice?(permitted?selected:''):r.code,entry=DATA.courses[cid]||{};
  let rule={all:[],any:[],coreq:[],minCredits:0,review:true,...entry.rule};
  const override=program.overrides?.[cid];if(override)rule={...rule,all:override.all,any:override.any,review:rule.review||override.review};
  if(program.level==='graduate'){
   const inProgram=new Set(requirements.flatMap(x=>[x.code,...(x.options||[])]));
   rule={...rule,minCredits:0,all:rule.all.filter(x=>inProgram.has(x)||p.priorCodes.includes(x))};
   if(rule.any.length&&!rule.any.some(x=>inProgram.has(x)||p.priorCodes.includes(x)))rule.any=[];
   rule.review=true;
  }
  if(cid==='INT4011')rule={...rule,minCredits:72,review:true};
  if(cid==='INT4012')rule={...rule,all:['INT4011'],any:['FRN3210','FRN3310'],review:true};
  if(cid==='INT4302')rule={...rule,all:['INT4012'],review:true};
  if(cid==='INT4301')rule={...rule,all:['INT4001','GBU3203','ACC3201'],minCredits:90,review:true};
  if(cid==='GBU3203')rule={...rule,minCredits:60};
  if(cid==='MGT4301')rule={...rule,all:['INT4301','MGT3301'],finalTerm:true,review:true};
  if(cid==='FYE1101'||cid==='FAS0210')rule={...rule,review:false};
  if(cid==='FYE1102')rule={...rule,all:['FYE1101'],review:false};
  if(r.rule)rule={...rule,...r.rule};
  if(r.conditionalRules?.[cid])rule={...rule,...r.conditionalRules[cid]};
  const schoolRule=businessRule(p.program,cid);if(schoolRule)rule={...rule,...schoolRule};
  if(topic)rule={...rule,all:(topic.prerequisiteCourses||[]).map(code),review:true};
  const credits=r.choice&&cid?(entry.credits??r.credits):r.credits;
  return {...r,offeredTerms:rule.offeredTerms||r.offeredTerms,id:r.id,code:cid,topicId:topic?.id||'',title:topic?`${topic.title} · course code to confirm`:cid?(r.choice?entry.title||cid:r.title):r.title,credits,loadCredits:credits+(r.nonDegreeCredits||0),unresolved:r.choice&&!cid||entry.creditsProvisional===true,rule,prerequisiteText:schoolRule?describeRule(rule):topic?'CSC 4308; exact CSC 41xx registration code requires confirmation.':override?.prerequisiteText||entry.prerequisiteText||'',ruleSource:schoolRule?BUSINESS_SOURCE:override?.source||entry.source||r.source,description:entry.description||'',lab:entry.lab===true,kind:/[Ee]lective|[Mm]inor|[Ss]pecial|[Tt]hematic|[Cc]oncentration/.test(r.category)?'focus':/[Gg]eneral/.test(r.category)?'general':/[Mm]ath|[Ss]cience and/.test(r.category)?'foundation':'core'};
 });
 if(p.minor){const present=new Set([...planned.map(c=>c.code),...p.priorCodes]);for(let i=0;i<planned.length&&planned.length<200;i++){const c=planned[i];if(!c.minorId&&!c.supportingPrerequisite)continue;for(const id of [...c.rule.all,...c.rule.coreq]){const e=DATA.courses[id];if(present.has(id)||!e||+id.slice(3)>=5000)continue;present.add(id);planned.push({id:'support-'+id.toLowerCase(),code:id,title:e.title,credits:e.credits,loadCredits:e.credits,category:'Supporting prerequisite',source:e.source,ruleSource:e.source,prerequisiteText:e.prerequisiteText||'',rule:{all:[],any:[],coreq:[],minCredits:0,review:true,...e.rule},choice:false,options:[],unresolved:e.creditsProvisional===true,kind:'foundation',lab:e.lab===true,supportingPrerequisite:true,condition:`Listed prerequisite for ${c.code||c.title}. This is additional study unless an approved degree elective or equivalency can cover it.`});}}}
 return planned;
}
export function limits(p,summer){if(programFor(p).level==='graduate')return {count:summer?2:4,credits:summer?7:12};const profile=normalizeProfile(p),count=summer?profile.summerCourses:profile.regularCourses;return {count,credits:summer?(count===3?10:7):(count===6?20:17)};}
export const isFieldwork=c=>['EGR4300','INT4001','INT4012'].includes(c.code);
function eligible(c,done,credits,same=[]){const r=c.rule;return r.all.every(x=>done.has(x))&&(!r.any.length||r.any.some(x=>done.has(x)))&&r.coreq.every(x=>done.has(x)||same.includes(x))&&credits>=r.minCredits&&(!r.minProgramCourses||(r.programCourseCodes||[]).filter(x=>done.has(x)).length>=r.minProgramCourses);}
export const termOrder=t=>t.year*3+({Spring:0,Summer:1,Fall:2}[t.season]??0);
export function generatePlan(raw=DEFAULT_PROFILE,scheduling={}){
 const p=normalizeProfile(raw),cs=coursesFor(p),remaining=new Set(cs.map(c=>c.id)),done=new Set(p.priorCodes),terms=[];
 const fixed=scheduling.fixedTerms||[],fixedIds=new Set(fixed.flatMap(t=>t.courses)),offeringReports=normalizeScheduling(scheduling);
 for(const id of fixedIds)remaining.delete(id);
 let earlier=p.priorCodes.reduce((s,id)=>s+(DATA.courses[id]?.credits||0),0),lc=p.lc,regular=0;
 const prior=cs.filter(c=>c.code&&done.has(c.code)&&!fixedIds.has(c.id));if(prior.length){terms.push({id:'prior',season:'Prior',year:p.startYear,courses:prior.map(c=>c.id),exchange:false,lc:false});prior.forEach(c=>remaining.delete(c.id));}
 for(let step=0;step<42&&(remaining.size||fixed.some(t=>!terms.some(x=>x.id===t.id)));step++){
  const season=['Fall','Spring','Summer'][step%3],year=p.startYear+Math.floor((step+2)/3),summer=season==='Summer';
  const fieldworkPending=cs.filter(c=>remaining.has(c.id)&&isFieldwork(c)),internshipYear=p.startYear+3;
  const reserved=summer&&year===internshipYear&&fieldworkPending.length>0;
  const lateInternship=summer&&year>internshipYear&&fieldworkPending.some(c=>eligible(c,done,earlier));
  const internshipOnly=reserved||lateInternship;
  const frozen=fixed.find(t=>t.id===`${season}-${year}`);
  if(summer&&!p.summers&&!internshipOnly&&!frozen)continue;
  const term=frozen?structuredClone(frozen):{id:`${season}-${year}`,season,year,courses:[],exchange:false,lc:false};
  if(scheduling.notBefore&&termOrder(term)<termOrder(scheduling.notBefore)){
   if(lc&&!summer&&!term.courses.length){term.lc=true;lc--;terms.push(term);continue;}
   if(term.courses.length){terms.push(term);for(const id of term.courses){const c=cs.find(c=>c.id===id);if(c?.code)done.add(c.code);earlier+=c?.credits||0;}}
   continue;
  }
  if(internshipOnly)term.internshipOnly=true;
  if(lc){if(summer)continue;term.lc=true;lc--;terms.push(term);continue;}if(!summer)regular++;
 const cap=limits(p,summer);let used=term.courses.reduce((sum,id)=>sum+(cs.find(c=>c.id===id)?.loadCredits||0),0),count=term.courses.filter(id=>cs.find(c=>c.id===id)?.loadCredits>0).length;
  const finals=cs.filter(c=>remaining.has(c.id)&&(c.rule.finalTerm||['GBU4101','MGT4301'].includes(c.code))).map(c=>c.id);
  const sorted=cs.filter(c=>remaining.has(c.id)).sort((a,b)=>{const score=c=>cs.filter(x=>x.rule.all.includes(c.code)||x.rule.any.includes(c.code)||x.rule.coreq.includes(c.code)).length*8-(c.recommendedSemester||5)*2+(c.code==='FAS0210'?100:0)+(/^FYE110[12]$/.test(c.code)?90:0)+(courseAvailability(c.code,term.id,offeringReports).status==='reported-offered'?60:0);return score(b)-score(a);});
  for(const c of sorted){
   if(!courseAvailability(c.code,term.id,offeringReports).allowed)continue;
   if(isFieldwork(c)&&(!summer||year<internshipYear)||internshipOnly&&!isFieldwork(c))continue;
   if(term.courses.includes(c.id)||c.rule.finalTerm&&summer)continue;
   if(finals.includes(c.id)&&(remaining.size>cap.count||cs.filter(x=>remaining.has(x.id)).reduce((n,x)=>n+x.loadCredits,0)>cap.credits))continue;
   if(c.offeredTerms&&!c.offeredTerms.includes(season))continue;
   if(c.rule.previousId&&!terms.at(-1)?.courses.includes(c.rule.previousId))continue;
   if(c.rule.previousSeason&&(terms.at(-1)?.season!==c.rule.previousSeason||terms.at(-1)?.year!==year))continue;
   const bundle=[c];for(let i=0;i<bundle.length;i++)for(const x of cs.filter(x=>remaining.has(x.id)&&bundle[i].rule.coreq.includes(x.code)&&!term.courses.includes(x.id)))if(!bundle.some(y=>y.id===x.id))bundle.push(x);
   const same=[...term.courses.map(id=>cs.find(x=>x.id===id).code),...bundle.map(x=>x.code)];
   if(bundle.some(x=>!eligible(x,done,earlier,same)||!courseAvailability(x.code,term.id,offeringReports).allowed||x.offeredTerms&&!x.offeredTerms.includes(season)||isFieldwork(x)&&(!summer||year<internshipYear)||internshipOnly&&!isFieldwork(x)||x.rule.finalTerm&&summer||x.rule.previousId&&!terms.at(-1)?.courses.includes(x.rule.previousId)||x.rule.previousSeason&&(terms.at(-1)?.season!==x.rule.previousSeason||terms.at(-1)?.year!==year)))continue;
   const load=bundle.reduce((n,x)=>n+x.loadCredits,0),n=bundle.filter(x=>x.loadCredits>0).length;
   if(count+n>cap.count||used+load>cap.credits)continue;
   if(summer&&[...term.courses.map(id=>cs.find(x=>x.id===id)),...bundle].filter(x=>x.lab).length>1)continue;
   term.courses.push(...bundle.map(x=>x.id));used+=load;count+=n;
  }
  if(!term.courses.length&&!reserved)continue;
  if(p.exchange&&!summer&&regular>=5&&!terms.some(t=>t.exchange))term.exchange=true;
  terms.push(term);for(const id of term.courses){const c=cs.find(c=>c.id===id);remaining.delete(id);if(c.code)done.add(c.code);earlier+=c.credits;}
 }
 const finalCourses=cs.filter(c=>!remaining.has(c.id)&&!fixedIds.has(c.id)&&(c.rule.finalTerm||['GBU4101','MGT4301'].includes(c.code))&&!prior.some(x=>x.id===c.id));
 if(finalCourses.length){
  const lastOriginal=terms.filter(t=>t.courses.some(id=>finalCourses.some(c=>c.id===id))).at(-1);
  for(const t of terms)t.courses=t.courses.filter(id=>!finalCourses.some(c=>c.id===id));
  let last=terms.filter(t=>t.id!=='prior'&&!t.lc&&t.courses.length).at(-1);
  const cap=limits(p,false);
  if(lastOriginal&&(!last||terms.indexOf(last)<terms.indexOf(lastOriginal)))last=lastOriginal;
  const fits=t=>{if(!t||t.season==='Summer'||t.lc||finalCourses.some(c=>!courseAvailability(c.code,t.id,offeringReports).allowed||c.offeredTerms&&!c.offeredTerms.includes(t.season)))return false;const load=t.courses.map(id=>cs.find(c=>c.id===id));return [...load,...finalCourses].filter(c=>c.loadCredits>0).length<=cap.count&&[...load,...finalCourses].reduce((n,c)=>n+c.loadCredits,0)<=cap.credits;};
  if(!fits(last)){
   let cursor=last||{season:'Spring',year:p.startYear};last=null;
   for(let attempt=0;attempt<42;attempt++){const season=cursor.season==='Fall'?'Spring':'Fall',year=cursor.year+(cursor.season==='Fall'?1:0);cursor={id:`${season}-${year}`,season,year,courses:[],exchange:false,lc:false};const existing=terms.find(t=>t.id===cursor.id);if(fits(existing||cursor)){last=existing||cursor;if(!existing)terms.push(last);break;}}
  }
  if(last)last.courses.push(...finalCourses.map(c=>c.id));else finalCourses.forEach(c=>remaining.add(c.id));
 }
 if(remaining.size)terms.push({id:'pending',season:'Pending',year:0,courses:[...remaining],exchange:false,lc:false});return terms.filter(t=>t.courses.length||t.lc||t.internshipOnly);
}
export function validatePlan(terms,cs,raw,scheduling={}){
 const p=normalizeProfile(raw),program=programFor(p),map=new Map(cs.map(c=>[c.id,c])),seen=new Set(),done=new Set(p.priorCodes),issues=[];
 let earlier=p.priorCodes.reduce((s,id)=>s+(DATA.courses[id]?.credits||0),0),taken=new Set(p.priorCodes);
 const add=(text,level='conflict',id='')=>issues.push({text,level,id}),final=terms.filter(t=>!['pending','prior'].includes(t.id)&&t.season!=='Summer'&&t.courses.length).at(-1)?.id;
 for(const [index,t] of terms.entries()){
  const list=t.courses.map(id=>map.get(id)).filter(Boolean),cap=limits(p,t.season==='Summer'),term=label(t);
  for(const c of list){if(seen.has(c.id))add(`${c.title} appears more than once.`);seen.add(c.id);}if(t.id==='prior')continue;
  if(t.id==='pending'){add(`${list.length} requirements need manual placement. Open a course to inspect its prerequisites.`);continue;}
  if(program.level==='undergraduate'&&t.season==='Summer'&&t.year===p.startYear+3&&cs.some(c=>isFieldwork(c)&&!p.priorCodes.includes(c.code))&&list.some(c=>!isFieldwork(c)))add(`${term} is reserved for internship fieldwork. Move other courses to another term.`);
  if(t.internshipOnly&&!list.some(isFieldwork))add(`${term}: internship fieldwork is reserved, but prerequisites or language qualification are still missing.`,'review');
  if(list.filter(c=>c.loadCredits>0).length>cap.count||list.reduce((s,c)=>s+c.loadCredits,0)>cap.credits)add(`${term}: load exceeds ${cap.count} courses / ${cap.credits} credits.`);
  if(t.lc&&list.length)add(`${term}: degree courses overlap the selected language-center buffer.`);
  if(t.season==='Summer'&&list.filter(c=>c.lab).length>1)add(`${term}: more than one laboratory course needs a separate eligibility review.`);
  for(const c of list){
   if(!courseAvailability(c.code,t.id,scheduling).allowed)add(`${c.code||c.title} in ${term}: ${courseAvailability(c.code,t.id,scheduling).reason}`,'conflict',c.id);
   if(c.code&&taken.has(c.code)&&!c.repeatable)add(`${c.code} is counted twice. Choose a distinct course for this requirement.`,'conflict',c.id);
   const missing=c.rule.all.filter(x=>!done.has(x));if(missing.length)add(`${c.code||c.title} in ${term}: complete ${missing.join(', ')} first.`,'conflict',c.id);
   if(c.rule.any.length&&!c.rule.any.some(x=>done.has(x)))add(`${c.code||c.title} in ${term}: needs one of ${c.rule.any.join(' / ')} in an earlier term.`,'conflict',c.id);
   const coreq=c.rule.coreq.filter(x=>!done.has(x)&&!list.some(q=>q.code===x));if(coreq.length)add(`${c.code} in ${term}: ${coreq.join(', ')} must be taken earlier or together.`,'conflict',c.id);
   if(earlier<c.rule.minCredits)add(`${c.code||c.title} in ${term}: needs ${c.rule.minCredits} earlier credits.`,'conflict',c.id);
   if(c.rule.minProgramCourses&&(c.rule.programCourseCodes||[]).filter(x=>done.has(x)).length<c.rule.minProgramCourses)add(`${c.title}: complete at least ${c.rule.minProgramCourses} program courses first.`,'conflict',c.id);
   if((c.rule.finalTerm||['GBU4101','MGT4301'].includes(c.code))&&t.id!==final)add(`${c.code} belongs in the last regular semester.`,'conflict',c.id);
   if(c.rule.previousId&&!terms[index-1]?.courses.includes(c.rule.previousId))add(`${c.title} must immediately follow its first registration term.`,'conflict',c.id);
   if(c.rule.previousSeason&&(terms[index-1]?.season!==c.rule.previousSeason||terms[index-1]?.year!==t.year))add(`${c.title} must follow Thesis I in the same year's summer.`,'conflict',c.id);
   if(c.offeredTerms&&!c.offeredTerms.includes(t.season))add(`${c.title}: the source-based sequence places this requirement in ${c.offeredTerms.join(' / ')}.`,'conflict',c.id);
   if(t.exchange&&(program.level==='graduate'&&/thesis/i.test(c.title)||['GBU3302','GBU3203','GBU4101','MGT4301'].includes(c.code)))add(`${c.code||c.title}: the supplied program requires this at AUI.`,'conflict',c.id);
   if(c.code)taken.add(c.code);
  }
  for(const c of list){if(c.code)done.add(c.code);earlier+=c.credits;}
 }
 for(const c of cs)if(!seen.has(c.id))add(`${c.title} is missing from the plan.`,'conflict',c.id);
 const topicIds=cs.filter(c=>c.topicId).map(c=>c.topicId);if(new Set(topicIds).size!==topicIds.length)add('Cybersecurity topic choices must be distinct.');
 const minor=selectedMinor(p);if(minor){for(const x of minor.conflicts||[])add(`${minor.name}: ${x.text}`,'source');for(const r of minor.overlapRules||[])if(r.action==='mutually-exclusive'&&r.courses.filter(id=>cs.some(c=>c.code===id)).length>1)add(`${minor.name}: ${r.courses.join(' / ')} cannot both count. See the minor source.`);const mcs=cs.filter(c=>c.minorId),mc=creditsOf(mcs);if(mc<minor.credits.min||mc>minor.credits.max)add(`${minor.name}: selected entries total ${mc} credits; the source states ${minor.credits.min}–${minor.credits.max}. Confirm options and source differences.`,'review');for(const c of mcs.filter(c=>c.replacementFor||c.approvalRequired))add(c.condition,'review',c.id);}
 const unresolved=cs.filter(c=>c.unresolved);if(unresolved.length)add(`${unresolved.length} requirement choices still need a course or an approved equivalent. Their displayed credits are provisional.`,'review');
 const supporting=cs.filter(c=>c.supportingPrerequisite);if(supporting.length)add(`${supporting.length} supporting prerequisite courses add ${creditsOf(supporting)} credits to this draft. Review whether approved elective slots or previous equivalencies can cover them; they are not additional minor credits.`,'review');
 const partial=cs.filter(c=>!c.unresolved&&c.rule.review);if(partial.length)add(`${partial.length} courses have placement, permission, foundation, or other conditions to review in their source text.`,'review');
 if((p.regularCourses===6||p.summers&&p.summerCourses===3)&&program.level==='undergraduate'&&(p.gpa===''||p.gpa<3))add(`This proposal targets up to ${p.regularCourses} courses per regular semester${p.summers?' and '+p.summerCourses+' per summer session':''}. CGPA ≥3.0 and good standing, or specific applicable permission, must be confirmed for the heavier load before registration.`,p.gpa===''?'review':'conflict');
 const internshipTerm=terms.find(t=>t.id!=='prior'&&t.courses.some(id=>isFieldwork(map.get(id)||{})));
 if(program.level==='undergraduate'&&internshipTerm&&internshipTerm.id!=='pending'&&(internshipTerm.season!=='Summer'||internshipTerm.year!==p.startYear+3))add('The internship falls outside the third-year summer target because the current sequence or completed work needs review.','review');
 const ending=terms.filter(t=>!['prior','pending'].includes(t.id)&&t.courses.length).at(-1);
 if(program.level==='undergraduate'&&ending&&(ending.year>p.startYear+4||ending.year===p.startYear+4&&ending.season!=='Spring'))add('The current course choices extend beyond the four-year target. Review additional prerequisites, language placement and elective choices before shortening the plan.','review');
 if(p.exchange)add('Exchange is a target only: host availability and course equivalencies still need approval.','review');
 if(program.level==='graduate')add('This graduate proposal assumes admission and any assigned undergraduate foundations are completed. External foundation prerequisites are not scheduled automatically. Confirm eligibility with the coordinator.','review');
 for(const c of program.conflicts||[])add(`${c.field||'Source difference'}: ${c.details||c.text||c.description||JSON.stringify(c)}`,'source');
 const total=creditsOf(cs);if(total<program.degreeCredits.min||total>program.degreeCredits.max)add(`Selected entries total ${total} credits; the published degree range is ${program.degreeCredits.min}–${program.degreeCredits.max}. Review source differences and choices.`,'source');return issues;
}
export function moveCourse(terms,id,destination){if(!terms.some(t=>t.id===destination)||!terms.some(t=>t.courses.includes(id))||destination==='prior')throw Error('Choose a listed semester.');return terms.map(t=>({...t,courses:[...t.courses.filter(c=>c!==id),...(t.id===destination?[id]:[])]}));}
export function restoreState(raw){
 if(raw?.version!==2||raw.dataVersion!==DATA.version)throw Error('The saved data version has changed.');
 const profile=normalizeProfile(raw.profile),cs=coursesFor(profile),ids=new Set(cs.map(c=>c.id));if(!Array.isArray(raw.terms)||raw.terms.length>50)throw Error('Invalid saved plan.');
 const seen=new Set(),termIds=new Set();let order=-Infinity;
 const terms=raw.terms.map(t=>{if(!Array.isArray(t.courses)||termIds.has(t.id))throw Error('Invalid semester.');termIds.add(t.id);if(!['prior','pending'].includes(t.id)){const n=t.year*3+({Spring:0,Summer:1,Fall:2}[t.season]??NaN);if(!Number.isFinite(n)||n<=order||t.id!==`${t.season}-${t.year}`)throw Error('Invalid semester order.');order=n;}for(const id of t.courses){if(!ids.has(id)||seen.has(id))throw Error('Invalid course list.');seen.add(id);}return {id:t.id,season:t.season,year:t.year,courses:t.courses,exchange:t.exchange===true,lc:t.lc===true,...(t.internshipOnly?{internshipOnly:true}:{})};});
 if(seen.size!==ids.size)throw Error('Incomplete saved plan.');return {version:2,dataVersion:DATA.version,profile,terms,completed:Array.isArray(raw.completed)?raw.completed.filter(id=>ids.has(id)&&!cs.find(c=>c.id===id).unresolved):[]};
}
