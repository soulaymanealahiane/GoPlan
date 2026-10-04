import DATA from './academic-data.js';
import GUIDED from './guided-data.js';
export function selectedMinor(p){
 const m=GUIDED.minors.find(x=>x.id===p.minor);if(!m||DATA.programs.find(x=>x.id===p.program)?.level!=='undergraduate'||m.eligibility?.excludedPrograms?.includes(p.program)||m.eligibility?.eligiblePrograms?.length&&!m.eligibility.eligiblePrograms.includes(p.program))return null;
 if(m.id==='mathematics'&&p.program==='BSCSC')return {...m,name:'Mathematics (Individual Minor)',reviewRequired:true,programRules:[],requirements:[...['MTH2304','EGR3392','CSC4351','EGR4394'].map(id=>({id:'imath-'+id.toLowerCase(),courseCode:id,type:'requiredCourse',title:DATA.courses[id]?.title||id,credits:3,category:'Minor',source:m.source})),{id:'imath-approved',type:'requirementChoice',title:'Mathematics elective — school approval needed',credits:3,category:'Minor',allowedCourses:[],approvalOnly:true,approvalRequired:true,condition:'A further 3-credit math-intensive SSE course (2000 level or above), or actual mathematics special topic, must be approved for this Individual Minor.',source:m.source}]};
 if(!m.variants)return m;const v=m.variants.find(x=>x.eligiblePrograms.includes(p.program));return v?{...m,...v,id:m.id,name:m.name,notes:[...(m.notes||[]),...(v.notes||[])]}:null;
}
const normalize=r=>({...r,code:r.courseCode||r.code||'',choice:r.type==='requirementChoice'||r.choice===true,options:r.allowedCourses||r.options||[]});
export function withMinor(base,p){
 const m=selectedMinor(p);if(!m)return base;
 let major=structuredClone(base.filter(r=>r.groupId!=='minor')),req=structuredClone(m.requirements);
 const majorCodes=()=>new Set(major.map(r=>r.code||p.choices[r.id]).filter(Boolean));
 for(const rule of m.programRules||[]){
  if(rule.programId&&rule.programId!==p.program||rule.trackId&&rule.trackId!==p.track)continue;
  const present=majorCodes().has(rule.ifCourseInPlan||rule.courseCode)||p.priorCodes.includes(rule.ifCourseInPlan||rule.courseCode);
  if(rule.action==='replace-minor-course'||['replace-minor-course-if-present','replace-minor-course-if-major'].includes(rule.action)&&present)req=req.map(r=>r.courseCode===rule.courseCode?{...rule.replacement,id:r.id+'-replacement'}:r);
  if(rule.action==='required-option'){const i=req.findIndex(r=>r.allowedCourses?.includes(rule.courseCode));if(i>=0)req[i]={...req[i],type:'requiredCourse',courseCode:rule.courseCode,title:DATA.courses[rule.courseCode]?.title||rule.courseCode};}
  if(rule.action==='replace-major-course')major=major.map(r=>r.code===rule.courseCode?{...r,code:'',choice:true,title:'Approved advanced International Studies replacement for '+rule.courseCode,options:Object.keys(DATA.courses).filter(c=>rule.replacementFilter.prefixes.includes(c.slice(0,3))&&+c.slice(3)>=rule.replacementFilter.minimumLevel&&+c.slice(3)<5000),condition:rule.text,replacementFor:rule.courseCode}:r);
 }
 for(const rule of m.overlapRules||[])if(rule.action==='reserve-for-minor')major=major.map(r=>(r.code||p.choices[r.id])===rule.courseCode?{...r,code:'',choice:true,options:rule.replaceGenEdWith,title:'History / political GenEd (distinct from minor)',condition:rule.text}:r);
 const used=majorCodes();
 const minor=req.map((r,i)=>{r=normalize(r);r.id=`${m.id}-${r.id}-${i}`;r.minorId=m.id;
  if(r.code&&used.has(r.code))return {...r,code:'',choice:true,options:[],approvalOnly:true,approvalRequired:true,title:m.id==='mathematics'?'Additional mathematics elective — school approval needed':'Minor elective — school approval needed',replacementFor:r.code,condition:'A distinct approved course is needed because '+r.code+' already counts toward another requirement.'};
  if(r.choice){r.excludedCourses=[...(r.excludedCourses||[]),...used];if(m.id==='international-studies'&&used.has('ECO2301')&&used.has('ECO2302'))r.excludedCourses.push('ECO2310');}return r;
 });
 return [...major,...minor];
}
