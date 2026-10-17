import {programFor,creditsOf,label,termOrder} from './planner.js';

// A choice is an input mechanism, not an academic category. Classify the
// requirement slot, so selecting a different course cannot move its credits.
export function courseGroupKey(course,profile){
 const category=String(course.category||''),program=programFor(profile),track=program.tracks.find(t=>t.id===profile.track);
 if(/^General education$/i.test(category))return 'general';
 if(course.focusRole==='secondary'||course.secondTrack||/^Second (specialization|concentration)/i.test(category))return 'second';
 if(course.minorId||course.groupId==='minor'||/^Minor$/i.test(category))return 'minor';
 if(track?.requirements.some(r=>r.id===course.id)||/^(Specialization|Concentration|Thematic area)$/i.test(category))return 'specialization';
 if(course.groupId==='free'||/^Free elective/i.test(category)||category==='Elective')return 'free';
 if(course.groupId==='optional'||/^(Computing elective|Major optional|Graduate elective)$/i.test(category)||course.choice&&/elective/i.test(category))return 'open';
 if(/^(SSAH core|Business common core|Mathematics|Basic Sciences|Mathematics, science and engineering|Engineering core)$/i.test(category))return 'common';
 if(/^(Internship|Experience)$/i.test(category))return 'experience';
 return 'major';
}

export function courseGroups(courses,profile){
 const program=programFor(profile),track=program.tracks.find(t=>t.id===profile.track),second=program.tracks.find(t=>t.id===profile.secondTrack),focus=profile.program==='BBA'?'concentration':['BSGE','BSEMS'].includes(profile.program)?'thematic area':'specialization';
 const definitions=[
  ['general','General education','Your general education courses','Language, communication and the wider university curriculum.'],
  ['common','Common core','Your common core courses','University and school foundations.'],
  ['major','Major core','Your major core courses','Required courses for your degree.'],
  ['specialization',`Your ${focus}`,track?.name||`Your ${focus} courses`,'Courses for your chosen focus.'],
  ['minor','Your minor','Your minor courses','Courses that complete your minor.'],
  ['second',`Second ${focus}`,second?.name||`Second ${focus}`,'Courses for your second focus.'],
  ['open','Open electives','Your open electives','Choose within your degree’s approved options.'],
  ['free','Free electives','Your free electives','Room to explore beyond your main field.'],
  ['experience','Experience','Your experience courses','Internship and fieldwork requirements.']
 ];
 const rows=new Map(definitions.map(([id])=>[id,[]]));
 for(const c of courses)if(!c.supportingPrerequisite&&!c.id.startsWith('support-'))rows.get(courseGroupKey(c,profile)).push(c);
 return definitions.map(([id,title,heading,description])=>({id,title,heading,description,courses:rows.get(id),credits:creditsOf(rows.get(id))})).filter(g=>g.courses.length);
}

export function courseSemester(plan,course){
 const term=plan?.terms.find(t=>t.courses.includes(course.id));
 return {termId:term?.id||'',text:!plan?'Not mapped yet':!term||term.id==='pending'?'Timing to confirm':label(term),order:term?.id==='prior'?-Infinity:term?.id==='pending'||!term?Infinity:termOrder(term)};
}
