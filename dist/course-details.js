import {coursesFor,DATA} from './planner.js';

export function currentCourse(course,profile){
 const fresh=coursesFor(profile).find(c=>c.id===course.id&&c.code===course.code);
 return fresh?{...course,title:fresh.title,rule:fresh.rule,prerequisiteText:fresh.prerequisiteText,ruleSource:fresh.ruleSource,condition:fresh.condition,source:fresh.source}:course;
}
export function courseDetailFacts(course,profile){
 const c=currentCourse(course,profile),r=c.rule||{},facts=[];
 if(r.all?.length)facts.push({label:'Complete first',text:r.all.join(' + ')});
 if(r.any?.length)facts.push({label:'One of these first',text:r.any.join(' or ')});
 if(r.coreq?.length)facts.push({label:'Before or alongside',text:r.coreq.join(' + ')});
 if(r.minCredits)facts.push({label:'Credits completed first',text:String(r.minCredits)});
 if(r.finalTerm)facts.push({label:'When to take it',text:'Your final regular semester'});
 if(c.nonDegreeCredits)facts.push({label:'Non-degree credits',text:String(c.nonDegreeCredits)});
 if(c.waiver)facts.push({label:'Waiver',text:c.waiver});
 if(c.placementRules)facts.push({label:'Placement',text:'Choose the Arabic course for your school background and placement result.'});
 else if(c.approvalOnly||c.approvalRequired)facts.push({label:'Course selection',text:'A school-approved course is required for this slot.'});
 else if(c.condition&&!/catalog|source[- ]|not extracted|listed prerequisite|confirm.*description|GoPlan checks/i.test(c.condition))facts.push({label:'Requirement',text:c.condition});
 // Free-text catalog descriptions can contain conflicting prerequisites. Show
 // structured, resolved facts only; an empty facts list needs no filler message.
 const programSheet=/program.sheet|course.sequence/i.test(c.ruleSource?.file||c.ruleSource?.filename||'');
 return {course:c,facts,source:programSheet?{label:'Program sheet',page:c.ruleSource.page||c.ruleSource.pdfPage}:null};
}
