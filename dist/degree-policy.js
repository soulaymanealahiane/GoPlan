import DATA from './academic-data.js';
import GUIDED from './guided-data.js';

// Standard, source-defined degree pathways. Additional credentials requiring
// individual school approval are not silently appended to these degree plans.
const source=(file,page)=>({file,page});
const catalog=page=>source('aui academic catalogue.pdf',page);
const policies={
 BBA:{trackLabel:'Concentration',secondaryTrackLabel:'Second concentration',trackPlural:'concentrations',maxTracks:2,minorMode:'alternative',selectionHelp:'Choose one concentration and a source-listed minor, or two different concentrations. The second concentration replaces the required minor. The November program sheet includes Leadership among the minor options.',selectionPaths:[{id:'minor',label:'One concentration and a minor',trackCount:1,minorMode:'required'},{id:'double',label:'Two concentrations',trackCount:2,minorMode:'none'}],sources:[source('BBA-Program-sheet-Nov-2025 (5).pdf',9),catalog(123),catalog(126)]},
 BSCSC:{trackLabel:'Specialization',secondaryTrackLabel:'Second specialization',trackPlural:'specializations',maxTracks:2,minorMode:'required',selectionHelp:'Choose a specialization and a required minor. An optional second specialization uses computing and free electives; the minor is still required. Shared courses count once and replacements need school approval.',sources:[catalog(176),catalog(178),source('BSCSC_Course-Sequence_Catalog 2025-2027_October_2025.pdf',1)]},
 BSEMS:{trackLabel:'Thematic area',secondaryTrackLabel:'Second thematic area',trackPlural:'thematic areas',maxTracks:1,minorMode:'none',selectionHelp:'Choose one engineering thematic area (9 credits). A minor is not part of this standard degree plan. A different approved thematic area requires individual school approval.',sources:[catalog(183),catalog(186),source('ems.pdf',1)]},
 BSGE:{trackLabel:'Thematic area',secondaryTrackLabel:'Second thematic area',trackPlural:'thematic areas',maxTracks:1,minorMode:'none',selectionHelp:'Choose one engineering thematic area (12 credits). A minor is not part of this standard degree plan. A different approved thematic area requires individual school approval.',sources:[catalog(187),catalog(190),source('general engineering .pdf',1)]},
 BSRESE:{trackLabel:'Academic area',secondaryTrackLabel:'Second academic area',trackPlural:'academic areas',maxTracks:0,minorMode:'none',selectionHelp:'This degree has no separate thematic-area or minor requirement in the standard program sheet.',sources:[catalog(191),catalog(193),source('renewable energy systems .pdf',1)]},
 BACS:{trackLabel:'Academic area',secondaryTrackLabel:'Second academic area',trackPlural:'academic areas',maxTracks:0,minorMode:'required',selectionHelp:'Choose a required minor. This degree has no separate concentration or specialization selector.',sources:[catalog(141),catalog(142)]},
 BAIS:{trackLabel:'Academic area',secondaryTrackLabel:'Second academic area',trackPlural:'academic areas',maxTracks:0,minorMode:'required',selectionHelp:'Choose a required minor. This degree has no separate concentration or specialization selector.',sources:[catalog(144),catalog(146)]},
 BSESS:{trackLabel:'Academic area',secondaryTrackLabel:'Second academic area',trackPlural:'academic areas',maxTracks:0,minorMode:'required',selectionHelp:'Choose a required minor. This degree has no separate concentration or specialization selector.',sources:[catalog(147),catalog(148)]}
};
export function degreePolicy(value){
 const id=typeof value==='string'?value:value?.id||value?.program,program=DATA.programs.find(p=>p.id===id);
 const base=policies[id]||{trackLabel:'Completion route',secondaryTrackLabel:'Second completion route',trackPlural:'completion routes',maxTracks:program?.tracks.length?1:0,minorMode:'none',selectionHelp:program?.tracks.length?'Choose the source-defined completion route for this graduate program.':'This program has no separate academic area or minor selector.',sources:program?.source?[program.source]:[]};
 const selectionPaths=base.selectionPaths||(id==='BSCSC'?[{id:'single',label:'One specialization and a minor',trackCount:1,minorMode:'required'},{id:'double',label:'Two specializations and a minor',trackCount:2,minorMode:'required'}]:[{id:'standard',label:base.maxTracks?'One '+base.trackLabel.toLowerCase():'Standard degree requirements',trackCount:base.maxTracks,minorMode:base.minorMode}]);
 return {...base,allowSecondTrack:base.maxTracks>1,selectionPaths};
}
export function degreeSelectionPath(profile){if(['BBA','BSCSC'].includes(profile.program))return profile.secondTrack?'double':profile.program==='BBA'?'minor':'single';return 'standard';}
export function minorAllowed(profile,id=profile.minor){
 if(!id||degreePolicy(profile).minorMode==='none'||profile.program==='BBA'&&profile.secondTrack||profile.program==='BSESS'&&id==='environmental-sustainability'||profile.program==='BSCSC'&&['computer-science','data-analytics'].includes(id))return false;
 const m=GUIDED.minors.find(m=>m.id===id);
 if(!m||m.eligibility?.excludedPrograms?.includes(profile.program)||m.eligibility?.eligiblePrograms?.length&&!m.eligibility.eligiblePrograms.includes(profile.program))return false;
 return !m.variants||m.variants.some(v=>v.eligiblePrograms.includes(profile.program));
}
export function degreeSelectionIssues(profile,{requireComplete=false}={}){
 const program=DATA.programs.find(p=>p.id===profile?.program);if(!program)return ['Choose a supported degree.'];
 const policy=degreePolicy(program),issues=[];
 if(profile.track&&(!policy.maxTracks||!program.tracks.some(t=>t.id===profile.track)))issues.push('Choose a supported '+policy.trackLabel.toLowerCase()+' for this degree.');
 if(policy.maxTracks&&!profile.track)issues.push('Choose a '+policy.trackLabel.toLowerCase()+'.');
 if(profile.secondTrack){
  if(policy.maxTracks<2)issues.push('This standard degree plan supports only '+(policy.maxTracks?'one '+policy.trackLabel.toLowerCase(): 'its listed requirements')+'.');
  else if(profile.secondTrack===profile.track)issues.push('Choose two different '+policy.trackPlural+'.');
  else if(!program.tracks.some(t=>t.id===profile.secondTrack))issues.push('Choose a supported '+policy.secondaryTrackLabel.toLowerCase()+'.');
 }
 if(profile.minor){
  if(policy.minorMode==='none')issues.push('A minor is not part of this standard degree pathway; keep its listed degree requirements. Any additional credential needs a separate school-approved plan.');
  else if(profile.program==='BBA'&&profile.secondTrack)issues.push('Choose either two concentrations or one concentration with a minor; the second concentration replaces the required minor.');
  else if(!minorAllowed(profile))issues.push('Choose a minor supported for this degree and its providing school.');
 }
 if(requireComplete&&!profile.minor&&(policy.minorMode==='required'||policy.minorMode==='alternative'&&!profile.secondTrack))issues.push('Choose the required minor or leave it explicitly pending in your draft.');
 return issues;
}
export function normalizeDegreeSelection(raw){
 const p={...raw},policy=degreePolicy(p),program=DATA.programs.find(x=>x.id===p.program),notices=degreeSelectionIssues(p);
 p.track=policy.maxTracks&&program?.tracks.some(t=>t.id===p.track)?p.track:'';
 p.secondTrack=policy.maxTracks>1&&p.secondTrack!==p.track&&program?.tracks.some(t=>t.id===p.secondTrack)?p.secondTrack:'';
 p.minor=minorAllowed(p)?p.minor:'';
 p.selectionNotices=[...new Set([...(Array.isArray(raw.selectionNotices)?raw.selectionNotices:[]),...notices])];
 return p;
}
