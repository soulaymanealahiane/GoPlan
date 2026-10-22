import {DATA,normalizeProfile,coursesFor,fitDegreePrerequisites,termOrder} from '../dist/planner.js';
import {eligibleMinors,suggestChoices,tagsForText,preferenceWeights} from '../dist/guidance.js';
import {courseOptions} from '../dist/course-options.js';
import {prerequisiteCoverage} from '../dist/course-eligibility.js';
import {academicChanges} from '../dist/edit-updates.js';
import {AXES} from '../dist/evidence.js';
import {isFreeSlot} from '../dist/prerequisite-slots.js';
import {checkedMinorPlan} from '../dist/minor-plan.js';

const words=s=>String(s||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const edit=/\b(?:change|switch|replace|swap|set|add|remove|drop|choose|select|recommend|suggest|find|identify|pick|implement|apply|rebuild|redo|reorder|rerank|rebalance|move|reduce|increase|make|update|use|want|prefer)\b/i;
const readOnly=/^(?:why|how (?:many|much|do|can|would|should)|what (?:are|is|does|do)|explain|describe|tell me (?:why|about)|should i|would it|is it)\b/i;
const clauses=s=>String(s||'').split(/[.;\n]|\band\s+(?=(?:please\s+)?(?:change|switch|replace|set|add|remove|drop|choose|select|recommend|rebuild|keep|preserve|retain|leave)\b)|\b(?:while|but|additional detail|follow-up|latest request)\s*:?/i).map(x=>x.trim()).filter(Boolean);
const changedClauses=s=>clauses(s).filter(c=>edit.test(c)&&!/^\s*(?:keep|preserve|retain|do not|dont|don't|leave .*unchanged)\b/i.test(c));
const roles={minor:'minor',secondTrack:'(?:second|secondary) (?:focus|specialization|specialisation|concentration|track)',track:'(?<!second )(?<!secondary )(?:primary (?:focus|specialization|specialisation|concentration|track)|specialization|specialisation|concentration|focus|track|major)',program:'(?:degree|program|programme|major)'};
const aliases=(entry,type)=>[entry.id,entry.name,...(type==='program'?[entry.name.replace(/^(?:Bachelor|Master) of (?:Science|Arts|Business Administration)(?: in )?/i,'').trim(),...(entry.id==='BBA'?['business administration']:[])]:[]),...(entry.id==='mathematics'?['math','maths']:[])].map(words).filter(Boolean);
function named(phrase,entries,type){
 const value=' '+words(phrase)+' ',matches=entries.flatMap(entry=>aliases(entry,type).filter(alias=>value.includes(' '+alias+' ')).map(alias=>({entry,length:alias.length,index:value.lastIndexOf(' '+alias+' ')}))).sort((a,b)=>b.length-a.length||b.index-a.index);
 return matches[0]?.entry;
}
function labelFor(text,role){
 let found;
 for(const c of changedClauses(text)){
  const forward=new RegExp('(?:'+roles[role]+')\\s*(?:from\\b.+?\\s+)?(?:to|into|with|as)\\s+(.+)$','i').exec(c);
  const assigning=new RegExp('(?:add|choose|select|use|want|prefer)\\s+(?:a |an |the |my )?(.+?)\\s+(?:as (?:my |the )?)?(?:'+roles[role]+')\\b','i').exec(c);
  const setting=new RegExp('(?:set|make)\\s+(?:my |the |a )?(?:'+roles[role]+')\\s+(?:to )?(.+)$','i').exec(c);
  if(forward||assigning||setting)found=(forward||assigning||setting)[1];
  else if(new RegExp('\\b(?:remove|drop)\\s+(?:my |the |a )?(?:'+roles[role]+')\\b','i').test(c))found='';
 }
 return found===undefined?undefined:found.replace(/(?:,|\band)\s*(?:(?:then |also )?(?:change|switch|replace|add|remove|keep|preserve)\b|(?:my|the)\s+(?:degree|major|minor|focus|specialization|concentration)\b).*$/i,'').trim();
}
export function requestedEdit(text){
 const active=changedClauses(text),isEdit=active.length>0&&!readOnly.test(String(text).trim()),sections=[];
 if(isEdit){const value=active.join(' ');for(const [section,pattern] of Object.entries({direction:/\b(?:degree|major|program|programme|minor|speciali[sz]ation|concentration|focus|second track)\b/i,courses:/\b(?:electives?|course choices|course assignments|distribution of courses)\b/i,companies:/\b(?:compan(?:y|ies)|internships?|startups?|firms?|employers?)\b/i,exchanges:/\b(?:exchanges?|destinations?|study abroad|universities)\b/i,semesters:/\b(?:semesters?|summers?|course load|workload|sequence|break|move .*courses?)\b/i}))if(pattern.test(value))sections.push(section);}
 return {isEdit,sections};
}
// A routing model may interpret flexible language, but it cannot turn an
// imperative edit into chat or discard a requested section.
export function enforceEditRoute(result,text){
 const intent=requestedEdit(text);if(!intent.isEdit||!intent.sections.length)return result;
 const misrouted=['answer','clarify'].includes(result.kind),sections=[...new Set([...(misrouted?[]:result.sections||[]),...intent.sections])],instructions={...Object.fromEntries(['direction','courses','companies','exchanges','semesters'].map(s=>[s,''])),...result.instructions};
 for(const s of sections)if(!instructions[s]||['answer','clarify'].includes(result.kind))instructions[s]=text;
 return {...result,kind:sections.length===1&&sections[0]==='semesters'&&result.kind==='schedule'?'schedule':'journey',startStep:sections.includes('direction')?2:sections.includes('courses')?3:sections.some(s=>['companies','exchanges'].includes(s))?4:5,summary:'Preparing your requested roadmap changes.',questions:[],sections,instructions,rebuild:!misrouted&&result.rebuild===true,questionnaireChanges:misrouted?[]:result.questionnaireChanges||[]};
}
function compatible(profile,raw){
 const p=normalizeProfile({...profile,...raw,choices:{}}),rows=coursesFor(p),choices={};
 for(const [id,code]of Object.entries(profile.choices||{})){const c=rows.find(c=>c.id===id);if(c?.choice&&courseOptions(c,p).some(o=>o.code===code))choices[id]=code;}
 return normalizeProfile({...p,choices});
}
export function minorEditOption(profile,minor,studentContext,{releaseFree=false,interests=[],questionnaire={},questionnaireRankings={}}={}){
 let candidate=compatible(profile,{minor}),protectedCodes=new Set((studentContext?.records||[]).filter(r=>['completed','in-progress'].includes(r.status)).map(r=>r.courseCode));
 if(releaseFree){const choices={...candidate.choices};for(const c of coursesFor(candidate))if(isFreeSlot(c)&&!protectedCodes.has(c.code)&&!candidate.priorCodes.includes(c.code))delete choices[c.id];candidate=normalizeProfile({...candidate,choices});}
 const protectedIds=coursesFor(candidate).filter(c=>protectedCodes.has(c.code)).map(c=>c.id);
 candidate=fitDegreePrerequisites(candidate,{protectedIds}).profile;for(let pass=0;pass<3;pass++){const before=JSON.stringify(candidate.choices);candidate=suggestChoices({profile:candidate,protectedChoices:Object.fromEntries(coursesFor(candidate).filter(c=>protectedIds.includes(c.id)).map(c=>[c.id,c.code])),interests,questionnaire,questionnaireRankings}).profile;if(JSON.stringify(candidate.choices)===before)break;}
 const courses=coursesFor(candidate),coverage=prerequisiteCoverage(courses,candidate.priorCodes),minorRows=courses.filter(c=>c.minorId===minor),issues=coverage.issues.filter(i=>minorRows.some(c=>c.id===i.id)),approval=minorRows.filter(c=>c.approvalOnly||c.approvalRequired),selected=eligibleMinors(candidate).find(m=>m.id===minor);
 const recipe={academic:Object.fromEntries(['program','track','secondTrack','minor'].map(k=>[k,candidate[k]||''])),choices:candidate.choices};let verified=false,fitReason='',finishOrder=Infinity;try{const checked=checkedMinorPlan(candidate,recipe,{protectedCodes:[...protectedCodes]}),last=checked.terms.filter(t=>!['prior','pending'].includes(t.id)&&t.courses.length).at(-1);finishOrder=last?termOrder(last):Infinity;verified=true;}catch(error){fitReason=error.message;}
 const original=coursesFor(profile),extraCourseCount=Math.max(0,courses.length-original.length),extraCredits=Math.max(0,courses.reduce((n,c)=>n+c.credits,0)-original.reduce((n,c)=>n+c.credits,0));
 return {id:minor,name:selected?.name||minor,source:selected?.source,profile:candidate,coursePlan:recipe,verified,fitReason,extraCourseCount,extraCredits,finishOrder,preferenceScore:[...new Set([...(selected?.tags||[]),...tagsForText(selected?.name)])].reduce((sum,t)=>sum+(preferenceWeights({interests,questionnaire,questionnaireRankings})[t]||0),0),requiredCourses:minorRows.map(c=>({id:c.id,code:c.code,title:c.title,credits:c.credits,approvalRequired:!!(c.approvalOnly||c.approvalRequired),prerequisites:c.rule})),missingPrerequisites:issues.map(i=>i.message),approvalSlots:approval.length,prerequisiteAllocations:courses.filter(c=>c.prerequisiteFor?.length).map(c=>({requirementId:c.id,courseCode:c.code,requiredBy:c.prerequisiteFor})),noSupplementaryCourses:issues.length===0&&!minorRows.some(c=>!c.code&&!c.approvalOnly&&!c.approvalRequired)};
}
export function academicEdit(text,profile,studentContext,questionnaire={},questionnaireRankings={}){
 if(!requestedEdit(text).isEdit)return {patch:{},options:[],editableFields:[]};
 const patch={},switchTarget=changedClauses(text).map(c=>/\bswitch\s+(?:from\s+.+?\s+)?to\s+([^,;.]+?)(?=\s+and\s+|$)/i.exec(c)?.[1]).filter(Boolean).at(-1),programLabel=labelFor(text,'program')??switchTarget,focusLabel=labelFor(text,'track'),secondLabel=labelFor(text,'secondTrack');let minorLabel=labelFor(text,'minor');
 const programs=DATA.programs.filter(p=>p.level===DATA.programs.find(p=>p.id===profile.program)?.level),program=programLabel!==undefined?named(programLabel,programs,'program'):null;
 if(program)patch.program=program.id;
 const targetProgram=DATA.programs.find(p=>p.id===(patch.program||profile.program));
 // A major can name either a degree or a specialization within that degree.
 const track=focusLabel!==undefined||programLabel!==undefined?named(focusLabel??programLabel,targetProgram.tracks,'track'):null;
 if(track)patch.track=track.id;
 if(secondLabel==='')patch.secondTrack='';else if(secondLabel!==undefined){const second=named(secondLabel,targetProgram.tracks,'track');if(second&&['BBA','BSCSC'].includes(targetProgram.id))patch.secondTrack=second.id;}
 const candidate=compatible(profile,patch),available=eligibleMinors(candidate);
 if(minorLabel===undefined){const value=' '+words(changedClauses(text).join(' '))+' ',literal=available.flatMap(m=>aliases(m,'minor').filter(alias=>value.includes(' '+alias+' minor ')).map(alias=>({id:m.id,alias}))).sort((a,b)=>b.alias.length-a.alias.length)[0];if(literal)minorLabel=literal.alias;}
 if(minorLabel==='')patch.minor='';else if(minorLabel!==undefined){const minor=named(minorLabel,available,'minor');if(minor)patch.minor=minor.id;}
 // Every request to recommend an unspecified minor gets an actual curriculum
 // comparison. This must not depend on one spelling of "extra prerequisite".
 const compare=requestedEdit(text).sections.includes('direction')&&changedClauses(text).some(clause=>/\bminor\b/i.test(clause));
 let options=[];
 const unknownNamedMinor=minorLabel&&/\bminor\s+(?:to|into|as)\s+/i.test(text)&&!/^(?:a |an |another |different |one |minor |that |which |best|most |suitable |compatible |no |without |avoid |fit |require )/i.test(minorLabel);
 const broadRebuild=/\b(?:rebuild|rethink|redo)\b[^.;\n]{0,70}\b(?:whole|entire|roadmap|degree)\b/i.test(text)&&!patch.program;
 if(compare&&patch.minor===undefined&&!unknownNamedMinor&&!broadRebuild){
  const weights=preferenceWeights({questionnaire,questionnaireRankings}),interests=Object.keys(weights).sort((a,b)=>weights[b]-weights[a]);
  options=available.filter(m=>m.id!==profile.minor&&!['individual-minor'].includes(m.id)).map(m=>{let option=minorEditOption(candidate,m.id,studentContext,{interests,questionnaire,questionnaireRankings});if(!option.verified){const freed=minorEditOption(candidate,m.id,studentContext,{interests,questionnaire,questionnaireRankings,releaseFree:true});if(freed.verified)option=freed;}return option;}).sort((a,b)=>Number(b.verified)-Number(a.verified)||a.extraCourseCount-b.extraCourseCount||a.extraCredits-b.extraCredits||b.preferenceScore-a.preferenceScore||a.finishOrder-b.finishOrder||a.approvalSlots-b.approvalSlots||a.prerequisiteAllocations.length-b.prerequisiteAllocations.length||a.id.localeCompare(b.id));
  const best=options.find(m=>m.verified);if(best)patch.minor=best.id;
 }
 if(patch.minor&&!options.some(m=>m.id===patch.minor))options.unshift(minorEditOption(candidate,patch.minor,studentContext));
 const value=changedClauses(text).join(' '),labels={program:programLabel,minor:minorLabel,track:focusLabel,secondTrack:secondLabel},editableFields=Object.keys(labels).filter(k=>labels[k]!==undefined);if(/\b(?:add|change|switch|remove|drop)\b.*\bsecond\b/i.test(value)&&!editableFields.includes('secondTrack'))editableFields.push('secondTrack');
 return {patch,options,editableFields,compared:compare&&minorLabel===undefined||compare&&patch.minor!==undefined&&options.length>1};
}
export function applyAcademicEdit(parsed,request,edit){
 if(!Object.keys(edit.patch).length)return parsed;
 const before=normalizeProfile(request.profile),requestedModelFields=Object.fromEntries((edit.editableFields||[]).filter(k=>typeof parsed.academic?.[k]==='string').map(k=>[k,parsed.academic[k]])),patch={...edit.patch};
 const leastBurden=edit.options.find(m=>m.verified);
 if(edit.compared&&edit.options.some(m=>m.id===parsed.academic?.minor&&m.id!==before.minor&&m.verified&&m.extraCourseCount<=leastBurden.extraCourseCount&&m.extraCredits<=leastBurden.extraCredits))patch.minor=parsed.academic.minor;
 const after=compatible(before,{...requestedModelFields,...patch}),changes=academicChanges(before,after),option=edit.options.find(m=>m.id===after.minor),limitations=[];
 if(option?.approvalSlots)limitations.push(`${option.name}: ${option.approvalSlots} course slot${option.approvalSlots===1?' needs':'s need'} school approval and ${option.approvalSlots===1?'remains':'remain'} open in the draft.`);
 if(option?.missingPrerequisites.length)limitations.push('This minor is selected for review; some prerequisites still need a place within existing elective slots. No extra course was added.');
 if(edit.compared&&option?.noSupplementaryCourses)limitations.push('Known prerequisites fit within the existing degree slots; no supplementary course was added.');
 if(!changes.length)limitations.push('These academic choices are already selected.');
 const summary=changes.slice(0,2).join(' ')||'Your requested academic choices are already selected.',rationale='Applied your requested academic choices using the stored AUI curriculum.';
 return {kind:'recommend',summary,themes:[],questions:[],academic:{...Object.fromEntries(['program','track','secondTrack','minor'].map(k=>[k,after[k]])),rationale,focusRationale:rationale,secondFocusRationale:rationale,minorRationale:option?.approvalSlots?'Selected as a draft; the listed approval requirements remain open.':rationale},...(edit.compared&&option?.verified?{coursePlan:option.coursePlan}:{}),tradeoffs:limitations,assessment:Object.keys(AXES).map(axis=>({axis,explanation:axis==='academicFit'?'Uses the stored curriculum; listed approval conditions remain unresolved.':'This edit follows your explicit selection rather than a new career recommendation.',answerIds:[],evidenceIds:[]})),intent:'update',answer:'',update:{summary,changes,limitations}};
}
