// Preserve every course option and academic constraint while avoiding repeated
// option lists and empty prerequisite defaults in paid course-selection prompts.
const compactRule=rule=>Object.fromEntries(Object.entries(rule||{}).filter(([key,value])=>
 !(['all','any','coreq'].includes(key)&&Array.isArray(value)&&!value.length)&&
 !(key==='minCredits'&&value===0)&&!(key==='review'&&value===false)
));
export function compactCourseContext(context){
 const optionSets={},known=new Map();
 const requirements=context.requirements.map(requirement=>{
  const {options,...rest}=requirement;
  if(!options.length)return {...rest,options:[]};
  const key=JSON.stringify(options);let id=known.get(key);
  if(!id){id='options-'+(known.size+1);known.set(key,id);optionSets[id]=options;}
  return {...rest,optionsId:id};
 });
 const {request,companies,exchangeDestinations,...academic}=context;
 return {...academic,requirements,optionSets,
  catalogFields:['code','title','credits','prerequisites','topic'],
  catalog:context.catalog.map(course=>[course.code,course.title,course.credits,compactRule(course.prerequisites),course.topic]),
  requiredCourses:context.requiredCourses.map(({prerequisites,...course})=>({...course,prerequisites:compactRule(prerequisites)})),
  optionPolicy:'A requirement with optionsId uses the exact course-code list in optionSets[optionsId]. Empty options means no AI-selectable course. Each catalog row follows catalogFields in order. All listed codes remain candidates; omitted empty prerequisite fields mean no constraint of that type. Server academic validation remains authoritative.'
 };
}
