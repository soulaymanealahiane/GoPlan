import DATA from './academic-data.js';

export function withSecondFocus(base,profile){
 const program=DATA.programs.find(p=>p.id===profile.program),track=program?.tracks.find(t=>t.id===profile.secondTrack);
 if(!track||track.id===profile.track||!['BBA','BSCSC'].includes(profile.program))return base;
 const keep=base.filter(r=>profile.program==='BBA'?r.groupId!=='minor':r.id!=='bscsc-computing'&&r.groupId!=='free');
 const used=new Set(keep.map(r=>r.code||profile.choices[r.id]).filter(Boolean));
 const electives=track.requirements.filter(r=>r.choice);
 const options=[...new Set(electives.flatMap(r=>r.options||[]))];
 const items=[];
 for(const raw of track.requirements){
  const r={...structuredClone(raw),id:`second-${profile.program}-${track.id}-${raw.id}`,focusRole:'secondary',category:profile.program==='BBA'?'Second concentration':'Second specialization',secondTrack:track.id};
  if(r.code&&used.has(r.code)){
   const topics=electives.flatMap(e=>(e.allowedOptions||[]).filter(o=>o.id&&!o.courseCode));
   if(profile.program==='BSCSC'&&topics.length){
    // The cybersecurity elective set consists of 1-SCH topics, not 3-SCH courses.
    for(let i=0;i<r.credits;i++)items.push({...r,id:r.id+'-replacement-'+i,code:'',choice:true,credits:1,title:'Distinct cybersecurity topic — approval needed',allowedOptions:structuredClone(topics),options:[],approvalOnly:true,approvalRequired:true,replacementFor:r.code,condition:'One credit of the approved replacement for the overlapping required course. Confirm each registration code and distinct topic with SSE.'});
   }else items.push({...r,code:'',choice:true,title:'Second-focus elective — approval needed',options:profile.program==='BSCSC'?options.filter(id=>!used.has(id)):[],approvalOnly:true,approvalRequired:true,replacementFor:r.code,condition:'A distinct replacement for '+r.code+' needs school approval; the shared course counts once.'});
  }else items.push({...r,excludedCourses:[...(r.excludedCourses||[]),...used]});
 }
 return [...keep,...items];
}
