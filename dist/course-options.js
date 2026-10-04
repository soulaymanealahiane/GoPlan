import DATA from './academic-data.js';
export const needsPersonalConfirmation=c=>!!c.placementRules||/(?:^|-)(?:arabic|french|civic|language)(?:-|$)/i.test(c.id)||(!c.code&&/^(?:Arabic|French|Language Center|Civic Engagement)\b|\bplacement\b/i.test(c.title));

// A missing option list on an approval placeholder is not permission to use any course.
export function courseOptions(requirement, profile) {
  const topics=(requirement.allowedOptions||[]).filter(x=>x.id&&x.title&&!x.courseCode);
  if(topics.length)return topics.map(x=>({code:x.id.toUpperCase(),title:x.title,credits:x.credits,topic:true}));
  const explicit=requirement.options||[];
  if(requirement.approvalOnly&&!explicit.length)return [];
  const graduate=DATA.programs.find(p=>p.id===profile.program)?.level==='graduate';
  const excluded=new Set((requirement.excludedCourses||[]).map(x=>x.replace(/\s/g,'')));
  const computing=requirement.groupId==='computing'||requirement.id==='bscsc-computing';
  return (explicit.length?explicit:Object.keys(DATA.courses)).map(id=>DATA.courses[id]).filter(c=>{
    if(!c||excluded.has(c.code)||!(c.credits>0))return false;
    if(explicit.length)return true;
    const n=Number(c.code.slice(3)),prefix=c.code.slice(0,3);
    if(!Number.isFinite(n)||n<1000||n>=(graduate?7000:5000)||['FYE','FAS','INT','ALS','AWR','ARD','AGR'].includes(prefix))return false;
    if(requirement.excludedSubjects?.includes(prefix))return false;
    if(requirement.subjects?.length&&!requirement.subjects.includes(prefix))return false;
    if(requirement.minimumLevel&&n<requirement.minimumLevel)return false;
    return !computing||(prefix==='CSC'&&n>=3000);
  });
}
