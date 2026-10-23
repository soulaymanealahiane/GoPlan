// Program-specific corrections take precedence over generic course descriptions.
// Keep the original catalogue record intact for other curricula.
export const COURSE_RULE_CORRECTIONS=[{
 id:'bsems-egr3304-2026-10',program:'BSEMS',courseCode:'EGR3304',
 rule:{all:['CHE1402'],any:[],coreq:[],minCredits:0,review:false},
 source:{kind:'program-sheet',file:'ems.pdf',page:1,edition:'2023–2025'},
 reviewedAt:'2026-10-23',
 basis:'BSEMS sequence arrow from CHE1402, confirmed against the AUI portal by the project owner.',
 supersedes:'The generic catalogue p234 EGR2412 corequisite does not apply to this BSEMS rule.'
}];
const correctionFor=(profile,code)=>COURSE_RULE_CORRECTIONS.find(c=>c.program===profile?.program&&c.courseCode===code);
export function correctedCourse(profile,course){
 const correction=correctionFor(profile,course.code);if(!correction)return course;
 const prerequisiteText=correction.rule.all.join(' + ');
 return {...course,rule:structuredClone(correction.rule),prerequisiteText,ruleSource:{...correction.source},academicCorrectionId:correction.id,
  description:String(course.description||'').replace(/Prerequisites?:[^\n]*(?:\n|$)/gi,'Prerequisite: '+prerequisiteText+'\n').replace(/Corequisites?:[^\n]*(?:\n|$)/gi,'')};
}
export function applyAcademicCorrections(data){
 data.version='aui-2025-26-r6-bsems-materials';
 for(const correction of COURSE_RULE_CORRECTIONS){
  const program=data.programs.find(p=>p.id===correction.program);if(!program)continue;
  const resolved=correctedCourse({program:program.id},{...data.courses[correction.courseCode],code:correction.courseCode});
  program.overrides||={};program.overrides[correction.courseCode]={...correction.rule,source:{...correction.source},description:resolved.description,correctionId:correction.id};
 }
}
// Refresh rule metadata only. Never rebuild semesters, discard progress, remove
// courses, or change a student's elective choices when opening an older plan.
export function refreshAcademicCorrections(plan){
 let changed=false;
 plan.courses=plan.courses.map(course=>{const resolved=correctedCourse(plan.profile,course);if(JSON.stringify(resolved)!==JSON.stringify(course))changed=true;return resolved;});
 if(changed){plan.dataVersion='aui-2025-26-r6-bsems-materials';if(plan.decisions)plan.decisions.agentStamps={};}
 return changed;
}
